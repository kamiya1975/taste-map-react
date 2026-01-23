// src/pages/StorePage.jsx
// メイン店舗選択画面
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OFFICIAL_STORE_ID } from "../ui/constants";
import { setCurrentMainStoreId } from "../utils/store";

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

  // ---- StorePageではスクロールロックを解除（Map系の副作用対策） ----
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
    };

    html.style.overflow = "auto";
    html.style.height = "auto";
    body.style.overflow = "auto";
    body.style.height = "auto";
    body.style.position = "static";
    body.style.width = "auto";

    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      body.style.position = prev.bodyPosition;
      body.style.width = prev.bodyWidth;
    };
  }, []);
  // ここまで スクロール対策 2026.01.

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
            ec_active: !!s.ec_active, // 追加：公式Shop/EC連携可否を保持
            updated_at: s.updated_at,
            business_hours: s.business_hours ?? "",
            holiday_text: s.holiday_text ?? "",
            intro_text: s.intro_text ?? "",
            store_prefectures: s.store_prefectures ?? "",
            store_address: s.store_address ?? "",
            branch: "",
            address: "",
            genre: "",
            _key: `${s.store_id}@@${i}`,
          };
        });

        // ここでは再ソートしない（バックエンドが
        // 「公式Shop(OFFICIAL_STORE_ID) 最上段 → それ以外距離順」を保証している前提    
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
    const pref = String(store.store_prefectures || "").trim();
    const addr = String(store.store_address || "").trim();
    const fullAddr = `${pref}${addr}`.trim();
    const bh = String(store.business_hours || "").trim();
    const hol = String(store.holiday_text || "").trim();
    const intro = String(store.intro_text || "").trim();
    if (!fullAddr && !bh && !hol && !intro) return null;
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
        {fullAddr && <div>{fullAddr}</div>}
        {bh && <div>営業時間：{bh}</div>}
        {hol && <div>定休日：{hol}</div>}
        {intro && <div>{intro}</div>}
      </div>
    );
  };

  const handleStoreSelect = (store) => {
    try {
      // まず正キーへ保存（欠損を作らないのが最優先）
      setCurrentMainStoreId(store?.id);

      // 以前の安定挙動に戻す：selectedStore も保存（JSONで）
      // MapPage の getCurrentMainStoreEcActiveFromStorage() が参照する
      try {
        localStorage.setItem("selectedStore", JSON.stringify(store));
      } catch {}

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
      return "TasteMap 公式EC shop";
    }
    return `${store.name} ${store.branch || ""}`;
  };

  return (
    <div style={{ fontFamily: "sans-serif", background: "rgb(250,250,250)" }}>
      {/* 全体スクロール（固定なし） */}
      <div
        style={{
          maxWidth: 500,
          margin: "0 auto",
         paddingBottom: 24,
        }}
      >
        {/* ヘッダ（固定しない） */}
        <div style={{ padding: "70px 16px 30px" }}>
          <h2 className="store-header" style={{ margin: 0 }}>
            基準のワインを購入した店舗を選択
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
            「TasteMap 公式EC shop」をお選びください。
          </p>
        </div>
        <div style={{ height: 1, background: "#ccc" }} />

        {/* リスト（同じスクロール領域の中） */}
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
                {/* 店名 */}
                <div
                  className="store-link"
                  style={{
                    whiteSpace: "normal",   // 折り返す
                    wordBreak: "break-word" // 長い単語があっても折れる
                  }}
                >
                  {displayName(store)}
                </div>

                {/* 距離 */}
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

                {/* 住所 */}
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

                {/* 営業時間/定休日/紹介 */}
                {renderStoreDetails(store)}
              </div>
            </React.Fragment>
          ))}
        {/* 位置情報NGメッセージ：全店舗の「下」に1回だけ表示 */}
        {!loading && !err && locFailed && (
          <div
            style={{
              padding: "12px 16px 16px",
              fontSize: 12,
              color: "#555",
              background: "rgb(250,250,250)",
            }}
          >
            位置情報が取得できず、近くの店舗を表示できません。
            <br />
            端末の「設定」から位置情報取得を許可するか、
            <br />
            許可が難しい場合は、TasteMap 公式EC shopをお選びください。
          </div>
        )}
      </div>
    </div>
  );
}
