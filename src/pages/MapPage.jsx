// src/MapPage.js
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Drawer from "@mui/material/Drawer";
import { useLocation, useNavigate } from "react-router-dom";

// パネル / Canvas
import SearchPanel from "../components/panels/SearchPanel";
import BarcodeScanner from "../components/BarcodeScanner";
import FavoritePanel from "../components/panels/FavoritePanel";
import RatedPanel from "../components/panels/RatedPanel";
import MyPagePanel from "../components/panels/MyPagePanel";
import MapCanvas from "../components/map/MapCanvas";
import PanelHeader from "../components/ui/PanelHeader";
import { PANEL_HEADER_H } from "../ui/constants";

// 共通定数
import {
  DRAWER_HEIGHT,
  drawerModalProps,
  paperBaseStyle,
  ZOOM_LIMITS,
  INITIAL_ZOOM,
  CENTER_Y_OFFSET,
} from "../ui/constants"

const REREAD_LS_KEY = "tm_reread_until";

// 例：上から25%に置きたい
const CENTER_Y_FRAC = 0.85; // 0.0 = 画面最上端, 0.5 = 画面の真ん中

function getYOffsetWorld(zoom, fracFromTop = CENTER_Y_FRAC) {
  // 1px が何ワールド単位か（Orthographic：scale = 2^zoom）
  const worldPerPx = 1 / Math.pow(2, Number(zoom) || 0);
  // 実画面の高さ（モバイルでも visualViewport を優先）
  const hPx =
    (typeof window !== "undefined" && window.visualViewport?.height) ||
    window.innerHeight ||
    0;

  // 画面中央(0.5) → 指定割合(fracFromTop) へずらすピクセル量をワールド単位へ
  // 上から25%なら (0.5 - 0.25) * 画面高 = 0.25 * 画面高 を上方向にずらす
  return (0.5 - fracFromTop) * hPx * worldPerPx;
}

function MapPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const didInitialCenterRef = useRef(false);  // 初期センタリング（1回だけ）の実行ガード
  const [openFromRated, setOpenFromRated] = useState(false);
  const fromRatedRef = useRef(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // 🔗 商品ページiframe参照（♡状態の同期に使用）
  const iframeRef = useRef(null);

  // スライダーから戻った直後の「一度だけ自動オープン」ガード
  const autoOpenOnceRef = useRef(false);

  // スキャナの開閉（都度起動・都度破棄）
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const lastCommittedRef = useRef({ code: "", at: 0 });   // 直近採用JAN（60秒ガード）
  const unknownWarnedRef = useRef(new Map());             // 未登録JANの警告デバウンス

  // ====== ビュー制御（2D専用）
  const [viewState, setViewState] = useState({
    target: [0, 0, 0],
    zoom: INITIAL_ZOOM,
  });

  // ====== データ & 状態
  const [data, setData] = useState([]);
  const [userRatings, setUserRatings] = useState({});
  const [favorites, setFavorites] = useState({});
  const [userPin, setUserPin] = useState(null);
  const [highlight2D, setHighlight2D] = useState("");
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedJAN, setSelectedJAN] = useState(null);
  const [hideHeartForJAN, setHideHeartForJAN] = useState(null);

  // 設定・再検索スライダー
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);

  // 検索・スキャン
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedJANFromSearch, setSelectedJANFromSearch] = useState(null);

  // 一覧の排他表示制御（♡ と ◎）
  const [isFavoriteOpen, setIsFavoriteOpen] = useState(false);
  const [isRatedOpen, setIsRatedOpen] = useState(false);

  // === 排他オープンのためのユーティリティ ===
  const PANEL_ANIM_MS = 320;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 商品ドロワー／検索／お気に入り／評価 をまとめて閉じ、閉じアニメ分だけ待つ */
  const closeUIsThen = async () => {
    let willClose = false;

    if (productDrawerOpen) {
      setProductDrawerOpen(false);
      setSelectedJAN(null);
      setSelectedJANFromSearch(null); // ハイライトも消す
      willClose = true;
    }
    if (isGuideOpen) { setIsGuideOpen(false); willClose = true; }
    if (isSearchOpen) { setIsSearchOpen(false); willClose = true; }
    if (isFavoriteOpen) { setIsFavoriteOpen(false); willClose = true; }
    if (isRatedOpen) { setIsRatedOpen(false); willClose = true; }

    if (willClose) await wait(PANEL_ANIM_MS);
  };

  // マイページ（●）
  const openMyPageExclusive = async () => {
    if (isMyPageOpen) { setIsMyPageOpen(false); return; }
    await closeUIsThen();
    setIsMyPageOpen(true);
  };

  // ★ クエリで各パネルを開く（/ ?open=mypage|search|favorite|rated）
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      const open = (p.get("open") || "").toLowerCase();
      if (!open) return;
      (async () => {
        await closeUIsThen();
        if (open === "mypage")       { openMyPageExclusive(); }
        else if (open === "search")  { setIsSearchOpen(true); }
        else if (open === "favorite"){ setIsFavoriteOpen(true); }
        else if (open === "rated")   { setIsRatedOpen(true); }
        else if (open === "guide")   { setIsGuideOpen(true); }
        // 再トリガ防止
        navigate(location.pathname, { replace: true });
      })();
    } catch {}
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // スライダー（●）
  const openSliderExclusive = async () => {
    await closeUIsThen();
    navigate("/slider", { state: { from: "map" } });
  };

  // 検索（🔍）
  const openSearchExclusive = async () => {
    if (isSearchOpen) { setIsSearchOpen(false); return; }
    await closeUIsThen();
    setIsSearchOpen(true);
  };

  // お気に入り（♡）
  const openFavoriteExclusive = async () => {
    if (isFavoriteOpen) { setIsFavoriteOpen(false); return; }
    await closeUIsThen();
    setIsFavoriteOpen(true);
  };

  // 評価（◎）
  const openRatedExclusive = async () => {
    if (isRatedOpen) { setIsRatedOpen(false); return; }
    await closeUIsThen();
    setIsRatedOpen(true);
  };

  // ====== パン境界（現在データに基づく）
  const panBounds = useMemo(() => {
    if (!data.length) return { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
    const xs = data.map((d) => d.UMAP1);
    const ys = data.map((d) => -d.UMAP2);
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const pad = 1.5 + Math.abs(CENTER_Y_OFFSET);
    return {
      xmin: xmin - pad,
      xmax: xmax + pad,
      ymin: ymin - pad,
      ymax: ymax + pad,
    };
  }, [data]);

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
              UMAP1: Number(r.UMAP1),
              UMAP2: Number(r.UMAP2),
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
              コメント: r["コメント"] ?? r["comment"] ?? r["説明"] ?? "",
            };
          })
          .filter(
            (r) =>
              Number.isFinite(r.UMAP1) &&
              Number.isFinite(r.UMAP2) &&
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
      if (Number.isFinite(d.UMAP1) && Number.isFinite(d.UMAP2)) {
        sx += d.UMAP1;
        sy += d.UMAP2;
        n++;
      }
    }
    return n ? [sx / n, sy / n] : [0, 0];
  }, [data]);

  // userPin 読み出し（新旧形式サポート）
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

  /** ===== 共通：UMAP座標へセンタリング（Y反転やオフセット込み） ===== */
  const centerToUMAP = useCallback((xUMAP, yUMAP, opts = {}) => {
    if (!Number.isFinite(xUMAP) || !Number.isFinite(yUMAP)) return;
    const yCanvas = -yUMAP;
    const zoomTarget = Math.max(
      ZOOM_LIMITS.min,
      Math.min(ZOOM_LIMITS.max, opts.zoom ?? INITIAL_ZOOM)
    );
    const yOffset = getYOffsetWorld(zoomTarget, CENTER_Y_FRAC);
    setViewState((prev) => ({
      ...prev,
      target: [xUMAP, yCanvas - yOffset, 0],
      zoom: zoomTarget,
    }));
  }, []);

  // ★ データが入ったら「最初の1回だけ」BlendF にセンタリング
  useEffect(() => {
    if (didInitialCenterRef.current) return;    // もうやっていたら何もしない
    if (!Array.isArray(data) || data.length === 0) return;

    // 既に他の意図的なセンタリング（スライダー戻りなど）がある場合はそれを優先したいなら、
    // そのフラグをここでチェックして return してください（必要なければこのままでOK）。

    const b = data.find((d) => String(d.JAN) === "blendF");
    if (b && Number.isFinite(b.UMAP1) && Number.isFinite(b.UMAP2)) {
      centerToUMAP(b.UMAP1, b.UMAP2, { zoom: INITIAL_ZOOM });
      didInitialCenterRef.current = true;
      return;
    }
    // BlendF が無い時は重心へフォールバック
    const [cx, cy] = umapCentroid;
    centerToUMAP(cx, cy, { zoom: INITIAL_ZOOM });
     didInitialCenterRef.current = true;
  }, [data, centerToUMAP, umapCentroid]);

  // 初回センタリング（userPin 指定時）
  useEffect(() => {
    if (!userPin) return;
    const shouldCenter = !!location.state?.centerOnUserPin;
    if (shouldCenter) {
      centerToUMAP(userPin[0], userPin[1], { zoom: INITIAL_ZOOM });
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {}
    }
  }, [userPin, location.state, centerToUMAP]);

  /** === SliderPage「閉じる」→ blendF に戻る要求を処理 === */
  useEffect(() => {
    const fromState = !!location.state?.centerOnBlendF;
    const raw = sessionStorage.getItem("tm_center_umap");

    if (!fromState && !raw) return;
    if (!Array.isArray(data) || data.length === 0) return; // データ待ち

    let targetX = null, targetY = null;

    try {
      if (raw) {
        const payload = JSON.parse(raw);
        if (Number.isFinite(payload?.x) && Number.isFinite(payload?.y)) {
          targetX = Number(payload.x);
          targetY = Number(payload.y);
        }
      }
    } catch {}

    // payload が無い/不正なときはデータから blendF を検索
    if (targetX == null || targetY == null) {
      const b = data.find((d) => String(d.JAN) === "blendF");
      if (b && Number.isFinite(b.UMAP1) && Number.isFinite(b.UMAP2)) {
        targetX = b.UMAP1;
        targetY = b.UMAP2;
      }
    }

    if (targetX != null && targetY != null) {
      centerToUMAP(targetX, targetY, { zoom: INITIAL_ZOOM });
    }

    // 一度だけ消費
    sessionStorage.removeItem("tm_center_umap");
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch {}
  }, [location.state, data, centerToUMAP]);

  // クリック座標から最近傍検索（自動オープン用）
  const findNearestWine = useCallback((coord) => {
    if (!coord || !Array.isArray(data) || data.length === 0) return null;
    const [cx, cy] = coord;
    let best = null, bestD2 = Infinity;
    for (const d of data) {
      const x = d.UMAP1;
      const y = -d.UMAP2;
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = d;
      }
    }
    return best;
  }, [data]);

  // スライダー直後だけ：オレンジ打点の最寄り商品を自動で開く
  useEffect(() => {
    const wantAutoOpen =
      sessionStorage.getItem("tm_autopen_nearest") === "1";

    if (!wantAutoOpen) return;
    if (autoOpenOnceRef.current) return;
    if (!userPin || !Array.isArray(data) || data.length === 0) return;

    autoOpenOnceRef.current = true;
    sessionStorage.removeItem("tm_autopen_nearest");

    setIsSearchOpen(false);
    setIsFavoriteOpen(false);
    setIsRatedOpen(false);

    requestAnimationFrame(() => {
      try {
        const canvasCoord = [userPin[0], -userPin[1]];
        const nearest = findNearestWine(canvasCoord);
        if (nearest?.JAN) {
          setHideHeartForJAN(null); // ← 追加：自動オープン時も解除
          setSelectedJAN(nearest.JAN);
          setSelectedJANFromSearch(null);
          setProductDrawerOpen(true);
          focusOnWine(nearest, { zoom: INITIAL_ZOOM });
        }
      } catch (e) {
        console.error("auto-open-nearest failed:", e);
      }
    });
  }, [location.key, userPin, data, findNearestWine]); // ← 依存に findNearestWine を追加

  // ====== 共通：商品へフォーカス
  const focusOnWine = useCallback((item, opts = {}) => {
    if (!item) return;
    const tx = Number(item.UMAP1);
    const tyUMAP = Number(item.UMAP2);
    if (!Number.isFinite(tx) || !Number.isFinite(tyUMAP)) return;

    setViewState((prev) => {
      // ① ズームは opts.zoom 未指定なら据え置き
      const wantZoom = opts.zoom;
      const zoomTarget = (wantZoom == null)
        ? prev.zoom
        : Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, wantZoom));
      const yOffset = getYOffsetWorld(zoomTarget, CENTER_Y_FRAC);

      // ② ターゲットは opts.recenter === false のとき据え置き
      const keepTarget = opts.recenter === false;
      const nextTarget = keepTarget
        ? prev.target
        : [tx, -tyUMAP - yOffset, 0];

      return { ...prev, target: nextTarget, zoom: zoomTarget };
    });
  }, []);

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
      const msg = e?.data || {};
      const { type } = msg || {};
      if (!type) return;

      // --- 共通ユーティリティ ---
      const sendSnapshotToChild = (janStr, nextRatingObj) => {
        try {
          const isFav = !!favorites[janStr];
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: "STATE_SNAPSHOT",
              jan: janStr,
              favorite: isFav,
              rating: nextRatingObj || userRatings[janStr] || null,
              hideHeart: hideHeartForJAN === janStr,
            },
            "*"
          );
          if (hideHeartForJAN === janStr) {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "HIDE_HEART", jan: janStr, value: true },
              "*"
           );
          }
        } catch {}
      };

      // === 1) マイアカウントへ遷移してほしい
      if (type === "OPEN_MYACCOUNT") {
        (async () => {
          await closeUIsThen();
          navigate("/my-account");
        })();
        return;
      }

      // 以降は jan が必要
      const janStr = String(msg.jan || "");
      if (!janStr) return;

      // === 2) 旧方式：お気に入りトグル
      if (type === "TOGGLE_FAVORITE") {
        // 既存のユーティリティで切替（子にも反映）
       toggleFavorite(janStr);
        // スナップショット返信
        sendSnapshotToChild(janStr);
        return;
      }

      // === 3) 旧方式：評価更新（payload: {rating, date, ...}）
      if (type === "RATING_UPDATED") {
        const payload = msg.payload || null;
        setUserRatings((prev) => {
          const next = { ...prev };
          if (!payload || !payload.rating) delete next[janStr];
          else next[janStr] = payload;
          try { localStorage.setItem("userRatings", JSON.stringify(next)); } catch {}
          return next;
        });

        // 評価>0なら「赤」より「黒」を優先：お気に入りから外す（仕様に合わせる）
        if (payload && Number(payload.rating) > 0) {
          setFavorites((prev) => {
            if (!prev[janStr]) return prev;
            const next = { ...prev };
            delete next[janStr];
            try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
            return next;
          });
          // 子iframeのハートUIも同期
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

      // === 4) 新方式：お気に入り更新（即時反映）
      if (type === "tm:fav-updated") {
       const isFavorite = !!msg.isFavorite;
        setFavorites((prev) => {
          const next = { ...prev };
          if (isFavorite) next[janStr] = { addedAt: new Date().toISOString() };
          else delete next[janStr];
          try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
          return next;
        });

        // お気に入りだけでは色は赤、ただし評価が既にあるなら黒優先（後段の色判定に委ねる）
       sendSnapshotToChild(janStr);
        return;
      }

      // === 5) 新方式：評価更新（即時反映）
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

        // 評価>0 を入れたら「赤より黒」を優先 → お気に入りから外す
        if (rating > 0) {
          setFavorites((prev) => {
            if (!prev[janStr]) return prev;
            const next = { ...prev };
            delete next[janStr];
            try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
            return next;
          });
          // 子iframeのハートUIも同期
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

      // === 6) 子からの状態要求（互換維持）
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
    openMyPageExclusive,
  ]);

  // 評価の有無
  const hasAnyRating = useMemo(
    () => Object.values(userRatings || {}).some((v) => Number(v?.rating) > 0),
    [userRatings]
  );

  // ===== 嗜好コンパス（DeckGLは MapCanvas 側で描画）
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
        if (!it || !Number.isFinite(it.UMAP1) || !Number.isFinite(it.UMAP2)) return null;
        return { ...r, x: it.UMAP1, y: it.UMAP2 };
      })
      .filter(Boolean);
    if (joined.length === 0) return { point: null, picked: [], rule: "elbow" };

    joined.sort((a, b) => b.rating - a.rating);

    const n = joined.length;
    const scores = joined.map((r) => r.rating);
    const kelbow = detectElbowIndex(scores);
    const picked = joined.slice(0, Math.min(kelbow, n));

    let sw = 0, sx = 0, sy = 0;
    picked.forEach((p) => { sw += p.rating; sx += p.rating * p.x; sy += p.rating * p.y; });
    if (sw <= 0) return { point: null, picked, rule: "elbow" };
    return { point: [sx / sw, sy / sw], picked, rule: "elbow" };
  }, [userRatings, data]);

  // ====== レンダリング
  return (
    <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }}>
      {/* デッキGLは分離済み */}
      <MapCanvas
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
          setHideHeartForJAN(null); // ← 追加：◎経由以外は解除
          setSelectedJAN(item.JAN);
          setProductDrawerOpen(true);
          focusOnWine(item, { recenter: false });
        }}
        edgeMarginXPx={50}   // 横の「ギリ見える」マージン(px)
        edgeMarginYPx={400}  // 縦の「ギリ見える」マージン(px)
      />

      {/* 左上: 指標セレクタ（2Dハイライト） */}
      <select
        value={highlight2D}
        onChange={(e) => setHighlight2D(e.target.value)}
        style={{ 
          position: "absolute", 
          top: "10px", 
          left: "10px", 
          zIndex: 10, 
          padding: "6px", 
          fontSize: "10px",
          color: "#000",
          backgroundColor: "#fff",
        }}
      >
        <option value="">Mapガイド</option>
        <option value="PC2">Sweet</option>
        <option value="PC1">Body</option>
        <option value="PC3">PC3</option>
      </select>

      {/* 左下: マイページ（設定）ボタン */}
      <button
        onClick={openMyPageExclusive}
        style={{
          position: "absolute",
          left: "12px",
          bottom: "max(12px, env(safe-area-inset-bottom))", 
          top: "auto",
          right: "auto",
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
          src={`${process.env.PUBLIC_URL || ""}/img/guide.svg`}
          alt=""
          style={{
           width: "100%",            // ← 枠いっぱいにフィット
           height: "100%",
           objectFit: "contain",
           display: "block",
           pointerEvents: "none",
          }}
          draggable={false}
        />
      </button>

      <MyPagePanel
        isOpen={isMyPageOpen}
        onClose={() => setIsMyPageOpen(false)}
        onOpenSlider={openSliderExclusive}
      />

      <button
        onClick={openSearchExclusive}
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
          style={{
            width: "100%",            // ← 枠いっぱいにフィット
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </button>

      {/* 右サイドの丸ボタン群（♡ → ◎） */}
      <button
        onClick={openFavoriteExclusive}
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
          style={{
            width: "100%",            // ← 枠いっぱいにフィット
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </button>

      <button
        onClick={openRatedExclusive}
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
          style={{
            width: "100%",            // ← 枠いっぱいにフィット
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </button>

      {/* ====== 検索パネル（背面Map操作可） */}
      <SearchPanel
        open={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        data={data}
        onPick={(item) => {
          if (!item) return;
          setOpenFromRated(false);
          setHideHeartForJAN(null);  // ← 検索からは隠さない
          setSelectedJANFromSearch(null);
          setSelectedJAN(item.JAN);
          setProductDrawerOpen(true);
          // フォーカス
          const tx = Number(item.UMAP1), ty = Number(item.UMAP2);
          if (Number.isFinite(tx) && Number.isFinite(ty)) {
            centerToUMAP(tx, ty, { zoom: viewState.zoom });
          }
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
          // --- EAN-13 検証 ---
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
            setHideHeartForJAN(null); // ← 追加：スキャナ経由は解除
            setSelectedJAN(hit.JAN);
            setProductDrawerOpen(true);
            // 採用記録（勝手な再出現を防ぐ）
            lastCommittedRef.current = { code: jan, at: now };
            // フォーカス
            const tx = Number(hit.UMAP1), ty = Number(hit.UMAP2);
            if (Number.isFinite(tx) && Number.isFinite(ty)) {
              centerToUMAP(tx, ty, { zoom: INITIAL_ZOOM });
            }
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
        isOpen={isFavoriteOpen}
        onClose={() => { setIsFavoriteOpen(false); }}
        favorites={favorites}
        data={data}
        userRatings={userRatings}
        onSelectJAN={(jan) => {
          setOpenFromRated(false);
          setHideHeartForJAN(null);  // ← 隠さない
          setSelectedJANFromSearch(null);
          setSelectedJAN(jan);
          const item = data.find((d) => String(d.JAN) === String(jan));
          if (item) {
            const tx = Number(item.UMAP1), ty = Number(item.UMAP2);
            if (Number.isFinite(tx) && Number.isFinite(ty)) {
              centerToUMAP(tx, ty, { zoom: INITIAL_ZOOM });
            }
          }
          setProductDrawerOpen(true);
        }}
      />

      {/* 評価（◎）一覧パネル */}
      <RatedPanel
        isOpen={isRatedOpen}
        onClose={() => { setIsRatedOpen(false); }}
        userRatings={userRatings}
        data={data}
        onSelectJAN={(jan) => {
          setOpenFromRated(true);    // ◎から開いたフラグ
          fromRatedRef.current = true;
          try { sessionStorage.setItem('tm_from_rated_jan', String(jan)); } catch {}
          setHideHeartForJAN(String(jan)); // ← このJANは♡を隠す

          setSelectedJANFromSearch(null);
          setSelectedJAN(jan);
          const item = data.find((d) => String(d.JAN) === String(jan));
          if (item) {
            const tx = Number(item.UMAP1), ty = Number(item.UMAP2);
            if (Number.isFinite(tx) && Number.isFinite(ty)) {
              centerToUMAP(tx, ty, { zoom: INITIAL_ZOOM });
            }
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
            setSelectedJANFromSearch(null);
            setHideHeartForJAN(null);
          }}
          ModalProps={drawerModalProps}
          PaperProps={{
            style: {
             ...paperBaseStyle,
              // 上端の細枠を追加（お好みで）
              borderTop: "1px solid #c9c9b0"
            }
          }}
        >
       {/* ▼ ヘッダーを置き換え */}
        <PanelHeader
          title="商品ページ"
               icon="dot.svg"
               onClose={() => {
                  setProductDrawerOpen(false);
                  setSelectedJAN(null);
                 setSelectedJANFromSearch(null);
                 setHideHeartForJAN(null);
              }}
        />

        {/* ▼ スクロール領域（ラッパ） */}
        <div className="drawer-scroll">
          {selectedJAN ? (
            <iframe
             ref={iframeRef}
              className="product-iframe"
              title={`product-${selectedJAN}`}
              src={(() => {
                const jan = String(selectedJAN ?? "");
                   const fromRated = hideHeartForJAN === jan;
                   const params = new URLSearchParams();
                   if (fromRated) params.set("fromRated", "1");
                   params.set("embed", "1");          // ★ 埋め込みモード
                   const qs = params.toString();
                   const base = (process.env.PUBLIC_URL || "") || window.location.origin;
                   return `${base}/#/products/${jan}${qs ? `?${qs}` : ""}`;
                 })()}
              onLoad={() => {
                const jan = String(selectedJAN);
                const isFav = !!favorites[jan];
                try {
                 requestAnimationFrame(() => {
                   iframeRef.current?.contentWindow?.postMessage(
                     { type: "SET_FAVORITE", jan, value: isFav },
                     "*"
                   );
                   if (hideHeartForJAN === jan) {
                     iframeRef.current?.contentWindow?.postMessage(
                       { type: "HIDE_HEART", jan, value: true },
                       "*"
                     );
                   }
                 });
               } catch {}
              }}
            />
          ) : (
            <div style={{ padding: 16 }}>商品を選択してください。</div>
          )}
        </div>
      </Drawer>
      {/* ===== Mapの見方（ガイド）ドロワー：商品/一覧と同サイズ ===== */}
      <Drawer
        anchor="bottom"
        open={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        ModalProps={drawerModalProps}
        PaperProps={{ style: { ...paperBaseStyle, borderTop: "1px solid #c9c9b0" } }}
      >
        <PanelHeader
          title="TasteMap（ワイン風味マップ）とは？"
          icon="map.svg"
          onClose={() => setIsGuideOpen(false)}
        />

        <div className="drawer-scroll" style={{ padding: 16, lineHeight: 1.6, color: "#333" }}>
          {/* 概要 */}
          <p style={{ margin: "2px 0 14px" }}>
            この地図は、ワインの「色・香り・味」を科学的に数値化し、似ているもの同士が近くに並ぶよう配置した“ワイン風味の地図”です。
            近い点ほど風味が似ており、離れるほど個性が異なります。地図上のコンパスはあなたの嗜好位置を示します。
          </p>

          {/* 凡例 */}
          <div style={{ marginTop: 4, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>凡例</div>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>灰色の点：取扱いワインの位置（嗜好に近いほど近くに並びます）</li>
              <li>赤の点：飲みたい（★）にしたワイン</li>
              <li>黒の点：飲んで評価（◎）済みのワイン</li>
              <li>コンパス：あなたの現在の嗜好位置（飲んで評価から生成）</li>
            </ul>
          </div>

          {/* 操作＆バブルガイド */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>使い方</div>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>点をタップ：商品ページを表示</li>
              <li>ピンチで拡大縮小、ドラッグで移動</li>
              <li>右上 🔍：検索　／　右の ★・◎：飲みたい／飲んだ一覧</li>
            </ul>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Mapガイド（バブル表示）</div>
            <p style={{ margin: "0 0 6px" }}>
              左上のMapガイドでは、風味やトレンドの“偏り”をバブルで可視化します。
              大きなバブルは、たとえるなら街の広場に人が集まってにぎわう様子。例えば「甘味が豊かなワイン」「フルーティなワイン」がその周辺に多いことを示します。
              小さなバブルは、ひっそりした小さな村のように控えめな存在です。
              地図を眺めるだけで「どんな特徴がどこに集まっているか」「いまどの傾向が盛り上がっているか」を直感的に把握できます。
            </p>
          </div>

          {/* 備考 */}
          <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
            ※ マス目は位置の目安です。座標軸そのものに意味はありません。
          </p>
        </div>
      </Drawer>
    </div>
  );
}

export default MapPage;
