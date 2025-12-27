// src/pages/CartPage.jsx
// 現在使っていない（必要ない）　（App.js にimportあり 削除するなら整理必要）
// （ローカル保存ベースの「カート内」ページ として想定）
import React, { useEffect, useMemo, useState } from "react";
import { useSimpleCart } from "../cart/simpleCart";
import { checkAvailabilityByJan } from "../lib/shopifyInventory";
import { createCartWithMeta } from "../lib/shopifyCart";

const SHOP_DOMAIN =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SHOPIFY_SHOP_DOMAIN) ||
  process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN ||
  process.env.SHOPIFY_SHOP_DOMAIN ||
  "tastemap.myshopify.com";

// 決済後の遅延クリア用キー（SimpleCartPanel と同じ）
const LS_CLEAR_KEY = "tm_cart_clear_at";
function scheduleCartClear(msFromNow = 5000) {
  try { localStorage.setItem(LS_CLEAR_KEY, String(Date.now() + msFromNow)); } catch {}
}
function consumeIfDueClear(cb) {
  try {
    const v = Number(localStorage.getItem(LS_CLEAR_KEY) || 0);
    if (v && Date.now() >= v) {
      localStorage.removeItem(LS_CLEAR_KEY);
      cb?.();
      return true;
    }
  } catch {}
  return false;
}

