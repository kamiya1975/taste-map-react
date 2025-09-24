// src/pages/StorePage.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

/* ========= ユーティリティ ========= */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function resolveLocation() {
  // 1) Geolocation 最優先
  const geo = await new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
  if (geo) return geo;

  // 2) フォールバック：東京駅
  return { lat: 35.681236, lon: 139.767125 };
}

/* ========= 本体 ========= */
export default function StorePage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);           // 近い順で並んだ店舗
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const askedRef = useRef(false); // StrictMode 二重実行対策

  useEffect(() => {
    const run = async () => {
      if (askedRef.current) return;
      askedRef.current = true;

      setLoading(true);
      setErr("");

      try {
        // 位置決定
        const loc = await resolveLocation();

        // ダミー店舗を public/stores.mock.json から取得
        const res = await fetch("/stores.mock.json", { cache: "no-store" });
        if (!res.ok) throw new Error("stores.mock.json が見つかりません");
        const raw = await res.json();

        // 正規化（lon→lng）＆距離計算
        const enriched = (Array.isArray(raw) ? raw : []).map((s, i) => {
          const lat = Number.isFinite(s.lat) ? s.lat : s.latitude;
          const lng = Number.isFinite(s.lng) ? s.lng : (Number.isFinite(s.lon) ? s.lon : s.longitude);
          const distance = (Number.isFinite(lat) && Number.isFinite(lng))
            ? haversineKm(loc.lat, loc.lon, lat, lng)
            : Infinity;
          return {
            ...s,
            lat,
            lng,
            distance,
            _key: `${s.name || ""}@@${s.branch || ""}@@${i}`
          };
        });

        // 近い順に並べ替え
        enriched.sort((a, b) => a.distance - b.distance);

        setStores(enriched);

        // MyPagePanel 側の「allStores」にも保存しておくと、固定店舗のブロックに表示されやすい
        try {
          localStorage.setItem("allStores", JSON.stringify(enriched));
        } catch {}
      } catch (e) {
        console.error(e);
        setErr("店舗データの読み込みに失敗しました。/stores.mock.json を確認してください。");
      } finally {
        setLoading(false);
      }
    };

    // ページが見えているときだけ実行（PWA等での非表示マウント対策）
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    if (document.visibilityState === "visible") {
      run();
    } else {
      document.addEventListener("visibilitychange", onVisible, { once: true });
      return () => document.removeEventListener("visibilitychange", onVisible);
    }
  }, []);

  const formatKm = (d) => (Number.isFinite(d) && d !== Infinity ? `${d.toFixed(1)}km` : "—");

  const handleStoreSelect = (store) => {
    // 固定店舗として MyPagePanel に反映されるよう保存
    try {
      localStorage.setItem("selectedStore", JSON.stringify(store));
      // allStores にも重複なしで入れておく（MyPage の候補計算用）
      const all = JSON.parse(localStorage.getItem("allStores") || "[]");
      const k = (s) => `${s?.name || ""}@@${s?.branch || ""}`;
      const exists = all.some((s) => k(s) === k(store));
      const next = exists ? all : [store, ...all];
      localStorage.setItem("allStores", JSON.stringify(next));
    } catch {}

    // 必要に応じて遷移（現状踏襲：スライダーへ）
    navigate("/slider", { state: { selectedStore: store } });
  };

  return (
    <div style={{ fontFamily: "sans-serif", height: "100vh", overflow: "hidden" }}>
      {/* 固定ヘッダ */}
      <div
        style={{
          position: "fixed",
          top: 0,
          width: "100%",
          maxWidth: 500,
          background: "#fff",
          zIndex: 100,
          borderBottom: "1px solid #ccc",
        }}
      >
        <div style={{ padding: 16, textAlign: "center" }}>
          <h2 style={{ margin: 0 }}>購入した店舗を選んでください。</h2>
          <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 4 }}>
            近い順に最大100件を表示（ダミーデータ）
          </div>
        </div>
      </div>

      {/* リスト */}
      <div
        style={{
          paddingTop: 92,
          overflowY: "auto",
          height: "100vh",
          maxWidth: 500,
          margin: "0 auto",
          background: "#fff",
        }}
      >
        {loading && <div style={{ padding: 16 }}>読み込み中…</div>}
        {err && <div style={{ padding: 16, color: "crimson" }}>{err}</div>}

        {!loading && !err && stores.map((store) => (
          <div
            key={store._key}
            onClick={() => handleStoreSelect(store)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid #eee",
              cursor: "pointer",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ textDecoration: "underline", color: "#007bff", fontWeight: 600 }}>
                {store.name} {store.branch || ""}
              </div>
              <div style={{ fontSize: 12, color: "#6e6e73" }}>
                {store.address || ""} {store.genre ? ` / ${store.genre}` : ""}
              </div>
            </div>
            <div style={{ marginLeft: 12 }}>{formatKm(store.distance)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
