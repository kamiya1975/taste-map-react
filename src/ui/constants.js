// Drawer の共通高さやスタイル
export const DRAWER_HEIGHT = "60vh";

// 透明なモーダルにして、背面の DeckGL を操作可能にする共通 props
export const drawerModalProps = {
  keepMounted: true,
  hideBackdrop: true,
  slotProps: {
    root: { style: { pointerEvents: "none" } } // 透明領域はイベント透過
  }
};

// Drawer 本体は操作できるように pointerEvents を戻す
export const paperBaseStyle = {
  width: "100%",
  height: DRAWER_HEIGHT,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  overflow: "hidden",
  pointerEvents: "auto"
};

// === 追加: Map共通定数 ===
export const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;
export const CENTER_Y_OFFSET = -3.5;
export const ZOOM_LIMITS = { min: 5.5, max: 7.25 };
export const INITIAL_ZOOM = 6;

export const TYPE_COLOR_MAP = {
  White: [150, 150, 150],
  Red: [150, 150, 150],
  Rose: [150, 150, 150],
  Sparkling: [150, 150, 150],
  Other: [150, 150, 150],
};
export const ORANGE = [255, 140, 0];

// ヒート/グリッド
export const GRID_CELL_SIZE = 0.2;
export const HEAT_ALPHA_MIN = 24;
export const HEAT_ALPHA_MAX = 255;
export const HEAT_GAMMA = 0.65;
export const HEAT_CLIP_PCT = [0.0, 0.98];
export const HEAT_COLOR_LOW = [255, 255, 255];
export const HEAT_COLOR_HIGH = [255, 165, 0];
