// src/components/panels/RefreshPanelContent.jsx
// 更新ボタンパネル
import React from "react";

export default function RefreshPanelContent({ onRefresh }) {
  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "16px auto" }}>
      <div style={{ fontSize: 14.5, lineHeight: 1.9, color: "#222" }}>
        検査により随時打点や店舗を増やしていきます。反映させるため定期的に更新ボタンを押してください。<br></br><br></br>
        また、通信状況により即時反映されない場合があります。その時は更新ボタンを押すか、アプリのバックグラウンド削除をお試しください。
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
