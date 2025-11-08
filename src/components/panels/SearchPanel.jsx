import React, { useMemo, useState, useEffect, useRef } from "react";
import Drawer from "@mui/material/Drawer";
import { makeIndexed, searchItems, normalizeJP } from "../../utils/search";
import { drawerModalProps, paperBaseStyle, DRAWER_HEIGHT } from "../../ui/constants";
import ListRow from "../ui/ListRow";
import PanelHeader from "../ui/PanelHeader";

export default function SearchPanel({ open, onClose, data = [], onPick, onScanClick }) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) {
      setQ("");
    }
  }, [open]);

  const scrollRef = useRef(null);
  const SCROLL_KEY = "searchPanel.scrollTop";

  const indexed = useMemo(() => makeIndexed(data), [data]);

  // ★ 初期一覧（検索語なし）の並び：希望小売価格 昇順、未登録は最後
  const initialSorted = useMemo(() => {
    const arr = Array.isArray(data) ? [...data] : [];
    arr.sort((a, b) => {
      const pa = Number.isFinite(a?.["希望小売価格"]) ? a["希望小売価格"] : Infinity;
      const pb = Number.isFinite(b?.["希望小売価格"]) ? b["希望小売価格"] : Infinity;
      if (pa !== pb) return pa - pb;
      const na = String(a?.["商品名"] ?? a?.JAN ?? "");
      const nb = String(b?.["商品名"] ?? b?.JAN ?? "");
      return na.localeCompare(nb, "ja");
    });
    return arr;
  }, [data]);

  // ★ 検索語がある時は従来検索、空の時は「全件・価格昇順」
  const results = useMemo(() => {
    const nq = normalizeJP(q);
    if (nq) return searchItems(indexed, nq, 200);
    return initialSorted;
  }, [indexed, q, initialSorted]);

  const pick = (i) => {
    const it = results[i] ?? results[0];
    if (it) onPick?.(it);
  };

  const listed = useMemo(
    () => results.map((x, i) => ({ ...x, addedAt: null, displayIndex: i + 1 })),
    [results]
  );

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    if (Number.isFinite(y)) {
      requestAnimationFrame(() => { el.scrollTop = y; });
    }
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let t = 0;
    const onScroll = () => {
      const now = Date.now();
      if (now - t < 80) return;
      t = now;
      sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop || 0));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);

  const HEADER_H = 42;

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      hideBackdrop
      sx={{ zIndex: 1450 }}
      BackdropProps={{ style: { background: "transparent", pointerEvents: "none" } }}
      ModalProps={{
        ...drawerModalProps,
        keepMounted: true,
        disableEnforceFocus: true,
        disableAutoFocus: true,
        disableRestoreFocus: true,
      }}
      PaperProps={{
        style: {
          ...paperBaseStyle,
          height: DRAWER_HEIGHT,
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <PanelHeader
        title="検索"
        icon="search2.svg"
        iconFallback="search2.svg"
        onClose={() => { setQ(""); onClose?.(); }}
      />

      {/* 検索行 */}
      <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid #eee", background:"#f9f9f9" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", border: "1px solid #ccc", borderRadius: 8, background: "#fff", padding: "6px 10px" }}>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              sessionStorage.setItem(SCROLL_KEY, "0");
            }}
            onKeyDown={(e) => { if (e.key === "Enter") pick(0); }}
            placeholder="キーワードまたはJANコードから検索"
            style={{ border: "none", outline: "none", width: "100%", fontSize: 16, paddingRight: 44, lineHeight: 1 }}
          />
          <button
            onClick={onScanClick}
            title="バーコード読み取り"
            aria-label="バーコード読み取り"
            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 34, height: 22, borderRadius: 6, border: "1px solid #d0d0d0", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <div style={{ display: "flex", gap: 2, height: 14, alignItems: "stretch" }}>
              {[3, 1, 2, 1, 2, 1].map((w, i) => (
                <span key={i} style={{ width: w, background: "#444", borderRadius: 1 }} />
              ))}
            </div>
          </button>
        </div>
      </div>

      {/* リスト */}
      <div
        ref={scrollRef}
        style={{
          height: `calc(${DRAWER_HEIGHT} - ${HEADER_H}px - 52px)`,
          overflowY: "auto",
          padding: "6px 10px 12px",
          background: "#fff",
        }}
      >
        {normalizeJP(q) && listed.length === 0 && (
          <div style={{ color: "#666", padding: "12px 6px" }}>
            該当する商品が見つかりません。
          </div>
        )}

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {listed.map((item, idx) => (
            <ListRow
              key={`${item?.JAN ?? item?.jan_code ?? idx}`}
              index={item.displayIndex}
              item={item}
              onPick={() => pick(idx)}
              showDate={false}
              accentColor="#6b2e2e"
              hoverHighlight={true}
            />
          ))}
        </ul>
      </div>
    </Drawer>
  );
}
