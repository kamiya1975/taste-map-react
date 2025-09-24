// src/components/panels/MyPagePanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";

// ========================
// 定数・ユーティリティ
// ========================
const DIST_CAP_KM = 35; // 35km 以内の店舗を表示

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
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

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function storeKey(s) {
  return `${s.name || s.storeName || ""}@@${s.branch || s.storeBranch || ""}`;
}

// ========================
// メインコンポーネント
// ========================
export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  // プロフィール項目
  const [nickname, setNickname] = useState("");
  const [userId, setUserId] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [gender, setGender] = useState("");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");

  // 店舗
  const [primaryStore, setPrimaryStore] = useState(null); // 固定
  const [allStores, setAllStores] = useState([]); // 候補
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
    setAllStores(Array.isArray(fromLS) ? fromLS : sel ? [sel] : []);

    // お気に入り
    const favArr = readJSON("favoriteStores", []);
    setFavSet(new Set((favArr || []).map(storeKey)));

    // ユーザー情報
    setNickname(localStorage.getItem("user.nickname") || "");
    setUserId(localStorage.getItem("user.id") || "");
    setBirthYear(localStorage.getItem("user.birthYear") || "1990");
    setBirthMonth(localStorage.getItem("user.birthMonth") || "01");
    setGender(localStorage.getItem("user.gender") || "男性");

    // 位置情報
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const { latitude, longitude } = coords;
          setGeo({ lat: latitude, lng: longitude });
        },
        (err) => console.warn("Geolocation denied:", err),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, [isOpen]);

  // 全店舗を距離つきに変換しソート
  const sortedStores = useMemo(() => {
    if (!geo) return allStores;
    return allStores
      .map((s) => ({
        ...s,
        distanceKm:
          Number.isFinite(s.lat) && Number.isFinite(s.lng)
            ? haversineKm(geo.lat, geo.lng, s.lat, s.lng)
            : null,
      }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [allStores, geo]);

  // 表示対象（35km 以内＋固定店舗）
  const visibleStores = useMemo(() => {
    if (!geo) return sortedStores;
    const primaryK = primaryStore ? storeKey(primaryStore) : null;
    return sortedStores.filter((s) => {
      if (primaryK && storeKey(s) === primaryK) return true;
      if (!Number.isFinite(s.distanceKm)) return false;
      return s.distanceKm <= DIST_CAP_KM;
    });
  }, [sortedStores, primaryStore, geo]);

  // チェック変更
  const toggleFav = (s) => {
    const k = storeKey(s);
    if (primaryStore && k === storeKey(primaryStore)) return; // 固定は外せない
    setFavSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      const arr = (allStores || []).filter((st) => next.has(storeKey(st)));
      writeJSON("favoriteStores", arr);
      return next;
    });
  };

  // プロフィール保存
  const saveProfile = () => {
    if (pass1 && pass1 !== pass2) {
      alert("パスワードが一致しません。");
      return;
    }
    try {
      localStorage.setItem("user.nickname", nickname || "");
      localStorage.setItem("user.id", userId || "");
      localStorage.setItem("user.birthYear", birthYear || "");
      localStorage.setItem("user.birthMonth", birthMonth || "");
      localStorage.setItem("user.gender", gender || "");
      if (pass1) localStorage.setItem("user.pass", pass1);
      alert("保存しました。");
    } catch {
      alert("保存に失敗しました。");
    }
  };

  const fmtKm = (d) => (Number.isFinite(d) ? `（${d.toFixed(1)}km）` : "");

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
          paddingBottom: "64px", // ×が見切れないよう余白
        },
      }}
    >
      {/* 見出し */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #e5e5ea",
          fontWeight: 700,
        }}
      >
        マイページ
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* 基準のワイン */}
        <section style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
            基準のワイン
          </div>
          <button
            onClick={() => {
              onClose?.();
              onOpenSlider?.();
            }}
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

        {/* アカウント情報 */}
        <section style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
            アカウント
          </div>
          <div
            style={{
              background: "#fff",
              border: "1px solid #d1d1d6",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* ニックネーム */}
            <RowInput label="ニックネーム" value={nickname} onChange={setNickname} />
            {/* ID */}
            <RowInput label="ID" value={userId} onChange={setUserId} />
            {/* 生まれ年 */}
            <RowInput label="生まれ年" value={birthYear} onChange={setBirthYear} />
            {/* 生まれ月 */}
            <RowInput label="生まれ月" value={birthMonth} onChange={setBirthMonth} />
            {/* 性別 */}
            <RowInput label="性別" value={gender} onChange={setGender} />
            {/* パスワード */}
            <RowInput
              label="Pass変更"
              type="password"
              value={pass1}
              onChange={setPass1}
            />
            <RowInput
              label="再入力"
              type="password"
              value={pass2}
              onChange={setPass2}
            />
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

        {/* お気に入り店舗 */}
        <section style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
            お気に入り店舗追加（35km以内）
          </div>
          <div
            style={{
              background: "#fff",
              border: "1px solid #d1d1d6",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* 固定店舗 */}
            {primaryStore && (
              <StoreRow
                labelLeft={
                  <>
                    <input type="checkbox" checked readOnly />
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {primaryStore.name || primaryStore.storeName}{" "}
                        {primaryStore.branch || primaryStore.storeBranch}
                      </div>
                      <div style={{ fontSize: 12, color: "#6e6e73" }}>
                        {fmtKm(primaryStore.distanceKm)}
                      </div>
                    </div>
                  </>
                }
                labelRight={<span style={{ fontSize: 12, color: "#6e6e73" }}>固定</span>}
              />
            )}
            {/* 近い順 */}
            {visibleStores
              .filter((s) => !primaryStore || storeKey(s) !== storeKey(primaryStore))}
              .map((s, i) => {
                const k = storeKey(s);
                const checked = favSet.has(k);
                return (
                  <StoreRow
                    key={`${k}-${i}`}
                    labelLeft={
                      <>
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
                      </>
                    }
                  />
                );
              })}
          </div>
        </section>
      </div>

      {/* 閉じるボタン */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          left: "12px",
          bottom: "max(12px, env(safe-area-inset-bottom))",
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
        }}
        aria-label="閉じる"
      >
        ×
      </button>
    </Drawer>
  );
}

// ========================
// サブコンポーネント
// ========================
function RowInput({ label, value, onChange, type = "text" }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 8,
        padding: "12px 14px",
        borderBottom: "1px solid #e5e5ea",
        alignItems: "center",
      }}
    >
      <div style={{ color: "#1c1c1e" }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  );
}

function StoreRow({ labelLeft, labelRight = null }) {
  return (
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
        {labelLeft}
      </div>
      {labelRight}
    </label>
  );
}
