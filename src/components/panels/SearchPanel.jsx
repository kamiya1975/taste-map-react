// src/components/panels/SearchPanel.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import Drawer from "@mui/material/Drawer";
import { makeIndexed, searchItems, normalizeJP } from "../../utils/search";
import { drawerModalProps, paperBaseStyle, DRAWER_HEIGHT } from "../../ui/constants";
import ListRow from "../ui/ListRow";

export default function SearchPanel({
  open,
  onClose,
  data = [],
  onPick,      // (item) => void
  onScanClick, // () => void
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1);

  // パネルが閉じたら検索語と状態をクリア
  useEffect(() => {
    if (!open) {
      setQ("");
      setActive(-1);
    }
  }, [open]);

  // スクロール位置の保存・復元
  const scrollRef = useRef(null);
  const SCROLL_KEY = "searchPanel.scrollTop";

  const indexed = useMemo(() => makeIndexed(data), [data]);
  const results = useMemo(() => searchItems(indexed, q, 200), [indexed, q]);

  const pick = (i) => {
    const it = results[i] ?? results[0];
    if (it) onPick?.(it); // 一覧は閉じない（MapPage側も同様の運用）
  };

  // 表示用モデル（番号は 1,2,3...）
  const listed = useMemo(
    () => results.map((x, i) => ({ ...x, addedAt: null, displayIndex: i + 1 })),
    [results]
  );

  // Drawerを開いたらスクロール位置を復元
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    if (Number.isFinite(y)) {
      requestAnimationFrame(() => {
        el.scrollTop = y;
      });
    }
  }, [open]);

  // スクロール位置を保存（軽スロットル）
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

  // 共通ヘッダー定義（商品ページと同一トーン）
  const HEADER_H = 60;
  const HEADER_BG = "rgb(221, 211, 198)";
  const HEADER_BORDER = "1px solid rgb(201, 201, 176)";

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}           // 明示的に閉じたときだけ閉じる
      hideBackdrop                // 背面操作可＆誤閉じ防止
      ModalProps={{ ...drawerModalProps, keepMounted: true }}
      PaperProps={{ style: paperBaseStyle }}
    >
      {/* ===== ヘッダー ===== */}
      <div
        style={{
          height: HEADER_H,
          minHeight: HEADER_H,
          maxHeight: HEADER_H,
          boxSizing: "border-box",
          padding: "0 8px 0 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: HEADER_BG,
          borderBottom: HEADER_BORDER,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src={`${process.env.PUBLIC_URL || ""}/img/search2.svg`}
            onError={(e) => { e.currentTarget.src = `${process.env.PUBLIC_URL || ""}/img/search.svg`; }}
            alt=""
            style={{ width: 16, height: 16, display: "block" }}
            draggable={false}
          />
        <span style={{ fontWeight: 600 }}>検索</span>
        </div>

        {/* 右：閉じる（×） */}
        <button
          onClick={() => { setQ(""); setActive(-1); onClose?.(); }}
          aria-label="閉じる"
          title="閉じる"
          style={{
            background: "transparent",
            border: "none",
            padding: "6px 8px",
            fontSize: 18,
            lineHeight: 1,
            lineHeight: 1,
            cursor: "pointer",
            color: "#000",
            marginRight: 15,
          }}
        >
          ×
        </button>
      </div>

      {/* ===== 検索ボックス行 ===== */}
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: "1px solid #eee",
          background: "#f9f9f9",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            border: "1px solid #ccc",
            borderRadius: 8,
            background: "#fff",
            padding: "8px 10px",
          }}
        >
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(-1);
              sessionStorage.setItem(SCROLL_KEY, "0"); // クエリ変更時は先頭へ
            }}
            onKeyDown={(e) => { if (e.key === "Enter") pick(0); }}
            placeholder="キーワードまたはJANコードから検索"
            style={{
              border: "none",
              outline: "none",
              width: "100%",
              fontSize: 14,
              paddingRight: 44, // 右端のバーコードボタン分
            }}
          />

          {/* 右端：バーコード読み取り */}
          <button
            onClick={onScanClick}
            title="バーコード読み取り"
            aria-label="バーコード読み取り"
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              width: 36,
              height: 24,
              borderRadius: 6,
              border: "1px solid #d0d0d0",
              background: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: 2, height: 14, alignItems: "stretch" }}>
              {[3, 1, 2, 1, 2, 1].map((w, i) => (
                <span key={i} style={{ width: w, background: "#444", borderRadius: 1 }} />
              ))}
            </div>
          </button>
        </div>
      </div>

      {/* ===== リスト ===== */}
      <div
        ref={scrollRef}
        style={{
          // 60px(ヘッダー) + ~58px(検索行) を引く
          height: `calc(${DRAWER_HEIGHT} - ${HEADER_H}px - 58px)`,
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
              key={`${item.JAN}-${idx}`}
              index={item.displayIndex}
              item={item}
              onPick={() => pick(idx)}
              showDate={false}            // 検索は日付非表示（レイアウトは確保）
              accentColor="#6b2e2e"       // ワイン色の小ドット
              hoverHighlight={true}
              onMouseEnter={() => setActive(idx)} // 既存の active を残すなら必要に応じて利用
            />
          ))}
        </ul>
      </div>
    </Drawer>
  );
}
