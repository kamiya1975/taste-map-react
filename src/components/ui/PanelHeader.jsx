import React from "react";
import {
  PANEL_HEADER_H,
  PANEL_HEADER_BG,
  PANEL_HEADER_BORDER,
  PANEL_HEADER_PADDING,
} from "../../ui/constants";

export default function PanelHeader({
  title,
  icon,                 // 例: "search2.svg" / "dot.svg"
  iconFallback,         // 例: "search.svg"
  onClose,
  right,                // 右側アクション（デフォルトは ×）
  leftExtra,            // タイトルの右に並べる要素
}) {
  const base = (process.env.PUBLIC_URL || "") + "/img/";

  return (
    <div
      className="drawer-header"
      style={{
        height: PANEL_HEADER_H,
        minHeight: PANEL_HEADER_H,
        maxHeight: PANEL_HEADER_H,
        boxSizing: "border-box",
        padding: PANEL_HEADER_PADDING,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: PANEL_HEADER_BG,
        borderBottom: PANEL_HEADER_BORDER,
      }}
    >
      {/* 左：アイコン＋タイトル＋拡張 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon && (
          <img
            src={`${base}${icon}`}
            onError={(e) => {
              if (iconFallback) e.currentTarget.src = `${base}${iconFallback}`;
            }}
            alt=""
            style={{ width: 16, height: 16, display: "block" }}
            draggable={false}
          />
        )}
        <span style={{ fontWeight: 600, lineHeight: 1 }}>{title}</span>
        {leftExtra /* ← 余計な <div> を使わず直に差し込む */}
      </div>

      {/* 右：アクション or × */}
      {right ?? (
        <button
          onClick={onClose}
          aria-label="閉じる"
          title="閉じる"
          style={{
            background: "transparent",
            border: "none",
            padding: "6px 8px",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            color: "#000",
            marginRight: 15,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
