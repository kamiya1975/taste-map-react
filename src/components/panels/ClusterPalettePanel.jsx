// src/components/panels/ClusterPalettePanel.jsx
import React, { useMemo, useState } from "react";
import PanelShell from "./PanelShell";
import {
  CLUSTER_DRAWER_HEIGHT,
  CLUSTER_COLORS_FIXED,
  CLUSTER_META,         // 並び順をこの配列そのままにする
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
  onPickCluster = null,   // タップ時にクラスターIDを親へ通知
  clusterMeta = null,     // 未指定なら constants の CLUSTER_META を使う
  availableIds = null,    // 追加：表示対象を制限する（順序は維持）
  maxNameLen = 10,
  maxHintLen = 30,
}) {
  const [collapsed, setCollapsed] = useState(false);

  React.useEffect(() => {
    if (!isOpen) setCollapsed(false);
  }, [isOpen]);

  // ★ 並び順は「source（= CLUSTER_META等）の定義順」をそのまま使う
  const entries = useMemo(() => {
    const source = (clusterMeta ?? CLUSTER_META); // ここに希望順で定義しておく
    const allow = Array.isArray(availableIds) && availableIds.length > 0
      ? new Set(availableIds.map(Number))
      : null;

    return source
      .filter(m => (allow ? allow.has(Number(m.id)) : true))
      .map(m => {
        const id = Number(m.id);
        return {
          id,
          color: CLUSTER_COLORS_FIXED?.[id],
          name: truncate(m.name, maxNameLen),
          hint: truncate(m.hint, maxHintLen),
        };
      });
  }, [clusterMeta, availableIds, maxNameLen, maxHintLen]);

  return (
    <PanelShell
      isOpen={isOpen}
      onClose={onClose}
      title="味わいグループ"
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
            色はワインの味わいタイプを表しています。
            グループ名をタッチすると、その味わいが集まる場所にマップが移動します。
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                  cursor: onPickCluster ? "pointer" : "default",
                }}
                role="button"
                tabIndex={0}
                onClick={() => onPickCluster?.(id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onPickCluster?.(id); }}
              >
                <div
                  title={name || "クラスタ"}
                  aria-label={name || "クラスタ"}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.10))",
                    background: rgbaToCss(color),
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#222", fontWeight: 600, lineHeight: 1.2 }}>
                    {name || "クラスタ"}
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
            ※ 色分けと名称は、科学的な風味データをもとに分類したものです。
          </p>
        </div>
      ) : (
        <div style={{ padding: 12, color: "#666", fontSize: 12 }}>タップで展開します</div>
      )}
    </PanelShell>
  );
}
