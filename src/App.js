import React from "react";
// src/App.js
import React, { useEffect } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";

import IntroPage from "./IntroPage";
import StorePage from "./StorePage";
import SliderPage from "./SliderPage";
import MapPage from "./MapPage";
import ProductPage from "./ProductPage";
import UserTastePage from "./UserTastePage";

/**
 * ルート変更のたびにスクロールを先頭へ戻す（Drawer等のUIと干渉しない軽量版）
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [pathname]);
  return null;
}

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<IntroPage />} />
        <Route path="/store" element={<StorePage />} />
        <Route path="/slider" element={<SliderPage />} />
        <Route path="/map" element={<MapPage />} />
        {/* 商品ページ（/products/:jan） */}
        <Route path="/products/:jan" element={<ProductPage />} />
        {/* テイスログ */}
        <Route path="/taste-log" element={<UserTastePage />} />
        {/* 既存ブックマークの救済やタイプミスを /map に退避 */}
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </>
  );
}

export default App;
