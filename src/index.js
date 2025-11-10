// src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// 互換シム（SimpleCartベース）
import { CartProvider } from "./components/panels/CartContextShim";

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

// ----- アプリ起動（HashRouter + CartProvider で全体をラップ） -----
root.render(
  <React.StrictMode>
    <HashRouter>
      <CartProvider>
        <App />
      </CartProvider>
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
