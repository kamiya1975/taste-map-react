// src/lib/ecLinks.js
// ec_links API を読む
let _cache = null;
let _etag = null;

const API_BASE = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE || "";
const EC_LINKS_URL = `${API_BASE}/api/app/ec-links`;

function toDigits(s) {
  const raw = String(s ?? "");
  const half = raw.replace(/[０-９]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
  return half.trim().replace(/[^\d]/g, "");
}

async function loadEcLinks() {
  if (_cache) return _cache;

  try {
    const headers = {};
    if (_etag) headers["If-None-Match"] = _etag;

    const r = await fetch(EC_LINKS_URL, { cache: "no-store", headers });
    if (r.status === 304 && _cache) return _cache;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    _etag = r.headers.get("ETag") || _etag;

    const json = await r.json();
    // ★ここ修正（レスポンスは {links,count,updated_at}）
    _cache = (json && typeof json === "object" && json.links) ? json.links : {};

    if (process.env.NODE_ENV !== "production") {
      console.debug("[ec_links] loaded:", Object.keys(_cache).length, "items");
    }
  } catch (e) {
    console.warn("[ec_links] load error:", e?.message || e);
    _cache = _cache || {};
  }
  return _cache;
}

export async function getVariantGidByJan(jan) {
  const map = await loadEcLinks();
  const key = toDigits(jan);
  const hit = key ? map[key] : "";
  if (!hit && process.env.NODE_ENV !== "production") {
    console.warn("[ec_links] miss:", jan, "key:", key);
  }
  return hit || "";
}

export async function ensureEcLinksLoaded() {
  await loadEcLinks();
}
