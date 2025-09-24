import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DRAWER_HEIGHT } from "../ui/constants";

export default function SearchPanel({
  open,
  onClose,
  data,
  onPick,        // (item) => void
  onScanClick,   // () => void
}) {
  const [q, setQ] = useState("");

  // シンプルな全文検索（商品名 / 国 / 産地 / 品種 / JAN を対象）
  const list = useMemo(() => {
    const norm = (s) => String(s ?? "").toLowerCase();
    const keys = ["商品名", "国", "産地", "葡萄品種", "JAN"];
    const needle = norm(q).trim();
    const hits = (!needle
      ? data
      : (data || []).filter((d) =>
          keys.some((k) => norm(d[k]).includes(needle))
        )
    );

    // “お気に入り” と同じ並びを意識して、番号（displayIndex）を付与
    // ここでは「下へ行くほど古い」体に合わせ、最新が上になる体裁を模倣
    // （検索の場合は時系列がないので、単に現在の並びで採番）
    const arr = hits.slice(0, 400); // 安全のため上限
    return arr.map((x, i) => ({
      ...x,
      addedAt: null, // 検索結果には時刻がない → 表示は「（日付不明）」に
      displayIndex: arr.length - i,
    }));
  }, [data, q]);

  return (
    <AnimatePresence>
      {open && (
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
            borderTopLeftRadius: "12px",
            borderTopRightRadius: "12px",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          {/* ヘッダー（お気に入りと同テイスト） */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #ddd",
              background: "#f9f9f9",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <h3 style={{ margin: 0, flexShrink: 0 }}>検索</h3>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="商品名 / 産地 / 品種 / JAN で検索"
              style={{
                flex: 1,
                height: 32,
                borderRadius: 6,
                border: "1px solid #ccc",
                padding: "0 10px",
                fontSize: 14,
              }}
            />
            <button
              onClick={onScanClick}
              style={{
                background: "#eee",
                border: "1px solid #ccc",
                padding: "6px 10px",
                borderRadius: "4px",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              スキャン
            </button>
            <button
              onClick={onClose}
              style={{
                background: "#eee",
                border: "1px solid #ccc",
                padding: "6px 10px",
                borderRadius: "4px",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              閉じる
            </button>
          </div>

          {/* リスト（“お気に入り” と同じ見た目） */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {list.map((item, idx) => (
                <li
                  key={`${item.JAN}-${idx}`}
                  onClick={() => onPick?.(item)}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid #eee",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <strong
                      style={{
                        display: "inline-block",
                        color: "rgb(50, 50, 50)",
                        fontSize: "16px",
                        fontWeight: "bold",
                        marginRight: "4px",
                        fontFamily: '"Helvetica Neue", Arial, sans-serif',
                      }}
                    >
                      {item.displayIndex}.
                    </strong>
                    <span style={{ fontSize: "15px", color: "#555" }}>
                      {item.addedAt
                        ? new Date(item.addedAt).toLocaleDateString()
                        : "（日付不明）"}
                    </span>
                    <br />
                    {item.商品名 || "（名称不明）"}
                  </div>
                  <small>
                    Type: {item.Type || "不明"} / 価格:{" "}
                    {Number.isFinite(item.希望小売価格)
                      ? `¥${Number(item.希望小売価格).toLocaleString()}`
                      : "不明"}
                    <br />
                    Body:{" "}
                    {Number.isFinite(item.BodyAxis)
                      ? item.BodyAxis.toFixed(2)
                      : "—"}
                    , Sweet:{" "}
                    {Number.isFinite(item.SweetAxis)
                      ? item.SweetAxis.toFixed(2)
                      : "—"}
                    <br />
                    JAN: {item.JAN || "—"}
                  </small>
                </li>
              ))}
              {list.length === 0 && (
                <li style={{ color: "#666" }}>
                  該当する商品が見つかりませんでした。
                </li>
              )}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
