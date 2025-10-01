// src/components/panels/MyPagePanel.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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
          padding: "26px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        {!!icon && <img src={icon} alt="" style={{ width: 25, height: 25 }} />}
        <span style={{ fontSize: 15, color: "#111" }}>{label}</span>
      </button>

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
  const [view, setView] = useState("menu"); // 'menu' | 'mapGuide' | 'faq'
  const navigate = useNavigate();
  const goMenu = () => setView("menu");

  if (!isOpen) return null;

  // ルーター遷移（押下時にパネルを閉じる）
  const go = (path) => {
    try {
      navigate(path);
    } finally {
      onClose?.();
    }
  };

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
      aria-modal="true"
      role="dialog"
    >
      {/* ヘッダー */}
      <PanelHeader
        title={
          view === "menu"
            ? "アプリガイド"
            : view === "mapGuide"
            ? "マップガイド"
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

            {/* —— ここから “活用ページ” への遷移 —— */}
            <Row
              icon="/img/slider.svg"
              label="基準のワイン（スライダー）"
              onClick={() => go("/slider")}
            />
            <Row
              icon="/img/account.svg"
              label="マイアカウント"
              onClick={() => go("/my-account")}
            />
            <Row
              icon="/img/store.svg"
              label="お気に入り店舗登録"
              onClick={() => go("/stores-fav")} 
            />
            {/* —— ここまで —— */}

            <Row
              icon="/img/faq.svg"
              label="よくある質問"
              onClick={() => setView("faq")}
              last
            />
          </>
        )}

        {view === "mapGuide" && (
          <section style={{ padding: "14px 16px", lineHeight: 1.7 }}>
            <p>
              基準のワインを出発点に、様々なワインを評価して自分の好みの位置を可視化します。
            </p>
            <ul style={{ paddingLeft: 18 }}>
              <li>ワインをタップすると詳細を表示</li>
              <li>評価済みのワインは記号サイズが変化</li>
              <li>範囲外へはズーム・パンで移動可能</li>
            </ul>
          </section>
        )}

        {view === "faq" && (
          <section style={{ padding: "14px 16px", lineHeight: 1.8 }}>
            <h3 style={{ fontSize: 16, margin: "6px 0 10px" }}>データの扱い</h3>
            <p style={{ margin: 0 }}>
              現在は DB 未接続のため、プロフィール・店舗・お気に入りは
              <code style={{ padding: "0 4px" }}>localStorage</code> に保存します。
              本番は管理ページAPI（FastAPI）に差し替え予定です。
            </p>

            <h3 style={{ fontSize: 16, margin: "16px 0 10px" }}>位置情報は必須？</h3>
            <p style={{ margin: 0 }}>
              許可しなくても利用できます（未許可時は東京駅近傍で並び替え）。
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
