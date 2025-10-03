// src/pages/MyAccount.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../components/ui/PanelHeader";

// メール簡易バリデータ（Intro と同等）
const isEmail = (s) => /^\S+@\S+\.\S+$/.test(String(s || "").trim());

export default function MyAccount() {
  const navigate = useNavigate();

  // Intro と同じフィールド構成
  const [nickname, setNickname]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [gender, setGender]       = useState("");

  // 初期ロード（Intro の保存キーに合わせる）
  useEffect(() => {
    try {
      setNickname(localStorage.getItem("user.nickname") || "");
      setEmail(localStorage.getItem("user.id") || "");
      setBirthYear(localStorage.getItem("user.birthYear") || "");
      setBirthMonth(localStorage.getItem("user.birthMonth") || "");
      setGender(localStorage.getItem("user.gender") || "");
      // パスワードは表示しない（編集時のみ入力）
    } catch {}
  }, []);

  const handleSave = () => {
    // Intro と同等のバリデーション
    if (!nickname || !email || !birthYear || !birthMonth || !gender) {
      alert("すべての項目を入力してください");
      return;
    }
    if (!isEmail(email)) {
      alert("メールアドレス（ID）の形式が正しくありません");
      return;
    }
    if (password && (password.length < 4 || password.length > 20)) {
      alert("パスワードは4文字以上20文字以内で入力してください");
      return;
    }

    try {
      localStorage.setItem("user.nickname", nickname.trim());
      localStorage.setItem("user.id", email.trim());
      localStorage.setItem("user.birthYear", birthYear);
      localStorage.setItem("user.birthMonth", birthMonth);
      localStorage.setItem("user.gender", gender);
      if (password) localStorage.setItem("user.pass", password); // モック
      setPassword("");
      alert("保存しました。");
    } catch {
      alert("保存に失敗しました。");
    }
  };

  // UI スタイル（カード型）
  const wrap = { position: "fixed", inset: 0, background: "rgb(250,250,250)", display: "flex", flexDirection: "column" };
  const body = { flex: 1, overflowY: "auto", padding: 16 };
  const card = {
    background: "#fff",
    border: "1px solid #e7e7e7",
    borderRadius: 12,
    overflow: "hidden",
    maxWidth: 560,
    margin: "0 auto",
  };
  const row = { display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #eee" };
  const label = { fontSize: 13, color: "#666" };
  const input = { fontSize: 16, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, outline: "none", width: "100%", background: "#fff" };

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
            <input
              style={input}
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="-"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          {/* ID（メール） */}
          <div style={row}>
            <div style={label}>ID（メール）</div>
            <input
              style={input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="-"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          {/* パスワード（任意入力で更新） */}
          <div style={row}>
            <div style={label}>パスワード</div>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...input, paddingRight: 36 }}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="4〜20文字（空欄なら変更なし）"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label="パスワード表示切替"
                title="パスワード表示切替"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                {showPassword ? "●" : "◯"}
              </button>
            </div>
          </div>

          {/* 生まれ年 */}
          <div style={row}>
            <div style={label}>生まれ年</div>
            <select
              style={input}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
            >
              <option value="">-</option>
              {Array.from({ length: 80 }, (_, i) =>
                (new Date().getFullYear() - 20 - i).toString()
              ).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* 生まれ月 */}
          <div style={row}>
            <div style={label}>生まれ月</div>
            <select
              style={input}
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
            >
              <option value="">-</option>
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 性別 */}
          <div style={{ ...row, borderBottom: "none" }}>
            <div style={label}>性別</div>
            <select
              style={input}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">-</option>
              <option value="男性">男性</option>
              <option value="女性">女性</option>
              <option value="その他">その他</option>
            </select>
          </div>
        </div>

        {/* 余白 */}
        <div style={{ height: 24 }} />

        {/* 保存ボタン */}
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
