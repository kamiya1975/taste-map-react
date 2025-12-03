// src/components/panels/StorePanelContent.jsx
import React, { useEffect, useState } from "react";
import { OFFICIAL_STORE_ID } from "../../ui/constants";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

/* ============ 位置情報ユーティリティ ============ */
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
  return geo; // 失敗時は null
}

// ★ ページ全体をリロードする共通処理
const reloadApp = () => {
  try {
    window.location.replace(window.location.href);
  } catch {
    window.location.reload();
  }
};

/* ============ 小物：★ボタン ============ */
function StarButton({ active, onClick, disabled = false, size = 20, title }) {
  const color = disabled ? "rgb(179,83,103)" : active ? "rgb(179,83,103)" : "rgb(190,190,190)";
  const fill = active || disabled ? color : "transparent";
  const stroke = active || disabled ? color : "rgb(170,170,170)";

  return (
    <button
      aria-label={title || (active ? "お気に入り解除" : "お気に入り追加")}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: size + 6,
        height: size + 6,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
      title={title}
    >
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path
          d="M12 2.6l2.93 5.93 6.55.95-4.74 4.62 1.12 6.52L12 17.9 6.14 20.62 7.26 14.1 2.52 9.48l6.55-.95L12 2.6z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/* ============ 本体 ============ */
export default function StorePanelContent() {
  const [stores, setStores] = useState([]); // {id, name, distance, is_main, is_sub}
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savingId, setSavingId] = useState(null);

  const formatKm = (d /* , id */) => {
    if (Number.isFinite(d) && d !== Infinity) {
      return `${d.toFixed(1)}km`;
    }
    return "";
  };

  useEffect(() => {
    let alive = true;

    const fetchStores = async () => {
      setLoading(true);
      setErr("");

      const token = localStorage.getItem("app.access_token");

      // トークンなし → ログインを促す
      if (!token) {
        if (alive) {
          setStores([]);
          setErr(
            "お気に入り店舗登録の更新にはログインが必要です。マイアカウントからログインしてから再度お試しください。"
          );
          setLoading(false);
        }
        return;
      }

      try {
        const loc = await resolveLocation();
        const locAllowed = !!(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon));

        const params = new URLSearchParams();
        if (locAllowed) {
          params.set("user_lat", String(loc.lat));
          params.set("user_lon", String(loc.lon));
        }

        const url = `${API_BASE}/api/app/sub-stores/selector?${params.toString()}`;
        console.log("[StorePanel] fetch:", url);

        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          console.error("[StorePanel] selector error", res.status);
          throw new Error("FETCH_FAILED");
        }

        const raw = await res.json();
        console.log("[StorePanel] raw selector:", raw);

        const list = Array.isArray(raw) ? raw : [];

        // 距離情報整形
        const mapped = list.map((s, idx) => {
          const rawD = s.distance_km;
          const numD = rawD === null || rawD === undefined ? NaN : Number(rawD);
          const d = Number.isFinite(numD) ? numD : Infinity;

          return {
            id: s.store_id,
            name: s.store_name,
            distance: d, // 並べ替え用
            distance_km: numD, // 生の値（参考）
            is_main: !!s.is_main,
            is_sub: !!s.is_sub,
            updated_at: s.updated_at,
            _key: `${s.store_id}@@${idx}`,
          };
        });

        // ★ 仕様：メイン店舗は別枠で固定表示
        // それ以外は距離昇順にソートして、そのまま下に並べる
        mapped.sort((a, b) => a.distance - b.distance);

        if (alive) {
          setStores(mapped);
          setErr("");
        }
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setErr(
          "店舗データの読み込みに失敗しました。しばらく経ってから再度お試しください。"
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchStores();

    const handleAuthChanged = () => {
      fetchStores();
    };
    window.addEventListener("tm_auth_changed", handleAuthChanged);

    return () => {
      alive = false;
      window.removeEventListener("tm_auth_changed", handleAuthChanged);
    };
  }, []);

  // ★ メイン店舗（公式Shop を含めて固定表示）
  const mainStore = stores.find((s) => s.is_main) || null;

  // ★ メイン店舗以外 ＋ 公式Shop(id=1) は除外 → サブ候補一覧
  const otherStores = stores.filter(
    (s) => !s.is_main && s.id !== OFFICIAL_STORE_ID
  );

  const favoritesCount = stores.filter((s) => s.is_sub).length;

  const toggleFavorite = async (store) => {
    if (store.is_main) return; // メイン店舗はトグル不可
    if (savingId !== null) return;

    const token = localStorage.getItem("app.access_token");
    if (!token) {
      alert(
        "お気に入り店舗登録の更新にはログインが必要です。マイアカウントからログインしてから再度お試しください。"
      );
      return;
    }

    try {
      const nextActive = !store.is_sub;
      setSavingId(store.id);

      const res = await fetch(`${API_BASE}/api/app/sub-stores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          store_id: store.id,
          is_active: nextActive,
        }),
      });

      if (!res.ok) {
        console.error("[StorePanel] upsert error", res.status);
        throw new Error("UPSERT_FAILED");
      }

      setStores((prev) =>
        prev.map((s) =>
          s.id === store.id ? { ...s, is_sub: nextActive } : s
        )
      );

      // サブ店舗更新 → allowed-jans 取り直しのためアプリ全体リロード
      reloadApp();
    } catch (e) {
      console.error(e);
      alert(
        "店舗の登録更新に失敗しました。通信状況をご確認のうえ、再度お試しください。"
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      {loading && <div style={{ padding: 8 }}>読み込み中…</div>}
      {err && <div style={{ padding: 8, color: "crimson" }}>{err}</div>}

      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 1px 0 rgba(0,0,0,0.05)",
          overflow: "hidden",
          border: "1px solid #eee",
        }}
      >
        {/* 最上位：メイン店舗（公式Shop を含めて固定表示） */}
        {mainStore && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "14px 14px",
              }}
            >
              <StarButton active disabled title="固定店舗" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {mainStore.name}
                </div>
                <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 2 }}>
                  {formatKm(mainStore.distance)}
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 8,
                  color: "#000",
                  lineHeight: 1.6,
                  userSelect: "none",
                }}
              >
                固定
              </div>
            </div>
            <div style={{ height: 1, background: "#eee" }} />
          </>
        )}

        {/* 2段目以降：メイン以外を距離順で表示（公式Shopは除外済み） */}
        {!loading &&
          !err &&
          otherStores.map((store, i) => {
            const fav = store.is_sub;
            const disabled = savingId === store.id;
            return (
              <div key={store._key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "14px 14px",
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  <StarButton
                    active={fav}
                    onClick={() => toggleFavorite(store)}
                    disabled={disabled}
                    title={fav ? "サブ店舗から外す" : "サブ店舗として登録"}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, lineHeight: 1.2 }}>
                      {store.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6e6e73",
                        marginTop: 2,
                      }}
                    >
                      {formatKm(store.distance)}
                    </div>
                  </div>
                </div>
                {i !== otherStores.length - 1 && (
                  <div style={{ height: 1, background: "#eee" }} />
                )}
              </div>
            );
          })}

        {!loading && !err && !mainStore && otherStores.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: "#666" }}>
            近隣店舗が見つかりませんでした。
          </div>
        )}
      </div>

      {!loading && !err && favoritesCount > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
          登録済みサブ店舗: {favoritesCount} 店舗
        </div>
      )}

      {!loading && !err && !mainStore && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#b35367" }}>
          ※固定店舗が未設定です。店舗選択画面で「購入した店舗」を選んでください。
        </div>
      )}
    </div>
  );
}
