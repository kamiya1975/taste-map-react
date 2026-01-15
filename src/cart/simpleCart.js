// src/cart/simpleCart.js
// 状態（カートの中身）　　　　ローカルだけで完結する簡易カート（JAN/qty中心）

// - localStorage: tm_simple_cart_v1
// - API不要、決済時にだけ JAN→Variant を解決して /cart パーマリンクを作る
// - 変更通知は postMessage / BroadcastChannel / storage の三経路で即時同期

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getVariantGidByJan } from "../lib/ecLinks";
import { getUserId, getGuestId } from "../utils/auth";

const LS_KEY_BASE = "tm_simple_cart_v1";
const CART_CHANNEL = "cart_bus"; // 同一オリジン内の全ドキュメントで使う通知チャネル名

function getCartStorageKey() {
  // user優先。無ければguestId（無ければ発行される）
  const uid = (getUserId && getUserId()) ? String(getUserId()) : "";
  if (uid) return `${LS_KEY_BASE}:u:${uid}`;
  const gid = (getGuestId && getGuestId()) ? String(getGuestId()) : "g";
  return `${LS_KEY_BASE}:g:${gid}`;
}

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

function removeKey(key) {
  try { localStorage.removeItem(key); } catch {}
}

function migrateLegacyCartIfNeeded(scopedKey) {
  // 旧キー（LS_KEY_BASE） → scopedKey へ一度だけ移行
  try {
    const legacy = readJSON(LS_KEY_BASE, null);
    if (!legacy || !Array.isArray(legacy) || legacy.length === 0) return;
    const scoped = readJSON(scopedKey, null);
    if (Array.isArray(scoped) && scoped.length > 0) return;
    writeJSON(scopedKey, legacy);
    // 旧キーは消してOK（残すと「別IDログインで復活」しうる）
    removeKey(LS_KEY_BASE);
  } catch {}
}

// gid://shopify/ProductVariant/1234567890 → "1234567890"
function extractNumericIdFromGid(gid = "") {
  const m = String(gid).match(/\/(\d+)$/);
  return m ? m[1] : "";
}

// /cart permalink を生成
function buildCartPermalink(shopHost, pairs /* [{variantId, qty}] */) {
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
  const [storageKey, setStorageKey] = useState(() => {
    const k = getCartStorageKey();
    migrateLegacyCartIfNeeded(k);
    return k;
  });

  // [{jan, title?, price?, imageUrl?, qty}]
  const [items, setItems] = useState(() => readJSON(storageKey, []));

  // ★ storageKey 切替直後は「前スコープ items を新キーへ書く」事故を防ぐ
  // 1回スキップだと弱いケースがあるので、同期完了まで“複数回”スキップできる形にする
  const skipPersistCountRef = useRef(0);

  // storageKey の変化検知用（保険）
  const storageKeyRef = useRef(storageKey);

  const markSkipPersist = useCallback((n = 2) => {
    // 2回程度で十分（setItems→effect→通知/rehydrate等の連鎖を吸収）
    skipPersistCountRef.current = Math.max(skipPersistCountRef.current, Number(n) || 0);
  }, []);

  // --- ① localStorageへ常に同期保存 ---
  // storageKey 切替直後の1回は保存をスキップ（コピー事故防止）
  useEffect(() => {
    if (skipPersistCountRef.current > 0) {
      skipPersistCountRef.current -= 1;
      return;
    }
    writeJSON(storageKey, Array.isArray(items) ? items : []);
  }, [items, storageKey]);

  // --- ★ 保険：storageKey が変わった瞬間に確実に “新キーの中身” に追従させる ---
  // setStorageKey → 別effectで読む だけでも足りるが、ref検知で二重に押さえると事故が減る
  useEffect(() => {
    if (storageKeyRef.current === storageKey) return;
    storageKeyRef.current = storageKey;
    try {
      markSkipPersist(2);
      const next = readJSON(storageKey, []);
      setItems(Array.isArray(next) ? next : []);
    } catch {
      markSkipPersist(2);
      setItems([]);
    }
  }, [storageKey, markSkipPersist]);

  // --- ② rehydrate: localStorage→state を即時反映 ---
  const hydrateFromStorage = useCallback(() => {
    const next = readJSON(storageKey, []);
    const same = JSON.stringify(next) === JSON.stringify(items);
    if (!same) setItems(next);
  }, [items, storageKey]);

  // --- ★ auth変化でストレージキーを切替（別IDログイン対策の本丸） ---
  useEffect(() => {
    const onAuthChanged = () => {
      const nextKey = getCartStorageKey();
      migrateLegacyCartIfNeeded(nextKey);

      // ここで明示的に読み込んでおく（イベント駆動でも二重に押さえる保険）
      // ※ storageKey 切替直後の “旧items→新keyへ書き戻し” を防ぐため、先に skip を立てる
      setStorageKey((prev) => {
        if (prev === nextKey) return prev;
        try {
          markSkipPersist(2);
          const next = readJSON(nextKey, []);
          setItems(Array.isArray(next) ? next : []);
        } catch {
          markSkipPersist(2);
          setItems([]);
        }
        return nextKey;
      });
    };
    window.addEventListener("tm_auth_changed", onAuthChanged);
    return () => window.removeEventListener("tm_auth_changed", onAuthChanged);
  }, [markSkipPersist]);

  // （削除）storageKey 追従は storageKeyRef の検知 effect に集約
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
      if (!gid) continue; // 見つからないものはスキップ
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
    // storage は writeJSON で既に setItem 済み
  }, [items, storageKey]);

  // --- ④ 他フレーム/別タブ/子iframe → 自分を最新化 ---
  useEffect(() => {
    const rehydrate = () => {
      try { hydrateFromStorage(); } catch {}
    };

    // 1) storage（別ドキュメントの setItem で発火）
    const onStorage = (e) => {
      try {
        if (!e) return;
        if (!e.key || e.key === storageKey) rehydrate();
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
  }, [hydrateFromStorage, storageKey]);

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
