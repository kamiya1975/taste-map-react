import React, { useEffect, useState, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { OrbitView, OrthographicView } from "@deck.gl/core";
import { ScatterplotLayer, ColumnLayer, LineLayer, TextLayer, GridCellLayer, PathLayer } from "@deck.gl/layers";
import Drawer from "@mui/material/Drawer";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import CircleRatingDisplay from "./components/CircleRatingDisplay";

function MapPage() {
  const location = useLocation();
  const [data, setData] = useState([]);
  const [is3D, setIs3D] = useState(false);
  const INITIAL_ZOOM = 7;
  const [viewState, setViewState] = useState({
    target: [0, 0, 0],
    rotationX: 0,
    rotationOrbit: 0,
    zoom: INITIAL_ZOOM,
  });
  const ZOOM_LIMITS = { min: 4.0, max: 10.0 };
  const [saved2DViewState, setSaved2DViewState] = useState(null);
  const [zMetric, setZMetric] = useState("");
  const [userRatings, setUserRatings] = useState({});
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);
  const [showRatingDates, setShowRatingDates] = useState(false);
  const [isRatingListOpen, setIsRatingListOpen] = useState(false); // ← お気に入りパネル開閉に再利用
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // UMAPのクラスタ中心（単純平均）
  const umapCentroid = useMemo(() => {
    if (!data?.length) return [0, 0];
    let sx = 0, sy = 0, n = 0;
    for (const d of data) {
      if (Number.isFinite(d.BodyAxis) && Number.isFinite(d.SweetAxis)) {
        sx += d.BodyAxis; sy += d.SweetAxis; n++;
      }
    }
    return n ? [sx / n, sy / n] : [0, 0];
  }, [data]);

  // 外部（SliderPage 等）で保存されたユーザーのUMAP座標を表示するため
  const [userPin, setUserPin] = useState(null); // [x, y] (UMAP)

  // ▼ 2Dヒートマップの対象（初期表示：ー）
  const [highlight2D, setHighlight2D] = useState("");

  // 商品ドロワーと選択中JAN（選択中はオレンジ表示）
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedJAN, setSelectedJAN] = useState(null);

  // お気に入り（JAN -> {addedAt}）
  const [favorites, setFavorites] = useState({});

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

  // お気に入りを常時同期
  useEffect(() => {
    const syncFavorites = () => {
      const stored = localStorage.getItem("favorites");
      if (stored) {
        try {
          setFavorites(JSON.parse(stored));
        } catch (e) {
          console.error("Failed to parse favorites:", e);
        }
      }
    };
    syncFavorites();
    window.addEventListener("focus", syncFavorites);
    window.addEventListener("storage", syncFavorites);
    return () => {
      window.removeEventListener("focus", syncFavorites);
      window.removeEventListener("storage", syncFavorites);
    };
  }, []);

  // どの保存形式でも UMAP座標 [x,y] に正規化して返し、旧形式なら新形式に移行
  const readUserPinFromStorage = () => {
    try {
      const raw = localStorage.getItem("userPinCoords");
      if (!raw) return null;
      const val = JSON.parse(raw);

      // 新形式 { coordsUMAP:[x,y], ... }
      if (val && Array.isArray(val.coordsUMAP) && val.coordsUMAP.length >= 2) {
        const x = Number(val.coordsUMAP[0]);
        const y = Number(val.coordsUMAP[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
      }

      // 旧：{ coords:[x, -y] }（キャンバス用反転Y）
      if (val && Array.isArray(val.coords) && val.coords.length >= 2) {
        const xCanvas = Number(val.coords[0]);
        const yCanvas = Number(val.coords[1]);
        if (Number.isFinite(xCanvas) && Number.isFinite(yCanvas)) {
          const umap = [xCanvas, -yCanvas]; // 反転戻し
          // 移行
          localStorage.setItem("userPinCoords", JSON.stringify({ coordsUMAP: umap, version: 2 }));
          return umap;
        }
      }

      // 最旧：配列 [x, ?y]（yがUMAPか-UMAPか不明）→ センターに近い方を採用
      if (Array.isArray(val) && val.length >= 2) {
        const ax = Number(val[0]);
        const ay = Number(val[1]);
        if (Number.isFinite(ax) && Number.isFinite(ay)) {
          const [cx, cy] = umapCentroid;
          const dUMAP   = (ax - cx) ** 2 + (ay - cy) ** 2;
          const dFlipY  = (ax - cx) ** 2 + (-ay - cy) ** 2;
          const umap = dUMAP <= dFlipY ? [ax, ay] : [ax, -ay];
          // 移行
          localStorage.setItem("userPinCoords", JSON.stringify({ coordsUMAP: umap, version: 2 }));
          return umap;
        }
      }

      return null;
    } catch (e) {
      console.warn("userPinCoords の解析に失敗:", e);
      return null;
    }
  };

  // マウント時 & フォーカス/ストレージ変化で同期
  useEffect(() => {
    const sync = () => setUserPin(readUserPinFromStorage());
    sync(); // 初期読み込み
    const onFocus = () => sync();
    const onStorage = (e) => {
      if (!e || e.key === "userPinCoords") sync();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // userPin が来たら少し上にずらして見やすく寄せる（2Dのみ）
  useEffect(() => {
    if (!userPin) return;
    const shouldCenter = !!location.state?.centerOnUserPin;
    if (shouldCenter) {
      // 画面の中心にピタッと合わせる（2DはY反転だけ適用）
      setViewState((prev) => ({
        ...prev,
        target: [userPin[0], is3D ? userPin[1] : -userPin[1], 0],
        // ズームは維持。初回なら初期値を使う
        zoom: prev.zoom ?? INITIAL_ZOOM,
        ...ZOOM_LIMITS,
      }));
      // 一度センタリングしたらフラグをクリア（履歴の state を消す）
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch {}
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [userPin, is3D, location.state]);

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

  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

  // お気に入りのトグル
  const toggleFavorite = (jan) => {
    setFavorites((prev) => {
      const next = { ...prev };
      if (next[jan]) {
        delete next[jan];
      } else {
        next[jan] = { addedAt: new Date().toISOString() };
      }
      return next;
    });
  };
  const isFavorite = (jan) => !!favorites[jan];

  // 商品ページ（iframe）からの postMessage を受けて状態更新
  useEffect(() => {
    const onMsg = (e) => {
      const { type, jan, payload } = e.data || {};
      if (!type) return;

      if (type === "TOGGLE_FAVORITE" && jan) {
        toggleFavorite(String(jan));
      }

      if (type === "RATING_UPDATED" && jan) {
        // 受信次第、Map 側の userRatings を即時更新
        setUserRatings((prev) => {
          const next = { ...prev };
          if (!payload || !payload.rating) {
            delete next[jan];
          } else {
            next[jan] = payload; // { rating, date, weather }
          }
          localStorage.setItem("userRatings", JSON.stringify(next)); // ついでに鏡合わせ
          return next;
        });
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []); // 依存なし

  const typeColorMap = {
    White: [150, 150, 150],
    Red: [150, 150, 150],
    Rose: [150, 150, 150],
    Sparkling: [150, 150, 150],
    Other: [150, 150, 150],
  };
  const ORANGE = [255, 140, 0];

  // === グリッド/セル設定（ズレ防止） ===
  const cellSize = 0.2;
  const gridInterval = cellSize;

  // セルindex/中心/キー
  const EPS = 1e-9;
  const toIndex = (v) => Math.floor((v + EPS) / cellSize);
  const toCorner = (i) => i * cellSize;
  const toCenter = toCorner;
  const keyOf = (ix, iy) => `${ix},${iy}`;

  // === HeatMap の見え方 ===
  const HEAT_ALPHA_MIN = 24;
  const HEAT_ALPHA_MAX = 255;
  const HEAT_GAMMA = 0.65;
  const HEAT_CLIP_PCT = [0.0, 0.98];
  const HEAT_COLOR_LOW = [255, 255, 255];
  const HEAT_COLOR_HIGH = [255, 165, 0];

  // グリッド線
  const { thinLines, thickLines } = useMemo(() => {
    const thin = [];
    const thick = [];
    for (let i = -500; i <= 500; i++) {
      const x = i * gridInterval;
      (i % 5 === 0 ? thick : thin).push({ sourcePosition: [x, -100, 0], targetPosition: [x, 100, 0] });
      const y = i * gridInterval;
      (i % 5 === 0 ? thick : thin).push({ sourcePosition: [-100, y, 0], targetPosition: [100, y, 0] });
    }
    return { thinLines: thin, thickLines: thick };
  }, [gridInterval]);

  // セル集計
  const cells = useMemo(() => {
    const map = new Map();
    data.forEach((d) => {
      const ix = toIndex(d.BodyAxis);
      const iy = toIndex(is3D ? d.SweetAxis : -d.SweetAxis);
      const key = keyOf(ix, iy);
      if (!map.has(key)) {
        map.set(key, {
          ix,
          iy,
          position: [toCenter(ix), toCenter(iy)],
          count: 0,
          hasRating: false,
          hasFavorite: false,
        });
      }
      if (userRatings[d.JAN]) map.get(key).hasRating = true;
      if (favorites[d.JAN]) map.get(key).hasFavorite = true;
      map.get(key).count += 1;
    });
    return Array.from(map.values());
  }, [data, userRatings, favorites, is3D, cellSize]);

  // 2D: セルごとの平均PC描画配列
  const { heatCells, vMin, vMax, avgHash } = useMemo(() => {
    if (is3D || !highlight2D) return { heatCells: [], vMin: 0, vMax: 1, avgHash: "empty" };
    const sumMap = new Map();
    const cntMap = new Map();
    for (const d of data) {
      const v = Number(d[highlight2D]);
      if (!Number.isFinite(v)) continue;
      const ix = toIndex(d.BodyAxis);
      const iy = toIndex(-d.SweetAxis);
      const key = keyOf(ix, iy);
      sumMap.set(key, (sumMap.get(key) || 0) + v);
      cntMap.set(key, (cntMap.get(key) || 0) + 1);
    }
    const vals = [];
    const cellsArr = [];
    for (const [key, sum] of sumMap.entries()) {
      const count = cntMap.get(key) || 1;
      const avg = sum / count;
      vals.push(avg);
      const [ix, iy] = key.split(",").map(Number);
      cellsArr.push({ ix, iy, position: [toCorner(ix), toCorner(iy)], avg, count });
    }
    if (vals.length === 0) return { heatCells: [], vMin: 0, vMax: 1, avgHash: "none" };
    vals.sort((a, b) => a - b);
    const loIdx = Math.floor(HEAT_CLIP_PCT[0] * (vals.length - 1));
    const hiIdx = Math.floor(HEAT_CLIP_PCT[1] * (vals.length - 1));
    const lo = vals[loIdx];
    const hi = vals[hiIdx];
    const epsHi = hi - lo < 1e-9 ? lo + 1e-9 : hi;
    const hash = `${cellsArr.length}|${lo.toFixed(3)}|${epsHi.toFixed(3)}|${highlight2D}`;
    return { heatCells: cellsArr, vMin: lo, vMax: epsHi, avgHash: hash };
  }, [data, highlight2D, is3D, cellSize]);

  // PCA(PC1,PC2) -> UMAP(BodyAxis=UMAP1, SweetAxis=UMAP2) への kNN 回帰マッパー
  const pca2umap = useMemo(() => {
    if (!data?.length) return null;
    const samples = data
      .filter(d => Number.isFinite(d.PC1) && Number.isFinite(d.PC2) && Number.isFinite(d.BodyAxis) && Number.isFinite(d.SweetAxis))
      .map(d => ({ pc1: d.PC1, pc2: d.PC2, x: d.BodyAxis, y: d.SweetAxis }));

    const K = 15; // 近傍数（お好みで 10〜30）
    return (pc1, pc2) => {
      if (!Number.isFinite(pc1) || !Number.isFinite(pc2) || samples.length === 0) return [0, 0];
      // 距離でソート
      const neigh = samples
        .map(s => {
          const dx = pc1 - s.pc1, dy = pc2 - s.pc2;
          const d2 = dx*dx + dy*dy;
          return { s, d2 };
        })
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, Math.min(K, samples.length));

      // 距離の逆数重み（0割防止のε付き）
      const EPS = 1e-6;
      let sw = 0, sx = 0, sy = 0;
      neigh.forEach(({ s, d2 }) => {
        const w = 1 / (Math.sqrt(d2) + EPS);
        sw += w;
        sx += w * s.x;
        sy += w * s.y;
      });
      return sw > 0 ? [sx / sw, sy / sw] : [neigh[0].s.x, neigh[0].s.y];
    };
  }, [data]);

  // 商品ドロワーを開く
  const openProductDrawer = (jan) => {
    setSelectedJAN(jan);
    setProductDrawerOpen(true);
  };

  // クリック位置から最近傍
  const findNearestWine = (coord) => {
    if (!coord || !Array.isArray(data) || data.length === 0) return null;
    const [cx, cy] = coord;
    let best = null;
    let bestD2 = Infinity;
    for (const d of data) {
      const x = d.BodyAxis;
      const y = is3D ? d.SweetAxis : -d.SweetAxis;
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

  // メインレイヤ
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
        getFillColor: (d) => (String(d.JAN) === String(selectedJAN) ? ORANGE : (typeColorMap[d.Type] || typeColorMap.Other)),
        updateTriggers: { getFillColor: [selectedJAN] },
        pickable: true,
        onClick: null,
      });
    }
    return new ScatterplotLayer({
      id: "scatter",
      data,
      getPosition: (d) => [d.BodyAxis, -d.SweetAxis, 0],
      getFillColor: (d) => (String(d.JAN) === String(selectedJAN) ? ORANGE : (typeColorMap[d.Type] || typeColorMap.Other)),
      updateTriggers: { getFillColor: [selectedJAN] },
      radiusUnits: "meters",
      getRadius: 0.03,
      pickable: true,
      onClick: null,
    });
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

  // 評価日番号ラベル
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
            return { position: [item.BodyAxis, y, z], text: String(displayIndexMap[item.JAN] ?? "?") };
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

  // 外部（SliderPage等）から渡されたユーザーピンを描画（UMAP座標）
  const userPinLayer = useMemo(() => {
    if (!userPin) return null;
    return new ScatterplotLayer({
      id: "user-pin",
      data: [{ x: userPin[0], y: userPin[1] }],
      getPosition: (d) => [d.x, is3D ? d.y : -d.y, 0], // 2DではY反転に合わせる
      getRadius: 0.10,
      radiusUnits: "meters",
      getFillColor: [255, 140, 0, 230],
      stroked: true,
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      getLineColor: [255, 255, 255, 255],
      pickable: false,
      parameters: { depthTest: false },
    });
  }, [userPin, is3D]);

  return (
    <div style={{ position: "absolute", top: 0, left: 0, margin: 0, padding: 0, width: "100%", height: "100%" }}>
      <DeckGL
        views={is3D ? new OrbitView({ near: 0.1, far: 1000 }) : new OrthographicView({ near: -1, far: 1 })}
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => {
          // 1) ズームをクランプ（ユーザー操作時）
          const z = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, vs.zoom));
          // 2) ターゲットも必要ならクランプ
          const limitedTarget = [
            Math.max(-15, Math.min(15, vs.target[0])),
            Math.max(-15, Math.min(15, vs.target[1])),
            vs.target[2],
          ];
          setViewState({ ...vs, zoom: z, target: limitedTarget });
        }}
        controller={{
          dragPan: true,
          dragRotate: is3D,
          minRotationX: 5,
          maxRotationX: 90,
          // ★ ここが“操作時の制限”
          minZoom: ZOOM_LIMITS.min,
          maxZoom: ZOOM_LIMITS.max,
        }}
        controller={{ dragPan: true, dragRotate: is3D, minRotationX: 5, maxRotationX: 90, minZoom: 4.0, maxZoom: ZOOM_LIMITS.maxZoom }}
        onClick={(info) => {
          // 赤丸（slider-mark）をクリックした？
          if (info?.layer?.id === "slider-mark") {
            const coord = info?.coordinate; // UMAP座標（2Dはy反転後のキャンバス座標が渡る）
            const nearest = findNearestWine(coord);
            if (nearest?.JAN) openProductDrawer(nearest.JAN);
             return;
          }

          // 通常の点（ワイン）をクリックした？
          const picked = info?.object;
          if (picked?.JAN) {
            openProductDrawer(picked.JAN);
            return;
          }

          // 何も拾えなかったら、クリック座標から最近傍を開く
          const coord = info?.coordinate;
          const nearest = findNearestWine(coord);
          if (nearest?.JAN) openProductDrawer(nearest.JAN);
        }}
        pickingRadius={8}
        layers={[
          ...ratingCircleLayers,
          (!is3D && !highlight2D)
            ? new GridCellLayer({
                id: "grid-cells-base",
                data: cells,
                cellSize,
                getPosition: (d) => d.position,
                getFillColor: (d) =>
                  d.hasFavorite ? [255, 165, 0, 140] :
                  d.hasRating   ? [180, 100, 50, 150] :
                                  [200, 200, 200, 40],
                getElevation: 0,
                pickable: false,
              })
            : null,
          (!is3D && highlight2D)
            ? new GridCellLayer({
                id: `grid-cells-heat-${highlight2D}-p${HEAT_COLOR_LOW.join("_")}-${HEAT_COLOR_HIGH.join("_")}`,
                data: heatCells,
                cellSize,
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
                updateTriggers: { getFillColor: [vMin, vMax, HEAT_GAMMA, avgHash, ...HEAT_COLOR_LOW, ...HEAT_COLOR_HIGH, HEAT_ALPHA_MIN, HEAT_ALPHA_MAX] },
              })
            : null,
          new LineLayer({ id: "grid-lines-thin", data: thinLines, getSourcePosition: (d) => d.sourcePosition, getTargetPosition: (d) => d.targetPosition, getColor: [200, 200, 200, 100], getWidth: 1, widthUnits: "pixels", pickable: false }),
          new LineLayer({ id: "grid-lines-thick", data: thickLines, getSourcePosition: (d) => d.sourcePosition, getTargetPosition: (d) => d.targetPosition, getColor: [180, 180, 180, 120], getWidth: 1.25, widthUnits: "pixels", pickable: false }),
          mainLayer,
          userPinLayer,
          ratingDateLayer,
        ]}
      />

      {is3D && (
        <select value={zMetric} onChange={(e) => setZMetric(e.target.value)} style={{ position: "absolute", top: "10px", left: "10px", zIndex: 1, padding: "6px", fontSize: "14px" }}>
          <option value="">ー</option>
          <option value="PC2">Sweet(PC2)</option>
          <option value="PC1">Body(PC1)</option>
          <option value="PC3">----(PC3)</option>
        </select>
      )}

      {!is3D && (
        <select value={highlight2D} onChange={(e) => setHighlight2D(e.target.value)} style={{ position: "absolute", top: "10px", left: "10px", zIndex: 1, padding: "6px", fontSize: "14px" }}>
          <option value="">ー</option>
          <option value="PC2">Sweet(PC2)</option>
          <option value="PC1">Body(PC1)</option>
          <option value="PC3">----(PC3)</option>
        </select>
      )}

      <button
        onClick={() => {
          const nextIs3D = !is3D;
          setIs3D(nextIs3D);
          if (nextIs3D) {
            setSaved2DViewState(viewState);
            setViewState({ target: [viewState.target[0], viewState.target[1], 0], zoom: viewState.zoom, rotationX: 45, rotationOrbit: 0, ...ZOOM_LIMITS });
          } else {
            setViewState({ ...saved2DViewState, rotationX: 0, rotationOrbit: 0, ...ZOOM_LIMITS });
          }
        }}
        style={{ position: "absolute", top: "10px", right: "10px", zIndex: 1, padding: "8px 12px", fontSize: "14px", background: "#fff", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer" }}
      >
        {is3D ? "2D" : "3D"}
      </button>

      {!is3D && (
        <button
          onClick={() => { setSweetness(50); setBody(50); setIsSliderOpen(true); }}
          style={{ position: "absolute", top: "70px", right: "10px", zIndex: 1, width: "40px", height: "40px", borderRadius: "50%", background: "#eee", border: "1px solid #ccc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "20px" }}
        >
          ●
        </button>
      )}

      {!is3D && (
        <button
          onClick={() => { const next = !showRatingDates; setShowRatingDates(next); setIsRatingListOpen(next); }}
          style={{ position: "absolute", top: "120px", right: "10px", zIndex: 1, width: "40px", height: "40px", borderRadius: "50%", background: "#eee", border: "1px solid #ccc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "20px" }}
        >
          ♡
        </button>
      )}

      <button onClick={() => setIsSettingsOpen(true)} style={{ position: "absolute", bottom: "40px", left: "20px", zIndex: 1, width: "40px", height: "40px", borderRadius: "50%", background: "#eee", border: "1px solid #ccc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "18px" }}>
        ⚙
      </button>

      {/* 嗜好スライダー */}
      <Drawer anchor="bottom" open={isSliderOpen} onClose={() => setIsSliderOpen(false)} PaperProps={{ style: { width: "100%", height: "800px", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "stretch", fontFamily: "sans-serif" } }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setIsSliderOpen(false)} style={{ background: "#eee", border: "1px solid #ccc", padding: "6px 10px", borderRadius: "4px", cursor: "pointer" }}>閉じる</button>
        </div>
        <h2 style={{ textAlign: "center", fontSize: "20px", marginBottom: "24px" }}>基準のワインを飲んだ印象は？</h2>
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "bold", marginBottom: "6px" }}>
            <span>← こんなに甘みは不要</span><span>もっと甘みが欲しい →</span>
          </div>
          <input type="range" min="0" max="100" value={sweetness} onChange={(e) => setSweetness(Number(e.target.value))} style={{ width: "100%", appearance: "none", height: "10px", borderRadius: "5px", background: `linear-gradient(to right, #007bff ${sweetness}%, #ddd ${sweetness}%)`, outline: "none", marginTop: "8px", WebkitAppearance: "none" }} />
        </div>
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "bold", marginBottom: "6px" }}>
            <span>← もっと軽やかが良い</span><span>濃厚なコクが欲しい →</span>
          </div>
          <input type="range" min="0" max="100" value={body} onChange={(e) => setBody(Number(e.target.value))} style={{ width: "100%", appearance: "none", height: "10px", borderRadius: "5px", background: `linear-gradient(to right, #007bff ${body}%, #ddd ${body}%)`, outline: "none", marginTop: "8px", WebkitAppearance: "none" }} />
        </div>
        <button
          onClick={() => {
            if (!data?.length || !pca2umap) return;

            const blendF = data.find((d) => d.JAN === "blendF");
            if (!blendF) return; // blendF が無い場合は別途：中央値を使う等に変更可

            // PCA の全体レンジ
            const pc1s = data.map(d => d.PC1).filter(Number.isFinite);
            const pc2s = data.map(d => d.PC2).filter(Number.isFinite);
            const minPC1 = Math.min(...pc1s), maxPC1 = Math.max(...pc1s);
            const minPC2 = Math.min(...pc2s), maxPC2 = Math.max(...pc2s);

            // 基準点（blendF）の PCA 値
            const basePC1 = Number(blendF.PC1);
            const basePC2 = Number(blendF.PC2);

            // スライダー（0-100）を PCA 連続値へ補間
            // Body スライダー → PC1,  Sweet スライダー → PC2
            const pc1Value =
              body <= 50
                ? basePC1 - ((50 - body) / 50) * (basePC1 - minPC1)
                : basePC1 + ((body - 50) / 50) * (maxPC1 - basePC1);

            const pc2Value =
              sweetness <= 50
                ? basePC2 - ((50 - sweetness) / 50) * (basePC2 - minPC2)
                : basePC2 + ((sweetness - 50) / 50) * (maxPC2 - basePC2);

            // PCA → UMAP へ変換（BodyAxis=x, SweetAxis=y）
            const [umapX, umapY] = pca2umap(pc1Value, pc2Value);

            // 2D表示はY反転で描画しているため反映
            const coords = [umapX, -umapY];

            setIsSliderOpen(false);
            setViewState((prev) => ({
              ...prev,
              target: [coords[0], coords[1], 0],
              zoom: Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, prev.zoom ?? INITIAL_ZOOM)),
              ...ZOOM_LIMITS
            }));

            // 共有したい場合は保存（任意）
            localStorage.setItem("userPinCoords", JSON.stringify({ coordsUMAP: [umapX, umapY] }));

            // ★ 即時に青点を動かす（同一タブは storage イベントが来ないため）
            setUserPin([umapX, umapY]);
          }}

          style={{ background: "#fff", color: "#007bff", padding: "14px 30px", fontSize: "16px", fontWeight: "bold", border: "2px solid #007bff", borderRadius: "6px", cursor: "pointer", display: "block", margin: "0 auto" }}
        >
          あなたの好みをMapに表示
        </button>
      </Drawer>

      {/* 設定ドロワー */}
      <Drawer anchor="left" open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} PaperProps={{ style: { width: "300px", padding: "20px", boxSizing: "border-box" } }}>
        <h3 style={{ marginTop: 0 }}>ユーザー設定</h3>
        <div style={{ marginBottom: "20px" }}>
          <button onClick={() => alert("ニックネーム変更画面へ")} style={{ width: "100%", padding: "10px", marginBottom: "10px" }}>ニックネーム変更</button>
          <button onClick={() => alert("パスワード変更画面へ")} style={{ width: "100%", padding: "10px", marginBottom: "10px" }}>パスワード変更</button>
          <button onClick={() => alert("お気に入り店舗設定へ")} style={{ width: "100%", padding: "10px", marginBottom: "10px" }}>お気に入り店舗管理</button>
          <button onClick={() => alert("利用規約を表示")} style={{ width: "100%", padding: "10px", marginBottom: "10px" }}>利用規約・プライバシーポリシー</button>
          <button onClick={() => alert("アプリの使い方説明を表示")} style={{ width: "100%", padding: "10px" }}>アプリの使い方</button>
        </div>
        <button onClick={() => setIsSettingsOpen(false)} style={{ background: "#eee", border: "1px solid #ccc", padding: "6px 10px", borderRadius: "4px", cursor: "pointer", width: "100%" }}>閉じる</button>
      </Drawer>

      {/* ♡ お気に入りパネル */}
      <FavoritePanel
        isOpen={isRatingListOpen}
        onClose={() => { setIsRatingListOpen(false); setShowRatingDates(false); }}
        favorites={favorites}
        data={data}
        onSelectJAN={openProductDrawer}
      />

      {/* 商品ページドロワー（/products/:JAN） */}
      <Drawer anchor="bottom" open={productDrawerOpen} onClose={() => setProductDrawerOpen(false)} PaperProps={{ style: { width: "100%", height: "100vh", borderTopLeftRadius: "12px", borderTopRightRadius: "12px", overflow: "hidden" } }}>
        <div style={{ height: "48px", padding: "8px 12px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9f9f9" }}>
          <div style={{ fontWeight: 600 }}>商品ページ</div>
          <button onClick={() => setProductDrawerOpen(false)} style={{ background: "#eee", border: "1px solid #ccc", padding: "6px 10px", borderRadius: "4px", cursor: "pointer" }}>閉じる</button>
        </div>
        {selectedJAN ? (
          <iframe title={`product-${selectedJAN}`} src={`/products/${selectedJAN}`} style={{ border: "none", width: "100%", height: "calc(100vh - 48px)" }} />
        ) : (
          <div style={{ padding: 16 }}>商品を選択してください。</div>
        )}
      </Drawer>
    </div>
  );
} // MapPage end

// === お気に入り一覧パネル ===
function FavoritePanel({ isOpen, onClose, favorites, data, onSelectJAN }) {
  const list = React.useMemo(() => {
    const arr = Object.entries(favorites || {}).map(([jan, meta]) => {
      const item = (data || []).find((d) => String(d.JAN) === String(jan));
      if (!item) return null;
      return { ...item, addedAt: meta?.addedAt ?? null };
    }).filter(Boolean);
    // 追加日時の新しい順
    arr.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));
    // 表示番号（1,2,3…）
    return arr.map((x, i) => ({ ...x, displayIndex: arr.length - i }));
  }, [favorites, data]);

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
            bottom: 0, left: 0, right: 0,
            height: "500px",
            backgroundColor: "#fff",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.2)",
            zIndex: 1000,
            borderTopLeftRadius: "12px",
            borderTopRightRadius: "12px",
            display: "flex",
            flexDirection: "column",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #ddd", background: "#f9f9f9", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>お気に入り</h3>
            <button onClick={onClose} style={{ background: "#eee", border: "1px solid #ccc", padding: "6px 10px", borderRadius: "4px", cursor: "pointer" }}>閉じる</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", backgroundColor: "#fff" }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {list.map((item, idx) => (
                <li
                  key={idx}
                  onClick={() => onSelectJAN?.(item.JAN)}
                  style={{ padding: "10px 0", borderBottom: "1px solid #eee", cursor: "pointer" }}
                >
                  <div>
                    <strong style={{ display: "inline-block", color: "rgb(50, 50, 50)", fontSize: "16px", fontWeight: "bold", marginRight: "4px", fontFamily: '"Helvetica Neue", Arial, sans-serif' }}>
                      {item.displayIndex}.
                    </strong>
                    <span style={{ fontSize: "15px", color: "#555" }}>
                      {item.addedAt ? new Date(item.addedAt).toLocaleDateString() : "（日付不明）"}
                    </span>
                    <br />
                    {item.商品名 || "（名称不明）"}
                  </div>
                  <small>
                    Type: {item.Type || "不明"} / 価格: {item.希望小売価格 ? `¥${item.希望小売価格.toLocaleString()}` : "不明"}
                    <br />
                    Body: {item.BodyAxis?.toFixed(2)}, Sweet: {item.SweetAxis?.toFixed(2)}
                  </small>
                </li>
              ))}
              {list.length === 0 && <li style={{ color: "#666" }}>まだお気に入りはありません。</li>}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default MapPage;
