# A Plus Salon — Website + Booking + Admin

A fast, mobile-first website for a single-location salon. Customers pick a date
and a **45-minute time slot** and book in seconds; every booking is delivered to
the owner **instantly over WhatsApp**. A private **Admin** lets the owner manage
bookings and edit their **services & rates** — add, change the price, or remove a
service — all from the screen, **without touching code**.

- **Public site** (`index.html`): services, "why us", and a slot-based booking form.
- **Owner admin** (`admin.html`): manage bookings (confirm / cancel / delete) and
  manage services & rates (add / edit / delete).
- **Zero build step** — pure HTML5 + CSS3 + vanilla JS on the frontend, plus a
  small set of **dependency-free** Vercel serverless functions in `/api`.
- **Deploys on Vercel** with no build command.

---

## Two ways it runs (this is important)

The site is designed to work **immediately**, and to become a **shared,
multi-device system** the moment you connect a database — with no code changes.

### 1. Fallback mode (works out of the box, before any setup)

If no backend is connected, the site runs exactly like the original static app:

- Services come from `assets/js/config.js`.
- 45-minute slots are generated in the browser from `config.js` business hours.
- Bookings are saved to **this browser's** `localStorage` (device-local) and, as
  always, **open a prefilled WhatsApp message to the owner** on submit.
- The admin shows this browser's bookings and shows services **read-only**.

This mode needs **no accounts, no database, no environment variables**.

### 2. Shared mode (after you connect Vercel KV + set an admin PIN)

Once you connect a **Vercel KV** store and set an **`ADMIN_PIN`** (steps below),
the same site automatically upgrades itself:

- Services & rates are stored in the cloud — **what the owner edits in the admin
  is what every customer sees**, on every device.
- Slot availability is **shared**: when one customer books the 3:00 PM slot, it
  immediately shows as unavailable to everyone else (no double-booking).
- Bookings are stored server-side; the owner manages them from any device behind
  a PIN.

The frontend **detects the mode at runtime** (it asks `/api/services` whether the
backend is configured) and falls back gracefully if the API is unreachable, so
the site never breaks.

---

## How the 45-minute slot booking works

1. On the booking form the customer enters name + phone, picks a **service**,
   chooses a **date**, then taps an available **45-minute slot** (e.g.
   10:00, 10:45, 11:30 …). Slots already taken are shown struck-through and can't
   be selected; past times on the current day are hidden.
2. Slots are derived from the working window in `config.js`
   (`booking.openTime` → `booking.closeTime`, in steps of `booking.slotMinutes`,
   default **45**), restricted to `booking.workingDays`.
   - **Shared mode:** the list (with live availability) comes from
     `GET /api/slots?date=YYYY-MM-DD`.
   - **Fallback mode:** the list is generated in the browser from the same config
     (availability is only known for this device).
3. On submit:
   - **Shared mode:** the booking is sent to `POST /api/bookings`, which
     re-checks availability on the server and rejects a double-booking
     (HTTP `409`). On success the slot is reserved for everyone.
   - **Both modes:** a copy is saved locally as a backup **and** a prefilled
     `wa.me` WhatsApp message to the owner is opened — so a booking is never lost
     and the owner is notified instantly and for free.

> The bookable slot length is a fixed **45 minutes** (as requested). A service's
> own `durationMins` is shown for information but every booking occupies one
> 45-minute slot.

---

## Project structure

```
.
├── index.html              # Public landing page + slot booking form
├── admin.html              # Private owner admin (bookings + services)
├── vercel.json             # Deploy config (clean URLs, security + API headers)
├── robots.txt              # Allows the site, disallows /admin.html
├── sitemap.xml             # Lists the public home page only
├── README.md               # This file
├── api/                    # Dependency-free Vercel serverless functions
│   ├── _lib/store.js       # Shared: Vercel KV REST access + slot logic + auth
│   ├── services.js         # GET (public) / POST / PUT / PATCH / DELETE (admin)
│   ├── slots.js            # GET available 45-min slots for a date
│   └── bookings.js         # POST (public create) / GET / PATCH / DELETE (admin)
└── assets/
    ├── css/styles.css      # Single mobile-first stylesheet (shared)
    ├── js/config.js        # >>> EDIT ME <<< salon settings + booking hours
    ├── js/main.js          # Landing page + slot booking logic
    ├── js/admin.js         # Admin logic (bookings + services manager)
    └── img/                # favicon.svg, logo.svg, og-image.svg, app-icon.svg
```

