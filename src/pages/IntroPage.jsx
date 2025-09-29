// src/pages/IntroPage.jsx
import React, { useEffect, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getGuestId } from "../utils/auth";

const PALETTE = {
  bg: "rgb(250,250,250)",     // R250
  ink: "rgb(81,81,81)",       // R81
  line: "rgb(206,206,206)",   // R206
};

export default function IntroPage() {
  const navigate = useNavigate();

  // 画面表示時は一旦トップへ
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // ゲストIDを端末に用意（なければ発行）
  useEffect(() => {
    getGuestId();
  }, []);

  const goNext = () => navigate("/store");

  return (
    <div
      className="intro-wrapper"
      style={{
        background: PALETTE.bg,
        minHeight: "100vh",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
      }}
    >
      <div
        className="slide"
        style={{
          backgroundColor: PALETTE.bg,
          width: "100vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          padding: "20px 16px",
          boxSizing: "border-box",
          overflowY: "auto",
        }}
      >
        <div style={{ width: "100%", maxWidth: 500, margin: "0 auto" }}>
          {/* ヘッダー説明 */}
          <h2
            style={{
              margin: "24px 0 12px",
              color: PALETTE.ink,
              fontWeight: 700,
              fontSize: 20,
              lineHeight: 1.5,
              textAlign: "left",
            }}
          >
            はじめに
          </h2>

          <p
            style={{
              margin: "0 0 24px",
              color: PALETTE.ink,
              lineHeight: 1.9,
              fontSize: 14,
              textAlign: "left",
            }}
          >
            まずは「基準のワイン」を購入した店舗を選びます。<br />
            その後、スライダーで味の印象を調整してマップを表示します。<br />
            評価を保存するタイミングで、ユーザー登録のご案内をします。
          </p>

          {/* イメージ（任意） */}
          <div
            style={{
              height: "clamp(140px, 22vh, 220px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "12px 0 24px",
              border: `1px dashed ${PALETTE.line}`,
              borderRadius: 12,
            }}
          >
            <span style={{ color: "#9aa0a6", fontSize: 12 }}>
              （ここに紹介画像を置く場合は /public/img に入れて差し替え）
            </span>
          </div>

          {/* 次へボタン */}
          <button
            type="button"
            onClick={goNext}
            style={{
              width: "100%",
              padding: "14px 18px",
              fontSize: 16,
              fontWeight: 600,
              background: "#e5e3db",
              color: "#000",
              border: "1px solid " + PALETTE.line,
              borderRadius: 12,
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,.05)",
            }}
          >
            店舗を選ぶへ
          </button>

          {/* 参考情報（任意） */}
          <p
            style={{
              margin: "12px 0 0",
              color: "#666",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            登録は後からでOK。評価の保存時にご案内します。
          </p>

          {/* フッターの余白（下部バーとドットのための安全域） */}
          <div style={{ height: "calc(env(safe-area-inset-bottom) + 32px)" }} />
        </div>
      </div>
    </div>
  );
}
