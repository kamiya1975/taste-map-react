// src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

// MSW (開発時のみ)
if (process.env.NODE_ENV === "development") {
  import("./mocks/browser")
    .then(({ worker }) =>
      worker.start({ onUnhandledRequest: "bypass" })
    )
    .catch(() => {/* dev用なので失敗は無視 */});
}
