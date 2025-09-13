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
      <div style={{ height: "48px", padding: "8px 12px", borderBottom: "1px solid #eee",
        display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9f9f9" }}>
        <div style={{ fontWeight: 600 }}>検索</div>
        <button onClick={onClose} style={{ background:"#eee", border:"1px solid #ccc", padding:"6px 10px", borderRadius:4 }}>閉じる</button>
      </div>

      {/* 入力行 */}
      <div style={{ padding: 12, display:"flex", gap:8, alignItems:"center" }}>
        <div style={{ flex:1, border:"1px solid #ccc", borderRadius:8, padding:"8px 10px", display:"flex", alignItems:"center" }}>
          <input
            value={q}
            onChange={(e)=>{ setQ(e.target.value); setActive(0); }}
            placeholder="キーワード"
            style={{ border:"none", outline:"none", width:"100%", fontSize:16 }}
          />
        </div>
        <button
          onClick={onScanClick}
          title="バーコード読み取り"
          style={{ width:44, height:44, borderRadius:8, border:"1px solid #ccc", background:"#fff", fontSize:18 }}
        >▦</button>
      </div>

      {/* リスト */}
      <div style={{ height:`calc(${DRAWER_HEIGHT} - 48px - 68px)`, overflowY:"auto", padding:"0 12px 12px" }}>
        {normalizeJP(q) && results.length === 0 && (
          <div style={{ color:"#666", padding:"8px 4px" }}>該当する商品が見つかりません。</div>
        )}
        {results.map((it, idx)=>(
          <div
            key={it.JAN}
            onClick={()=>pick(idx)}
            onMouseEnter={()=>setActive(idx)}
            style={{
              padding:"10px 6px", borderBottom:"1px solid #f2f2f2", cursor:"pointer",
              background: idx===active ? "#f6f9ff" : "#fff", borderRadius:6
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
