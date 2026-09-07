/*
 * ============================================================================
 *  A Plus Salon — Owner Leads Dashboard logic (vanilla JS, no dependencies)
 * ============================================================================
 *  Depends on window.SALON_CONFIG (loaded via config.js BEFORE this file).
 *  Reads leads captured by the public booking form (main.js) which are stored
 *  in localStorage under the key "aplus_salon_leads" as a JSON array of:
 *    { id, name, phone, service (service id), date, time, message, createdAt }
 *
 *  Responsibilities:
 *    - Safely read + parse the leads array (handles empty / corrupt JSON)
 *    - Render newest-first as a table (desktop) / card list (mobile)
 *    - Summary counts: total leads + leads captured today (by createdAt)
 *    - Live client-side search/filter (name / phone / service name)
 *    - Export CSV via Blob + object URL (no external library)
 *    - Per-lead tel: + wa.me WhatsApp reply links
 *    - Clear all leads (guarded by confirm())
 *
 *  SECURITY: All user-provided lead values are inserted with textContent
 *  (never innerHTML) so a malicious lead value cannot inject markup (XSS).
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

  /* Resolve a service id to its display name using config; fall back to id. */
  function serviceNameById(id) {
    var services = Array.isArray(cfg.services) ? cfg.services : [];
    for (var i = 0; i < services.length; i++) {
      if (services[i].id === id) {
        return services[i].name;
      }
    }
    return id || "";
  }

  /* Digits-only phone (for tel: and wa.me links). */
  function phoneDigits(phone) {
    return String(phone || "").replace(/[^0-9]/g, "");
  }

  /* Build a wa.me reply URL from a lead's phone, with an optional message. */
  function buildReplyUrl(lead) {
    var number = phoneDigits(lead.phone);
    var name = cfg.salonName || "our salon";
    var msg =
      "Hi " +
      (lead.name || "there") +
      ", thanks for your booking request at " +
      name +
      "! ";
    var svc = serviceNameById(lead.service);
    if (svc) {
      msg += "Regarding your " + svc + " appointment — ";
    }
    msg += "how can we help confirm it?";
    return "https://wa.me/" + number + "?text=" + encodeURIComponent(msg);
  }

  /* Safe date formatting for a createdAt ISO string. */
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

  /* True if the given ISO timestamp falls on today's local date. */
  function isToday(iso) {
    if (!iso) {
      return false;
    }
    var d = new Date(iso);
    if (isNaN(d.getTime())) {
      return false;
    }
    var now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  /* -------------------------------------------------------- lead storage */
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

  /* Newest-first: sort by createdAt descending (fallback keeps input order). */
  function sortNewestFirst(leads) {
    return leads.slice().sort(function (a, b) {
      var ta = new Date(a && a.createdAt).getTime();
      var tb = new Date(b && b.createdAt).getTime();
      if (isNaN(ta)) {
        ta = 0;
      }
      if (isNaN(tb)) {
        tb = 0;
      }
      return tb - ta;
    });
  }

  /* Filter leads by a search term across name / phone / service name. */
  function filterLeads(leads, term) {
    var q = String(term || "").trim().toLowerCase();
    if (!q) {
      return leads;
    }
    return leads.filter(function (lead) {
      var haystack = [
        lead.name || "",
        lead.phone || "",
        serviceNameById(lead.service),
        lead.service || ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.indexOf(q) !== -1;
    });
  }

  /* --------------------------------------------------------- DOM builders */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text; /* textContent — never innerHTML */
    }
    return node;
  }

  /* Build the tel: + WhatsApp action links for a lead's phone cell. */
  function buildPhoneCell(lead) {
    var wrap = el("div", "lead-phone");

    var digits = phoneDigits(lead.phone);

    var telLink = el("a", "lead-phone__tel");
    telLink.setAttribute("href", "tel:" + digits);
    telLink.textContent = lead.phone || ""; /* textContent — safe */
    wrap.appendChild(telLink);

    if (digits) {
      var waLink = el("a", "lead-phone__wa btn btn--whatsapp btn--sm");
      waLink.setAttribute("href", buildReplyUrl(lead));
      waLink.setAttribute("target", "_blank");
      waLink.setAttribute("rel", "noopener");
      waLink.textContent = "Reply on WhatsApp";
      wrap.appendChild(waLink);
    }

    return wrap;
  }

  /* Preferred date/time combined display. */
  function preferredWhen(lead) {
    var parts = [];
    if (lead.date) {
      parts.push(lead.date);
    }
    if (lead.time) {
      parts.push(lead.time);
    }
    return parts.length ? parts.join(" · ") : "—";
  }

  /* -------------------------------------------------------------- render */
  function render(searchTerm) {
    var allLeads = sortNewestFirst(loadLeads());

    /* Summary counts always reflect ALL stored leads (not the filter). */
    var total = allLeads.length;
    var todayCount = allLeads.filter(function (l) {
      return isToday(l.createdAt);
    }).length;

    var totalEl = $("#stat-total");
    var todayEl = $("#stat-today");
    if (totalEl) {
      totalEl.textContent = String(total);
    }
    if (todayEl) {
      todayEl.textContent = String(todayCount);
    }

    var visible = filterLeads(allLeads, searchTerm);

    renderTable(visible);
    renderCards(visible);

    /* Empty / no-results states */
    var emptyEl = $("#leads-empty");
    var noResultsEl = $("#leads-no-results");
    var tableWrap = $("#leads-table-wrap");
    var cardsWrap = $("#leads-cards");

    var hasAny = total > 0;
    var hasVisible = visible.length > 0;

    if (emptyEl) {
      emptyEl.hidden = hasAny;
    }
    if (noResultsEl) {
      noResultsEl.hidden = !hasAny || hasVisible;
    }
    if (tableWrap) {
      tableWrap.hidden = !hasVisible;
    }
    if (cardsWrap) {
      cardsWrap.hidden = !hasVisible;
    }
  }

  /* Desktop table body. */
  function renderTable(leads) {
    var tbody = $("#leads-tbody");
    if (!tbody) {
      return;
    }
    tbody.innerHTML = ""; /* only clears our own generated rows */

    leads.forEach(function (lead) {
      var tr = document.createElement("tr");

      tr.appendChild(el("td", "col-name", lead.name || ""));

      var phoneTd = el("td", "col-phone");
      phoneTd.appendChild(buildPhoneCell(lead));
      tr.appendChild(phoneTd);

      tr.appendChild(el("td", "col-service", serviceNameById(lead.service)));
      tr.appendChild(el("td", "col-when", preferredWhen(lead)));
      tr.appendChild(el("td", "col-message", lead.message || "—"));
      tr.appendChild(el("td", "col-created", formatCreatedAt(lead.createdAt)));

      tbody.appendChild(tr);
    });
  }

  /* Mobile card list. */
  function renderCards(leads) {
    var wrap = $("#leads-cards");
    if (!wrap) {
      return;
    }
    wrap.innerHTML = "";

    leads.forEach(function (lead) {
      var card = el("article", "lead-card");

      var head = el("div", "lead-card__head");
      head.appendChild(el("h3", "lead-card__name", lead.name || ""));
      head.appendChild(
        el("span", "lead-card__created", formatCreatedAt(lead.createdAt))
      );
      card.appendChild(head);

      card.appendChild(
        buildCardRow("Service", serviceNameById(lead.service))
      );
      card.appendChild(buildCardRow("Preferred", preferredWhen(lead)));
      if (lead.message) {
        card.appendChild(buildCardRow("Message", lead.message));
      }

      var phoneRow = el("div", "lead-card__row");
      phoneRow.appendChild(el("span", "lead-card__label", "Phone"));
      var phoneVal = el("span", "lead-card__value");
      phoneVal.appendChild(buildPhoneCell(lead));
      phoneRow.appendChild(phoneVal);
      card.appendChild(phoneRow);

      wrap.appendChild(card);
    });
  }

  function buildCardRow(label, value) {
    var row = el("div", "lead-card__row");
    row.appendChild(el("span", "lead-card__label", label));
    row.appendChild(el("span", "lead-card__value", value));
    return row;
  }

  /* ------------------------------------------------------------ CSV export */
  function csvEscape(value) {
    var s = value == null ? "" : String(value);
    /* Always quote and escape embedded quotes to keep the CSV robust. */
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function buildCsv(leads) {
    var headers = [
      "Name",
      "Phone",
      "Service",
      "Preferred Date",
      "Preferred Time",
      "Message",
      "Created At"
    ];
    var rows = [headers.map(csvEscape).join(",")];

    leads.forEach(function (lead) {
      var cols = [
        lead.name,
        lead.phone,
        serviceNameById(lead.service),
        lead.date,
        lead.time,
        lead.message,
        lead.createdAt
      ];
      rows.push(cols.map(csvEscape).join(","));
    });

    return rows.join("\r\n");
  }

  function exportCsv() {
    var leads = sortNewestFirst(loadLeads());
    if (!leads.length) {
      window.alert("There are no leads to export yet.");
      return;
    }

    var csv = "\ufeff" + buildCsv(leads); /* BOM for Excel UTF-8 support */
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);

    var stamp = new Date().toISOString().slice(0, 10);
    var a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", "aplus-salon-leads-" + stamp + ".csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    /* Release the object URL after the download has kicked off. */
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* ---------------------------------------------------------------- init */
  function init() {
    /* Inject salon name into the header/title. */
    var name = cfg.salonName || "Salon";
    var nameEls = document.querySelectorAll("[data-salon-name]");
    Array.prototype.forEach.call(nameEls, function (elm) {
      elm.textContent = name;
    });
    if (cfg.salonName) {
      document.title = cfg.salonName + " — Leads Dashboard";
    }

    /* Footer year */
    var yearEls = document.querySelectorAll("[data-year]");
    Array.prototype.forEach.call(yearEls, function (elm) {
      elm.textContent = String(new Date().getFullYear());
    });

    var searchInput = $("#search");
    var refreshBtn = $("#btn-refresh");
    var exportBtn = $("#btn-export");
    var clearBtn = $("#btn-clear");

    function currentTerm() {
      return searchInput ? searchInput.value : "";
    }

    render(currentTerm());

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        render(currentTerm());
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        render(currentTerm());
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", exportCsv);
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        var count = loadLeads().length;
        if (!count) {
          window.alert("There are no leads to clear.");
          return;
        }
        var ok = window.confirm(
          "Delete all " +
            count +
            " saved lead(s) from this browser? This cannot be undone."
        );
        if (ok) {
          clearLeads();
          render(currentTerm());
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
