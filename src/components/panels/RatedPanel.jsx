import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DRAWER_HEIGHT,
  PANEL_HEADER_H,
  PANEL_HEADER_BORDER,
  TYPE_COLOR_MAP,
} from "../../ui/constants";
import PanelHeader from "../ui/PanelHeader";
import CircleRatingDisplay from "../../components/CircleRatingDisplay";

/* =========================
   共通行 ListRow（内蔵）
   ========================= */

// 配列RGB or 文字列を CSS color に正規化
const toCssColor = (c, fallback) => {
  if (!c) return fallback;
  if (Array.isArray(c)) return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  return String(c);
};

function ListRow({
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

  const bodyVal =
    Number.isFinite(item?.PC1) ? item.PC1 :
    Number.isFinite(item?.BodyAxis) ? item.BodyAxis : null;

  const sweetVal =
    Number.isFinite(item?.PC2) ? item.PC2 :
    Number.isFinite(item?.SweetAxis) ? item.SweetAxis : null;

  // 表記を YYYY/MM/DD ,HH:MM に統一
  const fmtDateTime = (v) => {
    if (!v) return "（日時不明）";
    try {
      const d = new Date(v);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${y}/${m}/${day} ,${hh}:${mm}`;
    } catch { return "（日時不明）"; }
  };

  // タイプは色ブロックのみ
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
        paddingRight: 76, // ◎の分の右余白
      }}
      onMouseEnter={(e) => { if (hoverHighlight) e.currentTarget.style.background = "#f6f9ff"; }}
      onMouseLeave={(e) => { if (hoverHighlight) e.currentTarget.style.background = "transparent"; }}
    >
      {/* 上段：番号 + 日時（番号のすぐ右） */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 2,
        }}
      >
        <strong
          style={{
            color: "rgb(50,50,50)",
            fontSize: 16,
            fontWeight: 700,
            // 左寄せ（minWidth/textAlignは使わない）
          }}
        >
          {index}.
        </strong>

        {/* showDate=false の場合は描画しない */}
        {showDate && (
          <span style={{ fontSize: 13, color: "#555" }}>
            {fmtDateTime(dateValue || item?.ratedAt)}
          </span>
        )}
      </div>

      {/* 商品名（番号・日時の下に） */}
      <div style={{ fontSize: 15, color: "#333", lineHeight: 1.35 }}>
        {item?.商品名 || "（名称不明）"}
      </div>

      {/* 下段：色ブロック / 価格 / Sweet / Body */}
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <TypeBadge type={item?.Type} />
        <small style={{ color: "#444" }}>
          {price}　 Sweet: {sweetVal != null ? sweetVal.toFixed(2) : "—"} / Body: {bodyVal != null ? bodyVal.toFixed(2) : "—"}
        </small>
      </div>

      {/* 右下に◎を固定（お気に入りと同仕様） */}
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

/* =========================
   評価一覧パネル本体
   ========================= */
export default function RatedPanel({
  isOpen,
  onClose,
  userRatings,
  data,
  onSelectJAN,
}) {
  const [sortMode, setSortMode] = React.useState("date");
  React.useEffect(() => { if (isOpen) setSortMode("date"); }, [isOpen]);

  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sortMode]);

  // 採点した順の通し番号（1始まり）
  const rankMap = React.useMemo(() => {
    const items = Object.entries(userRatings || {})
      .map(([jan, meta]) => ({
        jan: String(jan),
        rating: Number(meta?.rating) || 0,
        t: meta?.date ? new Date(meta.date).getTime() : 0,
      }))
      .filter((x) => x.rating > 0)
      .sort((a, b) => (a.t - b.t) || a.jan.localeCompare(b.jan));

    const m = new Map();
    items.forEach((x, idx) => m.set(x.jan, idx + 1));
    return m;
  }, [userRatings]);

  // 表示リスト
  const list = React.useMemo(() => {
    const arr = Object.entries(userRatings || {})
      .map(([jan, meta]) => {
        const rating = Number(meta?.rating) || 0;
        if (rating <= 0) return null;
        const it = (data || []).find((d) => String(d.JAN) === String(jan));
        if (!it) return null;
        return {
          ...it,
          ratedAt: meta?.date ?? null,
          rating,
          displayIndex: rankMap.get(String(jan)) ?? null,
        };
      })
      .filter(Boolean);

    if (sortMode === "rating") {
      arr.sort((a, b) =>
        (b.rating !== a.rating)
          ? b.rating - a.rating
          : (new Date(b.ratedAt || 0) - new Date(a.ratedAt || 0))
      );
    } else {
      arr.sort((a, b) => new Date(b.ratedAt || 0) - new Date(a.ratedAt || 0));
    }
    return arr;
  }, [data, userRatings, sortMode, rankMap]);

  // 右上：並び替えカプセル
  const SortCapsule = (
    <div
      role="group"
      aria-label="並び替え"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "transparent",
        border: "1px solid rgb(221,211,198)",
        borderRadius: 8,
        overflow: "hidden",
        height: 28,
      }}
    >
      {[
        { key: "date",   label: "日付順" },
        { key: "rating", label: "評価順" },
      ].map((b, i) => {
        const active = sortMode === b.key;
        return (
          <button
            key={b.key}
            onPointerDown={(e) => { e.preventDefault(); setSortMode(b.key); }}
            onClick={(e) => { e.preventDefault(); setSortMode(b.key); }}
            aria-pressed={active}
            style={{
              WebkitTapHighlightColor: "transparent",
              padding: "6px 10px",
              fontSize: 13,
              lineHeight: 1,
              border: "none",
              background: "transparent",
              color: "#000",
              opacity: active ? 1 : 0.45,
              cursor: "pointer",
              whiteSpace: "nowrap",
              ...(i === 0 ? { borderRight: "1px solid rgb(221,211,198)" } : null),
            }}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
          style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            height: DRAWER_HEIGHT,
            backgroundColor: "#fff",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.2)",
            zIndex: 20,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
          }}
        >
          <PanelHeader
            icon="rate2.svg"
            title="飲んだワイン"
            onClose={onClose}
            rightExtra={SortCapsule}
          />

          <div
            ref={scrollRef}
            style={{
              height: `calc(${DRAWER_HEIGHT} - ${PANEL_HEADER_H}px)`,
              overflowY: "auto",
              padding: "12px 16px",
              background: "#fff",
              borderTop: PANEL_HEADER_BORDER,
            }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {list.map((item, idx) => {
                const typeColor = TYPE_COLOR_MAP?.[item?.Type] ?? "rgb(180,180,180)";
                return (
                  <ListRow
                    key={`${item.JAN}-${idx}`}
                    index={item.displayIndex ?? idx + 1}
                    item={item}
                    onPick={() => onSelectJAN?.(item.JAN, { fromRated: true })}
                    showDate
                    dateValue={item.ratedAt}
                    accentColor={typeColor}
                    extraRight={<CircleRatingDisplay rating={item.rating} size={35} />}
                  />
                );
              })}
              {list.length === 0 && (
                <li style={{ color: "#666" }}>まだ「飲んだワイン」がありません。</li>
              )}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
