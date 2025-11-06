// src/components/panels/ClusterPalettePanel.jsx
import React, { useMemo, useState } from "react";
import PanelShell from "./PanelShell";
import {
  CLUSTER_COLORS_FIXED,
  CLUSTER_DRAWER_HEIGHT, // 例: "calc(56svh - env(safe-area-inset-bottom))"
} from "../../ui/constants";

const COLLAPSED_HEIGHT = "calc(10svh - env(safe-area-inset-bottom))";

const rgbaToCss = (arr) => {
  if (!Array.isArray(arr)) return "rgba(200,200,200,1)";
  const [r, g, b, a = 255] = arr;
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
};

const truncate = (s, n) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

// デフォルトのクラスター名と “買う目安” 解説（適宜書き換えてください）
const CLUSTER_META_DEFAULT = [
  { id: 1,  name: "軽快フルーティ",   hint: "果実感中心。冷やして手軽に" },
  { id: 2,  name: "柑橘爽快",         hint: "酸スッキリ。普段の食卓に" },
  { id: 3,  name: "白旨コク",         hint: "樽の甘香。週末のご褒美に" },
  { id: 4,  name: "ミネラル辛口",     hint: "キレの辛口。刺身や寿司に" },
  { id: 5,  name: "軽赤チャーミー",   hint: "軽やか赤。和食と好相性" },
  { id: 6,  name: "スパイス中庸",     hint: "程よい渋み。日常飲みに良" },
  { id: 7,  name: "黒果実リッチ",     hint: "濃厚果実。肉料理の日に" },
  { id: 8,  name: "樽香フルボディ",   hint: "樽しっかり。特別な一皿に" },
  { id: 9,  name: "熟成まろやか",     hint: "丸い口当たり。ゆったり" },
  { id: 10, name: "旨辛スパークリン", hint: "泡しっかり。集まりに最適" },
];

export default function ClusterPalettePanel({
  isOpen,
  onClose,
  height = CLUSTER_DRAWER_HEIGHT,
  clusterMeta = CLUSTER_META_DEFAULT, // ← 外から差し替え可
  maxNameLen = 10,                     // 表示上の安全長
  maxHintLen = 30,
}) {
  const [collapsed, setCollapsed] = useState(false);

  React.useEffect(() => {
    if (!isOpen) setCollapsed(false);
  }, [isOpen]);

  // クラスター数は 10 固定（1..10）
  const entries = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => {
      const id = i + 1;
      const meta = clusterMeta.find((m) => m.id === id) || { name: `Cluster_${id}`, hint: "" };
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
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(180px,1fr))",
              gap: 10,
            }}
          >
            {entries.map(({ id, color, name, hint }) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid #e5e5d6",
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: "#fff",
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
