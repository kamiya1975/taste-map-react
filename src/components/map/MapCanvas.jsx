// src/components/map/MapCanvas.jsx
import React, { forwardRef, useMemo, useRef, useCallback, useEffect } from "react";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import {
  ScatterplotLayer,
  LineLayer,
  PathLayer,
  IconLayer,
  BitmapLayer,
} from "@deck.gl/layers";
import {
  ZOOM_LIMITS,
  GRID_CELL_SIZE,
  HEAT_ALPHA_MIN,
  HEAT_ALPHA_MAX,
  HEAT_GAMMA,
  HEAT_CLIP_PCT,
  HEAT_COLOR_LOW,
  HEAT_COLOR_HIGH,
  MAP_POINT_COLOR,
  ORANGE,
} from "../../ui/constants";

const BLACK = [0, 0, 0, 255];
const FAVORITE_RED = [178, 53, 103, 255];
const TILE_GRAY = `${process.env.PUBLIC_URL || ""}/img/gray-tile.png`;
const TILE_OCHRE = `${process.env.PUBLIC_URL || ""}/img/ochre-tile.png`;

const janOf = (d) => String(d?.jan_code ?? d?.JAN ?? "");
const xOf   = (d) => Number.isFinite(d?.umap_x) ? d.umap_x : d?.UMAP1;
const yOf   = (d) => Number.isFinite(d?.umap_y) ? d.umap_y : d?.UMAP2;

// クリック時に最近傍を許可する半径（px）
const CLICK_NEAR_PX = 24; // お好みで 14〜24 あたり

// ✅ パンのクランプ切替
const PAN_CLAMP = true;

// デフォルト余白（px）
const DEFAULT_EDGE_MARGIN_X_PX = 8;   // 横
const DEFAULT_EDGE_MARGIN_Y_PX = 20;  // 縦

/** px → world（Orthographic） */
function pxToWorld(zoom, px) {
  const scale = Math.pow(2, Number(zoom) || 0);
  return (px || 0) / (scale || 1);
}

// --- 小ユーティリティ ---
const EPS = 1e-9;
const toIndex = (v) => Math.floor((v + EPS) / GRID_CELL_SIZE);
const toCorner = (i) => i * GRID_CELL_SIZE;
const keyOf = (ix, iy) => `${ix},${iy}`;

// 実際に見えているビューポート px（Safari の URL バーを除外）
function getEffectiveSizePx(sizePx) {
  let w = Math.max(1, sizePx?.width || 1);
  let h = Math.max(1, sizePx?.height || 1);
  if (typeof window !== "undefined" && window.visualViewport) {
    const vvW = Math.floor(window.visualViewport.width || 0);
    const vvH = Math.floor(window.visualViewport.height || 0);
    if (vvW > 0) w = vvW;
    if (vvH > 0) h = vvH;
  }
  return { width: w, height: h };
}

// 画面サイズ（px）とズームから世界座標の半幅・半高
function halfSizeWorld(zoom, sizePx) {
  const scale = Math.pow(2, Number(zoom) || 0);
  const { width: w, height: h } = getEffectiveSizePx(sizePx);
  return { halfW: w / (2 * scale), halfH: h / (2 * scale) };
}

