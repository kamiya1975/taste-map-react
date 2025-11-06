// ==============================
// src/ui/constants.js（集約・完全版）
// ==============================

// ===== Drawer共通 =====
export const DRAWER_HEIGHT = "calc(66svh - env(safe-area-inset-bottom))";
export const CLUSTER_DRAWER_HEIGHT = "calc(56svh - env(safe-area-inset-bottom))"; // ← ここに統一

export const drawerModalProps = {
  keepMounted: true,
  hideBackdrop: true,
  slotProps: {
    root: { style: { pointerEvents: "none" } }, // 透明領域はイベント透過
  },
};

export const paperBaseStyle = {
  width: "100%",
  height: DRAWER_HEIGHT,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  overflow: "hidden",
  pointerEvents: "auto",
};

// ===== Map共通 =====
export const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;
export const CENTER_Y_OFFSET = -3.5;
export const ZOOM_LIMITS = { min: 5.5, max: 7.25 };
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
  1:  [ 79, 199, 0, 255],  2:  [253, 29, 119, 255],
  3:  [143, 17, 0, 255],  4:  [255, 0,  0, 255],
  5:  [252, 244,  3, 255],  6:  [240, 213, 199, 255],
  7:  [80, 36, 87, 255],  8:  [242, 201, 61, 255],
  9:  [186, 247, 75, 255],  10: [164, 44,  150, 255],
};
export const getClusterRGBA = (clusterId, fallback = [200,200,200,255]) =>
  CLUSTER_COLORS_FIXED?.[Number(clusterId)] ?? fallback;

// クラスタ名・“買う目安”解説（ここで一元管理）
export const CLUSTER_META = [
  { id: 6,  name: "甘口・フルーティー", hint: "●●●●●●●●●●●●●●●●●●" },
  { id: 9,  name: "淡麗・フレッシュ白", hint: "●●●●●●●●●●●●●●●●●●●" },
  { id: 1,  name: "酸味・シャープ白",   hint: "●●●●●●●●●●●●●●●●●●●●" },
  { id: 5,  name: "穏やか・まろやか白", hint: "●●●●●●●●●●●●●●●●●●●●●" },
  { id: 8,  name: "熟成・やや複雑白",   hint: "●●●●●●●●●●●●●●●●●●●●●●" },
  { id: 4,  name: "軽い・クリーン赤",   hint: "●●●●●●●●●●●●●●●●●●●●●●●" },
  { id: 2,  name: "穏やか・まろやか赤", hint: "●●●●●●●●●●●●●●●●●●●●●●●●" },
  { id: 10, name: "円熟・中ボディ赤",   hint: "●●●●●●●●●●●●●●●●●●●●●●●●●" },
  { id: 7,  name: "濃厚・重ボディ赤", hint: "●●●●●●●●●●●●●●●●●●●●●●●●●●" },
  { id: 3,  name: "骨格・重ボディ赤",   hint: "●●●●●●●●●●●●●●●●●●●●●●●●●●●" },
];

// 取得ヘルパ
export const getClusterMeta = (id) =>
  CLUSTER_META.find((m) => m.id === Number(id)) || { id, name: `Cluster_${id}`, hint: "" };
