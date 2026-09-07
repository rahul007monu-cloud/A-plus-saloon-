/*
 * ============================================================================
 *  A Plus Salon — Landing page logic (vanilla JS, no dependencies)
 * ============================================================================
 *  Depends on window.SALON_CONFIG (loaded via config.js BEFORE this file).
 *  Responsibilities:
 *    - Inject config-driven content (name, phone tel: links, WhatsApp CTAs)
 *    - Render service cards + populate the booking form's service <select>
 *    - Validate the booking form (required fields, phone sanity, honeypot)
 *    - On submit: save lead to localStorage, open WhatsApp, show success
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var STORAGE_KEY = "aplus_salon_leads";
  var cfg = window.SALON_CONFIG || {};

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

  /* Build a wa.me click-to-chat URL with an optional prefilled message. */
  function buildWhatsAppUrl(message) {
    var number = String(cfg.ownerWhatsApp || "").replace(/[^0-9]/g, "");
    var url = "https://wa.me/" + number;
    if (message) {
      url += "?text=" + encodeURIComponent(message);
    }
    return url;
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

    /* Phone tel: links */
    $all("[data-phone-link]").forEach(function (el) {
      var tel = String(cfg.displayPhone || "").replace(/[^0-9+]/g, "");
      el.setAttribute("href", "tel:" + tel);
    });

    /* Generic WhatsApp CTA links (no lead yet) */
    var genericMsg =
      "Hi " + name + "! I'd like to know more about your services and book an appointment.";
    $all("[data-whatsapp-link]").forEach(function (el) {
      el.setAttribute("href", buildWhatsAppUrl(genericMsg));
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    });

    /* Social links */
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
    var services = Array.isArray(cfg.services) ? cfg.services : [];

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
        meta.innerHTML =
          '<span class="service-card__price">From ' +
          currency(svc.priceFrom) +
          "</span>" +
          '<span class="service-card__dur">' +
          "~" + svc.durationMins + " min</span>";

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

    /* Populate the booking form's <select> */
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
    var services = Array.isArray(cfg.services) ? cfg.services : [];
    for (var i = 0; i < services.length; i++) {
      if (services[i].id === id) {
        return services[i].name;
      }
    }
    return id;
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

    /* Mobile nav toggle */
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
    ["name", "phone", "service"].forEach(clearError);
  }

  function validate(values, honeypot) {
    /* Honeypot: real users never fill this hidden field. */
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
      lines.push("Preferred date: " + lead.date);
    }
    if (lead.time) {
      lines.push("Preferred time: " + lead.time);
    }
    if (lead.message) {
      lines.push("Message: " + lead.message);
    }
    return lines.join("\n");
  }

  /* ---------------------------------------------------------- form submit */
  function wireForm() {
    var form = $("#booking-form");
    if (!form) {
      return;
    }
    var successEl = $("#form-success");
    var fallbackLink = $("#whatsapp-fallback");

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var values = {
        name: (form.elements.name && form.elements.name.value) || "",
        phone: (form.elements.phone && form.elements.phone.value) || "",
        service: (form.elements.service && form.elements.service.value) || "",
        date: (form.elements.date && form.elements.date.value) || "",
        time: (form.elements.time && form.elements.time.value) || "",
        message: (form.elements.message && form.elements.message.value) || ""
      };
      var honeypot =
        (form.elements.company && form.elements.company.value) || "";

      var result = validate(values, honeypot);
      if (!result.ok) {
        if (result.silent) {
          return; /* honeypot tripped — silently ignore */
        }
        var firstInvalid = form.querySelector(".is-invalid");
        if (firstInvalid) {
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
        createdAt: new Date().toISOString()
      };

      saveLead(lead); /* persist first — never lose the lead */

      var msg = buildLeadMessage(lead);
      var waUrl = buildWhatsAppUrl(msg);

      var popup = window.open(waUrl, "_blank");

      /* Success UI */
      if (successEl) {
        successEl.hidden = false;
      }
      if (fallbackLink) {
        fallbackLink.setAttribute("href", waUrl);
        fallbackLink.setAttribute("target", "_blank");
        fallbackLink.setAttribute("rel", "noopener");
      }

      /* If popup was blocked, keep the fallback link visible/emphasized. */
      var blocked =
        !popup || popup.closed || typeof popup.closed === "undefined";
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
      if (successEl) {
        successEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    /* Clear individual errors as the user corrects them */
    ["name", "phone", "service"].forEach(function (field) {
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
    renderServices();
    wireNav();
    wireForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
