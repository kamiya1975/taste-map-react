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
import ListRow from "../ui/ListRow"; // ← 共通コンポーネントを使用

// ★星バッジだけ残す
const StarBadge = ({ size = 22 }) => (
  <img
    src={`${process.env.PUBLIC_URL || ""}/img/star.png`}
    alt="飲みたい"
    width={size}
    height={size}
    style={{ display: "block" }}
    draggable={false}
  />
);

/* =========================
   評価一覧パネル本体
   ========================= */
export default function RatedPanel({
  isOpen,
  onClose,
  userRatings,
  data,
  favorites = {},   // JAN → { addedAt }
  onSelectJAN,
}) {
  // ★の副作用で入ってしまった「source==='wish' && rating===1」を除去
  React.useEffect(() => {
    if (!isOpen) return;
    try {
      const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
      let changed = false;
      for (const [jan, meta] of Object.entries(ratings)) {
        if (meta && meta.source === "wish" && Number(meta.rating) === 1) {
          delete ratings[jan];
          changed = true;
        }
      }
      if (changed) localStorage.setItem("userRatings", JSON.stringify(ratings));
    } catch {}
  }, [isOpen]);

  const [sortMode, setSortMode] = React.useState("date");
  React.useEffect(() => { if (isOpen) setSortMode("date"); }, [isOpen]);

  const scrollRef = React.useRef(null);
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [sortMode]);

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

  // 表示リスト（評価あり + 飲みたいのみ を統合）
  const list = React.useMemo(() => {
    const wishMap = favorites || {};
    const wishSet = new Set(Object.keys(wishMap).map(String));

    // 1) 評価あり（rating>0）
    const bucket = new Map();
    Object.entries(userRatings || {}).forEach(([jan, meta]) => {
      const rating = Number(meta?.rating) || 0;
      if (rating <= 0) return;
      bucket.set(String(jan), {
        jan: String(jan),
        rating,
        ratedAt: meta?.date ?? null,
        isWish: wishSet.has(String(jan)),
      });
    });

    // 2) 未評価の「飲みたい」
    wishSet.forEach((jan) => {
      if (!bucket.has(jan)) {
        bucket.set(jan, {
          jan,
          rating: 0,
          ratedAt: wishMap[jan]?.addedAt ?? null,
          isWish: true,
        });
      }
    });

    // 3) data 突合
    const arr = Array.from(bucket.values())
      .map((entry) => {
        const it = (data || []).find((d) => String(d.JAN) === entry.jan);
        if (!it) return null;
        const rankedIndex = rankMap.get(entry.jan) ?? null;
        return {
          ...it,
          ratedAt: entry.ratedAt,
          rating: entry.rating,
          isWish: entry.isWish,
          displayIndex: rankedIndex,
        };
      })
      .filter(Boolean);

    // 並び順：タブで切替（常に「飲みたい優先」は維持）
    const byWish = (a, b) => (b.isWish === a.isWish ? 0 : (b.isWish ? 1 : -1));
    if (sortMode === "rating") {
      arr.sort((a, b) => {
        const w = byWish(a, b); if (w !== 0) return w;
        if (b.rating !== a.rating) return b.rating - a.rating;       // 評価高い順
        return (new Date(b.ratedAt || 0) - new Date(a.ratedAt || 0)); // 同点は新しい順
      });
    } else {
      arr.sort((a, b) => {
        const w = byWish(a, b); if (w !== 0) return w;
        return (new Date(b.ratedAt || 0) - new Date(a.ratedAt || 0)); // 新しい順
      });
    }

    // 表示番号：rankMap優先、無ければ上から N, N-1, ...
    const N = arr.length;
    return arr.map((x, i) => ({ ...x, displayIndex: x.displayIndex ?? (N - i) }));
  }, [data, userRatings, favorites, rankMap, sortMode]);

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
            icon="rate.svg"
            title="評価・お気に入り"
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
                const right = item.rating > 0
                  ? <CircleRatingDisplay rating={item.rating} size={35} />
                  : <StarBadge />;
                return (
                  <ListRow
                    key={`${item.JAN}-${idx}`}
                    index={item.displayIndex ?? idx + 1}
                    item={item}
                    onPick={() => onSelectJAN?.(item.JAN, { fromRated: true })}
                    showDate
                    dateValue={item.ratedAt}
                    accentColor={typeColor}
                    extraRight={right}
                  />
                );
              })}
              {list.length === 0 && (
                <li style={{ color: "#666" }}>まだ「お気に入り」の商品がありません。</li>
              )}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