Files/folders inside `/api` that begin with `_` (like `_lib/`) are **not** turned
into API routes by Vercel, so `store.js` is a safe shared module.

---

## Data model (Vercel KV / Upstash Redis over REST)

The backend uses **Vercel KV** (Upstash Redis under the hood), accessed via its
**REST API using the global `fetch`** — **no SDK, no npm packages**. Two env vars
are injected by Vercel when you connect a KV store:

| Env var             | Purpose                              |
| ------------------- | ------------------------------------ |
| `KV_REST_API_URL`   | KV REST endpoint                     |
| `KV_REST_API_TOKEN` | Bearer token for the REST endpoint   |

Each REST call POSTs a JSON command array to `KV_REST_API_URL` with
`Authorization: Bearer <token>`; the reply is `{ "result": ... }`. Commands used:

- `["GET","salon:services"]` / `["SET","salon:services", "<json>"]`
- `["GET","salon:bookings"]` / `["SET","salon:bookings", "<json>"]`

Only **two keys** are used: `salon:services` (JSON array of services) and
`salon:bookings` (JSON array of bookings). On first read, `salon:services` is
seeded from the defaults in `store.js` (which mirror `config.js`).

Every KV call is **guarded**: if the env vars are missing, read endpoints reply
`{ "configured": false }` (so the frontend falls back), and write endpoints reply
`503 { "error": "kv_not_configured" }`.

---

## Admin security (PIN)

Admin/write endpoints require a shared **PIN**, set as the Vercel env var
**`ADMIN_PIN`**. The admin UI sends it in the `x-admin-pin` request header, and
every write endpoint checks it server-side. Nothing is hardcoded.

- If `ADMIN_PIN` is **unset** (but KV is connected), admin writes reply
  `503 { "error": "admin_not_configured" }` and the admin stays in read-only mode.
- A wrong PIN replies `401 { "error": "unauthorized" }`.
- The PIN is kept only in the browser's `sessionStorage` for the session.

> This is intentionally simple (single-shop, single PIN). For multiple staff
> logins you'd add per-user accounts later.

---

## Setup: turn on the shared multi-device system

You only need to do this **once**. Until then the site already works in fallback
mode.

### A) Create + connect a Vercel KV store

