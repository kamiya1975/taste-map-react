// src/components/panels/CartContext.jsx
// ------------------------------------------------------------
// TasteMap 専用：カート（Shopify 連携 or ローカルゲストの2モード）
// - 環境変数があれば Shopify Storefront API に接続
// - 未設定ならローカル専用（localStorage）で動作（エラーは出さない）
// - API：addByJan / addByVariantId / addItem / updateQty / removeLine / reload
// - パネル側は Context の lines/subtotal/totalQuantity/checkoutUrl を参照
// ------------------------------------------------------------
import React, {
  createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState
} from "react";
import { getVariantGidByJan } from "../../lib/ecLinks";

const CART_ID_KEY = "tm_cart_id";                 // Shopify cartId
const LOCAL_CART_KEY = "tm_cart_local_v1";

const SHOP_SUBDOMAIN = (process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN || "").trim(); // 例: "tastemap"
const TOKEN          = (process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN || "").trim();
const API_VER        = "2025-01";
const SHOP_READY     = !!(SHOP_SUBDOMAIN && TOKEN);
const EP             = SHOP_READY
  ? `https://${SHOP_SUBDOMAIN}.myshopify.com/api/${API_VER}/graphql.json`
  : "";

// ================= Shopify GraphQL ==========================
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

// Shopify → 共通フォーマット
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
      // ローカル互換のため補助
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

// ================= ローカルカート実装 ======================
// 1行の標準フォーマット（Shopifyと合わせる）
function buildLocalLine(item) {
  // item: {jan,title,price,qty,imageUrl,variantId?}
  const qty = Number(item.qty || item.quantity || 1);
  const price = Number(item.price || 0);
  return {
    id: `local:${item.jan}`,                 // lineId 相当
    quantity: qty,
    merchandiseId: item.variantId || "",     // あるなら保存（後でオンライン化できる）
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

function loadLocalCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_CART_KEY) || "[]");
    const lines = (Array.isArray(raw) ? raw : []).map(buildLocalLine);
    const subtotal = lines.reduce((s, l) => s + l.lineAmount, 0);
    const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
    return { id: null, checkoutUrl: "", subtotal, totalQuantity, currency: "JPY", lines, isLocal: true };
  } catch {
    return { id: null, checkoutUrl: "", subtotal: 0, totalQuantity: 0, currency: "JPY", lines: [], isLocal: true };
  }
}
function saveLocalCart(lines) {
  try {
    const compact = lines.map(l => ({
      jan: l.jan || l.sku || "",
      title: l.title,
      price: l.price ?? 0,
      qty: l.quantity,
      imageUrl: l.imageUrl || null,
      variantId: l.merchandiseId || "",
    }));
    localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(compact));
  } catch {}
}

