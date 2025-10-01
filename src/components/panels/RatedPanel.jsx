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

  const TypeBadge = ({ type }) => {
    const color = (type && TYPE_COLOR_MAP?.[type]) ? TYPE_COLOR_MAP[type] : accentColor;
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
          border: `1px solid ${color}`,
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
            background: color,
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
      {/* 上段：番号 + 日付 + 右端（評価） */}
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
        {extraRight ? <div style={{ marginLeft: 8 }}>{extraRight}</div> : null}
      </div>

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
                const typeColor =
                  TYPE_COLOR_MAP?.[item?.Type] ?? "rgb(180,180,180)";

                return (
                  <ListRow
                    key={`${item.JAN}-${idx}`}
                    index={item.displayIndex ?? idx + 1}
                    item={item}
                    onPick={() => onSelectJAN?.(item.JAN, { fromRated: true })}
                    showDate
                    dateValue={item.ratedAt}
                    accentColor={typeColor}
                    extraRight={<CircleRatingDisplay rating={item.rating} size={24} />}
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
