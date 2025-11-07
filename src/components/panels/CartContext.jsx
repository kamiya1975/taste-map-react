// ------------------------------------------------------------
// TasteMap カート（即時格納 + Shopify同期）全文
// - staged(即時) → カート表示時などに flush でShopifyへ同期
// - 行には origin: "online" | "staged" | "local" と syncState を付与
// - 合計は「確定小計(Shopify) / 推定小計(staged+local)」を分離
// - 端末内の別フレーム/別ツリーとも BroadcastChannel + storage + postMessage で同期待ち受け
// ------------------------------------------------------------
import React, {
  createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState
} from "react";
import { getVariantGidByJan } from "../../lib/ecLinks";

// ---- Keys / Constants ----
const CART_ID_KEY    = "tm_cart_id";
const LOCAL_CART_KEY = "tm_cart_local_v1";    // 明示保存
const STAGE_CART_KEY = "tm_cart_stage_v1";    // 即時格納
const CART_CHANNEL   = "cart_bus";

const SHOP_SUBDOMAIN = (process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN || "").trim();
const TOKEN          = (process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN || "").trim();
const API_VER        = "2025-01";
const SHOP_READY     = !!(SHOP_SUBDOMAIN && TOKEN);
const EP             = SHOP_READY
  ? `https://${SHOP_SUBDOMAIN}.myshopify.com/api/${API_VER}/graphql.json`
  : "";

// ---- Utils ----
const readJSON = (key, def = []) => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? def; } catch { return def; } };

// 値保存 + 全フレームへ更新通知
function writeJSONAndBroadcast(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  try { window.postMessage({ type: "CART_UPDATED", key, at: Date.now() }, "*"); } catch {}
  try { const bc = new BroadcastChannel(CART_CHANNEL); bc.postMessage({ type: "cart_updated", key, at: Date.now() }); bc.close(); } catch {}
}

// ReactのsetStateとlocalStorageをまとめるセッタ（値/アップデータ両対応）
function createPersistSetter(key, setState) {
  return (nextOrUpdater) => {
    setState(prev => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
      writeJSONAndBroadcast(key, next);
      return next;
    });
  };
}

// ---- Shopify GraphQL ----
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

