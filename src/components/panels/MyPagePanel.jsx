// src/components/panels/MyPagePanel.jsx
import React, { useState } from "react";
import PanelHeader from "../ui/PanelHeader";

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
          padding: "14px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <img src={icon} alt="" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 15, color: "#111" }}>{label}</span>
      </button>
      {/* --- 罫線（全幅に通す） --- */}
      {!last && (
        <div
          style={{
            height: 1,
            background: "rgba(0,0,0,0.12)",
            width: "100%",
          }}
        />
      )}
    </div>
  );
}

/* =========================
   メイン：MyPagePanel
   ========================= */
export default function MyPagePanel({ isOpen, onClose }) {
  const [view, setView] = useState("menu"); // menu | mapGuide | baseline | account | favorites | faq
  const goMenu = () => setView("menu");

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "#fff",
        zIndex: 1500,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ヘッダー */}
      <PanelHeader
        title={
          view === "menu"
          ? "アプリガイド"
          : view === "mapGuide"
          ? "マップガイド"
          : view === "baseline"
          ? "基準のワイン 再設定"
          : view === "account"
          ? "マイアカウント"
          : view === "favorites"
          ? "お気に入り店舗登録"
          : "よくある質問"
        }
        onClose={onClose}
        onBack={view === "menu" ? undefined : goMenu}
        icon="compass.png"
       />

      {/* 本文 */}
      <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
        {view === "menu" && (
          <>
            <Row
              icon="/img/map-guide.svg"
              label="マップガイド"
              onClick={() => setView("mapGuide")}
            />
            <Row
              icon="/img/compass.png"
              label="基準のワイン 再設定"
              onClick={() => setView("baseline")}
            />
            <Row
              icon="/img/account.svg"
              label="マイアカウント"
              onClick={() => setView("account")}
            />
            <Row
              icon="/img/store.svg"
              label="お気に入り店舗登録"
              onClick={() => setView("favorites")}
            />
            <Row
              icon="/img/faq.svg"
              label="よくある質問"
              onClick={() => setView("faq")}
              last
            />
          </>
        )}

        {view === "mapGuide" && (
          <section style={{ padding: "14px 16px" }}>
            <p>マップの見方を解説するセクションです。</p>
          </section>
        )}
        {view === "baseline" && (
          <section style={{ padding: "14px 16px" }}>
            <p>基準のワイン（スライダー再設定）ページ。</p>
          </section>
        )}
        {view === "account" && (
          <section style={{ padding: "14px 16px" }}>
            <p>アカウント編集ページ。</p>
          </section>
        )}
        {view === "favorites" && (
          <section style={{ padding: "14px 16px" }}>
            <p>お気に入り店舗の登録ページ。</p>
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
