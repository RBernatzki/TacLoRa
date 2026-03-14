const CACHE = "taclora-v1";
const ASSETS = ["/taclora-app/", "/taclora-app/index.html", "/taclora-app/app.jsx"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener("fetch", e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
