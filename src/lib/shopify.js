// src/lib/shopify.js
// 現状の構成だと不要（削除候補）
const SHOP = (process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN || "").replace(/^https?:\/\//, "");
const TOKEN = process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN;
const EP = `https://${SHOP}/api/2025-01/graphql.json`;

export async function storefrontGraphQL(query, variables = {}) {
  console.log("[Shopify] SHOP=", SHOP, "EP=", EP, "TOKEN_LEN=", (TOKEN||"").length);
  if (!SHOP || !TOKEN) {
    throw new Error(`ENV missing: SHOP='${SHOP}' TOKEN_LEN=${(TOKEN||"").length}`);
  }
  const r = await fetch(EP, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  const data = await r.json();
  if (data.errors) throw new Error(`Storefront errors: ${JSON.stringify(data.errors)}`);
  return data.data;
}

export async function createCart(variantGid, qty = 1, attrs = { source: "TasteMap-FrontTest" }) {
  const q = `
    mutation CreateCart($lines: [CartLineInput!], $attrs: [AttributeInput!]) {
      cartCreate(input:{lines:$lines, attributes:$attrs}) {
        cart { id checkoutUrl }
        userErrors { field message }
      }
    }`;
  const variables = {
    lines: [{ merchandiseId: variantGid, quantity: Number(qty) || 1 }],
    attrs: Object.entries(attrs || {}).map(([k, v]) => ({ key: k, value: String(v) })),
  };
  const data = await storefrontGraphQL(q, variables);
  const errs = data.cartCreate.userErrors || [];
  if (errs.length) throw new Error(`cartCreate userErrors: ${JSON.stringify(errs)}`);
  return data.cartCreate.cart; // { id, checkoutUrl }
}
