// src/pages/IntroPage.jsx
// イントロ（最初 横スライド アプリ解説）画面
// 2026.07.イベント後 すべて入替（横スワイプ3枚を2枚に変更、そのまま横スワイプで /store へ遷移）
import React, { useState, useLayoutEffect, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setGuest } from "../utils/auth";

// ===== Config =====
const TAP_ZONE_VW = 22; // ← タップゾーン幅（%）。狭くしたい場合は数値を下げる

// ===== Color Palette =====
const PALETTE = {
  bg: "rgb(250,250,250)",
  ink: "rgb(81,81,81)",
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
// スライド生成（説明1 / 説明2）
// ==============================
function slides() {
  return [
    {
      id: 1,
      color: PALETTE.bg,
      content: (
        <>
          <HeroImage
            filename="compass_logo.svg"
            alt="コンパス"
            maxWidthPct={48}
            boxHeight="clamp(80px, 16vh, 160px)"
            margin="64px auto 12px auto"
          />
          <HeroImage
            filename="基準のワイン.svg"
            alt="基準のワイン"
            maxWidthPct={65}
            boxHeight="clamp(56px, 9vh, 84px)"
            margin="24px auto 0 auto"
          />
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
          <HeroImage
            filename="map.svg"
            alt="地図"
            maxWidthPct={48}
            boxHeight="clamp(80px, 16vh, 160px)"
            margin="64px auto 12px auto"
          />
          <HeroImage
            filename="TasteMap.svg"
            alt="TasteMap"
            maxWidthPct={55}
            boxHeight="clamp(56px, 9vh, 84px)"
            margin="24px auto 0 auto"
          />
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
      content: null,
    },
  ];
}

// =========================
// メインコンポーネント
// =========================
export default function IntroPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();
  const scrollerRef = useRef(null);
  const hasNavigatedRef = useRef(false);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // 店舗選択へ進む
  const handleGoStore = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;

    setGuest();
    navigate("/store");
  }, [navigate]);

  const allSlides = slides();

  // スクロール位置から現在のインデックスを推定
  const handleScroll = (e) => {
    const w = window.innerWidth || document.documentElement.clientWidth;
    const index = Math.round(e.target.scrollLeft / Math.max(1, w));
    const clamped = Math.min(Math.max(index, 0), allSlides.length - 1);

    if (clamped >= allSlides.length - 1) {
      handleGoStore();
      return;
    }

    setCurrentIndex(clamped);
  };

  // スライド移動（プログラム制御）
  const scrollToIndex = useCallback(
    (index) => {
      const clamped = Math.min(Math.max(index, 0), allSlides.length - 1);
      const node = scrollerRef.current;
      if (!node) return;

      const w =
        node.getBoundingClientRect().width ||
        window.innerWidth ||
        document.documentElement.clientWidth;

      node.scrollTo({ left: clamped * w, behavior: "smooth" });
      setCurrentIndex(clamped);
    },
    [allSlides.length]
  );

  // 右タップ：
  // 1枚目では2枚目へ
  // 2枚目では店舗選択ページへ進む
  const nextSlide = useCallback(() => {
    if (currentIndex < allSlides.length - 1) {
      scrollToIndex(currentIndex + 1);
      return;
    }

    handleGoStore();
  }, [currentIndex, scrollToIndex, allSlides.length, handleGoStore]);

  // 左タップ：最初(= index=0)まで戻る
  const prevSlide = useCallback(() => {
    if (currentIndex > 0) {
      scrollToIndex(currentIndex - 1);
    }
  }, [currentIndex, scrollToIndex]);

  // キーボード操作（←/→）
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", onKey, { passive: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [nextSlide, prevSlide]);

  return (
    <div
      className="intro-wrapper"
      style={{
        position: "relative",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      <div
        ref={scrollerRef}
        className="slides-container"
        onScroll={handleScroll}
        style={{
          display: "flex",
          flexDirection: "row",
          width: "100vw",
          height: "100vh",
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <style>
          {`
            .slides-container::-webkit-scrollbar { display: none; }
            .tap-zone { -webkit-tap-highlight-color: rgba(0,0,0,0); }
          `}
        </style>

        {allSlides.map((slide) => (
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
              padding: "20px",
              boxSizing: "border-box",
              scrollSnapAlign: "start",
              flexShrink: 0,
              overflowY: "auto",
            }}
          >
            {slide.content}
          </div>
        ))}
      </div>

      {/* 右/左タップゾーン */}
      <>
        <button
          aria-label="前のページへ"
          onClick={prevSlide}
          onPointerDown={(e) => e.preventDefault()}
          onTouchEnd={(e) => {
            e.preventDefault();
            prevSlide();
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            prevSlide();
          }}
          style={{
            ...tapZoneStyle("left"),
            zIndex: 200,
            pointerEvents: "auto",
            touchAction: "manipulation",
          }}
          className="tap-zone"
        />
        <button
          aria-label="次のページへ"
          onClick={nextSlide}
          onPointerDown={(e) => e.preventDefault()}
          onTouchEnd={(e) => {
            e.preventDefault();
            nextSlide();
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            nextSlide();
          }}
          style={{
            ...tapZoneStyle("right"),
            zIndex: 200,
            pointerEvents: "auto",
            touchAction: "manipulation",
          }}
          className="tap-zone"
        />
      </>

      {/* インジケータ */}
      <div
        className="indicator"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "calc(120px + env(safe-area-inset-bottom))",
          display: "flex",
          justifyContent: "center",
          gap: 8,
          pointerEvents: "none",
          zIndex: 9999,
        }}
      >
        {allSlides.map((_, index) => (
          <div
            key={index}
            className={`dot ${index === currentIndex ? "active" : ""}`}
            style={{
              width: index === currentIndex ? 10 : 6,
              height: index === currentIndex ? 10 : 6,
              borderRadius: 999,
              background: index === currentIndex ? "#111" : "#c8c8c8",
              transition: "all .18s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** 画面左右のタップゾーンスタイル */
function tapZoneStyle(side = "left") {
  const base = {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: `${TAP_ZONE_VW}vw`,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    zIndex: 200,
    padding: 0,
    margin: 0,
    color: "transparent",
  };

  if (side === "left") return { ...base, left: 0 };
  if (side === "right") return { ...base, right: 0 };
  return base;
}
