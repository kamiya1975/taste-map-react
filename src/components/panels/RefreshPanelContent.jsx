// src/components/panels/RefreshPanelContent.jsx
// 更新ボタンパネル
import React from "react";

export default function RefreshPanelContent({ onRefresh }) {
  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "12px auto" }}>
      <div style={{ fontSize: 14.5, lineHeight: 1.9, color: "#222" }}>
        今後も検査により打点や店舗を随時増やしていきます。<br></br><br></br>
        反映させるため定期的に、下の更新ボタンを押すか、アプリのバックグラウンドを削除してください。<br></br><br></br>
      </div>

      <div style={{ height: 14 }} />

      <button
        onClick={() => onRefresh?.()}
        style={{
          width: "100%",
          padding: "14px 12px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.18)",
          background: "#fff",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        更新
      </button>

      <div style={{ height: 10 }} />
      <div style={{ fontSize: 12, color: "#666", lineHeight: 1.7 }}>
        ※通信状況によっては時間がかかる場合があります
      </div>
    </div>
  );
}
