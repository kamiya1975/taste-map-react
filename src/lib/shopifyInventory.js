// src/lib/shopifyInventory.js
import { getVariantGidByJan } from "./ecLinks";

const SHOP_DOMAIN = process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN;
const SF_TOKEN    = process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN;
const SF_ENDPOINT = SHOP_DOMAIN ? `https://${SHOP_DOMAIN}/api/2025-01/graphql.json` : "";

// 50個/回 くらいで十分（Storefront API の nodes() はまとめ取得が速い）
const BATCH = 50;

const NODES_QUERY = `
  query VariantNodes($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        sku
        availableForSale
        quantityAvailable
        currentlyNotInStock
        selectedOptions { name value }
        product { id title handle }
      }
      # null になる可能性に備えて id だけ拾っておく
      id
    }
  }
`;

/**
 * items: [{ jan, qty }]
 * return: {
 *   byJan: {
 *     "4964044046324": { gid, availableForSale, quantityAvailable, currentlyNotInStock }
 *   },
 *   unresolved: ["JAN..."],   // GIDに解決できなかったJAN
 *   apiErrors: [ "..." ]       // Storefrontのerrors
 * }
 */
export async function checkAvailabilityByJan(items = []) {
  if (!SHOP_DOMAIN || !SF_TOKEN) {
    throw new Error("Shopify接続設定が未設定です（REACT_APP_SHOPIFY_* を確認）");
  }

  // 1) JAN → GID
  const jans = [];
  const janToGid = {};
  const unresolved = [];

  for (const it of (Array.isArray(items) ? items : [])) {
    const jan = String(it?.jan ?? it?.jan_code ?? it?.JAN ?? "").trim();
    if (!jan) continue;
    jans.push(jan);
    const gid = await getVariantGidByJan(jan);
    if (gid) janToGid[jan] = gid;
    else unresolved.push(jan);
  }

  const gids = Object.values(janToGid);
  const byGid = {};
  const apiErrors = [];

  // 2) GID で nodes() 一括取得（分割して叩く）
  for (let i = 0; i < gids.length; i += BATCH) {
    const slice = gids.slice(i, i + BATCH);
    const res = await fetch(`${SF_ENDPOINT}?_=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SF_TOKEN,
      },
      body: JSON.stringify({ query: NODES_QUERY, variables: { ids: slice } }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      apiErrors.push(`HTTP ${res.status} ${res.statusText} ${t?.slice(0,200)}`);
      continue;
    }

    const json = await res.json();
    if (Array.isArray(json?.errors) && json.errors.length) {
      apiErrors.push(...json.errors.map(e => e?.message || String(e)));
    }

    for (const node of json?.data?.nodes || []) {
      if (!node) continue;
      // node が null のケースもあるので id でだけひもづけ
      if (node.id) {
        byGid[node.id] = {
          gid: node.id,
          availableForSale: !!node.availableForSale,
          // quantityAvailable は権限や設定により null のことがある
          quantityAvailable: (typeof node.quantityAvailable === "number" ? node.quantityAvailable : null),
          currentlyNotInStock: !!node.currentlyNotInStock,
        };
      }
    }
  }

  // 3) JAN キーに戻す
  const byJan = {};
  for (const jan of jans) {
    const gid = janToGid[jan];
    if (!gid) continue;
    byJan[jan] = byGid[gid] || { gid, availableForSale: false, quantityAvailable: null, currentlyNotInStock: true };
  }

  return { byJan, unresolved, apiErrors };
}
