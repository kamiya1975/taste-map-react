// public/service-worker.js
const STATIC_CACHE = "tm-static-v6"; // 必ず version を上げる（SW更新を確実に）
const STATIC_ASSETS = [
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// 更新ボタン用（環境やタイミングの差異を確実に切替るため）
self.addEventListener("message", (event) => {
  try {
    const msg = event?.data || {};
    if (msg?.type === "SKIP_WAITING") {
      self.skipWaiting();
    }
  } catch {}
});

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

  // ★最重要：API は SW でキャッシュしない（Network Only で明示的に返す）
  // “return;” だと状況次第で事故が残るので、必ず respondWith で握る
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
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
      // 失敗レスポンスや opaque はキャッシュしない（HTML混入事故の予防）
      if (networkResp && networkResp.ok && networkResp.type === "basic") {
        cache.put(request, networkResp.clone());
      }
      return networkResp;
    })()
  );
});
