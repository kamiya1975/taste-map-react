// src/components/MyPagePanel.jsx
import React from "react";
import Drawer from "@mui/material/Drawer";
import { motion, AnimatePresence } from "framer-motion";

const TABS = [
  { key: "general", label: "一般 / General" },
  { key: "mapui", label: "表示・操作 / Map & UI" },
  { key: "rating", label: "評価 / Ratings" },
  { key: "data", label: "データ / Data" },
  { key: "account", label: "アカウント / Account" },
];

const sectionStyle = {
  padding: "16px 20px",
  borderBottom: "1px solid #eee",
};

const field = {
  label: { display: "block", fontSize: 12, color: "#555", marginBottom: 6 },
  input: {
    width: "100%",
    height: 36,
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: "0 10px",
    outline: "none",
  },
  row: { display: "flex", gap: 12 },
};

function SaveBar({ onSave, onClose, isDirty }) {
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        display: "flex",
        gap: 12,
        justifyContent: "flex-end",
        alignItems: "center",
        padding: 12,
        backdropFilter: "blur(8px)",
        borderTop: "1px solid #eee",
        background: "rgba(255,255,255,0.9)",
      }}
    >
      <span style={{ fontSize: 12, color: isDirty ? "#b5763a" : "#888" }}>
        {isDirty ? "未保存の変更があります" : "すべて保存済み"}
      </span>
      <button
        onClick={onClose}
        style={{
          height: 36,
          padding: "0 14px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        閉じる
      </button>
      <button
        onClick={onSave}
        style={{
          height: 36,
          padding: "0 18px",
          borderRadius: 10,
          border: "none",
          background: "#b59678",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        }}
      >
        保存
      </button>
    </div>
  );
}

