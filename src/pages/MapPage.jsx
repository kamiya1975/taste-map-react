// src/MapPage.js
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Drawer from "@mui/material/Drawer";

import MapGuidePanelContent from "../components/panels/MapGuidePanelContent";
import SearchPanel from "../components/panels/SearchPanel";
import BarcodeScanner from "../components/BarcodeScanner";
import RatedPanel from "../components/panels/RatedPanel";
import MyAccountPanelContent from "../components/panels/MyAccountPanelContent";
import MapCanvas from "../components/map/MapCanvas";
import PanelHeader from "../components/ui/PanelHeader";
import StorePanelContent from "../components/panels/StorePanelContent";
import FaqPanelContent from "../components/panels/FaqPanelContent";
import MyPagePanelContent from "../components/panels/MyPagePanelContent";
import ClusterPalettePanel from "../components/panels/ClusterPalettePanel";
import SimpleCartPanel from "../components/panels/SimpleCartPanel";
import { useSimpleCart } from "../cart/simpleCart";
import { 
  drawerModalProps, 
  paperBaseStyle, 
  ZOOM_LIMITS, 
  INITIAL_ZOOM, 
  CENTER_Y_OFFSET, 
  DRAWER_HEIGHT,
  API_BASE,
  TASTEMAP_POINTS_URL,
  getReferenceLotById,
} from "../ui/constants";
import { getLotId } from "../utils/lot";
import { fetchLatestRatings } from "../lib/appRatings";

//現在のメイン店舗IDを取得
const getCurrentMainStoreId = () => {
  try {
    // ★ 初回店舗設定を最優先
    const raw =
      localStorage.getItem("selectedStore") ||
      localStorage.getItem("main_store");
    if (raw) {
      const s = JSON.parse(raw);
      const id = Number(s?.id ?? s?.store_id ?? 0);
      if (id > 0) return id;
    }

    // ② 新方式（ログイン後）
    const v1 = Number(localStorage.getItem("app.main_store_id") || "0");
    if (v1 > 0) return v1;

    // ③ 旧方式（互換）
    const v2 = Number(localStorage.getItem("store.mainStoreId") || "0");
    if (v2 > 0) return v2;

  } catch (e) {
    console.warn("getCurrentMainStoreId error:", e);
  }

  // ④ デフォルトの EC ショップ
  return 1;
};

// ★ allowed-jans 取得エラー時に表示
let allowedJansErrorShown = false;

const showAllowedJansErrorOnce = () => {
  if (allowedJansErrorShown) return;
  allowedJansErrorShown = true;
  try {
    alert("allowed-jans の取得に失敗しました。全件表示にフォールバックします。");
  } catch (e) {
    console.warn("allowed-jans error (alert failed)", e);
  }
};

// ★ 指定店舗IDの allowed_jans を取得する共通ヘルパー（未ログイン想定）
async function fetchAllowedJansForStore(storeId) {
  if (!storeId) return null;

  const params = new URLSearchParams();
  params.set("stores", String(storeId));

  const res = await fetch(
    `${API_BASE}/api/app/allowed-jans?${params.toString()}`
  );

  if (!res.ok) {
    throw new Error(
      `allowed-jans(stores=${storeId}) HTTP ${res.status}`
    );
  }

  const json = await res.json();
  const arr = Array.isArray(json.allowed_jans)
    ? json.allowed_jans.map(String)
    : null;

  return (arr && arr.length > 0) ? arr : null;
}

