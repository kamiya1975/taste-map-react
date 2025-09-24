// src/components/panels/MyPagePanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";

/**
 * 仕様メモ
 * - 左からスライド。iOS設定風の区切りと余白。
 * - 左下に「×」丸ボタン（MapPageの〓と同じ位置＆サイズ＆スタイル）。
 * - 初回に選んだ店舗（localStorage.selectedStore）を一番上に固定で表示（解除不可）。
 * - それ以外の店舗はチェックON/OFF可能。localStorage.favoriteStores に保存。
 * - ストア一覧は localStorage.allStores（StorePage 側で保存する想定）を優先利用。
 *   無ければ primaryStore のみ表示。位置情報を取得して近い順に並べ替え。
 */

const BTN_CIRCLE = {
  position: "absolute",
  left: "12px",
  bottom: "max(12px, env(safe-area-inset-bottom))",
  top: "auto",
  right: "auto",
  zIndex: 10,
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  background: "#eee",
  border: "1px solid #ccc",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
  fontSize: "20px",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function readJSON(key, fallback = null) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

function storeKey(s) {
  return `${s.name || s.storeName || ""}@@${s.branch || s.storeBranch || ""}`;
}

export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  // プロフィール項目
  const [nickname, setNickname] = useState("");
  const [userId, setUserId] = useState("");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");

  // 店舗
  const [primaryStore, setPrimaryStore] = useState(null); // 固定
  const [allStores, setAllStores] = useState([]);         // 候補
  const [favSet, setFavSet] = useState(new Set());        // 追加店舗

  // 位置情報
  const [geo, setGeo] = useState(null);

  // 初期ロード
  useEffect(() => {
    if (!isOpen) return;

    // 初回選択の固定店舗（解除不可）
    const sel = readJSON("selectedStore", null);
    setPrimaryStore(sel);

    // 候補店舗（StorePage 側で保存しておくと良い）
    const fromLS = readJSON("allStores", null);
    setAllStores(Array.isArray(fromLS) ? fromLS : (sel ? [sel] : []));

    // お気に入り（追加）セット
    const favArr = readJSON("favoriteStores", []);
    setFavSet(new Set((favArr || []).map(storeKey)));

    // ユーザー情報（任意：保存している場合は復元）
    const savedNickname = localStorage.getItem("user.nickname") || "";
    const savedUserId = localStorage.getItem("user.id") || "";
    setNickname(savedNickname);
    setUserId(savedUserId);

    // 位置情報を取得して近い順へ
    const ask = async () => {
      if (!("geolocation" in navigator)) return;
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords || {};
              setGeo({ lat: latitude, lng: longitude });
              resolve();
            },
            (err) => {
              console.warn("Geolocation denied:", err);
              resolve(); // 失敗でも続行（距離なし）
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
          );
        });
      } catch {}
    };
    ask();
  }, [isOpen]);

  // 近い順に並び替え
  const sortedStores = useMemo(() => {
    const list = Array.isArray(allStores) ? allStores.slice() : [];
    if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) {
      return list;
    }
    return list
      .map((s) => ({
        ...s,
        distanceKm:
          Number.isFinite(s.lat) && Number.isFinite(s.lng)
            ? haversineKm(geo.lat, geo.lng, s.lat, s.lng)
            : null,
      }))
      .sort((a, b) => {
        const da = a.distanceKm ?? Infinity;
        const db = b.distanceKm ?? Infinity;
        return da - db;
      });
  }, [allStores, geo]);

  // チェック変更
  const toggleFav = (s) => {
    const k = storeKey(s);
    // primary は外せない
    if (primaryStore && k === storeKey(primaryStore)) return;
    setFavSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      // 保存
      try {
        const arr = sortedStores.filter((st) => next.has(storeKey(st)));
        localStorage.setItem("favoriteStores", JSON.stringify(arr));
      } catch {}
      return next;
    });
  };

  // 保存（例：ニックネーム・ID・パスワード）
  const saveProfile = () => {
    if (pass1 && pass1 !== pass2) {
      alert("パスワードが一致しません。");
      return;
    }
    try {
      localStorage.setItem("user.nickname", nickname || "");
      localStorage.setItem("user.id", userId || "");
      if (pass1) localStorage.setItem("user.pass.hashless-demo", pass1);
      alert("保存しました。");
    } catch {
      alert("保存に失敗しました。");
    }
  };

  // 表示ユーティリティ
  const fmtKm = (d) =>
    Number.isFinite(d) ? `（${d.toFixed(1)}km）` : "";

  return (
    <Drawer
      anchor="left"
      open={isOpen}
      onClose={onClose}
      PaperProps={{
        style: {
          width: "86vw",
          maxWidth: 480,
          borderRadius: "0 12px 12px 0",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          // 下の×が見切れないよう余白
          paddingBottom: "64px",
        },
      }}
    >
      {/* 見出し */}
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid #e5e5ea",
        fontWeight: 700,
      }}>
        マイページ
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* セクション：基準のワイン */}
        <section style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
            基準のワイン
          </div>
          <button
            onClick={() => { onClose?.(); onOpenSlider?.(); }}
            style={{
              width: "100%",
              padding: "12px",
              background: "#fff",
              border: "1px solid #d1d1d6",
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            スライダーを開く
          </button>
        </section>

        {/* セクション：プロフィール */}
        <section style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
            アカウント
          </div>

          {/* iOS設定風の行ボックス */}
          <div style={{
            background: "#fff",
            border: "1px solid #d1d1d6",
            borderRadius: 12,
            overflow: "hidden",
          }}>
            {/* ニックネーム */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 8,
              padding: "12px 14px",
              borderBottom: "1px solid #e5e5ea",
              alignItems: "center",
            }}>
              <div style={{ color: "#1c1c1e" }}>ニックネーム</div>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="-"
                style={{
                  border: "none",
                  outline: "none",
                  fontSize: 16,
                  padding: "6px 8px",
                  background: "transparent",
                }}
              />
            </div>

            {/* ID */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 8,
              padding: "12px 14px",
              borderBottom: "1px solid #e5e5ea",
              alignItems: "center",
            }}>
              <div style={{ color: "#1c1c1e" }}>ID</div>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="t-kamiya@clt.co.jp"
                style={{
                  border: "none",
                  outline: "none",
                  fontSize: 16,
                  padding: "6px 8px",
                  background: "transparent",
                }}
              />
            </div>

            {/* パスワード（変更/再入力） */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 8,
              padding: "12px 14px",
              borderBottom: "1px solid #e5e5ea",
              alignItems: "center",
            }}>
              <div style={{ color: "#1c1c1e" }}>Pass変更</div>
              <input
                type="password"
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                placeholder="●●●●●●●●●●●"
                style={{
                  border: "none",
                  outline: "none",
                  fontSize: 16,
                  padding: "6px 8px",
                  background: "transparent",
                }}
              />
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 8,
              padding: "12px 14px",
              alignItems: "center",
            }}>
              <div style={{ color: "#1c1c1e" }}>再入力</div>
              <input
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                placeholder="●●●●●●●●●●●"
                style={{
                  border: "none",
                  outline: "none",
                  fontSize: 16,
                  padding: "6px 8px",
                  background: "transparent",
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 12, textAlign: "right" }}>
            <button
              onClick={saveProfile}
              style={{
                padding: "10px 16px",
                background: "#007aff",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              保存
            </button>
          </div>
        </section>

        {/* セクション：お気に入り店舗追加（近い順） */}
        <section style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
            お気に入り店舗追加（近い順）
          </div>

          {/* 店舗ボックス */}
          <div style={{
            background: "#fff",
            border: "1px solid #d1d1d6",
            borderRadius: 12,
            overflow: "hidden",
          }}>
            {/* 最上段：固定（チェック解除不可） */}
            {primaryStore && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderBottom: "1px solid #e5e5ea",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input type="checkbox" checked readOnly />
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {primaryStore.name || primaryStore.storeName} {primaryStore.branch || primaryStore.storeBranch}
                    </div>
                    <div style={{ fontSize: 12, color: "#6e6e73" }}>
                      {Number.isFinite(primaryStore.distanceKm) ? fmtKm(primaryStore.distanceKm) : ""}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "#6e6e73" }}>固定</span>
              </label>
            )}

            {/* その他：ON/OFF可（近い順） */}
            {sortedStores
              .filter((s) => !primaryStore || storeKey(s) !== storeKey(primaryStore))
              .map((s, i) => {
                const k = storeKey(s);
                const checked = favSet.has(k);
                return (
                  <label
                    key={`${k}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      borderBottom: "1px solid #e5e5ea",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFav(s)}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {s.name || s.storeName} {s.branch || s.storeBranch}
                        </div>
                        <div style={{ fontSize: 12, color: "#6e6e73" }}>
                          {fmtKm(s.distanceKm)}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
          </div>
        </section>
      </div>

      {/* 左下：×（MapPageの〓と同じ位置・スタイル） */}
      <button
        onClick={onClose}
        aria-label="閉じる"
        title="閉じる"
        style={BTN_CIRCLE}
      >
        ×
      </button>
    </Drawer>
  );
}
