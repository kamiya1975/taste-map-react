// src/SliderPage.js
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useTasteData from "./hooks/useTasteData";
import {
  computeMinMaxAndBlendF,
  interpFromSlider,
  makePcaToUmap,
} from "./utils/sliderMapping";

/** 中央から色が伸びるグラデーション */
const centerGradient = (val) => {
  const base = "#e9e9e9";
  const active = "#b59678"; // お好みで
  const v = Math.max(0, Math.min(100, Number(val)));
  if (v === 50) return base;
  const a = Math.min(50, v);
  const b = Math.max(50, v);
  return `linear-gradient(to right, ${base} 0%, ${base} ${a}%, ${active} ${a}%, ${active} ${b}%, ${base} ${b}%, ${base} 100%)`;
};

export default function SliderPage() {
  const navigate = useNavigate();
  const { rows, loading, error } = useTasteData();

  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);

  // UMAP 側の min/max と blendF（参考用）
  const umapInfo = useMemo(() => {
    if (!rows.length) return null;
    return computeMinMaxAndBlendF(rows, "UMAP2", "UMAP1");
  }, [rows]);

  // PCA→UMAP 近傍回帰（MapPageと同じ kNN ロジック）
  const pcaToUmap = useMemo(() => makePcaToUmap(rows, 15), [rows]);

  // スライダーを PCA 空間に当ててから UMAP へ写像
  const handleGenerate = () => {
    if (!rows.length || !pcaToUmap) return;

    // --- PCA の範囲計算 ---
    const pc1s = rows.map((d) => d.PC1).filter(Number.isFinite);
    const pc2s = rows.map((d) => d.PC2).filter(Number.isFinite);
    if (!pc1s.length || !pc2s.length) return;

    const minPC1 = Math.min(...pc1s);
    const maxPC1 = Math.max(...pc1s);
    const minPC2 = Math.min(...pc2s);
    const maxPC2 = Math.max(...pc2s);

    // --- 基準点（blendF があればそれ、無ければ中央値） ---
    const blendFRow = rows.find((d) => String(d.JAN) === "blendF");
    const basePC1 = Number.isFinite(blendFRow?.PC1)
      ? blendFRow.PC1
      : pc1s.sort((a, b) => a - b)[Math.floor(pc1s.length / 2)];
    const basePC2 = Number.isFinite(blendFRow?.PC2)
      ? blendFRow.PC2
      : pc2s.sort((a, b) => a - b)[Math.floor(pc2s.length / 2)];

    // --- スライダー（0-100, 中心50）→ PCA 座標へ補間 ---
    // コク = PC1, 甘み = PC2 とみなす
    const pc1Value = interpFromSlider(body, basePC1, minPC1, maxPC1);
    const pc2Value = interpFromSlider(sweetness, basePC2, minPC2, maxPC2);

    // --- PCA -> UMAP （戻りは [UMAP1, UMAP2]）---
    const [umapX, umapY] = pcaToUmap(pc1Value, pc2Value);

    // --- 保存（新形式 v2：UMAP 実座標をそのまま保持。MapPage 側で2D表示のみY反転）---
    localStorage.setItem(
      "userPinCoords",
      JSON.stringify({ coordsUMAP: [umapX, umapY], version: 2 })
    );

    // --- 地図で userPin を中心に寄せる ---
    navigate("/map", { state: { centerOnUserPin: true } });
  };

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 640,
        margin: "0 auto",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <h2 style={{ textAlign: "center", fontSize: 20, marginBottom: 18 }}>
        基準のワインを飲んだ印象は？
      </h2>

      {/* スライダー用 CSS（中央から色が伸びる） */}
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

      {/* 甘みスライダー */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            fontWeight: 700,
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
          className="taste-slider"
          style={{ "--range": centerGradient(sweetness) }}
        />
      </div>

      {/* コクスライダー */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            fontWeight: 700,
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
          className="taste-slider"
          style={{ "--range": centerGradient(body) }}
        />
      </div>

      {/* 状態表示（任意） */}
      {loading && (
        <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
          データ読込中…
        </div>
      )}
      {error && (
        <div style={{ color: "#c00", fontSize: 13, marginBottom: 10 }}>
          データ取得に失敗しました：{String(error?.message || error)}
        </div>
      )}

      {/* 生成ボタン */}
      <button
        onClick={handleGenerate}
        disabled={loading || !!error || !rows.length}
        style={{
          background: "#fff",
          color: "#007bff",
          padding: "12px 22px",
          fontSize: 16,
          fontWeight: "bold",
          border: "2px solid #007bff",
          borderRadius: 10,
          cursor: loading || !!error || !rows.length ? "not-allowed" : "pointer",
          display: "block",
          margin: "18px auto 0",
          opacity: loading || !!error || !rows.length ? 0.6 : 1,
        }}
      >
        あなたの好みからMAPを生成
      </button>

      {/* （参考）UMAP 範囲の表示：調整時のデバッグに便利 */}
      {umapInfo && (
        <div style={{ marginTop: 14, color: "#888", fontSize: 12 }}>
          <div>UMAP範囲（参考）：</div>
          <div>
            Body(UMAP1): {umapInfo.minBody.toFixed(2)} ～ {umapInfo.maxBody.toFixed(2)}
          </div>
          <div>
            Sweet(UMAP2): {umapInfo.minSweet.toFixed(2)} ～ {umapInfo.maxSweet.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
