// src/components/HeartButton.jsx
import React, { useEffect, useState } from "react";

export default function HeartButton({ jan, size = 24 }) {
  const [fav, setFav] = useState(false);

  // 初期読み込み & storage同期
  useEffect(() => {
    const readFav = () => {
      try {
        const obj = JSON.parse(localStorage.getItem("favorites") || "{}");
        setFav(!!obj[jan]);
      } catch {
        setFav(false);
      }
    };
    readFav();
    const onStorage = (e) => {
      if (e.key === "favorites") readFav();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [jan]);

  const toggle = () => {
    // 1) localStorage 更新（※iframe側で更新 → 親にも storage イベントが飛びます）
    const favs = JSON.parse(localStorage.getItem("favorites") || "{}");
    if (favs[jan]) {
      delete favs[jan];
    } else {
      favs[jan] = { addedAt: new Date().toISOString() };
    }
    localStorage.setItem("favorites", JSON.stringify(favs));
    setFav(!!favs[jan]);

    // 2) 念のため postMessage でも親へ通知（親は受け口を実装済み）
    window.parent?.postMessage({ type: "TOGGLE_FAVORITE", jan }, "*");
  };

  // シンプルなテキストハート（必要ならMUIアイコン等に差し替えOK）
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
