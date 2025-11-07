// src/components/panels/CartContext.jsx
// ------------------------------------------------------------
// TasteMap 専用：カート（Shopify Storefront API と連動）
// - ローカルに cartId を保存し、起動時に復元
// - JAN → Variant GID 変換して追加（ecLinks.json 経由）
// - 主要操作：addByJan / addByVariantId / updateQty / removeLine / reload
// - 依存：src/lib/ecLinks.js の getVariantGidByJan
// ------------------------------------------------------------
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getVariantGidByJan } from "../../lib/ecLinks";

const CART_ID_KEY = "tm_cart_id";
const SHOP_DOMAIN = (process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN || "").trim();         // 例: "tastemap"
const TOKEN       = (process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN || "").trim();   // Storefront API token
const API_VER     = "2025-01";
const EP = SHOP_DOMAIN ? `https://${SHOP_DOMAIN}.myshopify.com/api/${API_VER}/graphql.json` : "";

// ---- GraphQL ヘルパ ----------------------------------------------------------
async function shopifyFetchGQL(query, variables = {}) {
  if (!EP || !TOKEN) {
    const err = new Error("[CartContext] Shopify 環境変数が未設定です（REACT_APP_SHOPIFY_*）");
    err.code = "ENV_MISSING";
    throw err;
  }
  const res = await fetch(EP, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    const e = new Error(json.errors.map(e => e.message).join(" / "));
    e.raw = json.errors;
    throw e;
  }
  return json.data;
}

// ---- GQL 文 ----------------------------------------------------------
const GQL_CART_FRAGMENT = `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    cost { subtotalAmount { amount currencyCode } }
    lines(first: 100) {
      edges {
        node {
          id
          quantity
          cost { totalAmount { amount currencyCode } }
          merchandise {
            __typename
            ... on ProductVariant {
              id
              title
              sku
              product { title handle }
            }
          }
        }
      }
    }
  }
`;

const GQL_CART_QUERY = `
  ${GQL_CART_FRAGMENT}
  query GetCart($id: ID!) {
    cart(id: $id) { ...CartFields }
  }
`;

