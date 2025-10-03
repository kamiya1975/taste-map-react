// src/pages/MyAccount.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../components/ui/PanelHeader";

const isEmail = (s) => /^\S+@\S+\.\S+$/.test(String(s || "").trim());

/* —— 共通: 枠なし入力コンポーネント —— */
const BorderlessInput = (props) => (
  <input
    {...props}
    style={{
      fontSize: 16,           // iOSのズーム回避
      width: "100%",
      padding: 0,             // 余白は親側の行で担保
      border: "none",
      outline: "none",
      background: "transparent",
      WebkitAppearance: "none",
      appearance: "none",
      color: "#111",
      lineHeight: 1.5,
      ...props.style,
    }}
  />
);

const BorderlessSelect = ({ rightIcon = true, ...props }) => (
  <div style={{ position: "relative" }}>
    <select
      {...props}
      style={{
        fontSize: 16,
        width: "100%",
        paddingRight: rightIcon ? 22 : 0,
        border: "none",
        outline: "none",
        background: "transparent",
        WebkitAppearance: "none",
        appearance: "none",
        color: "#111",
        lineHeight: 1.5,
      }}
    />
    {rightIcon && (
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 2,
          top: "50%",
          transform: "translateY(-50%) rotate(90deg)",
          color: "#9aa0a6",
          fontSize: 14,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        ⌵
      </span>
    )}
  </div>
);

export default function MyAccount() {
  const navigate = useNavigate();

  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [gender, setGender] = useState("");

  useEffect(() => {
    try {
      setNickname(localStorage.getItem("user.nickname") || "");
      setEmail(localStorage.getItem("user.id") || "");
      setBirthYear(localStorage.getItem("user.birthYear") || "");
      setBirthMonth(localStorage.getItem("user.birthMonth") || "");
      setGender(localStorage.getItem("user.gender") || "");
    } catch {}
  }, []);

  const handleSave = () => {
    if (!nickname || !email || !birthYear || !birthMonth || !gender) {
      alert("すべての項目を入力してください");
      return;
    }
    if (!isEmail(email)) {
      alert("メールアドレス（ID）の形式が正しくありません");
      return;
    }
    if (password && (password.length < 4 || password.length > 20)) {
      alert("パスワードは4〜20文字です");
      return;
    }
    try {
      localStorage.setItem("user.nickname", nickname.trim());
      localStorage.setItem("user.id", email.trim());
      localStorage.setItem("user.birthYear", birthYear);
      localStorage.setItem("user.birthMonth", birthMonth);
      localStorage.setItem("user.gender", gender);
      if (password) localStorage.setItem("user.pass", password);
      setPassword("");
      alert("保存しました。");
    } catch {
      alert("保存に失敗しました。");
    }
  };

  // 見た目
  const wrap = { position: "fixed", inset: 0, background: "rgb(250,250,250)", display: "flex", flexDirection: "column" };
  const body = { flex: 1, overflowY: "auto", padding: 16 };
  const card = { background: "#fff", border: "1px solid #e7e7e7", borderRadius: 12, overflow: "hidden", maxWidth: 560, margin: "0 auto" };
  const row = { display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "center", padding: "16px", borderBottom: "1px solid #eee" };
  const label = { fontSize: 13, color: "#666" };

  return (
    <div style={wrap}>
      <PanelHeader
        title="マイアカウント"
        onBack={() => navigate(-1)}
        onClose={() => navigate("/map?open=mypage", { replace: true })}
        icon="account.svg"
      />

      <div style={body}>
        <div style={card}>
          {/* ニックネーム */}
          <div style={row}>
            <div style={label}>ニックネーム</div>
            <BorderlessInput
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="−"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          {/* ID（メール） */}
          <div style={row}>
            <div style={label}>ID（メール）</div>
            <BorderlessInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="−"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          {/* パスワード（任意入力で更新） */}
          <div style={row}>
            <div style={label}>パスワード</div>
            <div style={{ position: "relative" }}>
              <BorderlessInput
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="4〜20文字（空欄なら変更なし）"
                style={{ paddingRight: 28 }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label="パスワード表示切替"
                title="パスワード表示切替"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 16,
                  color: "#3a7",
                }}
              >
                {showPassword ? "●" : "◯"}
              </button>
            </div>
          </div>

          {/* 生まれ年 */}
          <div style={row}>
            <div style={label}>生まれ年</div>
            <BorderlessSelect value={birthYear} onChange={(e) => setBirthYear(e.target.value)}>
              <option value="">−</option>
              {Array.from({ length: 80 }, (_, i) =>
                (new Date().getFullYear() - 20 - i).toString()
              ).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </BorderlessSelect>
          </div>

          {/* 生まれ月 */}
          <div style={row}>
            <div style={label}>生まれ月</div>
            <BorderlessSelect value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)}>
              <option value="">−</option>
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </BorderlessSelect>
          </div>

          {/* 性別 */}
          <div style={{ ...row, borderBottom: "none" }}>
            <div style={label}>性別</div>
            <BorderlessSelect value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">−</option>
              <option value="男性">男性</option>
              <option value="女性">女性</option>
              <option value="その他">その他</option>
            </BorderlessSelect>
          </div>
        </div>

        <div style={{ height: 24 }} />

        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <button
            onClick={handleSave}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: "#e5e3db",
              color: "#000",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
