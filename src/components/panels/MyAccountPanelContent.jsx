// src/components/panels/MyAccountPanelContent.jsx
import React, { useEffect, useState } from "react";
import { setUserId } from "../../utils/auth";

const isEmail = (s) => /^\S+@\S+\.\S+$/.test(String(s || "").trim());

const BorderlessInput = (props) => (
  <input
    {...props}
    style={{
      fontSize: 16,
      width: "100%",
      padding: 0,
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

export default function MyAccountPanelContent() {
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [gender, setGender] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    try {
      setNickname(localStorage.getItem("user.nickname") || "");
      setEmail(localStorage.getItem("user.id") || "");
      setBirthYear(localStorage.getItem("user.birthYear") || "");
      setBirthMonth(localStorage.getItem("user.birthMonth") || "");
      setGender(localStorage.getItem("user.gender") || "");
      setAgreed((localStorage.getItem("user.agreed") || "") === "1");
    } catch {}
  }, []);

  const handleSave = () => {
    if (!agreed) return;
    if (!nickname || !email || !birthYear || !birthMonth || !gender) {
      alert("すべての項目を入力してください");
      return;
    }
    if (!isEmail(email)) {
      alert("メールアドレスの形式が正しくありません");
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
      localStorage.setItem("user.agreed", agreed ? "1" : "0");
      if (password) localStorage.setItem("user.pass", password);
      setUserId(email.trim());
      setPassword("");
      alert("保存しました。");
    } catch {
      alert("保存に失敗しました。");
    }
  };

  const row = { display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "center", padding: "16px", borderBottom: "1px solid #eee" };
  const label = { fontSize: 13, color: "#666" };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#fff" }}>
      <div style={{ background: "#fff", border: "1px solid #e7e7e7", borderRadius: 12, overflow: "hidden", maxWidth: 560, margin: "0 auto" }}>
        {/* ニックネーム */}
        <div style={row}>
          <div style={label}>ニックネーム</div>
          <BorderlessInput value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        {/* ID */}
        <div style={row}>
          <div style={label}>ID（メール）</div>
          <BorderlessInput value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {/* パスワード */}
        <div style={row}>
          <div style={label}>パスワード</div>
          <div style={{ position: "relative" }}>
            <BorderlessInput
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="4〜20文字"
              style={{ paddingRight: 28 }}
            />
            <button
              onClick={() => setShowPassword((v) => !v)}
              style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent" }}
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
            {Array.from({ length: 80 }, (_, i) => (new Date().getFullYear() - 20 - i).toString()).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </BorderlessSelect>
        </div>
        {/* 生まれ月 */}
        <div style={row}>
          <div style={label}>生まれ月</div>
          <BorderlessSelect value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)}>
            <option value="">−</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </BorderlessSelect>
        </div>
        {/* 性別 */}
        <div style={{ ...row, borderBottom: "none" }}>
          <div style={label}>性別</div>
          <BorderlessSelect value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">−</option>
            <option>男性</option>
            <option>女性</option>
            <option>その他</option>
          </BorderlessSelect>
        </div>
      </div>

      {/* 利用規約 */}
      <div style={{ maxWidth: 560, margin: "14px auto 0", textAlign: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span><a href="/terms" target="_blank">利用規約</a>に同意します</span>
        </label>
      </div>

      {/* 保存ボタン */}
      <div style={{ maxWidth: 560, margin: "12px auto 0" }}>
        <button onClick={handleSave} disabled={!agreed} style={{ width: "100%", padding: 14, borderRadius: 12 }}>
          保存
        </button>
      </div>
    </div>
  );
}
