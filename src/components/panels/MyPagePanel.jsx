import React, { useEffect, useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";
import { loadProfile, saveProfile } from "../../utils/profile";

/**
 * iOS設定風の左ドロワー マイページ
 * - 左からスライド、白ベース、角丸ボックス
 * - 画面左下固定の「×」丸ボタン（MapPage の 〓 と同ポジ）
 * - 初回に選んだ店舗（localStorage.selectedStore）を一番上に固定表示（チェック不可）
 * - その他の店舗は ON/OFF 可能。localStorage.favoriteStores に保存
 * - 店舗候補は localStorage.allStores（無ければ selectedStore だけ）
 * - 位置情報が取れれば近い順へソート
 */

const CLOSE_BTN = {
  position: "fixed", // ← スクロールしても動かない
  left: "12px",
  bottom: "max(12px, env(safe-area-inset-bottom))",
  zIndex: 1000,
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
const writeJSON = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
};

function storeKey(s) {
  return `${s.name || s.storeName || ""}@@${s.branch || s.storeBranch || ""}`;
}

export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  // プロフィール
  const [nickname, setNickname] = useState("");
  const [userId, setUserId] = useState(""); // 任意項目
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

    // プロフィール
    const prof = loadProfile();
    if (prof) setNickname(prof.nickname || "");

    // 店舗候補
    const sel = readJSON("selectedStore", null);
    setPrimaryStore(sel);

    const fromLS = readJSON("allStores", null);
    setAllStores(Array.isArray(fromLS) ? fromLS : sel ? [sel] : []);

    // 追加お気に入り
    const favArr = readJSON("favoriteStores", []);
    setFavSet(new Set((favArr || []).map(storeKey)));

    // 位置情報（許可されれば近い順）
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setGeo({ lat: coords.latitude, lng: coords.longitude });
        },
        () => setGeo(null),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, [isOpen]);

  // 近い順
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
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [allStores, geo]);

  const fmtKm = (d) => (Number.isFinite(d) ? `（${d.toFixed(1)}km）` : "");

  // 店舗チェック切替（固定は外せない）
  const toggleFav = (s) => {
    const k = storeKey(s);
    if (primaryStore && k === storeKey(primaryStore)) return;

    setFavSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);

      const arr = sortedStores.filter((st) => next.has(storeKey(st)));
      writeJSON("favoriteStores", arr);
      return next;
    });
  };

  // プロフィール保存
  const onSaveProfile = () => {
    if (pass1 && pass1 !== pass2) {
      alert("パスワードが一致しません。");
      return;
    }
    const prev = loadProfile() || {};
    const next = {
      ...prev,
      nickname: nickname || "",
      // 任意：userId を扱うならここで next.userId = userId
      ...(pass1 ? { password: pass1 } : {}),
    };
    const ok = saveProfile(next);
    alert(ok ? "保存しました。" : "保存に失敗しました。");
    setPass1("");
    setPass2("");
  };

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
          display: "flex",
          flexDirection: "column",
          paddingBottom: 72, // 下の×が被らないように
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

      {/* 本体スクロール */}
      <div style={{ flex: 1, overflowY: "auto", background: "#f5f5f7" }}>
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

        {/* アカウント */}
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

            {/* ID（任意で利用する場合） */}
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

            {/* パスワード変更 */}
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: 8,
                padding: "12px 14px",
                alignItems: "center",
              }}
            >
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
              onClick={onSaveProfile}
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
            お気に入り店舗追加（近い順）
          </div>

          <div
            style={{
              background: "#fff",
              border: "1px solid #d1d1d6",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* 固定（初回選択店舗） */}
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
                      {primaryStore.name || primaryStore.storeName}{" "}
                      {primaryStore.branch || primaryStore.storeBranch}
                    </div>
                    <div style={{ fontSize: 12, color: "#6e6e73" }}>
                      {Number.isFinite(primaryStore.distanceKm)
                        ? fmtKm(primaryStore.distanceKm)
                        : ""}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "#6e6e73" }}>固定</span>
              </label>
            )}

            {/* 追加可能な店舗（近い順） */}
            {sortedStores
              .filter(
                (s) => !primaryStore || storeKey(s) !== storeKey(primaryStore)
              )
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

      {/* 閉じる（左下固定・常に表示） */}
      <button
        onClick={onClose}
        aria-label="閉じる"
        title="閉じる"
        style={CLOSE_BTN}
      >
        ×
      </button>
    </Drawer>
  );
}
