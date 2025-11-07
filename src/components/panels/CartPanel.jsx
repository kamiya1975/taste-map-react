// ------------------------------------------------------------
// 「カート」パネル（CartContext と連動）全文
// - 合計を「確定小計（Shopify）」と「推定小計（staged+local）」に分けて表示
// - カートを開いたら staged → Shopify 同期（flush）＆ reload
// - 行ごとに origin バッジ（online/staged/local）と syncState を表示
// ------------------------------------------------------------
import React, { useMemo, useEffect } from "react";
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
    subtotal,           // 表示用（確定+推定）
    onlineSubtotal,     // 確定小計（Shopify）
    stagedSubtotal,     // 推定小計（staged+local）
    totalQuantity,
    checkoutUrl,
    updateQty,
    removeLine,
    reload,
    flushStagedToOnline,
  } = useCart();

  useEffect(() => {
    if (!isOpen) return;
    // カートオープン時：staged → Shopify 同期 & 最新リロード
    (async () => {
      try { await flushStagedToOnline(); } catch {}
      try { await reload(); } catch {}
    })();
  }, [isOpen, flushStagedToOnline, reload]);

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

  const badge = (ln) => {
    const base = {
      display: "inline-block",
      fontSize: 10,
      padding: "2px 6px",
      borderRadius: 999,
      border: "1px solid #aaa",
      color: "#555",
      background: "#fff",
      marginLeft: 6
    };
    if (ln.origin === "online") return <span style={{ ...base, borderColor: "#2a7", color: "#2a7" }}>online</span>;
    if (ln.origin === "staged") {
      let st = { ...base, borderColor: "#c80", color: "#c80" };
      if (ln.syncState === "error_no_variant") st = { ...st, borderColor: "#a33", color: "#a33" };
      if (ln.syncState === "error_oos")       st = { ...st, borderColor: "#a33", color: "#a33" };
      return <span style={st}>staged</span>;
    }
    return <span style={{ ...base, borderColor: "#88c", color: "#88c" }}>local</span>;
  };

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
      <div style={{ padding: "8px 14px", fontSize: 12, color: "#666", display: "flex", gap: 12, alignItems: "center" }}>
        <span>合計点数: <b>{totalQuantity || 0}</b></span>
        {loading && <span>同期中…</span>}
        {!shopReady && <span style={{ color: "#a00" }}>EC連携未設定（環境変数を確認）</span>}
        {error && <span style={{ color: "#a00" }}>ERR: {String(error)}</span>}
        <button
          onClick={reload}
          style={{ marginLeft: "auto", fontSize: 12, border: "1px solid #aaa", padding: "4px 8px", borderRadius: 6, background: "#fff", cursor: "pointer" }}
        >
          再読み込み
        </button>
      </div>

      {/* 合計（確定/推定） */}
      <div style={{ padding: "0 14px 6px", fontSize: 13, lineHeight: 1.4, color: "#333" }}>
        <div>確定小計（オンライン）：<b>{fmt(onlineSubtotal || 0)}</b></div>
        {stagedSubtotal > 0 && (
          <div style={{ color: "#666" }}>推定小計（在庫確認前）：{fmt(stagedSubtotal)}</div>
        )}
        {(stagedSubtotal > 0) && (
          <div style={{ fontSize: 11, color: "#888" }}>※ チェックアウト対象は「確定小計（オンライン）」のみです。</div>
        )}
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
            // Shopify行は id=GID、staged/localは id= "staged:JAN" / "local:JAN"
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
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {title}
                    {badge(ln)}
                    {ln.syncState && ln.origin === "staged" && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "#a33" }}>
                        {ln.syncState === "error_no_variant" ? "未登録商品（要登録）" :
                         ln.syncState === "error_oos" ? "在庫不足" : ""}
                      </span>
                    )}
                  </div>
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
                    disabled={ln.origin === "staged" && ln.syncState?.startsWith("error")}
                  >
                    −
                  </button>
                  <span style={{ minWidth: 22, textAlign: "center" }}>{ln.quantity}</span>
                  <button
                    onClick={() => updateQty(ln.id, (ln.quantity || 0) + 1)}
                    style={btnMiniStyle}
                    aria-label="数量を増やす"
                    disabled={ln.origin === "staged" && ln.syncState?.startsWith("error")}
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

      {/* フッター（表示合計・チェックアウト） */}
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
          表示合計：<b>{fmt(subtotal)}</b>
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
