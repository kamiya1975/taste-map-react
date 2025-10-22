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
  rightExtra = null,       // 右上に並び替えカプセル等を置きたい時
  children,                // パネル中身
  height = DRAWER_HEIGHT,  // 必要なら可変
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
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
            zIndex: 1500, // 他と同等
          }}
        >
          <PanelHeader title={title} icon={icon} onClose={onClose} rightExtra={rightExtra} />
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
