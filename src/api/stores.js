// Haversine（km）
const distKm = (a, b) => {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat/2)**2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// まず本番想定のエンドポイントを叩き、失敗したら mock にフォールバック
export async function fetchStores({ q = "", lat = null, lon = null, limit = 10 } = {}) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (lat != null && lon != null) { qs.set("lat", lat); qs.set("lon", lon); }
  if (limit) qs.set("limit", String(limit));

  // 1) 将来のFastAPI
  try {
    const res = await fetch(`/api/stores?${qs.toString()}`, { credentials: "include" });
    if (res.ok) {
      return await res.json(); // [{id, name, address, lat, lon, ...}]
    }
  } catch(_) { /* ignore */ }

  // 2) フォールバック：public/stores.mock.json
  const res2 = await fetch("/stores.mock.json");
  const all = await res2.json();

  let rows = all;
  if (q) {
    const qq = q.trim().toLowerCase();
    rows = rows.filter(d =>
      (d.name || "").toLowerCase().includes(qq) ||
      (d.address || "").toLowerCase().includes(qq) ||
      (d.genre || "").toLowerCase().includes(qq)
    );
  }

  if (lat != null && lon != null) {
    const me = { lat: Number(lat), lon: Number(lon) };
    rows = rows
      .map(d => ({ ...d, _dist: distKm(me, { lat: d.lat, lon: d.lon }) }))
      .sort((a,b) => a._dist - b._dist);
  }
  if (limit) rows = rows.slice(0, limit);
  return rows;
}

// お気に入り（DB未接続時は localStorage を擬似DBに）
const LS_KEY = "tm_fav_stores";

export function getFavoriteStores() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch(_){ return []; }
}
export function addFavoriteStore(store) {
  const cur = getFavoriteStores();
  if (!cur.find(s => s.id === store.id)) {
    localStorage.setItem(LS_KEY, JSON.stringify([...cur, store]));
  }
}
export function removeFavoriteStore(id) {
  const cur = getFavoriteStores().filter(s => s.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(cur));
}
