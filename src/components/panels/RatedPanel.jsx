import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DRAWER_HEIGHT, PANEL_HEADER_H, PANEL_HEADER_BORDER } from "../../ui/constants";
import PanelHeader from "../ui/PanelHeader";

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
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [sortMode]);

  // ===== ランク番号（採点した順の通し番号）
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

  // ===== 表示リスト
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

  // ===== 並び替えカプセル（左側に配置）
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
          marginLeft: 6,
        }}
      >
        {[
          { key: "date",   label: "日付順"   },
          { key: "rating", label: "評価順"   },
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
                background: "transparent",       // 背景は常に透過
                color: "#000",                    // 文字は黒
                opacity: active ? 1 : 0.45,       // 非アクティブは薄く
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
          {/* ===== 共通ヘッダー ===== */}
          <PanelHeader
            icon="rate2.svg"
            title="飲んだワイン"
            onClose={onClose}
            leftExtra={SortCapsule}
          />

          {/* ===== リスト ===== */}
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
              {list.map((item, idx) => (
                <li
                  key={`${item.JAN}-${idx}`}
                  onClick={() => onSelectJAN?.(item.JAN, { fromRated: true })}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid #eee",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <strong style={{ marginRight: 4 }}>{item.displayIndex ?? "—"}.</strong>
                      <span style={{ fontSize: 13, color: "#555" }}>
                        {item.ratedAt ? new Date(item.ratedAt).toLocaleString() : "（日時不明）"}
                      </span>
                      <br />
                      {item.商品名 || "（名称不明）"}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {"◎".repeat(Math.max(0, Math.min(5, Math.floor(item.rating))))}
                    </div>
                  </div>
                  <small>
                    Type: {item.Type || "不明"} / 価格:{" "}
                    {Number.isFinite(item.希望小売価格) ? `¥${item.希望小売価格.toLocaleString()}` : "不明"}
                    <br />
                    Sweet: {Number.isFinite(item.PC2) ? item.PC2.toFixed(2) : "—"}, Body:{" "}
                    {Number.isFinite(item.PC1) ? item.PC1.toFixed(2) : "—"}
                  </small>
                </li>
              ))}
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
