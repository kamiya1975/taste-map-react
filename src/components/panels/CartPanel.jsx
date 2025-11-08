// src/components/panels/CartPanel.jsx
import React, { useEffect, useMemo } from "react";
import Drawer from "@mui/material/Drawer";
import PanelHeader from "../ui/PanelHeader";
import { drawerModalProps, paperBaseStyle, DRAWER_HEIGHT } from "../../ui/constants";
import { useCart } from "./CartContext";

export default function CartPanel({ isOpen, onClose }) {
  // ★ Hooks は無条件で先頭で呼ぶ
  const cart = useCart();

  // cart がまだ undefined の場合でも落ちないようデフォルト
  const {
    shopReady = false,
    loading = false,
    error = null,
    lines = [],
    currency = "¥",
    subtotal = 0,
    updateQty = () => {},
    removeLine = () => {},
    reload = () => {},
    flushStagedToOnline = () => {},
    checkAvailability = () => {},
    buildCartPageUrl = () => "#/cart",
    syncAndGetCheckoutUrl = async () => null,
    hasPending = false,
  } = cart || {};

  // パネルが開いた時だけ副作用を実行（Hook 自体は常に定義済み）
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        await checkAvailability();
        await flushStagedToOnline();
        await reload();
      } catch (_e) {
        // 失敗は握りつぶす（UI 側で error を表示）
      }
    })();
  }, [isOpen, checkAvailability, flushStagedToOnline, reload]);

  const safeLines = useMemo(() => (Array.isArray(lines) ? lines : []), [lines]);

  return (
    <Drawer
      anchor="left"
      open={!!isOpen}
      onClose={onClose}
      ModalProps={drawerModalProps}
      PaperProps={{ sx: { ...paperBaseStyle, height: DRAWER_HEIGHT } }}
    >
      <PanelHeader
        title="カート"
        onClose={onClose}
        rightExtra={
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {shopReady ? "オンライン連携: 有効" : "ローカル保存"}
          </div>
        }
      />
      <div style={{ padding: 12 }}>
        {error && (
          <div style={{ color: "#b71c1c", marginBottom: 8 }}>
            同期エラーが発生しました。リロードしてください。
          </div>
        )}

        {loading && <div>読み込み中…</div>}

        {!loading && safeLines.length === 0 && <div>カートは空です。</div>}

        {!loading && safeLines.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {safeLines.map((ln, idx) => {
              // 安定 key: id → origin:sku/jan → idx フォールバック
              const key =
                ln.id ||
                [ln.origin, ln.sku, ln.jan_code, ln.jan].filter(Boolean).join(":") ||
                `k-${idx}`;
              const qty = Number(ln.quantity ?? 1);
              const price = Number(ln.price ?? 0);

              return (
                <li
                  key={key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    padding: "8px 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{ln.title || ln.name || ln.jan_code || "-"}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {ln.volume_ml ? `${ln.volume_ml}ml` : null}
                      {ln.volume_ml && ln.price ? " / " : ""}
                      {ln.price != null ? `${currency}${price.toLocaleString()}` : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => updateQty(ln, Math.max(1, qty - 1))}
                      aria-label="decrement"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={qty}
                      min={1}
                      onChange={(e) => {
                        const v = parseInt(e.target.value || "1", 10);
                        updateQty(ln, isNaN(v) ? 1 : Math.max(1, v));
                      }}
                      style={{ width: 56, textAlign: "right" }}
                    />
                    <button onClick={() => updateQty(ln, qty + 1)} aria-label="increment">
                      ＋
                    </button>
                    <button onClick={() => removeLine(ln)} style={{ marginLeft: 8 }}>
                      削除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* 合計 */}
        {!loading && safeLines.length > 0 && (
          <div style={{ marginTop: 12, textAlign: "right", fontWeight: 600 }}>
            小計: {currency}
            {Number(subtotal || 0).toLocaleString()}
          </div>
        )}

        {/* アクション */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <a href={buildCartPageUrl()} style={{ flex: 1, textAlign: "center" }}>
            /cart ページへ
          </a>
          <button
            style={{ flex: 1 }}
            onClick={async () => {
              const url = await syncAndGetCheckoutUrl();
              if (url) window.open(url, "_blank");
            }}
            disabled={loading || hasPending || safeLines.length === 0}
          >
            チェックアウト
          </button>
        </div>
      </div>
    </Drawer>
  );
}
