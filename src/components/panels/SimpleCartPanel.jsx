// src/components/panels/SimpleCartPanel.jsx
import React from "react";
import { useSimpleCart } from "../../cart/simpleCart";

/**
 * シンプルカートパネル（ローカル積み）
 * - 何も入っていない時は「カートの中身は空です」を表示
 * - 入っている時は：商品名 / 価格 / 容量 / 数量(±) / 削除 を表示
 */
export default function SimpleCartPanel({ onClose }) {
  const {
    items = [],
    subtotal = 0,
    currency = "JPY",
    updateQty,      // (jan, nextQty)
    remove,         // (jan)
    clear,          // () => void
  } = useSimpleCart() || {};

  const isEmpty = !Array.isArray(items) || items.length === 0;

  if (isEmpty) {
    return (
      <div style={{ padding: 16 }}>
        <div
          style={{
            padding: "24px 16px",
            textAlign: "center",
            color: "#666",
            border: "1px dashed #ccc",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          カートの中身は空です
        </div>
      </div>
    );
  }

  const fmt = (n) =>
    typeof n === "number" && isFinite(n)
      ? n.toLocaleString("ja-JP")
      : String(n ?? "");

  return (
    <div style={{ padding: 12 }}>
      {/* 行一覧 */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((it) => {
          const {
            jan,
            title,
            price = 0,
            qty = 1,
            volume_ml,
            imageUrl,
          } = it || {};
          const canDec = qty > 1;

          const handleDec = () => {
            if (!updateQty) return;
            updateQty(jan, Math.max(1, (qty || 1) - 1));
          };
          const handleInc = () => {
            if (!updateQty) return;
            updateQty(jan, (qty || 1) + 1);
          };
          const handleRemove = () => {
            if (!remove) return;
            remove(jan);
          };

          return (
            <li
              key={jan || title || Math.random()}
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr auto",
                gap: 10,
                padding: "10px 6px",
                borderBottom: "1px solid #eee",
                alignItems: "center",
              }}
            >
              {/* サムネ */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "#fff",
                  border: "1px solid #eee",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    draggable={false}
                  />
                ) : (
                  <div style={{ color: "#aaa", fontSize: 11 }}>No Image</div>
                )}
              </div>

              {/* 本文 */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={title || ""}
                >
                  {title || "(無題)"}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#555" }}>
                  ¥{fmt(price)} / {volume_ml ? `${fmt(volume_ml)}ml` : "容量不明"}
                </div>

                {/* 数量コントロール */}
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={handleDec}
                    disabled={!updateQty || !canDec}
                    style={btnStyle(!updateQty || !canDec)}
                    aria-label="数量を減らす"
                    title="数量を減らす"
                  >
                    －
                  </button>
                  <span style={{ minWidth: 24, textAlign: "center" }}>{qty}</span>
                  <button
                    onClick={handleInc}
                    disabled={!updateQty}
                    style={btnStyle(!updateQty)}
                    aria-label="数量を増やす"
                    title="数量を増やす"
                  >
                    ＋
                  </button>
                </div>
              </div>

              {/* 削除 */}
              <div>
                <button
                  onClick={handleRemove}
                  disabled={!remove}
                  style={dangerBtnStyle(!remove)}
                  aria-label="この商品を削除"
                  title="この商品を削除"
                >
                  削除
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* フッター（小計・クリア・閉じる） */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: "space-between",
          padding: "10px 6px 2px",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          小計：<span style={{ fontFeatureSettings: '"tnum"' }}>¥{fmt(subtotal)}</span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => clear && clear()}
            disabled={!clear}
            style={ghostBtnStyle(!clear)}
            aria-label="カートを空にする"
            title="カートを空にする"
          >
            クリア
          </button>
          <button
            onClick={() => onClose?.()}
            style={primaryBtnStyle(false)}
            aria-label="閉じる"
            title="閉じる"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(disabled) {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid #111",
    background: disabled ? "#f2f2f2" : "#fff",
    color: disabled ? "#aaa" : "#111",
    cursor: disabled ? "default" : "pointer",
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1,
  };
}

function dangerBtnStyle(disabled) {
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #c33",
    background: disabled ? "#f9eaea" : "#fff",
    color: disabled ? "#c99" : "#c33",
    cursor: disabled ? "default" : "pointer",
    fontSize: 12,
    fontWeight: 700,
  };
}

function ghostBtnStyle(disabled) {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #bbb",
    background: disabled ? "#f7f7f7" : "#fff",
    color: disabled ? "#aaa" : "#333",
    cursor: disabled ? "default" : "pointer",
    fontSize: 13,
    fontWeight: 600,
  };
}

function primaryBtnStyle(disabled) {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: disabled ? "#eee" : "#111",
    color: disabled ? "#999" : "#fff",
    cursor: disabled ? "default" : "pointer",
    fontSize: 13,
    fontWeight: 700,
  };
}
