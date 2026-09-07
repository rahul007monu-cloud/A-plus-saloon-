/*
 * ============================================================================
 *  A Plus Salon — Service Worker
 * ============================================================================
 *  Enables PWA installability (Android/Chrome) and basic offline support.
 *  Strategy:
 *    - Precache the core app shell on install.
 *    - Navigations: network-first, fall back to cached index.html when offline.
 *    - Other GET requests: cache-first, then network (and cache the result).
 *  Bump CACHE_VERSION whenever you change cached assets to force an update.
 * ----------------------------------------------------------------------------
 */
var CACHE_VERSION = "aplus-salon-v1";
var CORE_ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./manifest.webmanifest",
  "./assets/css/styles.css",
  "./assets/js/config.js",
  "./assets/js/main.js",
  "./assets/js/admin.js",
  "./assets/js/pwa.js",
  "./assets/img/logo.svg",
  "./assets/img/favicon.svg",
  "./assets/img/app-icon.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // addAll is atomic; use individual puts so one missing asset can't
      // fail the whole install.
      return Promise.all(
        CORE_ASSETS.map(function (url) {
          return cache.add(url).catch(function () {
            /* ignore individual failures */
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_VERSION) {
            return caches.delete(key);
          }
          return null;
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;

  // Only handle same-origin GET requests; let the browser handle the rest
  // (e.g. wa.me links, cross-origin, POST).
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // Navigations: network-first with offline fallback to the app shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(req, copy);
          });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || caches.match("./index.html");
          });
        })
    );
    return;
  }

  // Everything else: cache-first, then network (and cache a copy).
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        return hit;
      }
      return fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          cache.put(req, copy);
        });
        return res;
      });
    })
  );
});
