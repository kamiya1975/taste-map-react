// src/pages/CartPage.jsx
import React, { useEffect, useRef, useState } from "react";
import { useCart } from "../components/panels/CartContextShim";

export default function CartPage() {
  const {
    shopReady, lines, totalQuantity, currency,
    subtotal, onlineSubtotal, stagedSubtotal,
    reload, flushStagedToOnline, buildCartPageUrl, syncAndGetCheckoutUrl
  } = useCart();

  // --- reload を安定参照で保持して「初回だけ」実行する ---
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);
  useEffect(() => {
    // 起動時に1回だけ最新化
    reloadRef.current?.().catch(() => {});
  }, []);

  const [permalink, setPermalink] = useState("");

  const safeLines = Array.isArray(lines) ? lines : [];

  return (
    <div style={{ padding: 16 }}>
      <h2>カート</h2>
      <div style={{ marginBottom: 12, color: "#555" }}>
        接続: {shopReady ? "Shopify連携 OK" : "ローカルのみ"}
      </div>

      <div style={{
        border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 16
      }}>
        <div>点数: {totalQuantity || 0}</div>
        <div>小計: {subtotal} {currency}</div>
        {shopReady && (
          <>
            <div>確定小計(Shopify): {onlineSubtotal} {currency}</div>
            <div>推定小計(staged+local): {stagedSubtotal} {currency}</div>
          </>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <button onClick={() => reload()} style={{ marginRight: 8 }}>
          再読み込み
        </button>
        <button onClick={() => flushStagedToOnline()} style={{ marginRight: 8 }}>
          staged→Shopifyへ同期
        </button>
        <button
          onClick={async () => {
            const url = await buildCartPageUrl();
            if (!url) return;
            setPermalink(url);
            window.open(url, "_blank", "noopener");
          }}
          style={{ marginRight: 8 }}
        >
          Shopifyの /cart を開く
        </button>
        <button
          onClick={async () => {
            const url = await syncAndGetCheckoutUrl();
            if (url) window.open(url, "_blank", "noopener");
          }}
        >
          チェックアウトへ
        </button>
      </div>

      <h3>明細</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {safeLines.map((ln) => (
          <li key={ln.id || `${ln.origin}:${ln.sku || ln.jan || Math.random()}`} style={{ borderBottom: "1px solid #eee", padding: "8px 0" }}>
            <div><b>{ln?.productTitle || ln?.title || "(無題)"}</b></div>
            <div>id: {ln?.id || "-"}</div>
            <div>variant: {ln?.merchandiseId || "(local)"}</div>
            <div>数量: {ln?.quantity}</div>
            {"lineAmount" in (ln || {}) && <div>金額: {ln.lineAmount} {ln.currency || currency}</div>}
            {ln?.origin !== "online" && <div style={{ color:"#a66" }}>origin: {ln.origin} / syncState: {ln.syncState || "-"}</div>}
          </li>
        ))}
      </ul>

      {permalink && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
          Permalink: <a href={permalink} target="_blank" rel="noreferrer">{permalink}</a>
        </div>
      )}
    </div>
  );
}
