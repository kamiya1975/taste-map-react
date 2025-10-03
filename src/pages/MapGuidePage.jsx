// src/pages/MapGuidePage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../components/ui/PanelHeader";

export default function MapGuidePage() {
  const navigate = useNavigate();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgb(250,250,250)", display: "flex", flexDirection: "column" }}>
      <PanelHeader
        title="マップガイド"
        onBack={() => navigate(-1)}
        onClose={() => navigate("/map?open=mypage", { replace: true })}
        icon="map-guide.svg"   // ★ ファイル名のみ
      />
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <section style={{ padding: "8px 0" }}>
          <p style={{ lineHeight: 1.9, fontSize: 16 }}>
            基準のワインを出発点に、様々なワインを評価して自分の好みの位置を可視化します。
          </p>
          <ul style={{ lineHeight: 2, fontSize: 16, marginTop: 8 }}>
            <li>ワインをタップすると詳細を表示</li>
            <li>評価済みのワインは記号サイズが変化</li>
            <li>範囲外へはズーム・パンで移動可能</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
