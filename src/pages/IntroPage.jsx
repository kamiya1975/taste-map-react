// src/pages/IntroPage.jsx
import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getGuestId } from "../utils/auth";

const PALETTE = {
  bg: "rgb(250,250,250)",     // R250
  ink: "rgb(81,81,81)",       // R81
  line: "rgb(206,206,206)",   // R206
};

/* ==============================
   スライド生成（ご指定そのまま）
   ============================== */
// eslint-disable-next-line no-unused-vars
function slides(
  formData,
  setFormData,
  handleChange,
  handleSubmit,
  handleStartAsGuest,
  agreeRef,
  agreeError,
  setAgreeError
) {
  const togglePassword = () =>
    setFormData((prev) => ({ ...prev, showPassword: !prev.showPassword }));

  return [
    {
      id: 1,
      color: PALETTE.bg,
      content: (
        <>
          <div
            style={{
              height: "clamp(160px, 24vh, 220px)",
              width: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              margin: "80px auto 30px auto",
            }}
          >
            <img
              src="/img/slide1.png"
              alt="基準のワイン"
              style={{
                maxWidth: "60%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
            />
          </div>
          <div style={{ marginTop: "80px" }}>
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
          <div
            style={{
              height: "clamp(160px, 24vh, 220px)",
              width: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              margin: "80px auto 30px auto",
            }}
          >
            <img
              src="/img/slide2.png"
              alt="TasteMap"
              style={{
                maxWidth: "60%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
            />
          </div>
          <div style={{ marginTop: "80px" }}>
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
  ];
}

export default function IntroPage() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollerRef = useRef(null);

  // 画面をトップへ・ゲストID用意
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  useEffect(() => {
    getGuestId();
  }, []);

  // スライド配列（今回フォーム等は使わないのでダミーを渡す）
  const allSlides = slides(
    {}, () => {}, () => {}, () => {}, () => {}, { current: null }, "", () => {}
  );

  const handleScroll = (e) => {
    const index = Math.round(e.target.scrollLeft / window.innerWidth);
    setCurrentIndex(index);
  };

  const goStore = () => navigate("/store");

  return (
    <div className="intro-wrapper" style={{ background: PALETTE.bg }}>
      {/* 横スクロールスライダー */}
      <div
        ref={scrollerRef}
        className="slides-container"
        onScroll={handleScroll}
      >
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
            <div style={{ width: "100%", maxWidth: 500, margin: "0 auto" }}>
              {slide.content}
            </div>
          </div>
        ))}
      </div>

      {/* ページインジケータ（既存CSS .indicator / .dot を利用） */}
      <div className="indicator">
        {allSlides.map((_, idx) => (
          <div key={idx} className={`dot ${idx === currentIndex ? "active" : ""}`} />
        ))}
      </div>

      {/* 下部の「店舗を選ぶへ」ボタン（既存CSS .footer-button を利用） */}
      <div className="footer-button">
        <button
          type="button"
          onClick={goStore}
          style={{
            padding: "12px 32px",
            fontSize: 18,
            border: `1px solid ${PALETTE.line}`,
            backgroundColor: "#fff",
            color: PALETTE.ink,
            borderRadius: 10,
            boxShadow: "0 4px 10px rgba(0,0,0,.1)",
          }}
        >
          店舗を選ぶへ
        </button>
      </div>
    </div>
  );
}
