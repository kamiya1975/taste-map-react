// src/components/panels/AboutTasteMapPanel.jsx
import React from "react";
import PanelShell from "./PanelShell";

export default function AboutTasteMapPanel({ isOpen, onClose }) {
  return (
    <PanelShell isOpen={isOpen} onClose={onClose} title="TasteMap（ワイン風味マップ）とは？" icon="map.svg">
      <div style={{ padding: 16, lineHeight: 1.6, color: "#333" }}>
        <p style={{ margin: "2px 0 14px" }}>
            この地図は、ワインの「色・香り・味」を科学的に数値化し、似ているもの同士が近くに並ぶよう配置した“ワイン風味の地図”です。
            近い点ほど風味が似ており、離れるほど個性が異なります。地図上のコンパスはあなたの嗜好位置を示します。
          </p>
          <div style={{ marginTop: 4, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>凡例</div>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>灰色の点：取扱いワインの位置</li>
              <li>赤の点：飲みたい（★）にしたワイン</li>
              <li>黒の点：飲んで評価（◎）済みのワイン</li>
              <li>コンパス：あなたの嗜好位置（飲んで評価から生成）</li>
            </ul>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>使い方</div>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>点をタップ：商品ページを表示</li>
              <li>ピンチで拡大縮小、ドラッグで移動</li>
              <li>右上 🔍：検索　／　右の ★・◎：飲みたい／飲んだ一覧</li>
            </ul>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Mapガイド（バブル表示）</div>
            <p style={{ margin: 0 }}>
              左上のMapガイドでは、風味やトレンドの“偏り”をバブルで可視化します。
              地図を眺めるだけで「どんな特徴がどこに集まっているか」「いまどの傾向が盛り上がっているか」を直感的に把握できます。
            </p>
          </div>
          <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
            ※ マス目は位置の目安です。座標軸そのものに意味はありません。
          </p>
      </div>
    </PanelShell>
  );
}
