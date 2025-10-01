// src/components/panels/MyPagePanel.jsx
import React, { useState } from "react";

// public配下の実URLヘルパ（デプロイ先がサブパスでも安全）
const pub = (p) => `${process.env.PUBLIC_URL || ""}${p}`;

/* 1行（アイコン + ラベル + インセット罫線） */
function Row({ icon, label, onClick, last = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "14px 18px 12px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        display: "block",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img src={pub(icon)} alt="" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 15, color: "#111" }}>{label}</span>
      </div>
      {/* インセットの罫線（両端を少し切る） */}
      {!last && (
        <div
          style={{
            marginTop: 14,
            marginLeft: 16,          // ← 左右を少し切る
            marginRight: 16,
            height: 1,
            background: "rgba(0,0,0,0.12)",
          }}
        />
      )}
    </button>
  );
}

export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  const [view, setView] = useState("menu"); // menu | mapGuide | baseline | account | favorites | faq
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        background: "rgba(0,0,0,0.08)", // 薄いオーバーレイ（好みで調整）
        display: "flex",
      }}
      onClick={onClose}
    >
      {/* ====== 中身の“シート”：幅を 86vw / max 480 に限定（他ページと同じ） ====== */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "86vw",
          maxWidth: 480,
          height: "100%",
          background: "#fff",
          borderRadius: "0 12px 12px 0",
          boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ヘッダー（シート幅に合わせて狭い） */}
        <div
          style={{
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: "1px solid rgba(0,0,0,0.10)",
            background: "#E5DED3",
            borderTopRightRadius: 12,
          }}
        >
          <img
            src={pub("/img/compass.png")}
            alt=""
            style={{ width: 26, height: 26 }}
          />
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1, color: "#111" }}>
            アプリガイド
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "transparent",
              border: "none",
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
              padding: 6,
            }}
          >
            ×
          </button>
        </div>

        {/* 本文（メニュー） */}
        <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
          <Row
            icon="/img/map-guide.svg"
            label="マップガイド"
            onClick={() => setView("mapGuide")}
          />
          <Row
            icon="/img/compass.png"
            label="基準のワイン 再設定"
            onClick={() => {
              if (onOpenSlider) { onClose?.(); onOpenSlider(); }
              else { setView("baseline"); }
            }}
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
        </div>
      </div>
    </div>
  );
}
