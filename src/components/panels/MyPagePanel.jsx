import React, { useEffect, useMemo, useRef, useState } from "react";
import Drawer from "@mui/material/Drawer";

/* === モック店舗（近い順表示に利用）=== */
const mockStores = [
  { name: "スーパーマーケットA", branch: "●●●店", lat: 34.928, lng: 137.05,  prefecture: "北海道", products: ["4935919319140", "4935919080316"] },
  { name: "スーパーマーケットB", branch: "●●●店", lat: 34.93,  lng: 137.04,  prefecture: "北海道", products: ["4935919058186"] },
  { name: "スーパーマーケットA", branch: "●●●店", lat: 34.92,  lng: 137.06,  prefecture: "青森県",   products: ["850832004260"] },
  { name: "スーパーマーケットC", branch: "●●●店", lat: 34.925, lng: 137.045, prefecture: "岩手県",   products: ["4935919071604"] },
  { name: "スーパーマーケットD", branch: "●●●店", lat: 34.927, lng: 137.042, prefecture: "宮城県",   products: ["4935919193559", "4935919197175"] },
  { name: "スーパーマーケットA", branch: "●●●店", lat: 34.93,  lng: 137.055, prefecture: "宮城県",   products: ["4935919052504"] },
];

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
const fmtKm = (d) => (Number.isFinite(d) ? `（${d.toFixed(1)}km）` : "");

const readJSON = (k, f = null) => {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : f; }
  catch { return f; }
};
const storeKey = (s) => `${s.name || s.storeName || ""}@@${s.branch || s.storeBranch || ""}`;

/* === 左下固定の×ボタン（MapPageの〓と同じ座標）=== */
const FloatingClose = ({ onClick }) => (
  <button
    onClick={onClick}
    aria-label="閉じる"
    title="閉じる"
    style={{
      position: "fixed",
      left: "12px",
      bottom: "max(12px, env(safe-area-inset-bottom))",
      zIndex: 1600,          // MUI Modal(1300) より上
      width: 40,
      height: 40,
      borderRadius: "50%",
      background: "#eee",
      border: "1px solid #ccc",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "bold",
      fontSize: 20,
      boxShadow: "0 2px 6px rgba(0,0,0,.2)",
    }}
  >
    ×
  </button>
);

