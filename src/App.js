// src/App.js
import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { bootstrapIdentity } from "./utils/auth";

// CartContext をインポート
import { CartProvider } from "./components/panels/CartContext";

// Pages
import IntroPage from "./pages/IntroPage";
import MapPage from "./pages/MapPage";
import ProductPage from "./pages/ProductPage";
import SliderPage from "./pages/SliderPage";
import StorePage from "./pages/StorePage";
import UserTastePage from "./pages/UserTastePage";
import ScanAndProductFlow from "./pages/ScanAndProductFlow";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    bootstrapIdentity();

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true; // iOS

    const navType = performance.getEntriesByType?.("navigation")?.[0]?.type;
    const isColdStart =
      !sessionStorage.getItem("tm_started_once") &&
      (navType === "navigate" || navType === "reload" || !navType);

    if (isStandalone && isColdStart && location.pathname !== "/map") {
      navigate("/map", { replace: true });
    }
    sessionStorage.setItem("tm_started_once", "1");
  }, [navigate, location.pathname]);

  return (
    // 👇 ここで全体を CartProvider でラップ
    <CartProvider>
      <Routes>
        <Route path="/" element={<IntroPage />} />
        <Route path="/store" element={<StorePage />} />
        <Route path="/slider" element={<SliderPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/products/:jan" element={<ProductPage />} />
        <Route path="/taste-log" element={<UserTastePage />} />
        <Route path="/scan-flow" element={<ScanAndProductFlow />} />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </CartProvider>
  );
}