// ---- 正規化（Shopify → 共通）----
function normalizeCart(raw) {
  if (!raw) return null;
  const edges = raw.lines?.edges || [];
  const lines = edges.map(e => {
    const n  = e.node || {};
    const md = n.merchandise || {};
    const v  = md?.__typename === "ProductVariant" ? md : {};
    return {
      id: n.id,                                        // Shopify lineId (GID)
      origin: "online",
      syncState: null,
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

// ---- ローカル行ビルド（staged/local 共通）----
function buildLocalLine(item, origin = "local", syncState = "pending") {
  // item: { jan, title, price, qty, imageUrl, variantId? }
  const qty   = Number(item.qty || item.quantity || 1);
  const price = Number(item.price || 0);
  return {
    id: `${origin}:${item.jan}`,
    origin,               // "staged" | "local"
    syncState,            // "pending" | "error_no_variant" | "error_oos" | null
    quantity: qty,
    merchandiseId: item.variantId || "",
    title: item.title || item.jan,
    sku: item.jan,
    productTitle: item.title || item.jan,
    productHandle: "",
    lineAmount: Math.max(0, price * qty), // 概算
    currency: "JPY",
    jan: item.jan,
    price,
    imageUrl: item.imageUrl || null,
    isLocal: origin !== "online",
  };
}

// ------------------------------------------------------------
const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  // Shopify
  const [cart, setCart] = useState(null);
  const [cartId, setCartId] = useState(() => {
    try { return localStorage.getItem(CART_ID_KEY) || null; } catch { return null; }
  });
  const creatingRef = useRef(false);

  // ローカル
  const [_localItems,  _setLocalItems ] = useState(() => readJSON(LOCAL_CART_KEY, []));
  const [_stagedItems, _setStagedItems] = useState(() => readJSON(STAGE_CART_KEY, []));
  const setLocalItems  = useMemo(() => createPersistSetter(LOCAL_CART_KEY,  _setLocalItems),  []);
  const setStagedItems = useMemo(() => createPersistSetter(STAGE_CART_KEY, _setStagedItems), []);

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
      // ローカルのみ再同期
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

  // ---- 変更通知の購読（お気に入り方式と同じ）----
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === LOCAL_CART_KEY)  _setLocalItems(readJSON(LOCAL_CART_KEY, []));
      if (e.key === STAGE_CART_KEY)  _setStagedItems(readJSON(STAGE_CART_KEY, []));
    };
    window.addEventListener("storage", onStorage);

    const bc = new BroadcastChannel(CART_CHANNEL);
    const onBC = (ev) => {
      if (ev?.data?.type !== "cart_updated") return;
      _setLocalItems(readJSON(LOCAL_CART_KEY, []));
      _setStagedItems(readJSON(STAGE_CART_KEY, []));
    };
    bc.addEventListener("message", onBC);

    const onMsg = (ev) => {
      if (ev?.data?.type !== "CART_UPDATED") return;
      _setLocalItems(readJSON(LOCAL_CART_KEY, []));
      _setStagedItems(readJSON(STAGE_CART_KEY, []));
    };
    window.addEventListener("message", onMsg);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMsg);
      bc.removeEventListener("message", onBC);
      bc.close();
    };
  }, []);

  // ---- 追加（variant 直）----
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
      throw e;
    }
  }, [createCartIfNeeded, setCartAndId]);

  // ---- 追加（JAN）----
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
    // ローカルのみ（local保存）
    const j = String(jan);
    const q = Number(quantity || 1);
    setLocalItems(base => {
      const arr = Array.isArray(base) ? [...base] : [];
      const idx = arr.findIndex(x => String(x?.jan) === j);
      if (idx >= 0) arr[idx] = { ...arr[idx], qty: Number(arr[idx].qty || 0) + q };
      else arr.push({ jan: j, title: j, price: 0, qty: q, imageUrl: null, variantId: "" });
      return arr;
    });
    return null;
  }, [addByVariantId, setLocalItems]);

  // ---- 追加（推奨：商品詳細→staged 即時 + 可能なら即オンライン）----
  const addItem = useCallback(async (payload) => {
    const jan = String(payload?.jan || "");
    const qty = Number(payload?.qty || 1);

    // 1) staged に即時反映（お気に入り方式）
    setStagedItems(prev => {
      const base = Array.isArray(prev) ? [...prev] : [];
      const idx  = base.findIndex(x => String(x?.jan) === jan);
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

    // 2) 可能なら即オンライン同期トライ（失敗してもstagedは残す）
    if (SHOP_READY) {
      try {
        const gid = payload?.variantId || (jan ? await getVariantGidByJan(jan) : "");
        if (gid) {
          await addByVariantId(gid, qty);
          // 成功分を staged から差し引き/削除
          setStagedItems(prev => {
            const base = Array.isArray(prev) ? [...prev] : [];
            const i = base.findIndex(x => String(x.jan) === jan);
            if (i >= 0) {
              const left = Math.max(0, Number(base[i].qty || 0) - qty);
              if (left === 0) base.splice(i, 1);
              else base[i] = { ...base[i], qty: left };
            }
            return base;
          });
        }
      } catch (e) {
        // 在庫切れ等：stagedに残す（必要なら syncState を "error_oos" などに更新）
        // ここでは黙っておく
      }
    }
    return null;
  }, [addByVariantId, setStagedItems]);

  // ---- 数量更新 ----
  const updateQty = useCallback(async (lineId, quantity) => {
    const q = Math.max(0, Number(quantity) || 0);
    const id = String(lineId || "");

    // staged / local
    if (id.startsWith("staged:") || id.startsWith("local:")) {
      const isStaged = id.startsWith("staged:");
      const jan = id.slice(isStaged ? 7 : 6);
      const setter = isStaged ? setStagedItems : setLocalItems;

      setter(prev => {
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
    if (!SHOP_READY) return null;
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
        lines: [{ id: id, quantity: Number(q) }],
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
  }, [cartId, createCartIfNeeded, setCartAndId, setLocalItems, setStagedItems]);

  // ---- 行削除 ----
  const removeLine = useCallback(async (lineId) => {
    const id = String(lineId || "");
    if (id.startsWith("staged:") || id.startsWith("local:")) {
      const isStaged = id.startsWith("staged:");
      const jan = id.slice(isStaged ? 7 : 6);
      const setter = isStaged ? setStagedItems : setLocalItems;
      setter(prev => (Array.isArray(prev) ? prev.filter(x => String(x.jan) !== jan) : []));
      return null;
    }

    if (!SHOP_READY) return null;
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
        lineIds: [id],
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
  }, [cartId, createCartIfNeeded, setCartAndId, setLocalItems, setStagedItems]);

  // ---- staged → Shopify 同期（カートを開いた時などに実行）----
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
        if (!gid) {
          // variant 未登録：syncState の付与例（必要ならUIで表示）
          setStagedItems(prev => {
            const arr = Array.isArray(prev) ? [...prev] : [];
            const i = arr.findIndex(x => String(x.jan) === String(item.jan));
            if (i >= 0) arr[i] = { ...arr[i], syncState: "error_no_variant" };
            return arr;
          });
          continue;
        }
        try {
          const data = await shopifyFetchGQL(GQL_CART_ADD, {
            cartId: c.id,
            lines: [{ merchandiseId: gid, quantity: Number(item.qty || 1) }],
          });
          const errs = data?.cartLinesAdd?.userErrors || [];
          if (errs.length) {
            // 在庫エラー等
            setStagedItems(prev => {
              const arr = Array.isArray(prev) ? [...prev] : [];
              const i = arr.findIndex(x => String(x.jan) === String(item.jan));
              if (i >= 0) arr[i] = { ...arr[i], syncState: "error_oos" };
              return arr;
            });
            continue;
          }
          const nc = normalizeCart(data?.cartLinesAdd?.cart || null);
          setCartAndId(nc);
          // 成功したJANを staged から削除
          setStagedItems(prev => (Array.isArray(prev) ? prev.filter(x => String(x.jan) !== String(item.jan)) : []));
        } catch (e) {
          // 通信系: 残す
        }
      }
    } finally {
      setLoading(false);
    }
  }, [SHOP_READY, cart, createCartIfNeeded, setStagedItems, setCartAndId]);

  // ---- 統合スナップショット（表示用）----
  const snapshot = useMemo(() => {
    const stagedLines = (Array.isArray(_stagedItems) ? _stagedItems : []).map(x => buildLocalLine(x, "staged", x.syncState ?? "pending"));
    const localLines  = (Array.isArray(_localItems)  ? _localItems  : []).map(x => buildLocalLine(x, "local",  null));

    if (SHOP_READY && cart && !cart.isLocal) {
      const online = {
        id: cart.id,
        checkoutUrl: cart.checkoutUrl || "",
        onlineSubtotal: Number(cart.subtotal || 0),  // 確定小計
        currency: cart.currency || "JPY",
        onlineQuantity: Number(cart.totalQuantity || 0),
        lines: (cart.lines || []).map(l => ({ ...l, origin: "online", syncState: null })),
      };
      const mergedLines = [
        ...online.lines,
        ...stagedLines,
        ...localLines,
      ];
      const stagedSubtotal = stagedLines.reduce((s, l) => s + l.lineAmount, 0)
                           + localLines.reduce((s, l) => s + l.lineAmount, 0);
      const stagedQuantity = stagedLines.reduce((s, l) => s + l.quantity, 0)
                           + localLines.reduce((s, l) => s + l.quantity, 0);

      // 表示用の総計（確定 + 推定）
      const subtotal = online.onlineSubtotal + stagedSubtotal;
      const totalQuantity = online.onlineQuantity + stagedQuantity;

      return {
        id: online.id,
        checkoutUrl: online.checkoutUrl,
        currency: online.currency,
        lines: mergedLines,             // 並び: online → staged → local
        subtotal,                       // 表示合計（注意書き推奨）
        totalQuantity,
        onlineSubtotal: online.onlineSubtotal,
        stagedSubtotal,                 // 推定小計（staged+local）
        isLocal: false,
      };
    }

    // 完全ローカル
    const mergedLines = [...stagedLines, ...localLines];
    const stagedSubtotal = mergedLines.reduce((s, l) => s + l.lineAmount, 0);
    const totalQuantity  = mergedLines.reduce((s, l) => s + l.quantity, 0);
    return {
      id: null,
      checkoutUrl: "",
      currency: "JPY",
      lines: mergedLines,
      subtotal: stagedSubtotal,
      totalQuantity,
      onlineSubtotal: 0,
      stagedSubtotal,
      isLocal: true,
    };
  }, [cart, _localItems, _stagedItems]);

  // チェックアウト前に：staged をオンラインへ反映 → 最新 checkoutUrl を返す
  const syncAndGetCheckoutUrl = useCallback(async () => {
    try {
      // 1) 未同期(staged)をできるだけオンラインへ
      await flushStagedToOnline();
    } catch (e) {
      console.warn("[CartContext] flushStagedToOnline failed:", e?.message || e);
    }
    try {
      // 2) 最新のカート状態を取得（Shopify接続時は checkoutUrl を持つ）
      const c = await reload();
      // reload() が null を返すケースもあるので cart のフォールバックも見る
      return c?.checkoutUrl || cart?.checkoutUrl || "";
    } catch (e) {
      console.warn("[CartContext] reload for checkoutUrl failed:", e?.message || e);
      return cart?.checkoutUrl || "";
    }
  }, [flushStagedToOnline, reload, cart?.checkoutUrl]);

  const value = useMemo(() => ({
  // 状態
  shopReady: SHOP_READY,
  endpoint: EP,
  cart, cartId,
  loading,
  error,

  // 表示集計（snapshot 由来）
  subtotal: snapshot.subtotal,             // 表示合計（確定 + 推定）
  onlineSubtotal: snapshot.onlineSubtotal, // 確定小計（Shopify）
  stagedSubtotal: snapshot.stagedSubtotal, // 推定小計（staged+local）
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

  // ← 新規公開：チェックアウトURLを安全に取得（未同期の同期込み）
  syncAndGetCheckoutUrl,

  // ローカル操作（任意で使用）
  setLocalItems,
  setStagedItems,
  clearLocal:  () => setLocalItems([]),
  clearStaged: () => setStagedItems([]),
}), [
  cart, cartId, loading, error, snapshot,
  reload, addByJan, addByVariantId, addItem, updateQty, removeLine, flushStagedToOnline,
  setLocalItems, setStagedItems,
  syncAndGetCheckoutUrl, // ★ 依存に追加
]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}