// ===== パン可動域クランプ（“ギリ見える”余白つき） =====
function clampViewState(nextVS, panBounds, sizePx, margins = {}) {
  const zoom = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, nextVS.zoom));
  if (!PAN_CLAMP) return { ...nextVS, zoom };

  const { halfW, halfH } = halfSizeWorld(zoom, sizePx);
  const xmin = panBounds?.xmin ?? -Infinity;
  const xmax = panBounds?.xmax ?? Infinity;
  const ymin = panBounds?.ymin ?? -Infinity;
  const ymax = panBounds?.ymax ?? Infinity;

  // 画面端に「X=edgeMarginXPx, Y=edgeMarginYPx」だけデータが残るように
  const pxX = margins.xPx ?? DEFAULT_EDGE_MARGIN_X_PX;
  const pxY = margins.yPx ?? DEFAULT_EDGE_MARGIN_Y_PX;
  const mX = pxToWorld(zoom, pxX);
  const mY = pxToWorld(zoom, pxY);

  const worldW = xmax - xmin;
  const worldH = ymax - ymin;

  let minX, maxX, minY, maxY;

  if (worldW >= 2 * halfW) {
    // ふつうに“ギリ見える”クランプ
    minX = xmin + halfW - mX;
    maxX = xmax - halfW + mX;
  } else {
    // 画面の方が横に広い → “仮想余白”で可動域を確保
    const cx = (xmin + xmax) / 2;
    const lackX = 2 * halfW - worldW; // どれだけ足りないか
    const slackX = lackX * 0.5 + mX;  // 左右に半分ずつ + マージン
    minX = cx - slackX;
    maxX = cx + slackX;
  }

  if (worldH >= 2 * halfH) {
    // ふつうに“ギリ見える”クランプ
    minY = ymin + halfH - mY;
    maxY = ymax - halfH + mY;
  } else {
    // 画面の方が高い → “仮想余白”を作って可動域を確保
    const cy = (ymin + ymax) / 2;
    const lack = 2 * halfH - worldH;             // どれだけ足りないか
    const slack = lack * 0.5 + mY;               // 上下に半分ずつ＋マージン
    minY = cy - slack;
    maxY = cy + slack;
  }

  const EPS_EDGE = 1e-6;
  const x = Math.max(minX + EPS_EDGE, Math.min(maxX - EPS_EDGE, nextVS.target[0]));
  const y = Math.max(minY + EPS_EDGE, Math.min(maxY - EPS_EDGE, nextVS.target[1]));
  return { ...nextVS, zoom, target: [x, y, 0] };
}

