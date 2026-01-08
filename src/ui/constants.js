// ==============================
// src/ui/constants.js（集約・完全版）
// ==============================

// ===== Drawer共通 =====
export const DRAWER_HEIGHT = "calc(66svh - env(safe-area-inset-bottom))";
export const CLUSTER_DRAWER_HEIGHT = "calc(56svh - env(safe-area-inset-bottom))"; // ← ここに統一

export const drawerModalProps = {
  keepMounted: true,
  disablePortal: false, 
  container: typeof window !== "undefined" ? document.body : undefined, // ★#rootは使わない
  // disableScrollLock: true, // （必要なら）スクロールロックを無効化
};

export const paperBaseStyle = {
  width: "100%",
  height: DRAWER_HEIGHT,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  overflow: "hidden",
  pointerEvents: "auto",
};

// TasteMap APIベースURL
export const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

// TasteMap 打点APIのURL（MapPage / SliderPage で共通利用）
export const TASTEMAP_POINTS_URL =
  process.env.REACT_APP_POINTS_JSON_URL ||
  `${API_BASE}/api/app/points`;

// ===== Map共通 =====
export const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;
export const CENTER_Y_OFFSET = -3.5;
export const ZOOM_LIMITS = { min: 5.25, max: 8.00 };
export const INITIAL_ZOOM = 5.5;

// 打点カラー
export const MAP_POINT_COLOR    = [160, 160, 160, 220];
export const MAP_POINT_HOVER    = [120, 120, 120, 255];
export const MAP_POINT_SELECTED = [ 80,  80,  80, 255];
export const ORANGE = [255, 140, 0];

// ===== ヒート/グリッド =====
export const GRID_CELL_SIZE = 0.2;
export const HEAT_ALPHA_MIN = 24;
export const HEAT_ALPHA_MAX = 255;
export const HEAT_GAMMA = 0.65;
export const HEAT_CLIP_PCT = [0.0, 0.98];
export const HEAT_COLOR_LOW  = [255, 255, 255];
export const HEAT_COLOR_HIGH = [255, 165,   0];

// ===== Panel Header =====
export const PANEL_HEADER_H       = 42;
export const PANEL_HEADER_BG      = "rgb(221, 211, 198)";
export const PANEL_HEADER_BORDER  = "1px solid rgb(201, 201, 176)";
export const PANEL_HEADER_PADDING = "0 8px 0 12px";

// ===== タイプ別カラー（CSS / Array）=====
export const TYPE_COLOR_CSS = {
  Spa: "rgb(111,151,173)", Sparkling: "rgb(111,151,173)",
  White: "rgb(213,213,102)", Red: "rgb(131,39,72)",
  Rose: "rgb(224,123,143)",  Other: "rgb(180,180,180)",
};
export const TYPE_COLOR_MAP = {
  Spa: [111,151,173], Sparkling: [111,151,173],
  White: [213,213,102], Red: [131,39,72],
  Rose: [224,123,143],  Other: [180,180,180],
};
export const getTypeColorCSS = (type, fallback = "rgb(180,180,180)") => {
  if (!type) return fallback;
  const key = String(type).trim();
  if (TYPE_COLOR_CSS[key]) return TYPE_COLOR_CSS[key];
  const norm = key.toLowerCase().replace(/é/g, "e");
  if (norm.includes("spark")) return TYPE_COLOR_CSS.Spa;
  if (norm.includes("white") || norm.includes("blanc")) return TYPE_COLOR_CSS.White;
  if (norm.includes("red")   || norm.includes("rouge")) return TYPE_COLOR_CSS.Red;
  if (norm.includes("rose")  || norm.includes("ros"))   return TYPE_COLOR_CSS.Rose;
  return fallback;
};

// ===== クラスタ配色・メタ（集約ポイント）=====
export const CLUSTER_COUNT = 10; // ← 運用は10クラスター

// 配色（1..20用意。COUNTが10でも余剰は無視）
export const CLUSTER_COLORS_FIXED = {
  9:  [231, 201, 183, 255],  // 甘口・フルーティー
  7:  [195, 218, 147, 255],  // 若飲みフレッシュ
  5:  [112, 175,  84, 255],  // シャープ・クリア
  6: [216, 209, 119, 255],  // 軽快・まろやか
  10:  [216, 209, 119, 255],  // 穏やか・ミディアム
  2:  [164, 137,  66, 255],  // 個性派・熟成系
  3:  [196,  73,  75, 255],  // 軽い・クリーン
  1:  [113,  77, 126, 255],  // 円熟・中ボディ
  4:  [ 41,  23,  47, 255],  // 濃厚・フルボディ
  8:  [108,  38,  38, 255],  // 骨格・スモーキー
};
export const getClusterRGBA = (clusterId, fallback = [200,200,200,255]) =>
  CLUSTER_COLORS_FIXED?.[Number(clusterId)] ?? fallback;

