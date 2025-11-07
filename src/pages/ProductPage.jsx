// src/ProductPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { requireRatingOrRedirect } from "../utils/auth";
import "../index.css";
import { useCart } from "../components/panels/CartContext";

/** =========================
 *  ユーティリティ
 * ========================= */
const useJanParam = () => {
  const { jan: routeJan } = useParams();
  const location = useLocation();
  return useMemo(() => {
    if (routeJan) return String(routeJan);
    try {
      const url = new URL(window.location.href);
      const byQuery = url.searchParams.get("jan");
      if (byQuery) return String(byQuery);
    } catch {}
    const m = (window.location.hash || "").match(/#\/products\/([^/?#]+)/);
    return m ? m[1] : "";
  }, [routeJan, location]);
};

const postToParent = (payload) => {
  try { window.parent?.postMessage(payload, "*"); } catch {}
};

const clearScanHints = (jan_code) => {
  const keys = ["selectedJAN","lastScannedJAN","scan_last_jan","scanTriggerJAN","scanner_selected_jan"];
  try {
    keys.forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  } catch {}
  try {
    localStorage.setItem("product_page_closed", JSON.stringify({ jan: jan_code, at: Date.now() }));
  } catch {}
};

const notifyParentClosed = (jan_code) => {
  postToParent({ type: "PRODUCT_CLOSED", jan: jan_code, clear: true });
  clearScanHints(jan_code);
  try {
    const bc = new BroadcastChannel("product_bridge");
    bc.postMessage({ type: "PRODUCT_CLOSED", jan: jan_code, clear: true, at: Date.now() });
    bc.close();
  } catch {}
};

// ★ 「飲みたい（favorites）」を即時OFFにするユーティリティ
const forceFavoriteOff = (jan_code) => {
  try {
    const favs = JSON.parse(localStorage.getItem("favorites") || "{}");
    if (favs && favs[jan_code]) {
      delete favs[jan_code];
      localStorage.setItem("favorites", JSON.stringify(favs));
    }
  } catch {}
  try {
    window.postMessage({ type: "SET_FAVORITE", jan: jan_code, value: false }, "*");
  } catch {}
  try {
    postToParent({ type: "SET_FAVORITE", jan: jan_code, value: false });
  } catch {}
};

/** =========================
 *  お気に入りスター（☆/★ 画像版）
 * ========================= */
function HeartButton({ jan_code, size = 28, hidden = false }) {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    const readFav = () => {
      try {
        const obj = JSON.parse(localStorage.getItem("favorites") || "{}");
        setFav(!!obj[jan_code]);
      } catch { setFav(false); }
    };
    readFav();
    const onStorage = (e) => { if (e.key === "favorites") readFav(); };
    const onMsg = (e) => {
      const { type, jan: targetJan, value } = e.data || {};
      if (String(targetJan) !== String(jan_code)) return;
      if (type === "SET_FAVORITE") setFav(!!value);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMsg);
    };
  }, [jan_code]);

  const toggle = () => {
    const favs = JSON.parse(localStorage.getItem("favorites") || "{}");
    if (favs[jan_code]) delete favs[jan_code];
    else favs[jan_code] = { addedAt: new Date().toISOString() };
    localStorage.setItem("favorites", JSON.stringify(favs));
    setFav(!!favs[jan_code]);
    postToParent({ type: "TOGGLE_FAVORITE", jan_code });
  };

  return (
    <button
      aria-label={fav ? "お気に入り解除" : "お気に入りに追加"}
      onClick={toggle}
      disabled={hidden}
      style={{
        border: "none",
        background: "transparent",
        width: size, height: size,
        display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        cursor: hidden ? "default" : "pointer",
        visibility: hidden ? "hidden" : "visible",
      }}
      title={fav ? "お気に入りに登録済み" : "お気に入りに追加"}
    >
      <img
        src={`${process.env.PUBLIC_URL || ""}${fav ? "/img/store.svg" : "/img/store2.svg"}`}
        alt=""
        style={{ width: "100%", height: "100%", display: "block" }}
        draggable={false}
      />
    </button>
  );
}

