import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DRAWER_HEIGHT } from "../../ui/constants";

export default function RatedPanel({ isOpen, onClose, userRatings, data, onSelectJAN }) {
  // 好みのサイズに調整してください
  const HEADER_SIZES = {
    title: 13,   // 「飲んだワイン」
    label: 11,   // 「並び替え」
    button: 12,  // 「日時順」「評価順」「閉じる」
  };
  const [sortMode, setSortMode] = React.useState("date");
  React.useEffect(() => { if (isOpen) setSortMode("date"); }, [isOpen]);

  const scrollRef = React.useRef(null);
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [sortMode]);

  const rankMap = React.useMemo(() => {
    const items = Object.entries(userRatings || {})
      .map(([jan, meta]) => ({
        jan: String(jan),
        rating: Number(meta?.rating) || 0,
        t: meta?.date ? new Date(meta.date).getTime() : 0,
      }))
      .filter((x) => x.rating > 0);

    items.sort((a, b) => (a.t - b.t) || a.jan.localeCompare(b.jan));
    const map = new Map();
    items.forEach((x, idx) => map.set(x.jan, idx + 1));
    return map;
  }, [userRatings]);

  const list = React.useMemo(() => {
    const arr = Object.entries(userRatings || {})
      .map(([jan, meta]) => {
        const rating = Number(meta?.rating) || 0;
        if (rating <= 0) return null;
        const it = (data || []).find((d) => String(d.JAN) === String(jan));
        if (!it) return null;
        return { ...it, ratedAt: meta?.date ?? null, rating, displayIndex: rankMap.get(String(jan)) ?? null };
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: DRAWER_HEIGHT, backgroundColor: "#fff",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.2)", zIndex: 20,
            borderTopLeftRadius: 12, borderTopRightRadius: 12,
            display: "flex", flexDirection: "column", pointerEvents: "auto",
          }}
        >
          {/* ヘッダー */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #ddd",
              background: "#f9f9f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              WebkitTextSizeAdjust: "100%", // ← iOSの自動文字拡大を抑止
            }}
          >
            <h3 style={{ margin: 0, fontSize: HEADER_SIZES.title, lineHeight: 1.2, fontWeight: 700 }}>
              飲んだワイン
            </h3>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: HEADER_SIZES.label, color: "#666" }}>並び替え</span>

              <div style={{
                display: "inline-flex",
                border: "1px solid #ccc",
                borderRadius: 8,
                overflow: "hidden"
              }}>
                <button
                  onPointerDown={(e) => { e.preventDefault(); setSortMode("date"); }}
                  onClick={(e) => { e.preventDefault(); setSortMode("date"); }}
                  aria-pressed={sortMode === "date"}
                  style={{ padding: "8px 10px", fontSize: HEADER_SIZES.button, lineHeight: 1.2 }}
                >
                  日付順
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); setSortMode("rating"); }}
                  onClick={(e) => { e.preventDefault(); setSortMode("rating"); }}
                  aria-pressed={sortMode === "rating"}
                  style={{ padding: "8px 10px", fontSize: HEADER_SIZES.button, lineHeight: 1.2 }}
                >
                  評価順
                </button>
              </div>

              <button
                onClick={onClose}
                style={{ background:"#eee", border:"1px solid #ccc", padding:"8px 10px", borderRadius:8, fontSize: HEADER_SIZES.button, lineHeight:1.2, marginLeft:8 }}
              >
                閉じる
              </button>
            </div>
          </div>

          {/* リスト */}
          <div
            ref={scrollRef}
            style={{ flex: 1, overflowY: "auto", padding: "12px 16px", backgroundColor: "#fff" }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {list.map((item, idx) => (
                <li
                  key={`${item.JAN}-${idx}`}
                  onClick={() => onSelectJAN?.(item.JAN, { fromRated: true })} // ← フラグを渡す
                  style={{ padding: "10px 0", borderBottom: "1px solid #eee", cursor: "pointer" }}
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
                    {item.希望小売価格 ? `¥${item.希望小売価格.toLocaleString()}` : "不明"}
                    <br />
                    Sweet: {Number.isFinite(item.PC2) ? item.PC2.toFixed(2) : "—"}, Body:{" "}
                    {Number.isFinite(item.PC1) ? item.PC1.toFixed(2) : "—"}
                  </small>
                </li>
              ))}
              {list.length === 0 && <li style={{ color: "#666" }}>まだ「飲んだワイン」がありません。</li>}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
