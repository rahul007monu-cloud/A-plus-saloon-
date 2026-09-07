# A Plus Salon — Website + Lead Generation

A fast, mobile-first website for a single-location salon, built to **generate
booking leads for free** and deliver every lead to the owner **instantly over
WhatsApp**. It also ships with a private, owner-only **Leads Dashboard** to
review and export every request.

- **Public site** (`index.html`): services, "why us", and a booking form.
- **Owner dashboard** (`admin.html`): view, search, and export captured leads.
- **Zero dependencies, zero build step** — pure HTML5 + CSS3 + vanilla JS.
- **Deploys on Vercel as a static site** in one import (no build command).

---

## Why a dependency-free static stack?

This project is intentionally built with **only HTML, CSS, and vanilla
JavaScript** — no frameworks, no npm packages, no build tooling.

The build/deploy environment runs in a restricted network mode
(`INTEGRATIONS_ONLY`) where the **public npm registry is blocked** (installs
return `403 Forbidden`). Rather than fight that, the app embraces it:

- **No `npm install`, no bundler, no transpiler** — nothing to install or build.
- **Instant Vercel deploys** — Vercel just serves the repo's files as-is.
- **Rock-solid reliability** — there is no build that can break, and the site
  stays fully functional even if an external CDN font fails to load (system
  fonts are used as fallbacks).
- **Trivial to customize** — all business settings live in one plain-JS config
  file (`assets/js/config.js`).

Leads are stored client-side in the browser's `localStorage` (there is no
backend database in this environment). The **real-time delivery channel is
WhatsApp**: the moment a customer submits the form, a prefilled WhatsApp
message to the owner is opened, so a lead is never missed even though the
dashboard is device-local.

---

## How the free lead-generation + WhatsApp flow works

1. A visitor opens the public site and fills in the **booking form** (name,
   phone, service, preferred date/time, optional message).
2. On submit, `assets/js/main.js`:
   - validates the input (and silently drops spam bots via a honeypot field),
   - **saves the lead** to `localStorage` under the key `aplus_salon_leads`,
   - builds a **prefilled WhatsApp message** and opens
     [`wa.me`](https://wa.me/) click-to-chat to the owner's number so the lead
     arrives **instantly and for free** (no WhatsApp Business API required).
3. The owner opens **`admin.html`** to browse every saved lead, search/filter
   them, reply to any lead with one tap (`tel:` call or `wa.me` WhatsApp), and
   **export everything to CSV** for their own records.

This uses only free channels: static hosting on Vercel's free tier and
WhatsApp click-to-chat links.

---

## Project structure

```
.
├── index.html              # Public landing page + booking form
├── admin.html              # Private owner leads dashboard
├── vercel.json             # Static deploy config (clean URLs, security headers)
├── robots.txt              # Allows the site, disallows /admin.html
├── sitemap.xml             # Lists the public home page only
├── README.md               # This file
└── assets/
    ├── css/styles.css      # Single mobile-first stylesheet (shared)
    ├── js/config.js        # >>> EDIT ME <<< all salon settings live here
    ├── js/main.js          # Landing page + booking form logic
    ├── js/admin.js         # Dashboard logic (read/search/export/clear leads)
    └── img/                # favicon.svg, logo.svg, og-image.svg
```

---

## Customization guide

Almost everything you need to change lives in **`assets/js/config.js`**. Open
it and edit the values marked `EDIT ME`:

| Setting          | What it is                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `salonName`      | Your salon's name (shown across the site and dashboard).                   |
| `tagline`        | Short tagline shown in the hero/footer.                                    |
| `ownerWhatsApp`  | **WhatsApp number in full international format, digits only.**              |
| `displayPhone`   | Human-friendly phone shown/dialed on the site (e.g. `+91 99999 99999`).    |
| `address`, `city`| Street address and city (also used in SEO schema).                         |
| `businessHours`  | Opening hours text shown in the footer.                                    |
| `socialLinks`    | Instagram / Facebook / Maps URLs (leave `""` to hide one).                 |
| `currencySymbol` | Currency symbol for prices (e.g. `₹`).                                     |
| `services`       | Array of services: `{ id, name, priceFrom, durationMins, description }`.   |

### WhatsApp number format (important)

`ownerWhatsApp` must be the number in **full international format, digits
only** — **no `+`, no spaces, no dashes**:

```
<country code><number>       e.g. India: 919999999999
```

If this is wrong, the WhatsApp "click-to-chat" link will not reach you.

### Placeholder production URLs to replace

Before/after going live, replace the placeholder domain
`https://a-plus-salon.example.com/` with your real Vercel domain in:

- `index.html` — the `<link rel="canonical">`, `og:url`, and JSON-LD `url`/`image`.
- `sitemap.xml` — the `<loc>` entry.
- `robots.txt` — the `Sitemap:` line.

---

## Run locally

No install needed. From the repo root, start any static file server, e.g.
Python's built-in one:

```bash
python3 -m http.server 8000
```

Then open:

- Public site: <http://localhost:8000/index.html>
- Owner dashboard: <http://localhost:8000/admin.html>

> Leads are per-browser: leads you create on the public page appear in the
> dashboard **in the same browser** on the same origin.

---

## Deploy to Vercel

This is a **static site with no build step**:

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com/), click **Add New → Project** and **import**
   the GitHub repo.
