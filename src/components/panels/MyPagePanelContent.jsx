// src/components/panels/MyPagePanelContent.jsx
// アプリガイド（メニュー一覧）パネル
import React from "react";

const ICONS = {
  compass: "/img/bar.svg",
  mapGuide: "/img/tizu.svg",
  account: "/img/account.svg",
  store:   "/img/store.svg",
  miles:   "/img/icon-cart2.png",
  faq:     "/img/faq.svg",
  refresh: "/img/refresh.svg"
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
  onOpenMiles,
  onOpenFaq,
  onOpenRefresh,
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
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
        icon={ICONS.miles}
        label="獲得マイル"
        onClick={() => onOpenMiles?.()}
      />
      <Row
        icon={ICONS.faq}
        label="よくある質問"
        onClick={() => onOpenFaq?.()} 
      />
      <Row
        icon={ICONS.refresh}
        label="更新ボタン"
        onClick={() => onOpenRefresh?.()}
        last
      />    
    </div>
  );
}
