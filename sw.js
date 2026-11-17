// JJ Movies service worker: app UI offline lo kuda open avvadaniki
var CACHE = "jj-shell-v1";
var IMG_CACHE = "jj-img-v1";
var IMG_LIMIT = 400;

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(["./", "./index.html", "./app.js", "./style.css"]);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== IMG_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function trimImages() {
  caches.open(IMG_CACHE).then(function (c) {
    c.keys().then(function (keys) {
      if (keys.length > IMG_LIMIT) {
        keys.slice(0, keys.length - IMG_LIMIT).forEach(function (k) { c.delete(k); });
      }
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Posters / images (any origin): cache first, refresh in background
  if (req.destination === "image") {
    e.respondWith(
      caches.open(IMG_CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) {
            if (res && (res.ok || res.type === "opaque")) { c.put(req, res.clone()); trimImages(); }
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  // App files (same site): network first, cache when offline
  if (url.origin === self.location.origin && !/\.apk$/i.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          if (req.mode === "navigate") return caches.match("./index.html").then(function (h) { return h || caches.match("./"); });
        });
      })
    );
  }
});
