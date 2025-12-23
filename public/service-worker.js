// public/service-worker.js
const STATIC_CACHE = "tm-static-v3"; // 必ず version を上げる
const STATIC_ASSETS = [
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) =>
          key !== STATIC_CACHE ? caches.delete(key) : null
        )
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // GET以外は無視
  if (request.method !== "GET") return;

  // ★ 別オリジンは無視
  if (url.origin !== self.location.origin) return;

  // ★ API / JSON 系は絶対に触らない
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/ratings") ||
    url.pathname.startsWith("/points") ||
    request.headers.get("accept")?.includes("application/json")
  ) {
    return;
  }

  // ナビゲーション（SPA遷移）は Network First
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        try {
          const networkResp = await fetch(request);
          if (networkResp.ok) {
            cache.put("/index.html", networkResp.clone());
          }
          return networkResp;
        } catch {
          return (await cache.match("/index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // 静的ファイルのみ Cache First
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      const networkResp = await fetch(request);
      if (networkResp.ok) {
        cache.put(request, networkResp.clone());
      }
      return networkResp;
    })()
  );
});
