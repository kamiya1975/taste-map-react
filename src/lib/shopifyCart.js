import { getVariantGidByJan } from "./ecLinks";

const SHOP_DOMAIN = process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN;
const SF_TOKEN    = process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN;
const SF_ENDPOINT = SHOP_DOMAIN ? `https://${SHOP_DOMAIN}/api/2025-01/graphql.json` : "";

const CART_CREATE = `
mutation CartCreate($input: CartInput!) {
  cartCreate(input: $input) {
    cart { id checkoutUrl }
    userErrors { field message }
  }
}
`;

export async function createCartWithMeta(items = [], meta = {}) {
  // --- 明確な原因表示 ---
  if (!SHOP_DOMAIN) throw new Error("ENV: SHOP DOMAIN missing (REACT_APP_SHOPIFY_SHOP_DOMAIN)");
  if (!SF_TOKEN)    throw new Error("ENV: STOREFRONT TOKEN missing (REACT_APP_SHOPIFY_STOREFRONT_TOKEN)");

  const lines = [];
  const unresolved = [];

  for (const raw of (Array.isArray(items) ? items : [])) {
    const jan = String(raw?.jan ?? raw?.jan_code ?? raw?.JAN ?? "").trim();
    const quantity = Math.max(1, Number(raw?.qty || raw?.quantity || 0));
    if (!jan || !quantity) continue;

    const gid = await getVariantGidByJan(jan);      // ← ここが null のことが多い
    if (!gid) { unresolved.push(jan); continue; }

    const attrs = [{ key: "JAN", value: jan }];
    for (const [k, v] of Object.entries(raw?.properties || {})) {
      if (v != null) attrs.push({ key: String(k), value: String(v) });
    }

    lines.push({ quantity, merchandiseId: gid, attributes: attrs });
  }

  if (!lines.length) {
    const msg = unresolved.length
      ? `JAN→Variant 未解決: ${unresolved.join(", ")}`
      : "明細が空です";
    throw new Error(msg);
  }

  const cartAttributes = [];
  for (const [k, v] of Object.entries(meta?.cartAttributes || {})) {
    if (v != null) cartAttributes.push({ key: String(k), value: String(v) });
  }
  cartAttributes.push({ key: "channel", value: "TasteMap" });
  cartAttributes.push({ key: "tm_version", value: process.env.REACT_APP_TM_VERSION || "unknown" });

  const input = { lines, attributes: cartAttributes, note: meta?.note || "" };

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
  const apiErr = json?.errors?.[0]?.message;
  const userErr = json?.data?.cartCreate?.userErrors?.[0]?.message;
  if (apiErr || userErr) {
    throw new Error(`Storefront error: ${apiErr || userErr}`);
  }

  let checkoutUrl = json?.data?.cartCreate?.cart?.checkoutUrl || "";

  // 任意: ディスカウント簡易付与
  const codes = meta?.discountCodes || [];
  if (checkoutUrl && codes.length) {
    const u = new URL(checkoutUrl);
    u.searchParams.set("discount", codes.join(","));
    checkoutUrl = u.toString();
  }

  return { checkoutUrl, unresolved };
}
