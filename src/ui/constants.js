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
//export const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;
export const CENTER_Y_OFFSET = -3.5;
export const ZOOM_LIMITS = { min: 5.25, max: 8.00 };
export const INITIAL_ZOOM = 5.5;

// ===== Map point radius（打点の大きさ）=====
// ScatterplotLayer の radius（UMAP座標系のワールド単位）
export const MAP_POINT_RADIUS = 0.03;
// クラスタ配色ON時は少し大きく（好みで 0.036〜0.040 に調整）
export const MAP_POINT_RADIUS_CLUSTER = 0.040;

// 打点カラー
export const MAP_POINT_COLOR    = [160, 160, 160, 220];
export const MAP_POINT_HOVER    = [120, 120, 120, 255];
export const MAP_POINT_SELECTED = [ 80,  80,  80, 255];
export const ORANGE = [255, 140, 0];

// ===== wishlist（飲みたい）星 =====
export const WISH_STAR_COLOR = [178, 53, 103, 255]; 
// IconLayer の sizeUnits="meters" 用（MapCanvas の getSize と合わせる）
export const WISH_STAR_SIZE = 0.18; // 0.28〜0.36で好み調整

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

// ===== タイプ別カラー（CSS / Array）===== //多分使われていない
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
export const CLUSTER_COUNT = 7; // ← 通常運用は10クラスター

// 配色（1..20用意。COUNTが10でも余剰は無視）
export const CLUSTER_COLORS_FIXED = {
  7:  [231, 201, 183, 255],  // 甘口・フルーティー
  5:  [195, 218, 147, 255],  // 若飲みフレッシュ
  1:  [112, 175,  84, 255],  // シャープ・クリア
  4:  [235, 220,  80, 255],  // 軽快・まろやか
//  5:  [216, 209, 119, 255],  // 穏やか・ミディアム
//  6:  [164, 137,  66, 255],  // 個性派・熟成系
  6:  [196,  73,  75, 255],  // 軽い・クリーン
  2:  [113,  77, 126, 255],  // 円熟・中ボディ
//  9:  [ 41,  23,  47, 255],  // 濃厚・フルボディ
  3:  [108,  38,  38, 255],  // 骨格・スモーキー
};
export const getClusterRGBA = (clusterId, fallback = [200,200,200,255]) =>
  CLUSTER_COLORS_FIXED?.[Number(clusterId)] ?? fallback;

// クラスタ名・“買う目安”解説（ここで一元管理）
export const CLUSTER_META = [
  { id: 7,  name: "1.濃密•芳醇甘口",    hint: "凝縮した甘味と芳醇な香り。濃密でとろける甘口" },
  { id: 5,  name: "2.軽快•フレッシュ",    hint: "引き締まった酸味と繊細な香り。すっきり軽やかな白" },
  { id: 1,  name: "3.シャープ•爽快辛口",     hint: "リンゴ酸の爽やかな酸味。淡色でキレのある辛口白" },
  { id: 4,  name: "4.華やか•フルーティ",       hint: "華やかな果実香と軽快な口当たり。明るく爽やかな白" },
  { id: 6,  name: "5.柔らか•まろやか",     hint: "穏やかな酸味と丸みのある口当たり。柔らかく優しい赤" },
  { id: 2,  name: "6.骨格•まろやか赤",       hint: "豊かな色調と丸みのある酸味。厚みとコクのある赤" },
  { id: 3,  name: "7.重厚•スモーキー",       hint: "燻製やスパイスの複雑な香り。深みと個性のある赤" },
//  { id: 8,  name: "8.円熟•中ボディ",       hint: "厚みと甘やかさが調和する、円熟で柔らかく滑らかなリッチ感" },
//  { id: 9,  name: "9.濃厚•フルボディ",     hint: "濃厚な果実味と樽香のコク。力強く飲みごたえのあるフルボディ" },
//  { id: 10,  name: "10.骨格スモーキー",    hint: "酸味と骨格が調和し、厚みと熟成感が重なるスモーキーで力強い" },
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
    label: "LnbRW-202511",   // "初回ロット（2025-11）"
    umap_x: 11.9967,
    umap_y: 2.4175,
    pc1: -2.4685,
    pc2: -3.0630,
    pc3: -2.5286,
  },
  rw1_2026_08: {
    lotId: "rw1_2026_08",
    label: "LnbRW-202608",  // "2ロット目（2026-08）"
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