1. Open your project on the **[Vercel dashboard](https://vercel.com/dashboard)**.
2. Go to the **Storage** tab → **Create Database** → choose **KV** (Redis).
3. Give it a name and create it (pick a region near your customers).
4. On the store's page, click **Connect Project**, select this project, and
   connect it to the **Production** (and Preview, if you like) environment.
   Vercel automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the
   project's environment variables.
5. **Redeploy** the project (Deployments tab → latest deployment → **Redeploy**)
   so the functions pick up the new environment variables.

That's it — the site is now shared across devices. The service list is seeded
from your `config.js` defaults on first load; edit it from the admin thereafter.

### B) Set the admin PIN

1. In the project, go to **Settings → Environment Variables**.
2. Add a new variable:
   - **Name:** `ADMIN_PIN`
   - **Value:** a PIN of your choice (e.g. a 4–8 digit number)
   - **Environment:** Production (and Preview if you use it)
3. **Save**, then **Redeploy** so the functions can read it.
4. Open `admin.html`, enter the PIN, and manage bookings + services.

> Optional: if your shop is **not** in India (IST), set `SALON_TZ_OFFSET_MINUTES`
> (minutes offset from UTC; IST = `330`) so "past slots for today" are computed in
> your local time. It defaults to `330`.

---

## Customization guide

Almost everything lives in **`assets/js/config.js`** — edit the values marked
`EDIT ME`:

| Setting          | What it is                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `salonName`      | Your salon's name (shown across the site and admin).                       |
| `tagline`        | Short tagline shown in the hero/footer.                                    |
| `ownerWhatsApp`  | **WhatsApp number in full international format, digits only.**              |
| `displayPhone`   | Human-friendly phone shown/dialed on the site (e.g. `+91 99999 99999`).    |
| `address`, `city`| Street address and city (also used in SEO schema).                         |
| `businessHours`  | Opening hours text shown in the footer.                                    |
| `socialLinks`    | Instagram / Facebook / Maps URLs (leave `""` to hide one).                 |
| `currencySymbol` | Currency symbol for prices (e.g. `₹`).                                     |
| `booking`        | Slot settings: `openTime`, `closeTime`, `slotMinutes` (45), `workingDays`. |
| `services`       | Fallback/seed services: `{ id, name, priceFrom, durationMins, description }`. |

Once KV is connected, **services are managed from the admin**, not from
`config.js` — the `config.js` list only seeds the store on first run and is the
fallback when KV is off.

### WhatsApp number format (important)

`ownerWhatsApp` must be in **full international format, digits only** — no `+`,
no spaces, no dashes: `<country code><number>` (e.g. India `919929113574`). If
this is wrong the WhatsApp click-to-chat link won't reach you.

### Placeholder production URLs to replace

Replace the placeholder domain `https://a-plus-salon.example.com/` with your real
Vercel domain in `index.html` (`<link rel="canonical">`, `og:url`, JSON-LD),
`sitemap.xml` (`<loc>`), and `robots.txt` (`Sitemap:`).

---

## Run locally

No install needed. From the repo root:

```bash
python3 -m http.server 8000
```

Then open:

- Public site: <http://localhost:8000/index.html>
- Owner admin: <http://localhost:8000/admin.html>

> A plain static server does **not** run the `/api` functions, so locally the
> site behaves in **fallback mode** (services from `config.js`, slots generated
> in-browser, bookings in this browser's `localStorage`). To exercise the live
> API + KV path, use `vercel dev` or a Vercel Preview deployment with KV
> connected.

---

## Deploy to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com/), **Add New → Project** and **import** the repo.
3. Configure:
   - **Framework Preset:** `Other`
   - **Build Command:** *leave empty* (no build)
   - **Install Command:** *leave empty* (no dependencies)
   - **Output Directory:** default (repo root)
4. Click **Deploy**. Vercel serves the static files and auto-detects the
   dependency-free Node functions in `/api`.
5. (Optional but recommended) Follow **Setup** above to connect KV and set
   `ADMIN_PIN` for the shared multi-device experience.

`vercel.json` enables clean URLs, disables trailing slashes, sets security
headers, and marks `/api/*` responses as `no-store` so availability/rates are
never cached stale.

---

## Using the owner admin (`admin.html`)

- **Sign in:** when the backend is connected, enter your `ADMIN_PIN`.
- **Bookings tab:** total / today / pending counts; search + status filter;
  each booking shows a status badge and (in shared mode) **Confirm / Cancel /
  Delete** actions; one-tap **WhatsApp** reply. **Export CSV** works in both modes.
- **Services & Rates tab:** **add** a service/product, **edit** its name, rate,
  duration or description, or **delete** it — changes go live for all customers.
  In fallback mode this tab is read-only (edit `config.js` instead).

---

## Installable app (PWA)

The site remains a **Progressive Web App** — installable on Android and iOS,
full-screen, with offline caching of the core pages. The service worker
**never caches `/api/*`**, so live data (slots, rates, bookings) is always fresh.
Files: `manifest.webmanifest`, `sw.js`, `assets/js/pwa.js`, `assets/img/app-icon.svg`.

---

## What was verified vs. what only runs in production

Because the build sandbox runs in a restricted network mode
(`INTEGRATIONS_ONLY`, npm blocked, no outbound internet), the following split
applies:

**Verified locally in-sandbox**

- Every JS file (frontend + `/api` functions) passes `node --check` (syntax).
- All JSON (`vercel.json`, `manifest.webmanifest`) parses.
- The static frontend loads and the **fallback path** works end-to-end: services
  render from `config.js`, the 45-minute slot grid generates on date change, a
  booking saves to `localStorage` and opens the WhatsApp link, and the admin
  renders its PIN-less fallback view (device-local bookings + read-only services)
  with no fatal console errors when the `/api` calls fail.

**Only runs on Vercel with KV connected (could not be exercised in-sandbox)**

- Live `/api/services`, `/api/slots`, `/api/bookings` calls against Vercel KV
  (there is no outbound network and no KV in the sandbox).
- Server-side double-booking rejection (`409 slot_taken`) across devices.
- The `ADMIN_PIN` gate verifying against the server, and admin writes (create/
  edit/delete services, change/delete bookings) persisting to KV.

These paths are written to the documented Vercel + Upstash REST contract and
guarded so that any misconfiguration degrades cleanly to fallback mode.

---

## Deferred / future phases

- **Automated SMS / email reminders** via a serverless cron + provider (Resend,
  Twilio) once external packages/network are permitted.
- **Official WhatsApp Business API** auto-replies (vs. free `wa.me` click-to-chat).
- **Per-staff logins / roles** instead of a single shared PIN.
- **Multi-branch support** (per-branch hours, WhatsApp number, slot calendars).
- **Configurable per-service slot length** (currently a fixed 45 minutes).
