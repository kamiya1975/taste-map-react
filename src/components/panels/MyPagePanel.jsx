// src/components/panels/MyPagePanel.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../ui/PanelHeader";

/* =========================
   メニュー行（罫線あり）
   ========================= */
function Row({ icon, label, onClick, last = false }) {
  return (
    <div style={{ width: "100%" }}>
      <button
        onClick={onClick}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "30px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <img src={icon} alt="" style={{ width: 25, height: 25 }} />
        <span style={{ fontSize: 15, color: "#111" }}>{label}</span>
      </button>
      {!last && (
        <div
          style={{
            height: 1,
            background: "rgba(0,0,0,0.12)",
            width: "100%",
          }}
        />
      )}
    </div>
  );
}

/* =========================
   メイン：MyPagePanel
   - 履歴スタックで“レイヤー”を表現
   - × は 1 ステップだけ閉じる（最上位=menu のときだけ外側を閉じる）
   - ← はスタック長 > 1 のとき表示
   - 一部メニューは別ページへ遷移
   ========================= */
export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  const navigate = useNavigate();

  // history stack: 先頭=最下層(menu), 末尾=現在
  const [stack, setStack] = useState(["menu"]); // "menu" | "mapGuide" | "faq" | "baseline" | "account" | "favorites"

  const view = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const titles = useMemo(
    () => ({
      menu: "アプリガイド",
      mapGuide: "マップガイド",
      baseline: "基準のワイン 再設定",
      account: "マイアカウント",
      favorites: "お気に入り店舗登録",
      faq: "よくある質問",
    }),
    []
  );

  const push = (v) => setStack((s) => [...s, v]);
  const pop = () =>
    setStack((s) => (s.length > 1 ? s.slice(0, s.length - 1) : s));

  // ×（右上）…1段だけ閉じる / 最上位なら外側を閉じる
  const handleCloseX = () => {
    if (canGoBack) pop();
    else onClose?.();
  };

  // ←（左）…常に1段戻る
  const handleBack = canGoBack ? pop : undefined;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#fff",
        zIndex: 1500,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ヘッダー（← と × の挙動を上記で制御） */}
      <PanelHeader
        title={titles[view] || "アプリガイド"}
        onClose={handleCloseX}
        onBack={handleBack}
        icon="compass.png"
      />

      {/* 本文 */}
      <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
        {view === "menu" && (
          <>
            <Row
              icon="/img/map-guide.svg"
              label="マップガイド"
              onClick={() => push("mapGuide")}
            />
            <Row
              icon="/img/compass.png"
              label="基準のワイン 再設定"
              onClick={() => {
                // ページへ遷移（レイヤーは残す：戻るとメニューに帰れる）
                if (onOpenSlider) onOpenSlider();
                else navigate("/slider", { state: { from: "mypage" } });
              }}
            />
            <Row
              icon="/img/account.svg"
              label="マイアカウント"
              onClick={() => navigate("/my-account")}
            />
            <Row
              icon="/img/store.svg"
              label="お気に入り店舗登録"
              onClick={() => navigate("/stores-fav")}
            />
            <Row
              icon="/img/faq.svg"
              label="よくある質問"
              onClick={() => push("faq")}
            />
          </>
        )}

        {view === "mapGuide" && (
          <section style={{ padding: "14px 16px" }}>
            <p style={{ lineHeight: 1.9, fontSize: 16 }}>
              基準のワインを出発点に、様々なワインを評価して自分の好みの位置を可視化します。
            </p>
            <ul style={{ lineHeight: 2, fontSize: 16, marginTop: 8 }}>
              <li>ワインをタップすると詳細を表示</li>
              <li>評価済みのワインは記号サイズが変化</li>
              <li>範囲外へはズーム・パンで移動可能</li>
            </ul>
          </section>
        )}

        {view === "faq" && (
          <section style={{ padding: "14px 16px" }}>
            <p>よくある質問ページ。</p>
          </section>
        )}
      </div>
    </div>
  );
}
