// Storefront API でカートを生成し、メタ情報を付与して checkoutUrl を返す
import { getVariantGidByJan } from "./ecLinks";

const SF_ENDPOINT = `https://${process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN}/api/2025-01/graphql.json`;
const SF_TOKEN    = process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN;

// GID から数値ID抽出（必要なら）
export function extractNumericIdFromGid(gid) {
  if (!gid) return null;
  const m = String(gid).match(/ProductVariant\/(\d+)/);
  return m ? m[1] : null;
}

const CART_CREATE = `
mutation CartCreate($input: CartInput!) {
  cartCreate(input: $input) {
    cart {
      id
      checkoutUrl
    }
    userErrors { field message }
  }
}
`;

/**
 * items: [{ jan/jan_code/JAN, qty, properties?: {k:v}, noteLine?: string }]
 * meta:  { cartAttributes?: {k:v}, note?: string, discountCodes?: string[] }
 */
export async function createCartWithMeta(items = [], meta = {}) {
  if (!SF_TOKEN || !process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN) {
    throw new Error("Storefront API 環境変数が未設定です。");
  }

  // 1) JAN → Variant GID 解決
  const lines = [];
  for (const raw of items) {
    const jan = String(raw?.jan ?? raw?.jan_code ?? raw?.JAN ?? "").trim();
    const quantity = Math.max(1, Number(raw?.qty || raw?.quantity || 0));
    if (!jan || !quantity) continue;

    const gid = await getVariantGidByJan(jan); // 例: gid://shopify/ProductVariant/xxx
    if (!gid) continue;

    // line item properties（オーダーに残る）
    const attrs = [];
    const props = raw?.properties || {};
    // 必須で残したい標準セット
    if (jan) attrs.push({ key: "JAN", value: jan });
    for (const [k, v] of Object.entries(props)) {
      if (v != null) attrs.push({ key: String(k), value: String(v) });
    }

    lines.push({
      quantity,
      merchandiseId: gid,
      attributes: attrs, // ← ここが line item properties
    });
  }

  if (!lines.length) throw new Error("明細が解決できません（JAN→Variant対応を確認してください）。");

  // 2) cart attributes / note
  const cartAttributes = [];
  for (const [k, v] of Object.entries(meta?.cartAttributes || {})) {
    if (v != null) cartAttributes.push({ key: String(k), value: String(v) });
  }
  // デフォルトで最低限の識別
  cartAttributes.push({ key: "channel", value: "TasteMap" });
  cartAttributes.push({ key: "tm_version", value: (process.env.REACT_APP_TM_VERSION || "unknown") });

  const input = {
    lines,
    attributes: cartAttributes,          // ← カート全体の attributes
    note: meta?.note || "",              // ← 注文メモ
    // buyerIdentity, deliveryAddress なども必要に応じて
  };

  // 3) cartCreate
  const res = await fetch(SF_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SF_TOKEN,
    },
    body: JSON.stringify({ query: CART_CREATE, variables: { input } }),
  });

  const json = await res.json();
  const err = json?.errors?.[0]?.message;
  const uerr = json?.data?.cartCreate?.userErrors?.[0]?.message;
  if (err || uerr) throw new Error(err || uerr);

  let checkoutUrl = json?.data?.cartCreate?.cart?.checkoutUrl;

  // 4) ディスカウントコード（任意）：checkoutUrl へ追加
  const codes = meta?.discountCodes || [];
  if (checkoutUrl && codes.length) {
    const u = new URL(checkoutUrl);
    // 複数コード対応（最新APIでは cartDiscountCodesUpdate 推奨。簡易はクエリ付与）
    u.searchParams.set("discount", codes.join(","));
    checkoutUrl = u.toString();
  }

  return { checkoutUrl };
}
