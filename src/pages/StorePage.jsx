// src/pages/StorePage.jsx
import React, {
  useEffect,
  useState,
  useRef,
  useLayoutEffect,
  useCallback,   // ★追加
} from "react";
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

/* ========= 本体 ========= */
export default function StorePage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(0);

  // ★ 位置情報NG時の「再取得ボタン」表示フラグ
  const [showRetry, setShowRetry] = useState(false);

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

  // ★ 店舗取得処理を useCallback 化 → ボタンからも呼べるようにする
  const run = useCallback(async () => {
    setLoading(true);
    setErr("");
    setShowRetry(false); // 毎回いったん隠す

    const token = localStorage.getItem("app.access_token");

    if (!token) {
      setStores([]);
      setErr(
        "ログイン情報が見つかりません。マイページからログインしてからお試しください。"
      );
      setLoading(false);
      setShowRetry(false);
      return;
    }

    try {
      const loc = await resolveLocation();
      const locAllowed = !!(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon));

      // ★ 位置情報が取れなかった場合は再試行ボタンを表示
      setShowRetry(!locAllowed);

      const params = new URLSearchParams();
      if (locAllowed) {
        params.set("user_lat", String(loc.lat));
        params.set("user_lon", String(loc.lon));
      }

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
      console.log("[StorePage] raw stores:", raw);
      const list = Array.isArray(raw) ? raw : [];

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

      enriched.sort((a, b) => a.distance - b.distance);

      // ★ 位置情報NGなら EC(id=1) だけ残す
      const finalStores = locAllowed ? enriched : enriched.filter((s) => s.id === 1);

      setStores(finalStores);

      try {
        localStorage.setItem("allStores", JSON.stringify(finalStores));
      } catch {}
    } catch (e) {
      console.error(e);
      setErr(
        "店舗データの読み込みに失敗しました。しばらく経ってから再度お試しください。"
      );
      setShowRetry(false); // 通信エラー時はボタンも隠す
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    run();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [run]);

  const formatKm = (d, id) => {
    if (id === 1) return ""; // EC は非表示
    if (Number.isFinite(d) && d !== Infinity) {
      return `${d.toFixed(1)}km`;
    }
    return "";
  };

  const handleStoreSelect = (store) => {
    try {
      localStorage.setItem("selectedStore", JSON.stringify(store));
      localStorage.setItem("main_store", JSON.stringify(store));

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
        position: "relative", // ★オーバーレイ用
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
          {/* ★追記文 */}
          <p style={{ marginTop: 8, fontSize: 12, color: "#555", lineHeight: 1.5 }}>
            購入した店舗が表示されない場合は、<br />
            「TasteMap公式Shop」を選択してください。
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
                <div style={{ fontSize: 12, color: "#6e6e73", whiteSpace: "normal" }}>
                  {store.address || ""} {store.genre ? ` / ${store.genre}` : ""}
                </div>
              </div>
              <div style={{ marginLeft: 12 }}>
                {formatKm(store.distance, store.id)}
              </div>
            </div>
          ))}
      </div>

      {/* ★ 位置情報NG時の「もう一度、違い店舗を探す」オーバーレイ */}
      {showRetry && !loading && !err && (
        <div
          style={{
            position: "fixed",              // 画面中央に固定
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 200,
            textAlign: "center",
            padding: "16px 20px",
            background: "rgba(255,255,255,0.96)",
            borderRadius: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <p style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
            位置情報が取得できませんでした。<br />
            「もう一度、違い店舗を探す」を押して再度お試しください。
          </p>
          <button
            onClick={run}
            style={{
              padding: "10px 24px",
              fontSize: 16,
              fontWeight: 700,
              background: "rgb(230,227,219)", // カートボタンと同系
              color: "#000",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            }}
          >
            もう一度、違い店舗を探す
          </button>
        </div>
      )}
    </div>
  );
}
