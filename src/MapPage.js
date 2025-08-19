import React, { useEffect, useState, useMemo, useRef } from "react";
import DeckGL from "@deck.gl/react";
import { OrbitView, OrthographicView } from "@deck.gl/core";
import {ScatterplotLayer,ColumnLayer,LineLayer,TextLayer,GridCellLayer,IconLayer,} from "@deck.gl/layers";
import Drawer from "@mui/material/Drawer";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PathLayer } from "@deck.gl/layers";
import CircleRatingDisplay from "./components/CircleRatingDisplay";

function App() {
  const location = useLocation();
  const [data, setData] = useState([]);
  const [is3D, setIs3D] = useState(false);
  const [viewState, setViewState] = useState({target: [0, 0, 0],rotationX: 0,rotationOrbit: 0,zoom: 5,minZoom: 4.0,maxZoom: 10.0,});
  const [saved2DViewState, setSaved2DViewState] = useState(null);
  const [userPinCoords, setUserPinCoords] = useState(null);
  const [nearestPoints, setNearestPoints] = useState([]);
  const [zMetric, setZMetric] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [userRatings, setUserRatings] = useState({});
  const [productWindow, setProductWindow] = useState(null);
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);
  const drawerContentRef = useRef(null);
  const [hasConfirmedSlider, setHasConfirmedSlider] = useState(false);
  const [sliderMarkCoords, setSliderMarkCoords] = useState(null);
  const [showRatingDates, setShowRatingDates] = useState(false);
  const [isRatingListOpen, setIsRatingListOpen] = useState(false);
  const ZOOM_LIMITS = { minZoom: 4.0, maxZoom: 10.0 };
  const nearestPanelRef = useRef(null);

  useEffect(() => {
    if (location.state?.autoOpenSlider) {
      setIsSliderOpen(true);
    }
  }, [location.state]);

  useEffect(() => {
  if (isDrawerOpen) {
    const savedRatings = localStorage.getItem("userRatings");
    if (savedRatings) {
      try {
        setUserRatings(JSON.parse(savedRatings));
      } catch (e) {
        console.error("Failed to parse userRatings:", e);
      }
    }
  }
}, [isDrawerOpen]);

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

  // 初回実行
  syncUserRatings();

  // イベント登録
  window.addEventListener("focus", syncUserRatings);
  window.addEventListener("storage", syncUserRatings);

  // クリーンアップ
  return () => {
    window.removeEventListener("focus", syncUserRatings);
    window.removeEventListener("storage", syncUserRatings);
  };
}, []);

  // UMAP+PCAを1ファイルから読み込み（PC1→BodyAxis、PC2→SweetAxis に正規化）
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
          // 数値化のユーティリティ
          const toNum = (v) => (v === "" || v == null ? NaN : Number(v));

          return {
            // 既存コードが参照する共通キーに合わせる
            JAN: String(r.JAN ?? ""),
            Type: r.Type ?? "Other",

            // 2Dマップの軸を UMAP にする
            BodyAxis: Number(r.UMAP1),   // ← x軸
            SweetAxis: Number(r.UMAP2),  // ← y軸

            // PCAも残しておく（3D表示や他の分析用に使える）
            PC1: Number(r.PC1),
            PC2: Number(r.PC2),
            PC3: Number(r.PC3),

            // メタ情報はそのまま保持（日本語カラム）
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

  useEffect(() => {
    if (drawerContentRef.current) {
      drawerContentRef.current.scrollTop = 0;
    }
  }, [nearestPoints]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "userRatings") {
        const updated = JSON.parse(event.newValue);
        setUserRatings(updated);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const typeColorMap = {
    White: [0, 120, 255],
    Red: [255, 0, 0],
    Rose: [255, 102, 204],
    Sparkling: [255, 255, 0],
    Other: [150, 150, 150],
  };

  const gridInterval = 0.2;
  const cellSize = 0.2;

  //グリッド線
  const { thinLines, thickLines } = useMemo(() => {
  const thin = [];
  const thick = [];

  for (let i = -500; i <= 500; i++) {
    const x = i * gridInterval;
    const xLine = {
      sourcePosition: [x, -100, 0],
      targetPosition: [x, 100, 0],
    };
    if (i % 5 === 0) {
      thick.push(xLine);
    } else {
      thin.push(xLine);
    }

    const y = i * gridInterval;
    const yLine = {
      sourcePosition: [-100, y, 0],
      targetPosition: [100, y, 0],
    };
    if (i % 5 === 0) {
      thick.push(yLine);
    } else {
      thin.push(yLine);
    }
  }

  return { thinLines: thin, thickLines: thick };
}, [gridInterval]);

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

  const mainLayer = useMemo(() => {
    if (is3D) {
      return new ColumnLayer({
        id: `columns-${zMetric}`,
        data,
        diskResolution: 12,
        radius: 0.05,
        extruded: true,
        elevationScale: 2,
        getPosition: (d) => [d.BodyAxis, d.SweetAxis],
        getElevation: (d) => (zMetric ? Number(d[zMetric]) || 0 : 0),
        getFillColor: (d) => typeColorMap[d.Type] || typeColorMap.Other,
        pickable: true,
        onClick: (info) => {
          if (info && info.object) {
            const { BodyAxis, SweetAxis } = info.object;
            setViewState((prev) => ({
              ...prev,
              target: [BodyAxis, SweetAxis, 0],
              ...ZOOM_LIMITS,
            }));
          }
        },
      });
    } else {
      return new ScatterplotLayer({
        id: "scatter",
        data,
        getPosition: (d) => [d.BodyAxis, -d.SweetAxis, 0],
        getFillColor: (d) => typeColorMap[d.Type] || typeColorMap.Other,
        getRadius: 0.05,
        pickable: true,
      });
    }
  }, [data, is3D, zMetric]);

  //ブロック
  const gridCellLayer = new GridCellLayer({
    id: "grid-cells",
    data: cells,
    cellSize,
    getPosition: (d) => d.position,
    getFillColor: (d) =>
      d.hasRating ? [180, 100, 50, 150] : [200, 200, 200, 40],
    getElevation: 0,
    pickable: false,
  });

// 評価サークル
const ratingCircleLayers = useMemo(() => {
  const lineColor = [255, 0, 0, 255]; // ← 効いていない（課題）

  return Object.entries(userRatings).flatMap(([jan, ratingObj]) => {
    const item = data.find((d) => String(d.JAN) === String(jan));
    if (!item || !item.BodyAxis || !item.SweetAxis) return [];

    const count = Math.min(ratingObj.rating, 5); // 最大5重円
    const radiusBase = 0.10;

    return Array.from({ length: count }).map((_, i) => {
      const angleSteps = 40;
      const path = Array.from({ length: angleSteps }, (_, j) => {
        const angle = (j / angleSteps) * 2 * Math.PI;
        const radius = radiusBase * (i + 1);
        const x = item.BodyAxis + Math.cos(angle) * radius;
        const y =
          (is3D ? item.SweetAxis : -item.SweetAxis) + Math.sin(angle) * radius;
        return [x, y];
      });

      path.push(path[0]); // 閉じる

      return new PathLayer({
        id: `ring-${jan}-${i}`,
        data: [{ path }],
        getPath: (d) => d.path,
        getLineColor: d => lineColor,
        getWidth: 0.3,
        widthUnits: "pixels",
        parameters: { depthTest: false },
        pickable: false,
      });
    });
  });
}, [data, userRatings, is3D]); 

  const sortedRatedWineList = useMemo(() => {
  if (!Array.isArray(data)) return [];
  return Object.entries(userRatings)
    .filter(([_, rating]) => rating.rating != null)
    .map(([jan, rating]) => {
      const matched = data.find((d) => String(d.JAN) === String(jan));
      if (!matched) return null;
      return {
        ...matched,
        date: rating.date,
        rating: rating.rating,
      };
    })
    .filter((item) =>
      item &&
      typeof item.BodyAxis === "number" &&
      typeof item.SweetAxis === "number"
    )
    .filter((d) => d)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [userRatings, data]);

    // App関数の中で useMemo で定義
  const displayIndexMap = useMemo(() => {
    const map = {};
    const total = sortedRatedWineList.length;
    sortedRatedWineList.forEach((item, idx) => {
      map[item.JAN] = total - idx; // 新しいほど大きな番号
    });
    return map;
  }, [sortedRatedWineList]);

  const ratingDateLayer = (showRatingDates && sortedRatedWineList.length > 0)
  ? new TextLayer({
      id: "rating-index-labels",
      data: sortedRatedWineList.map((item, idx) => {
        const y = is3D ? item.SweetAxis : -item.SweetAxis;
        const z = is3D ? (Number(item[zMetric]) || 0) + 0.1 : 0;
        return {
          position: [item.BodyAxis, y, z],
          text: String(displayIndexMap[item.JAN] ?? "?")
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

  const textLayer = nearestPoints.length
  ? new TextLayer({
      id: "nearest-labels",
      data: nearestPoints.map((d, i) => {
        const y = is3D ? d.SweetAxis : -d.SweetAxis; // ← 修正ポイント
        const z = is3D ? (Number(d[zMetric]) || 0) + 0.05 : 0;
        return {
          position: [d.BodyAxis, y, z],
          text: String(i + 1),
        };
      }),
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getSize: 0.4,
      sizeUnits: "meters",
      sizeMinPixels: 12,
      sizeMaxPixels: 64,
      billboard: true,
      characterSet: "0123456789",
      getColor: [0, 0, 0],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      parameters: { depthTest: false },
    })
  : null;

  const pinLayer = userPinCoords
  ? new ScatterplotLayer({
      id: "user-pin",
      data: [{
        position: [
          userPinCoords[0], 
          is3D ? -userPinCoords[1] : userPinCoords[1],
          is3D ? 0.01 : 0,
        ],
      }],
      getPosition: (d) => d.position,
      getRadius: 0.4,
      getFillColor: [0, 255, 0, 180], // 緑色
      pickable: false,
      parameters: { depthTest: false },
    })
  : null;

  const sliderMarkLayer = sliderMarkCoords
  ? new ScatterplotLayer({
      id: "slider-mark",
      data: [sliderMarkCoords],
      getPosition: (d) => [
        d[0],
        is3D ? -d[1] : d[1],  // ← ここで3D時のみY軸を反転
        0,
      ],
      getFillColor: [255, 0, 0, 180],
      getRadius: 0.25,
      radiusUnits: "meters",
      pickable: false,
    })
  : null;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div style={{ 
      position: "absolute", 
      top: 0,
      left: 0,
      margin: 0,
      padding: 0,
      width: "100%", 
      height: "100%",
       }}>
      {!is3D && (
        <>
        </>
      )}

      <DeckGL
        views={
          is3D
            ? new OrbitView({ near: 0.1, far: 1000 })
            : new OrthographicView({ near: -1, far: 1 })
        }
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => {
          const limitedTarget = [
            Math.max(-15, Math.min(15, vs.target[0])),  // ← 横方向（Body軸）
            Math.max(-15, Math.min(15, vs.target[1])),  // ← 縦方向（Sweet軸）
            vs.target[2],                            // ← Z軸そのまま
          ];

          setViewState({
             ...vs,
             target: limitedTarget,
          });
        }}
        controller={{
          dragPan: true,
          dragRotate: true,
          minRotationX: 5,
          maxRotationX: 90,
          minZoom: 4.0,
          maxZoom: 8.0,
        }}
        onClick={(info) => {
          if (is3D) return;
          if (info && info.coordinate) {
            // 評価一覧が開いていれば閉じる
            if (isRatingListOpen) {
               setIsRatingListOpen(false);
               setShowRatingDates(false);
            }

            const [x, y] = info.coordinate;
            setUserPinCoords([x, y]);

            const nearest = data
              .map((d) => ({
               ...d,
               distance: Math.hypot(d.BodyAxis - x, -d.SweetAxis - y),
              }))
              .sort((a, b) => a.distance - b.distance)
              .slice(0, 10);

            setNearestPoints(nearest);
            setIsDrawerOpen(true);

            if (nearestPanelRef.current) {
              nearestPanelRef.current.scrollTop = 0;
            }
          }
        }}

        layers={[
          ...ratingCircleLayers,
          gridCellLayer,
          new LineLayer({
            id: "grid-lines-thin",//細い線
            data: thinLines,
            getSourcePosition: (d) => d.sourcePosition,
            getTargetPosition: (d) => d.targetPosition,
            getColor: [200, 200, 200, 100],
            getWidth: 1,
            widthUnits: "pixels",
            pickable: false,
          }),
          new LineLayer({
            id: "grid-lines-thick",//太い線
            data: thickLines,
            getSourcePosition: (d) => d.sourcePosition,
            getTargetPosition: (d) => d.targetPosition,
            getColor: [180, 180, 180, 120],
            getWidth: 1.25,
            widthUnits: "pixels",
            pickable: false,
          }),
          mainLayer,
          sliderMarkLayer,
          ratingDateLayer,
          textLayer,
          pinLayer,
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

 <button
  onClick={() => {
    const nextIs3D = !is3D;
    setIs3D(nextIs3D);

    if (nextIs3D) {
      // 2D → 3D
      setSaved2DViewState(viewState);

      // 中心点として優先するのは打点 → 評価打点 → 初期値
      const targetX = userPinCoords?.[0] ?? sliderMarkCoords?.[0] ?? viewState.target[0];
      const targetY = userPinCoords?.[1] ?? sliderMarkCoords?.[1] ?? viewState.target[1];

      setViewState({
        target: [targetX, targetY, 0],
        zoom: viewState.zoom,
        rotationX: 45,
        rotationOrbit: 0,
        ...ZOOM_LIMITS,
      });
    } else {
      // 3D → 2D に戻す
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

{/* 2Dモード時のボタンたち */}
{!is3D && (
  <>
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
  </>
)}

    {/* 評価切替 ★ボタン */}
    {!is3D && (
    <button
     onClick={() => {
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        setNearestPoints([]);
        setUserPinCoords(null);
      }
       const next = !showRatingDates;
       setShowRatingDates(next);
       setIsRatingListOpen(next);
    }}
      style={{
        position: "absolute",
        top: "120px", // ← ★ボタンより下
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

{/* 設定（⚙）ボタン */}
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

<Drawer
  anchor="bottom"
  open={isSliderOpen}
  onClose={() => setIsSliderOpen(false)}
  PaperProps={{
    style: {
      width: "100%",
      height: "800px",// 必要に応じて調整
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

    <Drawer
  anchor="left"
  open={isSettingsOpen}
  onClose={() => setIsSettingsOpen(false)}
  PaperProps={{
    style: {
      width: "300px",
      padding: "20px",
      boxSizing: "border-box",
    },
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

    {/* ✅ NearestWinePanel をここで使用 */}
    <NearestWinePanel
      isOpen={isDrawerOpen}
       onClose={() => {
        setIsDrawerOpen(false);
        setNearestPoints([]);
        setUserPinCoords(null);
      }}
      nearestPoints={nearestPoints}
      userRatings={userRatings}
      scrollRef={nearestPanelRef}
    />

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

  </div> 
  );
} // ← App関数の閉じ


// ✅ JSXの外で定義！
function NearestWinePanel({ isOpen, onClose, nearestPoints, userRatings, scrollRef }) {
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
          {/* 固定ヘッダー */}
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
            <h3 style={{ margin: 0 }}>打点に近いワイン</h3>
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

          {/* スクロールエリア */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
              backgroundColor: "#fff",
            }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {nearestPoints.map((item, idx) => (
                <li
                  key={idx}
                  onClick={() => window.open(`/products/${item.JAN}`, "_blank")}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid #eee",
                   cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {/* 左：色アイコン */}
                    <div style={{ 
                      flex: "0 0 24px",
                      display: "flex",
                      justifyContent: "center",
                      alignSelf: "flex-start",
                      marginTop: "2px",
                      marginLeft: "-4px",
                    }}>
                      <div
                        style={{
                          width: "16px",
                          height: "16px",
                          backgroundColor:
                            item.Type === "Red"
                              ? "#651E3E"
                              : item.Type === "White"
                              ? "#D4B499"
                              : item.Type === "Rose"
                              ? "#D88CA4"
                              : item.Type === "Sparkling"
                              ? "#CCC25E"
                              : "#aaa",
                          borderRadius: "4px",
                        }}
                      />
                    </div>

                     {/* 中央：商品情報 */}
                      <div style={{ 
                        flex: "1",
                        paddingLeft: "8px",
                        paddingRight: "8px",
                        maxWidth: "100%",
                        overflowWrap: "break-word",
                        whiteSpace: "normal",
                      }}>
                        <strong>{idx + 1}.</strong> {item.商品名 || "（名称不明）"}
                        <br />
                        <span style={{ fontSize: "14px" }}>
                           ¥{item.希望小売価格?.toLocaleString() ?? "不明"}
                        </span>
                        <br />
                        <span style={{ fontSize: "13px", color: "#555" }}>
                          Body: {item.BodyAxis?.toFixed(2)}, Sweet: {item.SweetAxis?.toFixed(2)}
                        </span>
                      </div>

                       {/* 右：◎評価 */}
                       <div style={{ 
                        flex: "0 0 96px", 
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        boxSizing: "border-box",
                       }}
                      >
                          <CircleRatingDisplay value={userRatings[String(item.JAN)]?.rating ?? 0} />
                       </div>
                    </div>
                 </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RatedWinePanel({ isOpen, onClose, userRatings, data, sortedRatedWineList }) {
     const displayList = useMemo(() => {
       if (!Array.isArray(sortedRatedWineList)) return [];
       const total = sortedRatedWineList.length;

       return sortedRatedWineList.map((item, idx) => ({
         ...item,
         displayIndex: total - idx, // ✅ 新しいものに大きな番号を振る
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
          {/* 固定ヘッダー */}
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

          {/* スクロールエリア */}
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
                    {item.希望小売価格
                      ? `¥${item.希望小売価格.toLocaleString()}`
                      : "不明"}
                    <br />
                    Body: {item.BodyAxis?.toFixed(2)}, Sweet:{" "}
                    {item.SweetAxis?.toFixed(2)} / 星評価:{" "}
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