// ★ メイン店舗（＋ログイン状態）に応じて allowed_jans を取得
//    - まず「ユーザーが選んだ店舗」で取得を試みる
//    - 失敗 or 0件なら「公式Shop(ID=1)」で再トライ
//    - それもダメな場合のみ null を返し、全件表示にフォールバック
async function fetchAllowedJansAuto() {
  const mainStoreId = getCurrentMainStoreId();

  let token = "";
  try {
    token = localStorage.getItem("app.access_token") || "";
  } catch {}

  // -----------------------------
  // ① 未ログイン or トークンなし
  // -----------------------------
  if (!token) {
    // ①-1. ユーザーが選んだ店舗IDで試す
    if (mainStoreId && mainStoreId !== 1) {
      try {
        const arr = await fetchAllowedJansForStore(mainStoreId);
        if (arr && arr.length > 0) {
          return arr;
        }
      } catch (e) {
        console.warn(
          `allowed-jans(stores=${mainStoreId}) の取得に失敗 → 公式Shopにフォールバック`,
          e
        );
      }
    }

    // ①-2. 公式Shop(ID=1)で再トライ
    try {
      console.warn("allowed-jans: fallback to official store (id=1)");
      const fallback = await fetchAllowedJansForStore(1);
      if (fallback && fallback.length > 0) {
        return fallback;
      }
    } catch (e) {
      console.warn(
        "allowed-jans(stores=1) の取得にも失敗 → 全件表示にフォールバック",
        e
      );
      showAllowedJansErrorOnce();
      return null;
    }

    // ここに来ることはほぼないが保険
    showAllowedJansErrorOnce();
    return null;
  }

  // -----------------------------
  // ② ログイン済み
  // -----------------------------
  // ②-1. 通常は /allowed-jans/auto でユーザー＋メイン店舗ベースの集合を取得
  try {
    const url =
      `${API_BASE}/api/app/allowed-jans/auto` +
      `?include_ec=true&main_store_id=${mainStoreId || ""}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const json = await res.json();
      const arr = Array.isArray(json.allowed_jans)
        ? json.allowed_jans.map(String)
        : null;
      if (arr && arr.length > 0) {
        return arr;
      }
      console.warn(
        "allowed-jans/auto は成功したが allowed_jans が空 → 公式Shopにフォールバック"
      );
    } else {
      console.warn(`allowed-jans/auto HTTP ${res.status} → 公式Shopにフォールバック`);
    }
  } catch (e) {
    console.warn("allowed-jans/auto の取得に失敗 → 公式Shopにフォールバック", e);
  }

  // ②-2. ログイン済みだが、公式Shop(ID=1) の取扱JANで再トライ
  try {
    console.warn("allowed-jans/auto 失敗のため allowed-jans(stores=1) を使用");
    const fallback = await fetchAllowedJansForStore(1);
    if (fallback && fallback.length > 0) {
      return fallback;
    }
  } catch (e) {
    console.warn(
      "allowed-jans(stores=1) の取得にも失敗 → 全件表示にフォールバック",
      e
    );
    showAllowedJansErrorOnce();
    return null;
  }

  showAllowedJansErrorOnce();
  return null;
}

const REREAD_LS_KEY = "tm_reread_until";
const CENTER_Y_FRAC = 0.85; // 0.0 = 画面最上端, 0.5 = 画面の真ん中
const ANCHOR_JAN = "4964044046324";
const UI_Z_TOP = 2400;

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

function CartProbe() {
  const { totalQty, subtotal, items } = useSimpleCart();
  return (
    <pre style={{
      position: "absolute", left: 8, bottom: 8, zIndex: 9999,
      background: "#000", color: "#0f0", fontSize: 12,
      padding: 6, borderRadius: 6, opacity: .85
    }}>
      {JSON.stringify({
        totalQty,
        subtotal,
        linesLen: Array.isArray(items) ? items.length : -1
      }, null, 2)}
    </pre>
  );
}

function MapPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // ★ ログインユーザー名（ニックネーム）表示用
  const [userDisplayName, setUserDisplayName] = useState("");

  useEffect(() => {
    const readUserFromStorage = () => {
      try {
        const appUserStr = localStorage.getItem("app.user");
        if (appUserStr) {
          const u = JSON.parse(appUserStr);
          const name =
            (u && (u.display_name || u.nickname || u.name)) || "";
          setUserDisplayName(name);
          return;
        }
        // 旧キーのフォールバック
        const legacy = localStorage.getItem("user.nickname") || "";
        setUserDisplayName(legacy);
      } catch {
        setUserDisplayName("");
      }
    };

    readUserFromStorage();

    // フォーカス戻りや別タブでのログイン変更を拾う
    window.addEventListener("focus", readUserFromStorage);
    window.addEventListener("storage", readUserFromStorage);
    return () => {
      window.removeEventListener("focus", readUserFromStorage);
      window.removeEventListener("storage", readUserFromStorage);
    };
  }, []);

  // ★ ロット → 基準ワイン座標
  const lotId = getLotId();
  const reference = useMemo(() => getReferenceLotById(lotId), [lotId]);

  const basePoint = useMemo(
    () =>
      reference
        ? {
            x: reference.umap_x,
            y: reference.umap_y,
            lotId: reference.lotId,
          }
        : null,
    [reference]
  );

  // ---- Refs ----
  const didInitialCenterRef = useRef(false);
  const deckRef = useRef(null);
  const iframeRef = useRef(null);
  const autoOpenOnceRef = useRef(false);
  const lastCommittedRef = useRef({ code: "", at: 0 });
  const unknownWarnedRef = useRef(new Map());

  // ---- Drawer 状態（すべて明示）----
  const [isMyPageOpen,   setIsMyPageOpen]   = useState(false); // アプリガイド（メニュー）
  const [isSearchOpen,   setIsSearchOpen]   = useState(false); // 検索
  const [isRatedOpen,    setIsRatedOpen]    = useState(false); // 評価（◎）
  const [isMapGuideOpen, setIsMapGuideOpen] = useState(false); // マップガイド（オーバーレイ）
  const [isStoreOpen,    setIsStoreOpen]    = useState(false); // お気に入り店舗登録（オーバーレイ）
  const [isAccountOpen,  setIsAccountOpen]  = useState(false); // マイアカウント（メニュー）
  const [isFaqOpen,      setIsFaqOpen]      = useState(false); // よくある質問（メニュー）
  const [isClusterOpen,  setIsClusterOpen]  = useState(false); // クラスタ配色パネル
  const [cartOpen,       setCartOpen]       = useState(false); // カート
  const [isScannerOpen,  setIsScannerOpen]  = useState(false); // バーコードスキャナ

  // ---- SimpleCart（ローカル）----
  const { totalQty, add: addLocal } = useSimpleCart();

  // ✅ Shopify チェックアウト復帰時のローカル掃除
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("from") === "checkout") {
        localStorage.removeItem("tm_cart_stage_v1");
        localStorage.removeItem("tm_cart_local_v1");
        alert("ご注文ありがとうございました。続けてお買い物いただけます。");
        url.searchParams.delete("from");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}
  }, []);

  // ---- Map / DeckGL の初期 viewState ----
  const [viewState, setViewState] = useState({ target: [0, 0, 0], zoom: INITIAL_ZOOM });

  // データ & 状態
  const [data, setData] = useState([]);
  const [userRatings, setUserRatings] = useState({});
  const [favorites, setFavorites] = useState({});
  const [userPin, setUserPin] = useState(null);
  const [highlight2D, setHighlight2D] = useState("");
  const [selectedJAN, setSelectedJAN] = useState(null);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [hideHeartForJAN, setHideHeartForJAN] = useState(null);
  const [iframeNonce, setIframeNonce] = useState(0);

  useEffect(() => {
    if (!isRatedOpen) return;

    // 未ログインなら同期しない
    const token = (() => {
      try {
        return localStorage.getItem("app.access_token") || "";
      } catch {
        return "";
      }
    })();
   if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetchLatestRatings("date");
        if (cancelled) return;

        const nextMap = {};
        for (const item of res.items || []) {
          if (item.rating > 0) {
            nextMap[item.jan_code] = {
              rating: item.rating,
              date: item.created_at,
            };
          }
        }
        setUserRatings(nextMap);
        try {
          localStorage.setItem("userRatings", JSON.stringify(nextMap));
       } catch {}
      } catch (e) {
        console.error("評価一覧の同期に失敗しました", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isRatedOpen]);

  // クラスタ配色
  const [clusterColorMode, setClusterColorMode] = useState(false);
  const [clusterCollapseKey, setClusterCollapseKey] = useState(null);

  /** ===== UMAP座標へセンタリング ===== */
  const centerToUMAP = useCallback((xUMAP, yUMAP, opts = {}) => {
    if (!Number.isFinite(xUMAP) || !Number.isFinite(yUMAP)) return;
    const yCanvas = -yUMAP;
    // 既定は最小ズーム。維持したい時だけ opts.keepZoom=true を明示
    const baseZoom = opts.keepZoom ? (opts.zoom ?? viewState.zoom ?? INITIAL_ZOOM) : ZOOM_LIMITS.min;
    const zoomTarget = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, baseZoom));
    const yOffset = getYOffsetWorld(zoomTarget, CENTER_Y_FRAC);
    setViewState((prev) => ({ ...prev, target: [xUMAP, yCanvas - yOffset, 0], zoom: zoomTarget }));
  }, [viewState.zoom]);

  // クラスタ重心に移動
  const centerToCluster = useCallback((clusterId) => {
    const cid = Number(clusterId);
    if (!Array.isArray(data) || data.length === 0 || !Number.isFinite(cid)) return;
    const items = data.filter(d => Number(d.cluster) === cid);
    if (!items.length) return;
    const sx = items.reduce((s, d) => s + Number(d.umap_x || 0), 0);
    const sy = items.reduce((s, d) => s + Number(d.umap_y || 0), 0);
    const cx = sx / items.length;
    const cy = sy / items.length;
    // 色分けがOFFならONにしておく（任意）
    setClusterColorMode(true);
    centerToUMAP(cx, cy); // 既定で最小ズーム
  }, [data, centerToUMAP]);

  // ユニークな cluster 値 → 初期色を決定
  const clusterList = useMemo(() => {
    const s = new Set();
    (data || []).forEach(d => Number.isFinite(d.cluster) && s.add(Number(d.cluster)));
    return Array.from(s).sort((a,b)=>a-b);
  }, [data]);

 // ===== パネル開閉ユーティリティー
  const PANEL_ANIM_MS = 260;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** まとめて閉じ、閉じアニメ分だけ待つ（preserveMyPage=true ならメニューは残す） */
  const closeUIsThen = useCallback(async (opts = {}) => {
    const {
      preserveMyPage = false,
      preserveRated = false,
      preserveSearch   = false,
      preserveCluster = false,
    } = opts;
    let willClose = false;

    if (productDrawerOpen) {
      setProductDrawerOpen(false);
      setSelectedJAN(null);
      willClose = true;
    }
    if (isMapGuideOpen)  { setIsMapGuideOpen(false);  willClose = true; }
    if (isStoreOpen)     { setIsStoreOpen(false);     willClose = true; }
    if (isSearchOpen && !preserveSearch) { setIsSearchOpen(false); willClose = true; }
    if (isRatedOpen && !preserveRated)        { setIsRatedOpen(false);     willClose = true; }
    if (isAccountOpen)   { setIsAccountOpen(false);   willClose = true; }
    if (isFaqOpen)       { setIsFaqOpen(false);       willClose = true; }

    // ★ クラスタパネルは preserveCluster=true のときは閉じない
    if (isClusterOpen && !preserveCluster) { 
      setIsClusterOpen(false);
      setClusterCollapseKey(null);
      willClose = true; 
    }

    if (!preserveMyPage && isMyPageOpen) { setIsMyPageOpen(false); willClose = true; }
    if (cartOpen) { setCartOpen(false); willClose = true;}

    if (willClose) await wait(PANEL_ANIM_MS);
  }, [
    productDrawerOpen,
    isMapGuideOpen,
    isStoreOpen,
    isSearchOpen,
    isRatedOpen,
    isMyPageOpen,
    isAccountOpen,
    isFaqOpen,
    isClusterOpen,
    cartOpen,
  ]);

  /** 通常の相互排他オープン（メニュー含め全部調停して開く） */
  const openPanel = useCallback(async (kind) => {
    // ★ cluster 以外を開くとき、クラスターパネルが開いていれば「畳む」合図を送る
    if (kind !== "cluster" && isClusterOpen) {
      setClusterCollapseKey((k) => (k == null ? 1 : k + 1));
    }

    // ★ クラスタパネルは閉じずに残す
    await closeUIsThen({ preserveCluster: true });

    if (kind === "mypage")       setIsMyPageOpen(true);
    else if (kind === "mapguide" || kind === "guide") setIsMapGuideOpen(true);
    else if (kind === "store")    setIsStoreOpen(true);
    else if (kind === "search")  setIsSearchOpen(true);
    else if (kind === "rated")   setIsRatedOpen(true);
    else if (kind === "cluster")  setIsClusterOpen(true);
    else if (kind === "cart") setCartOpen(true);
  }, [closeUIsThen, isClusterOpen]);

  /** メニューを開いたまま、上に重ねる版（レイヤー表示用） */
  const openOverlayAboveMenu = useCallback(async (kind) => {
     await closeUIsThen({ preserveMyPage: true, preserveCluster: true });
    if (kind === "mapguide") setIsMapGuideOpen(true);
    else if (kind === "store") setIsStoreOpen(true);
    else if (kind === "guide") setIsMapGuideOpen(true);
    else if (kind === "account") setIsAccountOpen(true);
    else if (kind === "faq") setIsFaqOpen(true);
    else if (kind === "cart") setCartOpen(true);
  }, [closeUIsThen]);

  // ★ クエリで各パネルを開く（/ ?open=mypage|search|rated|mapguide|guide|store）
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

  // ====== データ読み込み（店舗の取扱 JAN でフィルタ）=====
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // ① ログイン & 店舗設定済みなら、allowed-jans/auto から取扱 JAN を取得
       let allowedSet = null;
       try {
         const allowed = await fetchAllowedJansAuto();
         if (Array.isArray(allowed) && allowed.length > 0) {
           allowedSet = new Set(allowed.map(String));
         }
       } catch (e) {
         console.warn(
           "allowed-jans 系の取得に失敗（公式Shop フォールバックも失敗）→ 全件表示:",
           e
         );
         showAllowedJansErrorOnce();
       }

        // ② 風味データ本体（UMAP 座標 JSON）
        const url = TASTEMAP_POINTS_URL; // ← SliderPage と同じ URL を参照
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        if (cancelled) return;

        // ③ 正規化 & フィルタ
        const num = (v) =>
          v === "" || v == null ? NaN : Number(v);

        const cleaned = (rows || [])
          .filter(Boolean)
          .map((r) => {
            const jan = String(r.jan_code ?? r.JAN ?? "");
 
            const umap_x = num(r.umap_x);
            const umap_y = num(r.umap_y);
            const cluster = num(r.cluster);
 
            // ★ 小文字 pc1/2/3 を優先しつつ、旧PC1/2/3 もフォールバック
            const pc1 = num(r.pc1 ?? r.PC1);
            const pc2 = num(r.pc2 ?? r.PC2);
            const pc3 = num(r.pc3 ?? r.PC3);
 
            return {
              JAN: jan,
              jan_code: jan,
              Type: r.wine_type ?? "Other",
              umap_x,
              umap_y,
              cluster,
              UMAP1: umap_x,
              UMAP2: umap_y,
              PC1: pc1,
              PC2: pc2,
              PC3: pc3,
              pc1,
              pc2,
              pc3,
              商品名: r["temp_name"],
              国: r["国"],
              産地: r["産地"],
              葡萄品種: r["葡萄品種"],
              生産年: r["生産年"],
              "容量 ml": num(r["容量 ml"]),
              希望小売価格: num(r["希望小売価格"]),
              コメント: r["コメント"] ?? r["comment"] ?? r["説明"] ?? "",
            };
          })
          .filter((r) => {
            if (!Number.isFinite(r.umap_x) || !Number.isFinite(r.umap_y)) return false;
            if (!r.jan_code) return false;
            // ログイン済み & 店舗選択済みなら、その店舗の取扱 JAN だけ残す
            if (allowedSet && !allowedSet.has(String(r.jan_code))) return false;
            return true;
          });

        if (cancelled) return;

        setData(cleaned);
        try {
          localStorage.setItem("umapData", JSON.stringify(cleaned));
        } catch {}
      } catch (err) {
        if (!cancelled) {
          console.error("umap_coords_c.json の取得または整形に失敗:", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
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

  // 初期センタリング
  useEffect(() => {
    if (didInitialCenterRef.current) return;
    if (!Array.isArray(data) || data.length === 0) return;

    let targetX = null;
    let targetY = null;

    // ① ロット別の基準ポイントを最優先
    if (basePoint && Number.isFinite(basePoint.x) && Number.isFinite(basePoint.y)) {
      targetX = Number(basePoint.x);
      targetY = Number(basePoint.y);
    } else {
      // ② なければ従来どおり ANCHOR_JAN
     const b = data.find(
        (d) =>
          String(d.jan_code) === ANCHOR_JAN ||
          String(d.JAN) === ANCHOR_JAN
      );
      if (b && Number.isFinite(b.umap_x) && Number.isFinite(b.umap_y)) {
        targetX = b.umap_x;
        targetY = b.umap_y;
      } else {
        // ③ それも無ければ全体重心
        const [cx, cy] = umapCentroid;
        targetX = cx;
        targetY = cy;
      }
    }

    centerToUMAP(targetX, targetY, { zoom: INITIAL_ZOOM });
    didInitialCenterRef.current = true;
  }, [data, centerToUMAP, umapCentroid, basePoint]);

  // ★ SliderPageから戻った直後にユーザーピンへセンタリング
  useEffect(() => {
  // state か sessionStorage の合図を読む
  const byState = location.state?.centerOnUserPin === true;
  let byFlag = false;
  try { byFlag = sessionStorage.getItem("tm_center_on_userpin") === "1"; } catch {}

  if (!(byState || byFlag)) return;

  // 保存済みピン座標を取得（既存の reader を利用）
  const pin = readUserPinFromStorage() || userPin;
  const [x, y] = Array.isArray(pin) ? pin : [];

  if (Number.isFinite(x) && Number.isFinite(y)) {
    centerToUMAP(x, y, { zoom: INITIAL_ZOOM });
  }

  // 使い終わったフラグ類を掃除
  try { sessionStorage.removeItem("tm_center_on_userpin"); } catch {}
  // URLの state をクリア（戻る履歴を汚さない）
  if (byState) {
    navigate(location.pathname, { replace: true, state: {} });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [location.state, location.key, userPin, centerToUMAP]);

  // 初回センタリング（userPin 指定時）
  useEffect(() => {
    // 評価後に商品ページを閉じてもマップが勝手に動かないよう、ユーザーピンへの自動センタリングを無効化
    return;
  }, [userPin, location.state, centerToUMAP]);

  // SliderPage閉じる → 基準ワイン（参照座標）へ戻る
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
    setIsRatedOpen(false);

   try {
     // userPin は UMAP空間（x, yUMAP）。DeckGL世界は y を反転している点に注意
     const wx = userPin[0];
     const wy = -userPin[1];
     const nearest = findNearestWineWorld(wx, wy);
     if (nearest?.JAN) {
       setHideHeartForJAN(null);
       setSelectedJAN(nearest.JAN);
       setIframeNonce(Date.now());
       setProductDrawerOpen(true);
       focusOnWine(nearest, { zoom: INITIAL_ZOOM });
     }
   } catch (e) {
     console.error("auto-open-nearest failed:", e);
   }
 }, [location.key, userPin, data, findNearestWineWorld, focusOnWine]);

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

      // === ProductPage からのカート関連メッセージ ===
      if (type === "OPEN_CART") {
        setCartOpen(true);
        return;
      }

      if (type === "SIMPLE_CART_ADD" && msg.item) {
        try {
          await addLocal(msg.item); // ローカルカートに積む
          setCartOpen(true);        // ついでに開く
        } catch (e) {
          console.error("SIMPLE_CART_ADD failed:", e);
        }
        return;
      }

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

      // ★ 評価を子iframeに明示的に適用させるための補助メッセージ
      const sendRatingToChild = (janStr, ratingObjOrNull) => {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: "SET_RATING",          // 子側でこれを受けてUIを即時更新させる
              jan: janStr,
              rating: ratingObjOrNull,     // { rating, date } もしくは null（クリア）
            },
            "*"
          );
        } catch {}
      };

      if (type === "OPEN_MYACCOUNT") {
        await closeUIsThen({ preserveMyPage: true });
        setIsMyPageOpen(true);
        setIsAccountOpen(true);
        return;
      }

      const janStr = String(msg.jan ?? msg.jan_code ?? "");
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

        // ★ まずスナップショットを送る
        sendSnapshotToChild(janStr, msg.payload || null);
        // ★ さらに評価を明示適用（特に「評価クリア(null)」時のUI遅延対策）
        sendRatingToChild(janStr, (payload && Number(payload.rating) > 0) ? payload : null);
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

        // ★ スナップショット
        const nextRating = rating > 0 ? { rating, date } : null;
        sendSnapshotToChild(janStr, nextRating);
        // ★ 明示適用（評価クリア時のズレ解消）
        sendRatingToChild(janStr, nextRating);
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
    addLocal,
  ]);

  // ====== レンダリング
  return (
    <div id="map-root" className="map-root" tabIndex={-1}>
      <MapCanvas
        ref={deckRef}
        data={data}
        userRatings={userRatings}
        selectedJAN={selectedJAN}
        favorites={favorites}
        highlight2D={highlight2D}
        userPin={userPin}
        panBounds={panBounds}
        viewState={viewState}
        setViewState={setViewState}
        onOpenSlider={() => navigate("/slider")}
        onPickWine={async (item) => {
          if (!item) return;

          // ★ もう基準ワインも特別扱いせず、通常どおり商品ページを開く
          await closeUIsThen({
            preserveMyPage: true,
            preserveSearch: true,
            preserveCluster: true,
          });

          // ★★★ クラスターパネルを畳む（ここ！！）
          setClusterCollapseKey((k) => (k == null ? 1 : k + 1));

          setSelectedJAN(item.JAN);
          setIframeNonce(Date.now());
          setProductDrawerOpen(true);
          
          focusOnWine(item, { recenter: false });
        }}
        clusterColorMode={clusterColorMode}
        edgeMarginXPx={50}
        edgeMarginYPx={400}
        basePoint={basePoint}
      />

      {/* 左上: 指標セレクタ + クラスタ配色ボタン */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          zIndex: UI_Z_TOP,
          display: "flex",
          alignItems: "center",
          gap: "6px", // セレクタとボタンの間隔
          pointerEvents: "auto",
        }}
      >
        {/* セレクタ */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <select
           value={highlight2D}
            onChange={(e) => setHighlight2D(e.target.value)}
            style={{
              padding: "6px 28px 6px 8px",
              fontSize: "8px",
              color: "#666",
              backgroundColor: "#fff",
              border: "0.5px solid #000",
              borderRadius: "6px",
              outline: "none",
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
            }}
          >
            <option value="">基本マップ</option>
            <option value="pc3">酸味</option>
            <option value="pc2">甘味</option>
            <option value="pc1">ボディ</option>
          </select>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              fontSize: 12,
              color: "#666",
            }}
          >
            ▼
          </span>
        </div>

        {/* クラスタ配色ボタン（右横配置） */}
        <button
          onClick={async () => {
            const next = !clusterColorMode;
            if (next) {
              setIsClusterOpen(true);
            } else {
             setIsClusterOpen(false);
             setClusterCollapseKey(null);
            }
            setClusterColorMode(next);
          }}
          style={{
            width: "30px",
            height: "30px",
            background: "#fff",
            border: "0.5px solid #000",
            borderRadius: "6px",
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
            src={`${process.env.PUBLIC_URL || ""}/img/icon colour.png`}
            alt=""
            style={{
              width: "95%",
              height: "95%",
              objectFit: "contain",
              display: "block",
              pointerEvents: "none",
              opacity: clusterColorMode ? 1.0 : 0.5,
              transition: "opacity 0.2s",
            }}
            draggable={false}
          />
        </button>
      </div>
      {/* 左下の旧カートFABは削除 */}

      {/* 右上: アプリガイド */}
      <button
        onClick={() => openPanel("mypage")}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: UI_Z_TOP,
          width: "40px",
          height: "40px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          pointerEvents: "auto",          // ★ 追加
        }}
        aria-label="アプリガイド"
        title="アプリガイド"
      >
        <img src={`${process.env.PUBLIC_URL || ""}/img/app-guide.svg`} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} draggable={false}/>
      </button>

      {/* 右上: 検索 */}
      <button
        onClick={() => openPanel("search")}
        style={{ /* 上と同様。topだけ60pxに */ pointerEvents: "auto", position:"absolute", top:"60px", right:"10px", zIndex:UI_Z_TOP, width:"40px", height:"40px", background:"transparent", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}
        aria-label="検索"
        title="検索"
      >
        <img src={`${process.env.PUBLIC_URL || ""}/img/search.svg`} alt="" style={{ width:"100%", height:"100%", objectFit:"contain", display:"block", pointerEvents:"none" }} draggable={false}/>
      </button>

      {/* 右サイド: 評価 */}
      <button
        onClick={() => openPanel("rated")}
        style={{ /* 110px */ pointerEvents: "auto", position:"absolute", top:"110px", right:"10px", zIndex:UI_Z_TOP, width:"40px", height:"40px", background:"transparent", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}
        aria-label="評価一覧"
        title="評価（◎）一覧"
      >
        <img src={`${process.env.PUBLIC_URL || ""}/img/hyouka.svg`} alt="" style={{ width:"100%", height:"100%", objectFit:"contain", display:"block", pointerEvents:"none" }} draggable={false}/>
      </button>

      {/* 右サイド: カート */}
      <button
        onClick={() => openPanel("cart")}
        style={{ /* 160px */ pointerEvents: "auto", position:"absolute", top:"160px", right:"10px", zIndex:UI_Z_TOP, width:"40px", height:"40px", background:"transparent", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}
        aria-label="カートを開く"
        title="カートを開く"
      >
        <img src={`${process.env.PUBLIC_URL || ""}/img/icon cart1.png`} alt="" style={{ width:"100%", height:"100%", objectFit:"contain", display:"block", pointerEvents:"none" }} draggable={false}/>
        {totalQty > 0 && (
          <span
            style={{
             position: "absolute",
              top: "-4px",
              right: "-4px",
              backgroundColor: "#111",
              color: "#fff",
              borderRadius: "50%",
              fontSize: "10px",
              lineHeight: "1",
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #fff",
            }}
          >
            {totalQty}
          </span>
       )}
      </button>

      {/* ====== 検索パネル ====== */}
      <SearchPanel
        open={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        data={data}
        onPick={async (item) => {
          if (!item) return;

          await closeUIsThen({
            preserveMyPage: true,
            preserveSearch: true,
            preserveCluster: true,
          });

          // ★ クラスターパネルを畳む
          setClusterCollapseKey((k) => (k == null ? 1 : k + 1));

          setHideHeartForJAN(null);
          setSelectedJAN(item.JAN);
          setIframeNonce(Date.now());
          setProductDrawerOpen(true);

          const tx = Number(item.umap_x), ty = Number(item.umap_y);
          if (Number.isFinite(tx) && Number.isFinite(ty)) {
            centerToUMAP(tx, ty, { zoom: viewState.zoom });
          }
        }}
        onScanClick={async () => {
          await closeUIsThen({ preserveCluster: true });
          setIsScannerOpen(true);
        }}
      />

      {/* バーコードスキャナ */}
      <BarcodeScanner
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={async (codeText) => {
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
            await closeUIsThen({
              preserveMyPage: true,
              preserveCluster: true
            });
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

      {/* 評価（◎） */}
      <RatedPanel
        isOpen={isRatedOpen}
        onClose={async () => { 
          await closeUIsThen({ preserveCluster: true }); 
        }}
        userRatings={userRatings}
        data={data}
        favorites={favorites}
        onSelectJAN={async (jan) => {
          await closeUIsThen({
            preserveMyPage: true,
            preserveRated: true,
            preserveCluster: true,
          });

           // ★ クラスターパネルを畳む
           setClusterCollapseKey((k) => (k == null ? 1 : k + 1));

          try { sessionStorage.setItem("tm_from_rated_jan", String(jan)); } catch {}
          setHideHeartForJAN(String(jan));
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
         onClose={() => {
          setIsClusterOpen(false);
          setClusterCollapseKey(null);
         }}
        height={DRAWER_HEIGHT}
        onPickCluster={centerToCluster}
        availableIds={clusterList} // 追加：存在クラスターのみ出す場合
        collapseKey={clusterCollapseKey}   // ★追加
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
        sx={{ zIndex: 1700, pointerEvents: "none" }} 
        hideBackdrop
        BackdropProps={{ style: { background: "transparent", pointerEvents: "none" } }}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true,  // ★ フォーカスロック解除
          disableAutoFocus: true,     // ★ 自動フォーカスを抑止
          disableRestoreFocus: true,  // ★ 閉じた後のフォーカス復元も抑止
        }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
          },
          sx: { pointerEvents: "auto" },
        }}
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
        <div className="drawer-scroll" style={{ flex: 1, overflowY: "auto" }}>
          {selectedJAN ? (
            <iframe
              title={`product-${selectedJAN || "preview"}`}
              ref={iframeRef}
              key={`${selectedJAN}-${iframeNonce}`}
              src={`${process.env.PUBLIC_URL || ""}/#/products/${selectedJAN}?embed=1&_=${iframeNonce}`}
              style={{ width: "100%", height: "100%", border: "none" }}
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

      {/* カート（SimpleCartPanel） */}
      <Drawer
        id="cart-drawer"
        anchor="bottom"
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        sx={{ zIndex: 1850, pointerEvents: "none" }}                // MapGuideより手前/後ろはお好みで
        BackdropProps={{ 
          style: { 
            background: "transparent",
            pointerEvents: "none",
          } }}
        ModalProps={{ 
          ...drawerModalProps, 
          keepMounted: true,
          disableEnforceFocus: true,   // ★ フォーカスロック解除
          disableAutoFocus: true,      // ★ 自動フォーカス抑止
          disableRestoreFocus: true,   // ★ フォーカス復元抑止
          disableScrollLock: true,
        }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            height: DRAWER_HEIGHT,
            display: "flex",
            flexDirection: "column",
            outline: "none",
          },
          sx: { pointerEvents: "auto" },
        }}
      >
        <PanelHeader
          title="カート"
          icon="cart.svg"
          onClose={() => setCartOpen(false)}
        />
        <div
          className="drawer-scroll"
          style={{ flex: 1, overflowY: "auto" }}
          tabIndex={-1}
          data-autofocus="cart"
        >
          {/* ★ isOpen を渡しておくと在庫チェックの依存が素直になる */}
          <SimpleCartPanel
            isOpen={cartOpen}
            onClose={() => setCartOpen(false)} />
        </div>
      </Drawer>

      {/* アプリガイド（メニュー） */}
      <Drawer
        anchor="bottom"
        open={isMyPageOpen}
        onClose={() => setIsMyPageOpen(false)}
        sx={{ zIndex: 1400, pointerEvents: "none" }}
        hideBackdrop
        BackdropProps={{ style: { background: "transparent", pointerEvents: "none" } }}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true,  // ★ フォーカスロック解除
          disableAutoFocus: true,     // ★ 自動フォーカスを抑止
          disableRestoreFocus: true,  // ★ 閉じた後のフォーカス復元も抑止
          disableScrollLock: true,
        }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            height: DRAWER_HEIGHT,
            display: "flex",
            flexDirection: "column",
          },
          sx: { pointerEvents: "auto" },
        }}
      >
        <PanelHeader
          title="アプリガイド"
          icon="app-guide.svg"
          onClose={() => setIsMyPageOpen(false)}
        />
        <MyPagePanelContent
          onOpenCart={() => openOverlayAboveMenu("cart")}
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
        sx={{ zIndex: 1800 }}
        BackdropProps={{ style: { background: "transparent" } }}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
        }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            height: DRAWER_HEIGHT,
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
        sx={{ zIndex: 1500 }}
        BackdropProps={{ style: { background: "transparent" } }}
        ModalProps={{ ...drawerModalProps, keepMounted: true }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            height: DRAWER_HEIGHT,
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
        sx={{ zIndex: 1500 }}
        BackdropProps={{ style: { background: "transparent" } }}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
        }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            height: DRAWER_HEIGHT,
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
        sx={{ zIndex: 1500 }}
        BackdropProps={{ style: { background: "transparent" } }}
        ModalProps={{ ...drawerModalProps, keepMounted: true }}
        PaperProps={{
          style: {
            ...paperBaseStyle,
            borderTop: "1px solid #c9c9b0",
            height: DRAWER_HEIGHT,
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

      {/* 下部中央: 「○○さんの地図」ラベル */}
      {(() => {
        try {
          const token = localStorage.getItem("app.access_token");
          if (!token) return null;          // ★ ログアウト → 非表示

          if (!userDisplayName) return null;

          return (
          <div
            style={{
              position: "absolute",
              bottom: 30,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: UI_Z_TOP,
              pointerEvents: "none", // 地図操作の邪魔をしない
            }}
          >
            <div
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                background: "transparent",
                backdropFilter: "none",
                fontSize: 12,
                color: "#333",
                whiteSpace: "nowrap",
                border: "none",
              }}
            >
              {userDisplayName} さんの地図
            </div>
          </div>
        );
      } catch {
        return null;
      }
    })()}

      {process.env.NODE_ENV === "development" && <CartProbe />}
    </div>
  );
}

export default MapPage;
