// src/components/panels/RatedPanel.jsx
// 評価一覧パネル
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DRAWER_HEIGHT,
  PANEL_HEADER_H,
  PANEL_HEADER_BORDER,
} from "../../ui/constants";
import PanelHeader from "../ui/PanelHeader";
import CircleRatingDisplay from "../../components/CircleRatingDisplay";
import ListRow from "../ui/ListRow"; // ← 共通コンポーネントを使用

/* =========================
   評価一覧パネル本体
   ========================= */
export default function RatedPanel({
  isOpen,
  onClose,
  onSelectJAN,
}) {

  const [sortMode, setSortMode] = React.useState("date");
  React.useEffect(() => { if (isOpen) setSortMode("date"); }, [isOpen]);

  const scrollRef = React.useRef(null);
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [sortMode]);

  // ----------------------------
  // ログイン判定（トークン有無）
  // ※ localStorage はレンダー中に触ってもOKだが、try/catchで安全側に倒す
  // ----------------------------
  const token = React.useMemo(() => {
    try {
      return localStorage.getItem("app.access_token") || "";
    } catch {
      return "";
    }
  }, [isOpen]); // パネルを開くたびに拾い直す

  // ----------------------------
  // バックから一覧を取得
  // ----------------------------
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!isOpen) return;
    // ログイン外：文字表示のみ（fetch しない・エラーにもならない）
    if (!token) {
      setLoading(false);
      setError(null);
      setItems([]);
      return;
    }
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ sort: sortMode });
        const API_BASE = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE || "";
        const url = `${API_BASE}/api/app/ratings?${qs.toString()}`;
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`ratings fetch failed: ${res.status} ct=${ct} body=${body.slice(0,120)}`);
        }
        if (!ct.includes("application/json")) {
          const body = await res.text().catch(() => "");
          throw new Error(`ratings not json: ct=${ct} body=${body.slice(0,120)}`);
        }
        const json = await res.json();
        setItems(Array.isArray(json?.items) ? json.items : []);
      } catch (e) {
        // ここはログイン済みの前提なので、通常の取得失敗として表示する
        console.error(e);      
        setItems([]);
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [isOpen, sortMode, token]);

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
              {!token && <li style={{ color: "#666" }}>評価履歴はログイン後に表示されます。</li>}
              {loading && <li style={{ color: "#666" }}>読み込み中…</li>}
              {!loading && error && <li style={{ color: "#c00" }}>{error}</li>}
              {!!token && !loading && !error && items.map((it) => (
                <ListRow
                  key={`${it.jan_code}-${it.created_at}`}
                  index={it.display_rank ?? 0}
                  item={it}
                  onPick={() => onSelectJAN?.(it.jan_code, { fromRated: true })}
                  showDate
                  dateValue={it.created_at}
                  // ListRow 側が wine_type を見るので accentColor は fallback のみでOK
                  accentColor={"#b4b4b4"}
                  extraRight={<CircleRatingDisplay rating={it.rating} size={35} />}
                />
              ))}
              {!!token && !loading && !error && items.length === 0 && (
                <li style={{ color: "#666" }}>まだ評価がありません。</li>
              )}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