export default function MyPageDrawer({ open, onClose }) {
  const [active, setActive] = React.useState("general");
  const [dirty, setDirty] = React.useState(false);

  // 設定値（暫定：localStorage）
  const [settings, setSettings] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("tm_settings") || "{}");
    } catch {
      return {};
    }
  });

  const patch = (obj) => {
    setSettings((prev) => {
      const next = { ...prev, ...obj };
      setDirty(true);
      return next;
    });
  };

  const handleSave = () => {
    localStorage.setItem("tm_settings", JSON.stringify(settings));
    setDirty(false);
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        onClose?.();
      }
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const TabButton = ({ tab }) => (
    <button
      onClick={() => setActive(tab.key)}
      style={{
        height: 36,
        padding: "0 12px",
        borderRadius: 10,
        border: "1px solid " + (active === tab.key ? "#b59678" : "#eee"),
        background: active === tab.key ? "#f6efe8" : "#fff",
        color: active === tab.key ? "#634b33" : "#333",
        cursor: "pointer",
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {tab.label}
    </button>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 420 },
          borderTopLeftRadius: { xs: 0, sm: "16px" },
          borderBottomLeftRadius: { xs: 0, sm: "16px" },
          overflow: "hidden",
        },
      }}
      ModalProps={{ keepMounted: true }}
    >
      {/* ヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          borderBottom: "1px solid #eee",
          background: "#fff",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            background: "#b59678",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          M
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>MyPage</div>
          <div style={{ fontSize: 12, color: "#666" }}>設定 / Settings</div>
        </div>
        <button
          onClick={onClose}
          title="閉じる (Esc)"
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: "1px solid #eee",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {/* タブバー */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          padding: "10px 12px",
          borderBottom: "1px solid #eee",
          background: "#faf9f7",
        }}
      >
        {TABS.map((t) => (
          <TabButton tab={t} key={t.key} />
        ))}
      </div>

      {/* コンテンツ */}
      <div style={{ height: "100%", overflow: "auto", paddingBottom: 64 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            {active === "general" && (
              <div>
                <div style={sectionStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    基本情報 / Profile
                  </div>
                  <div style={field.row}>
                    <div style={{ flex: 1 }}>
                      <label style={field.label}>ニックネーム</label>
                      <input
                        style={field.input}
                        value={settings.nickname || ""}
                        onChange={(e) => patch({ nickname: e.target.value })}
                        placeholder="例: kamiya"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={field.label}>表示言語 / Language</label>
                      <select
                        style={field.input}
                        value={settings.lang || "ja"}
                        onChange={(e) => patch({ lang: e.target.value })}
                      >
                        <option value="ja">日本語</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div style={sectionStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    既定のページ
                  </div>
                  <label style={{ ...field.label, marginBottom: 8 }}>
                    アプリ起動時に開くページ
                  </label>
                  <select
                    style={field.input}
                    value={settings.defaultPage || "map"}
                    onChange={(e) => patch({ defaultPage: e.target.value })}
                  >
                    <option value="map">マップ（MapPage）</option>
                    <option value="slider">好み入力（SliderPage）</option>
                    <option value="favorites">飲みたい（♡）</option>
                    <option value="rated">飲んだ（◎）</option>
                  </select>
                </div>
              </div>
            )}

            {active === "mapui" && (
              <div>
                <div style={sectionStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    マップ表示
                  </div>
                  <div style={field.row}>
                    <div style={{ flex: 1 }}>
                      <label style={field.label}>コンパスの大きさ</label>
                      <input
                        type="range"
                        min={12}
                        max={64}
                        value={settings.compassSize || 28}
                        onChange={(e) =>
                          patch({ compassSize: Number(e.target.value) })
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div style={{ width: 90 }}>
                      <input
                        readOnly
                        value={(settings.compassSize || 28) + "px"}
                        style={{
                          ...field.input,
                          textAlign: "center",
                          background: "#f8f8f8",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ height: 10 }} />
                  <label style={field.label}>ヒット時のズーム量</label>
                  <input
                    type="range"
                    min={0.5}
                    max={3.0}
                    step={0.1}
                    value={settings.hitZoom || 1.6}
                    onChange={(e) => patch({ hitZoom: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={sectionStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    UI 補助
                  </div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!settings.showHints}
                      onChange={(e) => patch({ showHints: e.target.checked })}
                    />
                    ヒント（ガイド）を表示
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!settings.reduceMotion}
                      onChange={(e) => patch({ reduceMotion: e.target.checked })}
                    />
                    アニメーションを減らす（省電力）
                  </label>
                </div>
              </div>
            )}

            {active === "rating" && (
              <div>
                <div style={sectionStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    評価設定
                  </div>
                  <label style={{ ...field.label, marginBottom: 8 }}>
                    デフォルトの並び順（◎）
                  </label>
                  <select
                    style={field.input}
                    value={settings.defaultRatedSort || "date"}
                    onChange={(e) => patch({ defaultRatedSort: e.target.value })}
                  >
                    <option value="date">評価日（新しい→古い）</option>
                    <option value="score">評価の高い順</option>
                    <option value="name">商品名 A→Z</option>
                  </select>
                </div>
                <div style={sectionStyle}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!settings.autoUnfavoriteOnRate}
                      onChange={(e) =>
                        patch({ autoUnfavoriteOnRate: e.target.checked })
                      }
                    />
                    「♡」から評価したら自動で「♡」を外す
                  </label>
                </div>
              </div>
            )}

            {active === "data" && (
              <div>
                <div style={sectionStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>データ</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={{
                        ...field.input,
                        height: 36,
                        borderRadius: 10,
                        cursor: "pointer",
                        border: "1px solid #ddd",
                        background: "#fff",
                      }}
                      onClick={() => {
                        const blob = new Blob(
                          [localStorage.getItem("userRatings") || "{}"],
                          { type: "application/json" }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "userRatings.json";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      「◎」エクスポート
                    </button>
                    <button
                      style={{
                        ...field.input,
                        height: 36,
                        borderRadius: 10,
                        cursor: "pointer",
                        border: "1px solid #ddd",
                        background: "#fff",
                      }}
                      onClick={() => {
                        localStorage.removeItem("tm_settings");
                        setSettings({});
                        setDirty(false);
                      }}
                    >
                      設定をリセット
                    </button>
                  </div>
                </div>
              </div>
            )}

            {active === "account" && (
              <div>
                <div style={sectionStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    アカウント
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    ログイン連携や通知は後でAPIに接続します。
                  </div>
                  <div style={{ height: 12 }} />
                  <label style={field.label}>メール通知</label>
                  <select
                    style={field.input}
                    value={settings.mailNotify || "off"}
                    onChange={(e) => patch({ mailNotify: e.target.value })}
                  >
                    <option value="off">オフ</option>
                    <option value="weekly">週1回サマリー</option>
                    <option value="daily">毎日サマリー</option>
                  </select>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 保存バー */}
      <SaveBar onSave={handleSave} onClose={onClose} isDirty={dirty} />
    </Drawer>
  );
}
