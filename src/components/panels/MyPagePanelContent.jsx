// src/components/panels/MyPagePanelContent.jsx
import React from "react";

const ICONS = {
  compass: "/img/bar.svg",
  mapGuide: "/img/tizu.svg",
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

export default function MyPagePanelContent({
  onClose,
  onOpenCart,
  onOpenSlider,
  onOpenMapGuide,
  onOpenStore,
  onOpenAccount,
  onOpenFaq,
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
      {/* 🛒 カート */}
      <Row
        icon={ICONS.cart}
        label="カート"
        onClick={() => onOpenCart?.()}
      />
      <Row
        icon={ICONS.mapGuide}
        label="マップガイド"
        onClick={() => onOpenMapGuide?.()} 
      />
      <Row
        icon={ICONS.account}
        label="マイアカウント"
        onClick={() => onOpenAccount?.()}
      />
      <Row
        icon={ICONS.store}
        label="お気に入り店舗登録"
        onClick={() => onOpenStore?.()}
      />
      <Row
        icon={ICONS.faq}
        label="よくある質問"
        onClick={() => onOpenFaq?.()} 
      />
    </div>
  );
}
