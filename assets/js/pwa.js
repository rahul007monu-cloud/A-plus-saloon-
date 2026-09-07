/*
 * ============================================================================
 *  A Plus Salon — PWA install logic (vanilla JS, no dependencies)
 * ============================================================================
 *  - Registers the service worker (enables installability + offline).
 *  - Android/Chrome/Edge: captures `beforeinstallprompt` and shows a custom
 *    "Install App" popup; tapping it triggers the native install dialog.
 *  - iOS/iPadOS Safari: no install event exists, so we show an instruction
 *    popup ("Tap Share → Add to Home Screen") with the correct icons.
 *  - Hides itself when already installed (standalone display mode) and
 *    remembers dismissal so it isn't naggy.
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var DISMISS_KEY = "aplus_pwa_dismissed_at";
  var DISMISS_DAYS = 7; // re-show after this many days if dismissed
  var deferredPrompt = null;

  var cfg = window.SALON_CONFIG || {};
  var appName = cfg.salonName || "A Plus Salon";

  /* ------------------------------------------------------------- helpers */
  function isStandalone() {
    return (
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches
    ) || window.navigator.standalone === true;
  }

  function isIos() {
    var ua = window.navigator.userAgent || "";
    var iOS = /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS 13+ reports as Mac; detect touch to disambiguate
      (/Macintosh/.test(ua) && "ontouchend" in document);
    var isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
    return iOS && isSafari;
  }

  function recentlyDismissed() {
    try {
      var ts = window.localStorage.getItem(DISMISS_KEY);
      if (!ts) return false;
      var elapsed = Date.now() - Number(ts);
      return elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    } catch (e) {
      return false;
    }
  }

  function rememberDismissed() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (e) {
      /* ignore */
    }
  }

  /* --------------------------------------------------- register SW */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {
        /* SW registration failing must never break the site */
      });
    });
  }

  /* --------------------------------------------------- build the popup */
  function buildPopup(mode) {
    // mode: "android" (native prompt available) or "ios" (manual instructions)
    var overlay = document.createElement("div");
    overlay.className = "pwa-install";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "false");
    overlay.setAttribute("aria-labelledby", "pwa-install-title");

    var card = document.createElement("div");
    card.className = "pwa-install__card";

    var icon = document.createElement("img");
    icon.className = "pwa-install__icon";
    icon.src = "assets/img/app-icon.svg";
    icon.width = 56;
    icon.height = 56;
    icon.alt = "";

    var body = document.createElement("div");
    body.className = "pwa-install__body";

    var title = document.createElement("p");
    title.className = "pwa-install__title";
    title.id = "pwa-install-title";
    title.textContent = "Install " + appName;

    var text = document.createElement("p");
    text.className = "pwa-install__text";

    body.appendChild(title);
    body.appendChild(text);

    var actions = document.createElement("div");
    actions.className = "pwa-install__actions";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "pwa-install__close";
    closeBtn.setAttribute("aria-label", "Dismiss install prompt");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", function () {
      rememberDismissed();
      dismiss(overlay);
    });

    if (mode === "android") {
      text.textContent =
        "Add our app to your home screen for one-tap booking — fast and free.";
      var installBtn = document.createElement("button");
      installBtn.type = "button";
      installBtn.className = "btn btn--primary pwa-install__cta";
      installBtn.textContent = "Install App";
      installBtn.addEventListener("click", function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
          deferredPrompt = null;
          dismiss(overlay);
        });
      });
      actions.appendChild(installBtn);
    } else {
      // iOS manual instructions
      text.innerHTML =
        'Install this app on your iPhone: tap the <strong>Share</strong> ' +
        'button <span class="pwa-install__ios-icon" aria-hidden="true">&#8593;</span> ' +
        'then choose <strong>“Add to Home Screen”</strong>.';
    }

    card.appendChild(icon);
    card.appendChild(body);
    card.appendChild(actions);
    card.appendChild(closeBtn);
    overlay.appendChild(card);

    document.body.appendChild(overlay);
    // Trigger enter animation on next frame
    window.requestAnimationFrame(function () {
      overlay.classList.add("is-visible");
    });
    return overlay;
  }

  function dismiss(overlay) {
    overlay.classList.remove("is-visible");
    window.setTimeout(function () {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 300);
  }

  /* --------------------------------------------------- orchestration */
  function maybeShowIosPrompt() {
    if (isStandalone() || recentlyDismissed() || !isIos()) return;
    // Give the page a moment before nudging the user
    window.setTimeout(function () {
      buildPopup("ios");
    }, 2500);
  }

  function init() {
    registerServiceWorker();

    if (isStandalone()) return; // already installed — nothing to do

    // Android/Chrome/Edge: fires when the app is installable
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault(); // stop the mini-infobar; we show our own UI
      deferredPrompt = e;
      if (recentlyDismissed()) return;
      buildPopup("android");
    });

    // Clean up if the user installs
    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      var existing = document.querySelector(".pwa-install");
      if (existing) dismiss(existing);
    });

    // iOS has no install event — show manual instructions.
    maybeShowIosPrompt();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
