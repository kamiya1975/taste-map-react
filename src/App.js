// src/App.js
import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { bootstrapIdentity } from "./utils/auth";

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

  // スタンドアロン起動の初回だけ /map へ寄せる
  useEffect(() => {
    // ★ まずIDを復元（Safari→ホーム起動でも引き継ぐ）
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
    <Routes>
      {/* ランディング（通常ブラウザ） */}
      <Route path="/" element={<IntroPage />} />

      {/* 固定店舗の設定（Introフロー） */}
      <Route path="/store" element={<StorePage />} />

      {/* 基準ワインの嗜好スライダー */}
      <Route path="/slider" element={<SliderPage />} />

      {/* 地図ページ */}
      <Route path="/map" element={<MapPage />} />

      {/* 商品詳細（埋め込み用） */}
      <Route path="/products/:jan" element={<ProductPage />} />

      {/* ユーザー評価ログ */}
      <Route path="/taste-log" element={<UserTastePage />} />

      {/* スキャン＆商品フロー */}
      <Route path="/scan-flow" element={<ScanAndProductFlow />} />

      {/* それ以外は地図へ */}
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  );
}
