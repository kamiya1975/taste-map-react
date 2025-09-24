// src/components/MyPagePanel.jsx
import React, { useState } from "react";
import Drawer from "@mui/material/Drawer";
import StorePage from "../../pages/StorePage";

export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  const [activeTab, setActiveTab] = useState(null);

  const renderContent = () => {
    if (activeTab === "slider") {
      return (
        <div style={{ padding: 20 }}>
          <h2>基準のワイン再設定</h2>
          <button
            onClick={() => {
              onOpenSlider();
              onClose();
            }}
            style={{
              marginTop: 12,
              padding: "10px 16px",
              background: "#007bff",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            スライダーを開く
          </button>
        </div>
      );
    }
    if (activeTab === "id") {
      return (
        <div style={{ padding: 20 }}>
          <h2>ID 編集</h2>
          <input type="text" placeholder="新しいIDを入力" style={{ width: "100%", padding: 8, marginTop: 12 }} />
        </div>
      );
    }
    if (activeTab === "password") {
      return (
        <div style={{ padding: 20 }}>
          <h2>パスワード編集</h2>
          <input type="password" placeholder="新しいパスワード" style={{ width: "100%", padding: 8, marginTop: 12 }} />
        </div>
      );
    }
    if (activeTab === "nickname") {
      return (
        <div style={{ padding: 20 }}>
          <h2>ニックネーム編集</h2>
          <input type="text" placeholder="ニックネーム" style={{ width: "100%", padding: 8, marginTop: 12 }} />
        </div>
      );
    }
    if (activeTab === "stores") {
      return <StorePage />; // ← 既存のページを埋め込み
    }

    // デフォルトメニュー
    return (
      <div style={{ padding: 20 }}>
        <h2>設定メニュー</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          <li>
            <button onClick={() => setActiveTab("slider")}>基準のワイン「スライダー」再設定</button>
          </li>
          <li>
            <button onClick={() => setActiveTab("id")}>ID 編集</button>
          </li>
          <li>
            <button onClick={() => setActiveTab("password")}>パスワード編集</button>
          </li>
          <li>
            <button onClick={() => setActiveTab("nickname")}>ニックネーム編集</button>
          </li>
          <li>
            <button onClick={() => setActiveTab("stores")}>お気に入り店舗追加</button>
          </li>
        </ul>
      </div>
    );
  };

  return (
    <Drawer
      anchor="bottom"
      open={isOpen}
      onClose={() => {
        setActiveTab(null);
        onClose();
      }}
      PaperProps={{
        style: {
          height: "100vh", // 全画面
          borderRadius: "12px 12px 0 0",
          overflow: "hidden",
        },
      }}
    >
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #ccc",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: "bold" }}>
            {activeTab ? "設定" : "マイページ"}
          </span>
          <button
            onClick={() => {
              setActiveTab(null);
              onClose();
            }}
            style={{
              background: "#eee",
              border: "1px solid #ccc",
              padding: "6px 10px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>{renderContent()}</div>
      </div>
    </Drawer>
  );
}
