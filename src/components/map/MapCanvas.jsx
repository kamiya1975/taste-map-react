// src/components/map/MapCanvas.jsx
import React, {
  forwardRef,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import {
  ScatterplotLayer,
  LineLayer,
  PathLayer,
  IconLayer,
  BitmapLayer,
  TextLayer,
} from "@deck.gl/layers";
import {
  ZOOM_LIMITS,
  GRID_CELL_SIZE,
  HEAT_GAMMA,
  HEAT_CLIP_PCT,
  MAP_POINT_COLOR,
  getClusterRGBA,
} from "../../ui/constants";

const BLACK = [0, 0, 0, 255];
const FAVORITE_RED = [178, 53, 103, 255];
const STAR_ORANGE = [247, 147, 30, 255]; // ★用オレンジ
const TILE_GRAY = `${process.env.PUBLIC_URL || ""}/img/gray-tile.png`;
const TILE_OCHRE = `${process.env.PUBLIC_URL || ""}/img/ochre-tile.png`;

const janOf = (d) => String(d?.jan_code ?? d?.JAN ?? "");
const xOf = (d) => (Number.isFinite(d?.umap_x) ? d.umap_x : d?.UMAP1);
const yOf = (d) => (Number.isFinite(d?.umap_y) ? d.umap_y : d?.UMAP2);

const ANCHOR_JAN = "4964044046324";

// 嗜好重心ピン
const makePinSVG = ({
  fill = "#2A6CF7",
  stroke = "#FFFFFF",
  strokeWidth = 2,
  innerFill = "#FFFFFF",
} = {}) => {
  const w = 64,
    h = 96;
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="M32 4
             C19 4 9 14 9 28
             C9 47 32 79 32 79
             C32 79 55 47 55 28
             C55 14 45 4 32 4 Z"
          fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
    <circle cx="32" cy="28" r="9" fill="${innerFill}"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    width: w,
    height: h,
    anchorX: w / 2,
    anchorY: h - 1,
  };
};

// クリック時の最近傍許容距離（px）
const CLICK_NEAR_PX = 24;

// パンのクランプ切替
const PAN_CLAMP = true;

// デフォルト余白（px）
const DEFAULT_EDGE_MARGIN_X_PX = 8;
const DEFAULT_EDGE_MARGIN_Y_PX = 20;

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

// 実際に見えているビューポート px
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

// ===== パン可動域クランプ =====
function clampViewState(nextVS, panBounds, sizePx, margins = {}) {
  const zoom = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, nextVS.zoom));
  if (!PAN_CLAMP) return { ...nextVS, zoom };

  const { halfW, halfH } = halfSizeWorld(zoom, sizePx);
  const xmin = panBounds?.xmin ?? -Infinity;
  const xmax = panBounds?.xmax ?? Infinity;
  const ymin = panBounds?.ymin ?? -Infinity;
  const ymax = panBounds?.ymax ?? Infinity;

  const pxX = margins.xPx ?? DEFAULT_EDGE_MARGIN_X_PX;
  const pxY = margins.yPx ?? DEFAULT_EDGE_MARGIN_Y_PX;
  const mX = pxToWorld(zoom, pxX);
  const mY = pxToWorld(zoom, pxY);

  const worldW = xmax - xmin;
  const worldH = ymax - ymin;

  let minX, maxX, minY, maxY;

  if (worldW >= 2 * halfW) {
    minX = xmin + halfW - mX;
    maxX = xmax - halfW + mX;
  } else {
    const cx = (xmin + xmax) / 2;
    const lackX = 2 * halfW - worldW;
    const slackX = lackX * 0.5 + mX;
    minX = cx - slackX;
    maxX = cx + slackX;
  }

  if (worldH >= 2 * halfH) {
    minY = ymin + halfH - mY;
    maxY = ymax - halfH + mY;
  } else {
    const cy = (ymin + ymax) / 2;
    const lack = 2 * halfH - worldH;
    const slack = lack * 0.5 + mY;
    minY = cy - slack;
    maxY = cy + slack;
  }

  const EPS_EDGE = 1e-6;
  const x = Math.max(minX + EPS_EDGE, Math.min(maxX - EPS_EDGE, nextVS.target[0]));
  const y = Math.max(minY + EPS_EDGE, Math.min(maxY - EPS_EDGE, nextVS.target[1]));
  return { ...nextVS, zoom, target: [x, y, 0] };
}

