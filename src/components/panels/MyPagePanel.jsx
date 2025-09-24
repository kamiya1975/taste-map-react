import React, { useEffect, useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";
import { loadProfile, saveProfile } from "../../utils/profile";

/** 左ドロワー：iOS設定風マイページ */
const CLOSE_BTN = {
  position: "fixed",
  left: "12px",
  bottom: "max(12px, env(safe-area-inset-bottom))",
  zIndex: 1000,
  width: 40, height: 40, borderRadius: "50%",
  background: "#eee", border: "1px solid #ccc",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  fontWeight: "bold", fontSize: 20, boxShadow: "0 2px 6px rgba(0,0,0,.2)",
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
const readJSON = (k, f = null) => {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : f; } catch { return f; }
};
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const storeKey = (s) => `${s.name || s.storeName || ""}@@${s.branch || s.storeBranch || ""}`;

export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  // プロフィール
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");        // ← ID（メール）
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [birthYear, setBirthYear] = useState("1990");
  const [birthMonth, setBirthMonth] = useState("01");
  const [gender, setGender] = useState("男性");

  // 店舗
  const [primaryStore, setPrimaryStore] = useState(null);
  const [allStores, setAllStores] = useState([]);
  const [favSet, setFavSet] = useState(new Set());

  // 位置情報
  const [geo, setGeo] = useState(null);

  // 初期ロード
  useEffect(() => {
    if (!isOpen) return;

    // プロフィールの復元
    const prof = loadProfile();
    if (prof) {
      setNickname(prof.nickname || "");
      setEmail(prof.email || "");
      const [yy = "1990", mm = "01"] = (prof.birth || "").split("-");
      setBirthYear(yy); setBirthMonth(mm);
      setGender(prof.gender || "男性");
    }

    // 店舗候補
    const sel = readJSON("selectedStore", null);
    setPrimaryStore(sel);
    const fromLS = readJSON("allStores", null);
    setAllStores(Array.isArray(fromLS) ? fromLS : sel ? [sel] : []);

    // 追加お気に入り
    const favArr = readJSON("favoriteStores", []);
    setFavSet(new Set((favArr || []).map(storeKey)));

    // 位置情報
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => setGeo({ lat: coords.latitude, lng: coords.longitude }),
        () => setGeo(null),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, [isOpen]);

  // 近い順
  const sortedStores = useMemo(() => {
    const list = Array.isArray(allStores) ? allStores.slice() : [];
    if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return list;
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

  const toggleFav = (s) => {
    const k = storeKey(s);
    if (primaryStore && k === storeKey(primaryStore)) return; // 固定は外せない
    setFavSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      const arr = sortedStores.filter((st) => next.has(storeKey(st)));
      writeJSON("favoriteStores", arr);
      return next;
    });
  };

  // 保存
  const onSaveProfile = () => {
    if (pass1 && pass1 !== pass2) { alert("パスワードが一致しません。"); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert("メールアドレスの形式が正しくありません"); return;
    }
    const prev = loadProfile() || {};
    const next = {
      ...prev,
      nickname: nickname || "",
      email: email || "",
      birth: `${birthYear}-${birthMonth}`,
      gender,
      ...(pass1 ? { password: pass1 } : {}),
    };
    const ok = saveProfile(next);
    alert(ok ? "保存しました。" : "保存に失敗しました。");
    setPass1(""); setPass2("");
  };

  return (
    <Drawer
      anchor="left"
      open={isOpen}
      onClose={onClose}
      PaperProps={{
        style: {
          width: "86vw", maxWidth: 480, borderRadius: "0 12px 12px 0",
          display: "flex", flexDirection: "column", paddingBottom: 72,
        },
      }}
    >
      {/* 見出し */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e5ea", fontWeight: 700 }}>
        マイページ
      </div>

      {/* 本体 */}
      <div style={{ flex: 1, overflowY: "auto", background: "#f5f5f7" }}>
        {/* 基準のワイン */}
        <section style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>基準のワイン</div>
          <button
            onClick={() => { onClose?.(); onOpenSlider?.(); }}
            style={{ width: "100%", padding: 12, background: "#fff", border: "1px solid #d1d1d6", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}
          >
            スライダーを開く
          </button>
        </section>

        {/* アカウント */}
        <section style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>アカウント</div>

          <div style={{ background: "#fff", border: "1px solid #d1d1d6", borderRadius: 12, overflow: "hidden" }}>
            {/* ニックネーム */}
            <Row label="ニックネーム">
              <input value={nickname} onChange={(e) => setNickname(e.target.value)}
                     placeholder="-" style={inputRowStyle} />
            </Row>

            {/* ID（メール） */}
            <Row label="ID（メールアドレス）">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="you@example.com" style={inputRowStyle} autoComplete="email" />
            </Row>

            {/* 生年月＆性別（表示編集） */}
            <Row label="生まれ年">
              <select value={birthYear} onChange={(e) => setBirthYear(e.target.value)} style={inputRowStyle}>
                {Array.from({ length: 80 }, (_, i) => (2025 - i).toString()).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </Row>

            <Row label="生まれ月">
              <select value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} style={inputRowStyle}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Row>

            <Row label="性別">
              <select value={gender} onChange={(e) => setGender(e.target.value)} style={inputRowStyle}>
                <option value="男性">男性</option>
                <option value="女性">女性</option>
                <option value="その他">その他</option>
              </select>
            </Row>

            {/* パスワード変更 */}
            <Row label="Pass変更">
              <input type="password" value={pass1} onChange={(e) => setPass1(e.target.value)}
                     placeholder="●●●●●●●●●●●" style={inputRowStyle} autoComplete="new-password" />
            </Row>
            <Row label="再入力" noBorder>
              <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)}
                     placeholder="●●●●●●●●●●●" style={inputRowStyle} autoComplete="new-password" />
            </Row>
          </div>

          <div style={{ marginTop: 12, textAlign: "right" }}>
            <button onClick={onSaveProfile}
                    style={{ padding: "10px 16px", background: "#007aff", color: "#fff",
                             border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
              保存
            </button>
          </div>
        </section>

        {/* お気に入り店舗（近い順） */}
        <section style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>お気に入り店舗追加（近い順）</div>
          <div style={{ background: "#fff", border: "1px solid #d1d1d6", borderRadius: 12, overflow: "hidden" }}>
            {/* 固定 */}
            {primaryStore && (
              <StoreRow fixed labelLeft={
                <>
                  <input type="checkbox" checked readOnly />
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {primaryStore.name || primaryStore.storeName} {primaryStore.branch || primaryStore.storeBranch}
                    </div>
                    <div style={{ fontSize: 12, color: "#6e6e73" }}>
                      {Number.isFinite(primaryStore.distanceKm) ? `（${primaryStore.distanceKm.toFixed(1)}km）` : ""}
                    </div>
                  </div>
                </>
              } />
            )}

            {/* 追加可 */}
            {sortedStores
              .filter((s) => !primaryStore || storeKey(s) !== storeKey(primaryStore))
              .map((s, i) => {
                const k = storeKey(s);
                const checked = favSet.has(k);
                return (
                  <StoreRow key={`${k}-${i}`}
                    labelLeft={
                      <>
                        <input type="checkbox" checked={checked} onChange={() => toggleFav(s)} />
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

      {/* 左下固定 × */}
      <button onClick={onClose} aria-label="閉じる" title="閉じる" style={CLOSE_BTN}>×</button>
    </Drawer>
  );
}

/* ---- 小さなサブUI ---- */
const rowBase = {
  display: "grid",
  gridTemplateColumns: "120px 1fr",
  gap: 8,
  padding: "12px 14px",
  alignItems: "center",
  borderBottom: "1px solid #e5e5ea",
};
const inputRowStyle = {
  border: "none", outline: "none", fontSize: 16, padding: "6px 8px", background: "transparent", width: "100%",
};

function Row({ label, children, noBorder = false }) {
  return (
    <div style={{ ...rowBase, borderBottom: noBorder ? "none" : rowBase.borderBottom }}>
      <div style={{ color: "#1c1c1e" }}>{label}</div>
      {children}
    </div>
  );
}
function StoreRow({ labelLeft, fixed = false }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 14px", borderBottom: "1px solid #e5e5ea", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{labelLeft}</div>
      {fixed && <span style={{ fontSize: 12, color: "#6e6e73" }}>固定</span>}
    </label>
  );
}
