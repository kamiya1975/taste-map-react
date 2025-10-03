// src/components/panels/MyPagePanel.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../ui/PanelHeader";

/* =========================
   画像パス（CRA: PUBLIC_URL使用）
   ========================= */
const ICONS = {
  compass: `${process.env.PUBLIC_URL}/img/compass.png`,
  mapGuide: `${process.env.PUBLIC_URL}/img/map-guide.svg`,
  account: `${process.env.PUBLIC_URL}/img/account.svg`,
  store:   `${process.env.PUBLIC_URL}/img/store.svg`,
  faq:     `${process.env.PUBLIC_URL}/img/faq.svg`,
};

/* =========================
   メニュー行（罫線あり）
   ========================= */
function Row({ icon, label, onClick, last = false }) {
  return (
    <div style={{ width: "100%" }}>
      <button
        onClick={onClick}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "30px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <img src={icon} alt="" style={{ width: 25, height: 25 }} />
        <span style={{ fontSize: 15, color: "#111" }}>{label}</span>
      </button>
      {!last && (
        <div
          style={{ height: 1, background: "rgba(0,0,0,0.12)", width: "100%" }}
        />
      )}
    </div>
  );
}

/* =========================
   メイン：MyPagePanel
   ========================= */
export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  const navigate = useNavigate();

  const [stack, setStack] = useState(["menu"]);
  const view = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const titles = useMemo(
    () => ({
      menu: "アプリガイド",
      mapGuide: "マップガイド",
      baseline: "基準のワイン 再設定",
      account: "マイアカウント",
      favorites: "お気に入り店舗登録",
      faq: "よくある質問",
    }),
    []
  );

  const push = (v) => setStack((s) => [...s, v]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const handleCloseX = () => { if (canGoBack) pop(); else onClose?.(); };
  const handleBack = canGoBack ? pop : undefined;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#fff",
        zIndex: 1500,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ヘッダー（← と × の挙動） */}
      <PanelHeader
        title={titles[view] || "アプリガイド"}
        onClose={handleCloseX}
        onBack={handleBack}
        icon={ICONS.compass}
      />

      {/* 本文 */}
      <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
        {view === "menu" && (
          <>
            <Row
              icon={ICONS.mapGuide}
              label="マップガイド"
              onClick={() => push("mapGuide")}
            />
            <Row
              icon={ICONS.compass}
              label="基準のワイン 再設定"
              onClick={() => {
                if (onOpenSlider) onOpenSlider();
                else navigate("/slider", { state: { from: "mypage" } });
              }}
            />
            <Row
              icon={ICONS.account}
              label="マイアカウント"
              onClick={() => navigate("/my-account")}
            />
            <Row
              icon={ICONS.store}
              label="お気に入り店舗登録"
              onClick={() => navigate("/stores-fav")}
            />
            <Row
              icon={ICONS.faq}
              label="よくある質問"
              onClick={() => push("faq")}
              last
            />
          </>
        )}

        {view === "mapGuide" && (
          <section style={{ padding: "14px 16px" }}>
            <p style={{ lineHeight: 1.9, fontSize: 16 }}>
              基準のワインを出発点に、様々なワインを評価して自分の好みの位置を可視化します。
            </p>
            <ul style={{ lineHeight: 2, fontSize: 16, marginTop: 8 }}>
              <li>ワインをタップすると詳細を表示</li>
              <li>評価済みのワインは記号サイズが変化</li>
              <li>範囲外へはズーム・パンで移動可能</li>
            </ul>
          </section>
        )}

        {view === "faq" && (
          <section style={{ padding: "14px 16px" }}>
            <p>よくある質問ページ。</p>
          </section>
        )}
      </div>
    </div>
  );
}
