// src/components/panels/MyPagePanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";

/** 共通：左下の丸ボタン（×） */
const CIRCLE_BTN = {
  position: "fixed",
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
  zIndex: 1400,
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  userSelect: "none",
};

/** 小さめ値入力の共通スタイル（iOS ズーム回避で 14px 以上） */
const VALUE_INPUT = {
  border: "none",
  outline: "none",
  fontSize: 16,
  padding: "6px 8px",
  background: "transparent",
  color: "#1c1c1e",
  lineHeight: "1.4",
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(1 - a), Math.sqrt(a)));
}

const readJSON = (k, fb = null) => {
  try {
    const s = localStorage.getItem(k);
    return s ? JSON.parse(s) : fb;
  } catch {
    return fb;
  }
};
const storeKey = (s) =>
  `${s?.name || s?.storeName || ""}@@${s?.branch || s?.storeBranch || ""}`;

export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  // プロフィール（IntroPage とキー連携）
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState(""); // ID
  const [birthYear, setBirthYear] = useState("1990");
  const [birthMonth, setBirthMonth] = useState("01");
  const [gender, setGender] = useState("男性");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");

  // 店舗
  const [primaryStore, setPrimaryStore] = useState(null);
  const [allStores, setAllStores] = useState([]);
  const [favSet, setFavSet] = useState(new Set());

  // 現在地
  const [geo, setGeo] = useState(null);

  // オープン時に復元＆初期化
  useEffect(() => {
    if (!isOpen) return;

    // 値入力は小さめ表示にするだけなので、LS から復元しつつ…
    setNickname(localStorage.getItem("user.nickname") || "");
    setEmail(localStorage.getItem("user.id") || "");
    setBirthYear(localStorage.getItem("user.birthYear") || "1990");
    setBirthMonth(localStorage.getItem("user.birthMonth") || "01");
    setGender(localStorage.getItem("user.gender") || "男性");

    // パスワード欄は毎回クリア（黒丸が表示されないようにする）
    setPass1("");
    setPass2("");

    const sel = readJSON("selectedStore", null);
    setPrimaryStore(sel);

    const fromLS = readJSON("allStores", null);
    if (Array.isArray(fromLS) && fromLS.length) setAllStores(fromLS);
    else if (sel) setAllStores([sel]);
    else setAllStores([]);

    const favArr = readJSON("favoriteStores", []);
    setFavSet(new Set((favArr || []).map(storeKey)));

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => setGeo({ lat: coords.latitude, lng: coords.longitude }),
        () => setGeo(null),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, [isOpen]);

  // 近い順（35km以内を優先、最大10件。足りなければ距離上限なしで補完）
  const limitedStores = useMemo(() => {
    const list = Array.isArray(allStores) ? allStores.slice() : [];

    const withDist = list.map((s) => {
      const hasCoord = Number.isFinite(s?.lat) && Number.isFinite(s?.lng);
      const d = geo && hasCoord ? haversineKm(geo.lat, geo.lng, s.lat, s.lng) : null;
      return { ...s, distanceKm: d };
    });

    withDist.sort((a, b) => {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      return da - db;
    });

    const MAX_KM = 35;
    // 35km以内
    let filtered = withDist.filter((s) => s.distanceKm != null && s.distanceKm <= MAX_KM);

    // primary は必ず先頭に
    if (primaryStore) {
      const pk = storeKey(primaryStore);
      const idx = withDist.findIndex((s) => storeKey(s) === pk);
      const primary = idx >= 0 ? withDist[idx] : primaryStore;
      filtered = [primary, ...filtered.filter((s) => storeKey(s) !== pk)];
    }

    // 最大10件に制限。足りなければ近い順で補完（重複除去）
    const picked = [];
    const seen = new Set();
    const pushUnique = (s) => {
      const k = storeKey(s);
      if (!seen.has(k)) {
        seen.add(k);
        picked.push(s);
      }
    };

    filtered.forEach(pushUnique);
    if (picked.length < 10) {
      withDist.forEach((s) => {
        if (picked.length < 10) pushUnique(s);
      });
    }
    return picked.slice(0, 10);
  }, [allStores, geo, primaryStore]);

  // チェック切替（primary は外せない）
  const toggleFav = (s) => {
    if (primaryStore && storeKey(s) === storeKey(primaryStore)) return;
    setFavSet((prev) => {
      const next = new Set(prev);
      const k = storeKey(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        const toSave = limitedStores.filter((st) => next.has(storeKey(st)));
        localStorage.setItem("favoriteStores", JSON.stringify(toSave));
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
      {isOpen && (
        <button 
        onClick={() => {
          if (document.activeElement && "blur" in document.activeElement) {
            document.activeElement.blur();
          }
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          onClose();
         }} 
        style={CIRCLE_BTN}>
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
            paddingBottom: 72,
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
          {/* 基準ワイン */}
          <section style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>基準のワイン</div>
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
            <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>アカウント</div>

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
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>ニックネーム</div>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="-"
                  style={VALUE_INPUT}
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
                  fontSize: 12,
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
                  style={VALUE_INPUT}
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
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>生まれ年</div>
                <select
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  style={{ ...VALUE_INPUT, appearance: "none" }}
                >
                  {Array.from({ length: 80 }, (_, i) => (2025 - i).toString()).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
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
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>生まれ月</div>
                <select
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                  style={{ ...VALUE_INPUT, appearance: "none" }}
                >
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
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
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>性別</div>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  style={{ ...VALUE_INPUT, appearance: "none" }}
                >
                  <option value="男性">男性</option>
                  <option value="女性">女性</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              {/* パスワード（表示は常に空） */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  gap: 8,
                  padding: "12px 14px",
                  borderBottom: "1px solid #e5e5ea",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>Pass変更</div>
                <input
                  type="password"
                  value={pass1}
                  onChange={(e) => setPass1(e.target.value)}
                  placeholder="（未入力）"
                  autoComplete="new-password"
                  style={VALUE_INPUT}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  gap: 8,
                  padding: "12px 14px",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#1c1c1e" }}>再入力</div>
                <input
                  type="password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  placeholder="（未入力）"
                  autoComplete="new-password"
                  style={VALUE_INPUT}
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

          {/* 近い店舗（最大10件、35km優先） */}
          <section style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
              お気に入り店舗追加（35km以内／最大10件）
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #d1d1d6",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {/* 固定の親店舗 */}
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
                        {(primaryStore.name || primaryStore.storeName) +
                          " " +
                          (primaryStore.branch || primaryStore.storeBranch)}
                      </div>
                      <div style={{ fontSize: 12, color: "#6e6e73" }}>
                        {fmtKm(primaryStore.distanceKm)}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "#6e6e73" }}>固定</span>
                </label>
              )}

              {/* 近い順 10件まで */}
              {limitedStores
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
