// src/pages/StorePage.jsx
import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
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
  const geo = await new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
  if (geo) return geo;
  return { lat: 35.681236, lon: 139.767125 }; // 東京駅
}

/* ========= 本体 ========= */
export default function StorePage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const askedRef = useRef(false);

  // 👇 追加：ヘッダーの高さを測る
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(0);
  useLayoutEffect(() => {
    if (!headerRef.current) return;
    const el = headerRef.current;
    const update = () => setHeaderH(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const run = async () => {
      if (askedRef.current) return;
      askedRef.current = true;

      setLoading(true);
      setErr("");

      try {
        const loc = await resolveLocation();

        const res = await fetch("/stores.mock.json", { cache: "no-store" });
        if (!res.ok) throw new Error("stores.mock.json が見つかりません");
        const raw = await res.json();

        const enriched = (Array.isArray(raw) ? raw : []).map((s, i) => {
          const lat = Number.isFinite(s.lat) ? s.lat : s.latitude;
          const lng = Number.isFinite(s.lng) ? s.lng : (Number.isFinite(s.lon) ? s.lon : s.longitude);
          const distance =
            Number.isFinite(lat) && Number.isFinite(lng)
              ? haversineKm(loc.lat, loc.lon, lat, lng)
              : Infinity;
          return {
            ...s,
            lat,
            lng,
            distance,
            _key: `${s.name || ""}@@${s.branch || ""}@@${i}`,
          };
        });

        enriched.sort((a, b) => a.distance - b.distance);
        setStores(enriched);
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
    try {
      localStorage.setItem("selectedStore", JSON.stringify(store));
      const all = JSON.parse(localStorage.getItem("allStores") || "[]");
      const k = (s) => `${s?.name || ""}@@${s?.branch || ""}`;
      const exists = all.some((s) => k(s) === k(store));
      const next = exists ? all : [store, ...all];
      localStorage.setItem("allStores", JSON.stringify(next));
    } catch {}
    navigate("/slider", { state: { selectedStore: store } });
  };

  return (
    <div style={{ fontFamily: "sans-serif", height: "100vh", overflow: "hidden" }}>
      {/* 固定ヘッダ（高さを測るために ref を付与） */}
      <div
        ref={headerRef}
        style={{
          position: "fixed",
          top: 0,
          width: "100%",
          maxWidth: 500,
          background: "rgb(250,250,250)",
          zIndex: 100,
        }}
      >
        <div style={{ padding: "100px 16px 30px" }}>
          <h2 className="store-header" style={{ margin: 0 }}>
            購入した店舗を選んでください。
          </h2>
        </div>
        <div style={{ height: 1, background: "#ccc" }} />
      </div>

      {/* リスト（paddingTop をヘッダーの実高さに合わせる） */}
      <div
        style={{
          paddingTop: headerH,
          overflowY: "auto",
          height: "100vh",
          maxWidth: 500,
          margin: "0 auto",
           background: "rgb(250,250,250)", 
        }}
      >
        {loading && <div style={{ padding: 16 }}>読み込み中…</div>}
        {err && <div style={{ padding: 16, color: "crimson" }}>{err}</div>}

        {!loading &&
          !err &&
          stores.map((store) => (
            <div
              key={store._key}
              onClick={() => handleStoreSelect(store)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid #eee",
                cursor: "pointer",
                alignItems: "flex-start", // ← ここは上揃えでOK
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div className="store-link">
                  {store.name} {store.branch || ""}
                </div>
                <div style={{ fontSize: 8, color: "#6e6e73", whiteSpace: "normal" }}>
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
