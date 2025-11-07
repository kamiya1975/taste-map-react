let _cache = null;

// 手元で一時的に上書きしたいGID（任意）
const LOCAL_MAP = {
  // "4964044046324": "gid://shopify/ProductVariant/4964044046324",
};

// 全角→半角/空白・ハイフン除去/数字抽出/先頭ゼロ除去の候補を返す
function normalizeCandidates(jan) {
  const raw = String(jan ?? "");
  const half = raw.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  const trimmed = half.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  const noLeadingZeros = digits.replace(/^0+/, "");
  return Array.from(new Set([trimmed, digits, noLeadingZeros]));
}

async function loadEcLinks() {
  if (_cache) return _cache;
  const url = (process.env.PUBLIC_URL || "") + "/ec/ec_links.json"; // 例: /ec/ec_links.json
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`ec_links.json load failed: ${r.status} @ ${url}`);
    const json = await r.json();
    _cache = { ...json, ...LOCAL_MAP }; // JSON優先、最後に手元上書き
    console.log("[ec_links] loaded:", Object.keys(_cache).length, "items");
  } catch (e) {
    console.warn("[ec_links] load error, fallback to LOCAL_MAP only:", e?.message || e);
    _cache = { ...LOCAL_MAP };
  }
  return _cache;
}

export async function getVariantGidByJan(jan) {
  const map = await loadEcLinks();

  // 1) 直接一致 → 2) 正規化候補一致
  const candidates = normalizeCandidates(jan);
  for (const k of [String(jan), ...candidates]) {
    const v = map[k];
    if (typeof v === "string" && v.startsWith("gid://shopify/ProductVariant/")) {
      console.log("[ec_links] hit:", k);
      return v;
    }
  }

  // 3) 先頭ゼロ差を無視した“数字同値”の総当り（重いので最後）
  const targetDigits = (candidates[1] || "").replace(/^0+/, "");
  if (targetDigits) {
    for (const [k, v] of Object.entries(map)) {
      const kd = String(k)
        .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .trim().replace(/[^\d]/g, "").replace(/^0+/, "");
      if (kd && kd === targetDigits && typeof v === "string" && v.startsWith("gid://shopify/ProductVariant/")) {
        console.log("[ec_links] fuzzy hit:", k, "(digits =", kd, ")");
        return v;
      }
    }
  }

  console.warn("[ec_links] miss:", jan, "candidates:", candidates);
  return ""; // ← miss は空文字で返す（呼び出し側がローカルstaged運用に落とせる）
}
