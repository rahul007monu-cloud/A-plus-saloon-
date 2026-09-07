/*
 * ============================================================================
 *  /api/services — services catalogue (public read, admin write)
 * ============================================================================
 *  GET                       public. -> { configured, services }
 *  POST   (admin)            create a service      body: { name, priceFrom, durationMins, description }
 *  PUT/PATCH (admin)         update a service      body: { id, name?, priceFrom?, durationMins?, description? }
 *  DELETE (admin)            remove a service      body or ?id=  { id }
 *
 *  When Vercel KV is not connected, GET returns { configured:false } so the
 *  frontend falls back to its bundled config.js defaults, and writes return
 *  503 so the admin UI can show a clear "connect KV" message.
 *
 *  Admin writes require the shared PIN in the `x-admin-pin` header (ADMIN_PIN).
 * ----------------------------------------------------------------------------
 */
"use strict";

var store = require("./_lib/store.js");

function sanitizeService(input, existing) {
  var name = String((input && input.name) || "").trim();
  var priceFrom = Number(input && input.priceFrom);
  var durationMins = Number(input && input.durationMins);
  var description = String((input && input.description) || "").trim();

  var errors = [];
  if (name.length < 2) {
    errors.push("name");
  }
  if (isNaN(priceFrom) || priceFrom < 0) {
    errors.push("priceFrom");
  }
  if (isNaN(durationMins) || durationMins <= 0) {
    durationMins = 45; /* sensible default rather than a hard error */
  }
  return {
    errors: errors,
    value: {
      name: name,
      priceFrom: Math.round(priceFrom),
      durationMins: Math.round(durationMins),
      description: description
    }
  };
}

module.exports = function handler(req, res) {
  var method = (req.method || "GET").toUpperCase();

  /* ---------------------------------------------------------- public GET */
  if (method === "GET") {
    if (!store.kvConfigured()) {
      store.sendJson(res, 200, { configured: false });
      return;
    }
    store
      .getServices()
      .then(function (services) {
        store.sendJson(res, 200, { configured: true, services: services });
      })
      .catch(function (err) {
        store.sendJson(res, 502, {
          error: "kv_error",
          message: String(err && err.message)
        });
      });
    return;
  }

  /* ------------------------------------------------- writes require admin */
  var gate = store.requireAdmin(req);
  if (!gate.ok) {
    store.sendJson(res, gate.status, gate.body);
    return;
  }

  if (method === "POST") {
    store
      .readJsonBody(req)
      .then(function (body) {
        return store.getServices().then(function (services) {
          var check = sanitizeService(body, services);
          if (check.errors.length) {
            store.sendJson(res, 400, {
              error: "invalid",
              fields: check.errors
            });
            return;
          }
          var svc = {
            id: store.makeServiceId(check.value.name, services),
            name: check.value.name,
            priceFrom: check.value.priceFrom,
            durationMins: check.value.durationMins,
            description: check.value.description
          };
          services.push(svc);
          return store.setServices(services).then(function () {
            store.sendJson(res, 201, { service: svc });
          });
        });
      })
      .catch(function (err) {
        store.sendJson(res, 502, {
          error: "kv_error",
          message: String(err && err.message)
        });
      });
    return;
  }

  if (method === "PUT" || method === "PATCH") {
    store
      .readJsonBody(req)
      .then(function (body) {
        var id = String((body && body.id) || "");
        if (!id) {
          store.sendJson(res, 400, { error: "missing_id" });
          return;
        }
        return store.getServices().then(function (services) {
          var idx = -1;
          for (var i = 0; i < services.length; i++) {
            if (services[i].id === id) {
              idx = i;
              break;
            }
          }
          if (idx === -1) {
            store.sendJson(res, 404, { error: "not_found" });
            return;
          }
          var current = services[idx];
          /* Merge: only overwrite provided fields, then re-validate. */
          var merged = {
            name: body.name != null ? body.name : current.name,
            priceFrom:
              body.priceFrom != null ? body.priceFrom : current.priceFrom,
            durationMins:
              body.durationMins != null
                ? body.durationMins
                : current.durationMins,
            description:
              body.description != null
                ? body.description
                : current.description
          };
          var check = sanitizeService(merged, services);
          if (check.errors.length) {
            store.sendJson(res, 400, {
              error: "invalid",
              fields: check.errors
            });
            return;
          }
          var updated = {
            id: current.id,
            name: check.value.name,
            priceFrom: check.value.priceFrom,
            durationMins: check.value.durationMins,
            description: check.value.description
          };
          services[idx] = updated;
          return store.setServices(services).then(function () {
            store.sendJson(res, 200, { service: updated });
          });
        });
      })
      .catch(function (err) {
        store.sendJson(res, 502, {
          error: "kv_error",
          message: String(err && err.message)
        });
      });
    return;
  }

  if (method === "DELETE") {
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
        return store.getServices().then(function (services) {
          var next = services.filter(function (s) {
            return s.id !== id;
          });
          if (next.length === services.length) {
            store.sendJson(res, 404, { error: "not_found" });
            return;
          }
          return store.setServices(next).then(function () {
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
    return;
  }

  res.setHeader("Allow", "GET, POST, PUT, PATCH, DELETE");
  store.sendJson(res, 405, { error: "method_not_allowed" });
};
