// src/components/panels/MyPagePanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";

/**
 * 仕様
 * - 左からドロワー
 * - 左下に×ボタン（位置・サイズは MapPage の 〓 と同等）
 * - 初回選択店舗（localStorage.selectedStore）は一番上に固定＆チェック解除不可
 * - それ以外の店舗は ON/OFF 可能。選択は localStorage.favoriteStores に保存
 * - 候補店舗は localStorage.allStores を優先。なければ primary のみ
 * - 位置情報を取得し距離を計算、近い順に並べて 35km 以内を表示
 * - プロフィール（ニックネーム/ID/生年/月/性別/パス）を表示・保存
 */

// 画面左下丸ボタンの共通スタイル
const CIRCLE_BTN = {
  position: "fixed",                    // ← スクロールしても固定
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
  fontWeight: "bold",
  fontSize: "20px",
  zIndex: 1400,                         // Drawer(1200) より前へ
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  userSelect: "none",
};

// 距離（km）
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

// 便利
const readJSON = (key, fb = null) => {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fb;
  } catch {
    return fb;
  }
};
const storeKey = (s) =>
  `${s?.name || s?.storeName || ""}@@${s?.branch || s?.storeBranch || ""}`;

// メイン
export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  // プロフィール（IntroPage とキーを合わせる）
  const [nickname, setNickname]   = useState("");
  const [email, setEmail]         = useState("");  // ID
  const [birthYear, setBirthYear] = useState("1990");
  const [birthMonth, setBirthMonth] = useState("01");
  const [gender, setGender]       = useState("男性");
  const [pass1, setPass1]         = useState("");
  const [pass2, setPass2]         = useState("");

  // 店舗
  const [primaryStore, setPrimaryStore] = useState(null); // 固定（初回選択）
  const [allStores, setAllStores]       = useState([]);   // 候補（全体）
  const [favSet, setFavSet]             = useState(new Set()); // 追加選択

  // 位置（現在地）
  const [geo, setGeo] = useState(null);

  // 初期ロード（開いたときに復元＆位置取得）
  useEffect(() => {
    if (!isOpen) return;

    // ユーザー情報
    setNickname(localStorage.getItem("user.nickname") || "");
    setEmail(localStorage.getItem("user.id") || "");
    setBirthYear(localStorage.getItem("user.birthYear") || "1990");
    setBirthMonth(localStorage.getItem("user.birthMonth") || "01");
    setGender(localStorage.getItem("user.gender") || "男性");

    // 初回選択の固定店舗
    const sel = readJSON("selectedStore", null);
    setPrimaryStore(sel);

    // 候補店舗（allStores があればそれ、なければ primary のみ）
    const fromLS = readJSON("allStores", null);
    if (Array.isArray(fromLS) && fromLS.length) setAllStores(fromLS);
    else if (sel) setAllStores([sel]);
    else setAllStores([]);

    // 追加選択（favoriteStores = 配列で保持）
    const favArr = readJSON("favoriteStores", []);
    setFavSet(new Set((favArr || []).map(storeKey)));

    // 位置情報取得（失敗しても続行）
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setGeo({ lat: coords.latitude, lng: coords.longitude });
        },
        () => {
          // 失敗時は未設定のまま（距離なしソート）
          setGeo(null);
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, [isOpen]);

  // ソート＆35km以内に絞り込み（primary は常にリストに含める）
  const sortedWithin = useMemo(() => {
    const list = Array.isArray(allStores) ? allStores.slice() : [];
    // 距離計算
    const withDist = list.map((s) => {
      const hasCoord = Number.isFinite(s?.lat) && Number.isFinite(s?.lng);
      const d = geo && hasCoord ? haversineKm(geo.lat, geo.lng, s.lat, s.lng) : null;
      return { ...s, distanceKm: d };
    });

    // 近い順
    withDist.sort((a, b) => {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      return da - db;
    });

    // 35km 以内に制限。ただし primary は必ず含める
    const maxKm = 35;
    const filtered = withDist.filter((s) => {
      if (primaryStore && storeKey(s) === storeKey(primaryStore)) return true;
      if (s.distanceKm == null) return false; // 距離不明は除外（primary 以外）
      return s.distanceKm <= maxKm + 1e-9;
    });

    return filtered;
  }, [allStores, geo, primaryStore]);

  // チェック切り替え（primary は外せない）
  const toggleFav = (s) => {
    if (primaryStore && storeKey(s) === storeKey(primaryStore)) return;
    setFavSet((prev) => {
      const next = new Set(prev);
      const k = storeKey(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);

      // 保存：表示中の filtered を基準に、ON のものを配列で
      try {
        const arr = sortedWithin.filter((st) => next.has(storeKey(st)));
        localStorage.setItem("favoriteStores", JSON.stringify(arr));
      } catch {}
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
      localStorage.setItem("user.id", email || "");
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
    <>
      {/* 左下に常時固定の「×」 */}
      {isOpen && (
        <button
          onClick={onClose}
          aria-label="閉じる"
          title="閉じる"
          style={CIRCLE_BTN}
        >
          ×
        </button>
      )}

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
            paddingBottom: 72, // 下部の×と重ならないよう余白
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

        {/* コンテンツ（スクロール領域） */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* 基準のワイン 再設定 */}
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

          {/* アカウント（iOS 設定風） */}
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

              {/* ID（メール） */}
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
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                  style={{
                    border: "none",
                    outline: "none",
                    fontSize: 16,
                    padding: "6px 8px",
                    background: "transparent",
                  }}
                />
              </div>

              {/* 生まれ年 */}
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
                <div style={{ color: "#1c1c1e" }}>生まれ年</div>
                <select
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  style={{
                    border: "none",
                    outline: "none",
                    fontSize: 16,
                    padding: "6px 8px",
                    background: "transparent",
                  }}
                >
                  {Array.from({ length: 80 }, (_, i) => (2025 - i).toString()).map(
                    (y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* 生まれ月 */}
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
                <div style={{ color: "#1c1c1e" }}>生まれ月</div>
                <select
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                  style={{
                    border: "none",
                    outline: "none",
                    fontSize: 16,
                    padding: "6px 8px",
                    background: "transparent",
                  }}
                >
                  {Array.from({ length: 12 }, (_, i) =>
                    String(i + 1).padStart(2, "0")
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* 性別 */}
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
                <div style={{ color: "#1c1c1e" }}>性別</div>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  style={{
                    border: "none",
                    outline: "none",
                    fontSize: 16,
                    padding: "6px 8px",
                    background: "transparent",
                  }}
                >
                  <option value="男性">男性</option>
                  <option value="女性">女性</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              {/* パスワード（任意で更新） */}
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
                  placeholder="●●●●●●●●●●"
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
                  placeholder="●●●●●●●●●●"
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

          {/* お気に入り店舗追加（35km以内、近い順） */}
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
              {/* 最上段：固定（解除不可） */}
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
                        {(primaryStore.name || primaryStore.storeName) + " " + (primaryStore.branch || primaryStore.storeBranch)}
                      </div>
                      <div style={{ fontSize: 12, color: "#6e6e73" }}>
                        {fmtKm(primaryStore.distanceKm)}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "#6e6e73" }}>固定</span>
                </label>
              )}

              {/* その他：ON/OFF可（近い順・35km以内） */}
              {sortedWithin
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
                            {(s.name || s.storeName) + " " + (s.branch || s.storeBranch)}
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
      </Drawer>
    </>
  );
}
