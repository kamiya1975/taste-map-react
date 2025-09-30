// ==============================
// src/ui/constants.js（完全版）
// ==============================

// Drawer の共通高さやスタイル
export const DRAWER_HEIGHT = "60vh";

// 透明なモーダルにして、背面の DeckGL を操作可能にする共通 props
export const drawerModalProps = {
  keepMounted: true,
  hideBackdrop: true,
  slotProps: {
    root: { style: { pointerEvents: "none" } }, // 透明領域はイベント透過
  },
};

// Drawer 本体は操作できるように pointerEvents を戻す
export const paperBaseStyle = {
  width: "100%",
  height: DRAWER_HEIGHT,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  overflow: "hidden",
  pointerEvents: "auto",
};

// === Map共通定数 ===
export const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;
export const CENTER_Y_OFFSET = -3.5;
export const ZOOM_LIMITS = { min: 5.5, max: 7.25 };
export const INITIAL_ZOOM = 5.5;

// === Mapの打点カラー（タイプ無関係で固定グレー） ===
// 透過ありの RGBA（DeckGL は [r,g,b] も可。必要に応じて 4成分で）
export const MAP_POINT_COLOR = [160, 160, 160, 220];   // 通常点
export const MAP_POINT_HOVER = [120, 120, 120, 255];   // ホバー時
export const MAP_POINT_SELECTED = [80, 80, 80, 255];   // 選択時

// 選択枠などで使うアクセント
export const ORANGE = [255, 140, 0];

// === ヒート/グリッド ===
export const GRID_CELL_SIZE = 0.2;
export const HEAT_ALPHA_MIN = 24;
export const HEAT_ALPHA_MAX = 255;
export const HEAT_GAMMA = 0.65;
export const HEAT_CLIP_PCT = [0.0, 0.98];
export const HEAT_COLOR_LOW = [255, 255, 255];
export const HEAT_COLOR_HIGH = [255, 165, 0];

// ===== Panel Header (実機で揃う見えの高さ) =====
export const PANEL_HEADER_H       = 42;                               // 実機で一致した値
export const PANEL_HEADER_BG      = "rgb(221, 211, 198)";             // ベージュ
export const PANEL_HEADER_BORDER  = "1px solid rgb(201, 201, 176)";   // 下線
export const PANEL_HEADER_PADDING = "0 8px 0 12px";                   // 左右パディング

// === リスト/バッジ用：タイプ別カラー（CSS文字列） ===
// 指定：Spa(111,151,173) / White(213,213,102) / Red(131,39,72) / Rose(224,123,143)
export const TYPE_COLOR_CSS = {
  Spa:       "rgb(111,151,173)",
  Sparkling: "rgb(111,151,173)",
  White:     "rgb(213,213,102)",
  Red:       "rgb(131,39,72)",
  Rose:      "rgb(224,123,143)",
  Other:     "rgb(180,180,180)",
};

// 配列RGB版（DeckGL等で必要な場合）
export const TYPE_COLOR_MAP = {
  Spa: [111, 151, 173],
  Sparkling: [111, 151, 173],
  White: [213, 213, 102],
  Red: [131, 39, 72],
  Rose: [224, 123, 143],
  Other: [180, 180, 180],
};

// ゆるい表記ゆれ吸収（リストの色分け用）
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
