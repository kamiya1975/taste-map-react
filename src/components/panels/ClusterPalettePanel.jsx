// src/components/panels/ClusterPalettePanel.jsx
import React, { useMemo, useState } from "react";
import PanelShell from "./PanelShell";
import {
  CLUSTER_DRAWER_HEIGHT,
  CLUSTER_COLORS_FIXED,
  CLUSTER_META,
  CLUSTER_COUNT,
  getClusterMeta,
} from "../../ui/constants";

const COLLAPSED_HEIGHT = "calc(10svh - env(safe-area-inset-bottom))";

const rgbaToCss = (arr) => {
  if (!Array.isArray(arr)) return "rgba(200,200,200,1)";
  const [r, g, b, a = 255] = arr;
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
};

const truncate = (s, n) => (!s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s);

export default function ClusterPalettePanel({
  isOpen,
  onClose,
  height = CLUSTER_DRAWER_HEIGHT,
  clusterMeta = null, // ← 集約：未指定なら constants の CLUSTER_META を使う
  maxNameLen = 10,
  maxHintLen = 30,
}) {
  const [collapsed, setCollapsed] = useState(false);

  React.useEffect(() => {
    if (!isOpen) setCollapsed(false);
  }, [isOpen]);

  const entries = useMemo(() => {
    const source = clusterMeta ?? CLUSTER_META; // props優先／未指定は定数
    return Array.from({ length: CLUSTER_COUNT }, (_, i) => {
      const id = i + 1;
      const meta = source.find((m) => m.id === id) || getClusterMeta(id);
      return {
        id,
        color: CLUSTER_COLORS_FIXED?.[id],
        name: truncate(meta.name, maxNameLen),
        hint: truncate(meta.hint, maxHintLen),
      };
    });
  }, [clusterMeta, maxNameLen, maxHintLen]);

  return (
    <PanelShell
      isOpen={isOpen}
      onClose={onClose}
      title="クラスタ配色ガイド"
      icon="palette.svg"
      height={collapsed ? COLLAPSED_HEIGHT : height}
      onHeaderClick={() => setCollapsed((v) => !v)}
      motionPreset="mui"
      animateHeight={true}
      heightDurationMs={225}
      zIndex={2000}
    >
      {!collapsed ? (
        <div style={{ padding: 12 }}>
          <p style={{ margin: "4px 0 12px", color: "#444", fontSize: 13 }}>
            マップのクラスタ配色は管理者が固定しています。ボタンでONにするとこの配色で点が色分けされます。
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {entries.map(({ id, color, name, hint }) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  border: "1px solid #e5e5d6",
                  borderRadius: 10,
                  background: "#fff",
                  width: "100%",
                }}
              >
                <div
                  title={`Cluster ${id}`}
                  aria-label={`Cluster ${id}`}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: "1px solid #c9c9b0",
                    background: rgbaToCss(color),
                    flex: "0 0 28px",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#222", fontWeight: 600, lineHeight: 1.2 }}>
                    {id}. {name || `Cluster_${id}`}
                  </div>
                  {hint ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#555",
                        lineHeight: 1.3,
                        marginTop: 2,
                        wordBreak: "keep-all",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                      title={hint}
                    >
                      {hint}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <p style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
            ※ この配色とラベルは全ユーザー共通です（運用で更新可能）。
          </p>
        </div>
      ) : (
        <div style={{ padding: 12, color: "#666", fontSize: 12 }}>タップで展開します</div>
      )}
    </PanelShell>
  );
}
