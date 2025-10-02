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

export default function FavoriteStoresPage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [favorites, setFav] = useState(getFavorites());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // ✅ IntroPage で決定した基準店舗を localStorage から取得
  const mainStore = (() => {
    try {
      const raw = localStorage.getItem("main_store");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

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
    const exists = favorites.some((s) => isSameStore(s, store));
    const next = exists
      ? favorites.filter((s) => !isSameStore(s, store))
      : [store, ...favorites];
    setFav(next);
    setFavorites(next);
  };

  const isFav = (store) => favorites.some((s) => isSameStore(s, store));

  const formatKm = (d) =>
    Number.isFinite(d) && d !== Infinity ? `${d.toFixed(1)}km` : "—";

  // ✅ 固定店舗を stores から外す（重複表示防止）
  const otherStores = stores.filter(
    (s) => !mainStore || !isSameStore(s, mainStore)
  );

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
        icon="/img/store.svg"
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
          <p style={{ margin: "6px 0 12px", fontSize: 14, color: "#333" }}>
            基準ワインを購入した店舗は最上位に固定されます。
            そのほかにお気に入り店舗を登録できます。
          </p>

          {loading && <div style={{ padding: 8 }}>読み込み中…</div>}
          {err && <div style={{ padding: 8, color: "crimson" }}>{err}</div>}

          {/* ✅ 固定店舗 */}
          {mainStore && (
            <div
              key={"main"}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 10px",
                borderBottom: "1px solid #eee",
                alignItems: "flex-start",
                background: "#fff",
                borderRadius: 10,
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 600 }}>
                  {mainStore.name} {mainStore.branch || ""}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6e6e73",
                    marginTop: 2,
                  }}
                >
                  固定店舗
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#333" }}>
                {formatKm(mainStore.distance)}
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #b35367",
                  background: "rgba(241,202,210,.6)",
                  fontSize: 13,
                  minWidth: 80,
                  textAlign: "center",
                  color: "#000",
                }}
              >
                固定
              </div>
            </div>
          )}

          {/* ✅ 通常の店舗リスト */}
          {!loading &&
            !err &&
            otherStores.map((store) => {
              const fav = isFav(store);
              return (
                <div
                  key={store._key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px 10px",
                    borderBottom: "1px solid #eee",
                    alignItems: "flex-start",
                    background: "#fff",
                    borderRadius: 10,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontWeight: 600 }}>
                      {store.name} {store.branch || ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 12, color: "#333" }}>
                      {formatKm(store.distance)}
                    </div>
                    <button
                      onClick={() => toggleFavorite(store)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: fav ? "1px solid #b35367" : "1px solid #ccc",
                        background: fav ? "rgba(241, 202, 210, .6)" : "#fff",
                        color: "#000",
                        fontSize: 13,
                        cursor: "pointer",
                        minWidth: 80,
                      }}
                    >
                      {fav ? "解除" : "追加"}
                    </button>
                  </div>
                </div>
              );
            })}

          {!loading && !err && favorites.length > 0 && (
            <div style={{ marginTop: 18, fontSize: 12, color: "#555" }}>
              登録済み: {favorites.length} 店舗
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
