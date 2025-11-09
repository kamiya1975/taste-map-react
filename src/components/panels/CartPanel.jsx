// ------------------------------------------------------------
// CartPanel（完全差し替え版・堅牢化）
// ・OPEN時：在庫チェック → staged同期 → reload（1回だけ）
// ・/cart ページボタン（チェックアウト直行も併置）
// ・lines を安全サニタイズして描画崩れ/例外を防止
// ・行keyは id→origin:sku/jan→fallback の順で安定化
// ・A11y：ドロワーOPEN時にフォーカス移動（aria-hidden警告の低減）
// ------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from "react";
import Drawer from "@mui/material/Drawer";
import PanelHeader from "../ui/PanelHeader";
import { drawerModalProps, paperBaseStyle, DRAWER_HEIGHT } from "../../ui/constants";
import { useCart } from "./CartContext";

// --- レンダリング安全化：行を正規化して落ちないようにする ---
function sanitizeLine(raw, idx) {
  if (!raw || typeof raw !== "object") {
    return { __bad: true, key: `bad-${idx}`, title: "(不正な行)", qty: 1, lineAmount: 0, origin: "online" };
  }
  const origin = raw.origin || "online";
  const sku = raw.sku || raw.jan || raw.variantId || raw.merchandiseId || raw?.merchandise?.id || "";
  const title = raw.productTitle || raw.title || "(無題)";
  const key =
    raw.id ||
    (origin && sku ? `${origin}:${sku}` : null) ||
    `ln-${idx}`;

  const qty = Number.isFinite(raw.quantity) ? raw.quantity : 1;
  const lineAmount = Number.isFinite(Number(raw.lineAmount)) ? Number(raw.lineAmount) :
                     Number.isFinite(Number(raw.price))      ? Number(raw.price)      : 0;

  // variant id の取り出しを安全に
  const merchandiseId = raw.merchandiseId || raw?.merchandise?.id || "";
  const variantTail = typeof merchandiseId === "string" && merchandiseId.includes("/")
    ? merchandiseId.split("/").pop()
    : (raw.variantId || "-");

  // 在庫フラグの互換
  const availableForSale = (typeof raw.availableForSale === "boolean")
    ? raw.availableForSale
    : (typeof raw.available === "boolean" ? raw.available : undefined);

  return {
    ...raw,
    __bad: false,
    origin,
    sku,
    title,
    key,
    qty,
    lineAmount,
    merchandiseId,
    variantTail,
    availableForSale,
  };
}

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

  const rootRef = useRef(null);
  const ranRef = useRef(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [renderErr, setRenderErr] = useState(null);

  // A11y：ドロワーOPEN時にフォーカスを移す
  useEffect(() => {
    if (!isOpen) return;
    const ae = document.activeElement;
    if (ae && rootRef.current && !rootRef.current.contains(ae)) {
      try { ae.blur(); } catch {}
    }
    const t = setTimeout(() => {
      try { rootRef.current?.focus(); } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  // OPEN時：在庫チェック → staged同期 → reload（1回だけ実行）
  useEffect(() => {
    if (!isOpen) { ranRef.current = false; return; }
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      try { await checkAvailability?.(); } catch {}
      try { await flushStagedToOnline?.(); } catch {}
      try { await reload?.(); } catch {}
    })();
  }, [isOpen, checkAvailability, flushStagedToOnline, reload]);

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
      if (typeof buildCartPageUrl !== "function") throw new Error("Cart URL ビルダーが未定義（CartContextを更新してください）");
      const url = await buildCartPageUrl();
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
      const url = await syncAndGetCheckoutUrl();
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

  const stagedSum = Number(stagedSubtotal || 0);

  // --- リスト描画（例外を握りつぶさず UI に表示） ---
  const listContent = useMemo(() => {
    try {
      const raw = Array.isArray(lines) ? lines : [];
      const safe = raw.filter(Boolean).map(sanitizeLine);

      if (safe.length === 0) {
        return (
          <div style={{ padding: 16, color: "#333" }}>
            カートは空です。商品ページの「カートに入れる」から追加してください。
          </div>
        );
      }

      return safe.map((ln, idx) => {
        if (ln.__bad) {
          return (
            <div key={ln.key} style={{ padding: 10, color: "#a33" }}>
              行データが不正です（idx={idx}）
            </div>
          );
        }
        const disableQty = ln.origin === "staged" && typeof ln.syncState === "string" && ln.syncState.startsWith("error");
        const stableId = ln.id || ln.key; // update/remove の対象IDはフォールバックありで

        return (
          <div
            key={ln.key}
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
                {ln.title}
                {badge(ln)}
                {ln.origin === "staged" && ln.syncState && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#a33" }}>
                    {ln.syncState === "error_no_variant" ? "未登録商品（要登録）" :
                     ln.syncState === "error_oos"       ? "在庫不足" : ""}
                  </span>
                )}
                {ln.origin === "online" && typeof ln.availableForSale === "boolean" && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: ln.availableForSale ? "#2a7" : "#a33" }}>
                    {ln.availableForSale ? "在庫あり" : "在庫なし"}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                SKU: {ln.sku || "-"}／Variant: {ln.variantTail || "-"}
              </div>
              <div style={{ fontSize: 12, color: "#333", marginTop: 4 }}>
                小計：{fmt(ln.lineAmount)}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => updateQty(stableId, Math.max(1, (Number(ln.qty) || 1) - 1))}
                style={btnMiniStyle}
                aria-label="数量を減らす"
                disabled={disableQty}
              >
                −
              </button>
              <span style={{ minWidth: 22, textAlign: "center" }}>{ln.qty}</span>
              <button
                onClick={() => updateQty(stableId, (Number(ln.qty) || 0) + 1)}
                style={btnMiniStyle}
                aria-label="数量を増やす"
                disabled={disableQty}
              >
                ＋
              </button>
              <button
                onClick={() => removeLine(stableId)}
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
    } catch (e) {
      setRenderErr(e);
      // eslint-disable-next-line no-console
      console.error("[CartPanel] render error:", e);
      return (
        <div style={{ padding: 16, color: "#a33", whiteSpace: "pre-wrap" }}>
          カート表示でエラーが発生しました：{String(e?.message || e)}
        </div>
      );
    }
  }, [lines, updateQty, removeLine, fmt, btnMiniStyle]);

  return (
    <Drawer
      anchor="bottom"
      open={!!isOpen}
      onClose={onClose}
      sx={{ zIndex: 1600 }}
      BackdropProps={{ style: { background: "transparent" } }}
      ModalProps={{ ...drawerModalProps, keepMounted: true }}
      PaperProps={{
        ref: rootRef,
        tabIndex: 0,
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
        {stagedSum > 0 && (
          <div style={{ color: "#666" }}>推定小計（在庫確認前）：{fmt(stagedSum)}</div>
        )}
        {stagedSum > 0 && (
          <div style={{ fontSize: 11, color: "#888" }}>※ チェックアウト対象は「確定小計（オンライン）」のみです。</div>
        )}
      </div>

      {/* 本体 */}
      <div
        className="drawer-scroll"
        style={{
          flex: 1,
          minHeight: 0,          // ← これが無いとスクロール不能になりやすい
          height: "auto",
          overflowY: "auto",
          padding: "6px 10px 80px",
          background: "#fff",
        }}
      >
        {renderErr ? (
          <div style={{ padding: 16, color: "#a33" }}>
            エラーが出たため簡易表示にしています。コンソールを確認してください。
          </div>
        ) : (
          listContent
        )}
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
