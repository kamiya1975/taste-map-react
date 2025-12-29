// src/lib/shopifyCart.js
// 決済（checkoutUrl生成）

import { getVariantGidByJan } from "./ecLinks";

const SHOP_DOMAIN = process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN;
const SF_TOKEN    = process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN;
const SF_ENDPOINT = SHOP_DOMAIN ? `https://${SHOP_DOMAIN}/api/2025-01/graphql.json` : "";

// --- GIDの正規化（数字のみ/余計な記号/空白を許容して整える） ---
function normalizeVariantGid(input) {
  let s = String(input ?? "").trim();

  // 角カッコや全角スペースを含む余計なものを除去
  s = s.replace(/[\u3000\s]/g, "");

  // 純数字なら GID を組み立て
  if (/^\d+$/.test(s)) {
    return `gid://shopify/ProductVariant/${s}`;
  }

  // 既に正しい形式ならそのまま
  if (s.startsWith("gid://shopify/ProductVariant/")) {
    return s;
  }

  // ここに来たら不正
  throw new Error(`Invalid variant gid: ${input}`);
}

const CART_CREATE = `
mutation CartCreate($input: CartInput!) {
  cartCreate(input: $input) {
    cart { id checkoutUrl }
    userErrors { field message }
  }
}
`;

export async function createCartWithMeta(items = [], meta = {}) {
  // --- ENVチェック（明確なエラーメッセージ） ---
  if (!SHOP_DOMAIN) throw new Error("ENV: SHOP DOMAIN missing (REACT_APP_SHOPIFY_SHOP_DOMAIN)");
  if (!SF_TOKEN)    throw new Error("ENV: STOREFRONT TOKEN missing (REACT_APP_SHOPIFY_STOREFRONT_TOKEN)");

  const lines = [];
  const unresolved = [];

  // --- 明細をJAN→Variant GIDに解決 ---
  for (const raw of (Array.isArray(items) ? items : [])) {
    const jan = String(raw?.jan ?? raw?.jan_code ?? raw?.JAN ?? "").trim();
    const quantity = Math.max(1, Number(raw?.qty || raw?.quantity || 0));
    if (!jan || !quantity) continue;

    // ecLinks から GID 取得（ローカルマップ/JSON/正規化あり）
    const gid = await getVariantGidByJan(jan);

    if (!gid) {
      unresolved.push(jan);
      continue;
    }

    // ←★ここが肝：取得した値を必ず正規化してから投入
    let merchandiseId;
    try {
      merchandiseId = normalizeVariantGid(gid);
    } catch (e) {
      console.warn("[cart] bad gid from ecLinks:", gid, "err:", e?.message);
      unresolved.push(jan);
      continue;
    }

    const attrs = [{ key: "JAN", value: jan }];
    for (const [k, v] of Object.entries(raw?.properties || {})) {
      if (v != null) attrs.push({ key: String(k), value: String(v) });
    }

    lines.push({ quantity, merchandiseId, attributes: attrs });
  }

  if (!lines.length) {
    const msg = unresolved.length
      ? `JAN→Variant 未解決: ${unresolved.join(", ")}`
      : "明細が空です";
    throw new Error(msg);
  }

  // --- カート属性の構築 ---
  const cartAttributes = [];
  const seen = new Set();
  const pushAttr = (k, v) => {
    const key = String(k);
    const val = v == null ? "" : String(v);
    if (!key || seen.has(key)) return;
    seen.add(key);
    cartAttributes.push({ key, value: val });
  };

  for (const [k, v] of Object.entries(meta?.cartAttributes || {})) {
    // 空文字でも Shopify には入るが、バックは "" を無視する設計なのでOK
    pushAttr(k, v);
  }
  pushAttr("channel", "TasteMap");
  // tm_version は meta 側に正があるので、ここでは追加しない（重複排除）

  const input = { lines, attributes: cartAttributes, note: meta?.note || "" };

  // --- Storefront API 呼び出し ---
  const res = await fetch(SF_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SF_TOKEN,
    },
    body: JSON.stringify({ query: CART_CREATE, variables: { input } }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Storefront HTTP ${res.status} ${res.statusText} ${txt?.slice(0,200)}`);
  }

  const json = await res.json();
  const apiErr  = json?.errors?.[0]?.message;
  const userErr = json?.data?.cartCreate?.userErrors?.[0]?.message;
  if (apiErr || userErr) {
    throw new Error(`Storefront error: ${apiErr || userErr}`);
  }

  let checkoutUrl = json?.data?.cartCreate?.cart?.checkoutUrl || "";

  // --- ディスカウントコード（任意） ---
  const codes = meta?.discountCodes || [];
  if (checkoutUrl && codes.length) {
    const u = new URL(checkoutUrl);
    u.searchParams.set("discount", codes.join(","));
    checkoutUrl = u.toString();
  }

  return { checkoutUrl, unresolved };
}
