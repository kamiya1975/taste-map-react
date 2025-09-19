// src/MapPage.js
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import DeckGL from "@deck.gl/react";
import { OrbitView, OrthographicView } from "@deck.gl/core";
import {
  ScatterplotLayer,
  ColumnLayer,
  LineLayer,
  GridCellLayer,
  PathLayer,
  IconLayer,
} from "@deck.gl/layers";
import Drawer from "@mui/material/Drawer";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

// 共通UI
import SearchPanel from "./components/SearchPanel";
import BarcodeScanner from "./components/BarcodeScanner";
import {
  DRAWER_HEIGHT,
  drawerModalProps,
  paperBaseStyle,
} from "./ui/constants";

const REREAD_LS_KEY = "tm_reread_until";

/* =======================
   定数（コンポーネント外に配置：ESLint回避）
======================= */
const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;
const CENTER_Y_OFFSET = -3.5; // 打点を画面中央より少し上に見せる
const ZOOM_LIMITS = { min: 5.0, max: 10.0 };
const INITIAL_ZOOM = 6;

// プロット色
const typeColorMap = {
  White: [150, 150, 150],
  Red: [150, 150, 150],
  Rose: [150, 150, 150],
  Sparkling: [150, 150, 150],
  Other: [150, 150, 150],
};
const ORANGE = [255, 140, 0];

// グリッド・ヒートマップ関連
const cellSize = 0.2;
const gridInterval = cellSize;
const EPS = 1e-9;
const toIndex = (v) => Math.floor((v + EPS) / cellSize);
const toCorner = (i) => i * cellSize;
const keyOf = (ix, iy) => `${ix},${iy}`;

const HEAT_ALPHA_MIN = 24;
const HEAT_ALPHA_MAX = 255;
const HEAT_GAMMA = 0.65;
const HEAT_CLIP_PCT = [0.0, 0.98];
const HEAT_COLOR_LOW = [255, 255, 255];
const HEAT_COLOR_HIGH = [255, 165, 0];

function MapPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // 🔗 商品ページiframe参照（♡状態の同期に使用）
  const iframeRef = useRef(null);

  // スライダーから戻った直後の「一度だけ自動オープン」ガード
  const autoOpenOnceRef = useRef(false);

  // スキャナの開閉（都度起動・都度破棄）
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const lastCommittedRef = useRef({ code: "", at: 0 });   // 直近採用JAN（60秒ガード）
  const unknownWarnedRef = useRef(new Map());             // 未登録JANの警告デバウンス

  // ====== ビュー制御
  const [is3D, setIs3D] = useState(false);
  const [viewState, setViewState] = useState({
    target: [0, 0, 0],
    rotationX: 0,
    rotationOrbit: 0,
    zoom: INITIAL_ZOOM,
  });
  const [saved2DViewState, setSaved2DViewState] = useState(null);

  // ====== データ & 状態
  const [data, setData] = useState([]);
  const [zMetric, setZMetric] = useState("");
  const [userRatings, setUserRatings] = useState({});
  const [favorites, setFavorites] = useState({});
  const [userPin, setUserPin] = useState(null);
  const [highlight2D, setHighlight2D] = useState("");
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedJAN, setSelectedJAN] = useState(null);

  // 検索・スキャン
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedJANFromSearch, setSelectedJANFromSearch] = useState(null);

  // （推奨）先に宣言しておく
  const [isRatingListOpen, setIsRatingListOpen] = useState(false);

  // === 排他オープンのためのユーティリティ ===
  const PANEL_ANIM_MS = 320;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 商品ドロワー／検索／お気に入り をまとめて閉じ、閉じアニメ分だけ待つ */
  const closeUIsThen = async () => {
    let willClose = false;

    if (productDrawerOpen) {
      setProductDrawerOpen(false);
      setSelectedJAN(null);
      setSelectedJANFromSearch(null); // ハイライトも消す
      willClose = true;
    }
    if (isSearchOpen) { setIsSearchOpen(false); willClose = true; }
    if (isRatingListOpen) { setIsRatingListOpen(false); willClose = true; }

    if (willClose) await wait(PANEL_ANIM_MS);
  };

  // スライダー（●）
  const openSliderExclusive = async () => {
    await closeUIsThen();     // ← ここを closeUIsThen に
    navigate("/slider");
  };

  // 検索（🔍）
  const openSearchExclusive = async () => {
    if (isSearchOpen) { setIsSearchOpen(false); return; }
    await closeUIsThen();
    setIsSearchOpen(true);
  };

  // お気に入り（♡）
  const openFavoriteExclusive = async () => {
    if (isRatingListOpen) { setIsRatingListOpen(false); return; }
    await closeUIsThen();
    setIsRatingListOpen(true);
  };

  // ====== パン境界（現在データに基づく）
  const panBounds = useMemo(() => {
    if (!data.length) return { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
    const xs = data.map((d) => d.BodyAxis);
    const ys = data.map((d) => (is3D ? d.SweetAxis : -d.SweetAxis));
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const pad = 1.5 + Math.abs(CENTER_Y_OFFSET);
    return {
      xmin: xmin - pad,
      xmax: xmax + pad,
      ymin: ymin - pad,
      ymax: ymax + pad,
    };
  }, [data, is3D]);

  // ====== データ読み込み
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
              BodyAxis: Number(r.UMAP1),
              SweetAxis: Number(r.UMAP2),
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
      .catch((err) =>
        console.error("UMAP_PCA_coordinates.json の取得に失敗:", err)
      );
  }, []);

  // スキャナを開くたびに「未登録JANの警告」をリセット（警告は各スキャンセッションで1回だけに）
  useEffect(() => {
    if (isScannerOpen) unknownWarnedRef.current.clear();
  }, [isScannerOpen]);

  // ====== ローカルストレージ同期
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

  useEffect(() => {
    localStorage.setItem("userRatings", JSON.stringify(userRatings));
  }, [userRatings]);
  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

  // ====== UMAP クラスタ重心（旧 userPin 互換処理用）
  const umapCentroid = useMemo(() => {
    if (!data?.length) return [0, 0];
    let sx = 0, sy = 0, n = 0;
    for (const d of data) {
      if (Number.isFinite(d.BodyAxis) && Number.isFinite(d.SweetAxis)) {
        sx += d.BodyAxis;
        sy += d.SweetAxis;
        n++;
      }
    }
    return n ? [sx / n, sy / n] : [0, 0];
  }, [data]);

  // userPin 読み出し（新旧形式サポート）→ useCallback で安定化
  const readUserPinFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem("userPinCoords");
      if (!raw) return null;
      const val = JSON.parse(raw);

      // 新形式 {coordsUMAP: [x, y]}
      if (val && Array.isArray(val.coordsUMAP) && val.coordsUMAP.length >= 2) {
        const x = Number(val.coordsUMAP[0]);
        const y = Number(val.coordsUMAP[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
      }
      // 旧形式 {coords: [x, -y]} → UMAPに移行
      if (val && Array.isArray(val.coords) && val.coords.length >= 2) {
        const xCanvas = Number(val.coords[0]);
        const yCanvas = Number(val.coords[1]);
        if (Number.isFinite(xCanvas) && Number.isFinite(yCanvas)) {
          const umap = [xCanvas, -yCanvas];
          localStorage.setItem(
            "userPinCoords",
            JSON.stringify({ coordsUMAP: umap, version: 2 })
          );
          return umap;
        }
      }
      // 最旧：単なる配列 [x, y]（Y 反転の判定を重心で推定）
      if (Array.isArray(val) && val.length >= 2) {
        const ax = Number(val[0]);
        const ay = Number(val[1]);
        if (Number.isFinite(ax) && Number.isFinite(ay)) {
          const [cx, cy] = umapCentroid;
          const dUMAP = (ax - cx) ** 2 + (ay - cy) ** 2;
          const dFlipY = (ax - cx) ** 2 + (-ay - cy) ** 2;
          const umap = dUMAP <= dFlipY ? [ax, ay] : [ax, -ay];
          localStorage.setItem(
            "userPinCoords",
            JSON.stringify({ coordsUMAP: umap, version: 2 })
          );
          return umap;
        }
      }
      return null;
    } catch (e) {
      console.warn("userPinCoords の解析に失敗:", e);
      return null;
    }
  }, [umapCentroid]);

  // userPin 同期（SliderPageで保存された座標を読む）
  useEffect(() => {
    const sync = () => setUserPin(readUserPinFromStorage());
    sync();
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
  }, [readUserPinFromStorage]);

  // 初回センタリング（必要時）
  useEffect(() => {
    if (!userPin) return;
    const shouldCenter = !!location.state?.centerOnUserPin;
    if (shouldCenter) {
      setViewState((prev) => ({
        ...prev,
        target: [
          userPin[0],
          (is3D ? userPin[1] : -userPin[1]) - CENTER_Y_OFFSET,
          0,
        ],
        zoom: prev.zoom ?? INITIAL_ZOOM,
      }));
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {}
    }
  }, [userPin, is3D, location.state]);

  // スライダー直後だけ：オレンジ打点の最寄り商品を自動で開く
  useEffect(() => {
    // セッションフラグ or location.state があれば発火対象
    const wantAutoOpen =
      sessionStorage.getItem("tm_autopen_nearest") === "1" ||
      !!location.state?.centerOnUserPin;

    if (!wantAutoOpen) return;              // そもそも対象外
    if (autoOpenOnceRef.current) return;    // 既に実行済み
    if (!userPin || !Array.isArray(data) || data.length === 0) return; // データ待ち

    autoOpenOnceRef.current = true;
    sessionStorage.removeItem("tm_autopen_nearest"); // 使い捨て

    // 他UIは閉じてから
    setIsSearchOpen(false);
    setIsRatingListOpen(false);

    // 次フレームで実行（描画と履歴書き換えが終わってから）
    requestAnimationFrame(() => {
      try {
        const canvasCoord = [userPin[0], is3D ? userPin[1] : -userPin[1]];
        const nearest = findNearestWine(canvasCoord);
        if (nearest?.JAN) {
          setSelectedJAN(nearest.JAN);
          setSelectedJANFromSearch(null);
          setProductDrawerOpen(true);
          focusOnWine(nearest, { zoom: INITIAL_ZOOM });
        }
      } catch (e) {
        console.error("auto-open-nearest failed:", e);
      }
    });
  }, [location.key, userPin, data, is3D, focusOnWine, findNearestWine]);

  // ====== 共通：商品へフォーカス（毎回“初期ズーム”に戻す）
  const focusOnWine = useCallback(
    (item, opts = {}) => {
      if (!item) return;
      const tx = Number(item.BodyAxis);
      const tyUMAP = Number(item.SweetAxis);
      if (!Number.isFinite(tx) || !Number.isFinite(tyUMAP)) return;

      const tyCanvas = -tyUMAP;
      const zoomTarget = Math.max(
        ZOOM_LIMITS.min,
        Math.min(ZOOM_LIMITS.max, opts.zoom ?? INITIAL_ZOOM)
      );

      setViewState((prev) => ({
        ...prev,
        target: [tx, tyCanvas - CENTER_Y_OFFSET, 0],
        zoom: zoomTarget,
        rotationX: is3D ? (prev.rotationX ?? 45) : 0,
        rotationOrbit: 0,
      }));
    },
    [is3D]
  );

  // ====== 子iframeへ♡状態を送るヘルパー
  const sendFavoriteToChild = (jan, value) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "SET_FAVORITE", jan: String(jan), value: !!value },
        "*"
      );
    } catch {}
  };

  // ====== 便利関数（useCallbackで安定化）
  const toggleFavorite = useCallback((jan) => {
    setFavorites((prev) => {
      const next = { ...prev };
      if (next[jan]) {
        delete next[jan];
        sendFavoriteToChild(jan, false);
      } else {
        next[jan] = { addedAt: new Date().toISOString() };
        sendFavoriteToChild(jan, true);
      }
      return next;
    });
  }, []);

  // 商品ページ（iframe）からの postMessage
  useEffect(() => {
    const onMsg = (e) => {
      const { type, jan, payload } = e.data || {};
      if (!type) return;
      if (type === "TOGGLE_FAVORITE" && jan) toggleFavorite(String(jan));
      if (type === "RATING_UPDATED" && jan) {
        setUserRatings((prev) => {
          const next = { ...prev };
          if (!payload || !payload.rating) delete next[jan];
          else next[jan] = payload; // {rating,date,weather}
          localStorage.setItem("userRatings", JSON.stringify(next));
          return next;
        });

        const rating = Number(payload?.rating) || 0;
        const willFav = rating > 0;

        // state 更新
        setFavorites((prev) => {
          const next = { ...prev };
          if (willFav) {
            if (!next[jan]) next[jan] = { addedAt: new Date().toISOString() };
          } else {
            delete next[jan];
          }
          return next;
        });

        // localStorage 更新
        try {
          const favs = JSON.parse(localStorage.getItem("favorites") || "{}");
          if (willFav) {
            if (!favs[jan]) favs[jan] = { addedAt: new Date().toISOString() };
          } else {
            delete favs[jan];
          }
          localStorage.setItem("favorites", JSON.stringify(favs));
        } catch {}

        // 子iframeのUIも同期
        try {
          sendFavoriteToChild(jan, willFav);
        } catch {}
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [toggleFavorite]);

  // 評価の有無
  const hasAnyRating = useMemo(
    () => Object.values(userRatings || {}).some((v) => Number(v?.rating) > 0),
    [userRatings]
  );

  // クリック座標から最近傍検索
  const findNearestWine = React.useCallback((coord) => {
    if (!coord || !Array.isArray(data) || data.length === 0) return null;
    const [cx, cy] = coord;
    let best = null, bestD2 = Infinity;
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
  }, [data, is3D]);

  // ====== レイヤー計算
  const { thinLines, thickLines } = useMemo(() => {
    const thin = [], thick = [];
    for (let i = -500; i <= 500; i++) {
      const x = i * gridInterval;
      (i % 5 === 0 ? thick : thin).push({
        sourcePosition: [x, -100, 0],
        targetPosition: [x, 100, 0],
      });
      const y = i * gridInterval;
      (i % 5 === 0 ? thick : thin).push({
        sourcePosition: [-100, y, 0],
        targetPosition: [100, y, 0],
      });
    }
    return { thinLines: thin, thickLines: thick };
  }, []);

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
          position: [toCorner(ix), toCorner(iy)],
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
  }, [data, userRatings, favorites, is3D]);

  const { heatCells, vMin, vMax, avgHash } = useMemo(() => {
    if (is3D || !highlight2D)
      return { heatCells: [], vMin: 0, vMax: 1, avgHash: "empty" };
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
      cellsArr.push({
        ix,
        iy,
        position: [toCorner(ix), toCorner(iy)],
        avg,
        count,
      });
    }
    if (vals.length === 0)
      return { heatCells: [], vMin: 0, vMax: 1, avgHash: "none" };
    vals.sort((a, b) => a - b);
    const loIdx = Math.floor(HEAT_CLIP_PCT[0] * (vals.length - 1));
    const hiIdx = Math.floor(HEAT_CLIP_PCT[1] * (vals.length - 1));
    const lo = vals[loIdx];
    const hi = vals[hiIdx];
    const epsHi = hi - lo < 1e-9 ? lo + 1e-9 : hi;
    const hash = `${cellsArr.length}|${lo.toFixed(3)}|${epsHi.toFixed(
      3
    )}|${highlight2D}`;
    return { heatCells: cellsArr, vMin: lo, vMax: epsHi, avgHash: hash };
  }, [data, highlight2D, is3D]);

  // メイン（3D: Column / 2D: Scatter）
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
    }
    return new ScatterplotLayer({
      id: "scatter",
      data,
      getPosition: (d) => [d.BodyAxis, -d.SweetAxis, 0],
      getFillColor: (d) =>
        String(d.JAN) === String(selectedJAN)
          ? ORANGE
          : typeColorMap[d.Type] || typeColorMap.Other,
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
      if (!item || !Number.isFinite(item.BodyAxis) || !Number.isFinite(item.SweetAxis)) return [];
      const count = Math.min(Number(ratingObj.rating) || 0, 5);
      if (count <= 0) return [];
      const radiusBase = 0.06;
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

  // ===== 嗜好コンパス
  const detectElbowIndex = (valsDesc) => {
    const n = valsDesc.length;
    if (n <= 3) return n;
    const x1 = 0, y1 = valsDesc[0];
    const x2 = n - 1, y2 = valsDesc[n - 1];
    const dx = x2 - x1, dy = y2 - y1;
    const denom = Math.hypot(dx, dy) || 1;
    let bestK = 1, bestDist = -Infinity;
    for (let i = 1; i < n - 1; i++) {
      const num = Math.abs(dy * (i - x1) - dx * (valsDesc[i] - y1));
      const dist = num / denom;
      if (dist > bestDist) { bestDist = dist; bestK = i; }
    }
    return bestK + 1;
  };

  const compass = useMemo(() => {
    const rated = Object.entries(userRatings || {})
      .map(([jan, v]) => ({ jan: String(jan), rating: Number(v?.rating) }))
      .filter((r) => Number.isFinite(r.rating) && r.rating > 0);
    if (rated.length === 0) return { point: null, picked: [], rule: "elbow" };

    const joined = rated
      .map((r) => {
        const it = data.find((d) => String(d.JAN) === r.jan);
        if (!it || !Number.isFinite(it.BodyAxis) || !Number.isFinite(it.SweetAxis)) return null;
        return { ...r, x: it.BodyAxis, y: it.SweetAxis };
      })
      .filter(Boolean);
    if (joined.length === 0) return { point: null, picked: [], rule: "elbow" };

    joined.sort((a, b) => b.rating - a.rating);

    const n = joined.length;
    const k20 = Math.max(3, Math.ceil(n * 0.2));
    const top20 = joined.slice(0, Math.min(k20, n));

    const scores = joined.map((r) => r.rating);
    const kelbow = detectElbowIndex(scores);
    const elbowPick = joined.slice(0, Math.min(kelbow, n));

    const picked = elbowPick; // 既定は elbow

    let sw = 0, sx = 0, sy = 0;
    picked.forEach((p) => { sw += p.rating; sx += p.rating * p.x; sy += p.rating * p.y; });
    if (sw <= 0) return { point: null, picked, rule: "elbow" };
    return { point: [sx / sw, sy / sw], picked, rule: "elbow" };
  }, [userRatings, data]);

  const compassLayer = useMemo(() => {
    if (!compass?.point) return null;
    const [ux, uy] = compass.point;
    return new IconLayer({
      id: "preference-compass",
      data: [{ position: [ux, is3D ? uy : -uy, 0] }],
      getPosition: (d) => d.position,
      getIcon: () => ({
        url: COMPASS_URL,
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
  }, [compass, is3D]);

  // スライダー結果（コンパス：評価が入ると消える）
  const userPinCompassLayer = useMemo(() => {
    if (!userPin) return null; // markerMode は常にオレンジ想定だが、保守で残す
    if (hasAnyRating) return null;
    return new IconLayer({
      id: "user-pin-compass",
      data: [{ position: [userPin[0], is3D ? userPin[1] : -userPin[1], 0] }],
      getPosition: (d) => d.position,
      getIcon: () => ({
        url: COMPASS_URL,
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
  }, [userPin, hasAnyRating, is3D]);

  // スライダー結果（オレンジ打点：常時表示）
  const userPinOrangeLayer = useMemo(() => {
    if (!userPin) return null;
    return new ScatterplotLayer({
      id: "user-pin-orange",
      data: [{ x: userPin[0], y: userPin[1] }],
      getPosition: (d) => [d.x, is3D ? d.y : -d.y, 0],
      radiusUnits: "meters",
      getRadius: 0.12,
      getFillColor: [255, 140, 0, 230],
      stroked: true,
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      getLineColor: [255, 255, 255, 255],
      pickable: false,
      parameters: { depthTest: false },
    });
  }, [userPin, is3D]);

  // ====== レンダリング
  return (
    <div
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }}
    >
      <DeckGL
        views={
          is3D
            ? new OrbitView({ near: 0.1, far: 1000 })
            : new OrthographicView({ near: -1, far: 1 })
        }
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
        controller={{
          dragPan: true,
          dragRotate: is3D,
          minRotationX: 5,
          maxRotationX: 90,
          minZoom: ZOOM_LIMITS.min,
          maxZoom: ZOOM_LIMITS.max,
          inertia: false,
        }}
        onClick={(info) => {
          // 1) プロット直クリック
          const picked = info?.object;
          if (picked?.JAN) {
            setSelectedJAN(picked.JAN);
            setProductDrawerOpen(true);
            focusOnWine(picked, { zoom: INITIAL_ZOOM });
            return;
          }
          // 2) 近傍探索で拾って詳細を開く
          const coord = info?.coordinate;
          const nearest = findNearestWine(coord);
          if (nearest?.JAN) {
            setSelectedJAN(nearest.JAN);
            setProductDrawerOpen(true);
            focusOnWine(nearest, { zoom: INITIAL_ZOOM });
          }
        }}
        pickingRadius={8}
        layers={[
          ...ratingCircleLayers,
          !is3D && !highlight2D
            ? new GridCellLayer({
                id: "grid-cells-base",
                data: cells,
                cellSize,
                getPosition: (d) => d.position,
                getFillColor: (d) =>
                  d.hasFavorite
                    ? [255, 165, 0, 140]
                    : d.hasRating
                    ? [180, 100, 50, 150]
                    : [200, 200, 200, 40],
                getElevation: 0,
                pickable: false,
              })
            : null,
          !is3D && highlight2D
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
                updateTriggers: {
                  getFillColor: [vMin, vMax, HEAT_GAMMA, avgHash, ...HEAT_COLOR_LOW, ...HEAT_COLOR_HIGH, HEAT_ALPHA_MIN, HEAT_ALPHA_MAX],
                },
              })
            : null,
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
          // スライダー結果マーカー
          userPinCompassLayer,
          userPinOrangeLayer,
          // 検索ハイライト
          selectedJANFromSearch
            ? new ScatterplotLayer({
                id: "search-highlight",
                data: data.filter((d) => String(d.JAN) === String(selectedJANFromSearch)),
                getPosition: (d) => [d.BodyAxis, is3D ? d.SweetAxis : -d.SweetAxis, 0],
                radiusUnits: "meters",
                getRadius: 0.18,
                getFillColor: [255, 215, 0, 240],   // 黄色（ゴールド）
                stroked: true,
                getLineColor: [0, 0, 0, 220],
                getLineWidth: 2,
                lineWidthUnits: "pixels",
                pickable: false,
                parameters: { depthTest: false },
              })
            : null,
          // コンパス
          compassLayer,
          // 最前面：ワイン打点
          mainLayer,
        ]}
      />

      {/* ====== 画面右上: 2D/3D トグル */}
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
            });
          } else {
            setViewState({
              ...(saved2DViewState ?? {
                target: [0, 0, 0],
                zoom: INITIAL_ZOOM,
                rotationX: 0,
                rotationOrbit: 0,
              }),
              rotationX: 0,
              rotationOrbit: 0,
            });
          }
        }}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: 10,
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

      {/* 左上: 指標セレクタ */}
      {is3D ? (
        <select
          value={zMetric}
          onChange={(e) => setZMetric(e.target.value)}
          style={{ position: "absolute", top: "10px", left: "10px", zIndex: 10, padding: "6px", fontSize: "14px" }}
        >
          <option value="">ー</option>
          <option value="PC2">Sweet(PC2)</option>
          <option value="PC1">Body(PC1)</option>
          <option value="PC3">PC3</option>
        </select>
      ) : (
        <select
          value={highlight2D}
          onChange={(e) => setHighlight2D(e.target.value)}
          style={{ position: "absolute", top: "10px", left: "10px", zIndex: 10, padding: "6px", fontSize: "14px" }}
        >
          <option value="">ー</option>
          <option value="PC2">Sweet(PC2)</option>
          <option value="PC1">Body(PC1)</option>
          <option value="PC3">PC3</option>
        </select>
      )}

      {/* 右上: スライダーへ遷移（2D時のみ表示にしたい場合は {!is3D && ( ... )} で囲む） */}
      {!is3D && (
        <button
          onClick={openSliderExclusive}
          style={{
            position: "absolute",
            top: "70px",
            right: "10px",
            zIndex: 10,
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
          aria-label="嗜好スライダー"
        >
          ●
        </button>
      )}

      {/* 右サイドの丸ボタン群（/slider は別ページなのでスライダーボタンは無し。♡ と 🔍 のみ） */}
      {!is3D && (
        <button
          onClick={openFavoriteExclusive}
          style={{
            position: "absolute",
            top: "120px",
            right: "10px",
            zIndex: 10,
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
          aria-label="お気に入り一覧"
        >
          ♡
        </button>
      )}

      {!is3D && (
        <button
          onClick={openSearchExclusive}
          style={{
            position: "absolute",
            top: "170px",
            right: "10px",
            zIndex: 10,
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
          aria-label="検索"
        >
          🔍
        </button>
      )}

      {/* ====== 検索パネル（背面Map操作可） */}
      <SearchPanel
        open={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        data={data}
        onPick={(item) => {
          if (!item) return;
          setSelectedJANFromSearch(item.JAN);
          setSelectedJAN(item.JAN);
          setProductDrawerOpen(true);
          focusOnWine(item, { zoom: INITIAL_ZOOM });
        }}
        onScanClick={() => {
          setProductDrawerOpen(false);
          setSelectedJAN(null);
          setIsScannerOpen(true);
        }}
      />

      {/* バーコードスキャナ */}
      <BarcodeScanner
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={(codeText) => {
          // --- EAN-13 検証（親側の最終ゲート）---
          const isValidEan13 = (ean) => {
            if (!/^\d{13}$/.test(ean)) return false;
            let sum = 0;
            for (let i = 0; i < 12; i++) {
              const d = ean.charCodeAt(i) - 48;
              sum += (i % 2 === 0) ? d : d * 3;
            }
            const check = (10 - (sum % 10)) % 10;
            return check === (ean.charCodeAt(12) - 48);
          };

          let jan = String(codeText).replace(/\D/g, "");
          if (jan.length === 12) jan = "0" + jan;       // UPC-A → EAN-13
          if (jan.length !== 13 || !isValidEan13(jan)) {
            alert(`JAN: ${jan} は無効なバーコードです。`);
            return false; // スキャナ継続
          }

          const now = Date.now();
          // --- 「再読込み」ウィンドウ中は60sガードを一時解除 ---
          let bypassThrottle = false;
          try {
            const until = Number(sessionStorage.getItem(REREAD_LS_KEY) || 0);
            bypassThrottle = until > 0 && now < until;
          } catch {}

          // 直近60秒の同一JANは通常スキップ（再読込み中は通す）
          if (!bypassThrottle) {
            if (jan === lastCommittedRef.current.code && now - lastCommittedRef.current.at < 60000) {
              return false; // スキャナ継続
            }
          }

          // データヒット判定
          const hit = data.find((d) => String(d.JAN) === jan);
          if (hit) {
            setSelectedJAN(hit.JAN);
            setProductDrawerOpen(true);
            focusOnWine(hit, { zoom: INITIAL_ZOOM });
            // 採用記録（勝手な再出現を防ぐ）
            lastCommittedRef.current = { code: jan, at: now };
            return true; // 採用→スキャナ側停止
          }

          // 未登録JAN：ワンショット警告（12s抑制）
          const lastWarn = unknownWarnedRef.current.get(jan) || 0;
          if (now - lastWarn > 12000) {
            alert(`JAN: ${jan} は見つかりませんでした。`);
            unknownWarnedRef.current.set(jan, now);
          }
          return false; // スキャナ継続
        }}
      />

      {/* お気に入り（下から 60vh） */}
      <FavoritePanel
        isOpen={isRatingListOpen}
        onClose={() => { setIsRatingListOpen(false); }}
        favorites={favorites}
        data={data}
        onSelectJAN={(jan) => {
          setSelectedJANFromSearch(String(jan));
          setSelectedJAN(jan);
          const item = data.find((d) => String(d.JAN) === String(jan));
          if (item) {
            focusOnWine(item, { zoom: INITIAL_ZOOM });
          }
          setProductDrawerOpen(true);
        }}
      />

      {/* 商品ページドロワー */}
      <Drawer
        anchor="bottom"
        open={productDrawerOpen}
        onClose={() => {
          setProductDrawerOpen(false);
          setSelectedJAN(null);
          setSelectedJANFromSearch(null); // 検索ハイライトを消す（保持したければ外す）
        }}
        ModalProps={drawerModalProps}
        PaperProps={{ style: paperBaseStyle }}
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
            onClick={() => {
              setProductDrawerOpen(false);
              setSelectedJAN(null);
              setSelectedJANFromSearch(null);
            }}
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
            ref={iframeRef}
            title={`product-${selectedJAN}`}
            src={`/products/${selectedJAN}`}
            style={{ border: "none", width: "100%", height: `calc(${DRAWER_HEIGHT} - 48px)` }}
            onLoad={() => {
              const jan = String(selectedJAN);
              const isFav = !!favorites[jan];
              try {
                sendFavoriteToChild(jan, isFav);
              } catch {}
            }}
          />
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
    const arr = Object.entries(favorites || {})
      .map(([jan, meta]) => {
        const item = (data || []).find((d) => String(d.JAN) === String(jan));
        if (!item) return null;
        return { ...item, addedAt: meta?.addedAt ?? null };
      })
      .filter(Boolean);
    arr.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));
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
            bottom: 0,
            left: 0,
            right: 0,
            height: DRAWER_HEIGHT,
            backgroundColor: "#fff",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.2)",
            zIndex: 20,
            borderTopLeftRadius: "12px",
            borderTopRightRadius: "12px",
            display: "flex",
            flexDirection: "column",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            pointerEvents: "auto",
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
            <h3 style={{ margin: 0 }}>お気に入り</h3>
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
              {list.map((item, idx) => (
                <li
                  key={`${item.JAN}-${idx}`}
                  onClick={() => onSelectJAN?.(item.JAN)}
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
                      {item.addedAt
                        ? new Date(item.addedAt).toLocaleDateString()
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
                    Body: {Number.isFinite(item.BodyAxis) ? item.BodyAxis.toFixed(2) : "—"}, Sweet:{" "}
                    {Number.isFinite(item.SweetAxis) ? item.SweetAxis.toFixed(2) : "—"}
                  </small>
                </li>
              ))}
              {list.length === 0 && (
                <li style={{ color: "#666" }}>まだお気に入りはありません。</li>
              )}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default MapPage;
