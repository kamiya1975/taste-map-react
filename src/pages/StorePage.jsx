// src/pages/StorePage.jsx
import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

/* ========= 位置情報取得ユーティリティ ========= */
// 成功: { lat, lon } / 失敗・拒否: null
async function resolveLocation() {
  const geo = await new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
  return geo;
}

// ★ 公式Shop（EC）用の仮想店舗エントリ（id=0）
const EC_STORE_ENTRY = {
  id: 0,
  name: "TasteMap公式Shop",
  distance: Infinity,
  distance_km: null,
  is_main: false,
  updated_at: null,
  branch: "",
  address: "",
  genre: "",
  _key: "ec@@0",
};

/* ========= 本体 ========= */
export default function StorePage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [locFailed, setLocFailed] = useState(false); // 位置情報NGフラグ

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
      setLoading(true);
      setErr("");

      // ログイントークンは「あるなら使う」程度
      const token = localStorage.getItem("app.access_token") || null;

      try {
        const loc = await resolveLocation();
        const locAllowed = !!(
          loc &&
          Number.isFinite(loc.lat) &&
          Number.isFinite(loc.lon)
        );

        // 位置情報が取れたかどうかを保存
        setLocFailed(!locAllowed);

        const params = new URLSearchParams();
        if (locAllowed) {
          params.set("user_lat", String(loc.lat));
          params.set("user_lon", String(loc.lon));
        }

        const url = `${API_BASE}/api/app/stores?${params.toString()}`;
        console.log("[StorePage] fetch:", url);

        const headers = {
          Accept: "application/json",
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(url, {
          method: "GET",
          headers,
        });

        if (!res.ok) {
          console.error("[StorePage] /api/app/stores error", res.status);
          throw new Error("FETCH_FAILED");
        }

        const raw = await res.json();
        console.log("[StorePage] raw stores:", raw);
        const list = Array.isArray(raw) ? raw : [];

        // API からの店舗情報を整形
        const enriched = list.map((s, i) => {
          const rawD = s.distance_km;
          const numD =
            rawD === null || rawD === undefined ? NaN : Number(rawD);
          const d = Number.isFinite(numD) ? numD : Infinity;

          return {
            id: s.store_id,
            name: s.store_name,
            distance: d,
            distance_km: numD,
            is_main: !!s.is_main,
            updated_at: s.updated_at,
            branch: "",
            address: "",
            genre: "",
            _key: `${s.store_id}@@${i}`,
          };
        });

        // 距離順ソート（位置情報が取れなかった店舗は Infinity で末尾へ）
        enriched.sort((a, b) => a.distance - b.distance);

        // ★ 公式Shop（EC, id=0）を先頭に差し込む
        const finalStores = [
          EC_STORE_ENTRY,
          ...enriched.filter((s) => s.id !== 0), // 念のため0を除外
        ];

        setStores(finalStores);

        try {
          localStorage.setItem("allStores", JSON.stringify(finalStores));
        } catch {}
      } catch (e) {
        console.error(e);
        setErr(
          "店舗データの読み込みに失敗しました。しばらく経ってから再度お試しください。"
        );
      } finally {
        setLoading(false);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    run();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const formatKm = (d, id) => {
    // ★ EC(id=0) は距離表示なし
    if (id === 0) return "";
    if (Number.isFinite(d) && d !== Infinity) {
      return `${d.toFixed(1)}km`;
    }
    return "";
  };

  const handleStoreSelect = (store) => {
    try {
      localStorage.setItem("selectedStore", JSON.stringify(store));
      localStorage.setItem("main_store", JSON.stringify(store));

      // ★ id=0 も正しく保存されるように判定を修正
      if (store && store.id !== undefined && store.id !== null) {
        localStorage.setItem("app.main_store_id", String(store.id));
        localStorage.setItem("store.mainStoreId", String(store.id)); // 互換用
      }

      const all = JSON.parse(localStorage.getItem("allStores") || "[]");
      const k = (s) => `${s?.name || ""}@@${s?.branch || ""}`;
      const exists = all.some((s) => k(s) === k(store));
      const next = exists ? all : [store, ...all];
      localStorage.setItem("allStores", JSON.stringify(next));
    } catch {}

    navigate("/slider", { state: { selectedStore: store } });
  };

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        height: "100vh",
        overflow: "hidden",
      }}
    >
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
            購入した店舗を選択してください。
          </h2>
          <p
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "#555",
              lineHeight: 1.5,
            }}
          >
            購入した店舗がない場合は、
            <br />
            TasteMap公式Shopをお選びください。
          </p>
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
        {err && (
          <div style={{ padding: 16, color: "crimson" }}>{err}</div>
        )}

        {!loading &&
          !err &&
          stores.map((store) => (
            <React.Fragment key={store._key}>
              <div
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
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6e6e73",
                      whiteSpace: "normal",
                    }}
                  >
                    {store.address || ""}{" "}
                    {store.genre ? ` / ${store.genre}` : ""}
                  </div>
                </div>
                <div style={{ marginLeft: 12 }}>
                  {formatKm(store.distance, store.id)}
                </div>
              </div>

              {/* ★ 位置情報NG時は、EC(id=0) の下に説明メッセージ */}
              {locFailed && store.id === 0 && (
                <div
                  style={{
                    padding: "8px 16px 16px",
                    fontSize: 12,
                    color: "#555",
                    background: "rgb(250,250,250)",
                  }}
                >
                  購入した店舗が表示されない場合は、
                  <br />
                  端末の「設定」から、位置情報取得の許可をしてください。
                  <br />
                  位置情報の許可が難しい場合は、TasteMap公式Shopを選択してください。
                </div>
              )}
            </React.Fragment>
          ))}
      </div>
    </div>
  );
}
