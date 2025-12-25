// src/components/HeartButton.jsx
// 現在使っていない（必要ない）
import React, { useEffect, useState } from "react";

export default function HeartButton({ jan, size = 24 }) {
  const [fav, setFav] = useState(false);

  // 親からの同期（STATE_SNAPSHOT / SET_WISHLIST）
  useEffect(() => {
    const onMsg = (e) => {
      const msg = e?.data || {};
      if (!msg?.type) return;

      // 親が送るスナップショット
      if (msg.type === "STATE_SNAPSHOT" && String(msg.jan) === String(jan)) {
        setFav(!!(msg.wished ?? msg.favorite));
      }

      // 親が「このJANは wished=true/false になった」を明示する場合
      if (msg.type === "SET_WISHLIST" && String(msg.jan) === String(jan)) {
        setFav(!!msg.value);
      }
    };

    window.addEventListener("message", onMsg);

    // 立ち上がりに状態要求
    window.parent?.postMessage({ type: "REQUEST_STATE", jan }, "*");

    return () => window.removeEventListener("message", onMsg);
  }, [jan]);

  const toggle = () => {
    // 親に「切替して」と依頼するだけ（DB/API 正）
    window.parent?.postMessage(
      { type: "REQUEST_TOGGLE_WISHLIST", jan, value: !fav },
      "*"
    );
  };

  return (
    <button
      aria-label={fav ? "お気に入り解除" : "お気に入りに追加"}
      onClick={toggle}
      style={{
        border: "1px solid #ddd",
        borderRadius: 999,
        background: "#fff",
        width: size + 16,
        height: size + 16,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: size,
        lineHeight: 1,
      }}
    >
      {fav ? "♥" : "♡"}
    </button>
  );
}
