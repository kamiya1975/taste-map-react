// src/SliderPage.js
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import { LineLayer, IconLayer } from "@deck.gl/layers";

// ====== 小ユーティリティ ======
const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const median = (arr) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;

// ====== ダミーMap（罫線）用パラメータ ======
const GRID_INTERVAL = 0.2;     // 罫線の間隔
const GRID_EXTENT = 100;       // 罫線の描画範囲（±100）
const VIEW_ZOOM = 6;           // 見やすい固定ズーム
const CENTER_Y_OFFSET = -3.5;  // 画面上で点を少し上に見せる時のオフセット量（MapPageと揃え）
const GRID_THIN_COL = [200, 200, 200, 100];
const GRID_THICK_COL = [180, 180, 180, 120];

// スライダーの中央グラデーション（見た目用）
const centerGradient = (val) => {
  const base = "#e9e9e9";
  const active = "#b59678";
  const v = Math.max(0, Math.min(100, Number(val)));
  if (v === 50) return base;
  const a = Math.min(50, v);
  const b = Math.max(50, v);
  return `linear-gradient(to right, ${base} 0%, ${base} ${a}%, ${active} ${a}%, ${active} ${b}%, ${base} ${b}%, ${base} 100%)`;
};

export default function SliderPage() {
  const navigate = useNavigate();

  // ====== 既存ロジック：データ読み込み（生成ボタンの保存座標用） ======
  const [minMax, setMinMax] = useState(null);
  const [blendF, setBlendF] = useState(null);

  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL || ""}/UMAP_PCA_coordinates.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) return;

        const hasSweetBody = "SweetAxis" in data[0] && "BodyAxis" in data[0];
        const sweetKey = hasSweetBody ? "SweetAxis" : "UMAP2"; // 仮: 甘味=Y
        const bodyKey  = hasSweetBody ? "BodyAxis"  : "UMAP1"; // 仮: コク=X

        const sweetValues = data.map((d) => num(d[sweetKey]));
        const bodyValues  = data.map((d) => num(d[bodyKey]));

        const minSweet = Math.min(...sweetValues);
        const maxSweet = Math.max(...sweetValues);
        const minBody  = Math.min(...bodyValues);
        const maxBody  = Math.max(...bodyValues);
        setMinMax({ minSweet, maxSweet, minBody, maxBody, sweetKey, bodyKey });

        const foundBlend = data.find((d) => String(d.JAN) === "blendF");
        if (foundBlend) {
          setBlendF({
            SweetAxis: num(foundBlend[sweetKey]),
            BodyAxis:  num(foundBlend[bodyKey]),
          });
        } else {
          setBlendF({
            SweetAxis: median(sweetValues),
            BodyAxis:  median(bodyValues),
          });
        }
      })
      .catch((e) => console.error("データ取得エラー:", e));
  }, []);

  // ====== スライダー値 ======
  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);

  // ====== ダミーMapの“背景移動”オフセット ======
  // ・甘味を右に動かす → 罫線は左に（= X 方向マイナス）
  // ・コクを右に動かす → 罫線は下に（= Y 方向プラス）
  // 見えやすいよう少し強めの係数にしています。好みに応じて調整可。
  const offsetX = useMemo(() => (50 - sweetness) * 0.6, [sweetness]);
  const offsetY = useMemo(() => (body - 50) * 0.6, [body]);

  // ====== DeckGL: ビューは固定（操作不可） ======
  const viewState = useMemo(
    () => ({
      target: [0, 0 - CENTER_Y_OFFSET, 0], // 中央固定（Yだけ少し上に見せる）
      zoom: VIEW_ZOOM,
      rotationX: 0,
      rotationOrbit: 0,
    }),
    []
  );

  // 罫線データ（固定生成）
  const { thinLines, thickLines } = useMemo(() => {
    const thin = [], thick = [];
    for (let i = -500; i <= 500; i++) {
      const x = i * GRID_INTERVAL;
      (i % 5 === 0 ? thick : thin).push({
        sourcePosition: [x, -GRID_EXTENT, 0],
        targetPosition: [x,  GRID_EXTENT, 0],
      });
      const y = i * GRID_INTERVAL;
      (i % 5 === 0 ? thick : thin).push({
        sourcePosition: [-GRID_EXTENT, y, 0],
        targetPosition: [ GRID_EXTENT, y, 0],
      });
    }
    return { thinLines: thin, thickLines: thick };
  }, []);

  // コンパス（中央固定）
  const compassLayer = useMemo(() => {
    return new IconLayer({
      id: "dummy-compass",
      data: [{ position: [0, 0, 0] }],
      getPosition: (d) => [d.position[0], d.position[1] - CENTER_Y_OFFSET, 0],
      getIcon: () => ({
        url: COMPASS_URL,
        width: 310,
        height: 310,
        anchorX: 155,
        anchorY: 155,
      }),
      sizeUnits: "meters",
      getSize: 0.5,
      billboard: true,
      pickable: false,
      parameters: { depthTest: false },
    });
  }, []);

  // ====== 生成ボタン：好みをUMAP座標として保存 → /map へ ======
  const handleGenerate = () => {
    if (!minMax || !blendF) return;

    const { minSweet, maxSweet, minBody, maxBody } = minMax;

    const sweetValue =
      sweetness <= 50
        ? blendF.SweetAxis - ((50 - sweetness) / 50) * (blendF.SweetAxis - minSweet)
        : blendF.SweetAxis + ((sweetness - 50) / 50) * (maxSweet - blendF.SweetAxis);

    const bodyValue =
      body <= 50
        ? blendF.BodyAxis - ((50 - body) / 50) * (blendF.BodyAxis - minBody)
        : blendF.BodyAxis + ((body - 50) / 50) * (maxBody - blendF.BodyAxis);

    // 新フォーマット（MapPageが読む）：UMAPの実値をそのまま保存
    localStorage.setItem(
      "userPinCoords",
      JSON.stringify({ coordsUMAP: [bodyValue, sweetValue], version: 2 })
    );

    navigate("/map", { state: { centerOnUserPin: true, autoOpenSlider: false } });
  };

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      {/* ===== ダミーMap（打点なし） ===== */}
      <div style={{ position: "relative", flex: "0 0 50vh", minHeight: 320 }}>
        <DeckGL
          views={new OrthographicView({ near: -1, far: 1 })}
          viewState={viewState}
          controller={false} // ← 操作させない
          style={{ position: "absolute", inset: 0 }}
          useDevicePixels
          layers={[
            new LineLayer({
              id: "dummy-grid-thin",
              data: thinLines,
              getSourcePosition: (d) => [d.sourcePosition[0] + offsetX, d.sourcePosition[1] + offsetY, 0],
              getTargetPosition: (d) => [d.targetPosition[0] + offsetX, d.targetPosition[1] + offsetY, 0],
              getColor: GRID_THIN_COL,
              getWidth: 1,
              widthUnits: "pixels",
              pickable: false,
              updateTriggers: {
                getSourcePosition: [offsetX, offsetY],
                getTargetPosition: [offsetX, offsetY],
              },
              // スライダーと連動してスムーズに
              transitions: {
                getSourcePosition: { duration: 260, easing: t => t * (2 - t) },
                getTargetPosition: { duration: 260, easing: t => t * (2 - t) },
              },
            }),
            new LineLayer({
              id: "dummy-grid-thick",
              data: thickLines,
              getSourcePosition: (d) => [d.sourcePosition[0] + offsetX, d.sourcePosition[1] + offsetY, 0],
              getTargetPosition: (d) => [d.targetPosition[0] + offsetX, d.targetPosition[1] + offsetY, 0],
              getColor: GRID_THICK_COL,
              getWidth: 1.25,
              widthUnits: "pixels",
              pickable: false,
              updateTriggers: {
                getSourcePosition: [offsetX, offsetY],
                getTargetPosition: [offsetX, offsetY],
              },
              transitions: {
                getSourcePosition: { duration: 260, easing: t => t * (2 - t) },
                getTargetPosition: { duration: 260, easing: t => t * (2 - t) },
              },
            }),
            compassLayer, // ← 中央固定のコンパス
          ]}
        />
      </div>

      {/* ===== スライダーUI ===== */}
      <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
        {/* スライダーCSS（●がバー中央） */}
        <style>{`
          .taste-slider{
            appearance: none;
            -webkit-appearance: none;
            width: 100%;
            height: 6px;
            background: transparent;
            margin-top: 8px;
            outline: none;
          }
          .taste-slider::-webkit-slider-runnable-track{
            height: 6px;
            border-radius: 9999px;
            background: var(--range, #e9e9e9);
          }
          .taste-slider::-moz-range-track{
            height: 6px;
            border-radius: 9999px;
            background: var(--range, #e9e9e9);
          }
          .taste-slider::-webkit-slider-thumb{
            -webkit-appearance: none;
            width: 28px; height: 28px; border-radius: 50%;
            background: #fff; border: 0;
            box-shadow: 0 2px 6px rgba(0,0,0,.25);
            margin-top: -11px;
            cursor: pointer;
          }
          .taste-slider::-moz-range-thumb{
            width: 28px; height: 28px; border-radius: 50%;
            background: #fff; border: 0;
            box-shadow: 0 2px 6px rgba(0,0,0,.25);
            cursor: pointer;
          }
        `}</style>

        <h3 style={{ margin: 0, marginBottom: 12 }}>嗜好スライダー</h3>

        {/* 甘み */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            <span>← こんなに甘みは不要</span>
            <span>もっと甘みが欲しい →</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={sweetness}
            onChange={(e) => setSweetness(Number(e.target.value))}
            className="taste-slider"
            style={{ width: "100%", "--range": centerGradient(sweetness) }}
          />
        </div>

        {/* コク */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            <span>← もっと軽やかが良い</span>
            <span>濃厚なコクが欲しい →</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={body}
            onChange={(e) => setBody(Number(e.target.value))}
            className="taste-slider"
            style={{ width: "100%", "--range": centerGradient(body) }}
          />
        </div>

        {/* 生成ボタン */}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={handleGenerate}
            style={{
              background: "#e8ddd1",
              color: "#000",
              padding: "14px 22px",
              fontSize: 16,
              fontWeight: 700,
              border: "2px solid #e8ddd1",
              borderRadius: 12,
              cursor: "pointer",
              display: "block",
              margin: "0 auto",
            }}
          >
            あなたの好みからMAPを生成
          </button>
        </div>
      </div>
    </div>
  );
}
