// src/pages/FaqPage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../components/ui/PanelHeader";

export default function FaqPage() {
  const navigate = useNavigate();
  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", display: "flex", flexDirection: "column" }}>
      <PanelHeader
        title="よくある質問"
        onBack={() => navigate(-1)}
        onClose={() => navigate("/map?open=mypage", { replace: true })}
        icon="faq.svg"   // ★ ファイル名のみ
      />
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <details style={{ marginBottom: 12 }}>
          <summary>ログインできません</summary>
          <div style={{ marginTop: 8, color: "#333" }}>電波状況をご確認の上、再読み込みしてください。</div>
        </details>
        <details style={{ marginBottom: 12 }}>
          <summary>位置情報が取得できません</summary>
          <div style={{ marginTop: 8, color: "#333" }}>端末の設定で位置情報の許可を有効にしてください。</div>
        </details>
      </div>
    </div>
  );
}
