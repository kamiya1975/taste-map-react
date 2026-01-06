// src/pages/EcReturnPage.jsx
// Shopify 決済完了後の復帰受け口

import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

export default function EcReturnPage() {
  const q = useQuery();
  const nav = useNavigate();

  // Shopify 側から何か付与される可能性があるので一応拾う（無くてもOK）
  const orderId = q.get("order_id") || q.get("order") || "";
  const checkout = q.get("checkout") || "";

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ margin: "8px 0 12px" }}>購入が完了しました</h2>

      <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
        <div style={{ color: "#333", lineHeight: 1.6 }}>
          決済完了後の復帰に成功しました（F）。
          <br />
          この後「注文/マイルの反映」は本番でまとめて確認します（E+F最終テスト）。
        </div>

        {(orderId || checkout) && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            {orderId ? <div>order_id: {orderId}</div> : null}
            {checkout ? <div>checkout: {checkout}</div> : null}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          onClick={() => nav("/")}
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
          アプリへ戻る
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          再読み込み
        </button>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: "#666" }}>
        ※ ここで注文一覧/マイル残高の自動再取得も可能ですが、現状はアプリ用トークン取得が難しいため、
        まず復帰導線（F）を先に固めています。
      </div>
    </div>
  );
}
