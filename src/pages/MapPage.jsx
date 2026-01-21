// src/pages/MapPage.jsx
// Map（DeckGL）＋ 下から出る各パネル/Drawerの統括画面
// 主な責務：
//  - data（打点：points）を読み込み → normalizePoints() で JAN/座標/cluster を正規化して MapCanvas に渡す
//  - allowedJansSet / storeJansSet / ecOnlyJansSet を API から取得し、表示・EC判定を制御
//  - isSearchOpen / isRatedOpen / isMyPageOpen / cartOpen ... など 全パネルの開閉状態を一元管理
//  - 商品詳細は Drawer + iframe(ProductPage) で開き、postMessage で ♡/評価/カート の反映をしている
//  - isRatedOpen が true になった時に fetchLatestRatings("date") を叩いて 評価一覧の同期をする（DB→ローカルへ）

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
import MilesPanelContent from "../components/panels/MilesPanelContent";
import ClusterPalettePanel from "../components/panels/ClusterPalettePanel";
import SimpleCartPanel from "../components/panels/SimpleCartPanel";
import TastePositionPanelContent from "../components/panels/TastePositionPanelContent";
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
  OFFICIAL_STORE_ID,
} from "../ui/constants";
import { getLotId } from "../utils/lot";
import { getCurrentMainStoreIdSafe } from "../utils/store";

// =========================
// points 正規化（入口で吸収） 2025.12.20.追加
// =========================
function normalizePointRow(row) {
  const toNumOrNull = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // JAN: points.csv 由来の揺れを吸収
  const jan =
    row?.jan_code ??
    row?.jan ??
    row?.JAN ??
    row?.barcode ??
    row?.BARCODE ??
    null;

  // 座標: umap_x/y or UMAP1/2 or x/y を吸収（float化）
  const xRaw = row?.umap_x ?? row?.UMAP1 ?? row?.x ?? row?.X ?? null;
  const yRaw = row?.umap_y ?? row?.UMAP2 ?? row?.y ?? row?.Y ?? null;

  const umap_x = toNumOrNull(xRaw);
  const umap_y = toNumOrNull(yRaw);

  // cluster: 数値化（なければ null）
  const cRaw = row?.cluster ?? row?.CLUSTER ?? null;
  const cluster = toNumOrNull(cRaw);

  return {
    ...row, // 既存項目は保持（他ロジックを壊さない）
    jan_code: jan === null || jan === undefined ? "" : String(jan).trim(),
    umap_x,
    umap_y,
    cluster,
  };
}

function normalizePoints(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizePointRow)
    // JANが空 or 座標が数値でない行は落とす（描画事故を防ぐ）
    .filter((d) => d.jan_code && Number.isFinite(d.umap_x) && Number.isFinite(d.umap_y));
}
// ここまで 正規化ユーティリティ 2025.12.20.追加

// 任意のオブジェクトから JAN を安全に取り出す共通ヘルパー
const getJanFromItem = (item) => {
  if (!item) return "";
  const jan = item.jan_code ?? item.JAN ?? item.jan ?? null;
  return jan ? String(jan) : "";
};

// メイン店舗の EC有効フラグをローカルから推定（JSONでも文字列でも耐える）
const getCurrentMainStoreEcActiveFromStorage = () => {
  try {
    const raw =
      localStorage.getItem("selectedStore") ||
      localStorage.getItem("main_store");
    if (!raw) return null;

    let s;
    try {
      s = JSON.parse(raw);
    } catch {
      // JSONでない（"1"等）ならオブジェクト情報が無いので判定不能
      return null;
    }

    const v =
      s?.ec_active ??
      s?.ecActive ??
      s?.main_store_ec_active ??
      s?.mainStoreEcActive ??
      null;

    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
  } catch (e) {
    console.warn("getCurrentMainStoreEcActiveFromStorage error:", e);
  }
  return null;
};

// =========================
// rated-panel（DB正）スナップショット取得
// - wishlist（飲みたい）を favoriteCache に復元する目的
// - rating も同時に取れれば userRatings も同期
// =========================
async function fetchRatedPanelSnapshot({ apiBase, token }) {
  if (!token) return null;
  const url = `${apiBase}/api/app/rated-panel`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`rated-panel HTTP ${res.status}`);
  const json = await res.json();
  return json;
}

function parseRatedPanelItems(json) {
  // 返却形式の揺れに強くする（items / data / results など）
  const items =
    Array.isArray(json?.items) ? json.items :
    Array.isArray(json?.data) ? json.data :
    Array.isArray(json?.results) ? json.results :
    [];

  const nextRatings = {};
  const nextFav = {};

  for (const it of items) {
    const jan = String(it?.jan_code ?? it?.jan ?? it?.JAN ?? "").trim();
    if (!jan) continue;

    // rating（あれば同期）
    const r = Number(it?.rating ?? it?.score ?? 0) || 0;
    const dt =
      it?.created_at ??
      it?.rated_at ??
      it?.date ??
      null;
    if (r > 0) {
      nextRatings[jan] = { rating: r, date: dt || new Date().toISOString() };
    }

    // wishlist（飲みたい）
    // wished / is_wished / wishlist / wanted など揺れ吸収
    const wishedRaw =
      it?.wished ??
      it?.is_wished ??
      it?.wishlist ??
      it?.wanted ??
      it?.wish ??
      false;
    const wished =
      wishedRaw === true ||
      wishedRaw === 1 ||
      wishedRaw === "1" ||
      wishedRaw === "true";

    if (wished) {
      nextFav[jan] = { addedAt: it?.wished_at ?? it?.created_at ?? new Date().toISOString() };
    }
  }

  return { nextRatings, nextFav };
}

// allowed-jans 取得エラー時に表示
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

// 共通のパース小ユーティリティ（先に定義しておく）
function parseAllowedJansResponse(json) {
  const storeArr =
    Array.isArray(json?.store_jans) ? json.store_jans :
    Array.isArray(json?.allowed_store_jans) ? json.allowed_store_jans :
    Array.isArray(json?.storeJans) ? json.storeJans :
    null;

  const allowedArrRaw =
    Array.isArray(json?.allowed_jans) ? json.allowed_jans :
    Array.isArray(json?.jans) ? json.jans :
    storeArr;

  let ecOnlyArr = [];
  if (Array.isArray(json?.ec_only_jans)) ecOnlyArr = json.ec_only_jans;
  else if (Array.isArray(json?.ec_jans)) ecOnlyArr = json.ec_jans;

  const mainStoreEcActive =
    typeof json?.main_store_ec_active === "boolean"
      ? json.main_store_ec_active
      : null;

  const allowedArr = Array.from(new Set([
    ...(allowedArrRaw || []),
    ...ecOnlyArr,
  ].map(String)));

  // ここを storeArr ベースにする（最重要）
  const storeJans = Array.isArray(storeArr) ? storeArr.map(String) : [];

  return { allowedJans: allowedArr, ecOnlyJans: ecOnlyArr.map(String), storeJans, mainStoreEcActive };
}

