// src/components/panels/CartContext.jsx
// ------------------------------------------------------------
// TasteMap カート：オンライン(Shopify)＋ローカル＋ステージ（楽観追加）
// - addItem: まず stagedItems に積んで UI へ即反映 → 可能なら即オンライン追加
// - CartPanel オープン時などに flushStagedToOnline() で同期
// - 在庫不足/variant未登録などは staged に残し、UIに表示（チェックアウトはオンライン分のみ）
// ------------------------------------------------------------
import React, {
  createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState
} from "react";
import { getVariantGidByJan } from "../../lib/ecLinks";

const CART_ID_KEY      = "tm_cart_id";
const LOCAL_CART_KEY   = "tm_cart_local_v1";     // 永続ローカル（明示保存）
const STAGE_CART_KEY   = "tm_cart_stage_v1";     // 一時ステージ（楽観追加）

const SHOP_SUBDOMAIN = (process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN || "").trim();
const TOKEN          = (process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN || "").trim();
const API_VER        = "2025-01";
const SHOP_READY     = !!(SHOP_SUBDOMAIN && TOKEN);
const EP             = SHOP_READY
  ? `https://${SHOP_SUBDOMAIN}.myshopify.com/api/${API_VER}/graphql.json`
  : "";

// ---------- 小物 ----------
const readJSON = (key, def) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? def;
  } catch {
    return def;
  }
};
// 「関数アップデータ/値」の両方に対応しつつ localStorage にも同時保存するラッパ
function createPersistSetter(key, setState) {
  return (nextOrUpdater) => {
    setState(prev => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  };
}

// ---------- Shopify GraphQL ----------
async function shopifyFetchGQL(query, variables = {}) {
  if (!SHOP_READY) {
    const err = new Error("[CartContext] Shopify環境変数未設定");
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
  query GetCart($id: ID!) { cart(id: $id) { ...CartFields } }
`;
const GQL_CART_CREATE = `
  ${GQL_CART_FRAGMENT}
  mutation CreateCart($input: CartInput) {
    cartCreate(input: $input) { cart { ...CartFields } userErrors { field message } }
  }
`;
const GQL_CART_ADD = `
  ${GQL_CART_FRAGMENT}
  mutation AddLines($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ...CartFields } userErrors { field message }
    }
  }
`;
const GQL_CART_UPDATE = `
  ${GQL_CART_FRAGMENT}
  mutation UpdateLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { ...CartFields } userErrors { field message }
    }
  }
`;
const GQL_CART_REMOVE = `
  ${GQL_CART_FRAGMENT}
  mutation RemoveLines($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { ...CartFields } userErrors { field message }
    }
  }
