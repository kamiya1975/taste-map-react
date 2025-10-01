import React from "react";
import { TYPE_COLOR_MAP } from "../../ui/constants";

/** 配列RGB or 文字列を CSS color に正規化 */
const toCssColor = (c, fallback) => {
  if (!c) return fallback;
  if (Array.isArray(c)) return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  return String(c);
};

export default function ListRow({
  index,
  item,
  onPick,
  showDate = false,
  dateValue = null,
  accentColor = "#b4b4b4",
  extraRight = null,   // ← ◎（CircleRatingDisplay など）
  hoverHighlight = true,
}) {
  const price = Number.isFinite(item?.希望小売価格)
    ? `¥${Number(item.希望小売価格).toLocaleString()}`
    : "—";

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
    } catch { return "（日時不明）"; }
  };

  /** ==== TypeBadge（修正）====
   * 外枠とタイプ名をカットして「色ブロックのみ」を表示
   */
  const TypeBadge = ({ type }) => {
    const colorCSS = toCssColor(TYPE_COLOR_MAP?.[type], accentColor);
    return (
      <span
        title={type || "Type不明"}
        aria-label={type || "Unknown"}
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          borderRadius: 4,
          background: colorCSS,
          // 外枠・テキストは表示しない
        }}
      />
    );
  };

  return (
    <li
      onClick={() => onPick?.(item)}
      style={{
        padding: "12px 8px 14px 8px",
        borderBottom: "1px solid #eee",
        cursor: "pointer",
        borderRadius: 6,
        background: "transparent",
        position: "relative",
        paddingRight: 76, // ◎ぶん右余白
      }}
      onMouseEnter={(e) => { if (hoverHighlight) e.currentTarget.style.background = "#f6f9ff"; }}
      onMouseLeave={(e) => { if (hoverHighlight) e.currentTarget.style.background = "transparent"; }}
    >
      {/* ==== 上段：番号（左寄せ） + 日付（右） ==== */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        {/* ★番号を左寄せ（商品名と同じX位置） */}
        <strong
          style={{
            color: "rgb(50,50,50)",
            fontSize: 16,
            fontWeight: 700,
            // minWidth / textAlign: right を削除して左寄せに
          }}
        >
          {index}.
        </strong>

        <span style={{ fontSize: 13, color: "#555", visibility: showDate ? "visible" : "hidden" }}>
          {showDate ? fmtDateTime(dateValue || item?.addedAt) : "00/00/0000, 00:00"}
        </span>
      </div>

      {/* 商品名（番号と左端を揃える） */}
      <div style={{ marginTop: 2, fontSize: 15, color: "#333", lineHeight: 1.35 }}>
        {item?.商品名 || "（名称不明）"}
      </div>

      {/* 下段：色ブロック / 価格 / Sweet / Body */}
      <div
        style={{
          marginTop: 6,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <TypeBadge type={item?.Type} />
        <small style={{ color: "#444" }}>
          {price}　 Sweet: {sweetVal != null ? sweetVal.toFixed(2) : "—"} / Body: {bodyVal != null ? bodyVal.toFixed(2) : "—"}
        </small>
      </div>

      {/* 右下に◎を固定 */}
      {extraRight && (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          {extraRight}
        </div>
      )}
    </li>
  );
}