// 指定店舗IDの allowed_jans を取得する共通ヘルパー（未ログイン想定）
async function fetchAllowedJansForStore(storeId) {
  if (storeId === null || storeId === undefined) {
    return { allowedJans: null, ecOnlyJans: null, storeJans: null, mainStoreEcActive: null };
  }

  // 互換：古い0運用が残っていたら公式Shop(1)へ丸める
  const sid = Number(storeId) > 0 ? Number(storeId) : OFFICIAL_STORE_ID;

  const params = new URLSearchParams();
  params.set("stores", String(sid));
  params.set("include_ec", "true");

  // 実在店舗（id > 0）のときだけ main_store_id を付ける
  params.set("main_store_id", String(sid)); // ★ 常に付けてOK（sidは必ず>0）

  const res = await fetch(`${API_BASE}/api/app/allowed-jans?${params.toString()}`, { cache: "no-store" });  
  if (!res.ok) {
    throw new Error(`allowed-jans(stores=${storeId}) HTTP ${res.status}`);
  }

  const json = await res.json();
  const { allowedJans, ecOnlyJans, storeJans, mainStoreEcActive } =
    parseAllowedJansResponse(json);
  return { allowedJans, ecOnlyJans, storeJans, mainStoreEcActive };
}

// メイン店舗（＋ログイン状態）に応じて allowed_jans を取得
//    - 未ログイン: ローカルにメイン店舗IDがあれば /allowed-jans?stores=...&include_ec=true
//                  メイン店舗IDが無ければ null（= フィルタ無し）
//    - ログイン済み: /allowed-jans/auto を呼び、失敗時のみ null（= フィルタ無し）
async function fetchAllowedJansAuto() {
  const mainStoreId = getCurrentMainStoreIdSafe();

  let token = "";
  try {
    token = localStorage.getItem("app.access_token") || "";
  } catch {}

  // ① 未ログイン or トークンなし
  if (!token) {
      try {
        const { allowedJans, ecOnlyJans, storeJans, mainStoreEcActive } =
          await fetchAllowedJansForStore(mainStoreId);

        return { 
          allowedJans,
          ecOnlyJans: ecOnlyJans || [],
          storeJans: storeJans || [],
          mainStoreEcActive,
        };
      } catch (e) {
        console.warn(
          `allowed-jans(stores=${mainStoreId}) の取得に失敗 → 全件表示にフォールバック`,
          e
        );
        showAllowedJansErrorOnce();
        return { allowedJans: null, ecOnlyJans: [], storeJans: [], mainStoreEcActive: null };
      }
    }

  // ② ログイン済み
  try {
    const url = `${API_BASE}/api/app/allowed-jans/auto`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const json = await res.json();
      const { allowedJans, ecOnlyJans, storeJans, mainStoreEcActive } =
        parseAllowedJansResponse(json);

      return {
        allowedJans,
        ecOnlyJans: ecOnlyJans || [],
        storeJans: storeJans || [],
        mainStoreEcActive,
      };
    } else {
      console.warn(
        `allowed-jans/auto HTTP ${res.status} → フィルタ無しで続行`
      );
      showAllowedJansErrorOnce();
      return { allowedJans: null, ecOnlyJans: [], storeJans: [], mainStoreEcActive: null };
    }
  } catch (e) {
    console.warn("allowed-jans/auto の取得に失敗 → フィルタ無しで続行", e);
    showAllowedJansErrorOnce();
     return { allowedJans: null, ecOnlyJans: [], storeJans: [], mainStoreEcActive: null };
  }
}

const REREAD_LS_KEY = "tm_reread_until";
const CENTER_Y_FRAC = 0.85; // 0.0 = 画面最上端, 0.5 = 画面の真ん中
const ANCHOR_JAN = "4964044046324";
const UI_Z_TOP = 2400;

function getYOffsetWorld(zoom, fracFromTop = CENTER_Y_FRAC) {
  const worldPerPx = 1 / Math.pow(2, Number(zoom) || 0);
  let hPx = 0;
  if (typeof window !== "undefined") {
    hPx =
      window.visualViewport && window.visualViewport.height
        ? window.visualViewport.height
        : window.innerHeight || 0;
  }
  return (0.5 - fracFromTop) * hPx * worldPerPx;
}

function CartProbe() {
  const { totalQty, subtotal, items } = useSimpleCart();
  return (
    <pre
      style={{
        position: "absolute",
        left: 8,
        bottom: 8,
        zIndex: 9999,
        background: "#000",
        color: "#0f0",
        fontSize: 12,
        padding: 6,
        borderRadius: 6,
        opacity: 0.85,
      }}
    >
      {JSON.stringify(
        {
          totalQty,
          subtotal,
          linesLen: Array.isArray(items) ? items.length : -1,
        },
        null,
        2
      )}
    </pre>
  );
}

