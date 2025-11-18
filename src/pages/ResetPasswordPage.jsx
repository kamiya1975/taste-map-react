// src/pages/ResetPasswordPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// APIベースURL（.env の REACT_APP_API_BASE_URL があればそれを使う）
const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);

  // クエリ文字列から token を取得
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("token") || "";
      setToken(t);
      if (!t) {
        setTokenError(
          "このリンクは無効です。メールに記載されたURLをもう一度開き直してください。"
        );
      }
    } catch (e) {
      console.error(e);
      setTokenError("リンクの読み取りに失敗しました。もう一度お試しください。");
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      setTokenError(
        "このリンクは無効です。メールに記載されたURLをもう一度開き直してください。"
      );
      return;
    }

    if (!password || password.length < 4 || password.length > 20) {
      alert("パスワードは4〜20文字で入力してください。");
      return;
    }
    if (password !== confirm) {
      alert("パスワードが一致しません。もう一度確認してください。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/app/auth/reset-password?v=20251118`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            new_password: password,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail =
          (data && (data.detail || data.message)) ||
          "パスワードの再設定に失敗しました。リンクの有効期限切れの可能性があります。";
        alert(detail);
        return;
      }

      alert("パスワードを変更しました。新しいパスワードでログインしてください。");
      navigate("/"); // ログイン画面 or MapPage など、トップに戻す
    } catch (e) {
      console.error(e);
      alert("通信に失敗しました。電波状況をご確認の上、再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    maxWidth: 560,
    margin: "40px auto",
    padding: "24px 16px 32px",
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e7e7e7",
    boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
  };

  const labelStyle = {
    fontSize: 13,
    color: "#555",
    marginBottom: 4,
  };

  const inputWrapperStyle = {
    position: "relative",
    marginBottom: 16,
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 32px 8px 8px",
    fontSize: 16,
    borderRadius: 8,
    border: "1px solid #ddd",
    outline: "none",
    boxSizing: "border-box",
  };

  const toggleButtonStyle = {
    position: "absolute",
    right: 6,
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 12,
  };

  const buttonStyle = {
    marginTop: 16,
    width: "100%",
    padding: "8px 20px",
    lineHeight: 1.2,
    background: "rgb(230,227,219)", // ログイン/新規登録と同じ色
    color: "#000",
    border: "none",
    borderRadius: 10,
    fontSize: 18,
    fontWeight: 700,
    cursor: loading ? "default" : "pointer",
    boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
    WebkitBackdropFilter: "blur(2px)",
    backdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    opacity: loading ? 0.6 : 1,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <div style={containerStyle}>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          パスワード再設定
        </h1>
        <p style={{ fontSize: 13, color: "#666", textAlign: "center" }}>
          メールに記載されたリンクからアクセスしています。
          <br />
          新しいパスワードを入力して、再設定を完了してください。
        </p>

        {tokenError && (
          <div
            style={{
              marginTop: 16,
              marginBottom: 8,
              padding: "8px 10px",
              borderRadius: 8,
              background: "#ffecec",
              color: "#a33",
              fontSize: 13,
            }}
          >
            {tokenError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          {/* 新しいパスワード */}
          <div style={inputWrapperStyle}>
            <div style={labelStyle}>新しいパスワード（4〜20文字）</div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="新しいパスワード"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={toggleButtonStyle}
            >
              {showPassword ? "非表示" : "表示"}
            </button>
          </div>

          {/* 確認用 */}
          <div style={inputWrapperStyle}>
            <div style={labelStyle}>新しいパスワード（確認）</div>
            <input
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="もう一度入力"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              style={toggleButtonStyle}
            >
              {showConfirm ? "非表示" : "表示"}
            </button>
          </div>

          <button type="submit" disabled={loading || !!tokenError} style={buttonStyle}>
            {loading ? "送信中..." : "パスワードを変更する"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              border: "none",
              background: "none",
              color: "#0066cc",
              textDecoration: "underline",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ログイン画面に戻る
          </button>
        </div>
      </div>
    </div>
  );
}
