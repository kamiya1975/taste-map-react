// src/components/panels/RatedPanel.jsx
// 評価一覧パネル（評価 + 飲みたい を統合表示）
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DRAWER_HEIGHT, PANEL_HEADER_H, PANEL_HEADER_BORDER } from "../../ui/constants";
import PanelHeader from "../ui/PanelHeader";
import CircleRatingDisplay from "../../components/CircleRatingDisplay";
import ListRow from "../ui/ListRow";

const API_BASE =
  process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE || "";

// created_at / added_at / located_at など、どれが来ても拾う
function pickDate(it) {
  return (
    it?.created_at ||
    it?.added_at ||
    it?.wish_created_at ||
    it?.located_at ||
    null
  );
}

function toTimeMs(v) {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

// 右側の表示（評価=◎ / 飲みたい=★）
function RightMark({ it }) {
  if (it?.kind === "wish") {
    // 既存のSVG（store.svg/store2.svg）を使うならここで差し替え可能
    return (
      <span
        aria-label="飲みたい"
        title="飲みたい"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 35,
          height: 35,
          fontSize: 20,
          lineHeight: 1,
        }}
      >
        ★
      </span>
    );
  }
  return <CircleRatingDisplay rating={Number(it?.rating || 0)} size={35} />;
}

/* =========================
   評価一覧パネル本体
   ========================= */
export default function RatedPanel({ isOpen, onClose, onSelectJAN }) {
  const [sortMode, setSortMode] = React.useState("date");
  React.useEffect(() => {
    if (isOpen) setSortMode("date");
  }, [isOpen]);

  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sortMode]);

  // ----------------------------
  // ログイン判定（トークン有無）
  // ----------------------------
  const token = React.useMemo(() => {
    try {
      return localStorage.getItem("app.access_token") || "";
    } catch {
      return "";
    }
  }, [isOpen]); // パネルを開くたびに拾い直す

  // ----------------------------
  // バックから一覧を取得（ratings + wishlist）
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
        // ------- rated-panel（統合API）-------
        const qs = new URLSearchParams({ sort: sortMode });
        const url = `${API_BASE}/api/app/rated-panel?${qs.toString()}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(
            `rated-panel fetch failed: ${res.status} ct=${ct} body=${body.slice(0, 120)}`
          );
        }
        if (!ct.includes("application/json")) {
          const body = await res.text().catch(() => "");
          throw new Error(`rated-panel not json: ct=${ct} body=${body.slice(0, 120)}`);
        }
        const json = await res.json();
        const arr = Array.isArray(json?.items) ? json.items : [];
        // kind/display_rank は基本バックが返す。念のため最低限だけ補正。
        const normalized = arr.map((it) => ({
          ...it,
          kind: it?.kind || (Number(it?.rating || 0) > 0 ? "rating" : "wish"),
          created_at: pickDate(it) || it?.created_at || null,
          display_rank: Number(it?.display_rank || 0),
        }));
        setItems(normalized);
      } catch (e) {
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
        { key: "date", label: "日付順" },
        { key: "rating", label: "評価順" },
      ].map((b, i) => {
        const active = sortMode === b.key;
        return (
          <button
            key={b.key}
            onPointerDown={(e) => {
              e.preventDefault();
              setSortMode(b.key);
            }}
            onClick={(e) => {
              e.preventDefault();
              setSortMode(b.key);
            }}
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
              ...(i === 0
                ? { borderRight: "1px solid rgb(221,211,198)" }
                : null),
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
            bottom: 0,
            left: 0,
            right: 0,
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
            title="評価・飲みたい一覧"
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
              {!token && (
                <li style={{ color: "#666" }}>
                  評価や飲みたいはログイン後に表示されます。
                </li>
              )}
              {loading && <li style={{ color: "#666" }}>読み込み中…</li>}
              {!loading && error && <li style={{ color: "#c00" }}>{error}</li>}

              {!!token &&
                !loading &&
                !error &&
                items.map((it) => (
                  <ListRow
                    key={`${it.kind}-${it.id ?? ""}-${it.jan_code}-${pickDate(it) || ""}`}
                    index={it.display_rank ?? 0}
                    item={it}
                    onPick={() =>
                      onSelectJAN?.(it.jan_code, { fromRated: true })
                    }
                    showDate
                    dateValue={pickDate(it) || it.created_at}
                    accentColor={"#b4b4b4"}
                    extraRight={<RightMark it={it} />}
                  />
                ))}

              {!!token && !loading && !error && items.length === 0 && (
                <li style={{ color: "#666" }}>
                  まだ評価や飲みたいがありません。
                </li>
              )}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