// ================= Context 本体 ============================
const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  // 共通状態
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Shopifyモード用 ---
  const [cart, setCart] = useState(null);
  const [cartId, setCartId] = useState(() => {
    try { return localStorage.getItem(CART_ID_KEY) || null; } catch { return null; }
  });
  // ---- ローカル積み（オフライン用） --------------------------------------
  const [localItems, setLocalItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LOCAL_CART_KEY) || "[]"); } catch { return []; }
  });
  const saveLocal = useCallback((arr) => {
    setLocalItems(arr);
    try { localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(arr)); } catch {}
  }, []);

  const setLocalQty = useCallback((jan, qty) => {
    const j = String(jan || "").trim();
    const q = Math.max(0, Number(qty) || 0);
    setLocalItems((prev) => {
      const next = prev.map((x) => (String(x.jan) === j ? { ...x, qty: q } : x)).filter((x) => x.qty > 0);
      saveLocal(next);
      return next;
    });
  }, [saveLocal]);

  const removeLocalItem = useCallback((jan) => {
    const j = String(jan || "").trim();
    setLocalItems((prev) => {
      const next = prev.filter((x) => String(x.jan) !== j);
      saveLocal(next);
      return next;
    });
  }, [saveLocal]);

  const clearLocal = useCallback(() => saveLocal([]), [saveLocal]);


  const creatingRef = useRef(false);

  const setCartAndId = useCallback((c) => {
    setCart(c);
    if (c?.id) {
      setCartId(c.id);
      try { localStorage.setItem(CART_ID_KEY, c.id); } catch {}
    }
  }, []);

  const createCartIfNeeded = useCallback(async () => {
    if (!SHOP_READY) return null;                        // ← ローカル時は何もしない
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
      // 環境未設定などはエラー表示を出さない（ローカルで続行）
      if (e?.code !== "ENV_MISSING") setError(e?.message || String(e));
      return null;
    }
  }, [cart, cartId, setCartAndId]);

  const reload = useCallback(async () => {
    if (!SHOP_READY) {
      // ローカル再読込
      const lc = loadLocalCart();
      setCart(null);
      setError("");
      return lc;
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
    // 起動時：Shopifyモードなら軽くウォーム
    if (SHOP_READY) createCartIfNeeded().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 追加（Variant 直指定） ---
  const addByVariantId = useCallback(async (variantGid, quantity = 1) => {
    if (!variantGid) throw new Error("variantId is empty");
    if (!SHOP_READY) {
      // ローカルでは variantId 単独では情報不足のため no-op
      throw new Error("オンライン連携未設定：variantId 追加は無効です");
    }
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
      return null;
    }
  }, [createCartIfNeeded, setCartAndId]);

  // --- 追加（JAN → Shopify or ローカル） ---
  const addByJan = useCallback(async (jan, quantity = 1) => {
    if (SHOP_READY) {
      const gid = await getVariantGidByJan(String(jan));
      if (!gid) {
        const e = new Error(`EC対象外（variant未登録）: ${jan}`);
        e.code = "NO_VARIANT";
        throw e;
      }
      return addByVariantId(gid, quantity);
    } else {
      // ローカル：JANのみで最小情報行を積む（タイトル等は後述の addItem で埋めるのが推奨）
      const lc = loadLocalCart();
      const idx = lc.lines.findIndex(l => (l.jan || l.sku) === String(jan));
      if (idx >= 0) {
        lc.lines[idx].quantity += Number(quantity || 1);
      } else {
        lc.lines.push(buildLocalLine({ jan: String(jan), title: String(jan), price: 0, qty: quantity }));
      }
      saveLocalCart(lc.lines);
      return lc;
    }
  }, [addByVariantId]);

  // --- 追加（推奨：商品詳細から必要情報付きで積む） ---
  const addItem = useCallback(async (payload) => {
    // payload: { jan, title, price, qty=1, imageUrl?, variantId? }
    const qty = Number(payload?.qty || 1);
    if (SHOP_READY && payload?.variantId) {
      return addByVariantId(payload.variantId, qty);
    }
    // ローカル（または variantId 不明）
    const lc = loadLocalCart();
    const jan = String(payload.jan || "");
    const idx = lc.lines.findIndex(l => (l.jan || l.sku) === jan);
    if (idx >= 0) lc.lines[idx].quantity += qty;
    else lc.lines.push(buildLocalLine({ ...payload, qty }));
    saveLocalCart(lc.lines);
    return lc;
  }, [addByVariantId]);

  // --- 数量更新 ---
  const updateQty = useCallback(async (lineId, quantity) => {
    if (!SHOP_READY) {
      const lc = loadLocalCart();
      const idx = lc.lines.findIndex(l => l.id === lineId);
      if (idx >= 0) {
        lc.lines[idx].quantity = Math.max(0, Number(quantity));
        if (lc.lines[idx].quantity === 0) lc.lines.splice(idx, 1);
        saveLocalCart(lc.lines);
      }
      return lc;
    }
    if (!cartId) await createCartIfNeeded();
    setLoading(true); setError("");
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
      if (e?.code !== "ENV_MISSING") setError(e?.message || String(e));
      return null;
    }
  }, [cartId, createCartIfNeeded, setCartAndId]);

  // --- 行削除 ---
  const removeLine = useCallback(async (lineId) => {
    if (!SHOP_READY) {
      const lc = loadLocalCart();
      const next = lc.lines.filter(l => l.id !== lineId);
      saveLocalCart(next);
      return loadLocalCart();
    }
    if (!cartId) await createCartIfNeeded();
    setLoading(true); setError("");
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
      if (e?.code !== "ENV_MISSING") setError(e?.message || String(e));
      return null;
    }
  }, [cartId, createCartIfNeeded, setCartAndId]);

  // --- 公開値（常に「現在モードの見え方」を返す） ---
  const snapshot = useMemo(() => {
    if (SHOP_READY && cart && !cart.isLocal) {
      return {
        id: cart.id,
        checkoutUrl: cart.checkoutUrl || "",
        subtotal: cart.subtotal || 0,
        totalQuantity: cart.totalQuantity || 0,
        currency: cart.currency || "JPY",
        lines: cart.lines || [],
        isLocal: false,
      };
    }
    const lc = loadLocalCart();
    return lc;
  }, [cart]);

  const value = useMemo(() => ({
    // 状態
    shopReady: !!(SHOP_SUBDOMAIN && TOKEN), 
    endpoint: EP,
    cart, cartId,
    loading,
    error,                       // Shopify通信エラーのみ。ENV_MISSINGは入れない
    // ▼ ここから snapshot を採用（ローカル/Shopify どちらでも正しい見え方を返す）
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
     updateQty,
     removeLine,
    // ローカル操作
    addItem,
    setLocalQty,
    removeLocalItem,
    clearLocal,
   }), [
    cart, cartId, loading, error, snapshot, reload, addByJan, addByVariantId, updateQty, removeLine,
    addItem, setLocalQty, removeLocalItem, clearLocal
   ]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}
// ------------------------------------------------------------