// クラスタ名・“買う目安”解説（ここで一元管理）
export const CLUSTER_META = [
  { id: 9,  name: "甘口・フルーティー", hint: "低アルで軽く甘酸っぱく、若々しく爽快なフルーティタイプ" },
  { id: 7,  name: "若飲みフレッシュ", hint: "爽やかなハーブや柑橘の香り。フレッシュですっきり爽快な軽白" },
  { id: 5,  name: "シャープ・クリア",   hint: "柑橘の酸味と硬質なキレ。淡色で軽快、透明感のある辛口白" },
  { id: 6,  name: "軽快・まろやか", hint: "軽快でミルキーさと柑橘が混ざる、柔らかい飲み心地のまろやか" },
  { id: 10,  name: "穏やか・ミディアム", hint: "まろやかな口当たりで、渋み控えめ。柔らかく果実味が広がる白" },
  { id: 2,  name: "個性派・熟成系",   hint: "スモークやミネラルの複雑な香り。辛口で引き締まった熟成タイプ" },
  { id: 3,  name: "軽い・クリーン",   hint: "香り味わいとも軽やかで控えめ。雑味がなく透明感のあるライト赤" },
  { id: 1, name: "円熟・中ボディ",   hint: "厚みと甘やかさが調和する、円熟で柔らかく滑らかなリッチな赤" },
  { id: 4,  name: "濃厚・フルボディ", hint: "濃厚な果実味と樽香のコク。力強く飲みごたえのあるフルボディ赤" },
  { id: 8,  name: "骨格・スモーキー",   hint: "酸味と骨格が調和し、厚みと熟成感が重なるスモーキーで力強い赤" },
];

// 取得ヘルパ
export const getClusterMeta = (id) =>
  CLUSTER_META.find((m) => m.id === Number(id)) || { id, name: `Cluster_${id}`, hint: "" };


// ==============================
// 基準ワイン（Reference Wine）ロット情報
// ==============================

export const REFERENCE_LOTS = {
  rw1_2025_11: {
    lotId: "rw1_2025_11",
    label: "初回ロット（2025-11）",
    umap_x: 8.610993,
    umap_y: 6.742073,
    pc1: -3.2243,
    pc2: -1.7727,
    pc3: -5.7437,
  },
  rw1_2026_08: {
    lotId: "rw1_2026_08",
    label: "2ロット目（2026-08）",
    umap_x: 5.444825,
    umap_y: 6.457314,
    pc1: 1.5571,
    pc2: 3.2194,
    pc3: -0.2300,
  },
};

// LOT_ID（例：rw1_2026_08）からロット情報を返す。
// 該当がなければデフォルト（初回ロット）を返す。
export const getReferenceLotById = (lotId) =>
  REFERENCE_LOTS[lotId] || REFERENCE_LOTS["rw1_2025_11"];

export const WINE_TYPE_LABELS = {
  sparkling: "スパークリング",
  spark: "スパークリング",
  spa: "スパークリング",

  white: "白ワイン",
  blanc: "白ワイン",

  red: "赤ワイン",
  rouge: "赤ワイン",

  rose: "ロゼワイン",
  rosé: "ロゼワイン",
  ros: "ロゼワイン",
};

export const toJapaneseWineType = (raw) => {
  if (!raw) return "—";
  const key = String(raw).trim().toLowerCase();
  return WINE_TYPE_LABELS[key] || raw;
};

export const clusterRGBAtoCSS = (rgba) => {
  if (!rgba) return "rgb(200,200,200)";
  const [r, g, b] = rgba;
  return `rgb(${r}, ${g}, ${b})`;
};

/* =============================
 *  EC商品（★表示）用 定数
 * ============================= */

// ★マーカーの基本サイズ（DeckGL world座標系）
export const EC_STAR_BASE_RADIUS = 0.09;      // 本体サイズ
export const EC_STAR_OUTLINE_RADIUS = 0.14;   // 外側の縁取りサイズ

// ★マーカーの色（RGBA）
export const EC_STAR_FILL_COLOR   = [0, 0, 0, 255];       // 中の★の色
export const EC_STAR_OUTLINE_COLOR = [255, 255, 255, 255]; // 外枠のカラー

// ★アイコン画像（IconLayer で使う場合）
export const EC_STAR_ICON_URL = `${process.env.PUBLIC_URL || ""}/img/ec-star.png`;

// ★凡例などで使う説明テキスト
export const EC_STAR_DESCRIPTION =
  "★はTasteMap公式ECで購入できるワインを表します。";

// =====================
// OFFICIAL STORE ID
// =====================
export const OFFICIAL_STORE_ID =
  Number(process.env.REACT_APP_OFFICIAL_STORE_ID || "1");
