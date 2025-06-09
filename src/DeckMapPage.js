// src/DeckMapPage.js
import React, { useState, useEffect } from 'react';
import MapGL from 'react-map-gl';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGVtb3VzZXIiLCJhIjoiY2txb3FjY2V2MG1iNzJ1bG94aWlscHEzOCJ9.YYcPoa0H1oB_zFexRXQqwA';

function DeckMapPage() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch('/pca_result.csv')
      .then(response => response.text())
      .then(csvText => {
        const rows = csvText.trim().split('\n');
        const headers = rows[0].split(',');
        const dataRows = rows.slice(1).map(row => {
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

  // 座標マッピング（BodyAxis → X、SweetAxis → Y）
  const layer = new ScatterplotLayer({
    id: 'wine-points',
    data,
    getPosition: d => [d.BodyAxis, d.SweetAxis],
    getRadius: 5,
    getFillColor: [255, 140, 0, 200],
    radiusUnits: 'pixels',
    pickable: true,
    opacity: 0.8,
    stroked: true,
    getLineWidth: 1,
    lineWidthUnits: 'pixels',
    getLineColor: [0, 0, 0, 255],
  });

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <MapGL
        initialViewState={{
          latitude: 0,
          longitude: 0,
          zoom: 3,
          bearing: 0,
          pitch: 0,
        }}
        mapStyle="mapbox://styles/mapbox/light-v10"  // ← 地図表示を使わない場合 → "empty" スタイルも可
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        <DeckGL
          layers={[layer]}
          getTooltip={({ object }) =>
            object ? `${object['商品名']} (${object.Type})` : null
          }
        />
      </MapGL>
    </div>
  );
}

export default DeckMapPage;
