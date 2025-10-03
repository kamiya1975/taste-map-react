// src/pages/MapGuidePage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../components/ui/PanelHeader";

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
  <img src="/img/map-guide.svg" alt="" width={size} height={size} />
);
const IconArea = ({ size = 16 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 2,
      border: "1px solid rgba(0,0,0,.25)",
      background:
        "repeating-linear-gradient(45deg, rgba(0,0,0,.15) 0 2px, transparent 2px 6px)",
    }}
  />
);

const Row = ({ icon, children }) => (
  <div
    style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      padding: "12px 14px",
    }}
  >
    <div style={{ width: 22, display: "flex", justifyContent: "center" }}>{icon}</div>
    <div style={{ fontSize: 14.5, lineHeight: 1.85, color: "#222" }}>{children}</div>
  </div>
);

export default function MapGuidePage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgb(250,250,250)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PanelHeader
        title="マップガイド"
        onBack={() => navigate(-1)}
        onClose={() => navigate("/map?open=mypage", { replace: true })}
        icon="map-guide.svg" // ← ファイル名のみ
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            padding: 16,
            background: "#f6f3ee",
            borderTop: "1px solid rgba(0,0,0,.06)",
            minHeight: "100%",
          }}
        >
          {/* 冒頭説明 */}
          <p
            style={{
              margin: "6px 4px 12px",
              lineHeight: 1.9,
              fontSize: 14.5,
              color: "#222",
            }}
          >
            基準のワインを出発点に、様々なワインを飲んで評価し
            自分の好みの位置を知りながら、自分だけの地図を完成させましょう。
          </p>

          {/* ライトカード */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e6ded2",
              overflow: "hidden",
            }}
          >
            <Row icon={<IconCurrent />}>
              あなたの現在の好みの位置を示し、飲んだワインの評価により変化します。
            </Row>
            <div style={{ height: 1, background: "#e6ded2" }} />

            <Row icon={<IconDot color="#9aa0a6" />}>
              周辺で購入できるワインを示します。味や香りにより点が集まります。
              タップするとワインの詳細が表示できます。
            </Row>
            <div style={{ height: 1, background: "#e6ded2" }} />

            <Row icon={<IconArea />}>ワインが配置されている範囲を示します。</Row>
            <div style={{ height: 1, background: "#e6ded2" }} />

            <Row icon={<IconDot color="#b35367" />}>
              「あとで飲む」に登録されているワインです。
            </Row>
            <div style={{ height: 1, background: "#e6ded2" }} />

            <Row icon={<IconSwirl />}>
              ワインを評価すると表示され、その評価によって記号のサイズが変わります。
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
}
