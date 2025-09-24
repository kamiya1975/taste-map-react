import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadProfile, saveProfile } from "../utils/profile"; // ← 連動

// ✅ スタイル定義（最低限）
const styles = {
  label: {
    fontWeight: "bold",
    marginTop: 10,
    display: "block",
  },
  input: {
    padding: "10px",
    fontSize: "16px",
    width: "100%",
    border: "1px solid #ccc",
    borderRadius: "10px",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    backgroundColor: "#fff",
    backgroundImage: "none",
    boxSizing: "border-box",
    marginBottom: "10px",
  },
  eyeIcon: {
    position: "absolute",
    right: "10px",
    top: "12px",
    cursor: "pointer",
    fontSize: "16px",
  },
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
  opacity: 0.8,
};

// 横スライド UI のラッパークラスは App.css に既にあります（intro-wrapper / slides-container / slide / indicator / dot）

// スライド配列（見た目部分）
function slides(formData, setFormData, handleChange, handleSubmit, navigate) {
  const togglePassword = () =>
    setFormData((prev) => ({ ...prev, showPassword: !prev.showPassword }));

  return [
    {
      id: 1,
      color: "white",
      content: (
        <>
          <img
            src="/img/slide1.png"
            alt="基準のワイン"
            style={{ maxWidth: "60%", margin: "80px auto 30px auto" }}
          />
          <p style={{ lineHeight: "1.8em" }}>
            ワインの真ん中の味である<br />
            基準のワインを飲み<br />
            その味を基準に<br />
            自分の好みを知ることができます。
          </p>
          <p style={{ marginTop: 10 }}>その基準があなたのコンパスです。</p>
        </>
      ),
    },
    {
      id: 2,
      color: "white",
      content: (
        <>
          <img
            src="/img/slide2.png"
            alt="TasteMap"
            style={{ maxWidth: "60%", margin: "80px auto 30px auto" }}
          />
          <p style={{ lineHeight: "1.8em" }}>
            コンパスである基準のワインから発見した<br />
            あなたの好みに近いワインを飲んで評価し、<br />
            あなただけの地図を作りましょう。
          </p>
        </>
      ),
    },
    {
      id: 3,
      color: "white",
      content: (
        <>
          <p
            style={{
              marginBottom: "20px",
              fontSize: "16px",
              margin: "80px auto 30px auto",
            }}
          >
            あなたの地図を作り始めるには、まず登録から。
          </p>

          <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 400 }}>
            <label style={styles.label}>ニックネームとパスワードを登録</label>
            <input
              type="text"
              value={formData.nickname}
              onChange={handleChange("nickname")}
              style={styles.input}
              placeholder="ニックネーム"
            />

            <div style={{ position: "relative" }}>
              <input
                type={formData.showPassword ? "text" : "password"}
                value={formData.password}
                onChange={handleChange("password")}
                style={styles.input}
                placeholder="パスワードは4文字以上20文字以内"
              />
              <span style={styles.eyeIcon} onClick={togglePassword}>
                {formData.showPassword ? "●" : "-"}
              </span>
            </div>

            {/* 横並びラッパー */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {/* 生まれた年 */}
              <div style={{ flex: "1 1 30%" }}>
                <label style={styles.label}>生まれた年</label>
                <select
                  value={formData.birthYear}
                  onChange={handleChange("birthYear")}
                  style={styles.input}
                >
                  {Array.from({ length: 80 }, (_, i) => (2025 - i).toString()).map(
                    (year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* 生まれた月 */}
              <div style={{ flex: "1 1 30%" }}>
                <label style={styles.label}>生まれた月</label>
                <select
                  value={formData.birthMonth}
                  onChange={handleChange("birthMonth")}
                  style={styles.input}
                >
                  {Array.from({ length: 12 }, (_, i) =>
                    String(i + 1).padStart(2, "0")
                  ).map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>

              {/* 性別 */}
              <div style={{ flex: "1 1 30%" }}>
                <label style={styles.label}>性別</label>
                <select
                  value={formData.gender}
                  onChange={handleChange("gender")}
                  style={styles.input}
                >
                  <option value="男性">男性</option>
                  <option value="女性">女性</option>
                  <option value="その他">その他</option>
                </select>
              </div>
            </div>

            <div style={{ textAlign: "center", margin: "20px 0" }}>
              <input
                type="checkbox"
                id="agree"
                checked={formData.agreed}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, agreed: e.target.checked }))
                }
                style={{ marginRight: 8 }}
              />
              <label htmlFor="agree" style={{ fontSize: 14, color: "#333" }}>
                <a
                  href="/terms"
                  style={{ color: "#007bff" }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  利用規約
                </a>
                に同意します
              </label>
            </div>

            <button
              type="submit"
              style={{ ...buttonStyle, opacity: formData.agreed ? 1 : 0.5 }}
              disabled={!formData.agreed}
            >
              登録してはじめる
            </button>

            <button
              type="button"
              style={{ ...secondaryButtonStyle, opacity: formData.agreed ? 1 : 0.5 }}
              disabled={!formData.agreed}
              onClick={() => navigate("/store")}
            >
              ゲストとして試す（記録は保存されません）
            </button>
          </form>

          <p
            style={{
              fontSize: "12px",
              marginTop: "16px",
              color: "#666",
              textAlign: "center",
            }}
          >
            登録後は、設定画面からいつでも
            <br />
            ニックネーム変更や利用店舗の追加ができます。
          </p>
        </>
      ),
    },
  ];
}

export default function IntroPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    nickname: "",
    password: "",
    showPassword: false,
    birthYear: "",
    birthMonth: "",
    gender: "",
    agreed: false,
  });

  // 既存プロフィールの初期反映
  useEffect(() => {
    const prof = loadProfile();
    if (prof) {
      setFormData((prev) => ({
        ...prev,
        nickname: prof.nickname || "",
        birthYear: (prof.birth || "1990-01").split("-")[0],
        birthMonth: (prof.birth || "1990-01").split("-")[1],
        gender: prof.gender || "男性",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        birthYear: "1990",
        birthMonth: "01",
        gender: "男性",
      }));
    }
  }, []);

  const handleScroll = (e) => {
    const index = Math.round(e.target.scrollLeft / window.innerWidth);
    setCurrentIndex(index);
  };

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { nickname, password, birthYear, birthMonth, gender, agreed } =
      formData;

    if (!nickname || !password || !birthYear || !birthMonth || !gender) {
      alert("すべての項目を入力してください");
      return;
    }
    if (!agreed) {
      alert("利用規約に同意してください");
      return;
    }
    if (password.length < 4 || password.length > 20) {
      alert("パスワードは4文字以上20文字以内で入力してください");
      return;
    }

    const profile = {
      nickname,
      // ⚠︎ デモ保存：本番はハッシュ化やサーバー保存へ
      password,
      birth: `${birthYear}-${birthMonth}`,
      gender,
    };
    saveProfile(profile);
    navigate("/store");
  };

  const allSlides = slides(
    formData,
    setFormData,
    handleChange,
    handleSubmit,
    navigate
  );

  return (
    <div className="intro-wrapper">
      <div className="slides-container" onScroll={handleScroll}>
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
