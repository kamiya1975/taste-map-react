// src/components/panels/ClusterPalettePanel.jsx
import React from "react";
import PanelShell from "./PanelShell";
import { CLUSTER_COLORS_FIXED } from "../../ui/constants";

const rgbaToCss = (arr) => {
  if (!Array.isArray(arr)) return "rgba(200,200,200,1)";
  const [r,g,b,a=255] = arr;
  return `rgba(${r}, ${g}, ${b}, ${a/255})`;
};

export default function ClusterPalettePanel({ isOpen, onClose }) {
  // 固定配色の凡例を 1..20 で並べる
  const entries = Array.from({ length: 20 }, (_, i) => {
    const id = i + 1;
    return { id, color: CLUSTER_COLORS_FIXED[id] };
  });

  return (
    <PanelShell isOpen={isOpen} onClose={onClose} title="クラスタ配色（説明）" icon="hyouka.svg">
      <div style={{ padding: 12 }}>
        <p style={{ margin: "4px 0 12px", color: "#444", fontSize: 13 }}>
          マップのクラスタ配色は管理者がコードで固定しています。ボタンでONにするとこの配色で点が色分けされます。パネルを閉じても配色は維持され、もう一度ボタンを押すと配色がOFFになります。
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(160px,1fr))",
            gap: 10,
          }}
        >
          {entries.map(({ id, color }) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                title={`Cluster_${id}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: "1px solid #c9c9b0",
                  background: rgbaToCss(color),
                }}
              />
              <div style={{ fontSize: 13, color: "#333" }}>Cluster_{id}</div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
          ※ この配色は全ユーザー共通です（ユーザー設定はありません）。
        </p>
      </div>
    </PanelShell>
  );
}