const GQL_CART_CREATE = `
  ${GQL_CART_FRAGMENT}
  mutation CreateCart($input: CartInput) {
    cartCreate(input: $input) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

const GQL_CART_ADD = `
  ${GQL_CART_FRAGMENT}
  mutation AddLines($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

const GQL_CART_UPDATE = `
  ${GQL_CART_FRAGMENT}
  mutation UpdateLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

const GQL_CART_REMOVE = `
  ${GQL_CART_FRAGMENT}
  mutation RemoveLines($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

// ---- 型薄い整形 ----------------------------------------------------------
function normalizeCart(raw) {
  if (!raw) return null;
  const edges = raw.lines?.edges || [];
  const lines = edges.map(e => {
    const n = e.node || {};
    const md = n.merchandise || {};
    const v = md?.__typename === "ProductVariant" ? md : {};
    return {
      id: n.id,
      quantity: Number(n.quantity || 0),
      merchandiseId: v.id || "",
      title: v.title || v?.product?.title || "",
      sku: v.sku || "",
      productTitle: v?.product?.title || "",
      productHandle: v?.product?.handle || "",
      lineAmount: Number(n.cost?.totalAmount?.amount || 0),
      currency: n.cost?.totalAmount?.currencyCode || raw.cost?.subtotalAmount?.currencyCode || "JPY",
    };
  });
  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    totalQuantity: Number(raw.totalQuantity || 0),
    subtotal: Number(raw.cost?.subtotalAmount?.amount || 0),
    currency: raw.cost?.subtotalAmount?.currencyCode || "JPY",
    lines,
  };
}

// ---- Context ----------------------------------------------------------
const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(null);
  const [cartId, setCartId] = useState(() => {
    try { return localStorage.getItem(CART_ID_KEY) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const creatingRef = useRef(false);

  const setCartAndId = useCallback((c) => {
    setCart(c);
    if (c?.id) {
      setCartId(c.id);
      try { localStorage.setItem(CART_ID_KEY, c.id); } catch {}
    }
  }, []);

  // ---- カート取得 or 新規作成 -------------------------------------------
  const createCartIfNeeded = useCallback(async () => {
    if (creatingRef.current) return cart;
    if (cart) return cart;

    creatingRef.current = true;
    setLoading(true);
    setError("");

    try {
      if (cartId) {
        const data = await shopifyFetchGQL(GQL_CART_QUERY, { id: cartId });
        if (data?.cart) {
          const nc = normalizeCart(data.cart);
          setCartAndId(nc);
          creatingRef.current = false;
          setLoading(false);
          return nc;
        }
        // cartId が無効なら捨てて作り直す
        try { localStorage.removeItem(CART_ID_KEY); } catch {}
      }

      const data = await shopifyFetchGQL(GQL_CART_CREATE, { input: {} });
      const c = data?.cartCreate?.cart;
      const errs = data?.cartCreate?.userErrors || [];
      if (!c || errs.length) {
        throw new Error(`cartCreate error: ${errs.map(e => e.message).join(" / ") || "unknown"}`);
      }
      const nc = normalizeCart(c);
      setCartAndId(nc);
      creatingRef.current = false;
      setLoading(false);
      return nc;
    } catch (e) {
      creatingRef.current = false;
      setLoading(false);
      setError(e?.message || String(e));
      throw e;
    }
  }, [cart, cartId, setCartAndId]);

  // ---- 既存 cartId を持っている場合はロード ------------------------------
  const reload = useCallback(async () => {
    if (!cartId) return await createCartIfNeeded();
    setLoading(true);
    setError("");
    try {
      const data = await shopifyFetchGQL(GQL_CART_QUERY, { id: cartId });
      const nc = normalizeCart(data?.cart || null);
      setCartAndId(nc);
      setLoading(false);
      return nc;
    } catch (e) {
      setLoading(false);
      setError(e?.message || String(e));
      throw e;
    }
  }, [cartId, createCartIfNeeded, setCartAndId]);

  useEffect(() => {
    // 起動時の軽いウォーム
    if (!cart && (SHOP_DOMAIN && TOKEN)) {
      createCartIfNeeded().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 追加（Variant GID 直指定） ----------------------------------------
  const addByVariantId = useCallback(async (variantGid, quantity = 1) => {
    if (!variantGid) throw new Error("variantId is empty");
    const c = await createCartIfNeeded();
    setLoading(true);
    setError("");
    try {
      const data = await shopifyFetchGQL(GQL_CART_ADD, {
        cartId: c.id,
        lines: [{ merchandiseId: variantGid, quantity: Number(quantity || 1) }],
      });
      const errs = data?.cartLinesAdd?.userErrors || [];
      if (errs.length) throw new Error(errs.map(e => e.message).join(" / "));
      const nc = normalizeCart(data?.cartLinesAdd?.cart || null);
      setCartAndId(nc);
      setLoading(false);
      return nc;
    } catch (e) {
      setLoading(false);
      setError(e?.message || String(e));
      throw e;
    }
  }, [createCartIfNeeded, setCartAndId]);

  // ---- 追加（JAN 指定 → ec_links.json で解決） --------------------------
  const addByJan = useCallback(async (jan, quantity = 1) => {
    const gid = await getVariantGidByJan(String(jan));
    if (!gid) {
      const e = new Error(`EC対象外（variant未登録）: ${jan}`);
      e.code = "NO_VARIANT";
      throw e;
    }
    return addByVariantId(gid, quantity);
  }, [addByVariantId]);

  // ---- 数量更新 ----------------------------------------------------------
  const updateQty = useCallback(async (lineId, quantity) => {
    if (!cartId) await createCartIfNeeded();
    setLoading(true);
    setError("");
    try {
      const data = await shopifyFetchGQL(GQL_CART_UPDATE, {
        cartId: cartId || (await createCartIfNeeded()).id,
        lines: [{ id: lineId, quantity: Number(quantity) }],
      });
      const errs = data?.cartLinesUpdate?.userErrors || [];
      if (errs.length) throw new Error(errs.map(e => e.message).join(" / "));
      const nc = normalizeCart(data?.cartLinesUpdate?.cart || null);
      setCartAndId(nc);
      setLoading(false);
      return nc;
    } catch (e) {
      setLoading(false);
      setError(e?.message || String(e));
      throw e;
    }
  }, [cartId, createCartIfNeeded, setCartAndId]);

  // ---- 行削除 ------------------------------------------------------------
  const removeLine = useCallback(async (lineId) => {
    if (!cartId) await createCartIfNeeded();
    setLoading(true);
    setError("");
    try {
      const data = await shopifyFetchGQL(GQL_CART_REMOVE, {
        cartId: cartId || (await createCartIfNeeded()).id,
        lineIds: [lineId],
      });
      const errs = data?.cartLinesRemove?.userErrors || [];
      if (errs.length) throw new Error(errs.map(e => e.message).join(" / "));
      const nc = normalizeCart(data?.cartLinesRemove?.cart || null);
      setCartAndId(nc);
      setLoading(false);
      return nc;
    } catch (e) {
      setLoading(false);
      setError(e?.message || String(e));
      throw e;
    }
  }, [cartId, createCartIfNeeded, setCartAndId]);

  // ---- Public Values ------------------------------------------------------
  const value = useMemo(() => ({
    // 状態
    shopReady: !!(SHOP_DOMAIN && TOKEN),
    endpoint: EP,
    cart,
    cartId,
    loading,
    error,
    subtotal: cart?.subtotal ?? 0,
    currency: cart?.currency ?? "JPY",
    totalQuantity: cart?.totalQuantity ?? 0,
    lines: cart?.lines ?? [],
    checkoutUrl: cart?.checkoutUrl || "",

    // 操作
    reload,
    addByJan,
    addByVariantId,
    updateQty,
    removeLine,
  }), [cart, cartId, loading, error, reload, addByJan, addByVariantId, updateQty, removeLine]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

// ------------------------------------------------------------
// 使い方（例）
// 1) ルートで <CartProvider> で包む
//    <CartProvider><App /></CartProvider>
//
// 2) どこからでも：
//    const { addByJan, lines, totalQuantity, checkoutUrl } = useCart();
//    await addByJan("4964044046324", 1);
// ------------------------------------------------------------
