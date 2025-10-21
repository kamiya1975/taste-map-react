// src/utils/sliderMapping.js

// 数値化（失敗時は def ）
export const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

// 中央値
export const median = (arr) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// UMAP側のmin/maxとblendF（なければ中央値）を算出
export function computeMinMaxAndBlendF(rows, sweetKey = "UMAP2", bodyKey = "UMAP1") {
  const sweetValues = rows.map((d) => num(d[sweetKey]));
  const bodyValues  = rows.map((d) => num(d[bodyKey]));
  const minSweet = Math.min(...sweetValues);
  const maxSweet = Math.max(...sweetValues);
  const minBody  = Math.min(...bodyValues);
  const maxBody  = Math.max(...bodyValues);

  const foundBlend = rows.find((d) => String(d.JAN) === "blendF");
  const blendF = foundBlend
    ? { SweetAxis: num(foundBlend[sweetKey]), BodyAxis: num(foundBlend[bodyKey]) }
    : { SweetAxis: median(sweetValues), BodyAxis: median(bodyValues) };

  return { minSweet, maxSweet, minBody, maxBody, blendF, sweetKey, bodyKey };
}

// 0-100スライダー（中心50）→ 連続値（min～max）へ線形補間
export function interpFromSlider(slider, base, minVal, maxVal) {
  const v = Math.max(0, Math.min(100, Number(slider)));
  if (v <= 50) return base - ((50 - v) / 50) * (base - minVal);
  return base + ((v - 50) / 50) * (maxVal - base);
}

// MapPage と同等の kNN 回帰（PCA -> UMAP）
export function makePcaToUmap(data, K = 15) {
  const samples = (data || [])
    .filter(
      (d) =>
        Number.isFinite(d.PC1) &&
        Number.isFinite(d.PC2) &&
        Number.isFinite(d.umap_x) &&
        Number.isFinite(d.umap_y)
    )
    .map((d) => ({ pc1: d.PC1, pc2: d.PC2, x: d.umap_x, y: d.umap_y }));

  return (pc1, pc2) => {
    if (!Number.isFinite(pc1) || !Number.isFinite(pc2) || samples.length === 0)
      return [0, 0];

    const neigh = samples
      .map((s) => {
        const dx = pc1 - s.pc1;
        const dy = pc2 - s.pc2;
        return { s, d: Math.hypot(dx, dy) };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.min(K, samples.length));

    let sw = 0, sx = 0, sy = 0;
    const EPS = 1e-6;
    for (const { s, d } of neigh) {
      const w = 1 / (d + EPS);
      sw += w;
      sx += w * s.x;
      sy += w * s.y;
    }
    return sw > 0 ? [sx / sw, sy / sw] : [neigh[0].s.x, neigh[0].s.y];
  };
}
