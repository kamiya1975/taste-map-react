// src/components/ui/ListRow.jsx
// 一覧表の表示指定
import React from "react";

/** 配列RGB or 文字列を CSS color に正規化 */
const toCssColor = (c, fallback) => {
  if (!c) return fallback;
  if (Array.isArray(c)) return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  return String(c);
};

// wine_type → 色（クラスター色は廃止）
// 値は DB の wine_type に合わせる（例: "eed","white","sparkling","rose"）
const WINE_TYPE_COLOR_MAP = {
  red: "#D47A7A",        // 軽い・クリーン赤 と同色
  white: "#D6D098",      // 穏やか・ミディアム白 と同色
  sparkling: "#CFE1A8",  // 若飲みフレッシュ白（スパークリング）と同色
  rose: "#D8B7A9",       // 甘口・フルーティー（ロゼ）と同色
};

export default function ListRow({
  index,
  item,
  onPick,
  showDate = false,
  dateValue = null,
  dateText = "",        // 追加：日付表示の上書き（例 "2026.01.09.  #1007"）
  hideName = false,     // 追加：商品名を出さない（Miles用）
  hideBadge = false,    // 追加：色ブロック行を出さない（Miles用）
  accentColor = "#b4b4b4",
  extraRight = null,   // ← ◎（CircleRatingDisplay など）
  hoverHighlight = true,
}) {

  const fmtDateTime = (v) => {
    if (!v) return "（日時不明）";
    try {
      const d = new Date(v);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
    //  const hh = String(d.getHours()).padStart(2, "0");
    //  const mm = String(d.getMinutes()).padStart(2, "0");
    //  return `${y}/${m}/${day} ,${hh}:${mm}`;
      return `${y}.${m}.${day}.`;
    } catch { return "（日時不明）"; }
  };

  /** ==== TypeBadge（修正）====
   * 外枠とタイプ名をカットして「色ブロックのみ」を表示
   */
  const TypeBadge = ({ wineType }) => {
    const key = String(wineType || "").trim().toLowerCase();
    const colorCSS = toCssColor(WINE_TYPE_COLOR_MAP?.[key], accentColor);
    return (
      <span
        title={wineType || "wine_type不明"}
        aria-label={wineType || "Unknown"}
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
        paddingRight: extraRight ? 76 : 8, // 右要素がある時だけ余白
        WebkitTapHighlightColor: "transparent",
      }}
//      onMouseEnter={(e) => { if (hoverHighlight) e.currentTarget.style.background = "#f6f9ff"; }}
//      onMouseLeave={(e) => { if (hoverHighlight) e.currentTarget.style.background = "transparent"; }}
    >
      {/* ==== 上段：番号（左寄せ） + 日付（右） ==== */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
        <strong style={{ color: "rgb(50,50,50)", fontSize: 16, fontWeight: 700 }}>
          {index}.
        </strong>

        {showDate && (
          <span style={{ fontSize: 13, color: "#555" }}>
            {dateText ? String(dateText) : fmtDateTime(dateValue || item?.addedAt)}
          </span>
        )}
      </div>

      {/* 商品名（番号と左端を揃える） */}
      {!hideName && (
        <div style={{ fontSize: 15, color: "#333", lineHeight: 1.35 }}>
          {item?.name_kana || item?.name || item?.商品名 || "（名称不明）"}
        </div>
      )}

      {/* 下段：色ブロック（wine_type） */}
      {!hideBadge && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <TypeBadge wineType={item?.wine_type} />
        </div>
      )}
      
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
            pointerEvents: "auto",
          }}
          onClick={(e) => {
            e.stopPropagation(); // ← 行遷移を止める
          }}
        >
          {extraRight}
        </div>
      )}
    </li>
  );
}
