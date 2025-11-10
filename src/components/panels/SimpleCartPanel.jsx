// src/components/panels/SimpleCartPanel.jsx
import React, { useMemo } from "react";
import Drawer from "@mui/material/Drawer";
import PanelHeader from "../ui/PanelHeader";
import { useSimpleCart } from "../../cart/simpleCart";
import { DRAWER_HEIGHT, paperBaseStyle, drawerModalProps } from "../../ui/constants";

export default function SimpleCartPanel({ open, onClose, shopDomain = "tastemap" }) {
  const { items, totalQty, updateQty, remove, clear, proceedCheckout } = useSimpleCart();

  const rows = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const subtotal = useMemo(() => rows.reduce((s, r) => s + Number(r.price || 0) * Number(r.qty || 0), 0), [rows]);

  const JPY = (v) => {
    const n = Number(v || 0);
    try { return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n); }
    catch { return `¥${Math.round(n).toLocaleString()}`; }
  };

  return (
    <Drawer
      anchor="bottom"
      open={!!open}
      onClose={onClose}
      sx={{ zIndex: 1600 }}
      ModalProps={{ ...drawerModalProps }}
      PaperProps={{
        style: { ...paperBaseStyle, height: DRAWER_HEIGHT, display: "flex", flexDirection: "column" },
      }}
    >
      <PanelHeader title={`カート（${totalQty}）`} icon="cart.svg" onClose={onClose} />

      <div style={{ padding: "6px 10px", overflowY: "auto", flex: 1, minHeight: 0, background: "#fff" }}>
        {rows.length === 0 ? (
          <div style={{ padding: 12 }}>カートは空です。</div>
        ) : (
          rows.map((r) => (
            <div key={r.jan} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "8px 4px", borderBottom: "1px dashed #ddd" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title || r.jan}</div>
                <div style={{ fontSize: 12, color: "#666" }}>JAN: {r.jan}</div>
                {Number.isFinite(Number(r.price)) && <div style={{ fontSize: 12, color: "#333", marginTop: 4 }}>単価：{JPY(r.price)}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => updateQty(r.jan, Math.max(1, Number(r.qty || 1) - 1))} style={miniBtn}>−</button>
                <span style={{ minWidth: 22, textAlign: "center" }}>{r.qty}</span>
                <button onClick={() => updateQty(r.jan, Number(r.qty || 0) + 1)} style={miniBtn}>＋</button>
                <button onClick={() => remove(r.jan)} style={{ ...miniBtn, borderColor: "#b66", color: "#b66" }}>削除</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* フッター */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: "1px solid #ddd", background: "#faf9f5" }}>
        <div>小計：<b>{JPY(subtotal)}</b></div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={clear} style={ghost}>カートを空にする</button>
          <button
            onClick={() => proceedCheckout({ shopDomain })}
            style={primary}
            title="ShopifyのカートにJAN/数量を反映して遷移します"
            disabled={rows.length === 0}
          >
            決済に進む
          </button>
        </div>
      </div>
    </Drawer>
  );
}

const miniBtn = {
  minWidth: 28, height: 28, padding: "0 8px",
  border: "1px solid #888", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14,
};
const ghost = {
  background: "#fff", color: "#111", padding: "10px 14px", borderRadius: 8, fontSize: 14, border: "1px solid #111", cursor: "pointer",
};
const primary = {
  background: "#111", color: "#fff", padding: "10px 14px", borderRadius: 8, fontSize: 14, border: "1px solid #111", cursor: "pointer",
};
