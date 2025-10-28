// src/MapPage.js
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Drawer from "@mui/material/Drawer";

import MapGuidePanelContent from "../components/panels/MapGuidePanelContent";
import SearchPanel from "../components/panels/SearchPanel";
import BarcodeScanner from "../components/BarcodeScanner";
import FavoritePanel from "../components/panels/FavoritePanel";
import RatedPanel from "../components/panels/RatedPanel";
import MyAccountPanelContent from "../components/panels/MyAccountPanelContent";
import MapCanvas from "../components/map/MapCanvas";
import PanelHeader from "../components/ui/PanelHeader";
import StorePanelContent from "../components/panels/StorePanelContent";
import FaqPanelContent from "../components/panels/FaqPanelContent";
import MyPagePanelContent from "../components/panels/MyPagePanelContent";
import ClusterPalettePanel from "../components/panels/ClusterPalettePanel";
import AboutTasteMapPanel from "../components/panels/AboutTasteMapPanel";
import {
  drawerModalProps,
  paperBaseStyle,
  ZOOM_LIMITS,
  INITIAL_ZOOM,
  CENTER_Y_OFFSET,
} from "../ui/constants";

const REREAD_LS_KEY = "tm_reread_until";
const CENTER_Y_FRAC = 0.85; // 0.0 = 画面最上端, 0.5 = 画面の真ん中
const ANCHOR_JAN = "4964044046324";

function getYOffsetWorld(zoom, fracFromTop = CENTER_Y_FRAC) {
  const worldPerPx = 1 / Math.pow(2, Number(zoom) || 0);
  let hPx = 0;
  if (typeof window !== "undefined") {
    hPx = (window.visualViewport && window.visualViewport.height)
      ? window.visualViewport.height
      : (window.innerHeight || 0);
  }
  return (0.5 - fracFromTop) * hPx * worldPerPx;
}

function MapPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const didInitialCenterRef = useRef(false);
  const [openFromRated, setOpenFromRated] = useState(false);
  const fromRatedRef = useRef(false);
  const deckRef = useRef(null);

  // ドロワー状態
  const [isGuideOpen, setIsGuideOpen] = useState(false);        // 「TasteMapとは？」
  const [isMapGuideOpen, setIsMapGuideOpen] = useState(false);  // 「マップガイド」(オーバーレイ)
  const [isStoreOpen, setIsStoreOpen] = useState(false);        // 店舗登録 (オーバーレイ)
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);      // アプリガイド（メニュー）
  const [isAccountOpen, setIsAccountOpen] = useState(false);    // マイアカウント（メニュー）
  const [isFaqOpen, setIsFaqOpen] = useState(false);            // よくある質問（メニュー）
  const [isClusterOpen, setIsClusterOpen] = useState(false); // ← 追加：配色パネルの開閉

  const iframeRef = useRef(null);
  const autoOpenOnceRef = useRef(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const lastCommittedRef = useRef({ code: "", at: 0 });
  const unknownWarnedRef = useRef(new Map());

  const [viewState, setViewState] = useState({ target: [0, 0, 0], zoom: INITIAL_ZOOM });

  // データ & 状態
  const [data, setData] = useState([]);
  const [userRatings, setUserRatings] = useState({});
  const [favorites, setFavorites] = useState({});
  const [userPin, setUserPin] = useState(null);
  const [highlight2D, setHighlight2D] = useState("");
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedJAN, setSelectedJAN] = useState(null);
  const [hideHeartForJAN, setHideHeartForJAN] = useState(null);
  const [iframeNonce, setIframeNonce] = useState(0);

  // クラスタ配色
  const [clusterColorMode, setClusterColorMode] = useState(false);

  // ユニークな cluster 値 → 初期色を決定
  const clusterList = useMemo(() => {
    const s = new Set();
    (data || []).forEach(d => Number.isFinite(d.cluster) && s.add(Number(d.cluster)));
    return Array.from(s).sort((a,b)=>a-b);
  }, [data]);

  // 検索・一覧
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedJANFromSearch, setSelectedJANFromSearch] = useState(null);
  const [isFavoriteOpen, setIsFavoriteOpen] = useState(false);
  const [isRatedOpen, setIsRatedOpen] = useState(false);

  const PANEL_ANIM_MS = 320;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** まとめて閉じ、閉じアニメ分だけ待つ（preserveMyPage=true ならメニューは残す） */
  const closeUIsThen = useCallback(async (opts = {}) => {
    const { preserveMyPage = false } = opts;
    let willClose = false;

    if (productDrawerOpen) {
      setProductDrawerOpen(false);
      setSelectedJAN(null);
      setSelectedJANFromSearch(null);
      willClose = true;
    }
    if (isClusterOpen)  { setIsClusterOpen(false);  willClose = true; }
    if (isGuideOpen)     { setIsGuideOpen(false);     willClose = true; }
    if (isMapGuideOpen)  { setIsMapGuideOpen(false);  willClose = true; }
    if (isStoreOpen)     { setIsStoreOpen(false);     willClose = true; }
    if (isSearchOpen)    { setIsSearchOpen(false);    willClose = true; }
    if (isFavoriteOpen)  { setIsFavoriteOpen(false);  willClose = true; }
    if (isRatedOpen)     { setIsRatedOpen(false);     willClose = true; }
    if (isAccountOpen)   { setIsAccountOpen(false);   willClose = true; }
    if (isFaqOpen)       { setIsFaqOpen(false);       willClose = true; }

    // メニューは基本閉じるが、保護オプション時は残す
    if (!preserveMyPage && isMyPageOpen) { setIsMyPageOpen(false); willClose = true; }

    if (willClose) await wait(PANEL_ANIM_MS);
  }, [
    productDrawerOpen,
    isClusterOpen,
    isGuideOpen,
    isMapGuideOpen,
    isStoreOpen,
    isSearchOpen,
    isFavoriteOpen,
    isRatedOpen,
    isMyPageOpen,
  ]);

  /** 通常の相互排他オープン（メニュー含め全部調停して開く） */
  const openPanel = useCallback(async (kind) => {
    await closeUIsThen(); // すべて閉じる
    if (kind === "mypage")       setIsMyPageOpen(true);
    else if (kind === "mapguide") setIsMapGuideOpen(true);
    else if (kind === "store")   setIsStoreOpen(true);
    else if (kind === "search")  setIsSearchOpen(true);
    else if (kind === "favorite") setIsFavoriteOpen(true);
    else if (kind === "rated")   setIsRatedOpen(true);
    else if (kind === "guide")   setIsGuideOpen(true);
    else if (kind === "cluster")  setIsClusterOpen(true);
    else if (kind === "cluster")  setIsClusterOpen(true);
  }, [closeUIsThen]);

  /** メニューを開いたまま、上に重ねる版（レイヤー表示用） */
  const openOverlayAboveMenu = useCallback(async (kind) => {
    await closeUIsThen({ preserveMyPage: true });
    if (kind === "mapguide") setIsMapGuideOpen(true);
    else if (kind === "store") setIsStoreOpen(true);
    else if (kind === "guide") setIsGuideOpen(true);
    else if (kind === "account") setIsAccountOpen(true);
    else if (kind === "faq") setIsFaqOpen(true);
  }, [closeUIsThen]);

  // ★ クエリで各パネルを開く（/ ?open=mypage|search|favorite|rated|mapguide|guide|store）
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      const open = (p.get("open") || "").toLowerCase();
      if (!open) return;
      (async () => {
        await openPanel(open); // クエリ経由は従来どおり相互排他
        navigate(location.pathname, { replace: true, state: location.state });
      })();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ====== パン境界
  const panBounds = useMemo(() => {
    if (!data.length) return { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
    const xs = data.map((d) => d.umap_x);
    const ys = data.map((d) => -d.umap_y);
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const pad = 1.5 + Math.abs(CENTER_Y_OFFSET);
    return { xmin: xmin - pad, xmax: xmax + pad, ymin: ymin - pad, ymax: ymax + pad };
  }, [data]);

  // ====== データ読み込み
  useEffect(() => {
    const url = `${process.env.PUBLIC_URL || ""}/umap_coords_c.json`;
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
              JAN: String(r.jan_code ?? r.JAN ?? ""),
              jan_code: String(r.jan_code ?? r.JAN ?? ""),
              Type: r.wine_type ?? "Other",
              umap_x: Number(r.umap_x),
              umap_y: Number(r.umap_y),
              cluster: Number(r.cluster),
              UMAP1: Number(r.umap_x),
              UMAP2: Number(r.umap_y),
              PC1: Number(r.PC1),
              PC2: Number(r.PC2),
              PC3: Number(r.PC3),
              商品名: r["temp_name"],
              国: r["国"],
              産地: r["産地"],
              葡萄品種: r["葡萄品種"],
              生産年: r["生産年"],
              "容量 ml": toNum(r["容量 ml"]),
              希望小売価格: toNum(r["希望小売価格"]),
              コメント: r["コメント"] ?? r["comment"] ?? r["説明"] ?? "",
            };
          })
          .filter((r) =>
            Number.isFinite(r.umap_x) &&
            Number.isFinite(r.umap_y) &&
            r.jan_code !== ""
          );
        setData(cleaned);
        localStorage.setItem("umapData", JSON.stringify(cleaned));
      })
      .catch((err) => console.error("UMAP_PCA_coordinates.json の取得に失敗:", err));
  }, []);

  // スキャナ：未登録JANの警告リセット
  useEffect(() => {
    if (isScannerOpen) unknownWarnedRef.current.clear();
  }, [isScannerOpen]);

  // ====== ローカルストレージ同期
  useEffect(() => {
    const syncUserRatings = () => {
      const stored = localStorage.getItem("userRatings");
      if (stored) {
        try { setUserRatings(JSON.parse(stored)); } catch (e) { console.error("Failed to parse userRatings:", e); }
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
        try { setFavorites(JSON.parse(stored)); } catch (e) { console.error("Failed to parse favorites:", e); }
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

  useEffect(() => { try { localStorage.setItem("userRatings", JSON.stringify(userRatings)); } catch {} }, [userRatings]);
  useEffect(() => { try { localStorage.setItem("favorites", JSON.stringify(favorites)); } catch {} }, [favorites]);

  // ====== UMAP 重心
  const umapCentroid = useMemo(() => {
    if (!data?.length) return [0, 0];
    let sx = 0, sy = 0, n = 0;
    for (const d of data) {
      if (Number.isFinite(d.umap_x) && Number.isFinite(d.umap_y)) { sx += d.umap_x; sy += d.umap_y; n++; }
    }
    return n ? [sx / n, sy / n] : [0, 0];
  }, [data]);

  // userPin 読み出し
  const readUserPinFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem("userPinCoords");
      if (!raw) return null;
      const val = JSON.parse(raw);

      if (val && Array.isArray(val.coordsUMAP) && val.coordsUMAP.length >= 2) {
        const x = Number(val.coordsUMAP[0]); const y = Number(val.coordsUMAP[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
      }
      if (val && Array.isArray(val.coords) && val.coords.length >= 2) {
        const xCanvas = Number(val.coords[0]); const yCanvas = Number(val.coords[1]);
        if (Number.isFinite(xCanvas) && Number.isFinite(yCanvas)) {
          const umap = [xCanvas, -yCanvas];
          localStorage.setItem("userPinCoords", JSON.stringify({ coordsUMAP: umap, version: 2 }));
          return umap;
        }
      }
      if (Array.isArray(val) && val.length >= 2) {
        const ax = Number(val[0]); const ay = Number(val[1]);
        if (Number.isFinite(ax) && Number.isFinite(ay)) {
          const [cx, cy] = umapCentroid;
          const dUMAP = (ax - cx) ** 2 + (ay - cy) ** 2;
          const dFlipY = (ax - cx) ** 2 + (-ay - cy) ** 2;
          const umap = dUMAP <= dFlipY ? [ax, ay] : [ax, -ay];
          localStorage.setItem("userPinCoords", JSON.stringify({ coordsUMAP: umap, version: 2 }));
          return umap;
        }
      }
      return null;
    } catch (e) {
      console.warn("userPinCoords の解析に失敗:", e);
      return null;
    }
  }, [umapCentroid]);

  // userPin 同期
  useEffect(() => {
    const sync = () => setUserPin(readUserPinFromStorage());
    sync();
    const onFocus = () => sync();
    const onStorage = (e) => { if (!e || e.key === "userPinCoords") sync(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [readUserPinFromStorage]);

  /** ===== UMAP座標へセンタリング ===== */
  const centerToUMAP = useCallback((xUMAP, yUMAP, opts = {}) => {
    if (!Number.isFinite(xUMAP) || !Number.isFinite(yUMAP)) return;
    const yCanvas = -yUMAP;
    const zoomTarget = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, opts.zoom ?? INITIAL_ZOOM));
    const yOffset = getYOffsetWorld(zoomTarget, CENTER_Y_FRAC);
    setViewState((prev) => ({ ...prev, target: [xUMAP, yCanvas - yOffset, 0], zoom: zoomTarget }));
  }, []);

  // 初期センタリング
  useEffect(() => {
    if (didInitialCenterRef.current) return;
    if (!Array.isArray(data) || data.length === 0) return;

    const b = data.find((d) => String(d.jan_code) === ANCHOR_JAN || String(d.JAN) === ANCHOR_JAN);
    if (b && Number.isFinite(b.umap_x) && Number.isFinite(b.umap_y)) {
      centerToUMAP(b.umap_x, b.umap_y, { zoom: INITIAL_ZOOM });
      didInitialCenterRef.current = true;
      return;
    }
    const [cx, cy] = umapCentroid;
    centerToUMAP(cx, cy, { zoom: INITIAL_ZOOM });
    didInitialCenterRef.current = true;
  }, [data, centerToUMAP, umapCentroid]);

  // 初回センタリング（userPin 指定時）
  useEffect(() => {
    if (!userPin) return;
    const shouldCenter =
      !!location.state?.centerOnUserPin ||
      (() => { try { return sessionStorage.getItem("tm_center_on_userpin") === "1"; } catch { return false; } })();

    if (shouldCenter) {
      centerToUMAP(userPin[0], userPin[1], { zoom: INITIAL_ZOOM });
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch {}
      try { sessionStorage.removeItem("tm_center_on_userpin"); } catch {}
    }
  }, [userPin, location.state, centerToUMAP]);

  // SliderPage閉じる→ blendFへ戻る
  useEffect(() => {
    const fromState = !!location.state?.centerOnBlendF;
    const raw = sessionStorage.getItem("tm_center_umap");
    if (!fromState && !raw) return;
    if (!Array.isArray(data) || data.length === 0) return;

    let targetX = null, targetY = null;
    try {
      if (raw) {
        const payload = JSON.parse(raw);
        if (Number.isFinite(payload?.x) && Number.isFinite(payload?.y)) {
          targetX = Number(payload.x); targetY = Number(payload.y);
        }
      }
    } catch {}

    if (targetX == null || targetY == null) {
      const b = data.find((d) => String(d.jan_code) === ANCHOR_JAN || String(d.JAN) === ANCHOR_JAN);
      if (b && Number.isFinite(b.umap_x) && Number.isFinite(b.umap_y)) {
        targetX = b.umap_x; targetY = b.umap_y;
      }
    }

    if (targetX != null && targetY != null) {
      centerToUMAP(targetX, targetY, { zoom: INITIAL_ZOOM });
    }

    sessionStorage.removeItem("tm_center_umap");
    try { window.history.replaceState({}, document.title, window.location.pathname); } catch {}
  }, [location.state, data, centerToUMAP]);

  // 最近傍（ワールド座標：DeckGLの座標系 = [UMAP1, -UMAP2]）
  const findNearestWineWorld = useCallback((wx, wy) => {
    if (!Array.isArray(data) || data.length === 0) return null;
    let best = null, bestD2 = Infinity;
    for (const d of data) {
      const x = d.umap_x, y = -d.umap_y;
      const dx = x - wx, dy = y - wy;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; best = d; }
    }
    return best;
  }, [data]);

  // スライダー直後：最寄り自動オープン
  useEffect(() => {
    const wantAutoOpen = sessionStorage.getItem("tm_autopen_nearest") === "1";
    if (!wantAutoOpen) return;
    if (autoOpenOnceRef.current) return;
    if (!userPin || !Array.isArray(data) || data.length === 0) return;

    autoOpenOnceRef.current = true;
    sessionStorage.removeItem("tm_autopen_nearest");

    setIsSearchOpen(false);
    setIsFavoriteOpen(false);
    setIsRatedOpen(false);

   try {
     // userPin は UMAP空間（x, yUMAP）。DeckGL世界は y を反転している点に注意
     const wx = userPin[0];
     const wy = -userPin[1];
     const nearest = findNearestWineWorld(wx, wy);
     if (nearest?.JAN) {
       setHideHeartForJAN(null);
       setSelectedJAN(nearest.JAN);
       setSelectedJANFromSearch(null);
       setIframeNonce(Date.now());
       setProductDrawerOpen(true);
       focusOnWine(nearest, { zoom: INITIAL_ZOOM });
     }
   } catch (e) {
     console.error("auto-open-nearest failed:", e);
   }
 }, [location.key, userPin, data, findNearestWineWorld]);

  // ====== 商品へフォーカス
  const focusOnWine = useCallback((item, opts = {}) => {
    if (!item) return;
    const tx = Number(item.umap_x);
    const tyUMAP = Number(item.umap_y);
    if (!Number.isFinite(tx) || !Number.isFinite(tyUMAP)) return;

    setViewState((prev) => {
      const wantZoom = opts.zoom;
      const zoomTarget = (wantZoom == null)
        ? prev.zoom
        : Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, wantZoom));
      const yOffset = getYOffsetWorld(zoomTarget, CENTER_Y_FRAC);
      const keepTarget = opts.recenter === false;
      const nextTarget = keepTarget ? prev.target : [tx, -tyUMAP - yOffset, 0];
      return { ...prev, target: nextTarget, zoom: zoomTarget };
    });
  }, []);

  // ====== 子iframeへ♡状態を送る
  const sendFavoriteToChild = (jan, value) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "SET_FAVORITE", jan: String(jan), value: !!value },
        "*"
      );
    } catch {}
  };

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
    const onMsg = async (e) => {
      const msg = e?.data || {};
      const { type } = msg || {};
      if (!type) return;

      const sendSnapshotToChild = (janStr, nextRatingObj) => {
        try {
          const isFav = !!favorites[janStr];
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: "STATE_SNAPSHOT",
              jan: janStr,
              favorite: isFav,
              rating: nextRatingObj || userRatings[janStr] || null,
              // 後方互換のため送る場合は rating>0 を反映
              hideHeart: (nextRatingObj?.rating || userRatings[janStr]?.rating || 0) > 0,
            },
            "*"
          );
          // HIDE_HEART 明示送信は廃止（子は rating から自律判定）
        } catch {}
      };

      if (type === "OPEN_MYACCOUNT") {
        await closeUIsThen({ preserveMyPage: true });
        setIsMyPageOpen(true);
        setIsAccountOpen(true);
        return;
      }

      const janStr = String(msg.jan || "");
      if (!janStr) return;

      if (type === "TOGGLE_FAVORITE") {
        toggleFavorite(janStr);
        sendSnapshotToChild(janStr);
        return;
      }

      if (type === "RATING_UPDATED") {
        const payload = msg.payload || null;
        setUserRatings((prev) => {
          const next = { ...prev };
          if (!payload || !payload.rating) delete next[janStr];
          else next[janStr] = payload;
          try { localStorage.setItem("userRatings", JSON.stringify(next)); } catch {}
          return next;
        });

        if (payload && Number(payload.rating) > 0) {
          setFavorites((prev) => {
            if (!prev[janStr]) return prev;
            const next = { ...prev };
            delete next[janStr];
            try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
            return next;
          });
          try {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "SET_FAVORITE", jan: janStr, value: false },
              "*"
            );
          } catch {}
        }
        sendSnapshotToChild(janStr, msg.payload || null);
        return;
      }

      if (type === "tm:fav-updated") {
        const isFavorite = !!msg.isFavorite;
        setFavorites((prev) => {
          const next = { ...prev };
          if (isFavorite) next[janStr] = { addedAt: new Date().toISOString() };
          else delete next[janStr];
          try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
          return next;
        });
        sendSnapshotToChild(janStr);
        return;
      }

      if (type === "tm:rating-updated") {
        const rating = Number(msg.rating) || 0;
        const date = msg.date || new Date().toISOString();

        setUserRatings((prev) => {
          const next = { ...prev };
          if (rating <= 0) delete next[janStr];
          else next[janStr] = { ...(next[janStr] || {}), rating, date };
          try { localStorage.setItem("userRatings", JSON.stringify(next)); } catch {}
          return next;
        });

        if (rating > 0) {
          setFavorites((prev) => {
            if (!prev[janStr]) return prev;
            const next = { ...prev };
            delete next[janStr];
            try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
            return next;
          });
          try {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "SET_FAVORITE", jan: janStr, value: false },
              "*"
            );
          } catch {}
        }

        sendSnapshotToChild(janStr, rating > 0 ? { rating, date } : null);
        return;
      }

      if (type === "REQUEST_STATE") {
        sendSnapshotToChild(janStr);
        return;
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [
    toggleFavorite,
    favorites,
    userRatings,
    hideHeartForJAN,
    closeUIsThen,
    navigate,
  ]);

  const hasAnyRating = useMemo(
    () => Object.values(userRatings || {}).some((v) => Number(v?.rating) > 0),
    [userRatings]
  );

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

  // ===== 嗜好重心計算
  const compass = useMemo(() => {
    const rated = Object.entries(userRatings || {})
      .map(([jan, v]) => ({ jan: String(jan), rating: Number(v?.rating) }))
      .filter((r) => Number.isFinite(r.rating) && r.rating > 0);
    if (rated.length === 0) return { point: null, picked: [], rule: "elbow" };

    const joined = rated
      .map((r) => {
        const it = data.find((d) => String(d.JAN) === r.jan);
        if (!it || !Number.isFinite(it.umap_x) || !Number.isFinite(it.umap_y)) return null;
        return { ...r, x: it.umap_x, y: it.umap_y };
      })
      .filter(Boolean);
    if (joined.length === 0) return { point: null, picked: [], rule: "elbow" };

    joined.sort((a, b) => b.rating - a.rating);
    const scores = joined.map((r) => r.rating);
    const kelbow = detectElbowIndex(scores);
    const picked = joined.slice(0, Math.min(kelbow, joined.length));

    let sw = 0, sx = 0, sy = 0;
    picked.forEach((p) => { sw += p.rating; sx += p.rating * p.x; sy += p.rating * p.y; });
    if (sw <= 0) return { point: null, picked, rule: "elbow" };
    return { point: [sx / sw, sy / sw], picked, rule: "elbow" };
  }, [userRatings, data]);

  // ====== レンダリング
  return (
    <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }}>
      <MapCanvas
        ref={deckRef}
        data={data}
        userRatings={userRatings}
        selectedJAN={selectedJAN}
        favorites={favorites}
        highlight2D={highlight2D}
        userPin={hasAnyRating ? null : userPin}
        compassPoint={compass?.point || null}
        panBounds={panBounds}
        viewState={viewState}
        setViewState={setViewState}
        onPickWine={(item) => {
          if (!item) return;
          setHideHeartForJAN(null);
          setSelectedJAN(item.JAN);
          setIframeNonce(Date.now());
          setProductDrawerOpen(true);
          focusOnWine(item, { recenter: false });
        }}
        clusterColorMode={clusterColorMode}
        edgeMarginXPx={50}
        edgeMarginYPx={400}
      />

      {/* 左上: 指標セレクタ */}
      <div style={{ position: "absolute", top: 10, left: 10, zIndex: 10 }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <select
            value={highlight2D}
            onChange={(e) => setHighlight2D(e.target.value)}
            style={{
              padding: "6px 28px 6px 8px",     // 右に矢印分の余白
              fontSize: "8px",
              color: "#444",
              backgroundColor: "#fff",
              border: "0.5px solid #000",        // 黒枠
              borderRadius: "6px",             // 角をやや尖らせる（3〜6で調整）
              outline: "none",
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
            }}
          >
            <option value="">基本マップ</option>
            <option value="PC2">Sweet</option>
            <option value="PC1">Body</option>
            <option value="PC3">PC3</option>
          </select>

          {/* ▼ テキスト矢印 */}
         <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              fontSize: 12,
              lineHeight: 1,
              color: "#444",
            }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* 左下: アプリガイド（メニュー）ボタン */}
      <button
        onClick={() => setIsMyPageOpen((v) => !v)}
        style={{
          position: "absolute",
          left: "12px",
          bottom: "max(12px, env(safe-area-inset-bottom))",
          zIndex: 10,
          width: "40px",
          height: "40px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        aria-label="アプリガイド"
        title="アプリガイド"
      >
        <img
          src={`${process.env.PUBLIC_URL || ""}/img/app-guide.svg`}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }}
          draggable={false}
        />
      </button>

      {/* 右上: 検索 */}
      <button
        onClick={() => openPanel("search")}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: 10,
          width: "40px",
          height: "40px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        aria-label="検索"
        title="検索"
      >
        <img
          src={`${process.env.PUBLIC_URL || ""}/img/search.svg`}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }}
          draggable={false}
        />
      </button>

      {/* 右サイドの丸ボタン群（♡ → ◎） */}
      <button
        onClick={() => openPanel("favorite")}
        style={{
          position: "absolute",
          top: "60px",
          right: "10px",
          zIndex: 10,
          width: "40px",
          height: "40px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        aria-label="お気に入り一覧"
        title="お気に入り一覧"
      >
        <img
          src={`${process.env.PUBLIC_URL || ""}/img/star.svg`}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }}
          draggable={false}
        />
      </button>

      <button
        onClick={() => openPanel("rated")}
        style={{
          position: "absolute",
          top: "110px",
          right: "10px",
          zIndex: 10,
          width: "40px",
          height: "40px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        aria-label="評価一覧"
        title="評価（◎）一覧"
      >
        <img
          src={`${process.env.PUBLIC_URL || ""}/img/hyouka.svg`}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }}
          draggable={false}
        />
      </button>

      <button
        onClick={async () => {
          const next = !clusterColorMode;
          if (next) {
            // ON にする時だけ他ドロワーを先に閉じてから開く
            await closeUIsThen();
            setIsClusterOpen(true);
          } else {
            // OFF の時はそのまま閉じる
            setIsClusterOpen(false);
            }
          setClusterColorMode(next);
          }}
        style={{
          position: "absolute",
          top: "160px",
          right: "10px",
          zIndex: 10,
          width: "40px",
          height: "40px",
          background: "transparent",
          border: "none",
         cursor: "pointer",
         display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        aria-label="クラスタ配色"
        title="クラスタ配色"
      >
        <img
          src={`${process.env.PUBLIC_URL || ""}/img/hyouka.svg`}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
            opacity: clusterColorMode ? 1.0 : 0.5,
            transition: "opacity 0.2s",
          }}
          draggable={false}
        />
      </button>

      {/* ====== 検索パネル ====== */}
      <SearchPanel
        open={isSearchOpen}
        onClose={async () => { await closeUIsThen(); }} 
        data={data}
        onPick={(item) => {
          if (!item) return;
          setOpenFromRated(false);
          setHideHeartForJAN(null);
          setSelectedJANFromSearch(null);
          setSelectedJAN(item.JAN);
          setIframeNonce(Date.now());
          setProductDrawerOpen(true);
          const tx = Number(item.umap_x), ty = Number(item.umap_y);
          if (Number.isFinite(tx) && Number.isFinite(ty)) {
            centerToUMAP(tx, ty, { zoom: viewState.zoom });
          }
        }}
        onScanClick={async () => {
          await closeUIsThen();
          setIsScannerOpen(true);
        }}
      />

      {/* バーコードスキャナ */}
      <BarcodeScanner
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={(codeText) => {
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
          if (jan.length === 12) jan = "0" + jan;
          if (jan.length !== 13 || !isValidEan13(jan)) {
            alert(`JAN: ${jan} は無効なバーコードです。`);
            return false;
          }

          const now = Date.now();
          let bypassThrottle = false;
          try {
            const until = Number(sessionStorage.getItem(REREAD_LS_KEY) || 0);
            bypassThrottle = until > 0 && now < until;
          } catch {}

          if (!bypassThrottle) {
            if (jan === lastCommittedRef.current.code && now - lastCommittedRef.current.at < 60000) {
              return false;
            }
          }

          const hit = data.find((d) => String(d.JAN) === jan);
          if (hit) {
            setHideHeartForJAN(null);
            setSelectedJAN(hit.JAN);
            setIframeNonce(Date.now());
            setProductDrawerOpen(true);
            lastCommittedRef.current = { code: jan, at: now };
            const tx = Number(hit.umap_x), ty = Number(hit.umap_y);
            if (Number.isFinite(tx) && Number.isFinite(ty)) {
              centerToUMAP(tx, ty, { zoom: INITIAL_ZOOM });
            }
            return true;
          }

          const lastWarn = unknownWarnedRef.current.get(jan) || 0;
          if (now - lastWarn > 12000) {
            alert(`JAN: ${jan} は見つかりませんでした。`);
            unknownWarnedRef.current.set(jan, now);
          }
          return false;
        }}
      />

      {/* お気に入り */}
      <FavoritePanel
        isOpen={isFavoriteOpen}
        onClose={async () => { await closeUIsThen(); }}
        favorites={favorites}
        data={data}
        userRatings={userRatings}
        onSelectJAN={(jan) => {
          setOpenFromRated(false);
          setHideHeartForJAN(null);
          setSelectedJANFromSearch(null);
          setSelectedJAN(jan);
          setIframeNonce(Date.now());
          const item = data.find((d) => String(d.JAN) === String(jan));
          if (item) {
            const tx = Number(item.umap_x), ty = Number(item.umap_y);
            if (Number.isFinite(tx) && Number.isFinite(ty)) {
              centerToUMAP(tx, ty, { zoom: INITIAL_ZOOM });
            }
          }
          setProductDrawerOpen(true);
        }}
      />

      {/* 評価（◎） */}
      <RatedPanel
        isOpen={isRatedOpen}
        onClose={async () => { await closeUIsThen(); }}
        userRatings={userRatings}
        data={data}
        onSelectJAN={(jan) => {
          setOpenFromRated(true);
          fromRatedRef.current = true;
          try { sessionStorage.setItem("tm_from_rated_jan", String(jan)); } catch {}
          setHideHeartForJAN(String(jan));
          setSelectedJANFromSearch(null);
          setSelectedJAN(jan);
          setIframeNonce(Date.now());
          const item = data.find((d) => String(d.JAN) === String(jan));
          if (item) {
            const tx = Number(item.umap_x), ty = Number(item.umap_y);
            if (Number.isFinite(tx) && Number.isFinite(ty)) {
              centerToUMAP(tx, ty, { zoom: INITIAL_ZOOM });
            }
          }
          setProductDrawerOpen(true);
        }}
      />

      <ClusterPalettePanel
        isOpen={isClusterOpen}
        onClose={() => setIsClusterOpen(false)}
        height="calc(50svh - env(safe-area-inset-bottom))" //ドロワー高さ調整
      />

      {/* 「TasteMapとは？」（PanelShell 版） */}
      <AboutTasteMapPanel
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* 商品ページドロワー */}
      <Drawer
        anchor="bottom"
        open={productDrawerOpen}
        onClose={() => {
          setProductDrawerOpen(false);
          setSelectedJAN(null);
          setHideHeartForJAN(null);
        }}
        ModalProps={drawerModalProps}
        PaperProps={{ style: { ...paperBaseStyle, borderTop: "1px solid #c9c9b0" } }}
      >
        <PanelHeader
          title="商品ページ"
          icon="dot.svg"
          onClose={() => {
            setProductDrawerOpen(false);
            setSelectedJAN(null);
            setHideHeartForJAN(null);
          }}
        />
        <div className="drawer-scroll">
          {selectedJAN ? (
            <iframe
               ref={iframeRef}
              key={`${selectedJAN}-${iframeNonce}`}
              src={`${process.env.PUBLIC_URL || ""}/#/products/${selectedJAN}?embed=1&_=${iframeNonce}`}
              style={{ width: "100%", height: "70vh", border: "none" }}
              onLoad={() => {
                try {
                  requestAnimationFrame(() => {
                    iframeRef.current?.contentWindow?.postMessage(
                      { type: "REQUEST_STATE", jan: String(selectedJAN) },
                      "*"
                    );
                  });
                } catch {}
              }}
            />
          ) : (
            <div style={{ padding: 16, color: "#555" }}>
              商品を選択するとページが表示されます。
            </div>
         )}
        </div>
      </Drawer>

           {/* アプリガイド（メニュー） */}
      <Drawer
        anchor="bottom"
        open={isMyPageOpen}
        onClose={() => setIsMyPageOpen(false)}
        BackdropProps={{ style: { background: "transparent" } }}
        ModalProps={{ ...drawerModalProps, keepMounted: true }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            zIndex: 1400,
            height: "85vh",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <PanelHeader
          title="アプリガイド"
          icon="app-guide.svg"
          onClose={() => setIsMyPageOpen(false)}
        />
        <MyPagePanelContent
          onOpenMapGuide={() => openOverlayAboveMenu("mapguide")}
          onOpenStore={() => openOverlayAboveMenu("store")}
          onOpenAccount={() => openOverlayAboveMenu("account")}
          onOpenFaq={() => openOverlayAboveMenu("faq")}
          onOpenSlider={() => {
            setIsMyPageOpen(false);
            navigate("/slider", { replace: false, state: { from: "menu" } });
          }}
        />
      </Drawer>

      {/* マップガイド */}
      <Drawer
        anchor="bottom"
        open={isMapGuideOpen}
        onClose={() => setIsMapGuideOpen(false)}
        BackdropProps={{ style: { background: "transparent" } }}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
        }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            zIndex: 1500,          // ← メニュー(1400)より上
            height: "85vh",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <PanelHeader
          title="マップガイド"
          icon="map-guide.svg"
          onClose={() => setIsMapGuideOpen(false)}
        />
        <div className="drawer-scroll" style={{ flex: 1, overflowY: "auto" }}>
          <MapGuidePanelContent />
        </div>
      </Drawer>

      {/* マイアカウント */}
      <Drawer
        anchor="bottom"
        open={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        BackdropProps={{ style: { background: "transparent" } }}
        ModalProps={{ ...drawerModalProps, keepMounted: true }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            zIndex: 1500,
            height: "85vh",
            display: "flex",
            flexDirection: "column",
         },
        }}
      >
        <PanelHeader
          title="マイアカウント"
          icon="account.svg"
          onClose={() => setIsAccountOpen(false)}
        />
        <div className="drawer-scroll" style={{ flex: 1, overflowY: "auto" }}>
          <MyAccountPanelContent />
        </div>
      </Drawer>

      {/* お気に入り店舗登録 */}
      <Drawer
        anchor="bottom"
        open={isStoreOpen}
        onClose={() => setIsStoreOpen(false)}
        BackdropProps={{ style: { background: "transparent" } }}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
        }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            zIndex: 1500,          // ← メニューの上
            height: "85vh",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <PanelHeader
          title="お気に入り店舗登録"
          icon="store.svg"
          onClose={() => setIsStoreOpen(false)}   // ← 子だけ閉じる
        />
        <div className="drawer-scroll" style={{ flex: 1, overflowY: "auto" }}>
          <StorePanelContent />
        </div>
      </Drawer>

      {/* よくある質問 */}
      <Drawer
        anchor="bottom"
        open={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
        BackdropProps={{ style: { background: "transparent" } }}
        ModalProps={{ ...drawerModalProps, keepMounted: true }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            zIndex: 1500,
            height: "85vh",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <PanelHeader
          title="よくある質問"
          icon="faq.svg"
          onClose={() => setIsFaqOpen(false)}
        />
        <div className="drawer-scroll" style={{ flex: 1, overflowY: "auto" }}>
          <FaqPanelContent />
        </div>
      </Drawer>
    </div>
  );
}

export default MapPage;