export default function MyPagePanel({ isOpen, onClose, onOpenSlider }) {
  // プロフィール
  const [nickname, setNickname] = useState("");
  const [userId, setUserId] = useState("");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");

  // 店舗
  const [primaryStore, setPrimaryStore] = useState(null); // 解除不可・最上段固定
  const [allStores, setAllStores]     = useState([]);     // 並べ替え対象
  const [favSet, setFavSet]           = useState(new Set());

  // 位置
  const [geo, setGeo] = useState(null);
  const askedRef = useRef(false); // 同一オープン中に1回だけ問い合わせ

  // パネルを開いたときの初期化
  useEffect(() => {
    if (!isOpen) return;

    // 既存値表示
    setNickname(localStorage.getItem("user.nickname") || "");
    setUserId(localStorage.getItem("user.id") || "");
    setPass1(""); setPass2("");

    const sel = readJSON("selectedStore", null);
    setPrimaryStore(sel);

    // 候補は localStorage("allStores") 優先、無ければモック
    const fromLS = readJSON("allStores", null);
    const base = Array.isArray(fromLS) ? fromLS : mockStores;
    setAllStores(base);

    const favArr = readJSON("favoriteStores", []);
    setFavSet(new Set((favArr || []).map(storeKey)));

    // 位置情報で距離並べ替え（許可/拒否ともに一度だけ）
    if (askedRef.current) return;
    askedRef.current = true;

    const ask = async () => {
      if (!("geolocation" in navigator)) {
        // 位置なし → そのまま
        return;
      }
      const allow = window.confirm("近い店舗を並べ替えます。位置情報を取得しても良いですか？");
      if (!allow) {
        // フォールバック座標（名古屋駅）
        const fallback = { lat: 35.1709, lng: 136.8815 };
        setGeo(fallback);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => setGeo({ lat: coords.latitude, lng: coords.longitude }),
        () => setGeo({ lat: 35.1709, lng: 136.8815 }), // 失敗時フォールバック
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    };
    ask();
  }, [isOpen]);

  // 近い順に並べ替え
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

  // お気に入りトグル（固定店舗は不可）
  const toggleFav = (s) => {
    const k = storeKey(s);
    if (primaryStore && k === storeKey(primaryStore)) return;
    setFavSet((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      try {
        const arr = sortedStores.filter((st) => next.has(storeKey(st)));
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
      localStorage.setItem("user.id", userId || "");
      if (pass1) localStorage.setItem("user.pass.hashless-demo", pass1);
      alert("保存しました。");
    } catch { alert("保存に失敗しました。"); }
  };

  return (
    <>
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
            paddingBottom: 64, // 左下の×と被らない余白
          },
        }}
      >
        {/* 見出し */}
        <div style={{
          padding: "14px 12px",
          borderBottom: "1px solid #e5e5ea",
          fontWeight: 700,
        }}>
          マイページ
        </div>

        {/* 本文 */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* 基準ワイン */}
          <section style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>基準のワイン</div>
            <button
              onClick={() => { onClose?.(); onOpenSlider?.(); }}
              style={{
                width: "100%", padding: 12,
                background: "#fff", border: "1px solid #d1d1d6", borderRadius: 10,
                fontWeight: 600, cursor: "pointer", textAlign: "left"
              }}
            >
              スライダーを開く
            </button>
          </section>

          {/* アカウント */}
          <section style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>アカウント</div>
            <div style={{ background: "#fff", border: "1px solid #d1d1d6", borderRadius: 12, overflow: "hidden" }}>
              {[
                ["ニックネーム", <input value={nickname} onChange={(e)=>setNickname(e.target.value)} style={{border:"none",outline:"none"}} />],
                ["ID",          <input value={userId} onChange={(e)=>setUserId(e.target.value)} style={{border:"none",outline:"none"}} />],
                ["Pass変更",    <input type="password" value={pass1} onChange={(e)=>setPass1(e.target.value)} style={{border:"none",outline:"none"}} />],
                ["再入力",      <input type="password" value={pass2} onChange={(e)=>setPass2(e.target.value)} style={{border:"none",outline:"none"}} />],
              ].map(([label, inputEl], i, arr) => (
                <div key={label} style={{
                  display:"grid", gridTemplateColumns:"100px 1fr",
                  padding:"12px", borderBottom: i < arr.length-1 ? "1px solid #e5e5ea" : "none"
                }}>
                  <div>{label}</div>
                  <div>{inputEl}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button
                onClick={saveProfile}
                style={{ padding:"10px 16px", background:"#007aff", color:"#fff", border:"none", borderRadius:10, fontWeight:700, cursor:"pointer" }}
              >
                保存
              </button>
            </div>
          </section>

          {/* お気に入り店舗（近い順） */}
          <section style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>お気に入り店舗追加（近い順）</div>
            <div style={{ background:"#fff", border:"1px solid #d1d1d6", borderRadius:12, overflow:"hidden" }}>
              {primaryStore && (
                <label style={{ display:"flex", alignItems:"center", gap:12, padding:"12px", borderBottom:"1px solid #e5e5ea" }}>
                  <input type="checkbox" checked readOnly />
                  <div style={{ fontWeight:600 }}>
                    {primaryStore.name || primaryStore.storeName} {primaryStore.branch || primaryStore.storeBranch}
                  </div>
                  <span style={{ marginLeft:"auto", fontSize:12, color:"#6e6e73" }}>固定</span>
                </label>
              )}
              {sortedStores
                .filter((s) => !primaryStore || storeKey(s) !== storeKey(primaryStore))
                .map((s, i) => {
                  const k = storeKey(s);
                  const checked = favSet.has(k);
                  return (
                    <label key={`${k}-${i}`} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px", borderBottom:"1px solid #e5e5ea" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleFav(s)} />
                      <div>
                        <div style={{ fontWeight:600 }}>
                          {s.name || s.storeName} {s.branch || s.storeBranch}
                        </div>
                        <div style={{ fontSize:12, color:"#6e6e73" }}>{fmtKm(s.distanceKm)}</div>
                      </div>
                    </label>
                  );
                })}
            </div>
          </section>
        </div>
      </Drawer>

      {/* 左下固定の「×」オーバーレイ（Drawerが開いている時だけ） */}
      {isOpen && <FloatingClose onClick={onClose} />}
    </>
  );
}
