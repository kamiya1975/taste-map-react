// src/pages/EcReturnPage.jsx
// Shopify 決済完了後の復帰受け口（サンクスページ）

import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

export default function EcReturnPage() {
  const q = useQuery();
  const nav = useNavigate();
  // Shopify 側から付く可能性があるもの（無くてもOK）
  const orderId = q.get("order_id") || q.get("order") || "";
  const checkout = q.get("checkout") || "";

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ margin: "8px 0 12px" }}>
        購入ありがとうございます。
        <br />
        TasteMap マイルはまもなく反映されます。
      </h2>

      <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
        <button
          onClick={() => nav("/map")}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          マップへ戻る
        </button>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: "#666" }}>
        ※ マイル反映に時間が掛かる場合がございます。
      </div>

      {(orderId || checkout) && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#999" }}>
          {orderId ? <>order: {orderId}</> : null}
          {orderId && checkout ? " / " : null}
          {checkout ? <>checkout: {checkout}</> : null}
        </div>
      )}
    </div>
  );
}
