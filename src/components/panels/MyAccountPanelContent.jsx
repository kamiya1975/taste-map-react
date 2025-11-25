// src/components/panels/MyAccountPanelContent.jsx
import React, { useEffect, useState, useRef } from "react";
import { setUserId } from "../../utils/auth";

// APIベースURL（.env の REACT_APP_API_BASE_URL があればそれを使う）
const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

console.log("[MyAccount] API_BASE =", API_BASE, "origin =", window.location.origin);

// メール形式チェック
const isEmail = (s) => /^\S+@\S+\.\S+$/.test(String(s || "").trim());

// gender: UI表示 ↔ APIコード変換
const toApiGender = (uiGender) => {
  switch (uiGender) {
    case "男性":
      return "male";
    case "女性":
      return "female";
    case "その他":
      return "other";
    default:
      return "other";
  }
};

const fromApiGender = (apiGender) => {
  switch (apiGender) {
    case "male":
      return "男性";
    case "female":
      return "女性";
    case "other":
    default:
      return "その他";
  }
};

// メイン店舗IDの取得（ローカルにあればそれを使い、なければ 1 をデフォルトに）
const getCurrentMainStoreId = () => {
  try {
    const fromApp = Number(localStorage.getItem("app.main_store_id") || "0");
    if (fromApp > 0) return fromApp;

    const fromLegacy = Number(localStorage.getItem("store.mainStoreId") || "0");
    if (fromLegacy > 0) return fromLegacy;
  } catch {
    // 何もしない
  }
  // 最低限、ECショップID=1をデフォルトにしておく（必要なら後で修正）
  return 1;
};

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
  // ▼ ログイン用
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // ★ ページ全体をリロードする共通処理
  const reloadApp = () => {
    try {
      // 同じURLにリダイレクト（履歴を汚しにくい）
      window.location.replace(window.location.href);
    } catch {
      window.location.reload();
    }
  };

  // ▼ パスワードリセット用
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState(null);

  // ▼ 新規登録
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [gender, setGender] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  // ▼ 新規登録フォームの開閉
  const [showRegister, setShowRegister] = useState(false);
  const registerRef = useRef(null);

  // 共通：サーバから返ってきたトークンとユーザー情報を保存
  const applyAuthResponse = (data, loginIdForStorage) => {
    const { access_token, refresh_token, user } = data || {};
    if (!access_token || !refresh_token || !user) {
      alert("サーバからの応答が不正です。");
      return false;
    }

    try {
      // 新形式
      localStorage.setItem("app.access_token", access_token);
      localStorage.setItem("app.refresh_token", refresh_token);
      localStorage.setItem("app.user", JSON.stringify(user));
      if (loginIdForStorage) {
        localStorage.setItem("app.user_login_id", loginIdForStorage);
      }
      if (user.main_store_id) {
        localStorage.setItem("app.main_store_id", String(user.main_store_id));
      }

      // 旧キーも更新（既存コードとの互換のため）
      const loginId = loginIdForStorage || user.user_login_id || "";
      localStorage.setItem("user.nickname", user.display_name || "");
      localStorage.setItem("user.id", loginId);
      if (user.birth_year) {
        localStorage.setItem("user.birthYear", String(user.birth_year));
      }
      if (user.birth_month) {
        localStorage.setItem(
          "user.birthMonth",
          String(user.birth_month).padStart(2, "0")
        );
      }
      localStorage.setItem("user.gender", fromApiGender(user.gender));
      // 利用規約同意は登録時のみセット
    } catch {
      // localStorage失敗は致命的ではないので無視
    }

    setUserId(loginIdForStorage || user.user_login_id || "");
    return true;
  };

  // ▼ ログアウト用
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // ① 画面を開いた時にログイン状態をチェック
  useEffect(() => {
    try {
      const token = localStorage.getItem("app.access_token");
      if (token) setIsLoggedIn(true);
    } catch {}
  }, []);

  // ② API 保存時に使う token（消さない）
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("app.access_token") || "";

      // ここで token を使って API に送る
    } finally {
      setSaving(false);
    }
  };

  // 初期表示：ローカルキャッシュから復元
  useEffect(() => {
    try {
      const appUserStr = localStorage.getItem("app.user");
      if (appUserStr) {
        const u = JSON.parse(appUserStr);
        if (u && typeof u === "object") {
          setNickname(u.display_name || "");
          setBirthYear(u.birth_year ? String(u.birth_year) : "");
          setBirthMonth(
            u.birth_month ? String(u.birth_month).padStart(2, "0") : ""
          );
          setGender(u.gender ? fromApiGender(u.gender) : "");
        }
      } else {
        setNickname(localStorage.getItem("user.nickname") || "");
        setBirthYear(localStorage.getItem("user.birthYear") || "");
        setBirthMonth(localStorage.getItem("user.birthMonth") || "");
        setGender(localStorage.getItem("user.gender") || "");
      }

      const storedLoginId =
        localStorage.getItem("app.user_login_id") ||
        localStorage.getItem("user.id") ||
        "";
      setEmail(storedLoginId);
      setLoginEmail(storedLoginId); // ログイン側にも入れておく

      setAgreed((localStorage.getItem("user.agreed") || "") === "1");
    } catch {
      // 何もしない
    }
  }, []);

  // ▼ ログインボタン
  const handleLogin = async () => {
    const id = loginEmail.trim();
    const pass = loginPassword;

    if (!id || !pass) {
      alert("ID（メールアドレス）とパスワードを入力してください。");
      return;
    }
    if (!isEmail(id)) {
     alert("メールアドレスの形式が正しくありません。");
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/app/users/login?v=20251117`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_login_id: id,
          password: pass,
        }),
      });

      // ★ 最初に一度だけ読む
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          alert("ID またはパスワードが正しくありません。");
        } else if (res.status === 422) {
          alert("入力内容に誤りがあります。");
        } else {
          const message =
            (data && (data.detail || data.message)) ||
            "ログインに失敗しました。";
          alert(message);
        }
        return;
      }

      const ok = applyAuthResponse(data, id);
      if (ok) {
        setIsLoggedIn(true);
        setLoginPassword("");

        // ★ ここでアプリ全体をリロードして他パネルも最新状態にする
        //   （アラートは消してしまうか、どうしても必要なら setTimeout で）
        // alert("ログインしました。");
        reloadApp();
        return;
      }
    } catch (e) {
      console.error(e);
      alert("通信に失敗しました。電波状況をご確認の上、再度お試しください。");
    } finally {
      setLoginLoading(false);
    }
  };

  // ★ パスワードリセットメール送信
  const handleSendResetMail = async () => {
    const email = (resetEmail || "").trim();

    if (!email) {
      setResetStatus({
        type: "error",
        message: "メールアドレスを入力してください。",
      });
      return;
    }
    if (!isEmail(email)) {
      setResetStatus({
        type: "error",
        message: "メールアドレスの形式が正しくありません。",
      });
      return;
    }

    try {
      setResetLoading(true);
      setResetStatus({ type: "info", message: "送信中です…" });

      // ★ バックエンドと一致するルートを使用
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // ★ 必ず最初に1回だけ読む
      const data = await res.json().catch(() => ({}));
      const detail = data?.detail;

      if (res.ok) {
        setResetStatus({
          type: "ok",
          message:
            "パスワード再設定用のメールを送信しました。メールの案内にしたがって操作してください。",
        });
      } else if (res.status === 404) {
        if (detail === "user_not_found" || detail === "app_user_not_found") {
          setResetStatus({
            type: "error",
            message: "このメールアドレスは登録されていません。",
          });
        } else {
          setResetStatus({
            type: "error",
            message:
              "パスワード再設定機能がまだ有効になっていません。（システム管理者に確認してください）",
          });
        }
      } else {
        setResetStatus({
          type: "error",
          message: "送信に失敗しました。時間をおいて再度お試しください。",
        });
      }

    } catch (e) {
      console.error(e);
      setResetStatus({
        type: "error",
        message:
          "通信に失敗しました。電波状況をご確認の上、再度お試しください。",
      });
    } finally {
      setResetLoading(false);
    }
  };

  // ▼ 新規登録（現状 handleSave 相当）
  const handleRegister = async () => {
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

    const mainStoreId = getCurrentMainStoreId();
    if (!mainStoreId || Number.isNaN(mainStoreId)) {
      alert("メイン店舗情報が取得できませんでした。店舗選択後にお試しください。");
      return;
    }

    const payload = {
      display_name: nickname.trim(),
      user_login_id: email.trim(),
      password: password || "", // 空ならサーバ側で「変更なし」
      birth_year: Number(birthYear),
      birth_month: Number(birthMonth),
      gender: toApiGender(gender),
      main_store_id: mainStoreId,
    };

    setSaving(true);
    try {
      const token = localStorage.getItem("app.access_token") || "";

      const res = await fetch(`${API_BASE}/api/app/users/save?v=20251117`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          alert("このメールアドレスは既に使用されています。");
        } else if (res.status === 401) {
          alert("認証エラーが発生しました。再度お試しください。");
        } else if (res.status === 422) {
          alert("入力内容に誤りがあります。確認してください。");
        } else {
          const message =
            (data && (data.detail || data.message)) ||
            "保存に失敗しました。";
          alert(message);
        }
        return;
      }

      const ok = applyAuthResponse(data, email.trim());
      if (!ok) return;

      try {
        localStorage.setItem("user.agreed", agreed ? "1" : "0");
        if (password) localStorage.setItem("user.pass", password);
      } catch {
        // 無視
      }

      setPassword("");
      alert("保存しました。");
    } catch (e) {
      console.error(e);
      alert("通信に失敗しました。電波状況をご確認の上、再度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const row = {
    display: "grid",
    gridTemplateColumns: "110px 1fr",
    gap: 12,
    alignItems: "center",
    padding: "16px",
    borderBottom: "1px solid #eee",
  };
  const label = { fontSize: 13, color: "#666" };

  const openRegister = () => {
    setShowRegister((prev) => {
      const next = !prev;

      // 「閉じている → 開く」に変わるときだけスクロール
      if (!prev && next) {
        setTimeout(() => {
          if (registerRef.current) {
            registerRef.current.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }
        }, 50);
      }

      return next;
    });
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 16,
        background: "#fff",
      }}
    >
      {/* ======================= */}
      {/*  ログインブロック       */}
      {/* ======================= */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e7e7e7",
          borderRadius: 12,
          overflow: "hidden",
          maxWidth: 560,
          margin: "0 auto 20px",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #eee",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          ログイン
        </div>

        {/* ID（メールアドレス） */}
        <div style={row}>
          <div style={label}>ID（メール）</div>
          <BorderlessInput
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            placeholder="example@mail.com"
          />
        </div>

        {/* パスワード */}
        <div style={{ ...row, borderBottom: "none" }}>
          <div style={label}>パスワード</div>
          <div style={{ position: "relative" }}>
            <BorderlessInput
              type={loginShowPassword ? "text" : "password"}
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="パスワード"
              style={{ paddingRight: 28 }}
            />
            <button
              onClick={() => setLoginShowPassword((v) => !v)}
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {loginShowPassword ? "●" : "◯"}
            </button>
          </div>
        </div>
      </div>

      {/* ログイン or ログアウト ボタン */}
      <div style={{ maxWidth: 560, margin: "8px auto 16px" }}>
        {!isLoggedIn ? (
          <button
            onClick={handleLogin}
            disabled={loginLoading}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "8px 20px",
              lineHeight: 1.2,
              background: "rgb(230,227,219)",
              color: "#000",
              border: "none",
              borderRadius: 10,
              fontSize: 18,
              fontWeight: 700,
              cursor: loginLoading ? "default" : "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
              WebkitBackdropFilter: "blur(2px)",
              backdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: loginLoading ? 0.6 : 1,
            }}
          >
            {loginLoading ? "ログイン中..." : "ログイン"}
          </button>
        ) : (
          <button
            onClick={() => {
              localStorage.removeItem("app.access_token");
              localStorage.removeItem("app.refresh_token");
              localStorage.removeItem("app.user");
              localStorage.removeItem("app.user_login_id");
              localStorage.removeItem("userRatings");

              setIsLoggedIn(false);

              // ★ ログアウト後にアプリ全体をリロード
              // alert("ログアウトしました。");
              reloadApp();
            }}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "8px 20px",
              lineHeight: 1.2,
              background: "rgb(230,227,219)",
              color: "#000",
              border: "none",
              borderRadius: 10,
              fontSize: 18,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
              WebkitBackdropFilter: "blur(2px)",
              backdropFilter: "blur(2px)",
            }}
          >
           ログアウト
          </button>
        )}
      </div>

      {/* パスワード忘れ／新規の方 */}
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto 24px",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        {/* パスワードを忘れた方 */}
        <div
          style={{
            padding: "12px 0 0",
            borderTop: "1px dashed #ddd",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          <button
            type="button"
            onClick={() => setShowReset((v) => !v)}
            style={{
              padding: 0,
              border: "none",
              background: "none",
              color: "#0066cc",
              textDecoration: "underline",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            パスワードを忘れた方
          </button>

          {showReset && (
            <div
              style={{
                marginTop: 8,
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                alignItems: "center",
              }}
            >
              <BorderlessInput
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="登録済みのメールアドレス"
                style={{
                  borderBottom: "1px solid #eee",
                  paddingBottom: 2,
                }}
              />
              <button
                onClick={handleSendResetMail}
                disabled={resetLoading}
                style={{
                  padding: "4px 10px",
                  lineHeight: 1.2,
                  background: "rgb(230,227,219)",
                  color: "#000",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: resetLoading ? "default" : "pointer",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
                  WebkitBackdropFilter: "blur(2px)",
                  backdropFilter: "blur(2px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: resetLoading ? 0.6 : 1,
                }}
              >
                {resetLoading ? "送信中..." : "再設定メール送信"}
              </button>

              {resetStatus && (
                <p
                  style={{
                    gridColumn: "1 / -1",
                    marginTop: 6,
                    fontSize: 12,
                    color:
                      resetStatus.type === "error"
                        ? "#c00"
                        : resetStatus.type === "ok"
                        ? "#006400"
                        : "#333",
                  }}
                >
                  {resetStatus.message}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 新規の方 */}
        <div
          style={{
            padding: "12px 0 0",
            borderTop: "1px dashed #ddd",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          <button
            type="button"
            onClick={openRegister}
            style={{
              padding: 0,
              border: "none",
              background: "none",
              color: "#0066cc",
              textDecoration: "underline",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            新規の方はこちら（会員登録・変更）
          </button>
        </div>
      </div>

      {/* ======================= */}
      {/*  新規登録ブロック（畳み込み） */}
      {/* ======================= */}
      {showRegister && (
        <>
          <div
            ref={registerRef}
            style={{
              background: "#fff",
              border: "1px solid #e7e7e7",
              borderRadius: 12,
              overflow: "hidden",
              maxWidth: 560,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #eee",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              新規登録・変更
            </div>

            {/* ニックネーム */}
            <div style={row}>
              <div style={label}>ニックネーム</div>
              <BorderlessInput
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>

            {/* ID（メール） */}
            <div style={row}>
              <div style={label}>ID（メール）</div>
              <BorderlessInput
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@mail.com"
              />
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
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? "●" : "◯"}
                </button>
              </div>
            </div>

            {/* 生まれ年 */}
            <div style={row}>
              <div style={label}>生まれ年</div>
              <BorderlessSelect
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
              >
                <option value="">−</option>
                {Array.from(
                  { length: 80 },
                  (_, i) => new Date().getFullYear() - 20 - i
                )
                  .map((y) => y.toString())
                  .map((y) => (
                    <option key={y}>{y}</option>
                  ))}
              </BorderlessSelect>
            </div>

            {/* 生まれ月 */}
            <div style={row}>
              <div style={label}>生まれ月</div>
              <BorderlessSelect
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
              >
                <option value="">−</option>
                {Array.from({ length: 12 }, (_, i) =>
                  String(i + 1).padStart(2, "0")
                ).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </BorderlessSelect>
            </div>

            {/* 性別 */}
            <div style={{ ...row, borderBottom: "none" }}>
              <div style={label}>性別</div>
              <BorderlessSelect
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">−</option>
                <option>男性</option>
                <option>女性</option>
                <option>その他</option>
              </BorderlessSelect>
            </div>
          </div>

          {/* 利用規約（新規登録用） */}
          <div
            style={{
              maxWidth: 560,
              margin: "14px auto 0",
              textAlign: "center",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                <a href="/terms" target="_blank" rel="noreferrer">
                  利用規約
                </a>
                に同意します
              </span>
            </label>
          </div>

          {/* 新規登録 保存ボタン */}
          <div style={{ maxWidth: 560, margin: "12px auto 0 auto" }}>
            <button
              onClick={handleRegister}
              disabled={!agreed || saving}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "8px 20px",
                lineHeight: 1.2,
                background: "rgb(230,227,219)",
                color: "#000",
                border: "none",
                borderRadius: 10,
                fontSize: 18,
                fontWeight: 700,
                cursor: !agreed || saving ? "default" : "pointer",
                boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
                WebkitBackdropFilter: "blur(2px)",
                backdropFilter: "blur(2px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: !agreed || saving ? 0.6 : 1,
              }}
            >
              {saving ? "新規登録・変更中..." : "新規登録・変更を保存"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
