// src/components/panels/ClusterPalettePanel.jsx
import React, { useMemo, useState } from "react";
import PanelShell from "./PanelShell";
import {
  CLUSTER_COLORS_FIXED,
  CLUSTER_DRAWER_HEIGHT,          // 例: "calc(56svh - env(safe-area-inset-bottom))"
} from "../../ui/constants";

const COLLAPSED_HEIGHT = "calc(10svh - env(safe-area-inset-bottom))"; // ★ 10%

const rgbaToCss = (arr) => {
  if (!Array.isArray(arr)) return "rgba(200,200,200,1)";
  const [r, g, b, a = 255] = arr;
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
};

export default function ClusterPalettePanel({
  isOpen,
  onClose,
  height = CLUSTER_DRAWER_HEIGHT,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const entries = useMemo(
    () => Array.from({ length: 20 }, (_, i) => {
      const id = i + 1;
      return { id, color: CLUSTER_COLORS_FIXED[id] };
    }),
    []
  );

  return (
    <PanelShell
      isOpen={isOpen}
      onClose={onClose}
      title="クラスタ配色ガイド"
      icon="palette.svg"
      height={collapsed ? COLLAPSED_HEIGHT : height}   // ★ 高さ切替
      onHeaderClick={() => setCollapsed(v => !v)}      // ★ 帯タップでトグル
      motionPreset="mui"
      animateHeight={true}
      heightDurationMs={225}
    >
      {/* 折りたたみ時は中身を簡略化するなら以下で条件分岐も可 */}
      {!collapsed ? (
        <div style={{ padding: 12 }}>
          <p style={{ margin: "4px 0 12px", color: "#444", fontSize: 13 }}>
            マップのクラスタ配色は管理者がコードで固定しています。ボタンでONにするとこの配色で点が色分けされます。
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
                    width: 28, height: 28,
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
            ※ この配色は全ユーザー共通です。
          </p>
        </div>
      ) : (
        <div style={{ padding: 12, color: "#666", fontSize: 12 }}>
          タップで展開します
        </div>
      )}
    </PanelShell>
  );
}
