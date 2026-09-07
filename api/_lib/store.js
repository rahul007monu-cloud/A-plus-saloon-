/*
 * ============================================================================
 *  A Plus Salon — Shared serverless helpers (dependency-free, Node built-ins)
 * ============================================================================
 *  Files/folders under /api that begin with "_" are NOT turned into routes by
 *  Vercel, so this module is safe to `require()` from the real functions.
 *
 *  Persistence: Vercel KV (Upstash Redis) accessed over its REST API using the
 *  global `fetch` — NO SDK, NO npm packages. Vercel injects these env vars once
 *  a KV store is connected to the project:
 *      KV_REST_API_URL    e.g. https://xxxx.kv.vercel-storage.com
 *      KV_REST_API_TOKEN  bearer token
 *
 *  REST usage (Upstash):
 *      POST ${KV_REST_API_URL}
 *      Headers: Authorization: Bearer ${KV_REST_API_TOKEN}
 *      Body:    JSON command array, e.g. ["SET","key","value"] / ["GET","key"]
 *      Reply:   { "result": <value|null> }
 *
 *  Data model (kept intentionally simple — two keys):
 *      salon:services  -> JSON string of the services array
 *      salon:bookings  -> JSON string of the bookings array
 *
 *  Admin auth: a single shared PIN in env var ADMIN_PIN, sent by the admin UI
 *  in the `x-admin-pin` request header and checked on every write endpoint.
 * ----------------------------------------------------------------------------
 */
"use strict";

var KEY_SERVICES = "salon:services";
var KEY_BOOKINGS = "salon:bookings";

/* Slot / working-hours defaults. Kept in sync with assets/js/config.js so the
   fallback (client) and the backend (server) behave identically. */
var SETTINGS = {
  openTime: "10:00",
  closeTime: "20:00",
  slotMinutes: 45,
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  /* Minutes to add to UTC to get the salon's local time (IST = +5:30 = 330).
     Override with env SALON_TZ_OFFSET_MINUTES if the shop is elsewhere. */
  tzOffsetMinutes: 330
};

/* Seed / fallback services — mirrors assets/js/config.js `services`. Used to
   initialise KV the first time it is read (so the shop is never empty). */
var DEFAULT_SERVICES = [
  { id: "haircut-styling", name: "Haircut & Styling", priceFrom: 150, durationMins: 45, description: "Precision cut and blow-dry styling tailored to your face shape." },
  { id: "hair-color", name: "Hair Color", priceFrom: 999, durationMins: 90, description: "Global color, highlights and root touch-ups with premium products." },
  { id: "facial", name: "Facial & Clean-up", priceFrom: 599, durationMins: 60, description: "Deep-cleansing facials for glowing, refreshed and healthy skin." },
  { id: "mani-pedi", name: "Manicure & Pedicure", priceFrom: 499, durationMins: 60, description: "Relaxing nail care, cuticle treatment and polish for hands and feet." },
  { id: "bridal-makeup", name: "Bridal Makeup", priceFrom: 4999, durationMins: 120, description: "Complete bridal look with HD makeup, hairstyling and draping." },
  { id: "hair-spa", name: "Hair Spa & Treatment", priceFrom: 799, durationMins: 75, description: "Nourishing spa therapy to repair, strengthen and add shine." },
  { id: "beard-grooming", name: "Beard Grooming", priceFrom: 199, durationMins: 30, description: "Sharp beard trim, shaping and grooming for a clean finish." },
  { id: "shave", name: "Shave", priceFrom: 60, durationMins: 20, description: "Clean, smooth classic shave with hot towel and aftercare." },
  { id: "threading-waxing", name: "Threading & Waxing", priceFrom: 149, durationMins: 30, description: "Smooth, precise threading and waxing for a flawless look." }
];

/* -------------------------------------------------------------- settings */
function getSettings() {
  var s = {
    openTime: SETTINGS.openTime,
    closeTime: SETTINGS.closeTime,
    slotMinutes: SETTINGS.slotMinutes,
    workingDays: SETTINGS.workingDays.slice(),
    tzOffsetMinutes: SETTINGS.tzOffsetMinutes
  };
  var envOffset = parseInt(process.env.SALON_TZ_OFFSET_MINUTES, 10);
  if (!isNaN(envOffset)) {
    s.tzOffsetMinutes = envOffset;
  }
  return s;
}

/* --------------------------------------------------------- KV plumbing */
function kvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/* Run a single Upstash REST command array and return its `result`. */
function kvCommand(cmd) {
  var url = process.env.KV_REST_API_URL;
  var token = process.env.KV_REST_API_TOKEN;
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(cmd)
  }).then(function (resp) {
    if (!resp.ok) {
      return resp.text().then(function (t) {
        throw new Error("KV command failed (" + resp.status + "): " + t);
      });
    }
    return resp.json().then(function (data) {
      return data ? data.result : null;
    });
  });
}

/* ------------------------------------------------------------- services */
function getServices() {
  return kvCommand(["GET", KEY_SERVICES]).then(function (raw) {
    if (raw == null) {
      /* First run: seed KV with the defaults so the shop is never empty. */
      return kvCommand([
        "SET",
        KEY_SERVICES,
        JSON.stringify(DEFAULT_SERVICES)
      ]).then(function () {
        return DEFAULT_SERVICES.slice();
      });
    }
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : DEFAULT_SERVICES.slice();
    } catch (e) {
      return DEFAULT_SERVICES.slice();
    }
  });
}

