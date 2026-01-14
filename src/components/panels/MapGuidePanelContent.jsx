// src/components/panels/MapGuidePanelContent.jsx
// マップガイド（マップの説明）パネル
import React from "react";

/* --- 小さなアイコン群（SVG/CSSで再現） --- */
const IconCurrent = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill="none" stroke="#222" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="3" fill="#222" />
  </svg>
);
const IconDot = ({ color = "#9aa0a6", size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill={color} />
  </svg>
);
const IconSwirl = ({ size = 18 }) => (
  <img src={`${process.env.PUBLIC_URL || ""}/img/map-guide.svg`} alt="" width={size} height={size} />
);
const IconArea = ({ size = 16 }) => (
  <div
    style={{
      width: size, height: size, borderRadius: 2,
      border: "1px solid rgba(0,0,0,.25)",
      background: "repeating-linear-gradient(45deg, rgba(0,0,0,.15) 0 2px, transparent 2px 6px)",
    }}
  />
);

const Row = ({ icon, children }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px" }}>
    <div style={{ width: 22, display: "flex", justifyContent: "center" }}>{icon}</div>
    <div style={{ fontSize: 14.5, lineHeight: 1.85, color: "#222" }}>{children}</div>
  </div>
);

export default function MapGuidePanelContent() {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
      {/* 冒頭説明 */}
      <p style={{ margin: "6px 4px 12px", lineHeight: 1.9, fontSize: 14.5, color: "#222" }}>
        基準のワインを出発点に、様々なワインを評価しながら自分の好みの位置を育てていく——
        そんな“風味の地図”を歩くイメージで使えます。
      </p>

      {/* ライトカード */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e6ded2", overflow: "hidden" }}>
        <Row icon={<IconCurrent />}>
          あなたの現在の嗜好位置を示し、飲んだワインの評価によって変化します。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />

        <Row icon={<IconCurrent />}>
          新規追加：あなたの現在の嗜好位置を示し、飲んだワインの評価によって変化します。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />

        <Row icon={<IconDot color="#9aa0a6" />}>
          周辺で購入できるワインを示します。風味が近いワインは点が集まって見えます。タップで詳細を表示できます。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />
        <Row icon={<IconArea />}>
          ワインが配置されているおおよその範囲（目安）を示します。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />
        <Row icon={<IconDot color="#b35367" />}>
          「飲みたい」（★）に登録したワインです。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />
        <Row icon={<IconSwirl />}>
          飲んで評価（◎）すると表示され、評価に応じて記号のサイズが変わります。
        </Row>
      </div>
    </div>
  );
}
