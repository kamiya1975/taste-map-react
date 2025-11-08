// src/pages/CartPage.jsx
import React, { useMemo } from "react";
import { useCart } from "../components/panels/CartContext";

// ページ版のシンプルな一覧（Panel を使わない）
export default function CartPage() {
  // ★ Hooks は先頭・無条件
  const cart = useCart();

  const {
    lines = [],
    currency = "¥",
    subtotal = 0,
    updateQty = () => {},
    removeLine = () => {},
  } = cart || {};

  const safeLines = useMemo(() => (Array.isArray(lines) ? lines : []), [lines]);

  return (
    <div style={{ maxWidth: 720, margin: "16px auto", padding: "0 12px" }}>
      <h1>カート</h1>

      {safeLines.length === 0 && <div>カートは空です。</div>}

      {safeLines.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 0" }}>
                商品
              </th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px 0" }}>
                価格
              </th>
              <th style={{ textAlign: "center", borderBottom: "1px solid #eee", padding: "8px 0" }}>
                数量
              </th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px 0" }}>
                小計
              </th>
              <th style={{ borderBottom: "1px solid #eee" }} />
            </tr>
          </thead>
          <tbody>
            {safeLines.map((ln, idx) => {
              const key =
                ln.id ||
                [ln.origin, ln.sku, ln.jan_code, ln.jan].filter(Boolean).join(":") ||
                `k-${idx}`;
              const qty = Number(ln.quantity ?? 1);
              const price = Number(ln.price ?? 0);
              return (
                <tr key={key}>
                  <td style={{ padding: "8px 0" }}>{ln.title || ln.name || ln.jan_code || "-"}</td>
                  <td style={{ textAlign: "right" }}>
                    {currency}
                    {price.toLocaleString()}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="number"
                      value={qty}
                      min={1}
                      onChange={(e) => {
                        const v = parseInt(e.target.value || "1", 10);
                        updateQty(ln, isNaN(v) ? 1 : Math.max(1, v));
                      }}
                      style={{ width: 64, textAlign: "right" }}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {currency}
                    {(price * qty).toLocaleString()}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => removeLine(ln)}>削除</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td />
              <td style={{ textAlign: "right", fontWeight: 600 }}>合計</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                {currency}
                {Number(subtotal || 0).toLocaleString()}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