3. Configure the project:
   - **Framework Preset:** `Other`
   - **Build Command:** *leave empty* (no build)
   - **Output Directory:** the repository root (leave default)
   - **Install Command:** *leave empty*
4. Click **Deploy**. Vercel serves the files directly.

`vercel.json` already enables clean URLs (`/admin` works as well as
`/admin.html`), disables trailing slashes, and sets sensible security headers
(`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`,
`Permissions-Policy`).

After deploying, remember to swap the placeholder domain (see
[Placeholder production URLs](#placeholder-production-urls-to-replace)).

---

## Using the owner dashboard (`admin.html`)

- **Summary bar:** total leads and leads received today.
- **Search/filter:** type to filter by name, phone, or service (live).
- **Per lead:** tap the phone to call (`tel:`) or **Reply on WhatsApp**
  (prefilled `wa.me` message).
- **Export CSV:** downloads all leads as a `.csv` file (opens cleanly in Excel
  / Google Sheets) — no external library, generated in-browser.
- **Refresh:** re-reads leads saved in this browser.
- **Clear all:** deletes all saved leads from this browser (guarded by a
  confirmation prompt — this cannot be undone, so export first).

Because leads live in the browser's `localStorage`, the dashboard shows leads
captured **on that device/browser**. WhatsApp remains the always-on delivery
channel, and CSV export is your backup.

---

## Deferred / future phases

The following were intentionally **left out of this MVP** because they require
a backend, paid APIs, or external packages that are not available under the
current offline/no-backend (`INTEGRATIONS_ONLY`) constraint. Here is how each
could be added later:

- **Server-side lead persistence (database).** Replace the `localStorage`
  store with a hosted database (e.g. Vercel Postgres, Supabase, Firebase) via a
  small serverless API route (`/api/leads`). This centralizes leads across all
  devices and staff, instead of being device-local.
- **Automated SMS / email reminders.** Add serverless functions that send
  appointment confirmations/reminders through an email provider (e.g. Resend,
  SendGrid) or an SMS gateway (e.g. Twilio) on a schedule (cron).
- **Paid WhatsApp Business API auto-replies.** Upgrade from free `wa.me`
  click-to-chat to the official WhatsApp Business API (e.g. via Twilio or Meta
  Cloud API) for automatic confirmations, templated replies, and two-way chat.
- **Multi-branch support.** Extend `config.js` into a list of branches (each
  with its own address, hours, and WhatsApp number) and add a branch selector
  to the booking form and dashboard.
- **Analytics.** Add a privacy-friendly analytics script (e.g. Plausible,
  Vercel Analytics) to measure traffic, funnel drop-off, and conversion, once
  external scripts/packages are permitted.

Each of these is additive: the current static site continues to work as-is and
can be enhanced incrementally as a backend becomes available.
