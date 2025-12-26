// src/cart/buildCartUrl.js
// Shopify の /cart パーマリンクを生成する（JAN → Variant 解決つき）
// 使い方: const url = await buildCartUrl(items, { shopDomain, returnTo, extraQuery });

import { getVariantGidByJan } from "../lib/ecLinks";

// gid://shopify/ProductVariant/1234567890 → "1234567890"
function extractNumericIdFromGid(gid) {
  if (!gid) return null;
  const m = String(gid).match(/ProductVariant\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * @param {Array<{jan?:string, jan_code?:string, JAN?:string, qty?:number, quantity?:number}>} items
 * @param {{shopDomain?:string, returnTo?:string, extraQuery?:Record<string,string>}} opts
 * @returns {Promise<string>} 例: https://xxx.myshopify.com/cart/123:2,456:1?return_to=...
 */
export async function buildCartUrl(items = [], opts = {}) {
  const shopDomain =
    opts.shopDomain ||
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SHOPIFY_SHOP_DOMAIN) ||
    process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN ||
    process.env.SHOPIFY_SHOP_DOMAIN ||
    "";

  if (!shopDomain) {
    throw new Error("Shopify shop domain is not configured (SHOP_DOMAIN).");
  }

  // 1) JAN → variant numeric id の配列に変換
  const pairs = [];
  const arr = Array.isArray(items) ? items : [];
  for (const it of arr) {
    const jan =
      String(it?.jan ?? it?.jan_code ?? it?.JAN ?? "").trim();
    const qty = Math.max(1, Number(it?.qty ?? it?.quantity ?? 0));
    if (!jan || !qty) continue;

    const gid = await getVariantGidByJan(jan); // 例: gid://shopify/ProductVariant/123...
    const vid = extractNumericIdFromGid(gid);
    if (!vid) continue;

    pairs.push(`${vid}:${qty}`);
  }

  if (!pairs.length) {
    throw new Error("No purchasable lines were resolved from cart.");
  }

  // 2) /cart/{id:qty,id:qty,...}
  let url = `https://${shopDomain}/cart/${pairs.join(",")}`;

  // 3) 任意のクエリ（return_to 等）
  const q = new URLSearchParams();
  if (opts.returnTo) q.set("return_to", opts.returnTo);
  // 運用上の識別に便利なタグ
  q.set("channel", "tastemap");
  q.set("locale", "ja");

  for (const [k, v] of Object.entries(opts.extraQuery || {})) {
    if (v != null) q.set(k, String(v));
  }

  const qs = q.toString();
  if (qs) url += `?${qs}`;

  return url;
}
