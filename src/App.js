// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

// Pages
import MapPage from "./pages/MapPage";
import ProductPage from "./pages/ProductPage";
import SliderPage from "./pages/SliderPage";
import StorePage from "./pages/StorePage";
import IntroPage from "./pages/IntroPage";
import UserTastePage from "./pages/UserTastePage";
import ScanAndProductFlow from "./pages/ScanAndProductFlow";

// src/App.jsx（抜粋）
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MapPage from "./pages/MapPage";
import SliderPage from "./pages/SliderPage";
import StorePage from "./pages/StorePage";
import MyAccount from "./pages/MyAccount"; // ← 新規

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/slider" element={<SliderPage />} />
        <Route path="/stores" element={<StorePage />} />
        <Route path="/my-account" element={<MyAccount />} />
        {/* 他のルート… */}
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <Routes>
      {/* ランディング */}
      <Route path="/" element={<IntroPage />} />

      {/* 店舗選択 */}
      <Route path="/store" element={<StorePage />} />

      {/* 嗜好スライダー（別ページ） */}
      <Route path="/slider" element={<SliderPage />} />

      {/* 地図ページ（検索/お気に入り/スキャン） */}
      <Route path="/map" element={<MapPage />} />

      {/* 商品詳細（埋め込み用） */}
      <Route path="/products/:jan" element={<ProductPage />} />

      {/* ユーザー評価ログ */}
      <Route path="/taste-log" element={<UserTastePage />} />

      {/* スキャン＆商品フロー（使う場合のみ） */}
      <Route path="/scan-flow" element={<ScanAndProductFlow />} />

      {/* それ以外は地図へリダイレクト */}
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  );
}

// src/App.jsx（またはルート定義ファイル）
import FavoriteStoresPage from "./pages/FavoriteStoresPage";
// 既存
// import StorePage from "./pages/StorePage";

<Routes>
  {/* 既存 */}
  <Route path="/store" element={<StorePage />} />          {/* 固定店舗の設定（Introフロー） */}
  <Route path="/stores-fav" element={<FavoriteStoresPage />} /> {/* アプリガイド → お気に入り追加 */}
  {/* …他のルート */}
</Routes>
