import React, { useEffect, useState, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { OrbitView, OrthographicView, COORDINATE_SYSTEM } from "@deck.gl/core";
import {
  ScatterplotLayer,
  ColumnLayer,
  LineLayer,
  TextLayer,
  GridCellLayer,
  PathLayer,
} from "@deck.gl/layers";
import Drawer from "@mui/material/Drawer";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import CircleRatingDisplay from "./components/CircleRatingDisplay";

// ========= App =========
function App() {
  const location = useLocation();
  const [data, setData] = useState([]);
  const [is3D, setIs3D] = useState(false);

  const [viewState, setViewState] = useState({
    target: [0, 0, 0],
    rotationX: 0,
    rotationOrbit: 0,
    zoom: 5,
    minZoom: 4.0,
    maxZoom: 10.0,
  });
  const [saved2DViewState, setSaved2DViewState] = useState(null);

  const [zMetric, setZMetric] = useState("");
  const [userRatings, setUserRatings] = useState({});
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);
  const [sliderMarkCoords, setSliderMarkCoords] = useState(null);
  const [showRatingDates, setShowRatingDates] = useState(false);
  const [isRatingListOpen, setIsRatingListOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [highlight2D, setHighlight2D] = useState("");

  // 商品ドロワー
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedJAN, setSelectedJAN] = useState(null);

  const ZOOM_LIMITS = { minZoom: 4.0, maxZoom: 10.0 };

  // ===== helpers (安全な配列/ビュー状態マージ) =====
  const asArr3 = (v) =>
    Array.isArray(v) ? [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0] : [0, 0, 0];

  const mergeViewStateSafe = (next, prev) => {
    const p = prev && typeof prev === "object" ? prev : {};
    const n = next && typeof next === "object" ? next : {};
    const target = asArr3(n.target ?? p.target);
    const zoom = Number.isFinite(n.zoom)
      ? n.zoom
      : Number.isFinite(p.zoom)
      ? p.zoom
      : 5;
    return { ...p, ...n, target, zoom };
  };

  // ===== location.state 経由でのスライダー自動オープン =====
  useEffect(() => {
    if (location.state?.autoOpenSlider) {
      setIsSliderOpen(true);
    }
  }, [location.state]);

  // ===== userRatings 同期 =====
  useEffect(() => {
    const syncUserRatings = () => {
      const stored = localStorage.getItem("userRatings");
      if (stored) {
        try {
          setUserRatings(JSON.parse(stored));
        } catch (e) {
          console.error("Failed to parse userRatings:", e);
        }
      }
    };
    syncUserRatings();
    window.addEventListener("focus", syncUserRatings);
    window.addEventListener("storage", syncUserRatings);
    return () => {
      window.removeEventListener("focus", syncUserRatings);
      window.removeEventListener("storage", syncUserRatings);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("userRatings", JSON.stringify(userRatings));
  }, [userRatings]);

  // ===== データ読み込み =====
  useEffect(() => {
    const url = `${process.env.PUBLIC_URL || ""}/UMAP_PCA_coordinates.json`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((rows) => {
        const cleaned = (rows || [])
          .filter(Boolean)
          .map((r) => {
            const toNum = (v) => (v === "" || v == null ? NaN : Number(v));
            return {
              JAN: String(r.JAN ?? ""),
              Type: r.Type ?? "Other",
              BodyAxis: Number(r.UMAP1), // x軸
              SweetAxis: Number(r.UMAP2), // y軸
              PC1: Number(r.PC1),
              PC2: Number(r.PC2),
              PC3: Number(r.PC3),
              商品名: r["商品名"],
              国: r["国"],
              産地: r["産地"],
              葡萄品種: r["葡萄品種"],
              生産年: r["生産年"],
              "容量 ml": toNum(r["容量 ml"]),
              希望小売価格: toNum(r["希望小売価格"]),
            };
          })
          .filter(
            (r) =>
              Number.isFinite(r.BodyAxis) &&
              Number.isFinite(r.SweetAxis) &&
              r.JAN !== ""
          );
        setData(cleaned);
        localStorage.setItem("umapData", JSON.stringify(cleaned));
      })
      .catch((err) => {
        console.error("UMAP_PCA_coordinates.json の取得に失敗:", err);
      });
  }, []);

  // ===== 表示系の定数 =====
  const typeColorMap = {
    White: [150, 150, 150],
    Red: [150, 150, 150],
    Rose: [150, 150, 150],
    Sparkling: [150, 150, 150],
    Other: [150, 150, 150],
  };
  const ORANGE = [255, 140, 0];
  const gridInterval = 0.2;
  const cellSize = 0.2;
  const toViewY = (y) => (is3D ? y : -y);

  // ===== ヒートの見え方（オレンジ系） =====
  const HEAT_ALPHA_MIN = 96;
  const HEAT_ALPHA_MAX = 230;
  const HEAT_GAMMA = 0.8;
  const HEAT_CLIP_PCT = [0.05, 0.95];
  const MIN_COUNT_FOR_HEAT = 1;
  const COUNT_CLIP = 4;

  // オレンジ段階色（明→濃）
  const ORANGE_GRADIENT = [
    [255, 243, 224],
    [255, 204, 128],
    [255, 183, 77],
    [251, 140, 0],
    [239, 108, 0],
  ];
  const lerp = (a, b, t) => a + (b - a) * t;
  const sampleGradient = (stops, t) => {
    const n = stops.length - 1;
    const pos = t * n;
    const i = Math.floor(pos);
    const f = pos - i;
    const c0 = stops[i];
    const c1 = stops[Math.min(i + 1, n)];
    return [
      Math.round(lerp(c0[0], c1[0], f)),
      Math.round(lerp(c0[1], c1[1], f)),
      Math.round(lerp(c0[2], c1[2], f)),
    ];
  };

  // ===== グリッド線 =====
  const { thinLines, thickLines } = useMemo(() => {
    const thin = [];
    const thick = [];
    for (let i = -500; i <= 500; i++) {
      const x = i * gridInterval;
      const xLine = {
        sourcePosition: [x, -100, 0],
        targetPosition: [x, 100, 0],
      };
      if (i % 5 === 0) thick.push(xLine);
      else thin.push(xLine);

      const y = i * gridInterval;
      const yLine = {
        sourcePosition: [-100, y, 0],
        targetPosition: [100, y, 0],
      };
      if (i % 5 === 0) thick.push(yLine);
      else thin.push(yLine);
    }
    return { thinLines: thin, thickLines: thick };
  }, [gridInterval]);

  // ===== セル集計（点の存在/件数） =====
  const cells = useMemo(() => {
    const map = new Map();
    data.forEach((d) => {
      const x = Math.floor(d.BodyAxis / cellSize) * cellSize;
      const y = Math.floor(toViewY(d.SweetAxis) / cellSize) * cellSize;
      const key = `${x},${y}`;
      if (!map.has(key)) {
        map.set(key, { position: [x, y], count: 0, hasRating: false });
      }
      if (userRatings[d.JAN]) {
        map.get(key).hasRating = true;
      }
      map.get(key).count += 1;
    });
    return Array.from(map.values());
  }, [data, userRatings, is3D]);

  // ===== 2Dヒート: 平均PC値 → [position,color] 前計算 =====
  const { heatCells, heatKey } = useMemo(() => {
    if (is3D || !highlight2D) return { heatCells: [], heatKey: "empty" };

    const sumMap = new Map();
    const cntMap = new Map();

    for (const d of data) {
      const v = Number(d[highlight2D]); // PC1 or PC2
      if (!Number.isFinite(v)) continue;
      const x = Math.floor(d.BodyAxis / cellSize) * cellSize;
      const y = Math.floor(toViewY(d.SweetAxis) / cellSize) * cellSize;
      const key = `${x},${y}`;
      sumMap.set(key, (sumMap.get(key) || 0) + v);
      cntMap.set(key, (cntMap.get(key) || 0) + 1);
    }

    const samples = [];
    for (const [key, sum] of sumMap.entries()) {
      const count = cntMap.get(key) || 0;
      if (count < MIN_COUNT_FOR_HEAT) continue;
      const avg = sum / count;
      const [xs, ys] = key.split(",");
      samples.push({ position: [Number(xs), Number(ys)], avg, count });
    }
    if (samples.length === 0) return { heatCells: [], heatKey: "none" };

    // クリップして正規化
    const vals = samples.map((s) => s.avg).sort((a, b) => a - b);
    const loIdx = Math.floor(HEAT_CLIP_PCT[0] * (vals.length - 1));
    const hiIdx = Math.floor(HEAT_CLIP_PCT[1] * (vals.length - 1));
    const lo = vals[loIdx];
    const hi = vals[hiIdx];
    const den = Math.max(1e-9, hi - lo);

    const heat = samples.map((s) => {
      let t = (s.avg - lo) / den;
      t = Math.max(0, Math.min(1, Math.pow(t, HEAT_GAMMA)));
      const [r, g, b] = sampleGradient(ORANGE_GRADIENT, t);
      const conf = Math.min(1, s.count / COUNT_CLIP);
      const a = Math.round(
        (HEAT_ALPHA_MIN + (HEAT_ALPHA_MAX - HEAT_ALPHA_MIN) * t) *
          (0.6 + 0.4 * conf)
      );
      return { position: s.position, color: [r, g, b, a] };
    });

    const key = `${heat.length}|${lo.toFixed(3)}|${hi.toFixed(
      3
    )}|${highlight2D}`;
    return { heatCells: heat, heatKey: key };
  }, [data, highlight2D, is3D, cellSize]);

  // ===== 商品ドロワー =====
  const openProductDrawer = (jan) => {
    setSelectedJAN(jan);
    setProductDrawerOpen(true);
  };

  // ===== 最近傍検索 =====
  const findNearestWine = (coord /* [x,y] */) => {
    if (!Array.isArray(coord) || coord.length < 2 || data.length === 0)
      return null;
    const [cx, cy] = coord;
    let best = null;
    let bestD2 = Infinity;
    for (const d of data) {
      const x = d.BodyAxis;
      const y = toViewY(d.SweetAxis);
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = d;
      }
    }
    return best;
  };

  // ===== メインレイヤ（2D/3D） =====
  const mainLayer = useMemo(() => {
    if (is3D) {
      return new ColumnLayer({
        id: `columns-${zMetric}`,
        data,
        diskResolution: 12,
        radius: 0.03,
        extruded: true,
        elevationScale: 2,
        getPosition: (d) => [d.BodyAxis, d.SweetAxis],
        getElevation: (d) => (zMetric ? Number(d[zMetric]) || 0 : 0),
        getFillColor: (d) =>
          String(d.JAN) === String(selectedJAN)
            ? ORANGE
            : typeColorMap[d.Type] || typeColorMap.Other,
        updateTriggers: { getFillColor: [selectedJAN] },
        pickable: true,
        onClick: null,
      });
    } else {
      return new ScatterplotLayer({
        id: "scatter",
        data,
        getPosition: (d) => [d.BodyAxis, toViewY(d.SweetAxis), 0],
        getFillColor: (d) =>
          String(d.JAN) === String(selectedJAN)
            ? ORANGE
            : typeColorMap[d.Type] || typeColorMap.Other,
        updateTriggers: { getFillColor: [selectedJAN] },
        radiusUnits: "meters",
        getRadius: 0.03,
        pickable: true,
        onClick: null,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      });
    }
  }, [data, is3D, zMetric, selectedJAN]);

  // ===== 評価サークル（◎） =====
  const ratingCircleLayers = useMemo(() => {
    const lineColor = [255, 0, 0, 255];
    return Object.entries(userRatings).flatMap(([jan, ratingObj]) => {
      const item = data.find((d) => String(d.JAN) === String(jan));
      if (!item || item.BodyAxis == null || item.SweetAxis == null) return [];
      const count = Math.min(ratingObj.rating, 5);
      const radiusBase = 0.1;

      return Array.from({ length: count }).map((_, i) => {
        const angleSteps = 40;
        const path = Array.from({ length: angleSteps }, (_, j) => {
          const angle = (j / angleSteps) * 2 * Math.PI;
          const radius = radiusBase * (i + 1);
          const x = item.BodyAxis + Math.cos(angle) * radius;
          const y = toViewY(-toViewY(item.SweetAxis)) + Math.sin(angle) * radius; // = is3D?item.SweetAxis:-item.SweetAxis
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
  }, [data, userRatings, is3D]);

  // ===== 評価日番号ラベル =====
  const sortedRatedWineList = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return Object.entries(userRatings)
      .filter(([_, rating]) => rating.rating != null)
      .map(([jan, rating]) => {
        const matched = data.find((d) => String(d.JAN) === String(jan));
        if (!matched) return null;
        return { ...matched, date: rating.date, rating: rating.rating };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [userRatings, data]);

  const displayIndexMap = useMemo(() => {
    const map = {};
    const total = sortedRatedWineList.length;
    sortedRatedWineList.forEach((item, idx) => {
      map[item.JAN] = total - idx;
    });
    return map;
  }, [sortedRatedWineList]);

  const ratingDateLayer =
    showRatingDates && sortedRatedWineList.length > 0
      ? new TextLayer({
          id: "rating-index-labels",
          data: sortedRatedWineList.map((item) => {
            const y = is3D ? item.SweetAxis : -item.SweetAxis;
            const z = is3D ? (Number(item[zMetric]) || 0) + 0.1 : 0;
            return {
              position: [item.BodyAxis, y, z],
              text: String(displayIndexMap[item.JAN] ?? "?"),
            };
          }),
          getPosition: (d) => d.position,
          getText: (d) => d.text,
          getSize: 0.4,
          sizeUnits: "meters",
          sizeMinPixels: 12,
          sizeMaxPixels: 64,
          billboard: true,
          getColor: [50, 50, 50, 200],
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
          characterSet: "0123456789",
          parameters: { depthTest: false },
        })
      : null;

  // ===== スライダーマーク =====
  const sliderMarkLayer = sliderMarkCoords
    ? new ScatterplotLayer({
        id: "slider-mark",
        data: [sliderMarkCoords],
        getPosition: (d) => {
          const a = Array.isArray(d) ? d : [0, 0];
          return [a[0] ?? 0, is3D ? (a[1] ?? 0) : -(a[1] ?? 0), 0];
        },
        getFillColor: [255, 0, 0, 180],
        getRadius: 0.25,
        radiusUnits: "meters",
        pickable: false,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      })
    : null;

  // ===== JSX =====
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        margin: 0,
        padding: 0,
        width: "100%",
        height: "100%",
      }}
    >
      <DeckGL
        views={
          is3D
            ? new OrbitView({ near: 0.1, far: 1000 })
            : new OrthographicView({ near: -1, far: 1 })
        }
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => {
          setViewState((prev) => {
            // DeckGL が欠落させることがある target/zoom を安全に補う
            const merged = mergeViewStateSafe(vs, prev);
            const t = merged.target;
            const limitedTarget = [
              Math.max(-15, Math.min(15, t[0] ?? 0)),
              Math.max(-15, Math.min(15, t[1] ?? 0)),
              t[2] ?? 0,
            ];
            return { ...merged, target: limitedTarget };
          });
        }}
        controller={{
          dragPan: true,
          dragRotate: is3D,
          minRotationX: 5,
          maxRotationX: 90,
          minZoom: 4.0,
          maxZoom: ZOOM_LIMITS.maxZoom,
        }}
        onClick={(info) => {
          const picked = info && info.object;
          if (picked && picked.JAN) {
            openProductDrawer(picked.JAN);
            return;
          }
          const coord = Array.isArray(info && info.coordinate)
            ? info.coordinate
            : null;
          if (!coord) return; // 座標が無いケースを防御
          const nearest = findNearestWine(coord);
          if (nearest && nearest.JAN) openProductDrawer(nearest.JAN);
        }}
        pickingRadius={8}
        layers={
          [
            ...ratingCircleLayers,

            // ① ベースのグレー層
            !is3D &&
              !highlight2D &&
              new GridCellLayer({
                id: "grid-cells-base",
                data: cells,
                cellSize,
                getPosition: (d) =>
                  Array.isArray(d?.position) ? d.position : [0, 0],
                getFillColor: (d) =>
                  d.hasRating ? [180, 100, 50, 150] : [200, 200, 200, 40],
                getElevation: 0,
                pickable: false,
                coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
              }),

            // ② 平均PC値ヒート（2D & プルダウン選択時のみ）
            !is3D &&
              highlight2D &&
              new GridCellLayer({
                id: `grid-cells-heat-${highlight2D}-${heatKey}`,
                data: heatCells, // {position, color}
                cellSize,
                getPosition: (d) =>
                  Array.isArray(d?.position) ? d.position : [0, 0],
                getFillColor: (d) => d.color || [0, 0, 0, 0],
                pickable: false,
                parameters: { depthTest: false, blend: true },
                updateTriggers: { getFillColor: [heatKey] },
                coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
              }),

            // ④ グリッド線
            new LineLayer({
              id: "grid-lines-thin",
              data: thinLines,
              getSourcePosition: (d) => d.sourcePosition,
              getTargetPosition: (d) => d.targetPosition,
              getColor: [200, 200, 200, 100],
              getWidth: 1,
              widthUnits: "pixels",
              pickable: false,
            }),
            new LineLayer({
              id: "grid-lines-thick",
              data: thickLines,
              getSourcePosition: (d) => d.sourcePosition,
              getTargetPosition: (d) => d.targetPosition,
              getColor: [180, 180, 180, 120],
              getWidth: 1.25,
              widthUnits: "pixels",
              pickable: false,
            }),

            // ⑤ 打点・その他
            mainLayer,
            sliderMarkLayer,
            ratingDateLayer,
          ].filter(Boolean) // ← null を除去して安全に
        }
      />

      {is3D && (
        <select
          value={zMetric}
          onChange={(e) => setZMetric(e.target.value)}
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            zIndex: 1,
            padding: "6px",
            fontSize: "14px",
          }}
        >
          <option value="">ー</option>
          <option value="PC2">甘味</option>
          <option value="PC1">ボディ</option>
        </select>
      )}

      {!is3D && (
        <select
          value={highlight2D}
          onChange={(e) => setHighlight2D(e.target.value)}
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            zIndex: 1,
            padding: "6px",
            fontSize: "14px",
          }}
        >
          <option value="">ー</option>
          <option value="PC2">甘味</option>
          <option value="PC1">ボディ</option>
        </select>
      )}

      <button
        onClick={() => {
          const nextIs3D = !is3D;
          setIs3D(nextIs3D);
          if (nextIs3D) {
            setSaved2DViewState(viewState);
            setViewState((prev) =>
              mergeViewStateSafe(
                {
                  target: asArr3(prev?.target),
                  zoom: Number.isFinite(prev?.zoom) ? prev.zoom : 5,
                  rotationX: 45,
                  rotationOrbit: 0,
                  ...ZOOM_LIMITS,
                },
                prev
              )
            );
          } else {
            const base =
              saved2DViewState ?? { target: [0, 0, 0], zoom: 5, ...ZOOM_LIMITS };
            setViewState((prev) =>
              mergeViewStateSafe(
                { ...base, rotationX: 0, rotationOrbit: 0, ...ZOOM_LIMITS },
                prev
              )
            );
          }
        }}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: 1,
          padding: "8px 12px",
          fontSize: "14px",
          background: "#fff",
          border: "1px solid #ccc",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        {is3D ? "2D" : "3D"}
      </button>

      {!is3D && (
        <button
          onClick={() => {
            setSweetness(50);
            setBody(50);
            setIsSliderOpen(true);
          }}
          style={{
            position: "absolute",
            top: "70px",
            right: "10px",
            zIndex: 1,
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: "#eee",
            border: "1px solid #ccc",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            fontSize: "20px",
          }}
        >
          ●
        </button>
      )}

      {!is3D && (
        <button
          onClick={() => {
            const next = !showRatingDates;
            setShowRatingDates(next);
            setIsRatingListOpen(next);
          }}
          style={{
            position: "absolute",
            top: "120px",
            right: "10px",
            zIndex: 1,
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: "#eee",
            border: "1px solid #ccc",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            fontSize: "20px",
          }}
        >
          ★
        </button>
      )}

      <button
        onClick={() => setIsSettingsOpen(true)}
        style={{
          position: "absolute",
          bottom: "40px",
          left: "20px",
          zIndex: 1,
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: "#eee",
          border: "1px solid #ccc",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
          fontSize: "18px",
        }}
      >
        ⚙
      </button>

      {/* 嗜好スライダー */}
      <Drawer
        anchor="bottom"
        open={isSliderOpen}
        onClose={() => setIsSliderOpen(false)}
        PaperProps={{
          style: {
            width: "100%",
            height: "800px",
            padding: "24px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            alignItems: "stretch",
            fontFamily: "sans-serif",
          },
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => setIsSliderOpen(false)}
            style={{
              background: "#eee",
              border: "1px solid #ccc",
              padding: "6px 10px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        </div>

        <h2 style={{ textAlign: "center", fontSize: "20px", marginBottom: "24px" }}>
          基準のワインを飲んだ印象は？
        </h2>

        {/* 甘味スライダー */}
        <div style={{ marginBottom: "32px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "14px",
              fontWeight: "bold",
              marginBottom: "6px",
            }}
          >
            <span>← こんなに甘みは不要</span>
            <span>もっと甘みが欲しい →</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={sweetness}
            onChange={(e) => setSweetness(Number(e.target.value))}
            style={{
              width: "100%",
              appearance: "none",
              height: "10px",
              borderRadius: "5px",
              background: `linear-gradient(to right, #007bff ${sweetness}%, #ddd ${sweetness}%)`,
              outline: "none",
              marginTop: "8px",
              WebkitAppearance: "none",
            }}
          />
        </div>

        {/* コクスライダー */}
        <div style={{ marginBottom: "32px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "14px",
              fontWeight: "bold",
              marginBottom: "6px",
            }}
          >
            <span>← もっと軽やかが良い</span>
            <span>濃厚なコクが欲しい →</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={body}
            onChange={(e) => setBody(Number(e.target.value))}
            style={{
              width: "100%",
              appearance: "none",
              height: "10px",
              borderRadius: "5px",
              background: `linear-gradient(to right, #007bff ${body}%, #ddd ${body}%)`,
              outline: "none",
              marginTop: "8px",
              WebkitAppearance: "none",
            }}
          />
        </div>

        {/* 地図生成ボタン */}
        <button
          onClick={() => {
            const blendF = data.find((d) => d.JAN === "blendF");
            if (!blendF) return;

            const sweetValues = data.map((d) => d.SweetAxis);
            const bodyValues = data.map((d) => d.BodyAxis);
            const minSweet = Math.min(...sweetValues);
            const maxSweet = Math.max(...sweetValues);
            const minBody = Math.min(...bodyValues);
            const maxBody = Math.max(...bodyValues);

            const sweetValue =
              sweetness <= 50
                ? blendF.SweetAxis -
                  ((50 - sweetness) / 50) * (blendF.SweetAxis - minSweet)
                : blendF.SweetAxis +
                  ((sweetness - 50) / 50) * (maxSweet - blendF.SweetAxis);

            const bodyValue =
              body <= 50
                ? blendF.BodyAxis -
                  ((50 - body) / 50) * (blendF.BodyAxis - minBody)
                : blendF.BodyAxis +
                  ((body - 50) / 50) * (maxBody - blendF.BodyAxis);

            const coords = [bodyValue, -sweetValue];
            setSliderMarkCoords(coords);
            setIsSliderOpen(false);
            setViewState((prev) =>
              mergeViewStateSafe(
                {
                  ...prev,
                  target: [coords[0] ?? 0, (coords[1] ?? 0) + 5.5, 0],
                  zoom: 4.5,
                  ...ZOOM_LIMITS,
                },
                prev
              )
            );
          }}
          style={{
            background: "#fff",
            color: "#007bff",
            padding: "14px 30px",
            fontSize: "16px",
            fontWeight: "bold",
            border: "2px solid #007bff",
            borderRadius: "6px",
            cursor: "pointer",
            display: "block",
            margin: "0 auto",
          }}
        >
          あなたの好みをMapに表示
        </button>
      </Drawer>

      {/* 設定ドロワー */}
      <Drawer
        anchor="left"
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        PaperProps={{
          style: { width: "300px", padding: "20px", boxSizing: "border-box" },
        }}
      >
        <h3 style={{ marginTop: 0 }}>ユーザー設定</h3>
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => alert("ニックネーム変更画面へ")}
            style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
          >
            ニックネーム変更
          </button>
          <button
            onClick={() => alert("パスワード変更画面へ")}
            style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
          >
            パスワード変更
          </button>
          <button
            onClick={() => alert("お気に入り店舗設定へ")}
            style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
          >
            お気に入り店舗管理
          </button>
          <button
            onClick={() => alert("利用規約を表示")}
            style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
          >
            利用規約・プライバシーポリシー
          </button>
          <button
            onClick={() => alert("アプリの使い方説明を表示")}
            style={{ width: "100%", padding: "10px" }}
          >
            アプリの使い方
          </button>
        </div>
        <button
          onClick={() => setIsSettingsOpen(false)}
          style={{
            background: "#eee",
            border: "1px solid #ccc",
            padding: "6px 10px",
            borderRadius: "4px",
            cursor: "pointer",
            width: "100%",
          }}
        >
          閉じる
        </button>
      </Drawer>

      {/* ★ 評価一覧パネル */}
      <RatedWinePanel
        isOpen={isRatingListOpen}
        onClose={() => {
          setIsRatingListOpen(false);
          setShowRatingDates(false);
        }}
        userRatings={userRatings}
        data={data}
        sortedRatedWineList={sortedRatedWineList ?? []}
      />

      {/* 商品ページドロワー */}
      <Drawer
        anchor="bottom"
        open={productDrawerOpen}
        onClose={() => setProductDrawerOpen(false)}
        PaperProps={{
          style: {
            width: "100%",
            height: "100vh",
            borderTopLeftRadius: "12px",
            borderTopRightRadius: "12px",
            overflow: "hidden",
          },
        }}
      >
        <div
          style={{
            height: "48px",
            padding: "8px 12px",
            borderBottom: "1px solid #eee",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f9f9f9",
          }}
        >
          <div style={{ fontWeight: 600 }}>商品ページ</div>
          <button
            onClick={() => setProductDrawerOpen(false)}
            style={{
              background: "#eee",
              border: "1px solid #ccc",
              padding: "6px 10px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        </div>
        {selectedJAN ? (
          <iframe
            title={`product-${selectedJAN}`}
            src={`/products/${selectedJAN}`}
            style={{ border: "none", width: "100%", height: "calc(100vh - 48px)" }}
          />
        ) : (
          <div style={{ padding: 16 }}>商品を選択してください。</div>
        )}
      </Drawer>
    </div>
  );
} // App end

// ========= RatedWinePanel =========
function RatedWinePanel({
  isOpen,
  onClose,
  userRatings,
  data,
  sortedRatedWineList,
}) {
  const displayList = useMemo(() => {
    if (!Array.isArray(sortedRatedWineList)) return [];
    const total = sortedRatedWineList.length;
    return sortedRatedWineList.map((item, idx) => ({
      ...item,
      displayIndex: total - idx,
    }));
  }, [sortedRatedWineList]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "500px",
            backgroundColor: "#fff",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.2)",
            zIndex: 1000,
            borderTopLeftRadius: "12px",
            borderTopRightRadius: "12px",
            display: "flex",
            flexDirection: "column",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #ddd",
              background: "#f9f9f9",
              flexShrink: 0,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0 }}>あなたが評価したワイン</h3>
            <button
              onClick={onClose}
              style={{
                background: "#eee",
                border: "1px solid #ccc",
                padding: "6px 10px",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              閉じる
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
              backgroundColor: "#fff",
            }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {displayList.map((item, idx) => (
                <li
                  key={idx}
                  onClick={() => window.open(`/products/${item.JAN}`, "_blank")}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid #eee",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <strong
                      style={{
                        display: "inline-block",
                        color: "rgb(50, 50, 50)",
                        fontSize: "16px",
                        fontWeight: "bold",
                        marginRight: "4px",
                        fontFamily: '"Helvetica Neue", Arial, sans-serif',
                      }}
                    >
                      {item.displayIndex}.
                    </strong>
                    <span style={{ fontSize: "15px", color: "#555" }}>
                      {item.date
                        ? new Date(item.date).toLocaleDateString()
                        : "（日付不明）"}
                    </span>
                    <br />
                    {item.商品名 || "（名称不明）"}
                  </div>
                  <small>
                    Type: {item.Type || "不明"} / 価格:{" "}
                    {item.希望小売価格
                      ? `¥${item.希望小売価格.toLocaleString()}`
                      : "不明"}
                    <br />
                    Body: {item.BodyAxis?.toFixed(2)}, Sweet:{" "}
                    {item.SweetAxis?.toFixed(2)} / 星評価: {item.rating ?? "なし"}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
