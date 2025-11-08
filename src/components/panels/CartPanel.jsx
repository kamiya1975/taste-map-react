// ------------------------------------------------------------
// CartPanel（完全差し替え版）
// ・パネルOPEN時：在庫チェック → staged同期 → reload
// ・/cart ページを開くボタンを追加（チェックアウト直行も併置）
// ・lines が未定義/nullでも安全に描画（safeLines）
// ・行keyは id→origin:sku/jan→fallback の順で安定化
// ------------------------------------------------------------
import React, { useEffect, useRef, useState } from "react";
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
    onlineSubtotal,
    stagedSubtotal,
    totalQuantity,
    updateQty,
    removeLine,
    reload,
    flushStagedToOnline,
    syncAndGetCheckoutUrl,
    hasPending,
    onlineOnlyCount,
    checkAvailability,
    buildCartPageUrl,
  } = useCart();

  const [checkingOut, setCheckingOut] = useState(false);
  // ★ 追加：1回だけ実行するためのフラグ
  const ranRef = useRef(false);

  // パネルOPEN時：在庫チェック → staged同期 → reload
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
  if (!isOpen) {
    ranRef.current = false;
    return;
  }
  if (ranRef.current) return;
  ranRef.current = true;

  (async () => {
    try { await checkAvailability?.(); } catch {}
    try { await flushStagedToOnline(); } catch {}
    try { await reload(); } catch {}
  })();
}, [isOpen]);

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

  const badge = (ln) => {
    const base = {
      display: "inline-block",
      fontSize: 10,
      padding: "2px 6px",
      borderRadius: 999,
      border: "1px solid #aaa",
      color: "#555",
      background: "#fff",
      marginLeft: 6,
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

  const openCartPage = async () => {
    setCheckingOut(true);
    try {
      if (typeof buildCartPageUrl !== "function") {
        throw new Error("Cart URL ビルダーが未定義（CartContextを更新してください）");
      }
      const url = await buildCartPageUrl(); // 例: https://{shop}.myshopify.com/cart/123:2,456:1
      if (!url) throw new Error("Cart URL を生成できませんでした");
      const w = window.open(url, "_blank", "noopener");
      if (!w) window.location.href = url;
    } catch (e) {
      alert(`カートページの表示に失敗: ${e?.message || e}`);
    } finally {
      setCheckingOut(false);
    }
  };

  const openCheckoutDirect = async () => {
    setCheckingOut(true);
    try {
      const url = await syncAndGetCheckoutUrl(); // 既存の checkoutUrl（決済直行）
      if (!url) throw new Error("チェックアウトURLが取得できませんでした");
      const w = window.open(url, "_blank", "noopener");
      if (!w) window.location.href = url;
    } catch (e) {
      alert(`チェックアウト準備に失敗: ${e?.message || e}`);
    } finally {
      setCheckingOut(false);
    }
  };

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

      {/* 本体 */}
      <div
        className="drawer-scroll"
        style={{ flex: 1, minHeight: 160, overflowY: "auto", padding: "6px 10px 80px", background: "#fff" }}
      >
        {(() => {
          const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
          const hasItems = safeLines.length > 0;

          // 可視デバッグ（必要なら残す/消す）
          // <div style={{padding:"4px 8px", margin:"0 0 6px", fontSize:12, color:"#333", background:"#f3f3f3", border:"1px solid #ddd", borderRadius:6}}>
          //   debug: lines.length = <b>{safeLines.length}</b>
          // </div>;

          if (!hasItems) {
            return (
              <div style={{ padding: 16, color: "#333" }}>
                カートは空です。商品ページの「カートに入れる」から追加してください。
              </div>
            );
          }

          return safeLines.map((ln, idx) => {
            const title = ln?.productTitle || ln?.title || "(無題)";
            const key =
              ln?.id ||
              (ln?.origin && (ln?.sku || ln?.jan) && `${ln.origin}:${ln.sku || ln.jan}`) ||
              `ln-${idx}`;

            return (
              <div
                key={key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  padding: "10px 8px",
                  borderBottom: "1px dashed #ddd",
                  alignItems: "center",
                  background: "#fff",
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
                    {ln.origin === "online" && typeof ln.availableForSale === "boolean" && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: ln.availableForSale ? "#2a7" : "#a33" }}>
                        {ln.availableForSale ? "在庫あり" : "在庫なし"}
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
          });
        })()}
      </div>

      {/* フッター */}
      <div style={{
        position: "sticky", bottom: 0, padding: "10px 12px",
        borderTop: "1px solid #ddd", background: "#faf9f5",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{ fontSize: 14 }}>
          小計：<b>{fmt(subtotal)}</b>
          {hasPending && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "#a00" }}>
              （未同期の商品があります）
            </span>
          )}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={openCartPage}
            disabled={checkingOut || !shopReady}
            style={{
              display: "inline-block",
              background: checkingOut ? "#999" : "#111",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 14,
              border: "1px solid #111",
              cursor: checkingOut ? "default" : "pointer",
              opacity: checkingOut ? 0.8 : 1,
            }}
            title="Shopifyのカートページを開きます（現在のカート内容を反映）"
          >
            カートページを開く
          </button>

          <button
            onClick={openCheckoutDirect}
            disabled={checkingOut || (!shopReady && onlineOnlyCount === 0)}
            style={{
              display: "inline-block",
              background: "#fff",
              color: "#111",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 14,
              border: "1px solid #111",
              cursor: checkingOut ? "default" : "pointer",
              opacity: checkingOut ? 0.8 : 1,
            }}
            title={hasPending ? "未同期商品は購入手続きに含まれません（カート表示時に自動同期を試みます）" : ""}
          >
            チェックアウトへ
          </button>
        </div>
      </div>
    </Drawer>
  );
}
