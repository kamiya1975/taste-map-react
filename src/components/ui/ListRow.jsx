import React from "react";
import { TYPE_COLOR_MAP } from "../../ui/constants";

/** 配列RGB or 文字列を CSS color に正規化 */
const toCssColor = (c, fallback) => {
  if (!c) return fallback;
  if (Array.isArray(c)) return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  return String(c);
};

/** モック準拠の共通行（Type=カラーパネル、評価は右端に単体表示（親から extraRight）） */
export default function ListRow({
  index,
  item,
  onPick,
  showDate = false,
  dateValue = null,
  accentColor = "#b4b4b4",
  extraRight = null,
  hoverHighlight = true,
}) {
  const price = Number.isFinite(item?.希望小売価格)
    ? `¥${Number(item.希望小売価格).toLocaleString()}`
    : "—";

  // 軸の呼称揺れに対応
  const bodyVal =
    Number.isFinite(item?.PC1) ? item.PC1 :
    Number.isFinite(item?.BodyAxis) ? item.BodyAxis : null;

  const sweetVal =
    Number.isFinite(item?.PC2) ? item.PC2 :
    Number.isFinite(item?.SweetAxis) ? item.SweetAxis : null;

  const fmtDateTime = (v) => {
    if (!v) return "（日時不明）";
    try {
      const d = new Date(v);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${m}/${y}, ${hh}:${mm}`;
    } catch {
      return "（日時不明）";
    }
  };

  // === Typeをカラーパネル（Chip）で表示 ===
  const TypeBadge = ({ type }) => {
    const colorCSS = toCssColor(TYPE_COLOR_MAP?.[type], accentColor);
    return (
      <span
        title={type || "Type不明"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 8px",
          borderRadius: 10,
          background: "rgba(0,0,0,0.02)",
          border: `1px solid ${colorCSS}`,
          color: "#333",
          fontSize: 12,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: colorCSS,
            display: "inline-block",
          }}
        />
        {type || "Unknown"}
      </span>
    );
  };

  return (
    <li
      onClick={() => onPick?.(item)}
      style={{
        padding: "12px 8px",
        borderBottom: "1px solid #eee",
        cursor: "pointer",
        borderRadius: 6,
        background: "transparent",
        position: "relative",
        paddingRight: 64, // 右端◎(size=40)が被らないよう余白
      }}
      onMouseEnter={(e) => {
        if (!hoverHighlight) return;
        e.currentTarget.style.background = "#f6f9ff";
      }}
      onMouseLeave={(e) => {
        if (!hoverHighlight) return;
        e.currentTarget.style.background = "transparent";
      }}
    >
      {/* 上段：番号 + 日付（任意） */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <strong
            style={{
              color: "rgb(50,50,50)",
              fontSize: 16,
              fontWeight: 700,
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              minWidth: 28,
              textAlign: "right",
            }}
          >
            {index}.
          </strong>
          <span
            style={{
              fontSize: 13,
              color: "#555",
              visibility: showDate ? "visible" : "hidden",
            }}
          >
            {showDate ? fmtDateTime(dateValue) : "00/00/0000, 00:00"}
          </span>
        </div>

        {/* 右端（◎など） */}
        {extraRight && (
          <div
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)", // 縦中央
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none", // 行クリックを阻害しない
            }}
          >
            {extraRight}
          </div>
        )}
      </div> {/* ← ここを閉じ忘れない！ */}

      {/* 商品名 */}
      <div style={{ marginTop: 2, fontSize: 15, color: "#333", lineHeight: 1.35 }}>
        {item?.商品名 || "（名称不明）"}
      </div>

      {/* 下段：Typeバッジ + 価格 / Sweet / Body */}
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <TypeBadge type={item?.Type} />
        <small style={{ color: "#444" }}>
          {price}　 Sweet: {sweetVal != null ? sweetVal.toFixed(2) : "—"} / Body: {bodyVal != null ? bodyVal.toFixed(2) : "—"}
        </small>
      </div>
    </li>
  );
}
