import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DRAWER_HEIGHT, PANEL_HEADER_H } from "../../ui/constants";
import PanelHeader from "../ui/PanelHeader";
import ListRow from "../ui/ListRow";

export default function FavoritePanel({
  isOpen,
  onClose,
  favorites,
  data,
  userRatings,
  onSelectJAN,
}) {
  // 表示リスト作成（評価済みは除外）
  const list = React.useMemo(() => {
    const arr = Object.entries(favorites || {})
      .map(([jan, meta]) => {
        const item = (data || []).find((d) => String(d.JAN) === String(jan));
        if (!item) return null;
        return { ...item, addedAt: meta?.addedAt ?? null };
      })
      .filter(Boolean)
      .filter((it) => !(Number(userRatings?.[String(it.JAN)]?.rating) > 0));

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
            overflow: "hidden",
          }}
        >
          {/* 共通ヘッダー（商品/検索と完全一致） */}
          <PanelHeader
            title="飲みたい"
            icon="stor.svg"
            onClose={onClose}
          />

          {/* リスト領域（ヘッダー高さ分を差し引き） */}
          <div
            style={{
              height: `calc(${DRAWER_HEIGHT} - ${PANEL_HEADER_H}px)`,
              overflowY: "auto",
              padding: "8px 12px 12px",
              backgroundColor: "#fff",
            }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {list.map((item, idx) => (
                <ListRow
                  key={`${item.JAN}-${idx}`}
                  index={item.displayIndex}
                  item={item}
                  onPick={() => onSelectJAN?.(item.JAN)}
                  showDate={true}
                  dateValue={item.addedAt}     // ← 追加日を渡す（表示安定化）
                  accentColor="#7a2e39"
                  hoverHighlight={true}
                />
              ))}
              {list.length === 0 && (
                <li style={{ color: "#666", padding: "8px 4px" }}>
                  まだ「飲みたいワイン」はありません。
                </li>
              )}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
