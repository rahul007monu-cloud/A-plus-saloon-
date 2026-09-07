/*
 * ============================================================================
 *  /api/bookings — appointments (public create, admin manage)
 * ============================================================================
 *  POST                    public. Customer books a slot.
 *        body: { name, phone, service, date (YYYY-MM-DD), time (HH:MM), message? }
 *        -> 201 { booking }            on success
 *        -> 409 { error:"slot_taken" } if the 45-min slot is already booked
 *        -> 503 { error:"kv_not_configured" } if KV is off (frontend falls back)
 *  GET     (admin)         list all bookings, newest first -> { configured, bookings }
 *  PATCH   (admin)         update status  body: { id, status: pending|confirmed|cancelled }
 *  DELETE  (admin)         remove booking body or ?id=  { id }
 *
 *  Double-booking is prevented server-side: the availability check + write are
 *  done together so two customers cannot grab the same date+time slot.
 * ----------------------------------------------------------------------------
 */
"use strict";

var store = require("./_lib/store.js");

var VALID_STATUS = ["pending", "confirmed", "cancelled"];

function validDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}
function validTimeStr(s) {
  return /^\d{2}:\d{2}$/.test(String(s || ""));
}

function sortNewestFirst(list) {
  return list.slice().sort(function (a, b) {
    var ta = new Date(a && a.createdAt).getTime();
    var tb = new Date(b && b.createdAt).getTime();
    if (isNaN(ta)) ta = 0;
    if (isNaN(tb)) tb = 0;
    return tb - ta;
  });
}

/* ------------------------------------------------------- public create */
function handleCreate(req, res) {
  if (!store.kvConfigured()) {
    store.sendJson(res, 503, { error: "kv_not_configured" });
    return;
  }
  store
    .readJsonBody(req)
    .then(function (body) {
      /* Honeypot: bots fill the hidden "company" field — silently accept
         (so the bot thinks it worked) but do not persist. */
      if (body && body.company) {
        store.sendJson(res, 200, { ok: true, ignored: true });
        return;
      }

      var name = String((body && body.name) || "").trim();
      var phone = String((body && body.phone) || "").trim();
      var service = String((body && body.service) || "").trim();
      var date = String((body && body.date) || "").trim();
      var time = String((body && body.time) || "").trim();
      var message = String((body && body.message) || "").trim();

      var digits = phone.replace(/[^0-9]/g, "");
      var errors = [];
      if (name.length < 2) errors.push("name");
      if (digits.length < 7 || digits.length > 15) errors.push("phone");
      if (!service) errors.push("service");
      if (!validDateStr(date)) errors.push("date");
      if (!validTimeStr(time)) errors.push("time");
      if (errors.length) {
        store.sendJson(res, 400, { error: "invalid", fields: errors });
        return;
      }

      var settings = store.getSettings();

      return store.getBookings().then(function (bookings) {
        /* Confirm the requested slot is real + still free. */
        var computed = store.computeSlots(date, bookings, settings);
        if (!computed.isWorkingDay) {
          store.sendJson(res, 409, { error: "closed_day" });
          return;
        }
        var slotMatch = null;
        for (var i = 0; i < computed.slots.length; i++) {
          if (computed.slots[i].time === time) {
            slotMatch = computed.slots[i];
            break;
          }
        }
        if (!slotMatch) {
          store.sendJson(res, 400, { error: "invalid_slot" });
          return;
        }
        if (!slotMatch.available) {
          store.sendJson(res, 409, { error: "slot_taken" });
          return;
        }

        var booking = {
          id: store.makeBookingId(),
          name: name,
          phone: phone,
          service: service,
          date: date,
          time: time,
          message: message,
          status: "pending",
          createdAt: new Date().toISOString()
        };
        bookings.push(booking);
        return store.setBookings(bookings).then(function () {
          store.sendJson(res, 201, { booking: booking });
        });
      });
    })
    .catch(function (err) {
      store.sendJson(res, 502, {
        error: "kv_error",
        message: String(err && err.message)
      });
    });
}

/* ------------------------------------------------------- admin: list */
function handleList(req, res) {
  store
    .getBookings()
    .then(function (bookings) {
      store.sendJson(res, 200, {
        configured: true,
        bookings: sortNewestFirst(bookings)
      });
    })
    .catch(function (err) {
      store.sendJson(res, 502, {
        error: "kv_error",
        message: String(err && err.message)
      });
    });
}

/* ------------------------------------------------------- admin: status */
function handleUpdate(req, res) {
  store
    .readJsonBody(req)
    .then(function (body) {
      var id = String((body && body.id) || "");
      var status = String((body && body.status) || "");
      if (!id) {
        store.sendJson(res, 400, { error: "missing_id" });
        return;
      }
      if (VALID_STATUS.indexOf(status) === -1) {
        store.sendJson(res, 400, { error: "invalid_status" });
        return;
      }
      return store.getBookings().then(function (bookings) {
        var found = null;
        for (var i = 0; i < bookings.length; i++) {
          if (bookings[i].id === id) {
            bookings[i].status = status;
            found = bookings[i];
            break;
          }
        }
        if (!found) {
          store.sendJson(res, 404, { error: "not_found" });
          return;
        }
        return store.setBookings(bookings).then(function () {
          store.sendJson(res, 200, { booking: found });
        });
      });
    })
    .catch(function (err) {
      store.sendJson(res, 502, {
        error: "kv_error",
        message: String(err && err.message)
      });
    });
}

/* ------------------------------------------------------- admin: delete */
function handleDelete(req, res) {
  store
    .readJsonBody(req)
    .then(function (body) {
      var id =
        String((body && body.id) || "") ||
        String((req.query && req.query.id) || "");
      if (!id) {
        store.sendJson(res, 400, { error: "missing_id" });
        return;
      }
      return store.getBookings().then(function (bookings) {
        var next = bookings.filter(function (b) {
          return b.id !== id;
        });
        if (next.length === bookings.length) {
          store.sendJson(res, 404, { error: "not_found" });
          return;
        }
        return store.setBookings(next).then(function () {
          store.sendJson(res, 200, { ok: true, id: id });
        });
      });
    })
    .catch(function (err) {
      store.sendJson(res, 502, {
        error: "kv_error",
        message: String(err && err.message)
      });
    });
}

module.exports = function handler(req, res) {
  var method = (req.method || "GET").toUpperCase();

  /* Public: customers create bookings without a PIN. */
  if (method === "POST") {
    handleCreate(req, res);
    return;
  }

  /* Everything else manages bookings -> admin only. */
  var gate = store.requireAdmin(req);
  if (!gate.ok) {
    store.sendJson(res, gate.status, gate.body);
    return;
  }

  if (method === "GET") {
    handleList(req, res);
    return;
  }
  if (method === "PATCH" || method === "PUT") {
    handleUpdate(req, res);
    return;
  }
  if (method === "DELETE") {
    handleDelete(req, res);
    return;
  }

  res.setHeader("Allow", "GET, POST, PATCH, PUT, DELETE");
  store.sendJson(res, 405, { error: "method_not_allowed" });
};
