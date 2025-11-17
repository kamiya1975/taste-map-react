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
  onHeaderClick,
  motionPreset = "mui", // 'spring' | 'mui' | 'snap'
  animateHeight = false,
  heightDurationMs = 225,
  zIndex = 1500,
  hideClose = false,
}) {
  const handleClose = (e) => {
    e?.stopPropagation?.();
    onClose?.();
  };

  // --- transition プリセット ---
  const transitions = {
    spring: { type: "spring", stiffness: 200, damping: 25 },
    mui: { type: "tween", ease: [0.4, 0.0, 0.2, 1], duration: 0.22 },
    snap: { type: "tween", duration: 0 },
  };
  const transition = transitions[motionPreset] || transitions.mui;

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
            left: 0,
            right: 0,
            bottom: 0,
            height,
            backgroundColor: "#fff",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.2)",
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            display: "flex",
            flexDirection: "column",
            zIndex,
            // ★ 高さだけ CSS トランジション（MUIと同じカーブ）
            transition: animateHeight
              ? `height ${heightDurationMs}ms cubic-bezier(0.4, 0.0, 0.2, 1)`
              : undefined,
          }}
        >
          <div
            onClick={onHeaderClick}
            style={{
              cursor: onHeaderClick ? "pointer" : "default",
              userSelect: "none",
            }}
          >
            <PanelHeader
              title={title}
              icon={icon}
              onClose={hideClose ? undefined : handleClose}
              rightExtra={rightExtra}
            />
          </div>

          <div
            className="drawer-scroll"
            style={{
              height: `calc(${typeof height === "number" ? `${height}px` : height} - ${PANEL_HEADER_H}px)`,
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
