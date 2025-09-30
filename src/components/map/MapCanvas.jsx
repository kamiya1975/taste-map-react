// src/components/map/MapCanvas.jsx
import React, { useMemo, useRef, useCallback, useEffect } from "react";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import { ScatterplotLayer, LineLayer, GridCellLayer, PathLayer, IconLayer, BitmapLayer } from "@deck.gl/layers";
import {
  ZOOM_LIMITS,
  GRID_CELL_SIZE, HEAT_ALPHA_MIN, HEAT_ALPHA_MAX, HEAT_GAMMA, HEAT_CLIP_PCT,
  HEAT_COLOR_LOW, HEAT_COLOR_HIGH,
  TYPE_COLOR_MAP, ORANGE,
} from "../../ui/constants";
const FAVORITE_RED = [178, 53, 103, 255];  // お気に入りの打点色（R178,G53,B103）

// --- 小ユーティリティ ---
const EPS = 1e-9;
const toIndex  = (v) => Math.floor((v + EPS) / GRID_CELL_SIZE);
const toCorner = (i) => i * GRID_CELL_SIZE;
const keyOf    = (ix, iy) => `${ix},${iy}`;

// 実際に見えているビューポートの px サイズ（Safari URLバーを除外）
function getEffectiveSizePx(sizePx) {
  let w = Math.max(1, sizePx?.width  || 1);
  let h = Math.max(1, sizePx?.height || 1);
  if (typeof window !== "undefined" && window.visualViewport) {
    const vvW = Math.floor(window.visualViewport.width  || 0);
    const vvH = Math.floor(window.visualViewport.height || 0);
    if (vvW > 0) w = vvW;
    if (vvH > 0) h = vvH;
  }
  return { width: w, height: h };
}

// 画面サイズ（px）とズームから世界座標での半幅・半高を計算（Orthographic）
function halfSizeWorld(zoom, sizePx) {
  const scale = Math.pow(2, Number(zoom) || 0);
  const { width: w, height: h } = getEffectiveSizePx(sizePx);
  return { halfW: w / (2 * scale), halfH: h / (2 * scale) };
}

// 可動域クランプ（余白スラックつき）
function clampViewState(nextVS, panBounds, sizePx) {
  const zoom = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, nextVS.zoom));
  const { halfW, halfH } = halfSizeWorld(zoom, sizePx);

  const xmin = panBounds?.xmin ?? -Infinity;
  const xmax = panBounds?.xmax ??  Infinity;
  const ymin = panBounds?.ymin ?? -Infinity;
  const ymax = panBounds?.ymax ??  Infinity;

  const worldW = xmax - xmin;
  const worldH = ymax - ymin;
  const centerX = (xmin + xmax) / 2;
  const centerY = (ymin + ymax) / 2;

  const slackX = Math.max(0, 2 * halfW - worldW);
  const slackY = Math.max(0, 2 * halfH - worldH);

  const SLACK_FACTOR_X = 0.9;
  const SLACK_FACTOR_Y = 15.0;   // iOS対策でやや広め
  const MAX_SLACK_RATIO_X = 0.6;
  const MAX_SLACK_RATIO_Y = 0.9;

  // X 範囲
  let minX, maxX;
  if (worldW >= 2 * halfW) {
    minX = xmin + halfW;
    maxX = xmax - halfW;
  } else {
    let sx = slackX * SLACK_FACTOR_X;
    if (Number.isFinite(worldW)) sx = Math.min(sx, worldW * MAX_SLACK_RATIO_X);
    minX = centerX - sx / 2;
    maxX = centerX + sx / 2;
  }

  // Y 範囲
  let minY, maxY;
  if (worldH >= 2 * halfH) {
    const r = Math.max(0, Math.min(1, (2 * halfH) / (worldH || 1)));
    const OVERPAN_MIN = 0.05;
    const OVERPAN_MAX = 0.35;
    const k = OVERPAN_MIN + (OVERPAN_MAX - OVERPAN_MIN) * r;
    const overY = halfH * k;
    minY = ymin + halfH - overY;
    maxY = ymax - halfH + overY;
  } else {
    let sy = slackY * SLACK_FACTOR_Y;
    if (Number.isFinite(worldH)) sy = Math.min(sy, worldH * MAX_SLACK_RATIO_Y);
    minY = centerY - sy / 2;
    maxY = centerY + sy / 2;
  }

  const EPS_EDGE = 1e-6; // 端の張り付き感を緩和
  const x = Math.max(minX + EPS_EDGE, Math.min(maxX - EPS_EDGE, nextVS.target[0]));
  const y = Math.max(minY + EPS_EDGE, Math.min(maxY - EPS_EDGE, nextVS.target[1]));

  return { ...nextVS, zoom, target: [x, y, 0] };
}

