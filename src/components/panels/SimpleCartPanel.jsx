// src/components/panels/SimpleCartPanel.jsx
import React, { useMemo } from "react";
import { useSimpleCart } from "../../cart/simpleCart";

// 環境変数からドメインを取得（CRA/Vite の両対応＋最後にハードコードfallback）
const SHOP_DOMAIN =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SHOPIFY_SHOP_DOMAIN) ||
  process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN ||
  process.env.SHOPIFY_SHOP_DOMAIN || // 万一 define されていれば拾う
  "tastemap.myshopify.com";

export default function SimpleCartPanel({ onClose }) {
  const { items, totalQty, updateQty, remove, clear, proceedCheckout } = useSimpleCart();

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
      {empty ? (
        <div style={{ padding: 12, color: "#555" }}>カートの中身は空です</div>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((it) => (
              <li
                key={it.jan}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
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
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                    JAN: {it.jan}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    価格: ¥{Number(it.price || 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => updateQty(it.jan, Math.max(0, Number(it.qty || 0) - 1))}
                    aria-label="数量を減らす"
                    style={{ width: 28, height: 28, border: "1px solid #111", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                  >−</button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={Number(it.qty || 0)}
                    onChange={(e) => updateQty(it.jan, Number(e.target.value || 0))}
                    style={{
                      width: 44,
                      height: 28,
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      textAlign: "center",
                    }}
                  />
                  <button
                    onClick={() => updateQty(it.jan, Number(it.qty || 0) + 1)}
                    aria-label="数量を増やす"
                    style={{ width: 28, height: 28, border: "1px solid #111", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                  >＋</button>
                </div>
                <button
                  onClick={() => remove(it.jan)}
                  aria-label="削除"
                  style={{
                    marginLeft: 6,
                    width: 28,
                    height: 28,
                    border: "1px solid #c00",
                    color: "#c00",
                    borderRadius: 6,
                    background: "#fff",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >×</button>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontWeight: 700 }}>
            <div>合計点数: {totalQty}</div>
            <div>小計: ¥{subtotal.toLocaleString()}</div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => clear()}
              style={{
                flex: 1,
                padding: "12px 10px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#fff",
                color: "#111",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              クリア
            </button>

            <button
              onClick={() => proceedCheckout({ shopDomain: SHOP_DOMAIN })}
              disabled={totalQty <= 0}
              style={{
                flex: 2,
                padding: "12px 10px",
                borderRadius: 10,
                border: "1px solid #111",
                background: totalQty > 0 ? "#111" : "#eee",
                color: totalQty > 0 ? "#fff" : "#999",
                cursor: totalQty > 0 ? "pointer" : "default",
                fontWeight: 700,
              }}
              title={SHOP_DOMAIN ? `Shopify: ${SHOP_DOMAIN}` : "Shopifyドメイン未設定"}
            >
              決済に進む
            </button>
          </div>
        </>
      )}

      <div style={{ height: 12 }} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #999",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
