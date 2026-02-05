// src/components/ui/PanelHeader.jsx
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
  right,                // 右側を完全にカスタムしたい時に使う（×も含めて自前）
  leftExtra,            // タイトルの右隣に置く要素（任意）
  rightExtra,           // ← 追加：右側（×の左）に置く要素
  iconSize = 25,        // ← 追加：ヘッダー左アイコンのサイズ
}) {
  const base = (process.env.PUBLIC_URL || "") + "/img/";

  const CloseBtn = (
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
        marginRight: 15, // 端との余白はここで管理
      }}
    >
      ×
    </button>
  );

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
      {/* 左：アイコン＋タイトル（＋任意の拡張） */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon && (
          <img
            src={`${base}${icon}`}
            onError={(e) => {
              if (iconFallback) e.currentTarget.src = `${base}${iconFallback}`;
            }}
            alt=""
            style={{
              width: iconSize,
              height: iconSize,
              display: "block",
              objectFit: "contain",
            }}
            draggable={false}
          />
        )}
        <span style={{ fontWeight: 600, lineHeight: 1 }}>{title}</span>
        {leftExtra /* ← ラッパ無しで直差し */}
      </div>

      {/* 右：カスタム or 右側追加要素 + × */}
      {right != null ? (
        right
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {rightExtra}
          {onClose && CloseBtn}
        </div>
      )}
    </div>
  );
}
