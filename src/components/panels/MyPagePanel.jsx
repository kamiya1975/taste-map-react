// src/components/panels/MyPagePanel.jsx
import React, { useState, useEffect } from "react";

/* =========================
   共通UI
   ========================= */
function Header({ title, onClose, onBack, icon }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: "1px solid rgba(0,0,0,0.1)",
        background: "#E5DED3", // タイトル背景（ベージュ系）
      }}
    >
      {onBack ? (
        <button
          onClick={onBack}
          aria-label="戻る"
          style={{ background: "transparent", border: "none", fontSize: 18, padding: 6, cursor: "pointer" }}
        >
          ←
        </button>
      ) : (
        <img src={icon} alt="" style={{ width: 28, height: 28 }} />
      )}
      <div style={{ fontWeight: 700, fontSize: 15, flex: 1, color: "#111" }}>{title}</div>
      <button
        onClick={onClose}
        aria-label="閉じる"
        style={{ background: "transparent", border: "none", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 6 }}
      >
        ×
      </button>
    </div>
  );
}

function Row({ icon, label, onClick }) {
  return (
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
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img src={icon} alt="" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 15, color: "#111" }}>{label}</span>
      </div>
    </button>
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
      <Header
        title={
          view === "menu" ? "アプリガイド" :
          view === "mapGuide" ? "マップガイド" :
          view === "baseline" ? "基準のワイン 再設定" :
          view === "account" ? "マイアカウント" :
          view === "favorites" ? "お気に入り店舗登録" :
          "よくある質問"
        }
        onClose={onClose}
        onBack={view === "menu" ? undefined : goMenu}
        icon="/icons/app-guide.svg"
      />

      {/* 本文 */}
      <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
        {view === "menu" && (
          <>
            <Row icon="/public/img/map-guide.svg" label="マップガイド" onClick={() => setView("mapGuide")} />
            <Row icon="/public/img//compass.png" label="基準のワイン 再設定" onClick={() => setView("baseline")} />
            <Row icon="/public/img/account.svg" label="マイアカウント" onClick={() => setView("account")} />
            <Row icon="/public/img/store.svg" label="お気に入り店舗登録" onClick={() => setView("favorites")} />
            <Row icon="/public/img/faq.svg" label="よくある質問" onClick={() => setView("faq")} />
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