export default function MapCanvas({
  data,
  userRatings,
  selectedJAN,
  favorites,
  highlight2D,
  userPin,           // [xUMAP, yUMAP] or null
  compassPoint,      // [xUMAP, yUMAP] or null
  panBounds,
  viewState,
  setViewState,
  onPickWine,        // (item) => void
}) {
  // --- refs（Hooksはコンポーネント内に置く） ---
  const sizeRef = useRef({ width: 1, height: 1 });
  const interactingRef = useRef(false);
  const clampRAF = useRef(0);

  const clampZoomOnly = (vs) => ({
    ...vs,
    zoom: Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, vs.zoom)),
  });

  // Safari 初期レイアウトの高さブレ対策：初回1フレーム遅延で再クランプ
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
    });
    return () => cancelAnimationFrame(raf);
  }, [panBounds, setViewState]);

  // visualViewport（URLバー出入り）：操作中は無視、操作後にデバウンスしてクランプ
  useEffect(() => {
    if (!window.visualViewport) return;
    let timeoutId = 0;
    let animationId = 0;

    const onVV = () => {
      if (interactingRef.current) return;
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        const vv = window.visualViewport;
        sizeRef.current = {
          width:  Math.floor(vv?.width  || sizeRef.current.width),
          height: Math.floor(vv?.height || sizeRef.current.height),
        };
        cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(() => {
          setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
        });
      }, 80); // ちょい長めデバウンス
    };

    window.visualViewport.addEventListener("resize", onVV, { passive: true });
    window.visualViewport.addEventListener("scroll", onVV, { passive: true });

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(animationId);
      window.visualViewport.removeEventListener("resize", onVV);
      window.visualViewport.removeEventListener("scroll", onVV);
    };
  }, [panBounds, setViewState]);

  // bfcache 復帰 / 画面の向き変更でも再クランプ
  useEffect(() => {
    const onPageShow = () => setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
    const onOrientation = () => setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, [panBounds, setViewState]);

  // --- グリッド線データ ---
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

  // --- セル集計（評価フラグ） ---
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

  // --- ハイライト（平均値のヒート） ---
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

  // --- レイヤ：打点 ---
  const mainLayer = useMemo(() => new ScatterplotLayer({
    id: "scatter",
    data,
    getPosition: (d) => [d.UMAP1, -d.UMAP2, 0],
    getFillColor: (d) => {
      const jan = String(d.JAN);
      if (jan === String(selectedJAN)) return ORANGE;                 // 選択中は従来どおりオレンジ最優先
      if (favorites && favorites[jan]) return FAVORITE_RED;           // お気に入りは赤
      return (TYPE_COLOR_MAP[d.Type] || TYPE_COLOR_MAP.Other);        // それ以外はタイプ色
    },
    // favorites の変化で色更新。オブジェクトを stringify してトリガーに
    updateTriggers: { getFillColor: [selectedJAN, JSON.stringify(favorites || {})] },
    radiusUnits: "meters",
    getRadius: 0.03,
    pickable: true,
  }), [data, selectedJAN]);

  // --- レイヤ：評価リング ---
  const ratingCircleLayers = useMemo(() => {
    const lineColor = [255, 0, 0, 255];
    return Object.entries(userRatings || {}).flatMap(([jan, ratingObj]) => {
      const item = data.find((d) => String(d.JAN) === String(jan));
      if (!item || !Number.isFinite(item.UMAP1) || !Number.isFinite(item.UMAP2)) return [];
      const count = Math.min(Number(ratingObj?.rating) || 0, 5);
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

  // --- レイヤ：嗜好コンパス/ユーザーピン ---
  const compassLayer = useMemo(() => {
    if (!compassPoint) return null;
    return new IconLayer({
      id: "preference-compass",
      data: [{ position: [compassPoint[0], -compassPoint[1], 0] }],
      getPosition: (d) => d.position,
      getIcon: () => ({
        url: `${process.env.PUBLIC_URL || ""}/img/compass.png`,
        width: 310, height: 310, anchorX: 155, anchorY: 155
      }),
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
      getIcon: () => ({
        url: `${process.env.PUBLIC_URL || ""}/img/compass.png`,
        width: 310, height: 310, anchorX: 155, anchorY: 155
      }),
      sizeUnits: "meters",
      getSize: 0.5,
      billboard: true,
      pickable: false,
      parameters: { depthTest: false },
    });
  }, [userPin]);

  // --- 近傍探索（クリック時） ---
  const findNearestWine = useCallback((coord) => {
    if (!coord || !Array.isArray(data) || data.length === 0) return null;
    const [cx, cy] = coord;
    let best = null, bestD2 = Infinity;
    for (const d of data) {
      const x = d.UMAP1, y = -d.UMAP2;
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = d; }
    }
    return best;
  }, [data]);

  // --- 操作終了時に“最後に1回だけ”クランプ ---
  const onInteractionStateChange = useCallback((state) => {
    interactingRef.current =
      !!state?.isDragging || !!state?.isPanning || !!state?.isZooming;
    if (!interactingRef.current) {
      cancelAnimationFrame(clampRAF.current);
      clampRAF.current = requestAnimationFrame(() => {
        setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
      });
    }
  }, [panBounds, setViewState]);

  return (
    <DeckGL
      views={new OrthographicView({ near: -1, far: 1 })}
      viewState={viewState}
      style={{ position: "absolute", inset: 0 }}
      useDevicePixels
      // キャンバスサイズを保持（クランプ計算に使用）
      onResize={({ width, height }) => {
        sizeRef.current = getEffectiveSizePx({ width, height });
        if (interactingRef.current) return; // 操作中はここでクランプしない
        setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
      }}
      // ユーザー操作中はズームだけクランプ、終了したら最終クランプ
      onViewStateChange={({ viewState: vs, interactionState }) => {
        const isInteracting =
          !!interactionState?.isDragging ||
          !!interactionState?.isPanning ||
          !!interactionState?.isZooming;
        interactingRef.current = isInteracting;
        if (isInteracting) {
          setViewState(clampZoomOnly(vs));
        } else {
          setViewState(clampViewState(vs, panBounds, sizeRef.current));
        }
      }}
      onInteractionStateChange={onInteractionStateChange}
      controller={{
        dragPan: true,
        dragRotate: false,
        minZoom: ZOOM_LIMITS.min,
        maxZoom: ZOOM_LIMITS.max,
        inertia: false,
        doubleClickZoom: false, // 誤タップのズームジャンプ抑止
        touchZoom: true,
        scrollZoom: true,
      }}
      onClick={(info) => {
        const picked = info?.object;
        if (picked?.JAN) { onPickWine?.(picked); return; }
        const coord = info?.coordinate;
        const nearest = findNearestWine(coord);
        if (nearest?.JAN) onPickWine?.(nearest);
      }}
      pickingRadius={8}
      layers={[
        // ★ 一番下：紙テクスチャ（UMAP空間に敷く）
        new BitmapLayer({
          id: "paper-bg",
          image: `${process.env.PUBLIC_URL || ""}/img/paper-bg.png`,
          // UMAPの可動域に広げて敷く（panBoundsに追随）
          bounds: [panBounds.xmin, panBounds.ymin, panBounds.xmax, panBounds.ymax],
          opacity: 1,
          parameters: { depthTest: false },
        }),
        // 評価リング（常に最前面に来るよう depthTest: false）
        ...ratingCircleLayers,
        // グリッド or ヒート
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
          : new GridCellLayer({
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
            }),
        // グリッド線
        new LineLayer({
          id: "grid-lines-thin",
          data: thinLines,
          getSourcePosition: d => d.sourcePosition,
          getTargetPosition: d => d.targetPosition,
          getColor: [200, 200, 200, 100],
          getWidth: 1,
          widthUnits: "pixels",
        }),
        new LineLayer({
          id: "grid-lines-thick",
          data: thickLines,
          getSourcePosition: d => d.sourcePosition,
          getTargetPosition: d => d.targetPosition,
          getColor: [180, 180, 180, 120],
          getWidth: 1.25,
          widthUnits: "pixels",
        }),
        // ピン/コンパス
        userPinCompassLayer,
        compassLayer,
        // 打点
        mainLayer,
      ]}
    />
  );
}
