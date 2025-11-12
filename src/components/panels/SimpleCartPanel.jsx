// src/components/panels/SimpleCartPanel.jsx
import React, { useMemo, useEffect, useState } from "react";
import { useSimpleCart } from "../../cart/simpleCart";
import { createCartWithMeta } from "../../lib/shopifyCart";
import { checkAvailabilityByJan } from "../../lib/shopifyInventory";

const SHOP_DOMAIN =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SHOPIFY_SHOP_DOMAIN) ||
  process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN ||
  process.env.SHOPIFY_SHOP_DOMAIN ||
  "tastemap.myshopify.com";

export default function SimpleCartPanel({ onClose }) {
  const { items, totalQty, updateQty, remove, clear } = useSimpleCart();
  const [busy, setBusy] = useState(false);

  // --- 在庫結果を保持 ---
  // stockMap["JAN"] = { availableForSale: boolean, quantityAvailable: number|null, currentlyNotInStock: boolean }
  const [stockMap, setStockMap] = useState({});
  const [stockMsg, setStockMsg]   = useState("");   // まとめメッセージ（権限不足など）
  const [unresolved, setUnresolved] = useState([]); // GID未解決JAN

  // カートが開かれたとき（マウント時）に在庫チェック
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
        const { byJan, unresolved, apiErrors } = await checkAvailabilityByJan(uiItems);
        if (!alive) return;
        setStockMap(byJan || {});
        setUnresolved(unresolved || []);
        setStockMsg(apiErrors && apiErrors.length ? apiErrors.join("\n") : "");
      } catch (e) {
        if (!alive) return;
        setStockMsg(String(e?.message || e));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 「カートを開いた時」に一度だけ

  // TasteMap → Shopify へ付与するメタ
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

  // 決済開始（前回までの handleCheckout と同じでOK）
  async function handleCheckout() {
    if (busy) return;
    setBusy(true);
    try {
      const uiItems = (Array.isArray(items) ? items : []).map(it => ({
        jan: String(it?.jan || it?.jan_code || it?.JAN || ""),
        qty: Math.max(1, Number(it?.qty || 0)),
        properties: {
          name: it?.title || it?.name || it?.商品名 || "",
          price: it?.price != null ? String(it.price) : "",
          source: "TasteMap",
        },
      })).filter(x => x.jan && x.qty > 0);

      const { checkoutUrl, unresolved } = await createCartWithMeta(uiItems, buildMeta());
      if (Array.isArray(unresolved) && unresolved.length) {
        alert("一部JANが未解決です: " + unresolved.join(", "));
      }
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      alert("カートURLが返りませんでした。");
    } catch (e) {
      alert("決済開始に失敗: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // 小計
  const subtotal = useMemo(() => {
    let s = 0;
    for (const it of Array.isArray(items) ? items : []) {
      s += (Number(it.price) || 0) * (Number(it.qty) || 0);
    }
    return s;
  }, [items]);

  const empty = !Array.isArray(items) || items.length === 0;

  return (
    <div style={{ padding: 12 }}>
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

      {empty ? (
        <div style={{ padding: 12, color: "#555" }}>カートの中身は空です</div>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((it) => {
              const jan = String(it.jan);
              const st  = stockMap[jan];
              // 表示ロジック
              let stockLabel = "";
              let stockColor = "#666";
              if (st) {
                if (st.quantityAvailable == null) {
                  stockLabel = st.availableForSale ? "在庫あり（数非公開）" : "在庫切れ";
                  stockColor = st.availableForSale ? "#2a7" : "#c00";
                } else {
                  const need = Number(it.qty || 0);
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
                    src={it.imageUrl || `${process.env.PUBLIC_URL || ""}/img/${it.jan}.png`}
                    alt=""
                    style={{ width: 48, height: 48, objectFit: "contain", flexShrink: 0 }}
                    draggable={false}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.title || it.jan}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>JAN: {it.jan}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>価格: ¥{Number(it.price || 0).toLocaleString()}</div>
                    {st && (
                      <div style={{ fontSize: 12, marginTop: 4, color: stockColor }}>
                        {stockLabel}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => updateQty(it.jan, Math.max(0, Number(it.qty || 0) - 1))}
                            aria-label="数量を減らす"
                            style={{ width: 28, height: 28, border: "1px solid #111", borderRadius: 6, background: "#fff", cursor: "pointer" }}>−</button>
                    <input type="number" inputMode="numeric" value={Number(it.qty || 0)}
                           onChange={(e) => updateQty(it.jan, Number(e.target.value || 0))}
                           style={{ width: 44, height: 28, border: "1px solid #ccc", borderRadius: 6, textAlign: "center" }}/>
                    <button onClick={() => updateQty(it.jan, Number(it.qty || 0) + 1)}
                            aria-label="数量を増やす"
                            style={{ width: 28, height: 28, border: "1px solid #111", borderRadius: 6, background: "#fff", cursor: "pointer" }}>＋</button>
                  </div>
                  <button onClick={() => remove(it.jan)}
                          aria-label="削除"
                          style={{ marginLeft: 6, width: 28, height: 28, border: "1px solid #c00", color: "#c00", borderRadius: 6, background: "#fff", cursor: "pointer", flexShrink: 0 }}>×</button>
                </li>
              );
            })}
          </ul>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontWeight: 700 }}>
            <div>合計点数: {totalQty}</div>
            <div>小計: ¥{subtotal.toLocaleString()}</div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => clear()}
                    style={{ flex: 1, padding: "12px 10px", borderRadius: 10, border: "1px solid #111", background: "#fff", color: "#111", cursor: "pointer", fontWeight: 700 }}
                    disabled={busy}>
              クリア
            </button>
            <button onClick={handleCheckout}
                    disabled={busy || (Number(totalQty) || 0) <= 0}
                    style={{ flex: 2, padding: "12px 10px", borderRadius: 10, border: "1px solid #111",
                             background: (Number(totalQty) || 0) > 0 && !busy ? "#111" : "#eee",
                             color: (Number(totalQty) || 0) > 0 && !busy ? "#fff" : "#999",
                             cursor: (Number(totalQty) || 0) > 0 && !busy ? "pointer" : "default",
                             fontWeight: 700 }}
                    title={busy ? "処理中…" : (SHOP_DOMAIN ? `Shopify: ${SHOP_DOMAIN}` : "Shopifyドメイン未設定")}>
              {busy ? "送信中…" : "決済に進む"}
            </button>
          </div>

          <div style={{ height: 12 }} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onClose}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #999", background: "#fff", cursor: "pointer" }}>
              閉じる
            </button>
          </div>
        </>
      )}
    </div>
  );
}
