// src/pages/IntroPage.jsx
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setGuest, setUserId } from "../utils/auth";

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
  marginTop: "20px",
  width: "100%",
};

const secondaryButtonStyle = {
  padding: "12px",
  fontSize: "14px",
  backgroundColor: "#bbb",
  color: "#fff",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  marginTop: "10px",
  width: "100%",
  opacity: 0.9,
};

// 共通 input スタイル
const VALUE_INPUT = {
  width: "100%",
  fontSize: 14,
  padding: "8px",
  border: "1px solid #ccc",
  borderRadius: "6px",
  backgroundColor: "#fff",
  color: "#1c1c1e",
  boxSizing: "border-box",
  appearance: "none",
};

// メール簡易バリデータ
const isEmail = (s) => /^\S+@\S+\.\S+$/.test(String(s || "").trim());

// ==============================
// スライド生成
// ==============================
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
    {
      id: 3,
      color: PALETTE.bg,
      content: (
        <>
          <div
            style={{
              width: "100%",
              maxWidth: 400,
              margin: "10px auto 0 auto",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 80px)",
            }}
          >
            <p
              style={{
                margin: "24px 0 12px",
                fontSize: "16px",
                color: PALETTE.ink,
                textAlign: "left",
              }}
            >
              あなたの地図を作り始めるには、まず登録から。
            </p>

            <form onSubmit={handleSubmit} style={{ width: "100%" }}>
              {/* ニックネーム */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 8,
                  padding: "12px 14px",
                  borderBottom: "1px solid #e5e5ea",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>ニックネーム</div>
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={handleChange("nickname")}
                  style={{ ...VALUE_INPUT }}
                  placeholder="-"
                />
              </div>

              {/* ID（メール） */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 8,
                  padding: "12px 14px",
                  borderBottom: "1px solid #e5e5ea",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>ID（メール）</div>
                <input
                  type="email"
                  value={formData.email}
                  onChange={handleChange("email")}
                  style={{ ...VALUE_INPUT }}
                  placeholder="-"
                />
              </div>

              {/* パスワード */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 8,
                  padding: "12px 14px",
                  borderBottom: "1px solid #e5e5ea",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>パスワード</div>
                <div style={{ position: "relative" }}>
                  <input
                    type={formData.showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleChange("password")}
                    style={{ ...VALUE_INPUT, paddingRight: "32px" }}
                    placeholder="4〜20文字"
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      cursor: "pointer",
                    }}
                    onClick={togglePassword}
                  >
                    {formData.showPassword ? "●" : "◯"}
                  </span>
                </div>
              </div>

              {/* 生まれ年 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 8,
                  padding: "12px 14px",
                  borderBottom: "1px solid #e5e5ea",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>生まれ年</div>
                <select
                  value={formData.birthYear}
                  onChange={handleChange("birthYear")}
                  style={{ ...VALUE_INPUT }}
                >
                  <option value="">-</option>
                  {Array.from({ length: 80 }, (_, i) =>
                    (new Date().getFullYear() - 20 - i).toString()
                  ).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              {/* 生まれ月 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 8,
                  padding: "12px 14px",
                  borderBottom: "1px solid #e5e5ea",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>生まれ月</div>
                <select
                  value={formData.birthMonth}
                  onChange={handleChange("birthMonth")}
                  style={{ ...VALUE_INPUT }}
                >
                  <option value="">-</option>
                  {Array.from({ length: 12 }, (_, i) =>
                    String(i + 1).padStart(2, "0")
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* 性別 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 8,
                  padding: "12px 14px",
                  borderBottom: "1px solid #e5e5ea",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>性別</div>
                <select
                  value={formData.gender}
                  onChange={handleChange("gender")}
                  style={{ ...VALUE_INPUT }}
                >
                  <option value="">-</option>
                  <option value="男性">男性</option>
                  <option value="女性">女性</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              {/* 規約チェック */}
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <input
                  type="checkbox"
                  id="agree"
                  checked={formData.agreed}
                  ref={agreeRef}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData((prev) => ({ ...prev, agreed: checked }));
                    if (checked) setAgreeError("");
                  }}
                  style={{ marginRight: "8px" }}
                />
                <label
                  htmlFor="agree"
                  style={{ fontSize: "14px", color: "#333" }}
                >
                  <a
                    href="/terms"
                    style={{
                      color: "rgb(81,81,81)",
                      textDecoration: "underline",
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    利用規約
                  </a>
                  に同意します
                </label>
                <div
                  aria-live="polite"
                  style={{ height: 18, marginTop: 8, overflow: "hidden" }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "crimson",
                      lineHeight: "18px",
                      opacity: agreeError ? 1 : 0,
                      transition: "opacity 160ms",
                    }}
                  >
                    {agreeError || "\u00A0"}
                  </div>
                </div>
              </div>

              {/* 登録ボタン */}
              <button
                type="submit"
                style={{ ...buttonStyle, opacity: formData.agreed ? 1 : 0.5 }}
                disabled={!formData.agreed}
              >
                登録してはじめる
              </button>

              {/* ゲストボタン */}
              <button
                type="button"
                style={{
                  ...secondaryButtonStyle,
                  opacity: 1,
                  cursor: "pointer",
                }}
                onClick={handleStartAsGuest}
              >
                ゲストとして試す（記録は保存されません）
              </button>
            </form>
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
  const agreeRef = useRef(null);
  const [agreeError, setAgreeError] = useState("");

  const [formData, setFormData] = useState({
    nickname: "",
    email: "",
    password: "",
    showPassword: false,
    birthYear: "",
    birthMonth: "",
    gender: "",
    agreed: false,
  });

  // 初期保存値を復元
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      nickname: localStorage.getItem("user.nickname") || "",
      email: localStorage.getItem("user.id") || "",
      birthYear: localStorage.getItem("user.birthYear") || "",
      birthMonth: localStorage.getItem("user.birthMonth") || "",
      gender: localStorage.getItem("user.gender") || "",
    }));
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const handleScroll = (e) => {
    const index = Math.round(e.target.scrollLeft / window.innerWidth);
    setCurrentIndex(index);
  };

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const scrollAgreeIntoViewIfNeeded = () => {
    const el = agreeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const inView = r.top >= 0 && r.bottom <= vh;
    if (!inView) {
      el.scrollIntoView({ behavior: "auto", block: "center" });
    }
  };

  const handleStartAsGuest = () => {
    if (!formData.agreed) {
      setAgreeError("利用規約をお読みのうえ、同意にチェックしてください。");
      scrollAgreeIntoViewIfNeeded();
      return;
    }
    setAgreeError("");
    setGuest();
    navigate("/store");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { nickname, email, password, birthYear, birthMonth, gender, agreed } =
      formData;

    if (
      !nickname ||
      !email ||
      !password ||
      !birthYear ||
      !birthMonth ||
      !gender
    ) {
      alert("すべての項目を入力してください");
      return;
    }
    if (!agreed) {
      setAgreeError("利用規約をお読みのうえ、同意にチェックしてください。");
      scrollAgreeIntoViewIfNeeded();
      return;
    }
    if (!isEmail(email)) {
      alert("メールアドレス（ID）の形式が正しくありません");
      return;
    }
    if (password.length < 4 || password.length > 20) {
      alert("パスワードは4文字以上20文字以内で入力してください");
      return;
    }

    try {
      localStorage.setItem("user.nickname", nickname);
      localStorage.setItem("user.id", email);
      localStorage.setItem("user.birthYear", birthYear);
      localStorage.setItem("user.birthMonth", birthMonth);
      localStorage.setItem("user.gender", gender);
      localStorage.setItem("user.pass", password);
    } catch {}

    setUserId(email);
    navigate("/store");
  };

  const allSlides = slides(
    formData,
    setFormData,
    handleChange,
    handleSubmit,
    handleStartAsGuest,
    agreeRef,
    agreeError,
    setAgreeError
  );

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
          <div
            key={index}
            className={`dot ${index === currentIndex ? "active" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