function setServices(list) {
  return kvCommand(["SET", KEY_SERVICES, JSON.stringify(list)]);
}

/* ------------------------------------------------------------- bookings */
function getBookings() {
  return kvCommand(["GET", KEY_BOOKINGS]).then(function (raw) {
    if (raw == null) {
      return [];
    }
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
}

function setBookings(list) {
  return kvCommand(["SET", KEY_BOOKINGS, JSON.stringify(list)]);
}

/* ------------------------------------------------------------- id gen */
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function makeServiceId(name, existing) {
  var base = slugify(name) || "service";
  var id = base;
  var taken = {};
  (existing || []).forEach(function (s) {
    taken[s.id] = true;
  });
  while (taken[id]) {
    id = base + "-" + randomSuffix();
  }
  return id;
}

function makeBookingId() {
  return "bk_" + Date.now() + "_" + randomSuffix();
}

/* --------------------------------------------------------- slot helpers */
function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

function timeToMinutes(hhmm) {
  var parts = String(hhmm || "").split(":");
  var h = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) {
    return null;
  }
  return h * 60 + m;
}

function minutesToTime(mins) {
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  return pad2(h) + ":" + pad2(m);
}

/* All slot start times for the working window, e.g. 10:00, 10:45, 11:30 … */
function generateSlotTimes(settings) {
  var start = timeToMinutes(settings.openTime);
  var end = timeToMinutes(settings.closeTime);
  var step = settings.slotMinutes;
  var out = [];
  if (start == null || end == null || !step) {
    return out;
  }
  for (var t = start; t + step <= end; t += step) {
    out.push(minutesToTime(t));
  }
  return out;
}

/* The salon's "now", shifted into local time; read via getUTC* accessors. */
function localNow(settings) {
  return new Date(Date.now() + settings.tzOffsetMinutes * 60000);
}

function localDateStr(settings) {
  var d = localNow(settings);
  return (
    d.getUTCFullYear() +
    "-" +
    pad2(d.getUTCMonth() + 1) +
    "-" +
    pad2(d.getUTCDate())
  );
}

function localMinutesOfDay(settings) {
  var d = localNow(settings);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function dayOfWeekForDate(dateStr) {
  /* Interpret the date at noon UTC to avoid DST/offset edge cases. */
  var d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) {
    return null;
  }
  return d.getUTCDay();
}

/*
 * Compute slots for a given YYYY-MM-DD date.
 * Returns { slots: [{ time, available }], slotMinutes, isWorkingDay }.
 *  - marks a slot unavailable if a non-cancelled booking already holds it
 *  - marks past slots unavailable when the date is today (salon local time)
 */
function computeSlots(dateStr, bookings, settings) {
  var all = generateSlotTimes(settings);
  var dow = dayOfWeekForDate(dateStr);
  var isWorkingDay =
    dow != null && settings.workingDays.indexOf(dow) !== -1;

  var takenTimes = {};
  (bookings || []).forEach(function (b) {
    if (b && b.date === dateStr && b.status !== "cancelled") {
      takenTimes[b.time] = true;
    }
  });

  var todayStr = localDateStr(settings);
  var isToday = dateStr === todayStr;
  var nowMins = localMinutesOfDay(settings);

  var slots = all.map(function (time) {
    var available = isWorkingDay;
    if (available && takenTimes[time]) {
      available = false;
    }
    if (available && isToday) {
      var mins = timeToMinutes(time);
      if (mins != null && mins <= nowMins) {
        available = false;
      }
    }
    return { time: time, available: available };
  });

  return {
    slots: slots,
    slotMinutes: settings.slotMinutes,
    isWorkingDay: isWorkingDay
  };
}

/* --------------------------------------------------------- HTTP helpers */
function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

/* Read + parse a JSON request body, tolerating pre-parsed bodies and streams. */
function readJsonBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    if (typeof req.body === "string") {
      try {
        resolve(JSON.parse(req.body));
      } catch (e) {
        resolve({});
      }
      return;
    }
    var chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        resolve({});
      }
    });
    req.on("error", function () {
      resolve({});
    });
  });
}

/*
 * Admin auth gate. Returns one of:
 *   { ok: true }                              -> authorised, proceed
 *   { ok: false, status, body }               -> respond with these
 * Order: KV must be configured, then ADMIN_PIN must be set, then the header
 * PIN must match.
 */
function requireAdmin(req) {
  if (!kvConfigured()) {
    return {
      ok: false,
      status: 503,
      body: { error: "kv_not_configured" }
    };
  }
  var pin = process.env.ADMIN_PIN;
  if (!pin) {
    return {
      ok: false,
      status: 503,
      body: { error: "admin_not_configured" }
    };
  }
  var provided = req.headers["x-admin-pin"];
  if (!provided || String(provided) !== String(pin)) {
    return {
      ok: false,
      status: 401,
      body: { error: "unauthorized" }
    };
  }
  return { ok: true };
}

module.exports = {
  DEFAULT_SERVICES: DEFAULT_SERVICES,
  kvConfigured: kvConfigured,
  kvCommand: kvCommand,
  getSettings: getSettings,
  getServices: getServices,
  setServices: setServices,
  getBookings: getBookings,
  setBookings: setBookings,
  makeServiceId: makeServiceId,
  makeBookingId: makeBookingId,
  generateSlotTimes: generateSlotTimes,
  computeSlots: computeSlots,
  timeToMinutes: timeToMinutes,
  sendJson: sendJson,
  readJsonBody: readJsonBody,
  requireAdmin: requireAdmin
};
