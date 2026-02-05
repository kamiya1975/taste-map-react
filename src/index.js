// src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// ----- root 要素の用意（なければ作成） -----
const container =
  document.getElementById("root") ||
  (() => {
    const el = document.createElement("div");
    el.id = "root";
    document.body.appendChild(el);
    return el;
  })();

const root = createRoot(container);

// ----- アプリ起動（HashRouter で全体をラップ） -----
root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

// ----- MSW（開発時のみ起動、失敗は握りつぶす） -----
if (process.env.NODE_ENV === "development") {
  import("./mocks/browser")
    .then(({ worker }) => worker.start({ onUnhandledRequest: "bypass" }))
    .catch(() => {
      /* dev 用なので失敗は無視 */
    });
}

// =========================
//  PWA Service Worker（SW） 登録
// =========================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((err) => console.log("SW registration failed:", err));
  });
}

// 更新ボタン用
// - SWが切り替わった瞬間に1回だけ再読込（デプロイ反映）
// - 無限ループ防止
if ("serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
