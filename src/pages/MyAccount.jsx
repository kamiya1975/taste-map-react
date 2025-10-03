// src/pages/MyAccount.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../components/ui/PanelHeader";

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginTop: 14,
};

const inputStyle = {
  fontSize: 16,             // iOSズーム回避
  padding: "12px 14px",
  border: "1px solid #ccc",
  borderRadius: 10,
  outline: "none",
  width: "100%",
  background: "#fff",
};

const labelStyle = {
  fontSize: 13,
  color: "#222",
};

export default function MyAccount() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");

  // 読み込み（モック：localStorage）
  useEffect(() => {
    try {
      setNickname(localStorage.getItem("profile_nickname") || "");
      setEmail(localStorage.getItem("profile_email") || "");
    } catch {}
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem("profile_nickname", nickname.trim());
      localStorage.setItem("profile_email", email.trim());
      alert("保存しました。");
    } catch (e) {
      alert("保存に失敗しました。");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PanelHeader
        title="マイアカウント"
        onBack={() => navigate(-1)}
        onClose={() => navigate("/map?open=mypage", { replace: true })}
        icon="account.svg"
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>ニックネーム</label>
          <input
            style={inputStyle}
            type="text"
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="例）Toyo"
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>メールアドレス</label>
          <input
            style={inputStyle}
            type="email"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@domain.com"
          />
        </div>

        <div style={{ height: 16 }} />

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
  );
}
