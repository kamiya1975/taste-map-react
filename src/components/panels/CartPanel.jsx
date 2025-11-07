// src/components/panels/CartPanel.jsx
// ------------------------------------------------------------
// 「カート」パネル（CartContext と連動）
// - 右上メニューの最上段から開く想定
// - 行一覧 / 数量変更 / 削除 / 小計表示 / チェックアウトへ
// ------------------------------------------------------------
import React, { useMemo } from "react";
import Drawer from "@mui/material/Drawer";
import PanelHeader from "../ui/PanelHeader";
import { drawerModalProps, paperBaseStyle, DRAWER_HEIGHT } from "../../ui/constants";
import { useCart } from "./CartContext";

export default function CartPanel({ isOpen, onClose }) {
  const {
    shopReady,
    loading,
    error,
    lines,
    currency,
    subtotal,
    totalQuantity,
    checkoutUrl,
    updateQty,
    removeLine,
    reload,
  } = useCart();

  const fmt = (v) => {
    const n = Number(v || 0);
    try {
      return new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: currency || "JPY",
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `¥${Math.round(n).toLocaleString()}`;
    }
  };

  const isEmpty = useMemo(() => (Array.isArray(lines) ? lines.length === 0 : true), [lines]);

  return (
    <Drawer
      anchor="bottom"
      open={!!isOpen}
      onClose={onClose}
      sx={{ zIndex: 1600 }}
      BackdropProps={{ style: { background: "transparent" } }}
      ModalProps={{ ...drawerModalProps, keepMounted: true }}
      PaperProps={{
        style: {
          ...paperBaseStyle,
          borderTop: "1px solid #c9c9b0",
          height: DRAWER_HEIGHT,
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <PanelHeader title="カート" icon="cart.svg" onClose={onClose} />

      {/* 状態行 */}
      <div style={{ padding: "8px 14px", fontSize: 12, color: "#666", display: "flex", gap: 12 }}>
        <span>合計点数: <b>{totalQuantity || 0}</b></span>
        {loading && <span>同期中…</span>}
        {!shopReady && (
          <span style={{ color: "#a00" }}>EC連携未設定（環境変数を確認）</span>
        )}
        {error && <span style={{ color: "#a00" }}>ERR: {String(error)}</span>}
        <button
          onClick={reload}
          style={{ marginLeft: "auto", fontSize: 12, border: "1px solid #aaa", padding: "4px 8px", borderRadius: 6, background: "#fff", cursor: "pointer" }}
        >
          再読み込み
        </button>
      </div>

      {/* 本体スクロール */}
      <div className="drawer-scroll" style={{ flex: 1, overflowY: "auto", padding: "6px 10px 80px" }}>
        {isEmpty ? (
          <div style={{ padding: 16, color: "#777" }}>
            カートは空です。商品ページの「カートに入れる」から追加してください。
          </div>
        ) : (
          lines.map((ln) => {
            const title = ln.productTitle || ln.title || "(無題)";
            return (
              <div
                key={ln.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  padding: "10px 8px",
                  borderBottom: "1px dashed #ddd",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    SKU: {ln.sku || "-"}／Variant: {ln.merchandiseId?.split("/").pop() || "-"}
                  </div>
                  <div style={{ fontSize: 12, color: "#333", marginTop: 4 }}>
                    小計：{fmt(ln.lineAmount)}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => updateQty(ln.id, Math.max(1, (ln.quantity || 1) - 1))}
                    style={btnMiniStyle}
                    aria-label="数量を減らす"
                  >
                    −
                  </button>
                  <span style={{ minWidth: 22, textAlign: "center" }}>{ln.quantity}</span>
                  <button
                    onClick={() => updateQty(ln.id, (ln.quantity || 0) + 1)}
                    style={btnMiniStyle}
                    aria-label="数量を増やす"
                  >
                    ＋
                  </button>
                  <button
                    onClick={() => removeLine(ln.id)}
                    style={{ ...btnMiniStyle, borderColor: "#b66", color: "#b66" }}
                    aria-label="削除"
                    title="削除"
                  >
                    削除
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* フッター合計 */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          padding: "10px 12px",
          borderTop: "1px solid #ddd",
          background: "#faf9f5",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 14 }}>
          小計：<b>{fmt(subtotal)}</b>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <a
            href={checkoutUrl || "#"}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => { if (!checkoutUrl) e.preventDefault(); }}
            style={{
              display: "inline-block",
              textDecoration: "none",
              background: "#111",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            チェックアウトへ
          </a>
        </div>
      </div>
    </Drawer>
  );
}

const btnMiniStyle = {
  minWidth: 28,
  height: 28,
  padding: "0 8px",
  border: "1px solid #888",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
};
