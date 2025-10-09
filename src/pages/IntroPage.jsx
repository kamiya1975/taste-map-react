// src/pages/IntroPage.jsx
import React, { useState, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setGuest } from "../utils/auth";

// ===== Color Palette =====
const PALETTE = {
  bg: "rgb(250,250,250)",
  ink: "rgb(81,81,81)",
};

const buttonStyle = {
  padding: "12px",
  fontSize: "16px",
  backgroundColor: "#e5e3db",
  color: "#000",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  marginTop: "16px",
  width: "100%",
};

// ==============================
// 画像ヘルパー & ヒーローイメージ
// ==============================
const imgSrc = (filename) => `/img/${encodeURIComponent(filename)}`;

function HeroImage({
  filename,
  alt,
  maxWidthPct = 70,
  boxHeight = "clamp(180px, 26vh, 240px)",
  margin = "80px auto 30px auto",
}) {
  return (
    <div
      style={{
        height: boxHeight,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        margin,
      }}
    >
      <img
        src={imgSrc(filename)}
        alt={alt}
        style={{
          maxWidth: `${maxWidthPct}%`,
          maxHeight: "100%",
          objectFit: "contain",
          display: "block",
        }}
        loading="eager"
      />
    </div>
  );
}

// ==============================
// スライド生成（説明1 / 説明2 / 説明3[店舗選択]）
// ==============================
function slides(handleGoStore) {
  return [
    {
      id: 1,
      color: PALETTE.bg,
      content: (
        <>
          {/* ▶ コンパス（上） */}
          <HeroImage
            filename="compass_logo.svg"
            alt="コンパス"
            maxWidthPct={48}
            boxHeight="clamp(80px, 16vh, 160px)"
            margin="64px auto 12px auto"
          />
          {/* ▶ タイトル「基準のワイン」（中） */}
          <HeroImage
            filename="基準のワイン.svg"
            alt="基準のワイン"
            maxWidthPct={65}
            boxHeight="clamp(56px, 9vh, 84px)"
            margin="24px auto 0 auto"
          />
          {/* ▶ 説明文（下） */}
          <div style={{ marginTop: "64px" }}>
            <p
              style={{
                lineHeight: "1.9em",
                color: PALETTE.ink,
                fontSize: "11pt",
                textAlign: "center",
              }}
            >
              ワインの真ん中の味である<br />
              基準のワインを飲み<br />
              その味を基準に<br />
              自分の好みを知ることができます。
            </p>
            <p
              style={{
                marginTop: "20px",
                color: PALETTE.ink,
                textAlign: "center",
              }}
            >
              その基準があなたの
              <span style={{ fontWeight: 600 }}>コンパス</span>です。
            </p>
          </div>
        </>
      ),
    },
    {
      id: 2,
      color: PALETTE.bg,
      content: (
        <>
          {/* ▶ 地図（上） */}
          <HeroImage
            filename="地図.svg"
            alt="地図"
            maxWidthPct={48}
            boxHeight="clamp(80px, 16vh, 160px)"
            margin="64px auto 12px auto"
          />
          {/* ▶ タイトル「TasteMap」（中） */}
          <HeroImage
            filename="TasteMap.svg"
            alt="TasteMap"
            maxWidthPct={55}
            boxHeight="clamp(56px, 9vh, 84px)"
            margin="24px auto 0 auto"
          />
          {/* ▶ 説明文（下） */}
          <div style={{ marginTop: "64px" }}>
            <p
              style={{
                lineHeight: "1.9em",
                color: PALETTE.ink,
                fontSize: "11pt",
                textAlign: "center",
              }}
            >
              コンパスである基準のワインから<br />
              発見したあなたの好みに近いワインを<br />
              飲んで評価し、<br />
              <br />
            </p>
            <p
              style={{
                marginTop: "20px",
                color: PALETTE.ink,
                textAlign: "center",
              }}
            >
              あなただけの<span style={{ fontWeight: 600 }}>地図</span>
              を作りましょう。
            </p>
          </div>
        </>
      ),
    },
    {
      id: 3,
      color: PALETTE.bg,
      content: (
        <>
          {/* ▶ 店舗（上） */}
          <HeroImage
            //filename=""
            alt="店舗"
            maxWidthPct={42}
            boxHeight="clamp(80px, 16vh, 160px)"
            margin="64px auto 12px auto"
          />

          {/* ▶ タイトル（中） */}
          <HeroImage
            //filename=""
            alt="店舗選択"
            maxWidthPct={58}
            boxHeight="clamp(48px, 8vh, 72px)"
            margin="12px auto 0 auto"
          />

          {/* ▶ 説明文（下） */}
          <div style={{ width: "100%", maxWidth: 420, margin: "40px auto 0" }}>
            <p style={{ lineHeight: "1.9em", color: PALETTE.ink, fontSize: "11pt", textAlign: "center" }}>
              あなたの地図を作り始めるには、まずは<br />
              <b>基準のワインを購入した「店舗」を選択</b>します。<br />
              店舗を固定して地図作成をスタートしましょう。
            </p>

            {/* ▶ ボタン：店舗選択（ゲストで進む） */}
            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={handleGoStore}
                style={buttonStyle}
                aria-label="店舗選択へ進む"
                title="店舗選択へ進む"
              >
                店舗選択
              </button>
              <div style={{ marginTop: 10, fontSize: 12, color: "#6e6e73", textAlign: "center" }}>
                ※ ゲストで開始し、評価時にアカウント作成して保存します
              </div>
            </div>
          </div>
        </>
      ),
    },
  ];
}

// =========================
// メインコンポーネント
// =========================
export default function IntroPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const handleScroll = (e) => {
    const index = Math.round(e.target.scrollLeft / window.innerWidth);
    setCurrentIndex(index);
  };

  // 「店舗選択」：ゲストで入って StorePage へ
  const handleGoStore = () => {
    setGuest();          // ゲストフラグを立てる（utils/auth）
    navigate("/store");  // 固定店舗選択ページへ
  };

  const allSlides = slides(handleGoStore);

  return (
    <div className="intro-wrapper">
      <div className="slides-container" onScroll={handleScroll}>
        {allSlides.map((slide) => {
          const isTight = slide.id === 3;
          return (
            <div
              key={slide.id}
              className="slide"
              style={{
                backgroundColor: slide.color,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100vw",
                height: "100vh",
                padding: isTight ? "8px 16px 16px" : "20px",
                boxSizing: "border-box",
                scrollSnapAlign: "start",
                flexShrink: 0,
                overflowY: "auto",
              }}
            >
              {slide.content}
            </div>
          );
        })}
      </div>
      <div className="indicator">
        {allSlides.map((_, index) => (
          <div key={index} className={`dot ${index === currentIndex ? "active" : ""}`} />
        ))}
      </div>
    </div>
  );
}
