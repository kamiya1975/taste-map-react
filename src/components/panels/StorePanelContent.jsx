// src/components/panels/StorePanelContent.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

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
  return geo || { lat: 35.681236, lon: 139.767125 }; // 東京駅
}

export default function StorePanelContent({ onPickStore }) {
  const [stores, setStores]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const askedRef = useRef(false);

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
          const lng =
            Number.isFinite(s.lng) ? s.lng :
            (Number.isFinite(s.lon) ? s.lon : s.longitude);
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
        try { localStorage.setItem("allStores", JSON.stringify(enriched)); } catch {}
      } catch (e) {
        console.error(e);
        setErr("店舗データの読み込みに失敗しました。/stores.mock.json を確認してください。");
      } finally {
        setLoading(false);
      }
    };

    // ドロワー表示時に一度だけ実行
    run();
  }, []);

  const formatKm = useMemo(() => (d) =>
    (Number.isFinite(d) && d !== Infinity ? `${d.toFixed(1)}km` : "—")
  , []);

  const handleSelect = (store) => {
    try {
      // 選択の保存（元ページと同じキー）
      localStorage.setItem("selectedStore", JSON.stringify(store));
      localStorage.setItem("main_store", JSON.stringify(store));
      const all = JSON.parse(localStorage.getItem("allStores") || "[]");
      const k = (s) => `${s?.name || ""}@@${s?.branch || ""}`;
      const exists = all.some((s) => k(s) === k(store));
      const next = exists ? all : [store, ...all];
      localStorage.setItem("allStores", JSON.stringify(next));
    } catch {}

    onPickStore?.(store);
  };

  return (
    <div className="drawer-scroll" style={{ background: "rgb(250,250,250)" }}>
      <div style={{ padding: "12px 16px 8px", color: "#111", fontWeight: 600 }}>
        購入した店舗を選んでください。
      </div>
      <div style={{ height: 1, background: "#ddd" }} />

      {loading && <div style={{ padding: 16 }}>読み込み中…</div>}
      {err && <div style={{ padding: 16, color: "crimson" }}>{err}</div>}

      {!loading && !err && stores.map((store) => (
        <button
          key={store._key}
          onClick={() => handleSelect(store)}
          style={{
            width: "100%",
            background: "#fff",
            border: "none",
            borderBottom: "1px solid #eee",
            padding: "12px 16px",
            textAlign: "left",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div className="store-link" style={{ fontSize: 15, color: "#111" }}>
              {store.name} {store.branch || ""}
            </div>
            <div style={{ fontSize: 12, color: "#6e6e73", whiteSpace: "normal" }}>
              {store.address || ""} {store.genre ? ` / ${store.genre}` : ""}
            </div>
          </div>
          <div style={{ marginLeft: 12 }}>{formatKm(store.distance)}</div>
        </button>
      ))}
    </div>
  );
}
