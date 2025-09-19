// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import IntroPage from "./IntroPage";
import StorePage from "./StorePage";
import SliderPage from "./SliderPage";
import MapPage from "./MapPage";
import ProductPage from "./ProductPage";
import UserTastePage from "./UserTastePage";

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

      {/* それ以外は地図へリダイレクト */}
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  );
}
