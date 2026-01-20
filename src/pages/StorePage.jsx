// src/pages/StorePage.jsx
// メイン店舗選択画面
import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { OFFICIAL_STORE_ID } from "../ui/constants";

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
        const locAllowed =
          !!(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon));

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

        // API からの店舗情報を整形（※順番はAPIのまま利用）
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
            ec_active: !!s.ec_active, // ★追加：公式Shop/EC連携可否を保持
            updated_at: s.updated_at,
            business_hours: s.business_hours ?? "",
            holiday_text: s.holiday_text ?? "",
            intro_text: s.intro_text ?? "",
            branch: "",
            address: "",
            genre: "",
            _key: `${s.store_id}@@${i}`,
          };
        });

        // ★ ここでは再ソートしない（バックエンドが
        //    「公式Shop(OFFICIAL_STORE_ID) 最上段 → それ以外距離順」
        //    を保証している前提）
        const finalStores = enriched;

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

  const formatKm = (d /*, id */) => {
    if (Number.isFinite(d) && d !== Infinity) {
      return `${d.toFixed(1)}km`;
    }
    return "";
  };

  const renderStoreDetails = (store) => {
    if (!store) return null;
    const bh = String(store.business_hours || "").trim();
    const hol = String(store.holiday_text || "").trim();
    const intro = String(store.intro_text || "").trim();
    if (!bh && !hol && !intro) return null;
    return (
      <div
        style={{
          fontSize: 12,
          color: "#6e6e73",
          marginTop: 6,
          lineHeight: 1.4,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {bh && <div>営業時間：{bh}</div>}
        {hol && <div>定休日：{hol}</div>}
        {intro && <div>{intro}</div>}
      </div>
    );
  };

  const handleStoreSelect = (store) => {
    try {
      localStorage.setItem("selectedStore", JSON.stringify(store));
      localStorage.setItem("main_store", JSON.stringify(store));

      if (store && store.id !== undefined && store.id !== null) {
        localStorage.setItem("app.main_store_id", String(store.id));
        localStorage.setItem("store.mainStoreId", String(store.id)); // 互換用
      }

      const all = JSON.parse(localStorage.getItem("allStores") || "[]");
      const k = (s) => `${s?.name || ""}@@${s?.branch || ""}`;
      const exists = all.some((s) => k(s) === k(store));
      const next = exists ? all : [store, ...all];
      localStorage.setItem("allStores", JSON.stringify(next));
      window.dispatchEvent(new Event("tm_store_changed"));
    } catch {}

    navigate("/slider", { state: { selectedStore: store } });
  };

  const displayName = (store) => {
    if (store.id === OFFICIAL_STORE_ID) {
      return "TasteMap公式Shop";
    }
    return `${store.name} ${store.branch || ""}`;
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
        {err && <div style={{ padding: 16, color: "crimson" }}>{err}</div>}

        {!loading &&
          !err &&
          stores.map((store) => (
            <React.Fragment key={store._key}>
              <div
                onClick={() => handleStoreSelect(store)}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #eee",
                  cursor: "pointer",
                  background: "#fff",
                }}
              >
                {/* 1) 店名（1行・全幅） */}
                <div
                  className="store-link"
                  style={{
                    whiteSpace: "normal",   // 折り返す
                    wordBreak: "break-word" // 長い単語があっても折れる
                  }}
                >
                  {displayName(store)}
                </div>

                {/* 2) 距離（全幅の下段） */}
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "#6e6e73",
                    textAlign: "left",
                  }}
                >
                  {formatKm(store.distance)}
                </div>

                {/* 3) 住所など（任意：今は空が多いので残すなら下に） */}
                {(store.address || store.genre) && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: "#6e6e73",
                      whiteSpace: "normal",
                    }}
                  >
                    {store.address || ""} {store.genre ? ` / ${store.genre}` : ""}
                  </div>
                )}

                {/* 4) 営業時間/定休日/紹介（全幅） */}
                {renderStoreDetails(store)}
              </div>

              {/* ★ 位置情報NG時は、公式Shop(id=1) の下に説明メッセージ */}
              {locFailed && store.id === OFFICIAL_STORE_ID && (
                <div
                  style={{
                    padding: "8px 16px 16px",
                    fontSize: 12,
                    color: "#555",
                    background: "rgb(250,250,250)",
                  }}
                >
                  位置情報が取得できず、近くの店舗を表示できません。
                  <br />
                  端末の「設定」から位置情報取得を許可するか、
                  <br />
                  許可が難しい場合は、TasteMap公式Shopをお選びください。
                </div>
              )}
            </React.Fragment>
          ))}
      </div>
    </div>
  );
}
