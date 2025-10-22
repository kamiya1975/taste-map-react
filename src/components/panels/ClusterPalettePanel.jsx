// src/components/panels/ClusterPalettePanel.jsx
import React from "react";
import PanelShell from "./PanelShell";
import { DRAWER_HEIGHT } from "../../ui/constants";

export default function ClusterPalettePanel({
  isOpen, onClose,
  clusterColorMode, setClusterColorMode,
  clusterList, clusterColors, setClusterColors,
  DEFAULT_PALETTE,
}) {
  return (
    <PanelShell isOpen={isOpen} onClose={onClose} title="クラスタ配色" icon="hyouka.svg">
      <div style={{ padding: 12 }}>
        <div style={{ display:"grid", gridTemplateColumns:"auto auto", rowGap:8, columnGap:12 }}>
          {clusterList.map((c)=>(
            <React.Fragment key={c}>
              <div style={{ lineHeight:"32px" }}>cluster {c}</div>
              <input
                type="color"
                value={clusterColors?.[c] || "#888888"}
                onChange={(e)=>setClusterColors(prev=>({ ...prev, [c]: e.target.value }))}
                style={{ width:32, height:32, border:"none", background:"transparent", padding:0 }}
              />
            </React.Fragment>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: 12 }}>
          <button
            onClick={()=>{
              const next = {};
              clusterList.forEach((c,i)=> next[c] = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]);
              setClusterColors(next);
            }}
            style={{ border:"1px solid #c9c9b0", borderRadius:6, padding:"6px 10px", background:"#fff" }}
          >
            デフォルトに戻す
          </button>
        </div>

        <p style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
           ※ 色は自動保存されます。配色のON/OFFは右側の丸アイコンで切り替えできます。
        </p>
      </div>
    </PanelShell>
  );
}
