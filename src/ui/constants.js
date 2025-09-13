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
