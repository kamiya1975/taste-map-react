// src/pages/FavoriteStoresPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "../components/ui/PanelHeader";
import {
  loadAndSortStoresByDistance,
  getFavorites,
  setFavorites,
  isSameStore,
} from "../utils/storeShared";

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
    >
      {/* 星アイコン（SVG / currentColor 非依存） */}
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
export default function FavoriteStoresPage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [favorites, setFav] = useState(getFavorites());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 固定（基準ワイン購入）店舗は常に 1 件
  const mainStore = (() => {
    try {
      const raw = localStorage.getItem("main_store");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  // 起動時：favorites から固定店舗を除外（重複抑止）
  useEffect(() => {
    if (!mainStore || !Array.isArray(favorites)) return;
    const cleaned = favorites.filter((s) => !isSameStore(s, mainStore));
    if (cleaned.length !== favorites.length) {
      setFav(cleaned);
      setFavorites(cleaned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const list = await loadAndSortStoresByDistance();
        if (!alive) return;
        setStores(list);
        setErr("");
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setErr("店舗データの読み込みに失敗しました。/stores.mock.json を確認してください。");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggleFavorite = (store) => {
    // 固定店舗はトグル対象外
    if (mainStore && isSameStore(store, mainStore)) return;

    const exists = favorites.some((s) => isSameStore(s, store));
    const next = exists
      ? favorites.filter((s) => !isSameStore(s, store))
      : [store, ...favorites];
    setFav(next);
    setFavorites(next);
  };

  const isFav = (store) => favorites.some((s) => isSameStore(s, store));
  const formatKm = (d) => (Number.isFinite(d) && d !== Infinity ? `${d.toFixed(1)}km` : "—");

  // 固定を重複表示しない
  const otherStores = stores.filter((s) => !mainStore || !isSameStore(s, mainStore));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgb(250,250,250)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
      }}
    >
      <PanelHeader
        title="お気に入り店舗登録"
        onBack={() => navigate(-1)}
        onClose={() => navigate("/map?open=mypage", { replace: true })}
        icon="store.svg"
      />

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          maxWidth: 600,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div style={{ padding: 16 }}>
          {loading && <div style={{ padding: 8 }}>読み込み中…</div>}
          {err && <div style={{ padding: 8, color: "crimson" }}>{err}</div>}

          {/* カード風の白背景ラッパ */}
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 1px 0 rgba(0,0,0,0.05)",
              overflow: "hidden",
              border: "1px solid #eee",
            }}
          >
            {/* 固定店舗（あれば最上段） */}
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
                  {/* 左の濃い★（固定） */}
                  <StarButton active disabled title="固定店舗" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {mainStore.name} {mainStore.branch || ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 2 }}>
                      {formatKm(mainStore.distance)}
                    </div>
                  </div>
                  {/* 右「固定」バッジ */}
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

            {/* 他店舗（★でトグル） */}
            {!loading &&
              !err &&
              otherStores.map((store, i) => {
                const fav = isFav(store);
                return (
                  <div key={store._key}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "14px 14px",
                      }}
                    >
                      <StarButton
                        active={fav}
                        onClick={() => toggleFavorite(store)}
                        title={fav ? "お気に入り解除" : "お気に入り追加"}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, lineHeight: 1.2 }}>
                          {store.name} {store.branch || ""}
                        </div>
                        <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 2 }}>
                          {formatKm(store.distance)}
                        </div>
                      </div>
                    </div>
                    {/* 区切り線（末尾は非表示） */}
                    {i !== otherStores.length - 1 && (
                      <div style={{ height: 1, background: "#eee" }} />
                    )}
                  </div>
                );
              })}

            {/* 空状態 */}
            {!loading && !err && !mainStore && otherStores.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: "#666" }}>
                近隣店舗が見つかりませんでした。
              </div>
            )}
          </div>

          {/* 件数 */}
          {!loading && !err && favorites.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
              登録済み: {favorites.length} 店舗
            </div>
          )}

          {!loading && !err && !mainStore && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#b35367" }}>
              ※固定店舗が未設定です。店舗選択画面で「購入した店舗」を選んでください。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
