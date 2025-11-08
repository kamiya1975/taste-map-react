// ------------------------------------------------------------
// CartContext（置き換え版）
// ・staged/local をカートオープン時に在庫チェック（availableForSale）
// ・Shopifyの /cart ページ用URL（permalink）を生成して開けるようにする
// ・hasPending / onlineOnlyCount を公開
// ------------------------------------------------------------
import React, {
  createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState
} from "react";
import { getVariantGidByJan } from "../../lib/ecLinks";

// ---- Keys / Constants ----
const CART_ID_KEY    = "tm_cart_id";
const LOCAL_CART_KEY = "tm_cart_local_v1";
const STAGE_CART_KEY = "tm_cart_stage_v1";
const CART_CHANNEL   = "cart_bus";

const RAW_SHOP       = (process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN || "").trim();
const TOKEN          = (process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN || "").trim();
const API_VER        = "2025-01";

// どんな入力でも "tastemap.myshopify.com" に正規化（例: "tastemap" / "tastemap.myshopify.com" / "https://tastemap.myshopify.com/"）
function toShopHost(v) {
  if (!v) return "";
  let h = String(v).trim()
    .replace(/^https?:\/\//i, "")   // プロトコル除去
    .replace(/\/.*$/, "");          // パス除去
  if (!/\.myshopify\.com$/i.test(h)) h = `${h}.myshopify.com`;
  return h.toLowerCase();
}
const SHOP_HOST  = toShopHost(RAW_SHOP);
const SHOP_READY = !!(SHOP_HOST && TOKEN);
const EP         = SHOP_READY ? `https://${SHOP_HOST}/api/${API_VER}/graphql.json` : "";

// --- DEBUG: いまの設定を覗けるようにする ---
console.debug("[Cart] SHOP_READY:", SHOP_READY);
console.debug("[Cart] EP:", EP);

// ---- Utils ----
const readJSON = (key, def = []) => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? def; } catch { return def; } };

// eslint-disable-next-line no-unused-vars
function writeJSONAndBroadcast(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  try { window.postMessage({ type: "CART_UPDATED", key, at: Date.now() }, "*"); } catch {}
  try { const bc = new BroadcastChannel(CART_CHANNEL); bc.postMessage({ type: "cart_updated", key, at: Date.now() }); bc.close(); } catch {}
}

function createPersistSetter(key, setState) {
  return (nextOrUpdater) => {
    setState(prev => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
      writeJSONAndBroadcast(key, next);   // ← これで unused 解消
      return next;
    });
  };
}

// --- variant 解決キャッシュ / 併走ガード / スロットリング ---
const gidCacheRef   = { current: new Map() };   // jan -> gid 文字列 もしくは Promise
const availBusyRef  = { current: false };
const lastAvailRef  = { current: 0 };

