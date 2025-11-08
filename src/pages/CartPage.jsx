// src/pages/CartPage.jsx
// フル画面カート（安全描画版）
// - useCart のパスに注意（※下の import をプロジェクト実体に合わせる）

import React, { useMemo } from "react";
// ★ import パスは実体に合わせて調整（例: "../components/cart/CartContext" 等）
import { useCart } from "../components/panels/CartContext";

export default function CartPage() {
  const ctx = (typeof useCart === "function" ? useCart() : {}) || {};
  const {
    lines = [],
    currency = "¥",
    updateQty = () => {},
    removeLine = () => {},
    syncAndGetCheckoutUrl = async () => null,
  } = ctx;

  const safeLines = useMemo(() => (Array.isArray(lines) ? lines : []), [lines]);

  return (
    <div style={{ maxWidth: 720, margin: "24px auto", padding: "0 12px" }}>
      <h1>カート</h1>

      {safeLines.length === 0 ? (
        <div style={{ padding: "24px 0", color: "#666" }}>カートは空です。</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {safeLines.map((ln, i) => {
            const key =
              ln.id || ln.sku || ln.jan || ln.variantId || `line-${i}`;
            const qty = Number(ln.quantity || 0);
            const price = Number(ln.price || ln.unitPrice || 0);
            const vol =
              ln.volume || ln.capacity || ln.volume_ml
                ? `${ln.volume || ln.capacity || ln.volume_ml}ml`
                : "";
            const name =
              ln.title || ln.name || ln.productName || ln.jan || "商品";

            return (
              <li
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: "1px solid #eee",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {vol && <span>{vol} / </span>}
                    {currency}
                    {price.toLocaleString()} / 本
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => updateQty(key, Math.max(qty - 1, 0))}
                    style={{ width: 28, height: 28 }}
                    aria-label="減らす"
                  >
                    −
                  </button>
                  <div style={{ width: 24, textAlign: "center" }}>{qty}</div>
                  <button
                    onClick={() => updateQty(key, qty + 1)}
                    style={{ width: 28, height: 28 }}
                    aria-label="増やす"
                  >
                    ＋
                  </button>
                  <button onClick={() => removeLine(key)} style={{ marginLeft: 8 }}>
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ marginTop: 20 }}>
        <button
          onClick={async () => {
            try {
              const url = await syncAndGetCheckoutUrl();
              if (url) window.location.href = url;
            } catch (e) {
              console.error("checkout error:", e);
              alert("チェックアウトURLの生成に失敗しました。");
            }
          }}
        >
          チェックアウトへ進む
        </button>
      </div>
    </div>
  );
}
