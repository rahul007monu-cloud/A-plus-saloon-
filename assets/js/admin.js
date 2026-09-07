/*
 * ============================================================================
 *  A Plus Salon — Owner Admin logic (vanilla JS, no dependencies)
 * ============================================================================
 *  Two modes, detected at load via GET /api/services:
 *    • BACKEND LIVE  — Vercel KV connected. A PIN gate (ADMIN_PIN) protects the
 *      dashboard. Bookings + services are read/written on the server and are
 *      shared across every device. Owner can: change booking status, delete
 *      bookings, and add/edit/delete services & rates.
 *    • FALLBACK      — no backend. Shows this browser's localStorage leads
 *      ("aplus_salon_leads") and the config.js services read-only, so the page
 *      still works before KV is set up.
 *
 *  SECURITY: all customer-provided values are inserted with textContent (never
 *  innerHTML) to prevent markup injection (XSS). The PIN is kept only in
 *  sessionStorage and sent in the `x-admin-pin` header on admin requests.
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var STORAGE_KEY = "aplus_salon_leads";
  var PIN_SESSION_KEY = "aplus_admin_pin";
  var cfg = window.SALON_CONFIG || {};
  var bookingCfg = cfg.booking || {};
  var API_BASE = bookingCfg.apiBase || "/api";

  var state = {
    backendLive: false,
    authed: false,
    pin: "",
    bookings: [],
    services: [],
    search: "",
    statusFilter: ""
  };

  /* -------------------------------------------------------------- helpers */
  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function currency(n) {
    return (cfg.currencySymbol || "₹") + Number(n).toLocaleString("en-IN");
  }
  function phoneDigits(phone) {
    return String(phone || "").replace(/[^0-9]/g, "");
  }
  function to12h(hhmm) {
    var parts = String(hhmm || "").split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) {
      return hhmm || "";
    }
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) {
      h12 = 12;
    }
    return h12 + ":" + pad2(m) + " " + ampm;
  }

  function serviceNameById(id) {
    var services = Array.isArray(state.services) ? state.services : [];
    for (var i = 0; i < services.length; i++) {
      if (services[i].id === id) {
        return services[i].name;
      }
    }
    return id || "";
  }

  function formatCreatedAt(iso) {
    if (!iso) {
      return "";
    }
    var d = new Date(iso);
    if (isNaN(d.getTime())) {
      return String(iso);
    }
    return d.toLocaleString();
  }
  function isTodayDate(dateStr) {
    if (!dateStr) {
      return false;
    }
    var now = new Date();
    var todayStr =
      now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
    return dateStr === todayStr;
  }

  /* ------------------------------------------------------------- API layer */
  function apiRequest(path, options) {
    if (typeof fetch !== "function") {
      return Promise.resolve({ ok: false, status: 0, data: null });
    }
    return fetch(API_BASE + path, options || {})
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
      })
      .catch(function () {
        return { ok: false, status: 0, data: null };
      });
  }
  function adminHeaders(extra) {
    var h = { "x-admin-pin": state.pin };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        h[k] = extra[k];
      });
    }
    return h;
  }

  /* --------------------------------------------------- localStorage leads */
  function loadLeads() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  function clearLeads() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
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

  /* ---------------------------------------------------------- data loaders */
  function loadBookings() {
    if (state.backendLive && state.authed) {
      return apiRequest("/bookings", { headers: adminHeaders() }).then(function (r) {
        if (r.ok && r.data && Array.isArray(r.data.bookings)) {
          state.bookings = r.data.bookings;
        } else {
          state.bookings = [];
        }
        return state.bookings;
      });
    }
    /* Fallback: device-local leads. */
    state.bookings = sortNewestFirst(loadLeads());
    return Promise.resolve(state.bookings);
  }

  function loadServices() {
    if (state.backendLive) {
      return apiRequest("/services").then(function (r) {
        if (r.ok && r.data && r.data.configured && Array.isArray(r.data.services)) {
          state.services = r.data.services;
        } else {
          state.services = [];
        }
        return state.services;
      });
    }
    state.services = Array.isArray(cfg.services) ? cfg.services.slice() : [];
    return Promise.resolve(state.services);
  }

  /* =========================================================================
   *  BOOKINGS
   * ========================================================================= */
  function buildReplyUrl(b) {
    var number = phoneDigits(b.phone);
    var name = cfg.salonName || "our salon";
    var msg =
      "Hi " + (b.name || "there") + ", thanks for booking at " + name + "! ";
    var svc = serviceNameById(b.service);
    if (svc) {
      msg += "Your " + svc;
    }
    if (b.date && b.time) {
      msg += " on " + b.date + " at " + to12h(b.time);
    }
    msg += " — we're confirming it now.";
    return "https://wa.me/" + number + "?text=" + encodeURIComponent(msg);
  }

  function statusBadge(status) {
    var s = status || "pending";
    var badge = el("span", "status-badge status-badge--" + s, s);
    return badge;
  }

  function filterBookings(list) {
    var q = String(state.search || "").trim().toLowerCase();
    var status = state.statusFilter;
    return list.filter(function (b) {
      if (status && (b.status || "pending") !== status) {
        return false;
      }
      if (!q) {
        return true;
      }
      var hay = [
        b.name || "",
        b.phone || "",
        serviceNameById(b.service),
        b.service || ""
      ]
        .join(" ")
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function buildPhoneCell(b) {
    var wrap = el("div", "lead-phone");
    var digits = phoneDigits(b.phone);
    var telLink = el("a", "lead-phone__tel");
    telLink.setAttribute("href", "tel:" + digits);
    telLink.textContent = b.phone || "";
    wrap.appendChild(telLink);
    if (digits) {
      var waLink = el("a", "lead-phone__wa btn btn--whatsapp btn--sm");
      waLink.setAttribute("href", buildReplyUrl(b));
      waLink.setAttribute("target", "_blank");
      waLink.setAttribute("rel", "noopener");
      waLink.textContent = "WhatsApp";
      wrap.appendChild(waLink);
    }
    return wrap;
  }

  function slotDisplay(b) {
    var parts = [];
    if (b.date) {
      parts.push(b.date);
    }
    if (b.time) {
      parts.push(to12h(b.time));
    }
    return parts.length ? parts.join(" · ") : "—";
  }

  /* Action buttons for a booking (backend mode only). */
  function buildActions(b) {
    var wrap = el("div", "booking-actions");
    if (!(state.backendLive && state.authed)) {
      return wrap;
    }
    var status = b.status || "pending";

    if (status !== "confirmed") {
      var confirmBtn = el("button", "btn btn--sm btn--whatsapp", "Confirm");
      confirmBtn.type = "button";
      confirmBtn.addEventListener("click", function () {
        setStatus(b.id, "confirmed");
      });
      wrap.appendChild(confirmBtn);
    }
    if (status !== "cancelled") {
      var cancelBtn = el("button", "btn btn--sm btn--outline", "Cancel");
      cancelBtn.type = "button";
      cancelBtn.addEventListener("click", function () {
        setStatus(b.id, "cancelled");
      });
      wrap.appendChild(cancelBtn);
    }
    if (status === "cancelled") {
      var reopenBtn = el("button", "btn btn--sm btn--outline", "Set pending");
      reopenBtn.type = "button";
      reopenBtn.addEventListener("click", function () {
        setStatus(b.id, "pending");
      });
      wrap.appendChild(reopenBtn);
    }
    var delBtn = el("button", "btn btn--sm btn--danger", "Delete");
    delBtn.type = "button";
    delBtn.addEventListener("click", function () {
      deleteBooking(b.id, b.name);
    });
    wrap.appendChild(delBtn);
    return wrap;
  }

  function setStatus(id, status) {
    apiRequest("/bookings", {
      method: "PATCH",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: id, status: status })
    }).then(function (r) {
      if (r.ok) {
        loadBookings().then(renderBookings);
      } else {
        handleAdminError(r);
      }
    });
  }

  function deleteBooking(id, name) {
    var ok = window.confirm(
      "Delete booking for " + (name || "this customer") + "? This cannot be undone."
    );
    if (!ok) {
      return;
    }
    apiRequest("/bookings", {
      method: "DELETE",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: id })
    }).then(function (r) {
      if (r.ok) {
        loadBookings().then(renderBookings);
      } else {
        handleAdminError(r);
      }
    });
  }

  function renderBookings() {
    var all = state.bookings || [];
    var total = all.length;
    var todayCount = all.filter(function (b) {
      return isTodayDate(b.date);
    }).length;
    var pendingCount = all.filter(function (b) {
      return (b.status || "pending") === "pending";
    }).length;

    setStat("#stat-total", total);
    setStat("#stat-today", todayCount);
    setStat("#stat-pending", pendingCount);

    var visible = filterBookings(all);
    renderBookingsTable(visible);
    renderBookingsCards(visible);

    var emptyEl = $("#bookings-empty");
    var noResultsEl = $("#bookings-no-results");
    var tableWrap = $("#bookings-table-wrap");
    var cardsWrap = $("#bookings-cards");
    var hasAny = total > 0;
    var hasVisible = visible.length > 0;

    if (emptyEl) emptyEl.hidden = hasAny;
    if (noResultsEl) noResultsEl.hidden = !hasAny || hasVisible;
    if (tableWrap) tableWrap.hidden = !hasVisible;
    if (cardsWrap) cardsWrap.hidden = !hasVisible;
  }

  function setStat(sel, val) {
    var node = $(sel);
    if (node) {
      node.textContent = String(val);
    }
  }

  function renderBookingsTable(list) {
    var tbody = $("#bookings-tbody");
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";
    list.forEach(function (b) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "col-name", b.name || ""));

      var phoneTd = el("td", "col-phone");
      phoneTd.appendChild(buildPhoneCell(b));
      tr.appendChild(phoneTd);

      tr.appendChild(el("td", "col-service", serviceNameById(b.service)));
      tr.appendChild(el("td", "col-when", slotDisplay(b)));

      var statusTd = el("td", "col-status");
      statusTd.appendChild(statusBadge(b.status));
      tr.appendChild(statusTd);

      var actionsTd = el("td", "col-actions");
      actionsTd.appendChild(buildActions(b));
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    });
  }

  function cardRow(label, value) {
    var row = el("div", "lead-card__row");
    row.appendChild(el("span", "lead-card__label", label));
    row.appendChild(el("span", "lead-card__value", value));
    return row;
  }

  function renderBookingsCards(list) {
    var wrap = $("#bookings-cards");
    if (!wrap) {
      return;
    }
    wrap.innerHTML = "";
    list.forEach(function (b) {
      var card = el("article", "lead-card");

      var head = el("div", "lead-card__head");
      head.appendChild(el("h3", "lead-card__name", b.name || ""));
      head.appendChild(statusBadge(b.status));
      card.appendChild(head);

      card.appendChild(cardRow("Service", serviceNameById(b.service)));
      card.appendChild(cardRow("Slot", slotDisplay(b)));
      if (b.message) {
        card.appendChild(cardRow("Message", b.message));
      }
      card.appendChild(cardRow("Booked", formatCreatedAt(b.createdAt)));

      var phoneRow = el("div", "lead-card__row");
      phoneRow.appendChild(el("span", "lead-card__label", "Phone"));
      var phoneVal = el("span", "lead-card__value");
      phoneVal.appendChild(buildPhoneCell(b));
      phoneRow.appendChild(phoneVal);
      card.appendChild(phoneRow);

      var actions = buildActions(b);
      if (actions.childNodes.length) {
        card.appendChild(actions);
      }
      wrap.appendChild(card);
    });
  }

  /* ------------------------------------------------------------ CSV export */
  function csvEscape(value) {
    var s = value == null ? "" : String(value);
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function buildCsv(list) {
    var headers = [
      "Name",
      "Phone",
      "Service",
      "Date",
      "Time",
      "Status",
      "Message",
      "Created At"
    ];
    var rows = [headers.map(csvEscape).join(",")];
    list.forEach(function (b) {
      rows.push(
        [
          b.name,
          b.phone,
          serviceNameById(b.service),
          b.date,
          b.time ? to12h(b.time) : "",
          b.status || "pending",
          b.message,
          b.createdAt
        ]
          .map(csvEscape)
          .join(",")
      );
    });
    return rows.join("\r\n");
  }
  function exportCsv() {
    var list = state.bookings || [];
    if (!list.length) {
      window.alert("There are no bookings to export yet.");
      return;
    }
    var csv = "\ufeff" + buildCsv(list);
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().slice(0, 10);
    var a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", "aplus-salon-bookings-" + stamp + ".csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* =========================================================================
   *  SERVICES
   * ========================================================================= */
  function renderServices() {
    var wrap = $("#services-list");
    if (!wrap) {
      return;
    }
    wrap.innerHTML = "";

    var canManage = state.backendLive && state.authed;
    var readonlyNote = $("#services-readonly-note");
    if (readonlyNote) {
      readonlyNote.hidden = canManage;
    }
    var addForm = $("#service-form");
    if (addForm) {
      addForm.hidden = !canManage;
    }

    var services = state.services || [];
    if (!services.length) {
      wrap.appendChild(
        el("p", "admin-empty", "No services yet. Add your first service above.")
      );
      return;
    }

    services.forEach(function (svc) {
      wrap.appendChild(buildServiceCard(svc, canManage));
    });
  }

  function buildServiceCard(svc, canManage) {
    var card = el("article", "svc-card");
    card.setAttribute("data-id", svc.id);

    var view = el("div", "svc-card__view");
    var head = el("div", "svc-card__head");
    head.appendChild(el("h3", "svc-card__name", svc.name));
    head.appendChild(el("span", "svc-card__price", "From " + currency(svc.priceFrom)));
    view.appendChild(head);

    var meta = el("p", "svc-card__meta", "~" + svc.durationMins + " min");
    view.appendChild(meta);

    if (svc.description) {
      view.appendChild(el("p", "svc-card__desc", svc.description));
    }

    if (canManage) {
      var actions = el("div", "svc-card__actions");
      var editBtn = el("button", "btn btn--sm btn--outline", "Edit");
      editBtn.type = "button";
      editBtn.addEventListener("click", function () {
        showServiceEditor(card, svc);
      });
      var delBtn = el("button", "btn btn--sm btn--danger", "Delete");
      delBtn.type = "button";
      delBtn.addEventListener("click", function () {
        deleteService(svc);
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      view.appendChild(actions);
    }

    card.appendChild(view);
    return card;
  }

  /* Inline editor swapped into a service card. */
  function showServiceEditor(card, svc) {
    card.innerHTML = "";
    var form = el("form", "svc-edit");

    var g = el("div", "service-form__grid");
    g.appendChild(fieldInput("Name", "text", svc.name, "edit-name"));
    g.appendChild(fieldInput("Rate (from)", "number", svc.priceFrom, "edit-price"));
    g.appendChild(fieldInput("Duration (min)", "number", svc.durationMins, "edit-duration"));
    g.appendChild(fieldInput("Description", "text", svc.description || "", "edit-desc", true));
    form.appendChild(g);

    var err = el("p", "field__error");
    form.appendChild(err);

    var actions = el("div", "svc-card__actions");
    var saveBtn = el("button", "btn btn--sm btn--primary", "Save");
    saveBtn.type = "submit";
    var cancelBtn = el("button", "btn btn--sm btn--outline", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", function () {
      renderServices();
    });
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var payload = {
        id: svc.id,
        name: form.querySelector(".edit-name").value.trim(),
        priceFrom: Number(form.querySelector(".edit-price").value),
        durationMins: Number(form.querySelector(".edit-duration").value),
        description: form.querySelector(".edit-desc").value.trim()
      };
      if (payload.name.length < 2) {
        err.textContent = "Please enter a service name.";
        return;
      }
      if (isNaN(payload.priceFrom) || payload.priceFrom < 0) {
        err.textContent = "Please enter a valid rate.";
        return;
      }
      saveBtn.disabled = true;
      apiRequest("/services", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      }).then(function (r) {
        saveBtn.disabled = false;
        if (r.ok) {
          loadServices().then(renderServices);
        } else {
          err.textContent = adminErrorText(r);
        }
      });
    });

    card.appendChild(form);
  }

  function fieldInput(label, type, value, cls, wide) {
    var field = el("div", "field" + (wide ? " service-form__desc" : ""));
    var lbl = el("label", null, label);
    field.appendChild(lbl);
    var input = document.createElement("input");
    input.type = type;
    input.className = cls;
    if (type === "number") {
      input.min = "0";
      input.step = "1";
    }
    input.value = value == null ? "" : value;
    field.appendChild(input);
    return field;
  }

  function deleteService(svc) {
    var ok = window.confirm('Delete "' + svc.name + '" from your services?');
    if (!ok) {
      return;
    }
    apiRequest("/services", {
      method: "DELETE",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: svc.id })
    }).then(function (r) {
      if (r.ok) {
        loadServices().then(renderServices);
      } else {
        window.alert(adminErrorText(r));
      }
    });
  }

  function wireServiceForm() {
    var form = $("#service-form");
    if (!form) {
      return;
    }
    var errEl = $("#service-form-error");
    var addBtn = $("#svc-add-btn");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (errEl) {
        errEl.textContent = "";
      }
      var payload = {
        name: (form.elements.name.value || "").trim(),
        priceFrom: Number(form.elements.priceFrom.value),
        durationMins: Number(form.elements.durationMins.value) || 45,
        description: (form.elements.description.value || "").trim()
      };
      if (payload.name.length < 2) {
        if (errEl) errEl.textContent = "Please enter a service name.";
        return;
      }
      if (isNaN(payload.priceFrom) || payload.priceFrom < 0) {
        if (errEl) errEl.textContent = "Please enter a valid rate.";
        return;
      }
      if (addBtn) {
        addBtn.disabled = true;
      }
      apiRequest("/services", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (addBtn) {
          addBtn.disabled = false;
        }
        if (r.ok) {
          form.reset();
          loadServices().then(renderServices);
        } else if (errEl) {
          errEl.textContent = adminErrorText(r);
        }
      });
    });
  }

  /* ---------------------------------------------------- admin error text */
  function adminErrorText(r) {
    var code = r && r.data && r.data.error;
    if (r && r.status === 401) {
      return "Session expired or wrong PIN. Please reload and sign in again.";
    }
    if (code === "kv_not_configured") {
      return "Backend storage is not connected. Connect Vercel KV (see README).";
    }
    if (code === "admin_not_configured") {
      return "ADMIN_PIN is not set in Vercel. Set it and redeploy (see README).";
    }
    if (code === "invalid") {
      return "Please check the values and try again.";
    }
    return "Something went wrong. Please try again.";
  }
  function handleAdminError(r) {
    window.alert(adminErrorText(r));
    if (r && r.status === 401) {
      /* PIN no longer valid — drop back to the gate. */
      state.authed = false;
      try {
        window.sessionStorage.removeItem(PIN_SESSION_KEY);
      } catch (e) {}
      showGate();
    }
  }

  /* =========================================================================
   *  TABS + MODE + GATE
   * ========================================================================= */
  function wireTabs() {
    var tabB = $("#tab-bookings");
    var tabS = $("#tab-services");
    var panelB = $("#panel-bookings");
    var panelS = $("#panel-services");
    if (!tabB || !tabS) {
      return;
    }
    function activate(which) {
      var bookings = which === "bookings";
      tabB.classList.toggle("is-active", bookings);
      tabS.classList.toggle("is-active", !bookings);
      tabB.setAttribute("aria-selected", bookings ? "true" : "false");
      tabS.setAttribute("aria-selected", !bookings ? "true" : "false");
      if (panelB) panelB.hidden = !bookings;
      if (panelS) panelS.hidden = bookings;
    }
    tabB.addEventListener("click", function () {
      activate("bookings");
    });
    tabS.addEventListener("click", function () {
      activate("services");
    });
  }

  function setModeNote() {
    var note = $("#mode-note");
    if (!note) {
      return;
    }
    note.innerHTML = "";
    if (state.backendLive && state.authed) {
      note.className = "admin-note admin-note--ok";
      var ok = el(
        "span",
        null,
        "Connected to shared cloud storage. Bookings and service/rate changes here are live for every customer, on every device."
      );
      note.appendChild(ok);
    } else {
      note.className = "admin-note";
      var strong = el("strong", null, "Device-local mode. ");
      note.appendChild(strong);
      note.appendChild(
        el(
          "span",
          null,
          "Backend storage (Vercel KV) is not connected yet, so bookings shown here are only the ones captured in THIS browser, and services are read-only. WhatsApp still delivers every booking instantly. See the README to connect KV and set ADMIN_PIN for full shared management."
        )
      );
    }
  }

  function showGate() {
    var gate = $("#admin-gate");
    var app = $("#admin-app");
    if (gate) gate.hidden = false;
    if (app) app.hidden = true;
    var pin = $("#pin");
    if (pin) {
      pin.focus();
    }
  }

  function showApp() {
    var gate = $("#admin-gate");
    var app = $("#admin-app");
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    setModeNote();
    renderBookings();
    renderServices();
    /* "Clear all" only makes sense for device-local leads. */
    var clearBtn = $("#btn-clear");
    if (clearBtn) {
      clearBtn.hidden = state.backendLive;
    }
  }

  function wireGate() {
    var form = $("#gate-form");
    if (!form) {
      return;
    }
    var errEl = $("#gate-error");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pinInput = $("#pin");
      var pin = pinInput ? pinInput.value : "";
      if (!pin) {
        if (errEl) errEl.textContent = "Please enter your PIN.";
        return;
      }
      state.pin = pin;
      if (errEl) errEl.textContent = "Checking…";
      /* Verify the PIN by attempting an admin read. */
      apiRequest("/bookings", { headers: adminHeaders() }).then(function (r) {
        if (r.ok && r.data && Array.isArray(r.data.bookings)) {
          state.authed = true;
          state.bookings = r.data.bookings;
          try {
            window.sessionStorage.setItem(PIN_SESSION_KEY, pin);
          } catch (e) {}
          if (errEl) errEl.textContent = "";
          loadServices().then(function () {
            showApp();
          });
        } else if (r.status === 401) {
          if (errEl) errEl.textContent = "Incorrect PIN. Please try again.";
        } else {
          if (errEl) errEl.textContent = adminErrorText(r);
        }
      });
    });
  }

  /* =========================================================================
   *  WIRING + INIT
   * ========================================================================= */
  function wireToolbar() {
    var searchInput = $("#search");
    var statusFilter = $("#status-filter");
    var refreshBtn = $("#btn-refresh");
    var exportBtn = $("#btn-export");
    var clearBtn = $("#btn-clear");

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        state.search = searchInput.value;
        renderBookings();
      });
    }
    if (statusFilter) {
      statusFilter.addEventListener("change", function () {
        state.statusFilter = statusFilter.value;
        renderBookings();
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        loadBookings().then(renderBookings);
        if (state.backendLive) {
          loadServices().then(renderServices);
        }
      });
    }
    if (exportBtn) {
      exportBtn.addEventListener("click", exportCsv);
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        var count = loadLeads().length;
        if (!count) {
          window.alert("There are no bookings to clear.");
          return;
        }
        var ok = window.confirm(
          "Delete all " +
            count +
            " booking(s) saved in THIS browser? This cannot be undone."
        );
        if (ok) {
          clearLeads();
          loadBookings().then(renderBookings);
        }
      });
    }
  }

  function injectHeaderContent() {
    var name = cfg.salonName || "Salon";
    var nameEls = document.querySelectorAll("[data-salon-name]");
    Array.prototype.forEach.call(nameEls, function (elm) {
      elm.textContent = name;
    });
    if (cfg.salonName) {
      document.title = cfg.salonName + " — Admin";
    }
    var yearEls = document.querySelectorAll("[data-year]");
    Array.prototype.forEach.call(yearEls, function (elm) {
      elm.textContent = String(new Date().getFullYear());
    });
  }

  function init() {
    injectHeaderContent();
    wireTabs();
    wireToolbar();
    wireGate();
    wireServiceForm();

    /* Probe the backend. */
    apiRequest("/services").then(function (r) {
      state.backendLive = !!(r.ok && r.data && r.data.configured);

      if (!state.backendLive) {
        /* Fallback mode — no gate, device-local leads + read-only services. */
        state.services = Array.isArray(cfg.services) ? cfg.services.slice() : [];
        loadBookings().then(function () {
          showApp();
        });
        return;
      }

      /* Backend live — try a stored PIN, else show the gate. */
      state.services =
        r.data && Array.isArray(r.data.services) ? r.data.services : [];
      var storedPin = "";
      try {
        storedPin = window.sessionStorage.getItem(PIN_SESSION_KEY) || "";
      } catch (e) {}

      if (storedPin) {
        state.pin = storedPin;
        apiRequest("/bookings", { headers: adminHeaders() }).then(function (br) {
          if (br.ok && br.data && Array.isArray(br.data.bookings)) {
            state.authed = true;
            state.bookings = br.data.bookings;
            loadServices().then(showApp);
          } else {
            showGate();
          }
        });
      } else {
        showGate();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
