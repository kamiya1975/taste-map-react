// public/service-worker.js

const STATIC_CACHE = "tm-static-v2"; // version上げる（重要）
const STATIC_ASSETS = [
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key !== STATIC_CACHE ? caches.delete(key) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // GET以外は触らない
  if (request.method !== "GET") return;

  // 重要：別オリジンはSWで一切触らない（tdb-backend等）
  if (url.origin !== self.location.origin) return;

  // ナビゲーションは Network First
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        try {
          const networkResp = await fetch(request);
          cache.put("/index.html", networkResp.clone());
          return networkResp;
        } catch {
          return (await cache.match("/index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // 静的ファイルは Cache First
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      const networkResp = await fetch(request);
      cache.put(request, networkResp.clone());
      return networkResp;
    })()
  );
});
