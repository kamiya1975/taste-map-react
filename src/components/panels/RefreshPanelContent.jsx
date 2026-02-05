// src/components/panels/RefreshPanelContent.jsx
// 更新ボタンパネル
import React from "react";

export default function RefreshPanelContent({ onRefresh }) {
  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "12px auto" }}>
      <div style={{ fontSize: 14.5, lineHeight: 1.9, color: "#222" }}>
        今後も検査により打点や店舗を随時増やしていきます。<br></br><br></br>
        反映させるため定期的に、下の更新ボタンを押すか、アプリのバックグラウンドを削除してください。
      </div>

      <div style={{ height: 14 }} />

      <button
        onClick={() => onRefresh?.()}
        style={{
            marginTop: 16,
            width: "100%",
            padding: "10px 20px",
            lineHeight: 1.2,
            background: "rgb(230,227,219)",
            color: "#000",
            border: "none",
            borderRadius: 10,
            fontSize: 18,
            fontWeight: 700,
            boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            WebkitBackdropFilter: "blur(2px)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
        }}
      >
        更 新
      </button>

      <div style={{ height: 20 }} />
      <div style={{ marginTop: 14, fontSize: 12, color: "#666", lineHeight: 1.7, textAlign: "center" }}>
        ※通信状況によっては時間がかかる場合があります
      </div>
    </div>
  );
}
