// src/pages/CartPage.jsx
// -----------削除対象-------------

import React, { useEffect, useMemo, useState } from "react";
import { useSimpleCart } from "../cart/simpleCart";
import { createCartWithMeta } from "../lib/shopifyCart";
import { checkAvailabilityByJan } from "../lib/shopifyInventory";

export default function CartPage() {
  // 正: useSimpleCart（ローカル正）
  const { items, totalQty, updateQty, remove, clear, hydrateFromStorage } = useSimpleCart();

  const [busy, setBusy] = useState(false);

  // 在庫結果を保持
  // stockMap["JAN"] = { availableForSale, quantityAvailable|null, currentlyNotInStock, gid? }
  const [stockMap, setStockMap] = useState({});
  const [stockMsg, setStockMsg] = useState("");
  const [unresolved, setUnresolved] = useState([]);

  // 初回：storage → state を最新化
  useEffect(() => {
    try { hydrateFromStorage?.(); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // items の変更を安定キーに変換（在庫チェックの依存を安定化）
  const itemsKey = useMemo(
    () =>
      Array.isArray(items)
        ? items.map(it => `${String(it?.jan || it?.jan_code || it?.JAN || "")}:${Number(it?.qty || 0)}`).join("|")
        : "",
    [items]
  );

  // 小計
  const subtotal = useMemo(() => {
    let s = 0;
    for (const it of Array.isArray(items) ? items : []) {
      s += (Number(it?.price) || 0) * (Number(it?.qty) || 0);
    }
    return s;
  }, [items]);

  const empty = !Array.isArray(items) || items.length === 0;

  // カート中身変化で在庫チェック（画面として常時チェック）
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const uiItemsForStock = (Array.isArray(items) ? items : [])
          .map(it => ({ jan: String(it?.jan || it?.jan_code || it?.JAN || ""), qty: Number(it?.qty || 0) }))
          .filter(x => x.jan && x.qty > 0);

        if (!uiItemsForStock.length) {
          if (alive) { setStockMap({}); setUnresolved([]); setStockMsg(""); }
          return;
        }

        const { byJan, unresolved: u, apiErrors } = await checkAvailabilityByJan(uiItemsForStock);
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

  // TasteMap → Shopify へ付与するメタ（SimpleCartPanel と同じ）
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

  // 決済開始（在庫最終チェック → cartCreate → checkoutUrl へ）
  async function handleCheckout() {
    if (busy) return;
    setBusy(true);
    try {
      const uiItems = (Array.isArray(items) ? items : [])
        .map(it => ({ jan: String(it?.jan || it?.jan_code || it?.JAN || ""), qty: Math.max(1, Number(it?.qty || 0)) }))
        .filter(x => x.jan && x.qty > 0);

      if (!uiItems.length) {
        alert("カートが空です。");
        return;
      }

      // 最終在庫チェック
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

      // Storefront API 用に整形（JAN/qtyのみでOK）
      const uiItemsForCreate = uiItems.map(x => ({
        jan: x.jan,
        qty: x.qty,
        properties: { source: "TasteMap" },
      }));

      const { checkoutUrl, unresolved: u } = await createCartWithMeta(uiItemsForCreate, buildMeta());

      if (Array.isArray(u) && u.length) {
        alert("一部JANが未解決です: " + u.join(", "));
      }
      if (!checkoutUrl) {
        alert("checkoutUrl が返りませんでした。");
        return;
      }
      window.location.href = checkoutUrl;
    } catch (e) {
      alert("決済開始に失敗: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>カート</h2>
      <div style={{ marginBottom: 12, color: "#555" }}>
        正: useSimpleCart（ローカル）＋ 決済時に Storefront API（cartCreate）
      </div>

      <div style={{
        border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 16
      }}>
        <div>点数: {totalQty || 0}</div>
        <div>小計: ¥{Number(subtotal || 0).toLocaleString()} JPY</div>
      </div>

      {!empty && stockMsg && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #f0ad4e", borderRadius: 8, background: "#fff7e6", color: "#8a6d3b", whiteSpace: "pre-wrap" }}>
          在庫チェック注意: {stockMsg}
        </div>
      )}
      {!empty && unresolved.length > 0 && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #aaa", borderRadius: 8 }}>
          Variant未解決JAN: {unresolved.join(", ")}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => {
            try { hydrateFromStorage?.(); } catch {}
          }}
          style={{ marginRight: 8 }}
          disabled={busy}
        >
          再読み込み
        </button>
        <button
          onClick={() => clear()}
          style={{ marginRight: 8 }}
          disabled={busy || empty}
        >
          クリア
        </button>
        <button
          onClick={handleCheckout}
          disabled={busy || empty || (Number(totalQty) || 0) <= 0}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #111",
            background: !busy && !empty ? "#111" : "#eee",
            color: !busy && !empty ? "#fff" : "#999",
            cursor: !busy && !empty ? "pointer" : "default",
            fontWeight: 700,
          }}
          title={busy ? "処理中…" : "Shopify決済へ"}
        >
          {busy ? "送信中…" : "決済に進む"}
        </button>
      </div>

      <h3>明細</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {empty ? (
          <li style={{ padding: "8px 0", color: "#555" }}>カートの中身は空です</li>
        ) : (
          (Array.isArray(items) ? items : []).map((it) => {
            const jan = String(it?.jan || it?.jan_code || it?.JAN || "");
            const st = stockMap[jan];

            // 在庫表示ラベル（SimpleCartPanel と同等ロジック）
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
              <li key={jan} style={{ borderBottom: "1px solid #eee", padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img
                    src={it?.imageUrl || `${process.env.PUBLIC_URL || ""}/img/${jan}.png`}
                    alt=""
                    style={{ width: 44, height: 44, objectFit: "contain", flexShrink: 0 }}
                    draggable={false}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it?.title || jan}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>JAN: {jan}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      価格: ¥{Number(it?.price || 0).toLocaleString()}
                    </div>
                    {st && (
                      <div style={{ fontSize: 12, marginTop: 4, color: stockColor }}>
                        {stockLabel}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => updateQty(jan, Math.max(0, Number(it?.qty || 0) - 1))}
                      aria-label="数量を減らす"
                      style={{ width: 28, height: 28, border: "1px solid #111", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                      disabled={busy}
                    >−</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={Number(it?.qty || 0)}
                      onChange={(e) => updateQty(jan, Number(e.target.value || 0))}
                      style={{ width: 44, height: 28, border: "1px solid #ccc", borderRadius: 6, textAlign: "center" }}
                      disabled={busy}
                    />
                    <button
                      onClick={() => updateQty(jan, Number(it?.qty || 0) + 1)}
                      aria-label="数量を増やす"
                      style={{ width: 28, height: 28, border: "1px solid #111", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                      disabled={busy}
                    >＋</button>
                  </div>

                  <button
                    onClick={() => remove(jan)}
                    aria-label="削除"
                    style={{ marginLeft: 6, width: 28, height: 28, border: "1px solid #c00", color: "#c00", borderRadius: 6, background: "#fff", cursor: "pointer", flexShrink: 0 }}
                    disabled={busy}
                  >×</button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
