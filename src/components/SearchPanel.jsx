// src/components/SearchPanel.jsx
import React, { useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";
import { makeIndexed, searchItems, normalizeJP } from "../utils/search";
import { drawerModalProps, paperBaseStyle, DRAWER_HEIGHT } from "../ui/constants";

export default function SearchPanel({
  open, onClose,
  data = [],
  onPick,         // (item) => void  選択時
  onScanClick     // () => void      バーコードボタン押下
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const indexed = useMemo(() => makeIndexed(data), [data]);
  const results = useMemo(() => searchItems(indexed, q, 50), [indexed, q]);

  const pick = (i) => {
    const it = results[i];
    if (it) onPick?.(it);
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      ModalProps={drawerModalProps}
      PaperProps={{ style: paperBaseStyle }}
    >
      {/* ヘッダ：左は空き、右に「閉じる」。見出し「検索」はカット */}
      <div
        style={{
          height: "48px",
          padding: "8px 12px",
          borderBottom: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          background: "#f9f9f9",
          gap: 8,
        }}
      >
        <div style={{ flex: 1 }} />{/* 左側スペーサー（空き） */}
        <button
          onClick={onClose}
          style={{
            background:"#eee",
            border:"1px solid #ccc",
            padding:"6px 10px",
            borderRadius:4
          }}
        >
          閉じる
        </button>
      </div>

      {/* 入力行（デザインは現状のまま、右端“内側”にスキャンボタン内包） */}
      <div style={{ padding: 12 }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            border:"1px solid #ccc",
            borderRadius:8,
            padding:"8px 10px",
            background:"#fff",
          }}
        >
          <input
            value={q}
            onChange={(e)=>{ setQ(e.target.value); setActive(0); }}
            onKeyDown={(e)=>{ if (e.key === "Enter") pick(0); }}
            placeholder="キーワード"
            style={{
              border:"none",
              outline:"none",
              width:"100%",
              fontSize:16,
              paddingRight: 52,      // 右端内包ボタンぶんの余白
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
            {/* 軽量なバーコード風アイコン */}
            <div style={{ display: "flex", gap: 2, height: 16, alignItems: "stretch" }}>
              {[3,1,2,1,2,1].map((w, i) => (
                <span key={i} style={{ width: w, background: "#444", borderRadius: 1 }} />
              ))}
            </div>
          </button>
        </div>
      </div>

      {/* リスト（高さ計算は従来どおり） */}
      <div
        style={{
          height: `calc(${DRAWER_HEIGHT} - 48px - 68px)`,
          overflowY: "auto",
          padding: "0 12px 12px",
        }}
      >
        {normalizeJP(q) && results.length === 0 && (
          <div style={{ color:"#666", padding:"8px 4px" }}>該当する商品が見つかりません。</div>
        )}
        {results.map((it, idx)=>(
          <div
            key={it.JAN}
            onClick={()=>pick(idx)}
            onMouseEnter={()=>setActive(idx)}
            style={{
              padding:"10px 6px",
              borderBottom:"1px solid #f2f2f2",
              cursor:"pointer",
              background: idx===active ? "#f6f9ff" : "#fff",
              borderRadius:6
            }}
          >
            <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
              <div style={{ fontWeight:600, color:"#333" }}>{it.商品名 || "(名称不明)"}</div>
              <div style={{ color:"#666" }}>{it.JAN}</div>
            </div>
            <div style={{ fontSize:12, color:"#666", marginTop:2 }}>
              {it.Type ?? "-"} / {it.国 ?? ""} {it.産地 ?? ""} / {it.葡萄品種 ?? ""}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
