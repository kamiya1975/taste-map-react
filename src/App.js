// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

// Pages
import IntroPage from "./pages/IntroPage";
import MapPage from "./pages/MapPage";
import ProductPage from "./pages/ProductPage";
import SliderPage from "./pages/SliderPage";
import StorePage from "./pages/StorePage";
import FavoriteStoresPage from "./pages/FavoriteStoresPage";
import MyAccount from "./pages/MyAccount"; // 新規
import UserTastePage from "./pages/UserTastePage";
import ScanAndProductFlow from "./pages/ScanAndProductFlow";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ランディング */}
        <Route path="/" element={<IntroPage />} />

        {/* 固定店舗の設定（Introフロー） */}
        <Route path="/store" element={<StorePage />} />

        {/* 基準ワインの嗜好スライダー */}
        <Route path="/slider" element={<SliderPage />} />

        {/* 地図ページ（検索/お気に入り/スキャン） */}
        <Route path="/map" element={<MapPage />} />

        {/* 商品詳細（埋め込み用） */}
        <Route path="/products/:jan" element={<ProductPage />} />

        {/* ユーザー評価ログ */}
        <Route path="/taste-log" element={<UserTastePage />} />

        {/* スキャン＆商品フロー */}
        <Route path="/scan-flow" element={<ScanAndProductFlow />} />

        {/* マイアカウント */}
        <Route path="/my-account" element={<MyAccount />} />

        {/* お気に入り店舗追加（アプリガイド経由） */}
        <Route path="/stores-fav" element={<FavoriteStoresPage />} />

        {/* それ以外は地図へリダイレクト */}
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
