// src/pages/MyAccount.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../components/ui/PanelHeader";

export default function MyAccount() {
  const navigate = useNavigate();

  // ---- state（モックは localStorage に保存）----
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");            // 表示専用（ID）
  const [birthYear, setBirthYear] = useState("");    // 4桁
  const [birthMonth, setBirthMonth] = useState("");  // 01-12
  const [gender, setGender] = useState("");          // "male" | "female" | "other" | ""
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  // ---- 初期読み込み（モック）----
  useEffect(() => {
    try {
      setNickname(localStorage.getItem("profile_nickname") || "");
      setEmail(localStorage.getItem("profile_email") || ""); // 表示のみ
      setBirthYear(localStorage.getItem("profile_birth_year") || "");
      setBirthMonth(localStorage.getItem("profile_birth_month") || "");
      setGender(localStorage.getItem("profile_gender") || "");
    } catch {}
  }, []);

  // ---- 保存 ----
  const handleSave = () => {
    // 軽いバリデーション
    const year = birthYear.trim();
    const month = birthMonth.trim();
    const yNum = Number(year);
    const mNum = Number(month);
    const thisYear = new Date().getFullYear();

    if (year && (!/^\d{4}$/.test(year) || yNum < 1900 || yNum > thisYear)) {
      alert("生まれ年は 1900〜現在の年の 4桁で入力してください。");
      return;
    }
    if (month && (!/^\d{1,2}$/.test(month) || mNum < 1 || mNum > 12)) {
      alert("生まれ月は 1〜12 で入力してください。");
      return;
    }

    if (pw1 || pw2) {
      if (pw1 !== pw2) {
        alert("パスワードが一致しません。");
        return;
      }
      if (pw1.length < 6) {
        alert("パスワードは6文字以上にしてください。");
        return;
      }
    }

    try {
      localStorage.setItem("profile_nickname", nickname.trim());
      // email は読み取り専用の想定。将来サーバ側で変更。
      if (year) localStorage.setItem("profile_birth_year", year);
      else localStorage.removeItem("profile_birth_year");

      if (month) localStorage.setItem("profile_birth_month", String(mNum).padStart(2, "0"));
      else localStorage.removeItem("profile_birth_month");

      if (gender) localStorage.setItem("profile_gender", gender);
      else localStorage.removeItem("profile_gender");

      // モック：パスワード保存（本番はAPIで更新・ハッシュ化想定）
      if (pw1 && pw2 && pw1 === pw2) {
        localStorage.setItem("profile_password_mock", pw1);
      }
      setPw1("");
      setPw2("");

      alert("保存しました。");
    } catch (e) {
      alert("保存に失敗しました。");
    }
  };

  // ---- スタイル（カード型リスト）----
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
  const row = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid #eee",
    gap: 12,
  };
  const leftLabel = { fontSize: 13, color: "#666", minWidth: 110 };
  const valueText = { fontSize: 15, color: "#111" };
  const valueMuted = { fontSize: 15, color: "#9aa0a6" };
  const cellInput = {
    fontSize: 16, // iOS ズーム回避
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: "10px 12px",
    width: "100%",
    outline: "none",
    background: "#fff",
  };
  const cellInputSmall = { ...cellInput, maxWidth: 120, textAlign: "left" };
  const cellSelect = { ...cellInput, maxWidth: 180, background: "#fff" };

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
            <div style={leftLabel}>ニックネーム</div>
            <div style={{ flex: 1 }}>
              <input
                style={cellInput}
                type="text"
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          {/* ID（読み取り専用：メール表示） */}
          <div style={row}>
            <div style={leftLabel}>ID</div>
            <div style={{ flex: 1 }}>
              <div style={email ? valueMuted : valueMuted}>
                {email || "example@mail.com"}
              </div>
            </div>
          </div>

          {/* 生まれ年 */}
          <div style={row}>
            <div style={leftLabel}>生まれ年</div>
            <div style={{ flex: 1 }}>
              <input
                style={cellInputSmall}
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="—"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              />
            </div>
          </div>

          {/* 生まれ月 */}
          <div style={row}>
            <div style={leftLabel}>生まれ月</div>
            <div style={{ flex: 1 }}>
              <input
                style={cellInputSmall}
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="—"
                value={birthMonth}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "").slice(0, 2);
                  setBirthMonth(v);
                }}
              />
            </div>
          </div>

          {/* 性別 */}
          <div style={row}>
            <div style={leftLabel}>性別</div>
            <div style={{ flex: 1 }}>
              <select
                style={cellSelect}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">—</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">その他</option>
              </select>
            </div>
          </div>

          {/* パスワード変更 */}
          <div style={row}>
            <div style={leftLabel}>パスワード変更</div>
            <div style={{ flex: 1 }}>
              <input
                style={cellInput}
                type="password"
                inputMode="text"
                autoComplete="new-password"
                placeholder="（未入力）"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
              />
            </div>
          </div>

          {/* 再入力 */}
          <div style={{ ...row, borderBottom: "none" }}>
            <div style={leftLabel}>再入力</div>
            <div style={{ flex: 1 }}>
              <input
                style={cellInput}
                type="password"
                inputMode="text"
                autoComplete="new-password"
                placeholder="（未入力）"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </div>
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
