// src/pages/ResetPasswordPage.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  // クエリから token を取得
  const token = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("token") || "";
    } catch {
      return "";
    }
  }, []);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("リンクが無効です。もう一度メール送信からやり直してください。");
      return;
    }
    if (!password || !password2) {
      setError("新しいパスワードを2回入力してください。");
      return;
    }
    if (password !== password2) {
      setError("パスワードが一致しません。");
      return;
    }
    if (password.length < 4 || password.length > 20) {
      setError("パスワードは4〜20文字で入力してください。");
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch(`${API_BASE}/api/app/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: password,
        }),
      });

      if (res.ok) {
        setMessage(
          "パスワードを更新しました。マイアカウント画面からログインしてご利用ください。"
        );
      } else if (res.status === 400) {
        setError("リンクの有効期限が切れているか、すでに使用されています。");
      } else if (res.status === 404) {
        setError("該当するユーザーが見つかりませんでした。");
      } else {
        setError("パスワードの更新に失敗しました。時間をおいて再度お試しください。");
      }
    } catch (e) {
      console.error(e);
      setError("通信に失敗しました。電波状況をご確認の上、再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  const buttonStyle = {
    marginTop: 24,
    width: "100%",
    padding: "10px 20px",
    background: "rgb(230,227,219)",
    color: "#000",
    border: "none",
    borderRadius: 10,
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1,
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "#f5f3ee",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
          パスワード再設定
        </h1>

        {!token && (
          <p style={{ color: "#c00", fontSize: 14 }}>
            リンクが無効です。もう一度アプリから「仮パスワード送信」を行ってください。
          </p>
        )}

        {token && (
          <form onSubmit={handleSubmit}>
            <label
              style={{
                display: "block",
                fontSize: 14,
                marginBottom: 4,
                fontWeight: 600,
              }}
            >
              新しいパスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="4〜20文字"
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid #ccc",
                marginBottom: 12,
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: 14,
                marginBottom: 4,
                fontWeight: 600,
              }}
            >
              新しいパスワード（確認）
            </label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid #ccc",
              }}
            />

            {error && (
              <p style={{ marginTop: 12, color: "#c00", fontSize: 13 }}>
                {error}
              </p>
            )}
            {message && (
              <p style={{ marginTop: 12, color: "#006400", fontSize: 13 }}>
                {message}
              </p>
            )}

            <button type="submit" style={buttonStyle} disabled={submitting || !token}>
              {submitting ? "送信中…" : "パスワードを更新する"}
            </button>
          </form>
        )}

        <button
          type="button"
          style={{ ...buttonStyle, marginTop: 16, background: "#eee", boxShadow: "none" }}
          onClick={() => navigate("/map")}
        >
          マップへ戻る
        </button>
      </div>
    </div>
  );
}
