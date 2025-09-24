import React, { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import { ScatterplotLayer, LineLayer, GridCellLayer, PathLayer, IconLayer } from "@deck.gl/layers";
import {
  ZOOM_LIMITS, INITIAL_ZOOM,
  GRID_CELL_SIZE, HEAT_ALPHA_MIN, HEAT_ALPHA_MAX, HEAT_GAMMA, HEAT_CLIP_PCT,
  HEAT_COLOR_LOW, HEAT_COLOR_HIGH,
  TYPE_COLOR_MAP, ORANGE,
} from "../../ui/constants"

// 小ユーティリティ
const EPS = 1e-9;
const toIndex  = (v) => Math.floor((v + EPS) / GRID_CELL_SIZE);
const toCorner = (i) => i * GRID_CELL_SIZE;
const keyOf    = (ix, iy) => `${ix},${iy}`;

export default function MapCanvas({
  data,
  userRatings,
  selectedJAN,
  highlight2D,
  userPin,           // [xUMAP, yUMAP] or null
  compassPoint,      // [xUMAP, yUMAP] or null
  panBounds,
  viewState,
  setViewState,
  onPickWine,        // (item) => void
}) {
  // グリッド線
  const { thinLines, thickLines } = useMemo(() => {
    const interval = GRID_CELL_SIZE;
    const thin = [], thick = [];
    for (let i = -500; i <= 500; i++) {
      const x = i * interval;
      (i % 5 === 0 ? thick : thin).push({ sourcePosition: [x, -100, 0], targetPosition: [x, 100, 0] });
      const y = i * interval;
      (i % 5 === 0 ? thick : thin).push({ sourcePosition: [-100, y, 0], targetPosition: [100, y, 0] });
    }
    return { thinLines: thin, thickLines: thick };
  }, []);

  // セル集計（評価フラグ）
  const cells = useMemo(() => {
    const map = new Map();
    data.forEach((d) => {
      const ix = toIndex(d.UMAP1);
      const iy = toIndex(-d.UMAP2);
      const key = keyOf(ix, iy);
      if (!map.has(key)) {
        map.set(key, { ix, iy, position: [toCorner(ix), toCorner(iy)], count: 0, hasRating: false });
      }
      if ((userRatings[d.JAN]?.rating ?? 0) > 0) map.get(key).hasRating = true;
      map.get(key).count += 1;
    });
    return Array.from(map.values());
  }, [data, userRatings]);

  // ハイライト（平均値のヒート）
  const { heatCells, vMin, vMax, avgHash } = useMemo(() => {
    if (!highlight2D) return { heatCells: [], vMin: 0, vMax: 1, avgHash: "empty" };
    const sumMap = new Map(), cntMap = new Map();
    for (const d of data) {
      const v = Number(d[highlight2D]);
      if (!Number.isFinite(v)) continue;
      const ix = toIndex(d.UMAP1), iy = toIndex(-d.UMAP2);
      const key = keyOf(ix, iy);
      sumMap.set(key, (sumMap.get(key) || 0) + v);
      cntMap.set(key, (cntMap.get(key) || 0) + 1);
    }
    const vals = [], cellsArr = [];
    for (const [key, sum] of sumMap.entries()) {
      const count = cntMap.get(key) || 1;
      const avg = sum / count;
      vals.push(avg);
      const [ix, iy] = key.split(",").map(Number);
      cellsArr.push({ ix, iy, position: [toCorner(ix), toCorner(iy)], avg, count });
    }
    if (!vals.length) return { heatCells: [], vMin: 0, vMax: 1, avgHash: "none" };
    vals.sort((a, b) => a - b);
    const loIdx = Math.floor(HEAT_CLIP_PCT[0] * (vals.length - 1));
    const hiIdx = Math.floor(HEAT_CLIP_PCT[1] * (vals.length - 1));
    const lo = vals[loIdx], hi = vals[hiIdx];
    const epsHi = hi - lo < 1e-9 ? lo + 1e-9 : hi;
    const hash = `${cellsArr.length}|${lo.toFixed(3)}|${epsHi.toFixed(3)}|${highlight2D}`;
    return { heatCells: cellsArr, vMin: lo, vMax: epsHi, avgHash: hash };
  }, [data, highlight2D]);

  // レイヤ：打点
  const mainLayer = useMemo(() => new ScatterplotLayer({
    id: "scatter",
    data,
    getPosition: (d) => [d.UMAP1, -d.UMAP2, 0],
    getFillColor: (d) => String(d.JAN) === String(selectedJAN)
      ? ORANGE
      : (TYPE_COLOR_MAP[d.Type] || TYPE_COLOR_MAP.Other),
    updateTriggers: { getFillColor: [selectedJAN] },
    radiusUnits: "meters",
    getRadius: 0.03,
    pickable: true,
    onClick: null,
  }), [data, selectedJAN]);

  // レイヤ：評価リング
  const ratingCircleLayers = useMemo(() => {
    const lineColor = [255, 0, 0, 255];
    return Object.entries(userRatings).flatMap(([jan, ratingObj]) => {
      const item = data.find((d) => String(d.JAN) === String(jan));
      if (!item || !Number.isFinite(item.UMAP1) || !Number.isFinite(item.UMAP2)) return [];
      const count = Math.min(Number(ratingObj.rating) || 0, 5);
      if (count <= 0) return [];
      const radiusBase = 0.06;
      return Array.from({ length: count }).map((_, i) => {
        const steps = 40;
        const path = Array.from({ length: steps }, (_, j) => {
          const angle = (j / steps) * 2 * Math.PI;
          const radius = radiusBase * (i + 1);
          const x = item.UMAP1 + Math.cos(angle) * radius;
          const y = -item.UMAP2 + Math.sin(angle) * radius;
          return [x, y];
        });
        path.push(path[0]);
        return new PathLayer({
          id: `ring-${jan}-${i}`,
          data: [{ path }],
          getPath: (d) => d.path,
          getLineColor: () => lineColor,
          getWidth: 0.3,
          widthUnits: "pixels",
          parameters: { depthTest: false },
          pickable: false,
        });
      });
    });
  }, [data, userRatings]);

  // レイヤ：嗜好コンパス/ユーザーピン
  const compassLayer = useMemo(() => {
    if (!compassPoint) return null;
    return new IconLayer({
      id: "preference-compass",
      data: [{ position: [compassPoint[0], -compassPoint[1], 0] }],
      getPosition: (d) => d.position,
      getIcon: () => ({ url: `${process.env.PUBLIC_URL || ""}/img/compass.png`, width: 310, height: 310, anchorX: 155, anchorY: 155 }),
      sizeUnits: "meters",
      getSize: 0.4,
      billboard: true,
      pickable: false,
      parameters: { depthTest: false },
    });
  }, [compassPoint]);

  const userPinCompassLayer = useMemo(() => {
    if (!userPin) return null;
    return new IconLayer({
      id: "user-pin-compass",
      data: [{ position: [userPin[0], -userPin[1], 0] }],
      getPosition: (d) => d.position,
      getIcon: () => ({ url: `${process.env.PUBLIC_URL || ""}/img/compass.png`, width: 310, height: 310, anchorX: 155, anchorY: 155 }),
      sizeUnits: "meters",
      getSize: 0.5,
      billboard: true,
      pickable: false,
      parameters: { depthTest: false },
    });
  }, [userPin]);

  // 近傍探索（クリック時）
  const findNearestWine = React.useCallback((coord) => {
    if (!coord || !Array.isArray(data) || data.length === 0) return null;
    const [cx, cy] = coord;
    let best = null, bestD2 = Infinity;
    for (const d of data) {
      const x = d.UMAP1, y = -d.UMAP2;
      const dx = x - cx, dy = y - cy;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; best = d; }
    }
    return best;
  }, [data]);

  return (
    <DeckGL
      views={new OrthographicView({ near: -1, far: 1 })}
      viewState={viewState}
      style={{ position: "absolute", inset: 0 }}
      useDevicePixels
      onViewStateChange={({ viewState: vs }) => {
        const z = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, vs.zoom));
        const limitedTarget = [
          Math.max(panBounds.xmin, Math.min(panBounds.xmax, vs.target[0])),
          Math.max(panBounds.ymin, Math.min(panBounds.ymax, vs.target[1])),
          vs.target[2],
        ];
        setViewState({ ...vs, zoom: z, target: limitedTarget });
      }}
      controller={{ dragPan: true, dragRotate: false, minZoom: ZOOM_LIMITS.min, maxZoom: ZOOM_LIMITS.max, inertia: false }}
      onClick={(info) => {
        const picked = info?.object;
        if (picked?.JAN) { onPickWine?.(picked); return; }
        const coord = info?.coordinate;
        const nearest = findNearestWine(coord);
        if (nearest?.JAN) onPickWine?.(nearest);
      }}
      pickingRadius={8}
      layers={[
        ...ratingCircleLayers,
        !highlight2D
          ? new GridCellLayer({
              id: "grid-cells-base",
              data: cells,
              cellSize: GRID_CELL_SIZE,
              getPosition: (d) => d.position,
              getFillColor: (d) => d.hasRating ? [180, 100, 50, 150] : [200, 200, 200, 40],
              getElevation: 0,
              pickable: false,
            })
          : null,
        highlight2D
          ? new GridCellLayer({
              id: `grid-cells-heat-${highlight2D}`,
              data: heatCells,
              cellSize: GRID_CELL_SIZE,
              getPosition: (d) => d.position,
              getFillColor: (d) => {
                let t = (d.avg - vMin) / ((vMax - vMin) || 1e-9);
                if (!Number.isFinite(t)) t = 0;
                t = Math.max(0, Math.min(1, Math.pow(t, HEAT_GAMMA)));
                const r = Math.round(HEAT_COLOR_LOW[0] + (HEAT_COLOR_HIGH[0] - HEAT_COLOR_LOW[0]) * t);
                const g = Math.round(HEAT_COLOR_LOW[1] + (HEAT_COLOR_HIGH[1] - HEAT_COLOR_LOW[1]) * t);
                const b = Math.round(HEAT_COLOR_LOW[2] + (HEAT_COLOR_HIGH[2] - HEAT_COLOR_LOW[2]) * t);
                const a = Math.round(HEAT_ALPHA_MIN + (HEAT_ALPHA_MAX - HEAT_ALPHA_MIN) * t);
                return [r, g, b, a];
              },
              extruded: false,
              getElevation: 0,
              opacity: 1,
              parameters: { depthTest: false },
              pickable: false,
              updateTriggers: { getFillColor: [vMin, vMax, HEAT_GAMMA, avgHash] },
            })
          : null,
        new LineLayer({ id: "grid-lines-thin",  data: thinLines,  getSourcePosition: d=>d.sourcePosition, getTargetPosition: d=>d.targetPosition, getColor: [200,200,200,100], getWidth: 1,    widthUnits: "pixels" }),
        new LineLayer({ id: "grid-lines-thick", data: thickLines, getSourcePosition: d=>d.sourcePosition, getTargetPosition: d=>d.targetPosition, getColor: [180,180,180,120], getWidth: 1.25, widthUnits: "pixels" }),
        userPinCompassLayer,
        compassLayer,
        mainLayer,
      ]}
    />
  );
}
