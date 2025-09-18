// src/components/SearchPanel.jsx
import React, { useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";
import { makeIndexed, searchItems, normalizeJP } from "../utils/search";
import {
  drawerModalProps,
  paperBaseStyle,
  DRAWER_HEIGHT,
} from "../ui/constants";

export default function SearchPanel({
  open,
  onClose,
  data = [],
  onPick, // (item) => void
  onScanClick, // () => void
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const indexed = useMemo(() => makeIndexed(data), [data]);
  const results = useMemo(() => searchItems(indexed, q, 50), [indexed, q]);

  const pick = (i) => {
    const it = results[i];
    if (it) onPick?.(it);
  };

  // 検索結果をお気に入り風に整形（番号は検索内だけで 1,2,3…）
  const listed = useMemo(() => {
    return results.map((x, i) => ({
      ...x,
      addedAt: null, // 検索結果には日付がないので「日付不明」
      displayIndex: i + 1, // 検索結果内で単純に 1,2,3…
    }));
  }, [results]);

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      ModalProps={drawerModalProps}
      PaperProps={{ style: paperBaseStyle }}
    >
      {/* ヘッダ：検索枠と閉じる */}
      <div
        style={{
          height: "60px",
          padding: "8px 12px",
          borderBottom: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f9f9f9",
          gap: 8,
        }}
      >
        {/* 検索枠 */}
        <div
          style={{
            flex: 1,
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            background: "#fff",
            position: "relative",
          }}
        >
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") pick(0);
            }}
            placeholder="キーワード"
            style={{
              border: "none",
              outline: "none",
              width: "100%",
              fontSize: 16,
              paddingRight: 52,
              boxSizing: "border-box",
            }}
          />
          {/* 内包バーコードボタン */}
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
              height: 28,
              borderRadius: 8,
              border: "1px solid #d0d0d0",
              background: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 2,
                height: 16,
                alignItems: "stretch",
              }}
            >
              {[3, 1, 2, 1, 2, 1].map((w, i) => (
                <span
                  key={i}
                  style={{
                    width: w,
                    background: "#444",
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
          </button>
        </div>

        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          style={{
            background: "#eee",
            border: "1px solid #ccc",
            padding: "6px 10px",
            borderRadius: 4,
            whiteSpace: "nowrap",
          }}
        >
          閉じる
        </button>
      </div>

      {/* リスト：お気に入りと同じ形式 */}
      <div
        style={{
          height: `calc(${DRAWER_HEIGHT} - 60px)`,
          overflowY: "auto",
          padding: "12px 16px",
        }}
      >
        {normalizeJP(q) && listed.length === 0 && (
          <div style={{ color: "#666", padding: "8px 4px" }}>
            該当する商品が見つかりません。
          </div>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {listed.map((item, idx) => (
            <li
              key={`${item.JAN}-${idx}`}
              onClick={() => pick(idx)}
              onMouseEnter={() => setActive(idx)}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid #eee",
                cursor: "pointer",
                background: idx === active ? "#f6f9ff" : "#fff",
                borderRadius: 6,
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
              </small>
            </li>
          ))}
        </ul>
      </div>
    </Drawer>
  );
}
