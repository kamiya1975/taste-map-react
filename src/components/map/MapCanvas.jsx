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

const BLACK = [0, 0, 0, 255];
const FAVORITE_RED = [178, 53, 103, 255];
const TILE_GRAY  = `${process.env.PUBLIC_URL || ""}/img/gray-tile.png`;
const TILE_OCHRE = `${process.env.PUBLIC_URL || ""}/img/ochre-tile.png`;

// ✅ パンのクランプを切り替えるフラグ（戻される挙動を止めたいので false 推奨）
const PAN_CLAMP = false;

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
  // ⭐️ パンのクランプを切るときはズームだけ返して終了
  if (!PAN_CLAMP) return { ...nextVS, zoom };

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
  const SLACK_FACTOR_Y = 15.0;
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

  const EPS_EDGE = 1e-6;
  const x = Math.max(minX + EPS_EDGE, Math.min(maxX - EPS_EDGE, nextVS.target[0]));
  const y = Math.max(minY + EPS_EDGE, Math.min(maxY - EPS_EDGE, nextVS.target[1]));

  return { ...nextVS, zoom, target: [x, y, 0] };
}

export default function MapCanvas(props) {
  const {
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
  } = props;

  const sizeRef = useRef({ width: 1, height: 1 });
  const interactingRef = useRef(false);
  const clampRAF = useRef(0);

  const clampZoomOnly = (vs) => ({
    ...vs,
    zoom: Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, vs.zoom)),
  });

  // ✅ 初期レイアウト時の“強制クランプ”を停止（PAN_CLAMP=false の場合）
  useEffect(() => {
    if (!PAN_CLAMP) return;
    const raf = requestAnimationFrame(() => {
      setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
    });
    return () => cancelAnimationFrame(raf);
  }, [panBounds, setViewState]);

  // ✅ visualViewport 変化時の“戻し”も停止（PAN_CLAMP=false の場合はサイズ記録のみ）
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
        if (!PAN_CLAMP) return;
        cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(() => {
          setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
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
  }, [panBounds, setViewState]);

  // ✅ bfcache復帰 / 画面回転での“戻し”も停止
  useEffect(() => {
    if (!PAN_CLAMP) return;
    const onPageShow = () => setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
    const onOrientation = () => setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, [panBounds, setViewState]);

  // --- グリッド線データ（省略：元のまま） ---
  // ...（thinLines, thickLines の useMemo はそのまま）...

  // --- セル集計/ヒートマップ/レイヤ類（ここも元のまま） ---
  // ...（cells, heatCells, mainLayer, ratingCircleLayers, compassLayer, userPinCompassLayer などは元のまま）...

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

  // ✅ 操作終了時の“最後に1回だけクランプ”を停止（PAN_CLAMP=false）
  const onInteractionStateChange = useCallback((state) => {
    interactingRef.current =
      !!state?.isDragging || !!state?.isPanning || !!state?.isZooming;
    if (!PAN_CLAMP) return;
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

      // キャンバスサイズを保持（PAN_CLAMP=false の場合は記録のみ）
      onResize={({ width, height }) => {
        sizeRef.current = getEffectiveSizePx({ width, height });
        if (!PAN_CLAMP) return;
        if (interactingRef.current) return;
        setViewState((curr) => clampViewState(curr, panBounds, sizeRef.current));
      }}

      // ✅ ユーザー操作中/後とも「ズームだけ」クランプして反映
      onViewStateChange={({ viewState: vs, interactionState }) => {
        const isInteracting =
          !!interactionState?.isDragging ||
          !!interactionState?.isPanning ||
          !!interactionState?.isZooming;
        interactingRef.current = isInteracting;

        const next = clampZoomOnly(vs);
        if (!PAN_CLAMP) {
          // パンは自由にさせる（戻さない）
          setViewState(next);
        } else {
          // パンもクランプしたい場合はこちら（将来の切替用）
          setViewState(isInteracting ? next : clampViewState(next, panBounds, sizeRef.current));
        }
      }}

      onInteractionStateChange={onInteractionStateChange}

      controller={{
        dragPan: true,
        dragRotate: false,
        minZoom: ZOOM_LIMITS.min,
        maxZoom: ZOOM_LIMITS.max,
        inertia: false,          // 必要に応じて true にすると“流れ”が出ます
        doubleClickZoom: false,
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
        // 以下のレイヤ構成は元のままでOK
        new BitmapLayer({
          id: "paper-bg",
          image: `${process.env.PUBLIC_URL || ""}/img/paper-bg.png`,
          bounds: [panBounds.xmin, panBounds.ymin, panBounds.xmax, panBounds.ymax],
          opacity: 1,
          parameters: { depthTest: false },
        }),
        // ... 以降（cell-tiles / grid-cells-heat / grid-lines / pins / scatter / rating circles など元のまま） ...
      ]}
    />
  );
}