export default function CartPage() {
  const { items, totalQty, updateQty, remove, clear } = useSimpleCart();

  const [busy, setBusy] = useState(false);
  const [stockMap, setStockMap] = useState({});
  const [stockMsg, setStockMsg] = useState("");
  const [unresolved, setUnresolved] = useState([]);

  // ページ復帰時でも遅延クリアが効くようにする
  useEffect(() => {
    consumeIfDueClear(() => clear());
    const onVis = () => consumeIfDueClear(() => clear());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [clear]);

  const itemsKey = useMemo(
    () =>
      Array.isArray(items)
        ? items.map(it => `${String(it?.jan || it?.jan_code || it?.JAN || "")}:${Number(it?.qty || 0)}`).join("|")
        : "",
    [items]
  );

  // 在庫チェック（items が変わるたび）
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const uiItems = (Array.isArray(items) ? items : [])
          .map(it => ({ jan: String(it?.jan || it?.jan_code || it?.JAN || ""), qty: Number(it?.qty || 0) }))
          .filter(x => x.jan && x.qty > 0);

        if (!uiItems.length) {
          if (alive) { setStockMap({}); setUnresolved([]); setStockMsg(""); }
          return;
        }

        const { byJan, unresolved: u, apiErrors } = await checkAvailabilityByJan(uiItems);
        if (!alive) return;
        setStockMap(byJan || {});
        setUnresolved(u || []);
        setStockMsg(apiErrors && apiErrors.length ? apiErrors.join("\n") : "");
      } catch (e) {
        if (!alive) return;
        setStockMsg(String(e?.message || e));
      }
    })();
    return () => { alive = false; };
  }, [itemsKey, items]);

  function buildMeta() {
    const userId      = localStorage.getItem("tm_user_id") || "";
    const mainStoreId = localStorage.getItem("tm_main_store_id") || "";
    const appVer      = process.env.REACT_APP_TM_VERSION || "";
    return {
      cartAttributes: { user_id: userId, main_store_id: mainStoreId, app_ver: appVer },
      note: `TasteMap order\nuser=${userId}\nstore=${mainStoreId}\nclient=${navigator.userAgent}`,
      discountCodes: [],
    };
  }

  async function handleCheckout() {
    if (busy) return;
    setBusy(true);
    try {
      // 最終在庫チェック
      const uiItems = (Array.isArray(items) ? items : [])
        .map(it => ({ jan: String(it?.jan || it?.jan_code || it?.JAN || ""), qty: Number(it?.qty || 0) }))
        .filter(x => x.jan && x.qty > 0);

      const { byJan } = await checkAvailabilityByJan(uiItems);
      const shortages = [];
      for (const it of uiItems) {
        const st = byJan[it.jan];
        if (!st) continue;
        if (st.quantityAvailable == null) {
          if (!st.availableForSale) shortages.push(`${it.jan}: 在庫切れ`);
        } else if (st.quantityAvailable < it.qty) {
          shortages.push(`${it.jan}: 残り${st.quantityAvailable}点（必要${it.qty}点）`);
        }
      }
      if (shortages.length) {
        alert("在庫が不足しています。\n" + shortages.join("\n"));
        return;
      }

      // CartCreate 用の明細（JAN→Variant は shopifyCart 側で解決）
      const uiItemsForCreate = (Array.isArray(items) ? items : [])
        .map(it => ({
          jan: String(it?.jan || it?.jan_code || it?.JAN || ""),
          qty: Math.max(1, Number(it?.qty || 0)),
          properties: { source: "TasteMap" },
        }))
        .filter(x => x.jan && x.qty > 0);

      const { checkoutUrl, unresolved: u } = await createCartWithMeta(uiItemsForCreate, buildMeta());

      if (Array.isArray(u) && u.length) alert("一部JANが未解決です: " + u.join(", "));
      if (!checkoutUrl) {
        alert("チェックアウトURLが返りませんでした。");
        return;
      }

      scheduleCartClear(5000);
      try { setTimeout(() => consumeIfDueClear(() => clear()), 5100); } catch {}

      window.location.href = checkoutUrl;
    } catch (e) {
      alert("決済開始に失敗: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const subtotal = useMemo(() => {
    let s = 0;
    for (const it of Array.isArray(items) ? items : []) {
      s += (Number(it?.price) || 0) * (Number(it?.qty) || 0);
    }
    return s;
  }, [items]);

  const empty = !Array.isArray(items) || items.length === 0;

  return (
    <div style={{ padding: 16 }}>
      <h2>カート</h2>
      <div style={{ marginBottom: 12, color: "#555" }}>
        接続: ローカル（useSimpleCart） / Shopify決済: 有効（{SHOP_DOMAIN}）
      </div>

      {!empty && stockMsg && (
        <div style={{ marginBottom: 8, padding: 8, border: "1px solid #f0ad4e", borderRadius: 8, background: "#fff7e6", color: "#8a6d3b" }}>
          在庫チェック注意: {stockMsg}
        </div>
      )}
      {!empty && unresolved.length > 0 && (
        <div style={{ marginBottom: 8, padding: 8, border: "1px solid #aaa", borderRadius: 8 }}>
          Variant未解決JAN: {unresolved.join(", ")}
        </div>
      )}

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div>点数: {totalQty || 0}</div>
        <div>小計: ¥{subtotal.toLocaleString()}</div>
      </div>

      {empty ? (
        <div style={{ padding: 12, color: "#555" }}>カートの中身は空です</div>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((it) => {
              const jan = String(it?.jan || it?.jan_code || it?.JAN || "");
              const st = stockMap[jan];

              let stockLabel = "";
              let stockColor = "#666";
              if (st) {
                if (st.quantityAvailable == null) {
                  stockLabel = st.availableForSale ? "在庫あり（数非公開）" : "在庫切れ";
                  stockColor = st.availableForSale ? "#2a7" : "#c00";
                } else {
                  const need = Number(it?.qty || 0);
                  if (st.quantityAvailable <= 0 || st.currentlyNotInStock) {
                    stockLabel = "在庫切れ";
                    stockColor = "#c00";
                  } else if (st.quantityAvailable < need) {
                    stockLabel = `残り ${st.quantityAvailable} 点（不足 ${need - st.quantityAvailable}）`;
                    stockColor = "#c60";
                  } else {
                    stockLabel = `在庫 ${st.quantityAvailable} 点`;
                    stockColor = "#2a7";
                  }
                }
              }

              return (
                <li key={jan} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #eee" }}>
                  <img
                    src={it?.imageUrl || `${process.env.PUBLIC_URL || ""}/img/${jan}.png`}
                    alt=""
                    style={{ width: 48, height: 48, objectFit: "contain", flexShrink: 0 }}
                    draggable={false}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it?.title || jan}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>JAN: {jan}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>価格: ¥{Number(it?.price || 0).toLocaleString()}</div>
                    {st && (
                      <div style={{ fontSize: 12, marginTop: 4, color: stockColor }}>
                        {stockLabel}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => updateQty(jan, Math.max(0, Number(it?.qty || 0) - 1))}
                      style={{ width: 28, height: 28, border: "1px solid #111", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                    >−</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={Number(it?.qty || 0)}
                      onChange={(e) => updateQty(jan, Number(e.target.value || 0))}
                      style={{ width: 44, height: 28, border: "1px solid #ccc", borderRadius: 6, textAlign: "center" }}
                    />
                    <button
                      onClick={() => updateQty(jan, Number(it?.qty || 0) + 1)}
                      style={{ width: 28, height: 28, border: "1px solid #111", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                    >＋</button>
                  </div>

                  <button
                    onClick={() => remove(jan)}
                    style={{ marginLeft: 6, width: 28, height: 28, border: "1px solid #c00", color: "#c00", borderRadius: 6, background: "#fff", cursor: "pointer", flexShrink: 0 }}
                  >×</button>
                </li>
              );
            })}
          </ul>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => clear()}
              style={{ flex: 1, padding: "12px 10px", borderRadius: 10, border: "1px solid #111", background: "#fff", color: "#111", cursor: "pointer", fontWeight: 700 }}
              disabled={busy}
            >
              クリア
            </button>
            <button
              onClick={handleCheckout}
              disabled={busy || (Number(totalQty) || 0) <= 0}
              style={{
                flex: 2, padding: "12px 10px", borderRadius: 10, border: "1px solid #111",
                background: (Number(totalQty) || 0) > 0 && !busy ? "#111" : "#eee",
                color: (Number(totalQty) || 0) > 0 && !busy ? "#fff" : "#999",
                cursor: (Number(totalQty) || 0) > 0 && !busy ? "pointer" : "default",
                fontWeight: 700
              }}
              title={busy ? "処理中…" : `Shopify: ${SHOP_DOMAIN}`}
            >
              {busy ? "送信中…" : "決済に進む"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
