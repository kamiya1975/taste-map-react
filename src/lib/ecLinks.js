// src/lib/ecLinks.js — 完全差し替え版
let _cache = null;

// 手元で一時的に上書きしたい GID（任意：開発時の緊急パッチ用）
const LOCAL_MAP = {
  "4964044046324": "gid://shopify/ProductVariant/＜42216946794558＞",
};

// CRA/Vite 両対応のパブリックパス
const EC_LINKS_URL = (process.env.PUBLIC_URL || "") + "/ec/ec_links.json";

// 値を必ず GID 形式へ（数値だけでもOKにする）
function asGid(val) {
  if (!val) return "";
  const s = String(val).trim();
  if (s.startsWith("gid://shopify/ProductVariant/")) return s;
  if (/^\d+$/.test(s)) return `gid://shopify/ProductVariant/${s}`;
  return "";
}

// 全角→半角/空白・ハイフン除去/数字抽出/先頭ゼロ除去の候補を返す
function normalizeCandidates(jan) {
  const raw = String(jan ?? "");
  const half = raw.replace(/[０-９]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
  const trimmed = half.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  const noLeadingZeros = digits.replace(/^0+/, "");
  // 例: "0496-4044-046324" -> ["0496-4044-046324","04964044046324","4964044046324"]
  return Array.from(new Set([trimmed, digits, noLeadingZeros]));
}

async function loadEcLinks() {
  if (_cache) return _cache;

  try {
    const r = await fetch(EC_LINKS_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();

    // 値をすべて GID 形式に正規化、LOCAL_MAP を最後に上書き統合
    const normalized = {};
    for (const [k, v] of Object.entries(json || {})) {
      const gid = asGid(v);
      if (gid) normalized[String(k).trim()] = gid;
    }
    for (const [k, v] of Object.entries(LOCAL_MAP)) {
      const gid = asGid(v);
      if (gid) normalized[String(k).trim()] = gid;
    }
    _cache = normalized;
    if (process.env.NODE_ENV !== "production") {
      console.debug("[ec_links] loaded:", Object.keys(_cache).length, "items");
    }
  } catch (e) {
    console.warn("[ec_links] load error, fallback to LOCAL_MAP only:", e?.message || e);
    // LOCAL_MAP だけでも動くように
    const normalized = {};
    for (const [k, v] of Object.entries(LOCAL_MAP)) {
      const gid = asGid(v);
      if (gid) normalized[String(k).trim()] = gid;
    }
    _cache = normalized;
  }
  return _cache;
}

/**
 * JAN -> ProductVariant GID を返す（なければ ""）
 * - 直接一致
 * - 正規化候補一致（全角/ハイフン除去/先頭ゼロ除去）
 * - 最後に “数字同値” の総当り（遅いので最終手段）
 */
export async function getVariantGidByJan(jan) {
  const map = await loadEcLinks();
  const candidates = normalizeCandidates(jan);

  // 1) 直接一致（先に完全一致を試す）
  for (const k of [String(jan), ...candidates]) {
    const hit = map[k];
    if (hit) {
      if (process.env.NODE_ENV !== "production") console.debug("[ec_links] hit:", k);
      return hit;
    }
  }

  // 2) 数字同値（先頭ゼロ無視、非数字除去）でのファジー一致
  const targetDigits = (candidates[1] || "").replace(/^0+/, ""); // digits
  if (targetDigits) {
    for (const [k, v] of Object.entries(map)) {
      const kd = String(k)
        .replace(/[０-９]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0))
        .trim()
        .replace(/[^\d]/g, "")
        .replace(/^0+/, "");
      if (kd && kd === targetDigits && v) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[ec_links] fuzzy hit:", k, "(digits =", kd, ")");
        }
        return v;
      }
    }
  }

  console.warn("[ec_links] miss:", jan, "candidates:", candidates);
  return ""; // 見つからない場合は空文字（呼び出し側でローカル運用にフォールバック）
}

// 任意：先読みしたい場面用
export async function ensureEcLinksLoaded() {
  await loadEcLinks();
}
