// src/components/panels/RefreshPanelContent.jsx
// 更新ボタンパネル
import React from "react";

export default function RefreshPanelContent({ onRefresh }) {
  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "12px auto" }}>
      <div style={{ fontSize: 14.5, lineHeight: 1.9, color: "#222" }}>
        今後も検査により打点や店舗を随時増やしていきます。<br></br><br></br>
        環境により即時反映されない場合がありますので、定期的に下の更新ボタンを押すか、バックグラウンドを削除してください。
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

      <div style={{ height: 30 }} />
      <div style={{ marginTop: 14, fontSize: 12, color: "#666", lineHeight: 1.7, textAlign: "center" }}>
        ※ボタンを押しても反応がない場合はそのままにし、アプリを閉じてしばらく経ってから再度アプリを開くと反映されます
      </div>
    </div>
  );
}
