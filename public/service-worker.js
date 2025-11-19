// -----------------------------
// TasteMap PWA: Custom Service Worker (Method A)
// -----------------------------

const STATIC_CACHE = "tm-static-v1";
const API_CACHE = "tm-api-cache-v1";

const STATIC_ASSETS = [
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install: 静的ファイルを少しだけ事前キャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: 古いキャッシュを掃除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== API_CACHE) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch: ここが「方法A」の肝
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // POST などは触らない
  if (request.method !== "GET") return;

  // 1) ナビゲーション（#map などページ本体）は Network First
  //    → 毎回ネットから新しい index.html を取りにいき、失敗したらキャッシュ版
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        try {
          const networkResp = await fetch(request);
          // 成功したら index.html として保存（常に最新になる）
          cache.put("/index.html", networkResp.clone());
          return networkResp;
        } catch (err) {
          const cached = await cache.match("/index.html");
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 2) /api/ 配下は Network First（常にサーバー優先）
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        try {
          const networkResp = await fetch(request);
          cache.put(request, networkResp.clone());
          return networkResp;
        } catch (err) {
          const cached = await cache.match(request);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 3) 画像・JS・CSS など静的ファイルは Cache First
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const networkResp = await fetch(request);
        cache.put(request, networkResp.clone());
        return networkResp;
      } catch (err) {
        return Response.error();
      }
    })()
  );
});
