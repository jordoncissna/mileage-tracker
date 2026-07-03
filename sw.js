/* Milo service worker — offline app shell + cached vendor scripts.
   Strategy:
   - Navigations: network-first (fresh deploys win), cached shell when offline.
   - Same-origin assets (icons, manifest) and the Supabase/qrcode CDN scripts:
     stale-while-revalidate, so the app boots offline with a working Supabase
     SDK (its auth session lives in localStorage, so login survives offline).
   - Google Maps is never cached: it is useless offline and its internal
     requests must not be interfered with. */

var CACHE = 'milo-v1';
var SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
var VENDOR_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Never touch Google Maps or Supabase API traffic — network only.
  if (url.hostname.indexOf('googleapis.com') >= 0 || url.hostname.indexOf('supabase.co') >= 0) return;

  // App shell: network-first so deploys show up immediately.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./', copy); });
        return res;
      }).catch(function () {
        return caches.match('./');
      })
    );
    return;
  }

  // Same-origin assets + vendor CDN scripts: stale-while-revalidate.
  var sameOrigin = url.origin === self.location.origin;
  var vendor = VENDOR_HOSTS.indexOf(url.hostname) >= 0;
  if (sameOrigin || vendor) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        var fetched = fetch(req).then(function (res) {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return cached; });
        return cached || fetched;
      })
    );
  }
});
