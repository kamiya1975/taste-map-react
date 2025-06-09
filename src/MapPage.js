// src/MapPage.js
import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';

function MapPage() {
  // ...（前半の state や CSV 読み込み、距離計算などは現状そのまま！）
  
  // ...（target や distances の計算もそのまま）

  // グラフ用 axis 範囲
  const x_range = blendF ? [
    blendF.BodyAxis - Math.max(range_left_x, range_right_x),
    blendF.BodyAxis + Math.max(range_left_x, range_right_x)
  ] : [x_min, x_max];

  const y_range = blendF ? [
    blendF.SweetAxis - Math.max(range_down_y, range_up_y),
    blendF.SweetAxis + Math.max(range_down_y, range_up_y)
  ] : [y_min, y_max];

  return (
    <div style={{ padding: '10px' }}>
      <h2>基準のワインを飲んだ印象は？</h2>

      {/* ✅ 甘さスライダー */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 'bold' }}>
          甘さスライダー（pc2）:
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={slider_pc2}
          onChange={(e) => setSliderPc2(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <span>0</span>
          <span>100</span>
        </div>
      </div>

      {/* ✅ ボディスライダー */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 'bold' }}>
          ボディスライダー（pc1）:
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={slider_pc1}
          onChange={(e) => setSliderPc1(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <span>0</span>
          <span>100</span>
        </div>
      </div>

      {/* ✅ MAP → 正方形構造 */}
      <div style={{
        width: '100%',
        maxWidth: '600px',
        margin: '0 auto',
        position: 'relative'
      }}>
        <div style={{
          paddingTop: '100%',  // 正方形
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0
          }}>
            <Plot
              key={JSON.stringify(userRatings)}
              data={[
                // ここは今までと同じ（typeList, target, TOP10, 評価バブルなど）
              ]}
              layout={{
                autosize: true,
                margin: { l: 20, r: 20, t: 30, b: 30 },
                dragmode: 'pan',
                xaxis: {
                  range: x_range,
                  showticklabels: false,
                  zeroline: false,
                  showgrid: true,
                  gridcolor: 'lightgray',
                  gridwidth: 1,
                  scaleanchor: 'y',
                  scaleratio: 1,
                  mirror: true,
                  linecolor: 'black',
                  linewidth: 2
                },
                yaxis: {
                  range: y_range,
                  showticklabels: false,
                  zeroline: false,
                  showgrid: true,
                  gridcolor: 'lightgray',
                  gridwidth: 1,
                  scaleanchor: 'x',
                  scaleratio: 1,
                  mirror: true,
                  linecolor: 'black',
                  linewidth: 2
                },
                legend: {
                  orientation: 'h',
                  x: 0.5,
                  y: -0.2,
                  xanchor: 'center',
                  yanchor: 'top'
                }
              }}
              config={{
                responsive: true,
                scrollZoom: true,
                displaylogo: false,
                modeBarButtonsToRemove: [
                  'zoom2d', 'pan2d', 'select2d', 'lasso2d',
                  'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d',
                  'toggleSpikelines'
                ]
              }}
            />
          </div>
        </div>
      </div>

      {/* ✅ TOP10 */}
      <h2>近いワイン TOP10（評価つき）</h2>
      {top10List}
    </div>
  );
}

export default MapPage;
