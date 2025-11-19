// public/service-worker.js

const CACHE_NAME = "tm-static-v2";
const API_CACHE = "tm-api-cache-v1";

const STATIC_ASSETS = ["/", "/index.html", "/manifest.json"];

// install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== API_CACHE) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// fetch
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 🔹 API は GET だけ NetworkFirst
  if (url.pathname.startsWith("/api/") && event.request.method === "GET") {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(event.request);
          const cache = await caches.open(API_CACHE);
          cache.put(event.request, network.clone());
          return network;
        } catch (err) {
          const cache = await caches.open(API_CACHE);
          const cached = await cache.match(event.request);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 🔹 静的ファイルは CacheFirst
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
