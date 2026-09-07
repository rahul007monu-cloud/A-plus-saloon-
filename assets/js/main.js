/*
 * ============================================================================
 *  A Plus Salon — Landing page logic (vanilla JS, no dependencies)
 * ============================================================================
 *  Depends on window.SALON_CONFIG (loaded via config.js BEFORE this file).
 *
 *  Two runtime modes, detected automatically at load:
 *    • BACKEND LIVE  — Vercel KV + serverless /api are connected. Services and
 *      45-minute slot availability are shared across all devices; bookings are
 *      stored on the server (double-booking is prevented server-side).
 *    • FALLBACK      — no backend (KV not connected, or opened via file://, or
 *      the API is unreachable). Services come from config.js, slots are
 *      generated from config.booking, and bookings are saved to this browser's
 *      localStorage under "aplus_salon_leads" — exactly the original behaviour.
 *
 *  In BOTH modes a successful booking still opens a prefilled wa.me message to
 *  the owner (instant notification) and keeps a local backup copy.
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var STORAGE_KEY = "aplus_salon_leads";
  var cfg = window.SALON_CONFIG || {};
  var bookingCfg = cfg.booking || {};
  var API_BASE = bookingCfg.apiBase || "/api";

  /* Runtime state */
  var state = {
    backendLive: false, /* true once /api/services confirms KV is configured */
    services: Array.isArray(cfg.services) ? cfg.services.slice() : [],
    selectedTime: "", /* "HH:MM" of the chosen slot */
    slotDate: "" /* the date the current slot grid was built for */
  };

  /* -------------------------------------------------------------- helpers */
  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }
  function $all(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }
  function setText(sel, value) {
    $all(sel).forEach(function (el) {
      el.textContent = value;
    });
  }
  function currency(n) {
    return (cfg.currencySymbol || "₹") + Number(n).toLocaleString("en-IN");
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /* Build a wa.me click-to-chat URL with an optional prefilled message. */
  function buildWhatsAppUrl(message) {
    var number = String(cfg.ownerWhatsApp || "").replace(/[^0-9]/g, "");
    var url = "https://wa.me/" + number;
    if (message) {
      url += "?text=" + encodeURIComponent(message);
    }
    return url;
  }

  /* ------------------------------------------------------------- API layer */
  /* Resolve to { ok, status, data }. Never rejects: a network/parse failure
     resolves with ok:false so callers can fall back cleanly. */
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

  /* Probe the backend once. Marks backendLive and adopts server services. */
  function detectBackend() {
    return apiRequest("/services").then(function (r) {
      if (r.ok && r.data && r.data.configured && Array.isArray(r.data.services)) {
        state.backendLive = true;
        state.services = r.data.services;
      } else {
        state.backendLive = false;
        state.services = Array.isArray(cfg.services) ? cfg.services.slice() : [];
      }
      return state.backendLive;
    });
  }

  /* ------------------------------------------------ config-driven content */
  function injectConfigContent() {
    var name = cfg.salonName || "Salon";

    if (cfg.salonName) {
      document.title = cfg.salonName + " — " + (cfg.tagline || "Book your appointment");
    }

    setText("[data-salon-name]", name);
    setText("[data-tagline]", cfg.tagline || "");
    setText("[data-address]", cfg.address || "");
    setText("[data-city]", cfg.city || "");
    setText("[data-hours]", cfg.businessHours || "");
    setText("[data-phone]", cfg.displayPhone || "");
    setText("[data-year]", String(new Date().getFullYear()));

    $all("[data-phone-link]").forEach(function (el) {
      var tel = String(cfg.displayPhone || "").replace(/[^0-9+]/g, "");
      el.setAttribute("href", "tel:" + tel);
    });

    var genericMsg =
      "Hi " + name + "! I'd like to know more about your services and book an appointment.";
    $all("[data-whatsapp-link]").forEach(function (el) {
      el.setAttribute("href", buildWhatsAppUrl(genericMsg));
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    });

    var social = cfg.socialLinks || {};
    $all("[data-social]").forEach(function (el) {
      var key = el.getAttribute("data-social");
      if (social[key]) {
        el.setAttribute("href", social[key]);
      } else {
        el.style.display = "none";
      }
    });
  }

  /* ------------------------------------------------------- render services */
  function renderServices() {
    var services = Array.isArray(state.services) ? state.services : [];

    var grid = $("#services-grid");
    if (grid) {
      grid.innerHTML = "";
      services.forEach(function (svc) {
        var card = document.createElement("article");
        card.className = "service-card";

        var h3 = document.createElement("h3");
        h3.className = "service-card__name";
        h3.textContent = svc.name;

        var meta = document.createElement("p");
        meta.className = "service-card__meta";

        var priceSpan = document.createElement("span");
        priceSpan.className = "service-card__price";
        priceSpan.textContent = "From " + currency(svc.priceFrom);
        var durSpan = document.createElement("span");
        durSpan.className = "service-card__dur";
        durSpan.textContent = "~" + svc.durationMins + " min";
        meta.appendChild(priceSpan);
        meta.appendChild(durSpan);

        var desc = document.createElement("p");
        desc.className = "service-card__desc";
        desc.textContent = svc.description || "";

        var cta = document.createElement("button");
        cta.type = "button";
        cta.className = "btn btn--outline service-card__cta";
        cta.textContent = "Book " + svc.name;
        cta.addEventListener("click", function () {
          var sel = $("#service");
          if (sel) {
            sel.value = svc.id;
          }
          scrollToBooking();
        });

        card.appendChild(h3);
        card.appendChild(meta);
        card.appendChild(desc);
        card.appendChild(cta);
        grid.appendChild(card);
      });
    }

    var select = $("#service");
    if (select) {
      select.innerHTML = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select a service…";
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);

      services.forEach(function (svc) {
        var opt = document.createElement("option");
        opt.value = svc.id;
        opt.textContent = svc.name + " (from " + currency(svc.priceFrom) + ")";
        select.appendChild(opt);
      });
    }
  }

  function serviceNameById(id) {
    var services = Array.isArray(state.services) ? state.services : [];
    for (var i = 0; i < services.length; i++) {
      if (services[i].id === id) {
        return services[i].name;
      }
    }
    return id;
  }

  /* --------------------------------------------------------- slot helpers */
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
    return pad2(Math.floor(mins / 60)) + ":" + pad2(mins % 60);
  }
  /* "14:45" -> "2:45 PM" for friendly display. */
  function to12h(hhmm) {
    var mins = timeToMinutes(hhmm);
    if (mins == null) {
      return hhmm;
    }
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) {
      h12 = 12;
    }
    return h12 + ":" + pad2(m) + " " + ampm;
  }

  /* Client-side slot generation (fallback mode), mirroring the server. */
  function generateSlotTimesLocal() {
    var start = timeToMinutes(bookingCfg.openTime || "10:00");
    var end = timeToMinutes(bookingCfg.closeTime || "20:00");
    var step = Number(bookingCfg.slotMinutes) || 45;
    var out = [];
    if (start == null || end == null) {
      return out;
    }
    for (var t = start; t + step <= end; t += step) {
      out.push(minutesToTime(t));
    }
    return out;
  }
  function workingDaysLocal() {
    return Array.isArray(bookingCfg.workingDays)
      ? bookingCfg.workingDays
      : [0, 1, 2, 3, 4, 5, 6];
  }
  function localYmd(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /* Booked times for a date from this browser's saved leads (device-local). */
  function bookedTimesLocal(dateStr) {
    var taken = {};
    loadLeads().forEach(function (l) {
      if (l && l.date === dateStr && l.time && l.status !== "cancelled") {
        taken[l.time] = true;
      }
    });
    return taken;
  }

  /* Build the { slots:[{time,available}], isWorkingDay } model for fallback. */
  function computeSlotsLocal(dateStr) {
    var all = generateSlotTimesLocal();
    var days = workingDaysLocal();
    var dow = new Date(dateStr + "T12:00:00").getDay();
    var isWorkingDay = days.indexOf(dow) !== -1;
    var taken = bookedTimesLocal(dateStr);

    var now = new Date();
    var isToday = dateStr === localYmd(now);
    var nowMins = now.getHours() * 60 + now.getMinutes();

    var slots = all.map(function (time) {
      var available = isWorkingDay;
      if (available && taken[time]) {
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
    return { slots: slots, isWorkingDay: isWorkingDay };
  }

  /* ---------------------------------------------------------- slot UI */
  function setSelectedTime(value) {
    state.selectedTime = value || "";
    var hidden = $("#time");
    if (hidden) {
      hidden.value = state.selectedTime;
    }
    if (value) {
      clearError("time");
    }
  }

  function renderSlots(model) {
    var wrap = $("#slots");
    if (!wrap) {
      return;
    }
    wrap.innerHTML = "";
    setSelectedTime("");

    if (!model || !model.isWorkingDay) {
      var closed = document.createElement("p");
      closed.className = "slots__hint";
      closed.textContent = "Sorry, we're closed on that day. Please pick another date.";
      wrap.appendChild(closed);
      return;
    }

    var available = (model.slots || []).filter(function (s) {
      return s.available;
    });
    if (!available.length) {
      var none = document.createElement("p");
      none.className = "slots__hint";
      none.textContent =
        "No slots left for this date. Please choose another day.";
      wrap.appendChild(none);
      return;
    }

    (model.slots || []).forEach(function (slot) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = to12h(slot.time);
      btn.setAttribute("data-time", slot.time);
      if (!slot.available) {
        btn.disabled = true;
        btn.classList.add("slot--taken");
        btn.setAttribute("aria-label", to12h(slot.time) + " — already booked");
      } else {
        btn.addEventListener("click", function () {
          $all(".slot", wrap).forEach(function (b) {
            b.classList.remove("is-selected");
            b.setAttribute("aria-pressed", "false");
          });
          btn.classList.add("is-selected");
          btn.setAttribute("aria-pressed", "true");
          setSelectedTime(slot.time);
        });
        btn.setAttribute("aria-pressed", "false");
      }
      wrap.appendChild(btn);
    });
  }

  function showSlotsMessage(text) {
    var wrap = $("#slots");
    if (!wrap) {
      return;
    }
    wrap.innerHTML = "";
    setSelectedTime("");
    var p = document.createElement("p");
    p.className = "slots__hint";
    p.textContent = text;
    wrap.appendChild(p);
  }

  /* Load slots for a date: from the API when live, else generated locally. */
  function loadSlotsForDate(dateStr) {
    state.slotDate = dateStr;
    if (!dateStr) {
      showSlotsMessage("Select a date above to see available 45-minute time slots.");
      return;
    }
    showSlotsMessage("Loading available slots…");

    if (state.backendLive) {
      apiRequest("/slots?date=" + encodeURIComponent(dateStr)).then(function (r) {
        /* Ignore stale responses if the user changed the date meanwhile. */
        if (state.slotDate !== dateStr) {
          return;
        }
        if (r.ok && r.data && r.data.configured && Array.isArray(r.data.slots)) {
          renderSlots({
            slots: r.data.slots,
            isWorkingDay: r.data.isWorkingDay
          });
        } else {
          /* Backend went away mid-session — degrade to local generation. */
          renderSlots(computeSlotsLocal(dateStr));
        }
      });
    } else {
      renderSlots(computeSlotsLocal(dateStr));
    }
  }

  /* ---------------------------------------------------------- navigation */
  function scrollToBooking() {
    var target = $("#booking");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function wireNav() {
    $all("[data-scroll-to]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        var id = el.getAttribute("data-scroll-to");
        var target = document.getElementById(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    var toggle = $("#nav-toggle");
    var menu = $("#nav-menu");
    if (toggle && menu) {
      toggle.addEventListener("click", function () {
        var open = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      $all("a, button", menu).forEach(function (el) {
        el.addEventListener("click", function () {
          menu.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
        });
      });
    }
  }

  /* ---------------------------------------------------------- validation */
  function showError(field, message) {
    var errEl = document.querySelector('[data-error-for="' + field + '"]');
    var input = document.getElementById(field);
    if (errEl) {
      errEl.textContent = message;
    }
    if (input) {
      input.setAttribute("aria-invalid", "true");
      input.classList.add("is-invalid");
    }
  }
  function clearError(field) {
    var errEl = document.querySelector('[data-error-for="' + field + '"]');
    var input = document.getElementById(field);
    if (errEl) {
      errEl.textContent = "";
    }
    if (input) {
      input.removeAttribute("aria-invalid");
      input.classList.remove("is-invalid");
    }
  }
  function clearAllErrors() {
    ["name", "phone", "service", "date", "time"].forEach(clearError);
  }

  function validate(values, honeypot) {
    if (honeypot) {
      return { ok: false, silent: true };
    }
    var ok = true;
    clearAllErrors();

    if (!values.name || values.name.trim().length < 2) {
      showError("name", "Please enter your full name.");
      ok = false;
    }
    var digits = (values.phone || "").replace(/[^0-9]/g, "");
    if (!values.phone || digits.length < 7 || digits.length > 15) {
      showError("phone", "Please enter a valid phone number.");
      ok = false;
    }
    if (!values.service) {
      showError("service", "Please select a service.");
      ok = false;
    }
    if (!values.date) {
      showError("date", "Please choose a date.");
      ok = false;
    }
    if (!values.time) {
      showError("time", "Please pick an available time slot.");
      ok = false;
    }
    return { ok: ok };
  }

  /* ------------------------------------------------------ lead storage */
  function loadLeads() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  function saveLead(lead) {
    try {
      var leads = loadLeads();
      leads.push(lead);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
      return true;
    } catch (e) {
      return false;
    }
  }
  function makeId() {
    return "lead_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  function buildLeadMessage(lead) {
    var lines = [
      "New booking request — " + (cfg.salonName || "Salon"),
      "",
      "Name: " + lead.name,
      "Phone: " + lead.phone,
      "Service: " + serviceNameById(lead.service)
    ];
    if (lead.date) {
      lines.push("Date: " + lead.date);
    }
    if (lead.time) {
      lines.push("Time slot: " + to12h(lead.time) + " (45 min)");
    }
    if (lead.message) {
      lines.push("Message: " + lead.message);
    }
    return lines.join("\n");
  }

  /* Shared success UI + WhatsApp open (used by both modes). */
  function finishSuccess(lead, form, successEl, fallbackLink) {
    var msg = buildLeadMessage(lead);
    var waUrl = buildWhatsAppUrl(msg);
    var popup = window.open(waUrl, "_blank");

    if (successEl) {
      successEl.hidden = false;
    }
    if (fallbackLink) {
      fallbackLink.setAttribute("href", waUrl);
      fallbackLink.setAttribute("target", "_blank");
      fallbackLink.setAttribute("rel", "noopener");
    }
    var blocked = !popup || popup.closed || typeof popup.closed === "undefined";
    var fallbackWrap = $("#whatsapp-fallback-wrap");
    if (fallbackWrap) {
      fallbackWrap.hidden = false;
      if (blocked) {
        fallbackWrap.classList.add("is-emphasized");
      }
    }

    form.reset();
    var sel = $("#service");
    if (sel) {
      sel.selectedIndex = 0;
    }
    showSlotsMessage("Select a date above to see available 45-minute time slots.");
    if (successEl) {
      successEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /* ---------------------------------------------------------- form submit */
  function wireForm() {
    var form = $("#booking-form");
    if (!form) {
      return;
    }
    var successEl = $("#form-success");
    var fallbackLink = $("#whatsapp-fallback");
    var submitBtn = form.querySelector('button[type="submit"]');

    /* Date input: min = today; changing it (re)loads the slot grid. */
    var dateInput = $("#date");
    if (dateInput) {
      dateInput.setAttribute("min", localYmd(new Date()));
      dateInput.addEventListener("change", function () {
        clearError("date");
        loadSlotsForDate(dateInput.value);
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var values = {
        name: (form.elements.name && form.elements.name.value) || "",
        phone: (form.elements.phone && form.elements.phone.value) || "",
        service: (form.elements.service && form.elements.service.value) || "",
        date: (form.elements.date && form.elements.date.value) || "",
        time: state.selectedTime || "",
        message: (form.elements.message && form.elements.message.value) || ""
      };
      var honeypot = (form.elements.company && form.elements.company.value) || "";

      var result = validate(values, honeypot);
      if (!result.ok) {
        if (result.silent) {
          return;
        }
        var firstInvalid = form.querySelector(".is-invalid");
        if (firstInvalid && typeof firstInvalid.focus === "function") {
          firstInvalid.focus();
        }
        return;
      }

      var lead = {
        id: makeId(),
        name: values.name.trim(),
        phone: values.phone.trim(),
        service: values.service,
        date: values.date,
        time: values.time,
        message: values.message.trim(),
        status: "pending",
        createdAt: new Date().toISOString()
      };

      /* Always keep a local backup copy so a lead is never lost. */
      saveLead(lead);

      if (state.backendLive) {
        if (submitBtn) {
          submitBtn.disabled = true;
        }
        apiRequest("/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: lead.name,
            phone: lead.phone,
            service: lead.service,
            date: lead.date,
            time: lead.time,
            message: lead.message,
            company: honeypot
          })
        }).then(function (r) {
          if (submitBtn) {
            submitBtn.disabled = false;
          }
          if (r.status === 409) {
            /* Someone grabbed this slot first — refresh the grid. */
            var reason =
              r.data && r.data.error === "closed_day"
                ? "We're closed on that day. Please pick another date."
                : "Sorry, that slot was just booked. Please pick another.";
            showError("time", reason);
            loadSlotsForDate(lead.date);
            return;
          }
          if (r.ok || r.status === 201) {
            finishSuccess(lead, form, successEl, fallbackLink);
            return;
          }
          /* Any other server issue: still deliver via WhatsApp (backup saved). */
          finishSuccess(lead, form, successEl, fallbackLink);
        });
      } else {
        /* Fallback mode: local save (done) + WhatsApp. */
        finishSuccess(lead, form, successEl, fallbackLink);
      }
    });

    ["name", "phone", "service", "date"].forEach(function (field) {
      var input = document.getElementById(field);
      if (input) {
        input.addEventListener("input", function () {
          clearError(field);
        });
        input.addEventListener("change", function () {
          clearError(field);
        });
      }
    });
  }

  /* ---------------------------------------------------------------- init */
  function init() {
    injectConfigContent();
    wireNav();
    wireForm();

    /* Render services from config immediately (instant paint), then upgrade
       to server data once the backend probe resolves. */
    renderServices();
    detectBackend().then(function () {
      renderServices();
      /* If a date is already chosen (e.g. browser autofill), refresh slots. */
      var dateInput = $("#date");
      if (dateInput && dateInput.value) {
        loadSlotsForDate(dateInput.value);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
