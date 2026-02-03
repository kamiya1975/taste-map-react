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
    <div style={{ padding: 18, textAlign: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          width: "100%",
        }}
      >
        {/* ① 固定文言（中央寄せ） */}
        <div style={{ fontSize: 14, color: "#444", marginTop: 12 }}>
          ただいまの、あなたの好みは
        </div>

        {/* ② 小さめの丸（背面中央）＋クラスタ名（前面・横幅は他文言と同じ） */}
        <div
          style={{
            marginTop: 22,
           marginBottom: 18,
            position: "relative",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 110,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: rgbaToCss(color),
              opacity: 0.85,
              boxShadow: "0 0 0 2px rgba(0,0,0,0.04)",
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              fontSize: 20,
              fontWeight: 800,
              color: "#111",
              lineHeight: 1.2,
              padding: "6px 10px",
              width: "100%",
            }}
          >
            「{name}」
          </div>
        </div>

        {/* ③ ヒント解説（中央寄せ） */}
        {hint ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              color: "#333",
              lineHeight: 1.6,
              maxWidth: 420,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {hint}
          </div>
        ) : (
          <div style={{ marginTop: 14, fontSize: 13, color: "#666" }}>—</div>
        )}

        {/* ④ 固定文言（中央寄せ） */}
        <div
          style={{
            marginTop: 30,
            fontSize: 12,
            color: "#666",
            lineHeight: 1.5,
          }}
        >
          ※マップの打点にタッチすると商品詳細が表示されます。
        </div>

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
