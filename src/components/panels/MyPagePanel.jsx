// src/components/panels/MyPagePanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";

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
  const [primaryStore, setPrimaryStore] = useState(null);
  const [allStores, setAllStores] = useState([]);
  const [favSet, setFavSet] = useState(new Set());

  // 位置情報
  const [geo, setGeo] = useState(null);

  // 初期ロード
  useEffect(() => {
    if (!isOpen) return;

    // 固定店舗
    const sel = readJSON("selectedStore", null);
    setPrimaryStore(sel);

    // 候補店舗
    const fromLS = readJSON("allStores", null);
    setAllStores(Array.isArray(fromLS) ? fromLS : (sel ? [sel] : []));

    // お気に入り
    const favArr = readJSON("favoriteStores", []);
    setFavSet(new Set((favArr || []).map(storeKey)));

    // ユーザー情報
    const savedNickname = localStorage.getItem("user.nickname") || "";
    const savedUserId = localStorage.getItem("user.id") || "";
    setNickname(savedNickname);
    setUserId(savedUserId);
    setPass1(""); // パスワードは空欄に初期化
    setPass2("");

    // 位置情報
    const ask = async () => {
      if (!("geolocation" in navigator)) return;
      try {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords || {};
              setGeo({ lat: latitude, lng: longitude });
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
          );
        });
      } catch {}
    };
    ask();
  }, [isOpen]);

  // 近い順
  const sortedStores = useMemo(() => {
    const list = Array.isArray(allStores) ? allStores.slice() : [];
    if (!geo) return list;
    return list
      .map((s) => ({
        ...s,
        distanceKm:
          Number.isFinite(s.lat) && Number.isFinite(s.lng)
            ? haversineKm(geo.lat, geo.lng, s.lat, s.lng)
            : null,
      }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [allStores, geo]);

  // チェック切替
  const toggleFav = (s) => {
    const k = storeKey(s);
    if (primaryStore && k === storeKey(primaryStore)) return;
    setFavSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        const arr = sortedStores.filter((st) => next.has(storeKey(st)));
        localStorage.setItem("favoriteStores", JSON.stringify(arr));
      } catch {}
      return next;
    });
  };

  // 保存
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
          paddingBottom: "64px",
        },
      }}
    >
      {/* 見出し */}
      <div style={{
        padding: "14px 12px", // ← 左寄せ修正
        borderBottom: "1px solid #e5e5ea",
        fontWeight: 700,
      }}>
        マイページ
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* 基準ワイン */}
        <section style={{ padding: "12px" }}>
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
              textAlign: "left", // 左寄せ
            }}
          >
            スライダーを開く
          </button>
        </section>

        {/* アカウント */}
        <section style={{ padding: "12px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
            アカウント
          </div>
          <div style={{
            background: "#fff",
            border: "1px solid #d1d1d6",
            borderRadius: 12,
            overflow: "hidden",
          }}>
            {/* ニックネーム */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr",
              padding: "12px",
              borderBottom: "1px solid #e5e5ea",
            }}>
              <div>ニックネーム</div>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={{ border: "none", outline: "none" }}
              />
            </div>
            {/* ID */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr",
              padding: "12px",
              borderBottom: "1px solid #e5e5ea",
            }}>
              <div>ID</div>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                style={{ border: "none", outline: "none" }}
              />
            </div>
            {/* パスワード */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr",
              padding: "12px",
              borderBottom: "1px solid #e5e5ea",
            }}>
              <div>Pass変更</div>
              <input
                type="password"
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                style={{ border: "none", outline: "none" }}
              />
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr",
              padding: "12px",
            }}>
              <div>再入力</div>
              <input
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                style={{ border: "none", outline: "none" }}
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

        {/* 店舗 */}
        <section style={{ padding: "12px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
            お気に入り店舗追加（近い順）
          </div>
          <div style={{
            background: "#fff",
            border: "1px solid #d1d1d6",
            borderRadius: 12,
            overflow: "hidden",
          }}>
            {primaryStore && (
              <label style={{ display: "flex", padding: "12px", borderBottom: "1px solid #e5e5ea" }}>
                <input type="checkbox" checked readOnly />
                <div style={{ marginLeft: 8 }}>
                  <div style={{ fontWeight: 600 }}>
                    {primaryStore.name || primaryStore.storeName} {primaryStore.branch || primaryStore.storeBranch}
                  </div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#6e6e73" }}>固定</span>
              </label>
            )}
            {sortedStores
              .filter((s) => !primaryStore || storeKey(s) !== storeKey(primaryStore))
              .map((s, i) => {
                const k = storeKey(s);
                return (
                  <label key={i} style={{ display: "flex", padding: "12px", borderBottom: "1px solid #e5e5ea" }}>
                    <input
                      type="checkbox"
                      checked={favSet.has(k)}
                      onChange={() => toggleFav(s)}
                    />
                    <div style={{ marginLeft: 8 }}>
                      <div style={{ fontWeight: 600 }}>
                        {s.name || s.storeName} {s.branch || s.storeBranch}
                      </div>
                      <div style={{ fontSize: 12, color: "#6e6e73" }}>{fmtKm(s.distanceKm)}</div>
                    </div>
                  </label>
                );
              })}
          </div>
        </section>
      </div>

      {/* 閉じるボタン（左下固定） */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          left: "12px",
          bottom: "max(12px, env(safe-area-inset-bottom))",
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: "#eee",
          border: "1px solid #ccc",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "20px",
          fontWeight: "bold",
        }}
      >
        ×
      </button>
    </Drawer>
  );
}
