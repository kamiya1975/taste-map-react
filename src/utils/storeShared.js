// src/utils/storeShared.js
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export async function resolveLocation() {
  const geo = await new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
  return geo || { lat: 35.681236, lon: 139.767125 }; // 東京駅
}

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function normalizeStore(s, i = 0) {
  const lat = toNum(s.lat) ?? toNum(s.latitude);
  const lng = toNum(s.lng) ?? toNum(s.lon) ?? toNum(s.longitude);
  return {
    ...s,
    lat,
    lng,
    _key: `${s.name || ""}@@${s.branch || ""}@@${i}`,
  };
}

export async function loadAndSortStoresByDistance() {
  const loc = await resolveLocation();
  const url = `${process.env.PUBLIC_URL || ""}/stores.mock.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("stores.mock.json が見つかりません");
  const raw = await res.json();
  const enriched = (Array.isArray(raw) ? raw : []).map((s, i) => {
    const st = normalizeStore(s, i);
    const distance =
      st.lat !== undefined && st.lng !== undefined
        ? haversineKm(loc.lat, loc.lon, st.lat, st.lng)
        : Infinity;
    return { ...st, distance };
  });
  enriched.sort((a, b) => a.distance - b.distance);
  try {
    localStorage.setItem("allStores", JSON.stringify(enriched));
  } catch {}
  return enriched;
}

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("favoriteStores") || "[]");
  } catch {
    return [];
  }
}

export function setFavorites(list) {
  try {
    localStorage.setItem("favoriteStores", JSON.stringify(list));
  } catch {}
}

export function isSameStore(a, b) {
  const k = (s) => `${s?.name || ""}@@${s?.branch || ""}`;
  return k(a) === k(b);
}
