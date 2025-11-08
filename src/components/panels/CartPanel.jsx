// src/components/panels/CartPanel.jsx
// Drawer カート（安全描画版）
// - useCart() が未定義/未初期化でも落ちない
// - lines が null/undefined でも安全にレンダリング
// - /cart ページを開くボタンを常設

import React, { useMemo } from "react";
import Drawer from "@mui/material/Drawer";
import PanelHeader from "../ui/PanelHeader";
import { drawerModalProps, paperBaseStyle, DRAWER_HEIGHT } from "../../ui/constants";

// ★ import パスはプロジェクトの実ファイル構成に合わせてください
import { useCart } from "./CartContext";

export default function CartPanel({ isOpen, onClose }) {
  // useCart が未定義でもクラッシュしないよう防御
  const ctx = (typeof useCart === "function" ? useCart() : {}) || {};

  const {
    lines = [],
    currency = "¥",
    loading = false,
    error = null,
    updateQty = () => {},
    removeLine = () => {},
    buildCartPageUrl = () => "#/cart",
    syncAndGetCheckoutUrl = async () => null,
  } = ctx;

  const safeLines = useMemo(() => (Array.isArray(lines) ? lines : []), [lines]);

  return (
    <Drawer
      anchor="left"
      open={!!isOpen}
      onClose={onClose}
      ModalProps={drawerModalProps}
      PaperProps={{ style: { ...paperBaseStyle, height: DRAWER_HEIGHT } }}
    >
      <PanelHeader title="カート" onClose={onClose} />

      <div style={{ padding: 12 }}>
        {loading && <div style={{ fontSize: 12, opacity: 0.7 }}>読み込み中…</div>}
        {error && (
          <div style={{ color: "#b00", fontSize: 12, marginBottom: 8 }}>
            エラー: {String(error)}
          </div>
        )}

        {safeLines.length === 0 ? (
          <div style={{ padding: "24px 0", color: "#666" }}>カートは空です。</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {safeLines.map((ln, i) => {
              const key =
                ln.id || ln.sku || ln.jan || ln.variantId || `line-${i}`;
              const qty = Number(ln.quantity || 0);
              const price = Number(ln.price || ln.unitPrice || 0);
              const name =
                ln.title || ln.name || ln.productName || ln.jan || "商品";

              return (
                <li
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #eee",
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
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
                    <button
                      onClick={() => removeLine(key)}
                      style={{ marginLeft: 8 }}
                    >
                      削除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <a
            href={buildCartPageUrl()}
            style={{
              display: "inline-block",
              border: "1px solid #ccc",
              padding: "8px 12px",
              textDecoration: "none",
            }}
          >
            /cart を開く
          </a>
          <button
            onClick={async () => {
              try {
                const url = await syncAndGetCheckoutUrl();
                if (url) window.open(url, "_blank");
              } catch (e) {
                console.error("checkout error:", e);
              }
            }}
          >
            チェックアウトへ
          </button>
        </div>
      </div>
    </Drawer>
  );
}