/** =========================
 *  評価（◎）
 * ========================= */
const CircleRating = ({ value, currentRating, onClick, centerColor = "#000" }) => {
  const outerSize = 40;
  const baseSize = 8;
  const ringGap = 3;
  const ringCount = value + 1;

  return (
    <div
      onClick={() => onClick(value)}
      style={{
        position: "relative",
        width: `${outerSize}px`,
        height: `${outerSize}px`,
        margin: "2px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        boxSizing: "border-box",
      }}
    >
      {[...Array(ringCount)].map((_, i) => {
        const size = baseSize + ringGap * 2 * i;
        const selected = value === currentRating;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${size}px`,
              height: `${size}px`,
              border: `1.5px solid ${selected ? "#000" : "#bbb"}`,
              borderRadius: "50%",
              boxSizing: "border-box",
              backgroundColor:
                i === 0 ? (selected ? centerColor : "rgb(150,150,150)") : "transparent",
            }}
          />
        );
      })}
    </div>
  );
};

function ProductImage({ jan_code, maxHeight = 225 }) {
  const [loaded, setLoaded] = useState(() => {
    const img = new Image();
    img.src = `${process.env.PUBLIC_URL || ""}/img/${jan_code}.png`;
    return img.complete && img.naturalWidth > 0;
  });

  const [src, setSrc] = useState(`${process.env.PUBLIC_URL || ""}/img/${jan_code}.png`);
  const wasCachedRef = React.useRef(false);
  const imgElRef = React.useRef(null);

  const setImgRef = React.useCallback((node) => {
    if (node) wasCachedRef.current = node.complete && node.naturalWidth > 0;
    imgElRef.current = node;
  }, []);

  useEffect(() => {
    setLoaded(false);
    setSrc(`${process.env.PUBLIC_URL || ""}/img/${jan_code}.png`);
  }, [jan_code]);

  useEffect(() => {
    const img = imgElRef.current;
    if (!img) return;

    if (img.complete && img.naturalWidth > 0) {
      setLoaded(true);
      return;
    }
    const onLoad = () => setLoaded(true);
    const onError = () => {
      setLoaded(true);
      setSrc(`${process.env.PUBLIC_URL || ""}/img/placeholder.png`);
    };
    img.addEventListener("load", onLoad, { once: true });
    img.addEventListener("error", onError, { once: true });
    return () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
  }, [src]);

  return (
    <img
      ref={setImgRef}
      src={src}
      alt="商品画像"
      decoding="async"
      loading="eager"
      fetchpriority="high"
      style={{
        maxHeight: maxHeight,
        objectFit: "contain",
        opacity: loaded ? 1 : 0.35,
        transition: wasCachedRef.current ? "none" : "opacity .25s ease",
        WebkitBackfaceVisibility: "hidden",
        transform: "translateZ(0)",
      }}
    />
  );
}

/** =========================
 *  商品説明セクション（末尾余白込み）
 * ========================= */
function ProductInfoSection() {
  return (
    <div
      className="pb-safe"
      style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* ここはダミーの説明文。必要に応じて実データに置換 */}
      <div style={{ marginTop: 20, fontSize: 14, lineHeight: 1.6 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>ひと口で広がる華やかな香りと余韻</div>
        <div>…（略）…</div>
      </div>
      <div style={{ height: 20 }} />
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>伝統と革新が息づく情熱の造り手</div>
        <div>…（略）…</div>
      </div>
      <div style={{ height: 20 }} />
      <div
        style={{
          marginTop: 24,
          paddingTop: 8,
          paddingBottom: 8,
          borderTop: "1px solid #ccc",
          borderBottom: "1px solid #ccc",
          marginBottom: 0,
        }}
      >
        <div style={{ fontSize: 14, lineHeight: 1.9 }}>
          {[
            ["タイプ", "赤ワイン"],
            ["商品名", "（サンプル）"],
            ["容量", "750ml"],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", marginTop: 2 }}>
              <div style={{ width: 96, flexShrink: 0 }}>{label}</div>
              <div style={{ flex: 1 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 100 }} />
    </div>
  );
}

/** =========================
 *  ProductPage（default export）
 * ========================= */
export default function ProductPage() {
  const navigate = useNavigate();
  const jan_code = useJanParam();
  const [product, setProduct] = useState(null);
  const [rating, setRating] = useState(0);
  const [adding, setAdding] = useState(false);

  // ★ CartContext（ローカル積み → カートで同期）
  const { addItem, totalQuantity, shopReady } = useCart();

  // 画面オープン/クローズ通知
  useEffect(() => {
    postToParent({ type: "PRODUCT_OPENED", jan: jan_code });
    postToParent({ type: "REQUEST_STATE", jan: jan_code });
    const onBeforeUnload = () => notifyParentClosed(jan_code);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      notifyParentClosed(jan_code);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [jan_code]);

  // 商品データ/評価のロード
  useEffect(() => {
    let alive = true;
    const normJAN = (d) =>
      String(d?.jan_code ?? d?.jan ?? d?.code ?? d?.barcode ?? "").trim();
    const load = async () => {
      let dataArr = [];
      try { dataArr = JSON.parse(localStorage.getItem("umapData") || "[]"); } catch {}
      let found = Array.isArray(dataArr)
        ? dataArr.find((d) => normJAN(d) === String(jan_code).trim())
        : null;
      if (!found) {
        try {
          const url = `${process.env.PUBLIC_URL || ""}/umap_coords_c.json`;
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            const arr = Array.isArray(json) ? json : [];
            found = arr.find((d) => normJAN(d) === String(jan_code).trim()) || null;
            try { localStorage.setItem("umapData", JSON.stringify(arr)); } catch {}
          }
        } catch (e) {
          console.warn("umap_coords_c.json の読込に失敗:", e);
        }
      }
      if (!alive) return;
      setProduct(found || null);
      try {
        const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
        if (ratings[jan_code]) setRating(ratings[jan_code].rating ?? 0);
      } catch {}
    };
    load();
    return () => { alive = false; };
  }, [jan_code]);

  useEffect(() => {
    const onMsgSnapshot = (e) => {
      const { type, jan: targetJan, rating: ratingPayload } = e.data || {};
      if (type !== "STATE_SNAPSHOT") return;
      if (String(targetJan) !== String(jan_code)) return;
      try { setRating(Number(ratingPayload?.rating) || 0); } catch {}
    };
    window.addEventListener("message", onMsgSnapshot);
    return () => window.removeEventListener("message", onMsgSnapshot);
  }, [jan_code]);

  useEffect(() => {
    const onMsgSet = (e) => {
      const { type, jan: targetJan, rating: payload } = e.data || {};
      if (type !== "SET_RATING") return;
      if (String(targetJan) !== String(jan_code)) return;
      const next = payload && Number(payload?.rating) > 0 ? Number(payload.rating) : 0;
      setRating(next);
      try {
        const store = JSON.parse(localStorage.getItem("userRatings") || "{}");
        if (next > 0) store[jan_code] = { rating: next, date: payload?.date || new Date().toISOString() };
        else delete store[jan_code];
        localStorage.setItem("userRatings", JSON.stringify(store));
      } catch {}
    };
    window.addEventListener("message", onMsgSet);
    return () => window.removeEventListener("message", onMsgSet);
  }, [jan_code]);

  const handleCircleClick = async (value) => {
    if (!requireRatingOrRedirect(navigate, "/my-account")) return;
    const newRating = value === rating ? 0 : value;
    setRating(newRating);
    const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
    let payload = null;
    if (newRating === 0) {
      delete ratings[jan_code];
    } else {
      payload = { rating: newRating, date: new Date().toISOString() };
      ratings[jan_code] = payload;
      forceFavoriteOff(jan_code);
    }
    localStorage.setItem("userRatings", JSON.stringify(ratings));
    postToParent({ type: "RATING_UPDATED", jan: jan_code, payload });
  };

  if (!product) return <div style={{ padding: 16 }}>商品が見つかりませんでした。</div>;

  const price = product.希望小売価格 ?? product.価格 ?? 1800;

  // タイプ色
  const typeColors = { Spa: "#6BAED6", White: "#D9D76C", Red: "#8B2E3B", Rose: "#E48E8E", Other: "#CCCCCC" };
  const typeColor = typeColors[product.Type] || typeColors.Other;

  // ★ カート追加（ローカルに積む → カートで同期）
  const handleAddToCart = async () => {
    try {
      setAdding(true);
      await addItem({
        jan: jan_code,
        title: product.商品名 || "(無題)",
        price: Number(price) || 0,
        qty: 1,
        imageUrl: `${process.env.PUBLIC_URL || ""}/images/products/${jan_code}.jpg`,
      });
      // 親（MapPage）に「カート開いて」の合図（任意）
      try { window.parent?.postMessage({ type: "OPEN_CART" }, "*"); } catch {}
      alert("カートに追加しました。");
    } catch (e) {
      alert(`追加に失敗: ${e?.message || e}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="pb-safe fill-screen"
      style={{
        height: "100%",
        overflow: "auto",
        WebkitOverflowScrolling: "touch",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        maxWidth: 500,
        margin: "0 auto",
        padding: 16,
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* 商品画像 */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <ProductImage jan_code={jan_code} maxHeight={225} />
      </div>

      {/* 商品名 */}
      <h2 style={{ margin: "8px 0", fontWeight: "bold", fontSize: 16 }}>
        {product.商品名 || "（名称不明）"}
      </h2>

      {/* タイプマーク＋価格 */}
      <div style={{ display: "flex", alignItems: "center", margin: "4px 0 12px 0" }}>
        <span
          style={{
            width: 16,
            height: 16,
            backgroundColor: typeColor,
            borderRadius: 4,
            marginRight: 8,
            display: "inline-block",
          }}
        />
        <span style={{ marginLeft: 8 }}>¥{Number(price).toLocaleString()}</span>
      </div>

      {/* ★ カートに入れる */}
      <div style={{ margin: "8px 0 16px" }}>
        <button
          onClick={handleAddToCart}
          disabled={adding}
          style={{
            display: "inline-block",
            width: "100%",
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid #111",
            background: adding ? "#eee" : "#111",
            color: adding ? "#999" : "#fff",
            cursor: adding ? "default" : "pointer",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          🛒 カートに入れる
        </button>
      </div>

      {/* 評価（◎） */}
      <div style={{ marginTop: 24, paddingTop: 8, paddingBottom: 8, borderTop: "1px solid #ccc", borderBottom: "1px solid #ccc" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* 左：お気に入り */}
          <div style={{ flex: "0 0 64px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6px 4px" }}>
            <div style={{ fontSize: 12, color: "#666", alignSelf: "flex-start", lineHeight: 1, position: "relative", top: "-11px", marginLeft: "10px" }}>
              {"飲みたい"}
            </div>
            <HeartButton jan_code={jan_code} size={28} hidden={rating > 0} />
          </div>
          <div style={{ width: 1, background: "#d9d9d9", marginLeft: "4px", marginRight: "12px", alignSelf: "stretch" }} />
          {/* 右：◎ */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: "#666", padding: "0 4px", marginBottom: 6 }}>
              <span style={{ flex: 1, textAlign: "center", marginLeft: -175 }}>イマイチ</span>
              <span style={{ flex: "0 0 60px", textAlign: "right", marginLeft: 0 }}>好き</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, paddingRight: 4, maxWidth: 320 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <CircleRating key={v} value={v} currentRating={rating} onClick={handleCircleClick} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 説明 */}
      <ProductInfoSection />
    </div>
  );
}
