// src/cart/simpleCart.js
// ローカルだけで完結する簡易カート（JAN/qty中心）
// - localStorage: tm_simple_cart_v1
// - API不要、決済時にだけ JAN→Variant を解決して /cart パーマリンクを作る

import { useCallback, useEffect, useMemo, useState } from "react";
import { getVariantGidByJan } from "../lib/ecLinks";

const LS_KEY = "tm_simple_cart_v1";
const CART_CHANNEL = "cart_bus"; // 同一オリジン内の全ドキュメントで使う通知チャネル名

function readJSON(key, defVal) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? defVal;
  } catch {
    return defVal;
  }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// gid://shopify/ProductVariant/1234567890 → "1234567890"
function extractNumericIdFromGid(gid = "") {
  const m = String(gid).match(/\/(\d+)$/
  );
  return m ? m[1] : "";
}

// /cart permalink を生成
function buildCartPermalink(shopHost, pairs /* [{variantId,numQty}] */) {
  const list = [];
  for (const p of pairs) {
    const tail = extractNumericIdFromGid(p.variantId);
    const q = Math.max(0, Number(p.qty || p.quantity || 0));
    if (tail && q > 0) list.push(`${tail}:${q}`);
  }
  const base = `https://${shopHost}/cart`;
  return list.length ? `${base}/${list.join(",")}` : base;
}

export function useSimpleCart() {
  const [items, setItems] = useState(() => readJSON(LS_KEY, [])); // [{jan, title?, price?, imageUrl?, qty}]

  // --- ① localStorageへ常に同期保存 ---
  useEffect(() => {
    writeJSON(LS_KEY, Array.isArray(items) ? items : []);
  }, [items]);

  // --- ② rehydrate: localStorage→state を即時反映 ---
  const hydrateFromStorage = useCallback(() => {
    const next = readJSON(LS_KEY, []);
    // 深い比較は軽量でOK（サイズが小さい前提）
    const same = JSON.stringify(next) === JSON.stringify(items);
    if (!same) setItems(next);
  }, [items]);

  const totalQty = useMemo(
    () => (Array.isArray(items) ? items.reduce((s, it) => s + Number(it.qty || 0), 0) : 0),
    [items]
  );

  const add = useCallback((payload) => {
    // payload: {jan, qty=1, title?, price?, imageUrl?}
    const jan = String(payload?.jan || "");
    if (!jan) return;
    const addQty = Number(payload?.qty || 1);
    setItems((prev) => {
      const base = Array.isArray(prev) ? [...prev] : [];
      const i = base.findIndex((x) => String(x?.jan) === jan);
      if (i >= 0) {
        base[i] = {
          ...base[i],
          title: payload.title ?? base[i].title ?? jan,
          price: Number(payload.price ?? base[i].price ?? 0),
          imageUrl: payload.imageUrl ?? base[i].imageUrl ?? null,
          qty: Number(base[i].qty || 0) + addQty,
        };
      } else {
        base.push({
          jan,
          title: payload.title || jan,
          price: Number(payload.price || 0),
          imageUrl: payload.imageUrl || null,
          qty: addQty,
        });
      }
      return base;
    });
  }, []);

  const updateQty = useCallback((jan, qty) => {
    const j = String(jan);
    const q = Math.max(0, Number(qty) || 0);
    setItems((prev) => {
      const base = Array.isArray(prev) ? [...prev] : [];
      const i = base.findIndex((x) => String(x?.jan) === j);
      if (i < 0) return base;
      if (q === 0) base.splice(i, 1);
      else base[i] = { ...base[i], qty: q };
      return base;
    });
  }, []);

  const remove = useCallback((jan) => {
    const j = String(jan);
    setItems((prev) => (Array.isArray(prev) ? prev.filter((x) => String(x?.jan) !== j) : []));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  // 決済に進む：JAN→Variant解決 → /cart パーマリンクで遷移
  const proceedCheckout = useCallback(async ({ shopDomain }) => {
    const host = String(shopDomain || "").trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase()
      .replace(/\.myshopify\.com$/, "");
    const shopHost = `${host}.myshopify.com`;

    // すべてのJANをVariantに解決
    const pairs = [];
    for (const it of Array.isArray(items) ? items : []) {
      const gid = await getVariantGidByJan(String(it.jan)).catch(() => "");
      if (!gid) continue; // 見つからないものはスキップ（将来は警告表示も可）
      const qty = Math.max(0, Number(it.qty || 0));
      if (qty > 0) pairs.push({ variantId: gid, qty });
    }
    const url = buildCartPermalink(shopHost, pairs);
    const w = window.open(url, "_blank", "noopener");
    if (!w) window.location.href = url;
  }, [items]);

  // --- ③ items 変更時に全経路へ「変わったよ」を通知（他ビューを即リフレッシュさせる）---
  useEffect(() => {
    // postMessage
    try { window.postMessage({ type: "CART_CHANGED", at: Date.now() }, "*"); } catch {}
    // BroadcastChannel
    try {
      const bc = new BroadcastChannel(CART_CHANNEL);
      bc.postMessage({ type: "CART_CHANGED", at: Date.now() });
      bc.close();
    } catch {}
    // storage は writeJSON で既に setItem されているのでOK
  }, [items]);

  // --- ④ 他フレーム/別タブ/子iframe → 自分を最新化（★このブロックを「return の直前」に置くイメージ）---
  useEffect(() => {
    const rehydrate = () => {
      try { hydrateFromStorage(); } catch {}
    };

    // 1) storage（別ドキュメントの setItem で発火）
    const onStorage = (e) => {
      try {
        if (!e) return;
        // key 未指定（Safari 等）でも念のためリロード
        if (!e.key || e.key === LS_KEY) rehydrate();
      } catch {}
    };

    // 2) window.postMessage（商品ページ → 親 など）
    const onMessage = (e) => {
      if (e?.data?.type === "CART_CHANGED") rehydrate();
    };

    // 3) BroadcastChannel（同一オリジン全体）
    let bc = null;
    try {
      bc = new BroadcastChannel(CART_CHANNEL);
      bc.onmessage = (ev) => {
        if (ev?.data?.type === "CART_CHANGED") rehydrate();
      };
    } catch {}

    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
      try { bc && bc.close(); } catch {}
    };
  }, [hydrateFromStorage]);

  return {
    items,
    totalQty,
    add,
    updateQty,
    remove,
    clear,
    proceedCheckout,
    hydrateFromStorage, // 必要なら外からも呼べるように露出
  };
}
