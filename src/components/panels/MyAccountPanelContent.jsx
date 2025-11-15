// src/components/panels/MyAccountPanelContent.jsx
import React, { useEffect, useState } from "react";
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
  } catch {}
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

export default function MyMyAccountPanelContent() {
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [gender, setGender] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  // 初期表示：ローカルキャッシュから復元
  useEffect(() => {
    try {
      // 新形式（app.user / app.user_login_id）があればそちら優先
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
        // 旧形式
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

      setAgreed((localStorage.getItem("user.agreed") || "") === "1");
    } catch {
      // 何もしない（初期値のまま）
    }
  }, []);

  const handleSave = async () => {
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
      birth_month: Number(birthMonth), // "01" → 1
      gender: toApiGender(gender),
      main_store_id: mainStoreId,
    };

    setLoading(true);
    try {
      const token = localStorage.getItem("app.access_token") || "";

      const res = await fetch(
        `${API_BASE}/api/app/users/save?v=20251115`, 
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          alert("このメールアドレスは既に使用されています。");
        } else if (res.status === 401) {
          alert("認証エラーが発生しました。再度お試しください。");
        } else if (res.status === 422) {
          alert("入力内容に誤りがあります。確認してください。");
        } else {
          const detail =
            (data && (data.detail || data.message)) || "保存に失敗しました。";
          alert(detail);
        }
        return;
      }

      // data: AppAuthTokenOut
      const { access_token, refresh_token, user } = data || {};

      if (!access_token || !refresh_token || !user) {
        alert("サーバからの応答が不正です。");
        return;
      }

      // トークンとユーザー情報を保存
      try {
        localStorage.setItem("app.access_token", access_token);
        localStorage.setItem("app.refresh_token", refresh_token);
        localStorage.setItem("app.user", JSON.stringify(user));
        localStorage.setItem("app.user_login_id", email.trim());
        if (user.main_store_id) {
          localStorage.setItem(
            "app.main_store_id",
            String(user.main_store_id)
          );
        }

        // 旧キーも更新しておく（既存コードとの互換目的）
        localStorage.setItem("user.nickname", user.display_name || nickname.trim());
        localStorage.setItem("user.id", email.trim());
        localStorage.setItem(
          "user.birthYear",
          user.birth_year ? String(user.birth_year) : birthYear
        );
        localStorage.setItem(
          "user.birthMonth",
          user.birth_month
            ? String(user.birth_month).padStart(2, "0")
            : birthMonth
        );
        localStorage.setItem("user.gender", fromApiGender(user.gender));
        localStorage.setItem("user.agreed", agreed ? "1" : "0");
        if (password) localStorage.setItem("user.pass", password);
      } catch {
        // localStorage失敗は致命的ではないので無視
      }

      // 他の処理で使っているユーザー識別子を更新
      setUserId(email.trim());
      setPassword("");
      alert("保存しました。");
    } catch (e) {
      console.error(e);
      alert("通信に失敗しました。電波状況をご確認の上、再度お試しください。");
    } finally {
      setLoading(false);
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

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 16,
        background: "#fff",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #e7e7e7",
          borderRadius: 12,
          overflow: "hidden",
          maxWidth: 560,
          margin: "0 auto",
        }}
      >
        {/* ニックネーム */}
        <div style={row}>
          <div style={label}>ニックネーム</div>
          <BorderlessInput
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
        {/* ID */}
        <div style={row}>
          <div style={label}>ID（メール）</div>
          <BorderlessInput
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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

      {/* 利用規約 */}
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

      {/* 保存ボタン */}
      <div style={{ maxWidth: 560, margin: "12px auto 0" }}>
        <button
          onClick={handleSave}
          disabled={!agreed || loading}
          style={{ width: "100%", padding: 14, borderRadius: 12 }}
        >
          {loading ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

