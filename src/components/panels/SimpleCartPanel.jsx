// src/components/panels/SimpleCartPanel.jsx
import React, { useMemo, useState } from "react";
import { useSimpleCart } from "../../cart/simpleCart";

export default function SimpleCartPanel({ onClose }) {
  const { items, totalQty, updateQty, remove, clear, proceedCheckout } = useSimpleCart();
  const [busy, setBusy] = useState(false);
  const subtotal = useMemo(() => {
    return (Array.isArray(items) ? items : []).reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 0)), 0);
  }, [items]);
  const safeItems = Array.isArray(items) ? items : [];

  if (!safeItems.length) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: "#555", fontSize: 14, marginBottom: 12 }}>カートの中身は空です。</div>
        <button
          onClick={onClose}
          style={{ padding: "10px 14px", border: "1px solid #111", borderRadius: 8, background: "#111", color: "#fff" }}
        >
          閉じる
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 10, fontSize: 14, color: "#333" }}>
        合計点数: <b>{totalQty}</b> ／ 小計: <b>¥{subtotal.toLocaleString()}</b>
      </div>

      {/* 行リスト */}
      <div>
        {safeItems.map((it) => (
          <div key={it.jan} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #eee", padding: "8px 0" }}>
            <div style={{ width: 56, height: 56, marginRight: 10, background: "#f7f7f7", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 8 }}>
              {it.imageUrl ? (
                <img src={it.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 10, color: "#999" }}>{it.jan}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {it.title || it.jan}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                ¥{Number(it.price || 0).toLocaleString()} / 750ml
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  value={Number(it.qty || 0)}
                  onChange={(e) => updateQty(it.jan, e.target.value)}
                  style={{ width: 72, padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6 }}
                />
                <button
                  onClick={() => remove(it.jan)}
                  style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff" }}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 下部アクション */}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          onClick={() => clear()}
          disabled={busy}
          style={{ flex: 1, padding: "10px 14px", border: "1px solid #ccc", borderRadius: 8, background: "#fff" }}
        >
          すべて削除
        </button>
        <button
          onClick={async () => {
            try {
              setBusy(true);
              // .env の SHOPIFY_SHOP_DOMAIN を自動読取（useSimpleCart 側でフォールバック）
              await proceedCheckout(); // { shopDomain } を省略可
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !safeItems.length}
          style={{
            flex: 2,
            padding: "10px 14px",
            border: "1px solid #111",
            borderRadius: 8,
            background: busy ? "#eee" : "#111",
            color: busy ? "#999" : "#fff",
            fontWeight: 700,
          }}
        >
          決済に進む
        </button>
      </div>
    </div>
  );
}
