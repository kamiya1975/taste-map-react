// src/components/panels/TastePositionPanelContent.jsx
// あなたの味覚位置パネル
import React from "react";

export default function TastePositionPanelContent({ userPin }) {
  const lat = userPin?.[0];
  const lon = userPin?.[1];

  const fmt = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(2);
  };

  return (
    <div style={{ padding: 18 }}>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          marginTop: 6,
          marginBottom: 22,
        }}
      >
        あなたの今の嗜好位置
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          rowGap: 14,
          columnGap: 18,
          alignItems: "baseline",
          maxWidth: 320,
          margin: "0 auto",
        }}
      >
        <div style={{ fontSize: 16, }}>味覚緯度</div>
        <div style={{ fontSize: 26, fontWeight: 800, textAlign: "right" }}>
          {fmt(lat)}
        </div>

        <div style={{ fontSize: 16, }}>味覚経度</div>
        <div style={{ fontSize: 26, fontWeight: 800, textAlign: "right" }}>
          {fmt(lon)}
        </div>
      </div>

      <div style={{ height: 10 }} />
    </div>
  );
}
