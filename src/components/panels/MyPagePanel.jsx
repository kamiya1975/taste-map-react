// src/components/panels/MyPagePanel.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../ui/PanelHeader";

const ICONS = {
  compass: "/img/compass.png",
  mapGuide: "/img/map-guide.svg",
  account: "/img/account.svg",
  store:   "/img/store.svg",
  faq:     "/img/faq.svg",
};

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
      {!last && <div style={{ height: 1, background: "rgba(0,0,0,0.12)" }} />}
    </div>
  );
}

export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  const navigate = useNavigate();
  const [stack] = useState(["menu"]); // 内部ページは廃止
  const view = "menu";

  const titles = useMemo(() => ({ menu: "アプリガイド" }), []);

  const handleCloseX = () => onClose?.();

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
      <PanelHeader
        title={titles[view] || "アプリガイド"}
        onClose={handleCloseX}
        icon="compass.png"   // ★ ファイル名のみ
      />

      <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
        <Row
          icon={ICONS.mapGuide}
          label="マップガイド"
          onClick={() => { onClose?.(); navigate("/map-guide"); }}
        />
        <Row
          icon={ICONS.compass}
          label="基準のワイン 再設定"
          onClick={() => {
            if (onOpenSlider) onOpenSlider();
            else navigate("/slider", { state: { from: "mypage" } });
          }}
        />
        <Row
          icon={ICONS.account}
          label="マイアカウント"
          onClick={() => navigate("/my-account")}
        />
        <Row
          icon={ICONS.store}
          label="お気に入り店舗登録"
          onClick={() => navigate("/stores-fav")}
        />
        <Row
          icon={ICONS.faq}
          label="よくある質問"
          onClick={() => { onClose?.(); navigate("/faq"); }}
        />
      </div>
    </div>
  );
}
