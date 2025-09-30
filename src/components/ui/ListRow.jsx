import React from "react";

/** モック準拠の共通行
 * props:
 *  - index:            表示番号（1始まり）
 *  - item:             商品データ（JAN, 商品名, 希望小売価格, PC1/PC2 or BodyAxis/SweetAxis など）
 *  - onPick(item):     クリック時
 *  - showDate:         trueなら日付表示（検索ではfalse）
 *  - dateValue:        表示する日付（ISO文字列/Date/数値）※showDate=trueの時のみ
 *  - accentColor:      左の小ドット色（検索=ワイン色, お気に入り=赤紫, 評価=黄緑など）
 *  - extraRight:       右端に差し込む要素（例：◎◎◎）
 *  - hoverHighlight:   マウスホバー反転（デフォルトtrue）
 */
export default function ListRow({
  index,
  item,
  onPick,
  showDate = false,
  dateValue = null,
  accentColor = "#6b2e2e",
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
      // 例: 20/09/2025, 20:43
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

  return (
    <li
      onClick={() => onPick?.(item)}
      style={{
        padding: "12px 8px",
        borderBottom: "1px solid #eee",
        cursor: "pointer",
        borderRadius: 6,
        background: "transparent",
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
      {/* 上段：番号 + 日付（任意） + 右端差し込み */}
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

        {/* 右端（例：◎◎◎） */}
        {extraRight ? (
          <div style={{ marginLeft: 8 }}>{extraRight}</div>
        ) : null}
      </div>

      {/* 商品名 */}
      <div style={{ marginTop: 2, fontSize: 15, color: "#333", lineHeight: 1.35 }}>
        {item?.商品名 || "（名称不明）"}
      </div>

      {/* 下段：小ドット + 価格 / Sweet / Body */}
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: accentColor,
            display: "inline-block",
          }}
        />
        <small style={{ color: "#444" }}>
          {price}　 Sweet: {sweetVal != null ? sweetVal.toFixed(2) : "—"} / Body:{" "}
          {bodyVal != null ? bodyVal.toFixed(2) : "—"}
        </small>
      </div>
    </li>
  );
}
