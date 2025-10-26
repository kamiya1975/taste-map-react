// src/components/panels/PanelShell.jsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DRAWER_HEIGHT,
  PANEL_HEADER_H,
  PANEL_HEADER_BORDER,
} from "../../ui/constants";
import PanelHeader from "../ui/PanelHeader";

export default function PanelShell({
  isOpen,
  onClose,
  title,
  icon,
  rightExtra = null,
  children,
  height = DRAWER_HEIGHT,
  onHeaderClick,                // ★ 追加：ヘッダー帯タップ時のハンドラ（任意）
  motionPreset = "mui",
}) {
  // 閉じる押下時はトグルを発火させない
  const handleClose = (e) => {
    e?.stopPropagation?.();
    onClose?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={transition}
          style={{
            position: "absolute",
            left: 0, right: 0, bottom: 0,
            height,
            backgroundColor: "#fff",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.2)",
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            display: "flex",
            flexDirection: "column",
            zIndex: 1500,
          }}
        >
          <div
            onClick={onHeaderClick}           // ★ ヘッダー全域をトグル領域に
            style={{
              cursor: onHeaderClick ? "pointer" : "default",
              userSelect: "none",
            }}
          >
            <PanelHeader
              title={title}
              icon={icon}
              onClose={handleClose}           // ★ 伝播止めるラッパー
              rightExtra={rightExtra}
            />
          </div>

          <div
            className="drawer-scroll"
            style={{
              height: `calc(${height} - ${PANEL_HEADER_H}px)`,
              overflowY: "auto",
              background: "#fff",
              borderTop: PANEL_HEADER_BORDER,
            }}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
