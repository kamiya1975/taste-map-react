import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DRAWER_HEIGHT } from "../../ui/constants"

export default function FavoritePanel({
  isOpen,
  onClose,
  favorites,
  data,
  userRatings,
  onSelectJAN,
}) {
  const list = React.useMemo(() => {
    const arr = Object.entries(favorites || {})
      .map(([jan, meta]) => {
        const item = (data || []).find((d) => String(d.JAN) === String(jan));
        if (!item) return null;
        return { ...item, addedAt: meta?.addedAt ?? null };
      })
      .filter(Boolean)
      // 評価済みは表示しない（視覚一貫性）
      .filter((item) => !(Number(userRatings?.[String(item.JAN)]?.rating) > 0));

    arr.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));
    return arr.map((x, i) => ({ ...x, displayIndex: arr.length - i }));
  }, [favorites, data, userRatings]);

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
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #ddd",
              background: "#f9f9f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0 }}>飲みたいワイン</h3>
            <button
              onClick={onClose}
              style={{ background: "#eee", border: "1px solid #ccc", padding: "6px 10px", borderRadius: 4 }}
            >
              閉じる
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", backgroundColor: "#fff" }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {list.map((item, idx) => (
                <li
                  key={`${item.JAN}-${idx}`}
                  onClick={() => onSelectJAN?.(item.JAN)}
                  style={{ padding: "10px 0", borderBottom: "1px solid #eee", cursor: "pointer" }}
                >
                  <div>
                    <strong style={{ marginRight: 4 }}>{item.displayIndex}.</strong>
                    <span style={{ fontSize: 15, color: "#555" }}>
                      {item.addedAt ? new Date(item.addedAt).toLocaleDateString() : "（日付不明）"}
                    </span>
                    <br />
                    {item.商品名 || "（名称不明）"}
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
              {list.length === 0 && <li style={{ color: "#666" }}>まだ「飲みたいワイン」はありません。</li>}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