`;

// ---------- 正規化 ----------
function normalizeCart(raw) {
  if (!raw) return null;
  const edges = raw.lines?.edges || [];
  const lines = edges.map(e => {
    const n  = e.node || {};
    const md = n.merchandise || {};
    const v  = md?.__typename === "ProductVariant" ? md : {};
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
      jan: "",
      price: NaN,
      imageUrl: null,
      isLocal: false,
    };
  });
  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    totalQuantity: Number(raw.totalQuantity || 0),
    subtotal: Number(raw.cost?.subtotalAmount?.amount || 0),
    currency: raw.cost?.subtotalAmount?.currencyCode || "JPY",
    lines,
    isLocal: false,
  };
}

// ---------- ローカル行ビルド ----------
function buildLocalLine(item) {
  const qty   = Number(item.qty || item.quantity || 1);
  const price = Number(item.price || 0);
  return {
    id: `local:${item.jan}`,
    quantity: qty,
    merchandiseId: item.variantId || "",
    title: item.title || item.jan,
    sku: item.jan,
    productTitle: item.title || item.jan,
    productHandle: "",
    lineAmount: Math.max(0, price * qty),
    currency: "JPY",
    jan: item.jan,
    price,
    imageUrl: item.imageUrl || null,
    isLocal: true,
  };
}

// ---------- Context ----------
const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  // オンライン
  const [cart, setCart] = useState(null);
  const [cartId, setCartId] = useState(() => {
    try { return localStorage.getItem(CART_ID_KEY) || null; } catch { return null; }
  });

  // 永続ローカル / 楽観ステージ
  const [localItems,  _setLocalItems ] = useState(() => readJSON(LOCAL_CART_KEY, []));
  const [stagedItems, _setStagedItems] = useState(() => readJSON(STAGE_CART_KEY, []));

  const saveLocal  = useCallback(createPersistSetter(LOCAL_CART_KEY,  _setLocalItems),  []);
  const saveStaged = useCallback(createPersistSetter(STAGE_CART_KEY, _setStagedItems), []);

  const creatingRef = useRef(false);

  const setCartAndId = useCallback((c) => {
    setCart(c);
    if (c?.id) {
      setCartId(c.id);
      try { localStorage.setItem(CART_ID_KEY, c.id); } catch {}
    }
  }, []);

  const createCartIfNeeded = useCallback(async () => {
    if (!SHOP_READY) return null;
    if (creatingRef.current) return cart;
    if (cart) return cart;

    creatingRef.current = true;
    setLoading(true); setError("");
    try {
      if (cartId) {
        const data = await shopifyFetchGQL(GQL_CART_QUERY, { id: cartId });
        if (data?.cart) {
          const nc = normalizeCart(data.cart);
          setCartAndId(nc);
          creatingRef.current = false; setLoading(false);
          return nc;
        }
        try { localStorage.removeItem(CART_ID_KEY); } catch {}
      }
      const data = await shopifyFetchGQL(GQL_CART_CREATE, { input: {} });
      const c = data?.cartCreate?.cart;
      const errs = data?.cartCreate?.userErrors || [];
      if (!c || errs.length) throw new Error(errs.map(e => e.message).join(" / ") || "cartCreate failed");
      const nc = normalizeCart(c);
      setCartAndId(nc);
      creatingRef.current = false; setLoading(false);
      return nc;
    } catch (e) {
      creatingRef.current = false; setLoading(false);
      if (e?.code !== "ENV_MISSING") setError(e?.message || String(e));
      return null;
    }
  }, [cart, cartId, setCartAndId]);

  const reload = useCallback(async () => {
    if (!SHOP_READY) {
      // ローカルは state を localStorage と再同期
      _setLocalItems(readJSON(LOCAL_CART_KEY, []));
      _setStagedItems(readJSON(STAGE_CART_KEY, []));
      setCart(null);
      setError("");
      return null;
    }
    if (!cartId) return await createCartIfNeeded();
    setLoading(true); setError("");
    try {
      const data = await shopifyFetchGQL(GQL_CART_QUERY, { id: cartId });
      const nc = normalizeCart(data?.cart || null);
      setCartAndId(nc);
      setLoading(false);
      return nc;
    } catch (e) {
      setLoading(false);
      if (e?.code !== "ENV_MISSING") setError(e?.message || String(e));
      return null;
    }
  }, [cartId, createCartIfNeeded, setCartAndId]);

  useEffect(() => {
    if (SHOP_READY) createCartIfNeeded().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 追加 ----------
  const addByVariantId = useCallback(async (variantGid, quantity = 1) => {
    if (!variantGid) throw new Error("variantId is empty");
    if (!SHOP_READY) throw new Error("オンライン連携未設定：variantId 追加は無効です");
    const c = await createCartIfNeeded();
    setLoading(true); setError("");
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
      if (e?.code !== "ENV_MISSING") setError(e?.message || String(e));
      throw e; // 上位でフォールバック
    }
  }, [createCartIfNeeded, setCartAndId]);

  const addByJan = useCallback(async (jan, quantity = 1) => {
    if (SHOP_READY) {
      const gid = await getVariantGidByJan(String(jan));
      if (!gid) {
        const e = new Error(`EC対象外（variant未登録）: ${jan}`);
        e.code = "NO_VARIANT";
        throw e;
      }
      return addByVariantId(gid, quantity);
    }
    // ローカルのみ
    const j = String(jan);
    const q = Number(quantity || 1);
    saveLocal(base => {
      const arr = Array.isArray(base) ? [...base] : [];
      const idx = arr.findIndex(x => (x?.jan + "") === j);
      if (idx >= 0) arr[idx] = { ...arr[idx], qty: Number(arr[idx].qty || 0) + q };
      else arr.push({ jan: j, title: j, price: 0, qty: q, imageUrl: null, variantId: "" });
      return arr;
    });
    return null;
  }, [addByVariantId, saveLocal]);

  // ★ addItem: まず staged に積んで UI 反映 → 可能なら即オンラインへ
  const addItem = useCallback(async (payload) => {
    const jan = String(payload?.jan || "");
    const qty = Number(payload?.qty || 1);

    // 1) 楽観ステージへ（UI 即時反映）
    saveStaged(prev => {
      const base = Array.isArray(prev) ? [...prev] : [];
      const idx  = base.findIndex(x => (x?.jan + "") === jan);
      if (idx >= 0) {
        base[idx] = {
          ...base[idx],
          title: payload.title ?? base[idx].title ?? jan,
          price: Number(payload.price ?? base[idx].price ?? 0),
          qty: Number(base[idx].qty || 0) + qty,
          imageUrl: payload.imageUrl ?? base[idx].imageUrl ?? null,
          variantId: payload.variantId ?? base[idx].variantId ?? "",
          stagedAt: Date.now(),
        };
      } else {
        base.push({
          jan,
          title: payload.title || jan,
          price: Number(payload.price || 0),
          qty,
          imageUrl: payload.imageUrl || null,
          variantId: payload.variantId || "",
          stagedAt: Date.now(),
        });
      }
      return base;
    });

    // 2) オンラインへ即同期トライ（失敗してもUIは残す）
    if (SHOP_READY) {
      try {
        const gid = payload?.variantId || (jan ? await getVariantGidByJan(jan) : "");
        if (gid) {
          await addByVariantId(gid, qty);
          // 成功：staged から相当分を差し引き
          saveStaged(prev => {
            const base = Array.isArray(prev) ? [...prev] : [];
            const idx = base.findIndex(x => (x?.jan + "") === jan);
            if (idx >= 0) {
              const left = Math.max(0, Number(base[idx].qty || 0) - qty);
              if (left === 0) base.splice(idx, 1);
              else base[idx] = { ...base[idx], qty: left };
            }
            return base;
          });
        }
      } catch (e) {
        console.warn("[CartContext] addItem: 即時同期失敗", e?.message || e);
      }
    }
    return null;
  }, [addByVariantId, saveStaged]);

  // ---------- 数量更新/削除 ----------
  const updateQty = useCallback(async (lineId, quantity) => {
    if (!SHOP_READY || String(lineId || "").startsWith("local:")) {
      const jan = String(lineId || "").startsWith("local:") ? String(lineId).slice(6) : "";
      const q   = Math.max(0, Number(quantity) || 0);
      // staged 優先で探す → 無ければ local
      saveStaged(prev => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const i = arr.findIndex(x => String(x.jan) === jan);
        if (i >= 0) {
          if (q === 0) arr.splice(i, 1);
          else arr[i] = { ...arr[i], qty: q };
        }
        return arr;
      });
      saveLocal(prev => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const i = arr.findIndex(x => String(x.jan) === jan);
        if (i >= 0) {
          if (q === 0) arr.splice(i, 1);
          else arr[i] = { ...arr[i], qty: q };
        }
        return arr;
      });
      return null;
    }
    // Shopify
    let currentId = cartId;
    if (!currentId) {
      const c = await createCartIfNeeded();
      if (!c) return null;
      currentId = c.id;
    }
    setLoading(true); setError("");
    try {
      const data = await shopifyFetchGQL(GQL_CART_UPDATE, {
        cartId: currentId,
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
      if (e?.code !== "ENV_MISSING") setError(e?.message || String(e));
      return null;
    }
  }, [cartId, createCartIfNeeded, setCartAndId, saveLocal, saveStaged]);

  const removeLine = useCallback(async (lineId) => {
    if (!SHOP_READY || String(lineId || "").startsWith("local:")) {
      const jan = String(lineId || "").startsWith("local:") ? String(lineId).slice(6) : "";
      saveStaged(prev => (Array.isArray(prev) ? prev.filter(x => String(x.jan) !== jan) : []));
      saveLocal (prev => (Array.isArray(prev) ? prev.filter(x => String(x.jan) !== jan) : []));
      return null;
    }
    let currentId = cartId;
    if (!currentId) {
      const c = await createCartIfNeeded();
      if (!c) return null;
      currentId = c.id;
    }
    setLoading(true); setError("");
    try {
      const data = await shopifyFetchGQL(GQL_CART_REMOVE, {
        cartId: currentId,
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
      if (e?.code !== "ENV_MISSING") setError(e?.message || String(e));
      return null;
    }
  }, [cartId, createCartIfNeeded, setCartAndId, saveLocal, saveStaged]);

  // ---------- ステージ同期（カート表示時などで実行） ----------
  const flushStagedToOnline = useCallback(async () => {
    if (!SHOP_READY) return;
    const pending = readJSON(STAGE_CART_KEY, []);
    if (!pending.length) return;
    let c = cart;
    if (!c?.id) c = await createCartIfNeeded();
    if (!c?.id) return;

    setLoading(true); setError("");
    try {
      for (const item of pending) {
        const gid = item?.variantId || (item?.jan ? await getVariantGidByJan(String(item.jan)) : "");
        if (!gid) continue; // variant解決不可 → 残す
        try {
          const data = await shopifyFetchGQL(GQL_CART_ADD, {
            cartId: c.id,
            lines: [{ merchandiseId: gid, quantity: Number(item.qty || 1) }],
          });
          const errs = data?.cartLinesAdd?.userErrors || [];
          if (errs.length) {
            console.warn("cartLinesAdd error:", errs);
            continue;
          }
          const nc = normalizeCart(data?.cartLinesAdd?.cart || null);
          setCartAndId(nc);
          // 成功分は staged から削除
          saveStaged(prev => (Array.isArray(prev) ? prev.filter(x => String(x.jan) !== String(item.jan)) : []));
        } catch (e) {
          console.warn("flush add error:", e?.message || e);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [SHOP_READY, cart, createCartIfNeeded, saveStaged, setCartAndId]);

  // ---------- 公開スナップショット（オンライン＋staged＋ローカル統合表示） ----------
  const snapshot = useMemo(() => {
    const stagedLines = (Array.isArray(stagedItems) ? stagedItems : []).map(buildLocalLine);
    const localLines  = (Array.isArray(localItems)  ? localItems  : []).map(buildLocalLine);

    if (SHOP_READY && cart && !cart.isLocal) {
      const online = {
        id: cart.id,
        checkoutUrl: cart.checkoutUrl || "",
        subtotal: Number(cart.subtotal || 0),
        totalQuantity: Number(cart.totalQuantity || 0),
        currency: cart.currency || "JPY",
        lines: cart.lines || [],
        isLocal: false,
      };
      const mergedLines = [...online.lines, ...stagedLines, ...localLines];
      const subtotal = online.subtotal
        + stagedLines.reduce((s, l) => s + l.lineAmount, 0)
        + localLines.reduce((s, l) => s + l.lineAmount, 0);
      const totalQuantity = online.totalQuantity
        + stagedLines.reduce((s, l) => s + l.quantity, 0)
        + localLines.reduce((s, l) => s + l.quantity, 0);
      return { ...online, lines: mergedLines, subtotal, totalQuantity };
    }

    const mergedLines = [...stagedLines, ...localLines];
    const subtotal = mergedLines.reduce((s, l) => s + l.lineAmount, 0);
    const totalQuantity = mergedLines.reduce((s, l) => s + l.quantity, 0);
    return { id: null, checkoutUrl: "", subtotal, totalQuantity, currency: "JPY", lines: mergedLines, isLocal: true };
  }, [cart, localItems, stagedItems]);

  // ---------- 公開値 ----------
  const value = useMemo(() => ({
    // 状態
    shopReady: SHOP_READY,
    endpoint: EP,
    cart, cartId,
    loading,
    error,

    // 表示用集計
    subtotal: snapshot.subtotal,
    currency: snapshot.currency,
    totalQuantity: snapshot.totalQuantity,
    lines: snapshot.lines,
    checkoutUrl: snapshot.checkoutUrl,
    isLocal: snapshot.isLocal,

    // 操作
    reload,
    addByJan,
    addByVariantId,
    addItem,
    updateQty,
    removeLine,
    flushStagedToOnline,

    // ローカル操作
    setLocalItems: saveLocal,
    setStagedItems: saveStaged,
    clearLocal: () => saveLocal([]),
    clearStaged: () => saveStaged([]),
  }), [
    cart, cartId, loading, error, snapshot,
    reload, addByJan, addByVariantId, addItem, updateQty, removeLine, flushStagedToOnline,
    saveLocal, saveStaged
  ]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}
// ------------------------------------------------------------
