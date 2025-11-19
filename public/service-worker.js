// -----------------------------
// TasteMap PWA: Custom Service Worker
// -----------------------------

const CACHE_NAME = "tm-static-v1";
const API_CACHE = "tm-api-cache-v1";

// === キャッシュしたい静的ファイル（自由拡張可） ===
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json"
];

// Install: 静的ファイルをキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: 古いキャッシュを削除
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

// -----------------------------
// ★ 最重要：API は NetworkFirst（再発防止）
// -----------------------------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API は常にサーバ優先
  if (url.pathname.startsWith("/api/")) {
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

  // 静的ファイルは CacheFirst（PWAの基本）
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
