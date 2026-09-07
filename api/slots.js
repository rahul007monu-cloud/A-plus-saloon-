/*
 * ============================================================================
 *  /api/slots — available 45-minute slots for a given date (public read)
 * ============================================================================
 *  GET /api/slots?date=YYYY-MM-DD
 *    -> { configured:true, date, slotMinutes, isWorkingDay,
 *         slots:[{ time:"HH:MM", available:true|false }] }
 *
 *  A slot is unavailable when a non-cancelled booking already holds that
 *  date+time, or when it is in the past for today (salon local time). When KV
 *  is not connected we return { configured:false } and the frontend generates
 *  the slot grid client-side from config.js (device-local, no shared state).
 * ----------------------------------------------------------------------------
 */
"use strict";

var store = require("./_lib/store.js");

function validDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

module.exports = function handler(req, res) {
  var method = (req.method || "GET").toUpperCase();
  if (method !== "GET") {
    res.setHeader("Allow", "GET");
    store.sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  if (!store.kvConfigured()) {
    store.sendJson(res, 200, { configured: false });
    return;
  }

  var date = (req.query && req.query.date) || "";
  if (!validDateStr(date)) {
    store.sendJson(res, 400, { error: "invalid_date" });
    return;
  }

  var settings = store.getSettings();

  store
    .getBookings()
    .then(function (bookings) {
      var computed = store.computeSlots(date, bookings, settings);
      store.sendJson(res, 200, {
        configured: true,
        date: date,
        slotMinutes: computed.slotMinutes,
        isWorkingDay: computed.isWorkingDay,
        slots: computed.slots
      });
    })
    .catch(function (err) {
      store.sendJson(res, 502, {
        error: "kv_error",
        message: String(err && err.message)
      });
    });
};