async function resolveVariantGid(jan) {
  const j = String(jan || "");
  if (!j) return "";
  const cached = gidCacheRef.current.get(j);
  if (cached) return await cached; // PromiseでもOK
  const p = (async () => {
    try { return await getVariantGidByJan(j); } catch { return ""; }
  })();
  gidCacheRef.current.set(j, p);
  return await p;
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
              availableForSale
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

// ★ 追加：バリアント在庫可否をまとめて取得
const GQL_VARIANTS_AVAIL = `
  query VariantsAvail($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        availableForSale
        title
        product { title }
      }
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
      id: n.id,
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
      availableForSale: !!v.availableForSale,
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

// ---- ローカル行ビルド ----
function buildLocalLine(item, origin = "local", syncState = "pending") {
  const qty   = Number(item.qty || item.quantity || 1);
  const price = Number(item.price || 0);
  return {
    id: `${origin}:${item.jan}`,
    origin,
    syncState,                 // "pending" | "error_no_variant" | "error_oos" | null
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
    isLocal: origin !== "online",
    availableForSale: undefined, // 後で在庫チェックで埋める
  };
}

// ★ 追加：GID から数値IDを抜き出す（/cart permalink 用）
function extractNumericIdFromGid(gid = "") {
  // gid://shopify/ProductVariant/1234567890
  const m = String(gid).match(/\/(\d+)$|\D(\d+)$/);
  return m ? (m[1] || m[2]) : "";
}

// ★ 追加：/cart パーマリンクを生成（既存の online 行 + staged/local をすべて反映）
function buildCartPermalink(shopHost, lines = []) {
  const pairs = [];
  for (const ln of lines) {
    const gid = ln.merchandiseId || "";
    const num = extractNumericIdFromGid(gid);
    const qty = Math.max(0, Number(ln.quantity || 0));
    if (num && qty > 0) pairs.push(`${num}:${qty}`);
  }
  // ペアが無い場合は単に /cart を返す
  const base = `https://${shopHost}/cart`;
  return pairs.length ? `${base}/${pairs.join(",")}` : base;
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
      const found = data?.cart || null;
      if (!found) {
        try { localStorage.removeItem(CART_ID_KEY); } catch {}
        setCartId(null);
        setLoading(false);
        return await createCartIfNeeded();
      }
      const nc = normalizeCart(found);
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

  // ---- 変更通知の購読 ----
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === LOCAL_CART_KEY)  _setLocalItems(readJSON(LOCAL_CART_KEY, []));
      if (e.key === STAGE_CART_KEY)  _setStagedItems(readJSON(STAGE_CART_KEY, []));
    };
    window.addEventListener("storage", onStorage);

    const bc = new BroadcastChannel(CART_CHANNEL);
    const onBC = () => {
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

  // ---- 追加（variant直）----
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
    // ローカルのみ
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

    // staged に即時反映
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

    // 可能なら即オンライン同期
    if (SHOP_READY) {
      try {
        const gid = payload?.variantId || (jan ? await resolveVariantGid(jan) : "");
        if (gid) {
          await addByVariantId(gid, qty);
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
      } catch {
        // 残す
      }
    }
    return null;
  }, [addByVariantId, setStagedItems]);

  // ---- 数量更新 ----
  const updateQty = useCallback(async (lineId, quantity) => {
    const q = Math.max(0, Number(quantity) || 0);
    const id = String(lineId || "");

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

  // ---- staged → Shopify 同期 ----
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
        const gid = item?.variantId || (item?.jan ? await resolveVariantGid(String(item.jan)) : "");
        if (!gid) {
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
          setStagedItems(prev => (Array.isArray(prev) ? prev.filter(x => String(x.jan) !== String(item.jan)) : []));
        } catch {
          // 残す
        }
      }
    } finally {
      setLoading(false);
    }
  }, [cart, createCartIfNeeded, setStagedItems, setCartAndId]);

  // ★ 追加：在庫チェック（staged/local + online）→ syncState/availableForSale を付与
  const checkAvailability = useCallback(async () => {
    if (!SHOP_READY) return;
    // 10秒以内の連続実行はスキップ
    const now = Date.now();
    if (now - lastAvailRef.current < 10000) return;
    if (availBusyRef.current) return;
    availBusyRef.current = true;
    lastAvailRef.current = now; 

    // 1) staged/local の variant GID を解決
    const staged = readJSON(STAGE_CART_KEY, []);
    const local  = readJSON(LOCAL_CART_KEY, []);
    const janList = Array.from(new Set([
      ...staged.map(it => String(it?.jan || "")).filter(Boolean),
      ...local.map(it => String(it?.jan || "")).filter(Boolean),
    ]));

    const gidMap = {};
    await Promise.all(janList.map(async (j) => {
      // 手元に variantId があればそれを優先
      const inStage = staged.find(x => String(x?.jan) === j);
      const inLocal = local.find(x => String(x?.jan) === j);
      const preset  = inStage?.variantId || inLocal?.variantId;
      gidMap[j] = preset || await resolveVariantGid(j) || "";
  }));

    // 2) オンライン行 + 解決済みの GID をまとめて nodes で問い合わせ
    const ids = [];
    if (cart?.lines?.length) {
      for (const ln of cart.lines) if (ln.merchandiseId) ids.push(ln.merchandiseId);
    }
    Object.values(gidMap).forEach(g => { if (g) ids.push(g); });
    const uniq = Array.from(new Set(ids));
    if (uniq.length === 0) return;

    try {
      const data = await shopifyFetchGQL(GQL_VARIANTS_AVAIL, { ids: uniq });
      const availMap = {};
      for (const node of data?.nodes || []) {
        if (node?.id) availMap[node.id] = !!node.availableForSale;
      }
      // 3) staged/local の syncState を更新（在庫無し→error_oos）
      setStagedItems(prev => {
        const old = Array.isArray(prev) ? prev : [];
        let changed = false;
        const next = old.map(it => {
          const gid = it?.variantId || gidMap[String(it?.jan)] || "";
          if (!gid || !(gid in availMap)) return it;
          const should = availMap[gid] ? "pending" : "error_oos";
          if ((it.syncState || "pending") !== should) {
            changed = true;
            return { ...it, syncState: should };
          }
          return it;
        });
        return changed ? next : old;
      });

      // online 側は normalize 時に availableForSale を持たせ済み（表示用途）
      setCart(c => {
        if (!c?.lines) return c;
        const lines = c.lines.map(ln => {
          if (!ln.merchandiseId) return ln;
          const afs = availMap[ln.merchandiseId];
          return (typeof afs === "boolean") ? { ...ln, availableForSale: afs } : ln;
        });
        return { ...c, lines };
      });
    } catch (e) {
      // 失敗時は黙って終了（ログ洪水対策）
    } finally {
      availBusyRef.current = false;
    }
  }, [cart?.lines, setStagedItems]);

  // ---- 統合スナップショット（表示用 + 付加フラグ）----
  const snapshot = useMemo(() => {
    const stagedLines = (Array.isArray(_stagedItems) ? _stagedItems : []).map(x => buildLocalLine(x, "staged", x.syncState ?? "pending"));
    const localLines  = (Array.isArray(_localItems)  ? _localItems  : []).map(x => buildLocalLine(x, "local",  null));
    const stagedCount = stagedLines.length + localLines.length;

    if (SHOP_READY && cart && !cart.isLocal) {
      const online = {
        id: cart.id,
        checkoutUrl: cart.checkoutUrl || "",
        onlineSubtotal: Number(cart.subtotal || 0),
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

      const subtotal = online.onlineSubtotal + stagedSubtotal;
      const totalQuantity = online.onlineQuantity + stagedQuantity;

      return {
        id: online.id,
        checkoutUrl: online.checkoutUrl,
        currency: online.currency,
        lines: mergedLines,
        subtotal,
        totalQuantity,
        onlineSubtotal: online.onlineSubtotal,
        stagedSubtotal,
        isLocal: false,
        hasPending: stagedCount > 0,
        onlineOnlyCount: online.onlineQuantity,
      };
    }

    // 完全ローカル
    const mergedLines = [...(stagedLines || []), ...(localLines || [])];
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
      hasPending: mergedLines.length > 0,
      onlineOnlyCount: 0,
    };
  }, [cart, _localItems, _stagedItems]);

  // ---- チェックアウトURL（Shopifyの checkoutUrl）----
  const syncAndGetCheckoutUrl = useCallback(async () => {
    try { await flushStagedToOnline(); } catch {}
    try {
      let c = await reload();
      if (!c?.checkoutUrl) c = await createCartIfNeeded();
      return c?.checkoutUrl || cart?.checkoutUrl || "";
    } catch {
      return cart?.checkoutUrl || "";
    }
  }, [flushStagedToOnline, reload, createCartIfNeeded, cart?.checkoutUrl]);

  // ★ 追加：/cart ページのパーマリンクを生成（online + staged/local すべてを反映）
  const buildCartPageUrl = useCallback(async () => {
    // できるだけ staged をオンラインに流す
    try { await flushStagedToOnline(); } catch {}
    // 最新を取得
    let c = await reload();
    // online 行の variant と staged/local の variant を混ぜて permalink を作る
    const linesForPermalink = [];

    if (c?.lines?.length) {
      for (const ln of c.lines) {
        if (ln?.merchandiseId && Number(ln.quantity) > 0) {
          linesForPermalink.push({ merchandiseId: ln.merchandiseId, quantity: Number(ln.quantity) });
        }
      }
    }
    const staged = readJSON(STAGE_CART_KEY, []);
    for (const it of staged) {
      const gid = it?.variantId || (it?.jan ? await getVariantGidByJan(String(it.jan)) : "");
      if (gid && Number(it?.qty || 0) > 0) {
        linesForPermalink.push({ merchandiseId: gid, quantity: Number(it.qty) });
      }
    }
    const local = readJSON(LOCAL_CART_KEY, []);
    for (const it of local) {
      const gid = it?.variantId || (it?.jan ? await getVariantGidByJan(String(it.jan)) : "");
      if (gid && Number(it?.qty || 0) > 0) {
        linesForPermalink.push({ merchandiseId: gid, quantity: Number(it.qty) });
      }
    }
    const url = buildCartPermalink(SHOP_HOST, linesForPermalink);
    try { window.__lastCartPageUrl = url; console.log("[Cart] permalink:", url); } catch {}
    return url;
  }, [reload, flushStagedToOnline]);

  // デバッグ
  const __debugTest = useCallback(async () => {
    const data = await shopifyFetchGQL("query { shop { name primaryDomain { url } } }");
    return data?.shop;
  }, []);

  const value = useMemo(() => ({
    // 状態
    shopReady: SHOP_READY,
    endpoint: EP,
    cart, cartId,
    loading,
    error,

    // 表示集計
    subtotal: snapshot.subtotal,
    onlineSubtotal: snapshot.onlineSubtotal,
    stagedSubtotal: snapshot.stagedSubtotal,
    currency: snapshot.currency,
    totalQuantity: snapshot.totalQuantity,
    lines: Array.isArray(snapshot?.lines) ? snapshot.lines : [],
    checkoutUrl: snapshot?.checkoutUrl || "",
    isLocal: !!snapshot?.isLocal,
    hasPending: !!snapshot?.hasPending,
    onlineOnlyCount: Number(snapshot?.onlineOnlyCount || 0),

    // 操作
    reload,
    addByJan,
    addByVariantId,
    addItem,
    updateQty,
    removeLine,
    flushStagedToOnline,

    // チェックアウト
    syncAndGetCheckoutUrl,  // 旧：Checkout(=決済)へ直接
    buildCartPageUrl,       // 新：/cart ページを開く

    // ローカル操作
    setLocalItems,
    setStagedItems,
    clearLocal:  () => setLocalItems([]),
    clearStaged: () => setStagedItems([]),

    // 在庫チェック（パネルオープン時に使う）
    checkAvailability,

    // デバッグ
    __debugTest,
  }), [
    cart, cartId, loading, error, snapshot,
    reload, addByJan, addByVariantId, addItem, updateQty, removeLine, flushStagedToOnline,
    setLocalItems, setStagedItems, syncAndGetCheckoutUrl, buildCartPageUrl, checkAvailability, __debugTest,
  ]);
  if (typeof window !== "undefined") { window.__cart = { buildCartPageUrl, syncAndGetCheckoutUrl, reload, flushStagedToOnline }; }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}