// ---------- 汎用 toBool ----------
const toBool = (v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const w = v.trim().toLowerCase();
    return w === "1" || w === "true" || w === "yes";
  }
  if (Array.isArray(v)) return v.length > 0;
  return false;
};

const MapCanvas = forwardRef(function MapCanvas(
  {
    data,
    allowedJansSet,
    ecOnlyJansSet,
    janStoreMap,
    activeStoreId,
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
    onOpenSlider,
    edgeMarginXPx = 8,
    edgeMarginYPx = 20,
    clusterColorMode = false,
    basePoint,
  },
  deckRef
) {
  // --- refs ---
  const sizeRef = useRef({ width: 1, height: 1 });
  const interactingRef = useRef(false);
  const clampRAF = useRef(0);

  const clampZoomOnly = (vs) => ({
    ...vs,
    zoom: Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, vs.zoom)),
  });

  // 背景ビットマップの敷き範囲
  const bgBounds = useMemo(() => {
    const { halfW, halfH } = halfSizeWorld(viewState.zoom, sizeRef.current);
    const cx = viewState?.target?.[0] ?? 0;
    const cy = viewState?.target?.[1] ?? 0;
    const K = 8;
    return [cx - K * halfW, cy - K * halfH, cx + K * halfW, cy + K * halfH];
  }, [viewState.zoom, viewState.target]);

  // --- 店舗情報に基づいて打点をフィルタするデータ ---
  //   ※ ここでは「どの店舗の点か」は絞り込まない。
  //      ・公式Shop(id=0) → EC専用JAN(ecOnlyJansSet)だけを採用
  //      ・それ以外 → allowedJansSet だけでフィルタ
  const filteredData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];

    // 公式Shopモード（allowedJansSet が無く、ecOnlyJansSet だけある）
    if (!allowedJansSet && ecOnlyJansSet && ecOnlyJansSet.size > 0) {
      return data.filter((d) => {
        const jan = janOf(d);
        return jan && ecOnlyJansSet.has(jan);
      });
    }

    // フォールバック：allowedJansSet が無ければ全部表示（開発・デバッグ用）
    if (!allowedJansSet) {
      return data;
    }

    // 通常モード：allowedJansSet だけでフィルタ
    return data.filter((d) => {
      const jan = janOf(d);
      if (!jan) return false;
      return allowedJansSet.has(jan);
    });
  }, [data, allowedJansSet, ecOnlyJansSet]);

  // --- EC商品 / 店舗商品 の振り分け ---
  //   storePoints   … 店舗で扱っている商品（★で表示）
  //   ecOnlyPoints  … ECのみ or 通常点（●で表示）
  const { storePoints, ecOnlyPoints } = useMemo(() => {
    const store = [];
    const ecOnly = [];

    (filteredData || []).forEach((d) => {
      const jan = janOf(d);

      // バックエンド側のフラグを優先
      const rawStore =
        d.is_store_product ??
        d.has_store_product ??
        false; // store_product は使わない（構造変更の影響を避ける）

      const rawEc =
        d.is_ec_product ??
        d.has_ec_product ??
        d.ec_product ??
        false;

      let isStoreBool = toBool(rawStore);
      const isEcBool = toBool(rawEc);

      // ★ 店舗判定は「フラグ」が正なら優先、それ以外は janStoreMap を「参考」にする程度にしたければここで足す
      //   ただし今は janStoreMap に依存しない（ここで依存するとまた全部★になりうる）
      //   if (!isStoreBool && activeStoreId != null && janStoreMap) {
      //     const stores = janStoreMap[jan] || [];
      //     if (stores.includes(activeStoreId)) isStoreBool = true;
      //   }

      if (isStoreBool) {
        // ① 店舗で扱っている商品 → ★
        store.push(d);
      } else {
        // ② それ以外はすべて ●（EC専用 + 通常点）
        ecOnly.push(d);
      }
    });

    return { storePoints: store, ecOnlyPoints: ecOnly };
  }, [filteredData]);

  // --- バブル用データ ---
  const pointBubbles = useMemo(() => {
    if (!highlight2D) return [];

    const vals = filteredData
      .map((d) => Number(d[highlight2D]))
      .filter((v) => Number.isFinite(v));
    if (!vals.length) return [];

    vals.sort((a, b) => a - b);
    const loIdx = Math.floor(HEAT_CLIP_PCT[0] * (vals.length - 1));
    const hiIdx = Math.floor(HEAT_CLIP_PCT[1] * (vals.length - 1));
    const lo = vals[loIdx];
    const hi = vals[hiIdx];
    const vHi = hi - lo < 1e-9 ? lo + 1e-9 : hi;

    return filteredData
      .map((d) => {
        const v = Number(d[highlight2D]);
        if (!Number.isFinite(v)) return null;
        let t = (v - lo) / ((vHi - lo) || 1e-9);
        t = Math.max(0, Math.min(1, Math.pow(t, HEAT_GAMMA)));
        return {
          jan: janOf(d),
          position: [xOf(d), -yOf(d), 0],
          t,
          cluster: Number(d.cluster),
        };
      })
      .filter(Boolean);
  }, [filteredData, highlight2D]);

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
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      const width = Math.floor(
        vv?.width || window.innerWidth || sizeRef.current.width || 1
      );
      const height = Math.floor(
        vv?.height || window.innerHeight || sizeRef.current.height || 1
      );
      sizeRef.current = { width, height };
    };
    const onPageShow = () => {
      refreshSize();
      setViewState((curr) =>
        clampViewState(curr, panBounds, sizeRef.current, {
          xPx: edgeMarginXPx,
          yPx: edgeMarginYPx,
        })
      );
    };
    const onOrientation = () => {
      refreshSize();
      setViewState((curr) =>
        clampViewState(curr, panBounds, sizeRef.current, {
          xPx: edgeMarginXPx,
          yPx: edgeMarginYPx,
        })
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
    filteredData.forEach((d) => {
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
      if ((userRatings[janOf(d)]?.rating ?? 0) > 0) map.get(key).hasRating = true;
      map.get(key).count += 1;
    });
    return Array.from(map.values());
  }, [filteredData, userRatings]);

  // ★ 選択中ドット（外黒→内白）
  const selectedDotLayers = useMemo(() => {
    if (!selectedJAN) return [];
    const hit = filteredData.find((d) => janOf(d) === String(selectedJAN));
    if (!hit || !Number.isFinite(xOf(hit)) || !Number.isFinite(yOf(hit))) return [];

    const pos = [xOf(hit), -yOf(hit), 0];
    const R = 0.1;

    const outer = new ScatterplotLayer({
      id: "selected-dot-outer",
      data: [{ position: pos }],
      getPosition: (d) => d.position,
      getFillColor: [0, 0, 0, 255],
      radiusUnits: "meters",
      getRadius: R,
      pickable: false,
      parameters: { depthTest: false },
    });

    const innerWhite = new ScatterplotLayer({
      id: "selected-dot-inner-white",
      data: [{ position: pos }],
      getPosition: (d) => d.position,
      getFillColor: [255, 255, 255, 255],
      radiusUnits: "meters",
      getRadius: R * 0.58,
      pickable: false,
      parameters: { depthTest: false },
    });

    return [outer, innerWhite];
  }, [filteredData, selectedJAN]);

  // --- レイヤ：打点（EC + 通常点 → ●） ---
  const mainLayer = useMemo(
    () =>
      new ScatterplotLayer({
        id: "scatter",
        data: ecOnlyPoints, // ●
        getPosition: (d) => [xOf(d), -yOf(d), 0],
        getFillColor: (d) => {
          const janStr = janOf(d);
          if (Number(userRatings?.[janStr]?.rating) > 0) return BLACK;
          if (favorites && favorites[janStr]) return FAVORITE_RED;
          if (clusterColorMode && Number.isFinite(d.cluster)) {
            return getClusterRGBA(d.cluster);
          }
          return MAP_POINT_COLOR;
        },
        updateTriggers: {
          getFillColor: [
            JSON.stringify(favorites || {}),
            JSON.stringify(userRatings || {}),
            clusterColorMode,
          ],
        },
        radiusUnits: "meters",
        getRadius: 0.03,
        pickable: true,
      }),
    [ecOnlyPoints, favorites, userRatings, clusterColorMode]
  );

  // デバッグ：ECフラグ数
  useEffect(() => {
    if (!Array.isArray(filteredData)) return;
    const ecCount = filteredData.filter((d) => d.is_ec_product).length;
    const storeCount = filteredData.filter((d) => d.is_store_product).length;
    console.log("[MapCanvas] points:", {
      filtered: filteredData.length,
      storeCount,
      ecCount,
    });
  }, [filteredData]);

  // --- レイヤ：店舗商品の★マーカー ---
  const ecStarLayer = useMemo(() => {
    if (!storePoints || storePoints.length === 0) return null;

    return new TextLayer({
      id: "store-stars",
      data: storePoints, // ★
      getPosition: (d) => [xOf(d), -yOf(d), 0],
      getText: () => "★",
      sizeUnits: "meters",
      getSize: () => 0.1,
      getColor: (d) => {
        const janStr = janOf(d);
        if (Number(userRatings?.[janStr]?.rating) > 0) return BLACK;
        if (favorites && favorites[janStr]) return FAVORITE_RED;
        if (clusterColorMode && Number.isFinite(d.cluster)) {
          return getClusterRGBA(d.cluster);
        }
        return STAR_ORANGE;
      },
      getTextAnchor: () => "middle",
      getAlignmentBaseline: () => "center",
      characterSet: ["★"],
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
      billboard: true,
      pickable: true,
      parameters: { depthTest: false },
      updateTriggers: {
        getColor: [
          JSON.stringify(favorites || {}),
          JSON.stringify(userRatings || {}),
          clusterColorMode,
        ],
      },
    });
  }, [storePoints, favorites, userRatings, clusterColorMode]);

  // --- レイヤ：評価リング ---
  const ratingCircleLayers = useMemo(() => {
    const lineColor = [255, 0, 0, 255];
    return Object.entries(userRatings || {}).flatMap(
      ([jan_code, ratingObj]) => {
        const item = filteredData.find(
          (d) => janOf(d) === String(jan_code)
        );
        if (
          !item ||
          !Number.isFinite(xOf(item)) ||
          !Number.isFinite(yOf(item))
        )
          return [];
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
      }
    );
  }, [filteredData, userRatings]);

  // --- 嗜好コンパス（ユーザー重心） ---
  const compassLayer = useMemo(() => {
    if (!compassPoint) return null;
    const icon = makePinSVG({
      fill: "#2A6CF7",
      stroke: "#FFFFFF",
      strokeWidth: 2,
      innerFill: "#FFFFFF",
    });
    return new IconLayer({
      id: "preference-pin",
      data: [{ position: [compassPoint[0], -compassPoint[1], 0] }],
      getPosition: (d) => d.position,
      getIcon: () => icon,
      sizeUnits: "meters",
      getSize: 0.55,
      billboard: true,
      pickable: false,
      parameters: { depthTest: false },
    });
  }, [compassPoint]);

  // --- 任意ユーザーピン ---
  const userPinCompassLayer = useMemo(() => {
    if (!userPin) return null;
    const icon = makePinSVG({
      fill: "#F7931E",
      stroke: "#FFFFFF",
      strokeWidth: 2,
      innerFill: "#FFFFFF",
    });
    return new IconLayer({
      id: "user-pin",
      data: [{ position: [userPin[0], -userPin[1], 0] }],
      getPosition: (d) => d.position,
      getIcon: () => icon,
      sizeUnits: "meters",
      getSize: 0.6,
      billboard: true,
      pickable: false,
      parameters: { depthTest: false },
    });
  }, [userPin]);

  // --- 基準のワインコンパス ---
  const anchorCompassLayer = useMemo(() => {
    let x = null;
    let yUMAP = null;

    if (
      basePoint &&
      Number.isFinite(basePoint.x) &&
      Number.isFinite(basePoint.y)
    ) {
      x = Number(basePoint.x);
      yUMAP = Number(basePoint.y);
    } else {
      const item = filteredData.find((d) => janOf(d) === ANCHOR_JAN);
      if (!item || !Number.isFinite(xOf(item)) || !Number.isFinite(yOf(item))) {
        return null;
      }
      x = xOf(item);
      yUMAP = yOf(item);
    }

    return new IconLayer({
      id: "anchor-compass",
      data: [{ position: [x, -yUMAP, 0] }],
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
      pickable: true,
      onClick: () => {
        onOpenSlider?.();
      },
      parameters: { depthTest: false },
    });
  }, [filteredData, basePoint, onOpenSlider]);

  // --- 近傍探索 ---
  const findNearestWine = useCallback(
    (coord) => {
      if (!coord || !Array.isArray(filteredData) || filteredData.length === 0)
        return null;
      const [cx, cy] = coord;
      let best = null,
        bestD2 = Infinity;
      for (const d of filteredData) {
        const x = xOf(d),
          y = -yOf(d);
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
    [filteredData]
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
      ref={deckRef}
      views={new OrthographicView({ near: -1, far: 1 })}
      viewState={viewState}
      style={{ position: "absolute", inset: 0 }}
      useDevicePixels
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
        const picked = info?.object;
        if (picked && janOf(picked)) {
          onPickWine?.(picked);
          return;
        }

        const world =
          info?.coordinate ??
          (info?.pixel
            ? deckRef.current?.deck?.unproject(info.pixel)
            : null);
        if (!world) return;

        const nearest = findNearestWine(world);
        if (!nearest) return;

        const worldThresh = pxToWorld(viewState.zoom, CLICK_NEAR_PX);
        const dx = xOf(nearest) - world[0];
        const dy = -yOf(nearest) - world[1];
        if (dx * dx + dy * dy > worldThresh * worldThresh) {
          return;
        }

        if (janOf(nearest) === ANCHOR_JAN) {
          onOpenSlider?.();
        } else {
          onPickWine?.(nearest);
        }
      }}
      pickingRadius={8}
      layers={[
        // 背景紙
        new BitmapLayer({
          id: "paper-bg",
          image: `${process.env.PUBLIC_URL || ""}/img/paper-bg.png`,
          bounds: bgBounds,
          opacity: 1,
          parameters: { depthTest: false },
        }),

        // グリッド線
        new LineLayer({
          id: "grid-lines-thin",
          data: thinLines,
          getSourcePosition: (d) => d.sourcePosition,
          getTargetPosition: (d) => d.targetPosition,
          getColor: [214, 214, 214, 255],
          getWidth: 0.5,
          widthUnits: "pixels",
        }),
        new LineLayer({
          id: "grid-lines-thick",
          data: thickLines,
          getSourcePosition: (d) => d.sourcePosition,
          getTargetPosition: (d) => d.targetPosition,
          getColor: [144, 144, 144, 255],
          getWidth: 0.5,
          widthUnits: "pixels",
        }),

        // セルタイル（バブル無し & クラスタ色OFFのときだけ）
        !highlight2D && !clusterColorMode
          ? new IconLayer({
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
            })
          : null,

        // バブル（highlight2D 選択時のみ）
        highlight2D
          ? new ScatterplotLayer({
              id: `point-bubbles-${highlight2D}`,
              data: pointBubbles,
              getPosition: (d) => d.position,
              radiusUnits: "meters",
              getRadius: (d) => {
                const R_SMALL = 0.06;
                const R_MED = 0.1;
                const R_LARGE = 0.22;
                const t = Math.max(0, Math.min(1, d.t));
                if (t < 0.5) return R_SMALL;
                if (t < 0.9) return R_MED;
                return R_LARGE;
              },
              getFillColor: (d) => {
                if (clusterColorMode && Number.isFinite(d.cluster)) {
                  const c = getClusterRGBA(d.cluster) || [210, 210, 205, 255];
                  return [c[0], c[1], c[2], 150];
                }
                return [210, 210, 205, 150];
              },
              stroked: false,
              getLineWidth: 0,
              pickable: false,
              parameters: { depthTest: false },
              updateTriggers: {
                getRadius: [HEAT_GAMMA],
                getFillColor: [clusterColorMode],
              },
            })
          : null,

        // ピン/コンパス
        userPinCompassLayer,
        compassLayer,
        anchorCompassLayer,

        // ● (EC + 通常点)
        mainLayer,

        // ★（店舗で扱っている商品）
        ecStarLayer,

        // 選択ドット
        ...selectedDotLayers,

        // 評価リング
        ...ratingCircleLayers,
      ]}
    />
  );
});

export default MapCanvas;
