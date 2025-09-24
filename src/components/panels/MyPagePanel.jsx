// src/components/panels/MyPagePanel.jsx
import React, { useState } from "react";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import StorePage from "../../pages/StorePage";

export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  const [activeTab, setActiveTab] = useState(null);

  const renderContent = () => {
    if (activeTab === "slider") {
      return (
        <div style={{ padding: 20 }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>基準のワイン再設定</h2>
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
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>ID 編集</h2>
          <input
            type="text"
            placeholder="新しいIDを入力"
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </div>
      );
    }
    if (activeTab === "password") {
      return (
        <div style={{ padding: 20 }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>パスワード編集</h2>
          <input
            type="password"
            placeholder="新しいパスワード"
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </div>
      );
    }
    if (activeTab === "nickname") {
      return (
        <div style={{ padding: 20 }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>ニックネーム編集</h2>
          <input
            type="text"
            placeholder="ニックネーム"
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </div>
      );
    }
    if (activeTab === "stores") {
      return <StorePage />;
    }

    // デフォルトメニュー
    return (
      <List>
        <ListItemButton onClick={() => setActiveTab("slider")}>
          <ListItemText primary="基準のワイン『スライダー』再設定" />
        </ListItemButton>
        <Divider />
        <ListItemButton onClick={() => setActiveTab("id")}>
          <ListItemText primary="ID 編集" />
        </ListItemButton>
        <Divider />
        <ListItemButton onClick={() => setActiveTab("password")}>
          <ListItemText primary="パスワード編集" />
        </ListItemButton>
        <Divider />
        <ListItemButton onClick={() => setActiveTab("nickname")}>
          <ListItemText primary="ニックネーム編集" />
        </ListItemButton>
        <Divider />
        <ListItemButton onClick={() => setActiveTab("stores")}>
          <ListItemText primary="お気に入り店舗追加" />
        </ListItemButton>
      </List>
    );
  };

  return (
    <Drawer
      anchor="left"
      open={isOpen}
      onClose={() => {
        setActiveTab(null);
        onClose();
      }}
      PaperProps={{
        style: {
          width: "80vw",
          maxWidth: 400,
          borderRadius: "0 12px 12px 0",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #ccc",
          fontWeight: "bold",
          fontSize: 16,
        }}
      >
        {activeTab ? "設定" : "マイページ"}
      </div>

      {/* メインコンテンツ */}
      <div style={{ flex: 1, overflowY: "auto" }}>{renderContent()}</div>

      {/* フッター（左下に閉じるボタン） */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #ccc",
          display: "flex",
          justifyContent: "flex-start", // 左寄せ
        }}
      >
        <button
          onClick={() => {
            setActiveTab(null);
            onClose();
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "#007aff",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          閉じる
        </button>
      </div>
    </Drawer>
  );
}