const MapCanvas = forwardRef(function MapCanvas(
  {
    data,
    userRatings,
    selectedJAN,
    favorites,
    highlight2D,
    userPin,
    compassPoint,
    panBounds,
    viewState,
    setViewState,
    onPickWine,
    edgeMarginXPx = 8,
    edgeMarginYPx = 20,
  },
  deckRef   // ★ ref を受け取る
) {
  // --- refs ---
  const sizeRef = useRef({ width: 1, height: 1 });
  const interactingRef = useRef(false);
  const clampRAF = useRef(0);

  const clampZoomOnly = (vs) => ({
    ...vs,
    zoom: Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, vs.zoom)),
  });

  // 背景ビットマップの敷き範囲（常に画面外まで）
  const bgBounds = useMemo(() => {
    const { halfW, halfH } = halfSizeWorld(viewState.zoom, sizeRef.current);
    const cx = viewState?.target?.[0] ?? 0;
    const cy = viewState?.target?.[1] ?? 0;
    const K = 8; // 余裕係数
    return [cx - K * halfW, cy - K * halfH, cx + K * halfW, cy + K * halfH];
  }, [viewState.zoom, viewState.target]);


  // --- 商品打点に付くバブル用データ（highlight2D=PC1/PC2/PC3 などの値→t[0..1]へ正規化） ---
  const pointBubbles = useMemo(() => {
    if (!highlight2D) return [];

    // 値分布（外れ値カットは従来ヒートと同じ HEAT_CLIP_PCT を踏襲）
    const vals = data
      .map(d => Number(d[highlight2D]))
      .filter(v => Number.isFinite(v));
    if (!vals.length) return [];

    vals.sort((a, b) => a - b);
    const loIdx = Math.floor(HEAT_CLIP_PCT[0] * (vals.length - 1));
    const hiIdx = Math.floor(HEAT_CLIP_PCT[1] * (vals.length - 1));
    const lo = vals[loIdx];
    const hi = vals[hiIdx];
    const vHi = hi - lo < 1e-9 ? lo + 1e-9 : hi;

    // 各商品点へ t と座標を付与
    return data
      .map(d => {
        const v = Number(d[highlight2D]);
        if (!Number.isFinite(v)) return null;
        let t = (v - lo) / ((vHi - lo) || 1e-9);
        t = Math.max(0, Math.min(1, Math.pow(t, HEAT_GAMMA))); // ガンマ補正
        return {
          jan: janOf(d),
          position: [xOf(d), -yOf(d), 0],
          t,
        };
      })
    .filter(Boolean);
  }, [data, highlight2D]);


  // 初期クランプ
  useEffect(() => {
    if (!PAN_CLAMP) return;
    const raf = requestAnimationFrame(() => {
      setViewState((curr) =>
        clampViewState(curr, panBounds, sizeRef.current, {
          xPx: edgeMarginXPx,
          yPx: edgeMarginYPx,
        })
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [panBounds, setViewState, edgeMarginXPx, edgeMarginYPx]);

  // visualViewport（URLバー出入り）
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
          width: Math.floor(vv?.width || sizeRef.current.width),
          height: Math.floor(vv?.height || sizeRef.current.height),
        };
        if (!PAN_CLAMP) return;
        cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(() => {
          setViewState((curr) =>
            clampViewState(curr, panBounds, sizeRef.current, {
              xPx: edgeMarginXPx,
              yPx: edgeMarginYPx,
            })
          );
        });
      }, 80);
    };

    window.visualViewport.addEventListener("resize", onVV, { passive: true });
    window.visualViewport.addEventListener("scroll", onVV, { passive: true });

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(animationId);
      window.visualViewport.removeEventListener("resize", onVV);
      window.visualViewport.removeEventListener("scroll", onVV);
    };
  }, [panBounds, setViewState, edgeMarginXPx, edgeMarginYPx]);

  // bfcache復帰 / 画面の向き変更
  useEffect(() => {
    if (!PAN_CLAMP) return;
    const refreshSize = () => {
      // visualViewport があれば優先して実画面サイズを取得
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      const width  = Math.floor(vv?.width  || window.innerWidth  || sizeRef.current.width  || 1);
      const height = Math.floor(vv?.height || window.innerHeight || sizeRef.current.height || 1);
      sizeRef.current = { width, height };
    };
    const onPageShow = () => {
      refreshSize();
      setViewState((curr) =>
        clampViewState(curr, panBounds, sizeRef.current, { xPx: edgeMarginXPx, yPx: edgeMarginYPx })
      );
    };
    const onOrientation = () => {
      refreshSize();
      setViewState((curr) =>
        clampViewState(curr, panBounds, sizeRef.current, { xPx: edgeMarginXPx, yPx: edgeMarginYPx })
      );
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, [panBounds, setViewState, edgeMarginXPx, edgeMarginYPx]);

  // --- グリッド線データ ---
  const { thinLines, thickLines } = useMemo(() => {
    const interval = GRID_CELL_SIZE;
    const thin = [];
    const thick = [];
    for (let i = -500; i <= 500; i++) {
      const x = i * interval;
      (i % 5 === 0 ? thick : thin).push({
        sourcePosition: [x, -100, 0],
        targetPosition: [x, 100, 0],
      });
      const y = i * interval;
      (i % 5 === 0 ? thick : thin).push({
        sourcePosition: [-100, y, 0],
        targetPosition: [100, y, 0],
      });
    }
    return { thinLines: thin, thickLines: thick };
  }, []);

  // --- セル集計（評価フラグ） ---
  const cells = useMemo(() => {
    const map = new Map();
    data.forEach((d) => {
      const ix = toIndex(xOf(d));
      const iy = toIndex(-yOf(d));
      const key = keyOf(ix, iy);
      if (!map.has(key)) {
        map.set(key, {
          ix,
          iy,
          position: [toCorner(ix), toCorner(iy)],
          center: [
            toCorner(ix) + GRID_CELL_SIZE / 2,
            toCorner(iy) + GRID_CELL_SIZE / 2,
            0,
          ],
          count: 0,
          hasRating: false,
        });
      }
      if ((userRatings[janOf(d)]?.rating ?? 0) > 0) 
      map.get(key).hasRating = true;
      map.get(key).count += 1;
    });
    return Array.from(map.values());
  }, [data, userRatings]);

  // --- ハイライト（平均値のヒート） ---
  const { heatCells, vMin, vMax, avgHash } = useMemo(() => {
    if (!highlight2D) return { heatCells: [], vMin: 0, vMax: 1, avgHash: "empty" };
    const sumMap = new Map(),
      cntMap = new Map();
    for (const d of data) {
      const v = Number(d[highlight2D]);
      if (!Number.isFinite(v)) continue;
      const ix = toIndex(xOf(d)),
        iy = toIndex(-yOf(d));
      const key = keyOf(ix, iy);
      sumMap.set(key, (sumMap.get(key) || 0) + v);
      cntMap.set(key, (cntMap.get(key) || 0) + 1);
    }
    const vals = [],
      cellsArr = [];
    for (const [key, sum] of sumMap.entries()) {
      const count = cntMap.get(key) || 1;
      const avg = sum / count;
      vals.push(avg);
      const [ix, iy] = key.split(",").map(Number);
      cellsArr.push({
        ix,
        iy,
        position: [toCorner(ix), toCorner(iy)],
        avg,
        count,
      });
    }
    if (!vals.length) return { heatCells: [], vMin: 0, vMax: 1, avgHash: "none" };
    vals.sort((a, b) => a - b);
    const loIdx = Math.floor(HEAT_CLIP_PCT[0] * (vals.length - 1));
    const hiIdx = Math.floor(HEAT_CLIP_PCT[1] * (vals.length - 1));
    const lo = vals[loIdx],
      hi = vals[hiIdx];
    const epsHi = hi - lo < 1e-9 ? lo + 1e-9 : hi;
    const hash = `${cellsArr.length}|${lo.toFixed(3)}|${epsHi.toFixed(3)}|${highlight2D}`;
    return { heatCells: cellsArr, vMin: lo, vMax: epsHi, avgHash: hash };
  }, [data, highlight2D]);

  // ★ ベクタで描く選択ドット（外黒→内白→中心黒）
  const selectedDotLayers = useMemo(() => {
    if (!selectedJAN) return [];
    const hit = data.find(d => janOf(d) === String(selectedJAN));
    if (!hit || !Number.isFinite(xOf(hit)) || !Number.isFinite(yOf(hit))) return [];

    const pos = [xOf(hit), -yOf(hit), 0];
    const R = 0.1; // ベース半径（見た目サイズ。0.14〜0.20で好み調整）

    // 外側の黒丸
    const outer = new ScatterplotLayer({
      id: "selected-dot-outer",
      data: [{ position: pos }],
      getPosition: d => d.position,
      getFillColor: [0, 0, 0, 255],
      radiusUnits: "meters",
      getRadius: R,
      pickable: false,
      parameters: { depthTest: false },
    });

    // 中の白丸（リングに見せる）
    const innerWhite = new ScatterplotLayer({
      id: "selected-dot-inner-white",
      data: [{ position: pos }],
      getPosition: d => d.position,
      getFillColor: [255, 255, 255, 255],
      radiusUnits: "meters",
      getRadius: R * 0.58, // リング幅の比率（0.55〜0.65で調整）
      pickable: false,
      parameters: { depthTest: false },
    });

    return [outer, innerWhite];
  }, [data, selectedJAN]);

  // --- レイヤ：打点 ---
  const mainLayer = useMemo(
    () =>
      new ScatterplotLayer({
        id: "scatter",
        data,
        getPosition: (d) => [xOf(d), -yOf(d), 0],
        getFillColor: (d) => {
          const janStr = janOf(d);
          if (Number(userRatings?.[janStr]?.rating) > 0) return BLACK;
          if (favorites && favorites[janStr]) return FAVORITE_RED;
          return MAP_POINT_COLOR;
        },
        updateTriggers: {
          getFillColor: [
            selectedJAN,
            JSON.stringify(favorites || {}),
            JSON.stringify(userRatings || {}),
          ],
        },
        radiusUnits: "meters",
        getRadius: 0.03,
        pickable: true,
      }),
    [data, selectedJAN, favorites, userRatings]
  );

  // --- レイヤ：評価リング ---
  const ratingCircleLayers = useMemo(() => {
    const lineColor = [255, 0, 0, 255];
    return Object.entries(userRatings || {}).flatMap(([jan_code, ratingObj]) => {
      const item = data.find(d => janOf(d) === String(jan_code));
      if (!item || !Number.isFinite(xOf(item)) || !Number.isFinite(yOf(item))) return [];
      const count = Math.min(Number(ratingObj?.rating) || 0, 5);
      if (count <= 0) return [];
      const radiusBase = 0.06;
      return Array.from({ length: count }).map((_, i) => {
        const steps = 40;
        const path = Array.from({ length: steps }, (_, j) => {
          const angle = (j / steps) * 2 * Math.PI;
          const radius = radiusBase * (i + 1);
          const x = xOf(item) + Math.cos(angle) * radius;
          const y = -yOf(item) + Math.sin(angle) * radius;
          return [x, y];
        });
        path.push(path[0]);
        return new PathLayer({
          id: `ring-${jan_code}-${i}`,
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
        width: 310,
        height: 310,
        anchorX: 155,
        anchorY: 155,
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
  }, [userPin]);

  // --- 近傍探索（クリック時） ---
  const findNearestWine = useCallback(
    (coord) => {
      if (!coord || !Array.isArray(data) || data.length === 0) return null;
      const [cx, cy] = coord;
      let best = null,
        bestD2 = Infinity;
      for (const d of data) {
        const x = xOf(d), y = -yOf(d);
        const dx = x - cx,
          dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = d;
        }
      }
      return best;
    },
    [data]
  );

  // --- 操作終了時クランプ ---
  const onInteractionStateChange = useCallback(
    (state) => {
      interactingRef.current =
        !!state?.isDragging || !!state?.isPanning || !!state?.isZooming;
      if (!PAN_CLAMP) return;
      if (!interactingRef.current) {
        cancelAnimationFrame(clampRAF.current);
        clampRAF.current = requestAnimationFrame(() => {
          setViewState((curr) =>
            clampViewState(curr, panBounds, sizeRef.current, {
              xPx: edgeMarginXPx,
              yPx: edgeMarginYPx,
            })
          );
        });
      }
    },
    [panBounds, setViewState, edgeMarginXPx, edgeMarginYPx]
  );

  return (
    <DeckGL
      ref={deckRef}   // ★ DeckGL に ref を渡す
      views={new OrthographicView({ near: -1, far: 1 })}
      viewState={viewState}
      style={{ position: "absolute", inset: 0 }}
      useDevicePixels
      // キャンバスサイズ保持
      onResize={({ width, height }) => {
        sizeRef.current = getEffectiveSizePx({ width, height });
        if (!PAN_CLAMP) return;
        if (interactingRef.current) return;
        setViewState((curr) =>
          clampViewState(curr, panBounds, sizeRef.current, {
            xPx: edgeMarginXPx,
            yPx: edgeMarginYPx,
          })
        );
      }}
      // ユーザー操作中/後：ズームだけ即時クランプ、パンは“ギリ見える”範囲に
      onViewStateChange={({ viewState: vs, interactionState }) => {
        const isInteracting =
          !!interactionState?.isDragging ||
          !!interactionState?.isPanning ||
          !!interactionState?.isZooming;
        interactingRef.current = isInteracting;

        const next = clampZoomOnly(vs);
        setViewState(next);
      }}
      onInteractionStateChange={onInteractionStateChange}
      controller={{
        dragPan: true,
        dragRotate: false,
        minZoom: ZOOM_LIMITS.min,
        maxZoom: ZOOM_LIMITS.max,
        inertia: false,
        doubleClickZoom: false,
        touchZoom: true,
        scrollZoom: true,
      }}
      onClick={(info) => {
        // まずは通常のGPUピッキング（点を直タップ）
        const picked = info?.object;
        if (picked && janOf(picked)) {
          onPickWine?.(picked);
          return;
        }

        // クリック座標（world）を取る
        const world = info?.coordinate
          ?? (info?.pixel ? deckRef.current?.deck?.unproject(info.pixel) : null);
        if (!world) return;

        // 最近傍（world座標で）
        const nearest = findNearestWine(world);
        if (!nearest) return;

        // ★ ピクセルしきい値でフィルタ（px→worldへ換算して距離比較）
        const worldThresh = pxToWorld(viewState.zoom, CLICK_NEAR_PX);
        const dx = xOf(nearest) - world[0];
        const dy = (-yOf(nearest)) - world[1];
        if (dx * dx + dy * dy > worldThresh * worldThresh) {
          // 近くに点が無いタップ → 何もしない
          return;
        }

        // しきい値内なら開く
        onPickWine?.(nearest);
      }}

      pickingRadius={8}
      layers={[
        // 背景（紙テクスチャ）
        new BitmapLayer({
          id: "paper-bg",
          image: `${process.env.PUBLIC_URL || ""}/img/paper-bg.png`,
          bounds: bgBounds,
          opacity: 1,
          parameters: { depthTest: false },
        }),

      // ① セルの地模様（タイル）は常に表示
      new IconLayer({
        id: "cell-tiles",
        data: cells,
        getPosition: (d) => d.center,
        getIcon: (d) => ({
          url: d.hasRating ? TILE_OCHRE : TILE_GRAY,
          width: 32,
          height: 32,
          anchorX: 16,
          anchorY: 16,
        }),
        sizeUnits: "meters",
        getSize: GRID_CELL_SIZE,
        billboard: true,
        pickable: false,
        parameters: { depthTest: false },
        updateTriggers: {
          getIcon: [JSON.stringify(cells.map((c) => c.hasRating))],
          getPosition: [GRID_CELL_SIZE],
          getSize: [GRID_CELL_SIZE],
        },
      }),

      // ② 商品打点に付くバブル（highlight2D 選択時のみ）
      highlight2D
        ? new ScatterplotLayer({
            id: `point-bubbles-${highlight2D}`,
            data: pointBubbles,                 // { position, t }
            getPosition: d => d.position,
            radiusUnits: "meters",
            // ★ 3段階（下位20%/中間60%/上位20%）
            getRadius: d => {
              const R_SMALL = 0.06;  // 下位50%
              const R_MED   = 0.10;  // 中間40%
              const R_LARGE = 0.22;  // 上位10%
              const t = Math.max(0, Math.min(1, d.t));  // 0..1（分位点クリップ＆ガンマ後）
              if (t < 0.50) return R_SMALL;      // 下位50%
              if (t < 0.90) return R_MED;        // 中間40%
              return R_LARGE;                    // 上位10%
            },
            getFillColor: () => [210, 210, 205, 50], // ← グレー指定
            stroked: false,
            getLineWidth: 0,
            pickable: false,
            parameters: { depthTest: false },
            updateTriggers: {
              getRadius: [HEAT_GAMMA], // t生成はHEAT_GAMMA/CLIP依存（pointBubblesで計算）
              getFillColor: [HEAT_GAMMA, HEAT_ALPHA_MIN, HEAT_ALPHA_MAX,
                             HEAT_COLOR_LOW?.[0], HEAT_COLOR_LOW?.[1], HEAT_COLOR_LOW?.[2],
                             HEAT_COLOR_HIGH?.[0], HEAT_COLOR_HIGH?.[1], HEAT_COLOR_HIGH?.[2]],
            },
          })
        : null,


        // グリッド線
        new LineLayer({
          id: "grid-lines-thin",
          data: thinLines,
          getSourcePosition: (d) => d.sourcePosition,
          getTargetPosition: (d) => d.targetPosition,
          getColor: [214, 214, 214, 255],
          getWidth: 1,
          widthUnits: "pixels",
        }),
        new LineLayer({
          id: "grid-lines-thick",
          data: thickLines,
          getSourcePosition: (d) => d.sourcePosition,
          getTargetPosition: (d) => d.targetPosition,
          getColor: [144, 144, 144, 255],
          getWidth: 1,
          widthUnits: "pixels",
        }),
        // ピン/コンパス
        userPinCompassLayer,
        compassLayer,

        // 打点
        mainLayer,

        // ★ 選択中のみ dot.svg を重ねる
        ...selectedDotLayers,

        // 評価リング
        ...ratingCircleLayers,
      ]}
    />
  );
});
export default MapCanvas;