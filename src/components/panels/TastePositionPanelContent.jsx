// src/components/panels/TastePositionPanelContent.jsx
// あなたの味覚位置パネル
// - 表示クラスタはMapPage側でuserPinのUMAP近傍の点をfindNearestWineWorld()で求め、その点のクラスターをclusterId として算出
// - =「ユーザーピン打点の近傍値商品のクラスター」そのものとなる
import React from "react";
import {
  CLUSTER_COLORS_FIXED,
  CLUSTER_META,
} from "../../ui/constants";

const rgbaToCss = (arr) => {
  if (!Array.isArray(arr)) return "rgba(200,200,200,1)";
  const [r, g, b, a = 255] = arr;
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
};

export default function TastePositionPanelContent({ userPin, clusterId }) {
  // clusterId が無い/不正な場合のフォールバック
  const cid = Number(clusterId);
  const hasCid = Number.isFinite(cid);

  const meta = hasCid ? CLUSTER_META?.find((m) => Number(m.id) === cid) : null;
  const name = meta?.name || "—";
  const hint = meta?.hint || "";
  const color = hasCid ? CLUSTER_COLORS_FIXED?.[cid] : null;

  return (
    <div style={{ padding: 18 }}>
      {/* ① 固定文言 */}
      <div style={{ fontSize: 14, color: "#444", marginTop: 6 }}>
        ただいまの、あなたの好みは
      </div>

      {/* ② クラスタ名 + 背景丸色 */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: rgbaToCss(color),
            boxShadow: "0 0 0 1px rgba(0,0,0,0.06)",
            opacity: 0.85,
            flex: "0 0 auto",
          }}
        />
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.2,
          }}
        >
          「{name}」
        </div>
      </div>

      {/* ③ ヒント解説 */}
      {hint ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "#333",
            lineHeight: 1.6,
          }}
        >
          {hint}
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
          —
        </div>
      )}

      {/* ④ 固定文言 */}
      <div style={{ marginTop: 14, fontSize: 12, color: "#666", lineHeight: 1.5 }}>
        ※マップの打点にタッチすると商品詳細が表示されます。
      </div>

      <div style={{ height: 8 }} />
    </div>
  );
}
