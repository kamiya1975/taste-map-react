import React from 'react';
import Plot from 'react-plotly.js';

function MapPage() {
  return (
    <div>
      <h2>サンプルグラフ</h2>
      <Plot
        data={[
          {
            x: [1, 2, 3, 4, 5],
            y: [10, 15, 13, 17, 21],
            mode: 'markers',
            type: 'scatter',
            marker: { size: 12, color: 'blue' },
          },
        ]}
        layout={{
          width: 600,
          height: 400,
          title: 'Taste MAP（仮）',
          xaxis: { title: 'X軸（例）' },
          yaxis: { title: 'Y軸（例）' },
        }}
      />
    </div>
  );
}

export default MapPage;

