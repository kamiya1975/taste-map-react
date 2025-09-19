// src/SliderPage.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useTasteData from "./hooks/useTasteData";
import {
  computeMinMaxAndBlendF,
  interpFromSlider,
} from "./utils/sliderMapping";

export default function SliderPage() {
  const navigate = useNavigate();
  const { rows, loading, error } = useTasteData();

  // UMAP 軸の自動判定（基本は UMAP1/UMAP2）
  const axisInfo = useMemo(() => {
    if (!rows?.length) return null;
    // JSON 仕様：UMAP1 = Body（横）, UMAP2 = Sweet（縦）
    return computeMinMaxAndBlendF(rows, "UMAP2", "UMAP1");
  }, [rows]);

  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);

  // ローディング／エラー表示は簡易に
  if (loading) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>読み込み中…</div>
    );
  }
  if (error || !axisInfo) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", color: "crimson" }}>
        データ読み込みに失敗しました。
      </div>
    );
  }

  const { minSweet, maxSweet, minBody, maxBody, blendF } = axisInfo;

  const handleGenerate = () => {
    // スライダー（0-100）→ UMAP 連続値へ
    const sweetValue = interpFromSlider(
      sweetness,
      blendF.SweetAxis,
      minSweet,
      maxSweet
    );
    const bodyValue = interpFromSlider(
      body,
      blendF.BodyAxis,
      minBody,
      maxBody
    );

    // UMAP 実座標を保存（Yは反転しない）
    try {
      localStorage.setItem(
        "userPinCoords",
        JSON.stringify({ coordsUMAP: [bodyValue, sweetValue], version: 2 })
      );
    } catch {}

    // MapPage へ遷移してピンにセンタリング
    navigate("/map", { state: { centerOnUserPin: true } });
  };

  return (
    <div
      style={{
        padding: "24px",
        maxWidth: "600px",
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      <h2 style={{ textAlign: "center", fontSize: 20, marginBottom: 30 }}>
        基準のワインを飲んだ印象は？
      </h2>

      {/* 甘味スライダー */}
      <div style={{ marginBottom: 40 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            fontWeight: "bold",
            marginBottom: 6,
          }}
        >
          <span>← こんなに甘みは不要</span>
          <span>もっと甘みが欲しい →</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={sweetness}
          onChange={(e) => setSweetness(Number(e.target.value))}
          style={{
            width: "100%",
            appearance: "none",
            height: 8,
            borderRadius: 5,
            background: `linear-gradient(to right, #007bff ${sweetness}%, #ddd ${sweetness}%)`,
            outline: "none",
            marginTop: 8,
            WebkitAppearance: "none",
          }}
        />
      </div>

      {/* コクスライダー */}
      <div style={{ marginBottom: 40 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            fontWeight: "bold",
            marginBottom: 6,
          }}
        >
          <span>← もっと軽やかが良い</span>
          <span>濃厚なコクが欲しい →</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={body}
          onChange={(e) => setBody(Number(e.target.value))}
          style={{
            width: "100%",
            appearance: "none",
            height: 8,
            borderRadius: 5,
            background: `linear-gradient(to right, #007bff ${body}%, #ddd ${body}%)`,
            outline: "none",
            marginTop: 8,
            WebkitAppearance: "none",
          }}
        />
      </div>

      <button
        onClick={handleGenerate}
        style={{
          background: "#fff",
          color: "#007bff",
          padding: "14px 30px",
          fontSize: 16,
          fontWeight: "bold",
          border: "2px solid #007bff",
          borderRadius: 6,
          cursor: "pointer",
          display: "block",
          margin: "0 auto",
        }}
      >
        地図生成
      </button>
    </div>
  );
}
