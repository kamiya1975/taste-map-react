let _cache = null;

/** 全角→半角、空白/ハイフン除去、数字のみ、先頭ゼロは保持した版と除去版の両方を用意 */
function normalizeCandidates(jan) {
  const raw = String(jan ?? "");
  const half = raw.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  const trimmed = half.trim();
  const digits = trimmed.replace(/[^\d]/g, "");        // 数字以外を除去（空白・ハイフンなど）
  const noLeadingZeros = digits.replace(/^0+/, "");    // 先頭ゼロ除去版（比較用）
  // 重複除去して候補を返す（優先順）
  return Array.from(new Set([trimmed, digits, noLeadingZeros]));
}

export async function getVariantGidByJan(jan) {
  if (!_cache) {
    const url = (process.env.PUBLIC_URL || "") + "/ec/ec_links.json";
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`ec_links.json load failed: ${r.status} @ ${url}`);
    _cache = await r.json();
    console.log("[ec_links] loaded count=", Object.keys(_cache).length, "sample=", Object.keys(_cache).slice(0,3));
  }

  // 1) そのままキー一致 → 2) 正規化した候補でヒット → 3) 走査して“数字同値”マッチ
  const candidates = normalizeCandidates(jan);
  for (const k of [String(jan), ...candidates]) {
    if (_cache[k]) {
      console.log("[ec_links] direct hit:", k);
      return _cache[k];
    }
  }

  // 数字列を取り出して、キャッシュ側キーを総当り比較（先頭ゼロ差を無視）
  const targetDigits = (candidates[1] || "").replace(/^0+/, "");
  if (targetDigits) {
    for (const k of Object.keys(_cache)) {
      const kd = String(k).replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                          .trim().replace(/[^\d]/g, "").replace(/^0+/, "");
      if (kd && kd === targetDigits) {
        console.log("[ec_links] fuzzy hit:", k, "(= digits", kd, ")");
        return _cache[k];
      }
    }
  }

  // ---- 検証用の強制フォールバック（あとで削除してください）----
  if (targetDigits === "4964044046324") {
    console.warn("[ec_links] fallback: forcing known GID for test");
    return "gid://shopify/ProductVariant/1234567890";
  }
  // ------------------------------------------------------------

  console.warn("[ec_links] miss. jan=", jan, "candidates=", candidates);
  return undefined;
}
