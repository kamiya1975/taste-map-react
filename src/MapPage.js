import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';

function MapPage() {
  const [data, setData] = useState([]);
  const [slider_pc1, setSliderPc1] = useState(50);
  const [slider_pc2, setSliderPc2] = useState(50);
  const [userRatings, setUserRatings] = useState({});

  const ratingOptions = ["未評価", "★", "★★", "★★★", "★★★★", "★★★★★"];

  const handleRatingChange = (jan, rating) => {
    setUserRatings(prev => ({
      ...prev,
      [jan]: rating
    }));
  };

  // ✅ CSV読み込み
  useEffect(() => {
    fetch('/pca_result.csv')
      .then((response) => response.text())
      .then((csvText) => {
        const rows = csvText.trim().split('\n');
        const headers = rows[0].split(',');
        const dataRows = rows.slice(1).map((row) => {
          const values = row.split(',');
          const entry = {};
          headers.forEach((header, i) => {
            entry[header] = isNaN(values[i]) ? values[i] : parseFloat(values[i]);
          });
          return entry;
        });
        setData(dataRows);
      });
  }, []);

  const blendF = data.find((d) => d.JAN === 'blendF');

  const xValues = data.map((d) => d.BodyAxis);
  const yValues = data.map((d) => d.SweetAxis);

  const x_min = Math.min(...xValues);
  const x_max = Math.max(...xValues);
  const y_min = Math.min(...yValues);
  const y_max = Math.max(...yValues);

  const range_left_x = blendF ? blendF.BodyAxis - x_min : 0;
  const range_right_x = blendF ? x_max - blendF.BodyAxis : 0;
  const range_down_y = blendF ? blendF.SweetAxis - y_min : 0;
  const range_up_y = blendF ? y_max - blendF.SweetAxis : 0;

  const target = {
    x: blendF
      ? slider_pc1 <= 50
        ? blendF.BodyAxis - ((50 - slider_pc1) / 50) * range_left_x
        : blendF.BodyAxis + ((slider_pc1 - 50) / 50) * range_right_x
      : 0,
    y: blendF
      ? slider_pc2 <= 50
        ? blendF.SweetAxis - ((50 - slider_pc2) / 50) * range_down_y
        : blendF.SweetAxis + ((slider_pc2 - 50) / 50) * range_up_y
      : 0,
  };

  const distances = data
    .filter((d) => d.JAN !== 'blendF')
    .map((d) => {
      const dx = d.BodyAxis - target.x;
      const dy = d.SweetAxis - target.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return { ...d, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);

  const typeColor = {
    Spa: 'blue',
    White: 'gold',
    Red: 'red',
    Rose: 'pink',
  };

  const typeList = ['Spa', 'White', 'Red', 'Rose'];

  const top10List = distances.map((item, index) => {
    const jan = item.JAN;
    const currentRating = userRatings[jan] || 0;

    return (
      <div key={jan} style={{ borderBottom: '1px solid #ccc', padding: '10px 0' }}>
        <strong>{`${index + 1}️⃣`} {item['商品名']} ({item.Type}) {parseInt(item['希望小売価格']).toLocaleString()} 円</strong>

        <div style={{ display: 'flex', alignItems: 'center', marginTop: '5px' }}>
          <select
            value={currentRating}
            onChange={(e) => handleRatingChange(jan, parseInt(e.target.value))}
            style={{ marginRight: '10px' }}
          >
            {ratingOptions.map((label, idx) => (
              <option key={idx} value={idx}>{label}</option>
            ))}
          </select>

          <button
            onClick={() => console.log(`✅ ${jan} を ${ratingOptions[currentRating]} に設定しました！`)}
          >
            反映
          </button>
        </div>
      </div>
    );
  });

  return (
    <div>
      <h2>基準のワインを飲んだ印象は？</h2>

      <div style={{ marginBottom: '20px' }}>
        <label>
          甘さスライダー（pc2）:
          <input
            type="range"
            min="0"
            max="100"
            value={slider_pc2}
            onChange={(e) => setSliderPc2(Number(e.target.value))}
            style={{ width: '80%' }}
          />
          {slider_pc2}
        </label>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>
          ボディスライダー（pc1）:
          <input
            type="range"
            min="0"
            max="100"
            value={slider_pc1}
            onChange={(e) => setSliderPc1(Number(e.target.value))}
            style={{ width: '80%' }}
          />
          {slider_pc1}
        </label>
      </div>

      <Plot
        key={JSON.stringify(userRatings)}
        data={[
          // ✅ タイプ別
          ...typeList.map(type => ({
            x: data.filter((d) => d.Type === type).map((d) => d.BodyAxis),
            y: data.filter((d) => d.Type === type).map((d) => d.SweetAxis),
            text: data.filter((d) => d.Type === type).map((d) => d["商品名"]),
            mode: 'markers',
            type: 'scatter',
            marker: {
              size: 5,
              color: typeColor[type],
            },
            name: type,
          })),
          // ✅ Target 緑丸
          {
            x: [target.x],
            y: [target.y],
            mode: 'markers',
            type: 'scatter',
            marker: {
              size: 20,
              color: 'green',
              symbol: 'x',
            },
            name: 'Your Impression',
          },
          // ✅ TOP10 → 凡例消す！
          {
            x: distances.map((d) => d.BodyAxis),
            y: distances.map((d) => d.SweetAxis),
            text: distances.map((d, index) => `${index + 1}️⃣`),
            mode: 'markers+text',
            type: 'scatter',
            marker: {
              size: 10,
              color: 'black',
            },
            textposition: 'middle center',
            name: 'TOP10',
            showlegend: false,
          },
          // ✅ 評価バブル → 凡例消す！
          ...Object.entries(userRatings)
            .filter(([jan, rating]) => rating > 0)
            .map(([jan, rating]) => {
              const wine = data.find((d) => String(d.JAN).trim() === String(jan).trim());
              console.log("⭐️ DEBUG", jan, wine);

              if (!wine) return null;
              return {
                x: [wine.BodyAxis],
                y: [wine.SweetAxis],
                text: [`${wine["商品名"]} ⭐️${rating}`],
                mode: 'markers+text',
                type: 'scatter',
                marker: {
                  size: rating * 6 + 8,
                  color: 'orange',
                  opacity: 0.8,
                  line: { color: 'green', width: 1.5 },
                },
                textposition: 'bottom center',
                name: '評価バブル',
                showlegend: false,
              };
            })
            .filter(item => item !== null),
        ]}
        layout={{
          width: 600,
          height: 600,
          title: 'TasteMAP',
          xaxis: { title: 'BodyAxis' },
          yaxis: { title: 'SweetAxis' },
        }}
      />

      <h2>近いワイン TOP10（評価つき）</h2>
      {top10List}
    </div>
  );
}

export default MapPage;
