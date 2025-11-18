// src/utils/lot.js
const LS_KEY = "tm_reference_lot_id";
const DEFAULT_LOT_ID = "rw1_2025_11";   // ★ 初回ロット

function detectLotFromUrl() {
  // ① ?lot=... が付いていれば最優先（保険として残す）
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = params.get("lot");
    if (fromQuery) return fromQuery;
  } catch {
    // 無視
  }

  // ② パス /tm/rw1_2026_08 の最後の部分を lot とみなす
  try {
    const path = window.location.pathname || "";
    const segments = path.split("/").filter(Boolean); // ["tm", "rw1_2026_08"]
    const last = segments[segments.length - 1] || "";

    // rw1_2025_11 みたいな形式だけを lot とみなす
    if (/^rw\d+_\d{4}_\d{2}$/.test(last)) {
      return last;
    }
  } catch {
    // 無視
  }

  return null;
}

// 起動時に URL → localStorage へ反映する
export function initLotIdFromUrl() {
  let current = DEFAULT_LOT_ID;

  try {
    const fromUrl = detectLotFromUrl();
    const stored = window.localStorage.getItem(LS_KEY);

    if (fromUrl) {
      current = fromUrl;
      window.localStorage.setItem(LS_KEY, current);
    } else if (stored) {
      current = stored;
    } else {
      window.localStorage.setItem(LS_KEY, current);
    }
  } catch (e) {
    console.warn("[lot] initLotIdFromUrl failed", e);
  }

  return current;
}

export function getLotId() {
  try {
    return window.localStorage.getItem(LS_KEY) || DEFAULT_LOT_ID;
  } catch {
    return DEFAULT_LOT_ID;
  }
}