function MapPage() {
  // Drawer を “背面（Map）に操作を通す” 共通設定
  const passThroughDrawerSx = useMemo(() => ({ pointerEvents: "none" }), []);
  const passThroughBackdropProps = useMemo(
    () => ({ style: { background: "transparent", pointerEvents: "none" } }),
    []
  );
  const passThroughPaperSx = useMemo(() => ({ pointerEvents: "auto" }), []);
  const location = useLocation();
  const navigate = useNavigate();

  // ログインユーザー名（ニックネーム）表示用
  const [userDisplayName, setUserDisplayName] = useState("");

  useEffect(() => {
    const readUserFromStorage = () => {
      try {
        const appUserStr = localStorage.getItem("app.user");
        if (appUserStr) {
          const u = JSON.parse(appUserStr);
          const name = (u && (u.display_name || u.nickname || u.name)) || "";
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

  // ロット → 基準ワイン座標
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
  const iframeRef = useRef(null);
  const autoOpenOnceRef = useRef(false);
  const lastCommittedRef = useRef({ code: "", at: 0 });
  const unknownWarnedRef = useRef(new Map());

  // ---- Drawer 状態（すべて明示）----
  const [isMyPageOpen, setIsMyPageOpen] = useState(false); // アプリガイド（メニュー）
  const [isSearchOpen, setIsSearchOpen] = useState(false); // 検索
  const [isRatedOpen, setIsRatedOpen] = useState(false); // 評価（◎）
  const [isMapGuideOpen, setIsMapGuideOpen] = useState(false); // マップガイド（オーバーレイ）
  const [isTastePositionOpen, setIsTastePositionOpen] = useState(false); // あなたの味覚位置（オーバーレイ）
  const [isStoreOpen, setIsStoreOpen] = useState(false); // お気に入り店舗登録（オーバーレイ）
  const [isAccountOpen, setIsAccountOpen] = useState(false); // マイアカウント（メニュー）
  const [isMilesOpen, setIsMilesOpen] = useState(false); // 獲得マイル（メニュー）
  const [isFaqOpen, setIsFaqOpen] = useState(false); // よくある質問（メニュー）
  const [isClusterOpen, setIsClusterOpen] = useState(false); // クラスタ配色パネル
  const [cartOpen, setCartOpen] = useState(false); // カート
  const [isScannerOpen, setIsScannerOpen] = useState(false); // バーコードスキャナ

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
  const [viewState, setViewState] = useState({
    target: [0, 0, 0],
    zoom: INITIAL_ZOOM,
  });

  // データ & 状態
  const [data, setData] = useState([]);
  const [userRatings, setUserRatings] = useState({});
  const [favoriteCache, setFavoriteCache] = useState({});
  const [favoritesVersion, setFavoritesVersion] = useState(0);
  const bumpFavoritesVersion = () => setFavoritesVersion((v) => v + 1);
  const [userPin, setUserPin] = useState(null);
  const [highlight2D, setHighlight2D] = useState("");
  const [selectedJAN, setSelectedJAN] = useState(null);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [iframeNonce, setIframeNonce] = useState(0);
  const [allowedJansSet, setAllowedJansSet] = useState(null);
  const [ecOnlyJansSet, setEcOnlyJansSet] = useState(null);
  const [storeJansSet, setStoreJansSet] = useState(() => new Set());
  const [cartEnabled, setCartEnabled] = useState(false);

  // =========================
  // points 再取得（更新ボタン代替用）　2026.01.
  // - cache を強制的に無効化
  // - ?v= でURLをバスト（静的配信の強キャッシュ対策）
  // =========================
  const fetchPoints = useCallback(
    async (opts = {}) => {
      const { bust = true } = opts;
      try {
        const baseUrl = String(TASTEMAP_POINTS_URL || "");
        if (!baseUrl) return;

        const url = new URL(baseUrl, window.location.origin);
        if (bust) url.searchParams.set("v", String(Date.now()));

        console.log("[MapPage] fetch points (refresh) from", url.toString());
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) {
          console.error("[MapPage] points fetch !ok", res.status, res.statusText);
          return;
        }

        const json = await res.json();
        const list = Array.isArray(json) ? json : json.points || [];
        const normalized = normalizePoints(list);
        console.log(
          "[MapPage] points length raw/normalized =",
          list.length,
          normalized.length
        );
        setData(normalized);
      } catch (e) {
        console.error("[MapPage] points fetch error", e);
      }
    },
    []
  );
  
  // ------------------------------
  // 描画用の主集合（visible）
  // - allowedJansSet があるならそれを優先
  // - 無いなら「全打点OK」（表示フォールバック）
  // ※ storeJansSet（店舗集合）とは混ぜない
  // ------------------------------
  const visibleJansSet = useMemo(() => {
    // allowedJansSet が null のときは「全件表示」扱い（MapCanvas側で全通過にしてもOK）
    // ただ、MapCanvasが Set を前提にしている場合に備えて Set を作る
    if (allowedJansSet && allowedJansSet instanceof Set) return allowedJansSet;
    if (!Array.isArray(data) || data.length === 0) return null;
    return new Set(data.map((d) => String(d.jan_code || "")));
  }, [allowedJansSet, data]);

  // ------------------------------
  // 検索パネルに渡すデータ（Plan A: Mapに出てるものだけ検索）
  // - visibleJansSet がある → その集合に含まれる点だけ
  // - visibleJansSet が null → フォールバックで全点
  // ------------------------------
  const searchPanelData = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    const set = visibleJansSet instanceof Set ? visibleJansSet : null;
    if (!set) return list;
    return list.filter((d) => set.has(String(getJanFromItem(d))));
  }, [data, visibleJansSet]);

  // ====== allowed-jans を読み直す共通関数 ======
  const reloadAllowedJans = useCallback(async () => {
    const mainStoreId = getCurrentMainStoreIdSafe();
    const hasToken = !!(localStorage.getItem("app.access_token") || "");

    try {
      const { allowedJans, ecOnlyJans, storeJans, mainStoreEcActive } =
        await fetchAllowedJansAuto();

      const fromLS = getCurrentMainStoreEcActiveFromStorage();
      const apiEc = typeof mainStoreEcActive === "boolean" ? mainStoreEcActive : null;

      let ecEnabled = false;

      if (mainStoreId === OFFICIAL_STORE_ID) {
        ecEnabled = true;
      } else if (apiEc !== null) {
        ecEnabled = apiEc;
      } else if (!hasToken && typeof fromLS === "boolean") {
        ecEnabled = fromLS;
      } else {
        ecEnabled = false;
      }

      setCartEnabled(ecEnabled);
      console.log("[cartEnabled]", { mainStoreId, hasToken, mainStoreEcActive, fromLS, ecEnabled });

      setAllowedJansSet(allowedJans ? new Set(allowedJans) : null);
      setEcOnlyJansSet(ecOnlyJans ? new Set(ecOnlyJans) : null);
      setStoreJansSet(new Set(storeJans || []));
    } catch (e) {
      console.error("allowed-jans の取得に失敗:", e);
      setAllowedJansSet(null);
      setEcOnlyJansSet(null);
      setStoreJansSet(new Set());
      setCartEnabled(false);
    }
  }, []);

  // ====== 初回マウント時に allowed-jans を取得 ======
  useEffect(() => {
    reloadAllowedJans();
  }, [reloadAllowedJans]);

  // ====== rated-panel（DB正）から wishlist を同期 ======
  const syncRatedPanel = useCallback(async () => {
    let token = "";
    try {
      token = localStorage.getItem("app.access_token") || "";
    } catch {}
    if (!token) {
      // 未ログインなら DB正が無いので、表示用キャッシュは一旦空に（ローカル運用を残したいならここは削除）
      setFavoriteCache({});
      bumpFavoritesVersion();
      return;
    }

    try {
      const json = await fetchRatedPanelSnapshot({ apiBase: API_BASE, token });
      const { nextRatings, nextFav } = parseRatedPanelItems(json);

      // wishlist（飲みたい）を DB正で上書き復元
      setFavoriteCache(nextFav);
      bumpFavoritesVersion();

      // rating も一緒に取れているなら同期（空なら触らない）
      if (nextRatings && Object.keys(nextRatings).length > 0) {
        setUserRatings(nextRatings);
        try {
          localStorage.setItem("userRatings", JSON.stringify(nextRatings));
        } catch {}
      }
    } catch (e) {
      console.warn("rated-panel sync failed:", e);
      // rated-panel が無い/失敗しても動作は継続（wishlist星が出ないだけ）
    }
  }, []);

  // =========================
  // 検索 / 評価ボタンを「更新ボタン代替」にする　2026.01.
  // - 未ログイン時：mainStoreId はローカル由来のまま（reloadAllowedJans が内部で吸収）
  // - ログイン時：rated-panel 同期も実行
  // =========================
  const refreshDataForPanels = useCallback(
    async () => {
      // 1) points（静的/デプロイ差し替えの反映）
      await fetchPoints({ bust: true });
      // 2) allowed-jans（店舗選択/EC可否/表示JANの反映）
      await reloadAllowedJans();
      // 3) wishlist/rating（ログイン時のみ。未ログインは syncRatedPanel 内で早期returnするが明示）
      const token = (() => {
        try {
          return localStorage.getItem("app.access_token") || "";
        } catch {
          return "";
        }
      })();
      if (token) {
        await syncRatedPanel();
      }
    },
    [fetchPoints, reloadAllowedJans, syncRatedPanel]
  );

  // ボタン押下で「即open + 裏で更新」を安全に走らせる（参照を安定化）2026.01.
  const refreshDataInBackground = useCallback(() => {
    refreshDataForPanels().catch((e) => {
      console.warn("[MapPage] background refresh failed:", e);
    });
  }, [refreshDataForPanels]);

  // 初回・ログイン/ログアウト・店舗変更などで同期
  useEffect(() => {
    syncRatedPanel();
  }, [syncRatedPanel]);

  useEffect(() => {
    const handler = (e) => {
      // storage のときだけ key で絞る
      if (e && e.type === "storage") {
        const k = e.key || "";
        const ok =
          k === "app.access_token" ||
          k === "app.user" ||
          k === "selectedStore" ||
          k === "main_store";
        if (!ok) return;
      }
      syncRatedPanel();
    };
    window.addEventListener("tm_auth_changed", handler);
    window.addEventListener("storage", handler);
    window.addEventListener("tm_store_changed", handler);
    return () => {
      window.removeEventListener("tm_auth_changed", handler);
      window.removeEventListener("storage", handler);
      window.removeEventListener("tm_store_changed", handler);
    };
  }, [syncRatedPanel]);

  // ====== ログイン状態や店舗選択の変更を拾って再取得 ======
  useEffect(() => {
    const handler = () => {
      reloadAllowedJans();
    };

    // MyAccount でログイン/ログアウト時に発火させる想定
    window.addEventListener("tm_auth_changed", handler);
    // StorePanelContent から localStorage が書き換わったときも拾う
    window.addEventListener("storage", handler);
    window.addEventListener("tm_store_changed", handler);

    return () => {
      window.removeEventListener("tm_auth_changed", handler);
      window.removeEventListener("storage", handler);
      window.removeEventListener("tm_store_changed", handler);
    };
  }, [reloadAllowedJans]);

  // RatedPanel を開いたタイミングでも、DB正スナップショットを再同期
  // （wishlist星の即時反映＆別端末変更の取り込み）
  useEffect(() => {
    if (!isRatedOpen) return;
    syncRatedPanel();
  }, [isRatedOpen, syncRatedPanel]);

  // Storeパネル（お気に入り店舗登録）を開いたタイミングで、
  // 店舗情報のDB更新（営業時間など）を即反映させるために裏で更新する　2026.01.
  useEffect(() => {
    if (!isStoreOpen) return;
    refreshDataInBackground();
  }, [isStoreOpen, refreshDataInBackground]);

  // クラスタ配色
  const [clusterColorMode, setClusterColorMode] = useState(false);
  const [clusterCollapseKey, setClusterCollapseKey] = useState(null);

  /** ===== UMAP座標へセンタリング ===== */
  const centerToUMAP = useCallback(
    (xUMAP, yUMAP, opts = {}) => {
      if (!Number.isFinite(xUMAP) || !Number.isFinite(yUMAP)) return;
      const yCanvas = -yUMAP;
      // opts.zoom が来ていればそれを最優先。
      // それ以外は keepZoom のとき現在ズーム維持、通常は最小ズームへ。
      const baseZoom =
        opts.zoom != null
          ? opts.zoom
          : opts.keepZoom
            ? (viewState.zoom ?? INITIAL_ZOOM)
            : ZOOM_LIMITS.min;
      const zoomTarget = Math.max(
        ZOOM_LIMITS.min,
        Math.min(ZOOM_LIMITS.max, baseZoom)
      );
      const yOffset = getYOffsetWorld(zoomTarget, CENTER_Y_FRAC);
      setViewState((prev) => ({
        ...prev,
        target: [xUMAP, yCanvas - yOffset, 0],
        zoom: zoomTarget,
      }));
    },
    [viewState.zoom]
  );

  // クラスタ重心に移動
  const centerToCluster = useCallback(
    (clusterId) => {
      const cid = Number(clusterId);
      if (!Array.isArray(data) || data.length === 0 || !Number.isFinite(cid))
        return;
      const items = data.filter((d) => Number(d.cluster) === cid);
      if (!items.length) return;
      const sx = items.reduce((s, d) => s + Number(d.umap_x || 0), 0);
      const sy = items.reduce((s, d) => s + Number(d.umap_y || 0), 0);
      const cx = sx / items.length;
      const cy = sy / items.length;
      // 色分けがOFFならONにしておく（任意）
      setClusterColorMode(true);
      centerToUMAP(cx, cy); // 既定で最小ズーム
    },
    [data, centerToUMAP]
  );

  // ユニークな cluster 値 → 初期色を決定
  const clusterList = useMemo(() => {
    const s = new Set();
    (data || []).forEach(
      (d) => Number.isFinite(d.cluster) && s.add(Number(d.cluster))
    );
    return Array.from(s).sort((a, b) => a - b);
  }, [data]);

  // ===== パネル開閉ユーティリティー
  const PANEL_ANIM_MS = 260;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** まとめて閉じ、閉じアニメ分だけ待つ（preserveMyPage=true ならメニューは残す） */
  const closeUIsThen = useCallback(
    async (opts = {}) => {
      const {
        preserveMyPage = false,
        preserveRated = false,
        preserveSearch = false,
        preserveCluster = false,
      } = opts;
      let willClose = false;

      if (productDrawerOpen) {
        setProductDrawerOpen(false);
        setSelectedJAN(null);
        willClose = true;
      }
      if (isMapGuideOpen) {
        setIsMapGuideOpen(false);
        willClose = true;
      }
      if (isTastePositionOpen) {
        setIsTastePositionOpen(false);
        willClose = true;
      }      
      if (isStoreOpen) {
        setIsStoreOpen(false);
        willClose = true;
      }
      if (isSearchOpen && !preserveSearch) {
        setIsSearchOpen(false);
        willClose = true;
      }
      if (isRatedOpen && !preserveRated) {
        setIsRatedOpen(false);
        willClose = true;
      }
      if (isAccountOpen) {
        setIsAccountOpen(false);
        willClose = true;
      }
      if (isMilesOpen) {
        setIsMilesOpen(false);
        willClose = true;
      }
      if (isFaqOpen) {
        setIsFaqOpen(false);
        willClose = true;
      }

      // クラスタパネルは preserveCluster=true のときは閉じない
      if (isClusterOpen && !preserveCluster) {
        setIsClusterOpen(false);
        setClusterCollapseKey(null);
        willClose = true;
      }

      if (!preserveMyPage && isMyPageOpen) {
        setIsMyPageOpen(false);
        willClose = true;
      }
      if (cartOpen) {
        setCartOpen(false);
        willClose = true;
      }

      if (willClose) await wait(PANEL_ANIM_MS);
    },
    [
      productDrawerOpen,
      isMapGuideOpen,
      isTastePositionOpen,
      isStoreOpen,
      isSearchOpen,
      isRatedOpen,
      isMyPageOpen,
      isAccountOpen,
      isMilesOpen,
      isFaqOpen,
      isClusterOpen,
      cartOpen,
    ]
  );

  /** 通常の相互排他オープン（メニュー含め全部調停して開く） */
  const openPanel = useCallback(
    async (kind) => {
      // ★ cluster 以外を開くとき、クラスターパネルが開いていれば「畳む」合図を送る
      if (kind !== "cluster" && isClusterOpen) {
        setClusterCollapseKey((k) => (k == null ? 1 : k + 1));
      }

      // クラスタパネルは閉じずに残す
      await closeUIsThen({ preserveCluster: true });

      if (kind === "mypage") setIsMyPageOpen(true);
      else if (kind === "mapguide" || kind === "guide") setIsMapGuideOpen(true);
      else if (kind === "position") setIsTastePositionOpen(true);
      else if (kind === "store") setIsStoreOpen(true);
      else if (kind === "search") setIsSearchOpen(true);
      else if (kind === "rated") setIsRatedOpen(true);
      else if (kind === "cluster") setIsClusterOpen(true);
      else if (kind === "cart") {
       if (!cartEnabled) return;
       setCartOpen(true);
      }
    },
    [closeUIsThen, isClusterOpen, cartEnabled]
  );

  /** メニューを開いたまま、上に重ねる版（レイヤー表示用） */
  const openOverlayAboveMenu = useCallback(
    async (kind) => {
      await closeUIsThen({ preserveMyPage: true, preserveCluster: true });
      if (kind === "mapguide") setIsMapGuideOpen(true);
      else if (kind === "position") setIsTastePositionOpen(true);
      else if (kind === "store") setIsStoreOpen(true);
      else if (kind === "guide") setIsMapGuideOpen(true);
      else if (kind === "account") setIsAccountOpen(true);
      else if (kind === "miles") setIsMilesOpen(true);
      else if (kind === "faq") setIsFaqOpen(true);
      else if (kind === "cart") {
        if (!cartEnabled) return;
        setCartOpen(true);
      }

    }, [closeUIsThen, cartEnabled]
  );

  // クエリで各パネルを開く（/ ?open=mypage|search|rated|mapguide|guide|position|store）
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      const open = (p.get("open") || "").toLowerCase();
      if (!open) return;
      (async () => {
        await openPanel(open); // クエリ経由は従来どおり相互排他
        navigate(location.pathname, {
          replace: true,
          state: location.state,
        });
      })();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, openPanel, navigate, location.pathname, location.state]);

  // ====== パン境界
  const panBounds = useMemo(() => {
    if (!data.length) return { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
    const xs = data.map((d) => d.umap_x);
    const ys = data.map((d) => -d.umap_y);
    const xmin = Math.min(...xs),
      xmax = Math.max(...xs);
    const ymin = Math.min(...ys),
      ymax = Math.max(...ys);
    const pad = 1.5 + Math.abs(CENTER_Y_OFFSET);
    return {
      xmin: xmin - pad,
      xmax: xmax + pad,
      ymin: ymin - pad,
      ymax: ymax + pad,
    };
  }, [data]);

  // ====== 打点データ読み込み（初回）===== 2026.01.
  useEffect(() => {
    fetchPoints({ bust: true });
  }, [fetchPoints]);

  // スキャナ：未登録JANの警告リセット
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
    try {
      localStorage.setItem("userRatings", JSON.stringify(userRatings));
    } catch {}
  }, [userRatings]);

  // ====== UMAP 重心
  const umapCentroid = useMemo(() => {
    if (!data?.length) return [0, 0];
    let sx = 0,
      sy = 0,
      n = 0;
    for (const d of data) {
      if (Number.isFinite(d.umap_x) && Number.isFinite(d.umap_y)) {
        sx += d.umap_x;
        sy += d.umap_y;
        n++;
      }
    }
    return n ? [sx / n, sy / n] : [0, 0];
  }, [data]);

  // userPin 読み出し
  const readUserPinFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem("userPinCoords");
      if (!raw) return null;
      const val = JSON.parse(raw);

      if (
        val &&
        Array.isArray(val.coordsUMAP) &&
        val.coordsUMAP.length >= 2
      ) {
        const x = Number(val.coordsUMAP[0]);
        const y = Number(val.coordsUMAP[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
      }
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

  // userPin 同期
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

  // 初期センタリング
  useEffect(() => {
    if (didInitialCenterRef.current) return;
    if (!Array.isArray(data) || data.length === 0) return;

    let targetX = null;
    let targetY = null;

    // ① ロット別の基準ポイントを最優先
    if (
      basePoint &&
      Number.isFinite(basePoint.x) &&
      Number.isFinite(basePoint.y)
    ) {
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

  // SliderPageから戻った直後にユーザーピンへセンタリング
  useEffect(() => {
    // state か sessionStorage の合図を読む
    const byState = location.state?.centerOnUserPin === true;
    let byFlag = false;
    try {
      byFlag = sessionStorage.getItem("tm_center_on_userpin") === "1";
    } catch {}

    if (!(byState || byFlag)) return;

    // 保存済みピン座標を取得（既存の reader を利用）
    const pin = readUserPinFromStorage() || userPin;
    const [x, y] = Array.isArray(pin) ? pin : [];

    if (Number.isFinite(x) && Number.isFinite(y)) {
      centerToUMAP(x, y, { zoom: INITIAL_ZOOM });
    }

    // 使い終わったフラグ類を掃除
    try {
      sessionStorage.removeItem("tm_center_on_userpin");
    } catch {}
    // URLの state をクリア（戻る履歴を汚さない）
    if (byState) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.key, userPin, centerToUMAP, readUserPinFromStorage, navigate, location.pathname]);

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

    let targetX = null,
      targetY = null;
    try {
      if (raw) {
        const payload = JSON.parse(raw);
        if (
          Number.isFinite(payload?.x) &&
          Number.isFinite(payload?.y)
        ) {
          targetX = Number(payload.x);
          targetY = Number(payload.y);
        }
      }
    } catch {}

    if (targetX == null || targetY == null) {
      const b = data.find(
        (d) =>
          String(d.jan_code) === ANCHOR_JAN ||
          String(d.JAN) === ANCHOR_JAN
      );
      if (b && Number.isFinite(b.umap_x) && Number.isFinite(b.umap_y)) {
        targetX = b.umap_x;
        targetY = b.umap_y;
      }
    }

    if (targetX != null && targetY != null) {
      centerToUMAP(targetX, targetY, { zoom: INITIAL_ZOOM });
    }

    sessionStorage.removeItem("tm_center_umap");
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch {}
  }, [location.state, data, centerToUMAP]);

  // ====== 商品へフォーカス
  const focusOnWine = useCallback((item, opts = {}) => {
    if (!item) return;
    const tx = Number(item.umap_x);
    const tyUMAP = Number(item.umap_y);
    if (!Number.isFinite(tx) || !Number.isFinite(tyUMAP)) return;

    setViewState((prev) => {
      const wantZoom = opts.zoom;
      const zoomTarget =
        wantZoom == null
          ? prev.zoom
          : Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, wantZoom));
      const yOffset = getYOffsetWorld(zoomTarget, CENTER_Y_FRAC);
      const keepTarget = opts.recenter === false;
      const nextTarget = keepTarget
        ? prev.target
        : [tx, -tyUMAP - yOffset, 0];
      return { ...prev, target: nextTarget, zoom: zoomTarget };
    });
  }, []);

  // 最近傍（ワールド座標：DeckGLの座標系 = [UMAP1, -UMAP2]）
  const findNearestWineWorld = useCallback(
    (wx, wy) => {
      if (!Array.isArray(data) || data.length === 0) return null;
      let best = null,
        bestD2 = Infinity;
      const storeSetValid = storeJansSet && storeJansSet.size > 0;        
      for (const d of data) {
        const jan = String(getJanFromItem(d));
        // 店舗集合が信頼できるときだけ「店舗のみ」に絞る
        // 不明なときは絞らない（= 店舗集合を捏造しない）
        if (storeSetValid && !storeJansSet.has(jan)) continue;

        const x = d.umap_x,
          y = -d.umap_y;
        const dx = x - wx,
          dy = y - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = d;
        }
      }
      return best;
    },
    [data, storeJansSet]
  );

  // スライダー直後：最寄り自動オープン
  useEffect(() => {
    const wantAutoOpen =
      sessionStorage.getItem("tm_autopen_nearest") === "1";
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
      const janStr = getJanFromItem(nearest);
      if (janStr) {
        setSelectedJAN(janStr);
        setIframeNonce(Date.now());
        setProductDrawerOpen(true);
        focusOnWine(nearest, { zoom: INITIAL_ZOOM });
      }
    } catch (e) {
      console.error("auto-open-nearest failed:", e);
    }
  }, [location.key, userPin, data, findNearestWineWorld, focusOnWine]);

  // ====== 子iframeへ（wishlist反映など）状態スナップショットを送る
  // ※ favoriteCache（= 表示用wishlistキャッシュ）を唯一のソースにする
  const CHILD_ORIGIN =
    typeof window !== "undefined" ? window.location.origin : "*";

  // 商品ページ（iframe）からの postMessage
  useEffect(() => {
    const onMsg = async (e) => {
      // 同一オリジン以外は無視（混入対策）
      if (!e || e.origin !== CHILD_ORIGIN) return;
      const msg = e?.data || {};
      const { type } = msg || {};
      if (!type) return;

      // === ProductPage からのカート関連メッセージ ===
      if (type === "OPEN_CART") {
        if (!cartEnabled) return;
        setCartOpen(true);
        return;
      }

      if (type === "SIMPLE_CART_ADD" && msg.item) {
         if (!cartEnabled) return;
        try {
          await addLocal(msg.item); // ローカルカートに積む
          setCartOpen(true); // ついでに開く
        } catch (e) {
          console.error("SIMPLE_CART_ADD failed:", e);
        }
        return;
      }

      const sendSnapshotToChild = (janStr, nextRatingObj) => {
        try {
          const isWished = !!favoriteCache[janStr];
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: "STATE_SNAPSHOT",
              jan: janStr,
              wished: isWished,
              favorite: isWished, // 後方互換
              rating: nextRatingObj || userRatings[janStr] || null,
              // 後方互換のため送る場合は rating>0 を反映
              hideHeart:
                (nextRatingObj?.rating ||
                  userRatings[janStr]?.rating ||
                  0) > 0,
            },
            CHILD_ORIGIN
          );
          // HIDE_HEART 明示送信は廃止（子は rating から自律判定）
        } catch {}
      };

      // 評価を子iframeに明示的に適用させるための補助メッセージ
      const sendRatingToChild = (janStr, ratingObjOrNull) => {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: "SET_RATING", // 子側でこれを受けてUIを即時更新させる
              jan: janStr,
              rating: ratingObjOrNull, // { rating, date } もしくは null（クリア）
            },
            CHILD_ORIGIN
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

      // ProductPage の wishlist（DB正）→ MapPage（表示用キャッシュ）へ即反映
      // ProductPage は API を叩いた後にこれを投げる（単一ソース維持）
      if (type === "SET_WISHLIST") {
        const isWished = !!msg.value;
        setFavoriteCache((prev) => {
          const next = { ...prev };
          if (isWished) next[janStr] = { addedAt: new Date().toISOString() };
          else delete next[janStr];
          return next;
        });
        bumpFavoritesVersion();
        return;
      }

      if (type === "RATING_UPDATED") {
        const payload = msg.payload || null;

        setUserRatings((prev) => {
          const next = { ...prev };
          if (!payload || !payload.rating) delete next[janStr];
          else next[janStr] = payload;
          try {
            localStorage.setItem("userRatings", JSON.stringify(next));
          } catch {}
          return next;
        });

        // まずスナップショットを送る
        sendSnapshotToChild(janStr, msg.payload || null);
        // さらに評価を明示適用（特に「評価クリア(null)」時のUI遅延対策）
        sendRatingToChild(
          janStr,
          payload && Number(payload.rating) > 0 ? payload : null
        );
        return;
      }

      if (type === "tm:rating-updated") {
        const rating = Number(msg.rating) || 0;
        const date = msg.date || new Date().toISOString();

        setUserRatings((prev) => {
          const next = { ...prev };
          if (rating <= 0) delete next[janStr];
          else next[janStr] = { ...(next[janStr] || {}), rating, date };
          try {
            localStorage.setItem("userRatings", JSON.stringify(next));
          } catch {}
          return next;
        });

        // スナップショット
        const nextRating = rating > 0 ? { rating, date } : null;
        sendSnapshotToChild(janStr, nextRating);
        // 明示適用（評価クリア時のズレ解消）
        sendRatingToChild(janStr, nextRating);
        return;
      }

      // 子が再描画直後に状態を取りに来た時
      if (type === "REQUEST_STATE") {
        sendSnapshotToChild(janStr, null);
        return;
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [
    favoriteCache,
    userRatings,
    closeUIsThen,
    navigate,
    addLocal,
    cartEnabled,
    CHILD_ORIGIN,
  ]);

  // ====== レンダリング
  return (
    <div id="map-root" className="map-root" tabIndex={-1}>
      <MapCanvas
        data={data}

        // 店舗集合（意味の集合）：信頼できる時だけ意味を持つ
        storeJansSet={storeJansSet}

        // 描画用の主集合（表示フォールバックはこっちで吸収）
        visibleJansSet={visibleJansSet}

        // EC専用JAN（星・色替え用）
        ecOnlyJansSet={ecOnlyJansSet}

        // 表示許可集合（フェード/非表示制御）
        allowedJansSet={allowedJansSet}

        userRatings={userRatings}
        selectedJAN={selectedJAN}
        favorites={favoriteCache}          // wishlist（飲みたい）表示用キャッシュ（DB正で復元済み）
        favoritesVersion={favoritesVersion}
        highlight2D={highlight2D}
        userPin={userPin}
        panBounds={panBounds}
        viewState={viewState}
        setViewState={setViewState}
        onOpenSlider={() => navigate("/slider")}
        onPickWine={async (item) => {
          if (!item) return;

          const janStr = getJanFromItem(item);
          if (!janStr) {
            console.warn("onPickWine: JAN が取得できませんでした", item);
            return;
          }

          await closeUIsThen({
            preserveMyPage: true,
            preserveSearch: true,
            preserveCluster: true,
          });

          setClusterCollapseKey((k) => (k == null ? 1 : k + 1));

          setSelectedJAN(janStr);
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
            src={`${process.env.PUBLIC_URL || ""}/img/icon-colour.png`}
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
          pointerEvents: "auto",
        }}
        aria-label="アプリガイド"
        title="アプリガイド"
      >
        <img
          src={`${process.env.PUBLIC_URL || ""}/img/app-guide.svg`}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </button>

      {/* 右上: 検索 */}
      <button
        onClick={async () => {
          // 先に開く（体感速度優先）
          openPanel("search");
          // 裏で更新（points/allowed/rated-panel）
          refreshDataInBackground();
        }}
        style={{
          pointerEvents: "auto",
          position: "absolute",
          top: "60px",
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
        }}
        aria-label="検索"
        title="検索"
      >
        <img
          src={`${process.env.PUBLIC_URL || ""}/img/search.svg`}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </button>

      {/* 右サイド: 評価 */}
      <button
        onClick={async () => {
          // 先に開く（体感速度優先）
          openPanel("rated");
          // 裏で更新（points/allowed/rated-panel）
          refreshDataInBackground();
        }}
        style={{
          /* 110px */
          pointerEvents: "auto",
          position: "absolute",
          top: "110px",
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
        }}
        aria-label="評価一覧"
        title="評価（◎）一覧"
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
          }}
          draggable={false}
        />
      </button>

      {/* 右サイド: カート */}
      {cartEnabled && (
      <button
        onClick={() => openPanel("cart")}
        style={{
          /* 160px */
          pointerEvents: "auto",
          position: "absolute",
          top: "160px",
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
        }}
        aria-label="カートを開く"
        title="カートを開く"
      >
        <img
          src={`${process.env.PUBLIC_URL || ""}/img/icon-cart1.png`}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
          }}
          draggable={false}
        />
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
      )}

      {/* ====== 検索パネル ====== */}
      <SearchPanel
        open={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        data={searchPanelData}
        onPick={async (item) => {
          if (!item) return;

          const janStr = getJanFromItem(item);
          if (!janStr) {
            console.warn(
              "SearchPanel onPick: JAN が取得できませんでした",
              item
            );
            return;
          }

          await closeUIsThen({
            preserveMyPage: true,
            preserveSearch: true,
            preserveCluster: true,
          });

          // クラスターパネルを畳む
          setClusterCollapseKey((k) => (k == null ? 1 : k + 1));

          setSelectedJAN(janStr);

          setIframeNonce(Date.now());

          const tx = Number(item.umap_x),
            ty = Number(item.umap_y);
          if (Number.isFinite(tx) && Number.isFinite(ty)) {
            centerToUMAP(tx, ty, { zoom: viewState.zoom });
          }
          setProductDrawerOpen(true);
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
              sum += i % 2 === 0 ? d : d * 3;
            }
            const check = (10 - (sum % 10)) % 10;
            return check === ean.charCodeAt(12) - 48;
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
            const until = Number(
              sessionStorage.getItem(REREAD_LS_KEY) || 0
            );
            bypassThrottle = until > 0 && now < until;
          } catch {}

          if (!bypassThrottle) {
            if (
              jan === lastCommittedRef.current.code &&
              now - lastCommittedRef.current.at < 60000
            ) {
              return false;
            }
          }

          const hit = data.find(
            (d) => String(getJanFromItem(d)) === jan
          );
          if (hit) {
            const janStr = getJanFromItem(hit);
            if (!janStr) return false;

            await closeUIsThen({
              preserveMyPage: true,
              preserveCluster: true,
            });

            setSelectedJAN(janStr);

            setIframeNonce(Date.now());
            lastCommittedRef.current = { code: jan, at: now };

            const tx = Number(hit.umap_x),
              ty = Number(hit.umap_y);
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
        onSelectJAN={async (jan) => {
          await closeUIsThen({
            preserveMyPage: true,
            preserveRated: true,
            preserveCluster: true,
          });

          // クラスターパネルを畳む
          setClusterCollapseKey((k) => (k == null ? 1 : k + 1));

          try {
            sessionStorage.setItem("tm_from_rated_jan", String(jan));
          } catch {}
          setSelectedJAN(jan);
          setIframeNonce(Date.now());
          const item = data.find(
            (d) => String(getJanFromItem(d)) === String(jan)
          );
          if (item) {
            const tx = Number(item.umap_x),
              ty = Number(item.umap_y);
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
        collapseKey={clusterCollapseKey}
      />

      {/* 商品ページドロワー */}
      <Drawer
        anchor="bottom"
        open={productDrawerOpen}
        onClose={() => {
          setProductDrawerOpen(false);
          setSelectedJAN(null);
        }}
        sx={{ zIndex: 1700, pointerEvents: "none" }}
        hideBackdrop
        BackdropProps={{
          style: { background: "transparent", pointerEvents: "none" },
        }}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true, // フォーカスロック解除
          disableAutoFocus: true, // 自動フォーカスを抑止
          disableRestoreFocus: true, // 閉じた後のフォーカス復元も抑止
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
          }}
        />
        <div
          className="drawer-scroll"
          style={{ flex: 1, overflowY: "auto" }}
        >
          {selectedJAN ? (
            <iframe
              title={`product-${selectedJAN || "preview"}`}
              ref={iframeRef}
              key={`${selectedJAN}-${iframeNonce}`}
              src={`${
                process.env.PUBLIC_URL || ""
              }/#/products/${selectedJAN}?embed=1&_=${iframeNonce}`}
              style={{ width: "100%", height: "100%", border: "none" }}
              onLoad={() => {
                try {
                  requestAnimationFrame(() => {
                    iframeRef.current?.contentWindow?.postMessage(
                      {
                        type: "REQUEST_STATE",
                        jan: String(selectedJAN),
                      },
                      CHILD_ORIGIN
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
        sx={{ zIndex: 1850, pointerEvents: "none" }} // MapGuideより手前/後ろはお好みで
        BackdropProps={{
          style: {
            background: "transparent",
            pointerEvents: "none",
          },
        }}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true, // フォーカスロック解除
          disableAutoFocus: true, // 自動フォーカス抑止
          disableRestoreFocus: true, // フォーカス復元抑止
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
          title="ECカート"
          icon="icon-cart2.png"
          onClose={() => setCartOpen(false)}
        />
        <div
          className="drawer-scroll"
          style={{ flex: 1, overflowY: "auto" }}
          tabIndex={-1}
          data-autofocus="cart"
        >
          {/* isOpen を渡しておくと在庫チェックの依存が素直になる */}
          <SimpleCartPanel
            isOpen={cartOpen}
            onClose={() => setCartOpen(false)}
          />
        </div>
      </Drawer>

      {/* アプリガイド（メニュー） */}
      <Drawer
        anchor="bottom"
        open={isMyPageOpen}
        onClose={() => setIsMyPageOpen(false)}
        sx={{ zIndex: 1400, pointerEvents: "none" }}
        hideBackdrop
        BackdropProps={{
          style: { background: "transparent", pointerEvents: "none" },
        }}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true, // フォーカスロック解除
          disableAutoFocus: true, // 自動フォーカスを抑止
          disableRestoreFocus: true, // 閉じた後のフォーカス復元も抑止
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
          onOpenMiles={() => openOverlayAboveMenu("miles")}
          onOpenFaq={() => openOverlayAboveMenu("faq")}
          onOpenSlider={() => {
            setIsMyPageOpen(false);
            navigate("/slider", { replace: false, state: { from: "menu" } });
          }}
        />
      </Drawer>

      {/* あなたの味覚位置 */}
      <Drawer
        anchor="bottom"
        open={isTastePositionOpen}
        onClose={() => setIsTastePositionOpen(false)}
        sx={{ zIndex: 1800, ...passThroughDrawerSx }}
        hideBackdrop
        BackdropProps={passThroughBackdropProps}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true,
          disableAutoFocus: true,
          disableRestoreFocus: true,
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
          sx: passThroughPaperSx,
        }}
      >
        <PanelHeader
          title="あなたの味覚位置"
          icon="dot.svg"
          onClose={() => setIsTastePositionOpen(false)}
        />
        <div className="drawer-scroll" style={{ flex: 1, overflowY: "auto" }}>
          <TastePositionPanelContent userPin={userPin} />
        </div>
      </Drawer>

      {/* マップガイド */}
      <Drawer
        anchor="bottom"
        open={isMapGuideOpen}
        onClose={() => setIsMapGuideOpen(false)}
        sx={{ zIndex: 1800, ...passThroughDrawerSx }}
        hideBackdrop
        BackdropProps={passThroughBackdropProps}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true,
          disableAutoFocus: true,
          disableRestoreFocus: true,
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
          sx: passThroughPaperSx,          
        }}
      >
        <PanelHeader
          title="マップガイド"
          icon="map-guide.svg"
          onClose={() => setIsMapGuideOpen(false)}
        />
        <div
          className="drawer-scroll"
          style={{ flex: 1, overflowY: "auto" }}
        >
          <MapGuidePanelContent />
        </div>
      </Drawer>

      {/* マイアカウント */}
      <Drawer
        anchor="bottom"
        open={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        sx={{ zIndex: 1500, ...passThroughDrawerSx }}
        hideBackdrop
        BackdropProps={passThroughBackdropProps}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true,
          disableAutoFocus: true,
          disableRestoreFocus: true,
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
          sx: passThroughPaperSx,
        }}
      >
        <PanelHeader
          title="マイアカウント"
          icon="account.svg"
          onClose={() => setIsAccountOpen(false)}
        />
        <div
          className="drawer-scroll"
          style={{ flex: 1, overflowY: "auto" }}
        >
          <MyAccountPanelContent />
        </div>
      </Drawer>

      {/* お気に入り店舗登録 */}
      <Drawer
        anchor="bottom"
        open={isStoreOpen}
        onClose={() => setIsStoreOpen(false)}
        sx={{ zIndex: 1500, ...passThroughDrawerSx }}
        hideBackdrop
        BackdropProps={passThroughBackdropProps}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true,
          disableAutoFocus: true,
          disableRestoreFocus: true,
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
          sx: passThroughPaperSx,          
        }}
      >
        <PanelHeader
          title="お気に入り店舗登録"
          icon="store.svg"
          onClose={() => setIsStoreOpen(false)} // ← 子だけ閉じる
        />
        <div
          className="drawer-scroll"
          style={{ flex: 1, overflowY: "auto" }}
        >
          <StorePanelContent />
        </div>
      </Drawer>

      {/* 獲得マイル */}
      <Drawer
        anchor="bottom"
        open={isMilesOpen}
        onClose={() => setIsMilesOpen(false)}
        sx={{ zIndex: 1500, ...passThroughDrawerSx }}
        hideBackdrop
        BackdropProps={passThroughBackdropProps}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true,
          disableAutoFocus: true,
          disableRestoreFocus: true,
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
          sx: passThroughPaperSx,          
        }}
      >
        <PanelHeader
          title="獲得マイル"
          icon="account.svg" // 後で mile.svg に差替え可
          onClose={() => setIsMilesOpen(false)}
        />
        <div className="drawer-scroll" style={{ flex: 1, overflowY: "auto" }}>
          <MilesPanelContent />
        </div>
      </Drawer>

      {/* よくある質問 */}
      <Drawer
        anchor="bottom"
        open={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
        sx={{ zIndex: 1500, ...passThroughDrawerSx }}
        hideBackdrop
        BackdropProps={passThroughBackdropProps}
        ModalProps={{
          ...drawerModalProps,
          keepMounted: true,
          disableEnforceFocus: true,
          disableAutoFocus: true,
          disableRestoreFocus: true,
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
          sx: passThroughPaperSx,          
        }}
      >
        <PanelHeader
          title="よくある質問"
          icon="faq.svg"
          onClose={() => setIsFaqOpen(false)}
        />
        <div
          className="drawer-scroll"
          style={{ flex: 1, overflowY: "auto" }}
        >
          <FaqPanelContent />
        </div>
      </Drawer>

      {/* 下部中央: 「○○さんの地図」ラベル */}
      {(() => {
        try {
          const token = localStorage.getItem("app.access_token");
          if (!token) return null; // ログアウト → 非表示

          if (!userDisplayName) return null;

         // RatedPanel 表示中は、ラベルがパネル内に透けるので消す
         if (isRatedOpen) return null;

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
