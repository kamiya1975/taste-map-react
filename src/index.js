// src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// MSW (開発時のみ). トップレベルawaitは使わない
if (process.env.NODE_ENV === "development") {
  import("./mocks/browser")
    .then(({ worker }) =>
      worker.start({ onUnhandledRequest: "bypass" })
    )
    .catch(() => {
      /* dev用なので失敗は無視 */
    });
}
