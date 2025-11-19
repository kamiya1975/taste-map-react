// src/pages/StorePage.jsx
import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";

// バックエンドのベースURL（例: https://tdb-backend-xxxx.onrender.com）
const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

/* ========= 位置情報取得ユーティリティ ========= */
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
  // 取得できなかった場合は東京駅
  return { lat: 35.681236, lon: 139.767125 };
}

/* ========= 本体 ========= */
export default function StorePage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const askedRef = useRef(false);

  // ヘッダー高さ計測
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
        const token = localStorage.getItem("app.access_token");
        if (!token) {
          throw new Error("NO_APP_TOKEN");
        }

        const loc = await resolveLocation();
        const params = new URLSearchParams();
        if (Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
          params.set("user_lat", String(loc.lat));
          params.set("user_lon", String(loc.lon));
        }

        // ★ ここを /api/app/stores に修正
        const url = `${API_BASE}/api/app/stores?${params.toString()}`;
        console.log("[StorePage] fetch:", url);

        const res = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          console.error("[StorePage] /api/app/stores error", res.status);
          throw new Error("FETCH_FAILED");
        }

        const raw = await res.json();
        const list = Array.isArray(raw) ? raw : [];

        // バックエンドの AppStoreOut をフロント用に整形
        const enriched = list.map((s, i) => {
          const d =
            typeof s.distance_km === "number" && isFinite(s.distance_km)
              ? s.distance_km
              : Infinity;

          return {
            // バックエンド由来
            id: s.store_id,
            name: s.store_name,
            distance: d, // 旧コード互換（formatKm が使う）
            distance_km: s.distance_km,
            is_main: !!s.is_main,
            updated_at: s.updated_at,

            // /stores.mock.json 互換のダミー項目（他のコードと合わせる用）
            branch: "",
            address: "",
            genre: "",

            _key: `${s.store_id}@@${i}`,
          };
        });

        // 距離昇順（バックエンドもソートしているが念のため）
        enriched.sort((a, b) => a.distance - b.distance);

        setStores(enriched);
        try {
          localStorage.setItem("allStores", JSON.stringify(enriched));
        } catch {}
      } catch (e) {
        console.error(e);
        if (e.message === "NO_APP_TOKEN") {
          setErr("ログイン情報が見つかりません。マイページからログインしてからお試しください。");
        } else {
          setErr("店舗データの読み込みに失敗しました。しばらく経ってから再度お試しください。");
        }
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

  const formatKm = (d) =>
    Number.isFinite(d) && d !== Infinity ? `${d.toFixed(1)}km` : "—";

  const handleStoreSelect = (store) => {
    try {
      // 通常の選択記録
      localStorage.setItem("selectedStore", JSON.stringify(store));

      // 固定店舗（基準ワイン購入店舗）を常に 1 件に保つ（上書き保存）
      localStorage.setItem("main_store", JSON.stringify(store));

      // ついでに allStores にも取り込み（重複回避）
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
      {/* 固定ヘッダ */}
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
        <div style={{ padding: "70px 16px 30px" }}>
          <h2 className="store-header" style={{ margin: 0 }}>
            購入した店舗を選んでください。
          </h2>
        </div>
        <div style={{ height: 1, background: "#ccc" }} />
      </div>

      {/* リスト */}
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
                alignItems: "flex-start",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div className="store-link">
                  {store.name} {store.branch || ""}
                </div>
                {/* address / genre は今は空だが、将来拡張用に残しておく */}
                <div style={{ fontSize: 12, color: "#6e6e73", whiteSpace: "normal" }}>
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
