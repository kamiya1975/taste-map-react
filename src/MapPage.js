import React, { useEffect, useState, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { OrbitView, OrthographicView } from "@deck.gl/core";
import { ScatterplotLayer, ColumnLayer, LineLayer, TextLayer, GridCellLayer, PathLayer } from "@deck.gl/layers";
import Drawer from "@mui/material/Drawer";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import CircleRatingDisplay from "./components/CircleRatingDisplay";

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

  // 商品ドロワーと選択中JAN（選択中はオレンジ表示）
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedJAN, setSelectedJAN] = useState(null);

  const ZOOM_LIMITS = { minZoom: 4.0, maxZoom: 10.0 };

  useEffect(() => {
    if (location.state?.autoOpenSlider) {
      setIsSliderOpen(true);
    }
  }, [location.state]);

  // userRatings を常時同期
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

  // UMAP+PCA を読み込み（UMAP1→BodyAxis, UMAP2→SweetAxis）
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
              BodyAxis: Number(r.UMAP1),   // x軸
              SweetAxis: Number(r.UMAP2),  // y軸
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

  useEffect(() => {
    localStorage.setItem("userRatings", JSON.stringify(userRatings));
  }, [userRatings]);

  const typeColorMap = {
    White: [150, 150, 150],//[0, 120, 255],
    Red: [150, 150, 150],//[255, 0, 0],
    Rose: [150, 150, 150],//[255, 102, 204],
    Sparkling: [150, 150, 150],//[255, 255, 0],
    Other: [150, 150, 150],//[150, 150, 150],
  };
  const ORANGE = [255, 140, 0];

  const gridInterval = 0.2;
  const cellSize = 0.2;

  // グリッド線
  const { thinLines, thickLines } = useMemo(() => {
    const thin = [];
    const thick = [];
    for (let i = -500; i <= 500; i++) {
      const x = i * gridInterval;
      const xLine = { sourcePosition: [x, -100, 0], targetPosition: [x, 100, 0] };
      if (i % 5 === 0) thick.push(xLine); else thin.push(xLine);

      const y = i * gridInterval;
      const yLine = { sourcePosition: [-100, y, 0], targetPosition: [100, y, 0] };
      if (i % 5 === 0) thick.push(yLine); else thin.push(yLine);
    }
    return { thinLines: thin, thickLines: thick };
  }, [gridInterval]);

  // ヒートブロック
  const cells = useMemo(() => {
    const map = new Map();
    data.forEach((d) => {
      const x = Math.floor(d.BodyAxis / cellSize) * cellSize;
      const y = Math.floor((is3D ? d.SweetAxis : -d.SweetAxis) / cellSize) * cellSize;
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

  // ★ 追加：セル内件数の最大値（濃淡の正規化に使用）
  const p90CellCount = useMemo(() => {
    const arr = (cells || [])
      .map(c => c.count || 0)
      .sort((a,b)=>a-b);
    if (arr.length === 0) return 1;
    const idx = Math.floor(0.9 * (arr.length - 1));
    return Math.max(1, arr[idx]);
  }, [cells]);

  // 2D: PC1/PC2 の上位10%を含むブロックを計算（セルキーの Set）
  const top10CellKeys = useMemo(() => {
    if (is3D || !highlight2D) return new Set();
    const vals = data
      .map((d) => Number(d[highlight2D]))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    if (vals.length === 0) return new Set();
    const idxHi = Math.floor(0.9 * (vals.length - 1)); // 上位10%しきい値
    const idx = Math.floor(0.9 * (vals.length - 1)); // 上位10%しきい値（p90）
    const thr = vals[idx];
    const set = new Set();
    for (const d of data) {
      const v = Number(d[highlight2D]);
      if (!Number.isFinite(v) || v < thr) continue;
      const x = Math.floor(d.BodyAxis / cellSize) * cellSize;
      const y = Math.floor((-d.SweetAxis) / cellSize) * cellSize; // 2DはY反転
      set.add(`${x},${y}`);
    }
    return set;
  }, [data, highlight2D, is3D, cellSize]);

  // 上位10%セルだけの p90 を計算（濃淡の正規化用）
  const p90Top10Count = useMemo(() => {
    if (!top10CellKeys.size) return 1;
    const list = cells
      .filter(c => top10CellKeys.has(`${c.position[0]},${c.position[1]}`))
      .map(c => c.count || 0)
      .sort((a,b)=>a-b);
    if (list.length === 0) return 1;
    const idx = Math.floor(0.9 * (list.length - 1));
    return Math.max(1, list[idx]);
  }, [cells, top10CellKeys]);

  // updateTriggers 安定化用（Setは参照比較になるため）
  const top10Signature = useMemo(
    () => Array.from(top10CellKeys).sort().join("|"),
    [top10CellKeys]
  );

  // ハイライト用セルの配列（GridCellLayer に渡す形）
  const highlightCells = useMemo(() => {
    if (!top10CellKeys.size) return [];
    return Array.from(top10CellKeys).map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { position: [x, y] };
    });
  }, [top10CellKeys]);

  // 商品ドロワーを開く
  const openProductDrawer = (jan) => {
    setSelectedJAN(jan);           // 選択中 → オレンジ化
    setProductDrawerOpen(true);
  };

  // クリック位置（マップ座標）から最近傍ワインを検索
  const findNearestWine = (coord /* [x,y] */) => {
    if (!coord || !Array.isArray(data) || data.length === 0) return null;
    const [cx, cy] = coord;
    let best = null;
    let bestD2 = Infinity;
    for (const d of data) {
      const x = d.BodyAxis;
      const y = is3D ? d.SweetAxis : -d.SweetAxis; // 表示系に合わせる
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

  // メインレイヤ（2D/3D）
  const mainLayer = useMemo(() => {
    if (is3D) {
      return new ColumnLayer({
        id: `columns-${zMetric}`,
        data,
        diskResolution: 12,
        radius: 0.03,//打点の調整
        extruded: true,
        elevationScale: 2,
        getPosition: (d) => [d.BodyAxis, d.SweetAxis],
        getElevation: (d) => (zMetric ? Number(d[zMetric]) || 0 : 0),
        getFillColor: (d) =>
          String(d.JAN) === String(selectedJAN)
            ? ORANGE
            : (typeColorMap[d.Type] || typeColorMap.Other),
        updateTriggers: {
          getFillColor: [selectedJAN],   // 念のため3D側も
        },
        pickable: true,
        onClick: null, // クリック処理は DeckGL 側で一元化
      });
    } else {
      return new ScatterplotLayer({
        id: "scatter",
        data,
        getPosition: (d) => [d.BodyAxis, -d.SweetAxis, 0],
        getFillColor: (d) =>
          String(d.JAN) === String(selectedJAN)
            ? ORANGE
            : (typeColorMap[d.Type] || typeColorMap.Other),
        updateTriggers: {
          getFillColor: [selectedJAN],
        },
        radiusUnits: "meters",
        getRadius: 0.03,
        pickable: true,
        onClick: null, // クリック処理は DeckGL 側で一元化
      });
    }
  }, [data, is3D, zMetric, selectedJAN]);

  // 評価サークル（◎）
  const ratingCircleLayers = useMemo(() => {
    const lineColor = [255, 0, 0, 255];
    return Object.entries(userRatings).flatMap(([jan, ratingObj]) => {
      const item = data.find((d) => String(d.JAN) === String(jan));
      if (!item || !item.BodyAxis || !item.SweetAxis) return [];
      const count = Math.min(ratingObj.rating, 5);
      const radiusBase = 0.10;

      return Array.from({ length: count }).map((_, i) => {
        const angleSteps = 40;
        const path = Array.from({ length: angleSteps }, (_, j) => {
          const angle = (j / angleSteps) * 2 * Math.PI;
          const radius = radiusBase * (i + 1);
          const x = item.BodyAxis + Math.cos(angle) * radius;
          const y = (is3D ? item.SweetAxis : -item.SweetAxis) + Math.sin(angle) * radius;
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

  // 評価日番号ラベル（★トグル）
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

  // スライダーで打点表示
  const sliderMarkLayer = sliderMarkCoords
    ? new ScatterplotLayer({
        id: "slider-mark",
        data: [sliderMarkCoords],
        getPosition: (d) => [d[0], is3D ? d[1] : -d[1], 0],
        getFillColor: [255, 0, 0, 180],
        getRadius: 0.25,
        radiusUnits: "meters",
        pickable: false,
      })
    : null;

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
          const limitedTarget = [
            Math.max(-15, Math.min(15, vs.target[0])),
            Math.max(-15, Math.min(15, vs.target[1])),
            vs.target[2],
          ];
          setViewState({ ...vs, target: limitedTarget });
        }}
        controller={{
          dragPan: true,
          dragRotate: true,
          minRotationX: 5,
          maxRotationX: 90,
          minZoom: 4.0,
          maxZoom: ZOOM_LIMITS.maxZoom,
        }}
        // 画面のどこをタップしても、その位置に最も近い打点の詳細を開く
          onClick={(info) => {
            const picked = info?.object;
            if (picked?.JAN) {
              openProductDrawer(picked.JAN);
              return;
            }
            const coord = info?.coordinate; // [x, y]（表示系と同じ座標系）
            const nearest = findNearestWine(coord);
            if (nearest?.JAN) openProductDrawer(nearest.JAN);
        }}
        // ピクセル半径を広げて保険のPicking（最近傍探索は別途実施）
        pickingRadius={8}
        layers={[
        ...ratingCircleLayers,

        // ① ベースのグレー層（常時）
        new GridCellLayer({
          id: "grid-cells-base",
          data: cells,
          cellSize,
          getPosition: (d) => d.position,
          getFillColor: (d) =>
            d.hasRating ? [180, 100, 50, 150] : [200, 200, 200, 40],
          getElevation: 0,
          pickable: false,
        }),

        // ② 上位10%だけを塗るヒート（2D & プルダウン選択時のみ）
        (!is3D && highlight2D) ? new GridCellLayer({
          id: "grid-cells-heat",
          data: cells,
          cellSize,
          getPosition: (d) => d.position,
          getFillColor: (d) => {
            const key = `${d.position[0]},${d.position[1]}`;
            // ← 上位10%以外は完全透明にしてベースだけ見せる
            if (!top10CellKeys.has(key)) return [0, 0, 0, 0];

            const c = d.count || 0;
            // 1件を最薄、p90(上位セル内)で頭打ち
            const denom = Math.max(2, p90Top10Count);
            const tRaw = Math.min(1, (c - 1) / (denom - 1));
            const t = Math.pow(tRaw, 0.6);   // 濃淡カーブ（0.5〜0.6で調整）

            // ほぼ白 → 明るいオレンジの間で補間（下のグレーを活かす）
            const low  = [255, 255, 255];
            const high = [255, 90,   0];
            const r = Math.round(low[0] + (high[0] - low[0]) * t);
            const g = Math.round(low[1] + (high[1] - low[1]) * t);
            const b = Math.round(low[2] + (high[2] - low[2]) * t);
            const a = Math.round(0 + 300 * t); // α控えめ

            return [r, g, b, a];
          },
          getElevation: 0,
          pickable: false,
          parameters: { depthTest: false },
          updateTriggers: { getFillColor: [p90Top10Count, top10Signature] },
        }) : null,

        // ③ 上位10%ブロック
       //(!is3D && highlightCells.length > 0) ? new GridCellLayer({
          //id: "grid-cells-top10",
          //data: highlightCells,
          //cellSize,
          //getPosition: (d) => d.position,
          //getFillColor: [255, 140, 0, 200],
          //getElevation: 0,
          //pickable: false,
          //parameters: { depthTest: false },
        //}) : null,

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
      ]}
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

      {/* 2D: 上位10%ハイライトのプルダウン（左上） */}
      {!is3D && (
        <select
          value={highlight2D}
          onChange={(e) => setHighlight2D(e.target.value)}
          style={{ position: "absolute", top: "10px", left: "10px", zIndex: 1, padding: "6px", fontSize: "14px" }}
        >
          <option value="">ー</option>
          <option value="PC1">甘味（上位10%）</option>
          <option value="PC2">ボディ（上位10%）</option>
        </select>
      )}

      <button
        onClick={() => {
          const nextIs3D = !is3D;
          setIs3D(nextIs3D);
          if (nextIs3D) {
            setSaved2DViewState(viewState);
            setViewState({
              target: [viewState.target[0], viewState.target[1], 0],
              zoom: viewState.zoom,
              rotationX: 45,
              rotationOrbit: 0,
              ...ZOOM_LIMITS,
            });
          } else {
            setViewState({
              ...saved2DViewState,
              rotationX: undefined,
              rotationOrbit: undefined,
              ...ZOOM_LIMITS,
            });
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

      {/* 2Dモード時の丸ボタン（スライダー表示） */}
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

      {/* 評価切替 ★ボタン（番号ラベルの表示ON/OFF） */}
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

      {/* 設定（⚙） */}
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
                ? blendF.SweetAxis - ((50 - sweetness) / 50) * (blendF.SweetAxis - minSweet)
                : blendF.SweetAxis + ((sweetness - 50) / 50) * (maxSweet - blendF.SweetAxis);

            const bodyValue =
              body <= 50
                ? blendF.BodyAxis - ((50 - body) / 50) * (blendF.BodyAxis - minBody)
                : blendF.BodyAxis + ((body - 50) / 50) * (maxBody - blendF.BodyAxis);

            const coords = [bodyValue, -sweetValue];
            setSliderMarkCoords(coords);
            setIsSliderOpen(false);
            setViewState((prev) => ({
              ...prev,
              target: [coords[0], coords[1] + 5.5, 0],
              zoom: 4.5,
              ...ZOOM_LIMITS,
            }));
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
          <button onClick={() => alert("ニックネーム変更画面へ")} style={{ width: "100%", padding: "10px", marginBottom: "10px" }}>
            ニックネーム変更
          </button>
          <button onClick={() => alert("パスワード変更画面へ")} style={{ width: "100%", padding: "10px", marginBottom: "10px" }}>
            パスワード変更
          </button>
          <button onClick={() => alert("お気に入り店舗設定へ")} style={{ width: "100%", padding: "10px", marginBottom: "10px" }}>
            お気に入り店舗管理
          </button>
          <button onClick={() => alert("利用規約を表示")} style={{ width: "100%", padding: "10px", marginBottom: "10px" }}>
            利用規約・プライバシーポリシー
          </button>
          <button onClick={() => alert("アプリの使い方説明を表示")} style={{ width: "100%", padding: "10px" }}>
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

      {/* 商品ページドロワー（/products/:JAN） */}
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

function RatedWinePanel({ isOpen, onClose, userRatings, data, sortedRatedWineList }) {
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
                      {item.date ? new Date(item.date).toLocaleDateString() : "（日付不明）"}
                    </span>
                    <br />
                    {item.商品名 || "（名称不明）"}
                  </div>
                  <small>
                    Type: {item.Type || "不明"} / 価格:{" "}
                    {item.希望小売価格 ? `¥${item.希望小売価格.toLocaleString()}` : "不明"}
                    <br />
                    Body: {item.BodyAxis?.toFixed(2)}, Sweet: {item.SweetAxis?.toFixed(2)} / 星評価:{" "}
                    {item.rating ?? "なし"}
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
