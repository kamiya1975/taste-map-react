// src/components/panels/MapGuidePanelContent.jsx
// マップガイド（マップの説明）パネル
// - 説明文 と 表示アイコン
import React from "react";

/* --- 説明文左の 小さなアイコン群（SVG/CSSで再現） --- */
// 二重丸（使われていない）
const IconCurrent = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill="none" stroke="#222" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="3" fill="#222" />
  </svg>
);
// 嗜好位置（しずく型）
const IconPin = ({ size = 22, fill = "#F7931E", stroke = "#FFFFFF", strokeWidth = 2, innerFill = "#FFFFFF" }) => (
  <svg width={size} height={size} viewBox="0 0 64 96" style={{ display: "block" }}>
    <path
      d="M32 4 C19 4 9 14 9 28 C9 47 32 79 32 79 C32 79 55 47 55 28 C55 14 45 4 32 4 Z"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
    <circle cx="32" cy="28" r="9" fill={innerFill} />
  </svg>
);
// 基準のワイン（コンパス）
const IconGuide = ({ size = 18 }) => (
  <img
    src={`${process.env.PUBLIC_URL || ""}/icons/icon-192.png`}
    alt=""
    width={size}
    height={size}
    style={{ display: "block" }}
  />
);
// 店舗商品（グレイドット）
const IconDot = ({ color = "#9aa0a6", size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill={color} />
  </svg>
);
// EC商品（オレンジ星形）
const IconStarOrange = ({ size = 12, color = "#F7931E" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <path
      d="M12 2.5l2.9 6.1 6.7.9-4.9 4.7 1.2 6.7-5.9-3.2-5.9 3.2 1.2-6.7-4.9-4.7 6.7-.9L12 2.5z"
      fill={color}
    />
  </svg>
);
// 配置範囲（四角斜線）
const IconArea = ({ size = 12 }) => (
  <div
    style={{
      width: size, height: size, borderRadius: 2,
      border: "1px solid rgba(0,0,0,.25)",
      background: "repeating-linear-gradient(45deg, rgba(0,0,0,.15) 0 2px, transparent 2px 6px)",
    }}
  />
);
// 評価（評価丸印と背景）
const IconSwirl = ({ size = 20 }) => (
  <img src={`${process.env.PUBLIC_URL || ""}/img/map-guide.svg`} alt="" width={size} height={size} />
);
// （使われていない）
const Row = ({ icon, children }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px" }}>
    <div style={{ width: 22, display: "flex", justifyContent: "center" }}>{icon}</div>
    <div style={{ fontSize: 14.5, lineHeight: 1.85, color: "#222" }}>{children}</div>
  </div>
);
// 味わいグループ（カラーパレット）
const IconColour = ({ size = 18 }) => (
  <img
    src={`${process.env.PUBLIC_URL || ""}/img/icon-colour.png`}
    alt=""
    width={size}
    height={size}
    style={{ display: "block" }}
  />
);
// バブル（グレイ下三角）
const IconBubbleTriangle = ({ size = 18, color = "#9aa0a6" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <path d="M12 18L5 8h14l-7 10z" fill={color} />
  </svg>
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
        <Row icon={<IconPin />}>
          あなたの現在の嗜好位置を示し、飲んだワインの評価によって変化していきます。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />

        <Row icon={<IconGuide />}>
          基準のワインの風味位置を示します。タップで印象評価スライダーが現れ、現在の嗜好位置の再生成ができます。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />

        <Row icon={<IconDot color="#9aa0a6" />}>
          周辺で購入できる（選んだ店舗の）ワインを示します。風味が近いワインは点が集まって見えます。タップで詳細を表示できます。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />

        <Row icon={<IconStarOrange />}>
          ECで購入できるワインを示します。タップで詳細を表示できます。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />

        <Row icon={<IconArea />}>
          ワインが配置されているおおよその範囲（目安）を示します。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />

        <Row icon={<IconSwirl />}>
          飲んで評価（◎）すると表示され、評価に応じて記号のサイズが変わります。評価によってあなたの現在の嗜好位置が変化していきます。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />

        <Row icon={<IconColour />}>
          味わいグループを色分けで示します。もう一度タップすると色分けが元に戻ります。
        </Row>
        <div style={{ height: 1, background: "#e6ded2" }} />

        <Row icon={<IconBubbleTriangle />}>
          各項目をタップすると、その要素が強い位置をバブルで示します。バブルが大きいほどその要素の特徴が出ています。
        </Row>
      </div>
    </div>
  );
}
