// src/components/panels/CartContextShim.js
// 旧 CartContext / useCart の最小互換レイヤ（SimpleCartベース）
// - LocalStorage "tm_simple_cart_v1" だけで動く
// - /cart パーマリンク生成に ecLinks を使用（JAN→VariantID 変換）
// -----------削除対象-------------
import React, { createContext, useContext, useMemo, useCallback, useEffect, useState } from "react";
import { getVariantGidByJan } from "../../lib/ecLinks";

const LS_KEY = "tm_simple_cart_v1";

function readLS() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") || []; } catch { return []; }
}
function writeLS(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
}

function extractNumericIdFromGid(gid = "") {
  const m = String(gid).match(/\/(\d+)$/);
  return m ? m[1] : "";
}
function buildPermalink(shopHost, pairs) {
  const base = `https://${shopHost}/cart`;
  return pairs.length ? `${base}/${pairs.join(",")}` : base;
}

// --- SimpleCart 相当（最小） ---
function useSimpleCartCore() {
  const [items, setItems] = useState(() => readLS());

  // 他タブ同期
  useEffect(() => {
    const onStorage = (e) => { if (e.key === LS_KEY) setItems(readLS()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const reload = useCallback(() => setItems(readLS()), []);

  const add = useCallback((payload) => {
    const jan = String(payload?.jan || "");
    const qty = Number(payload?.qty || 1);
    if (!jan || qty <= 0) return;
    setItems(prev => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      const i = arr.findIndex(x => String(x?.jan) === jan);
      if (i >= 0) arr[i] = { ...arr[i], qty: Number(arr[i].qty || 0) + qty };
      else arr.push({ jan, title: payload.title || jan, price: Number(payload.price || 0), qty, imageUrl: payload.imageUrl || null, variantId: payload.variantId || "" });
      writeLS(arr);
      return arr;
    });
  }, []);

  const update = useCallback((idOrJan, quantity) => {
    const key = String(idOrJan || "");
    const jan = key.startsWith("local:") ? key.slice(6) : key.startsWith("staged:") ? key.slice(7) : key;
    const q = Math.max(0, Number(quantity) || 0);
    setItems(prev => {
      let arr = Array.isArray(prev) ? [...prev] : [];
      const i = arr.findIndex(x => String(x?.jan) === jan);
      if (i >= 0) {
        if (q === 0) arr.splice(i, 1);
        else arr[i] = { ...arr[i], qty: q };
      }
      writeLS(arr);
      return arr;
    });
  }, []);

  const remove = useCallback((idOrJan) => {
    const key = String(idOrJan || "");
    const jan = key.startsWith("local:") ? key.slice(6) : key.startsWith("staged:") ? key.slice(7) : key;
    setItems(prev => {
      const arr = (Array.isArray(prev) ? prev : []).filter(x => String(x?.jan) !== jan);
      writeLS(arr);
      return arr;
    });
  }, []);

  const lines = useMemo(() => {
    return (Array.isArray(items) ? items : []).map(it => ({
      id: `local:${it.jan}`,
      origin: "local",
      syncState: null,
      quantity: Number(it.qty || 0),
      qty: Number(it.qty || 0),
      merchandiseId: it.variantId || "",
      title: it.title || it.jan,
      sku: it.jan,
      productTitle: it.title || it.jan,
      lineAmount: Number(it.price || 0) * Number(it.qty || 0),
      currency: "JPY",
      jan: it.jan,
      price: Number(it.price || 0),
      imageUrl: it.imageUrl || null,
      isLocal: true,
    }));
  }, [items]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + Number(l.lineAmount || 0), 0), [lines]);
  const totalQuantity = useMemo(() => lines.reduce((s, l) => s + Number(l.qty || 0), 0), [lines]);

  // /cart パーマリンク（JAN→Variant解決）
  const buildCartPageUrl = useCallback(async () => {
    const host = (process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN || "").trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/\.myshopify\.com$/i, "") + ".myshopify.com";

    const pairs = [];
    for (const ln of lines) {
      const gid = ln.merchandiseId || (ln.jan ? await getVariantGidByJan(String(ln.jan)) : "");
      const num = extractNumericIdFromGid(gid);
      const q = Math.max(0, Number(ln.qty || 0));
      if (num && q > 0) pairs.push(`${num}:${q}`);
    }
    return buildPermalink(host, pairs);
  }, [lines]);

  return { lines, subtotal, totalQuantity, add, update, remove, reload, buildCartPageUrl };
}

// --- 旧APIに合わせた useCart を提供 ---
const ShimCtx = createContext(null);
export function useCart() {
  return useContext(ShimCtx);
}
export function CartProvider({ children }) {
  const sc = useSimpleCartCore();

  const value = useMemo(() => ({
    // 状態
    shopReady: false,          // ここではローカル前提
    endpoint: "",
    cart: null, cartId: null,
    loading: false,
    error: "",

    // 表示集計
    subtotal: sc.subtotal,
    onlineSubtotal: 0,
    stagedSubtotal: sc.subtotal,
    currency: "JPY",
    totalQuantity: sc.totalQuantity,
    lines: sc.lines,
    checkoutUrl: "",
    isLocal: true,
    hasPending: false,
    onlineOnlyCount: 0,

    // 操作（名前互換）
    reload: sc.reload,
    addByJan: (jan, qty=1) => sc.add({ jan, qty }),
    addByVariantId: async () => { /* no-op */ },
    addItem: (payload) => sc.add(payload),
    updateQty: (lineId, q) => sc.update(lineId, q),
    removeLine: (lineId) => sc.remove(lineId),
    flushStagedToOnline: async () => {},

    // チェックアウト／カートページ
    syncAndGetCheckoutUrl: async () => "", // 直チェックアウトは未対応
    buildCartPageUrl: sc.buildCartPageUrl,

    // 在庫チェック（ローカルなので何もしない）
    checkAvailability: async () => {},

    // デバッグ
    __debugTest: async () => ({}),
  }), [sc]);

  return <ShimCtx.Provider value={value}>{children}</ShimCtx.Provider>;
}
