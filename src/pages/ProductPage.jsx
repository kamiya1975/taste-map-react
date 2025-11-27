// src/ProductPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import "../index.css";
import { useSimpleCart } from "../cart/simpleCart";
import { postRating } from "../lib/appRatings";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";
const PUBLIC_BASE = process.env.PUBLIC_URL || "";

/** =========================
 *  ユーティリティ
 * ========================= */
const useJanParam = () => {
  const { jan: routeJan } = useParams();
  const { search, hash } = useLocation();
  return useMemo(() => {
    if (routeJan) return String(routeJan);
    try {
      const params = new URLSearchParams(search);
      const byQuery = params.get("jan");
      if (byQuery) return String(byQuery);
    } catch {}
    const m = (hash || "").match(/#\/products\/([^/?#]+)/);
    return m ? m[1] : "";
  }, [routeJan, search, hash]);
};

const postToParent = (payload) => {
  try {
    window.parent?.postMessage(payload, "*");
  } catch {}
};

// アプリ側ログイン確認（access token 有無）
const isAppLoggedIn = () => {
  try {
    return !!localStorage.getItem("app.access_token");
  } catch {
    return false;
  }
};

const clearScanHints = (jan_code) => {
  const keys = [
    "selectedJAN",
    "lastScannedJAN",
    "scan_last_jan",
    "scanTriggerJAN",
    "scanner_selected_jan",
  ];
  try {
    keys.forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  } catch {}
  try {
    localStorage.setItem(
      "product_page_closed",
      JSON.stringify({ jan: jan_code, at: Date.now() })
    );
  } catch {}
};

const notifyParentClosed = (jan_code) => {
  postToParent({ type: "PRODUCT_CLOSED", jan: jan_code, clear: true });
  clearScanHints(jan_code);
  try {
    const bc = new BroadcastChannel("product_bridge");
    bc.postMessage({
      type: "PRODUCT_CLOSED",
      jan: jan_code,
      clear: true,
      at: Date.now(),
    });
    bc.close();
  } catch {}
};

/** =========================
 *  お気に入りスター（☆/★ → 「飲みたい」）
 * ========================= */
function HeartButton({ jan_code, size = 28, hidden = false }) {
  const [fav, setFav] = React.useState(false);

  React.useEffect(() => {
    const readFav = () => {
      try {
        const obj = JSON.parse(localStorage.getItem("favorites") || "{}");
        setFav(!!obj[jan_code]);
      } catch {
        setFav(false);
      }
    };
    readFav();
    const onStorage = (e) => {
      if (e.key === "favorites") readFav();
    };
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
    // 1) favorites をトグル
    const favs = JSON.parse(localStorage.getItem("favorites") || "{}");
    const willAdd = !favs[jan_code];
    if (willAdd) {
      favs[jan_code] = { addedAt: new Date().toISOString() };
    } else {
      delete favs[jan_code];
    }
    localStorage.setItem("favorites", JSON.stringify(favs));
    setFav(!!favs[jan_code]);

    // 2) ★ON のときは「評価(◎)を即座に消す」→ 排他を保証
    if (willAdd) {
      try {
        const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
        if (ratings[jan_code]) {
          delete ratings[jan_code];
          localStorage.setItem("userRatings", JSON.stringify(ratings));
        }
      } catch {}
      // ProductPage 自身の表示を即更新（◎を0に）
      try {
        window.parent?.postMessage(
          {
            type: "SET_RATING",
            jan: jan_code,
            rating: { rating: 0, date: new Date().toISOString() },
          },
          "*"
        );
      } catch {}
      try {
        const bc = new BroadcastChannel("product_bridge");
        bc.postMessage({
          type: "SET_RATING",
          jan: jan_code,
          rating: { rating: 0, date: new Date().toISOString() },
          at: Date.now(),
        });
        bc.close();
      } catch {}
    }

    // 3) 既存互換の通知（★トグル）
    try {
      window.parent?.postMessage({ type: "TOGGLE_FAVORITE", jan_code }, "*");
    } catch {}
    try {
      const bc = new BroadcastChannel("product_bridge");
      bc.postMessage({
        type: "SET_FAVORITE",
        jan: jan_code,
        value: willAdd,
        at: Date.now(),
      });
      bc.close();
    } catch {}
  };

  return (
    <button
      aria-label={fav ? "お気に入り解除" : "お気に入りに追加"}
      onClick={toggle}
      disabled={hidden}
      style={{
        border: "none",
        background: "transparent",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: hidden ? "default" : "pointer",
        visibility: hidden ? "hidden" : "visible",
      }}
      title={fav ? "お気に入りに登録済み" : "お気に入りに追加"}
    >
      <img
        src={`${PUBLIC_BASE}${fav ? "/img/store.svg" : "/img/store2.svg"}`}
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
                i === 0
                  ? selected
                    ? centerColor
                    : "rgb(150,150,150)"
                  : "transparent",
            }}
          />
        );
      })}
    </div>
  );
};

/** =========================
 *  商品画像（バックエンド image_url_v 優先）
 * ========================= */
function ProductImage({ product, jan_code, maxHeight = 225 }) {
  const primarySrc =
    product?.image_url_v ||
    product?.image_url ||
    `${PUBLIC_BASE}/img/${jan_code}.png`;

  const [src, setSrc] = useState(primarySrc);
  const [loaded, setLoaded] = useState(false);
  const wasCachedRef = React.useRef(false);
  const imgElRef = React.useRef(null);

  const setImgRef = React.useCallback((node) => {
    if (node)
      wasCachedRef.current = node.complete && node.naturalWidth > 0;
    imgElRef.current = node;
  }, []);

  useEffect(() => {
    setLoaded(false);
    setSrc(
      product?.image_url_v ||
        product?.image_url ||
        `${PUBLIC_BASE}/img/${jan_code}.png`
    );
  }, [product, jan_code]);

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
      setSrc(`${PUBLIC_BASE}/img/placeholder.png`);
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
 *  商品説明セクション
 * ========================= */
function ProductInfoSection({ product }) {
  if (!product) return null;

  const detailRows = [
    ["タイプ", product.wine_type || "—"],
    ["生産者名", product.producer_name || "—"],
    ["容量", product.volume_ml ? `${product.volume_ml}ml` : "—"],
    ["国", product.country || "—"],
    ["産地", product.region || "—"],
    ["品種", product.grape_variety || "—"],
    [
      "成分検査年",
      product.production_year_taste
        ? `${product.production_year_taste}：酒類総合情報センター調べ`
        : "—",
    ],
  ];

  // まず ec_comment 系、その次に comment を表示
  const commentBlocks = [];
  if (
    product.ec_title_1 ||
    product.ec_comment_1 ||
    product.ec_title_2 ||
    product.ec_comment_2
  ) {
    for (let i = 1; i <= 5; i++) {
      const t = product[`ec_title_${i}`];
      const c = product[`ec_comment_${i}`];
      if (!t && !c) continue;
      commentBlocks.push({ title: t, body: c });
    }
  } else if (product.comment) {
    commentBlocks.push({
      title: "ワインの特徴",
      body: product.comment,
    });
  }

  return (
    <div
      className="pb-safe"
      style={{
        paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* コメントブロック */}
      {commentBlocks.map((b, idx) => (
        <div
          key={idx}
          style={{ marginTop: idx === 0 ? 20 : 16, fontSize: 14, lineHeight: 1.6 }}
        >
          {b.title && (
            <div
              style={{
                fontWeight: "bold",
                marginBottom: 4,
              }}
            >
              {b.title}
            </div>
          )}
          {b.body && <div>{b.body}</div>}
        </div>
      ))}

      {/* 基本情報 */}
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
          {detailRows.map(([label, value]) => (
            <div
              key={label}
              style={{ display: "flex", marginTop: 2 }}
            >
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
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);

  // ★ CartContext（ローカル積み → カートで同期）
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState(false);
  const { add } = useSimpleCart();

  // 評価ページ表示時に一度だけ現在位置を取得して tm_last_location に保存
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const { latitude, longitude } = pos.coords || {};
        const located_at = new Date().toISOString();

        try {
          localStorage.setItem(
            "tm_last_location",
            JSON.stringify({ latitude, longitude, located_at })
          );
        } catch (e) {
          console.warn("tm_last_location の保存に失敗:", e);
        }
      },
      (err) => {
        console.warn("geolocation 取得失敗:", err);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000, // 5分以内のキャッシュを許可
        timeout: 10000,
      }
    );

    return () => {
      cancelled = true;
    };
  }, [jan_code]);

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

  // ★★★ バックエンドの商品情報を読む useEffect ★★★
  useEffect(() => {
    if (!jan_code) return;

    let cancelled = false;
    const controller = new AbortController();

    const getCurrentMainStoreId = () => {
      try {
        const fromApp = Number(
          localStorage.getItem("app.main_store_id") || "0"
        );
        if (fromApp > 0) return fromApp;

        const fromLegacy = Number(
          localStorage.getItem("store.mainStoreId") || "0"
        );
        if (fromLegacy > 0) return fromLegacy;

        const stored =
          localStorage.getItem("selectedStore") ||
          localStorage.getItem("main_store");
        if (stored) {
          const s = JSON.parse(stored);
          const id = Number(s?.id ?? s?.store_id ?? 0);
          if (id > 0) return id;
        }
      } catch {}
      return 1; // デフォルト：ECショップ
    };

    const getSubStoreIds = () => {
      try {
        return localStorage.getItem("app.sub_store_ids") || "";
      } catch {
        return "";
      }
    };

    const fetchProduct = async () => {
      setLoading(true);
      setProduct(null);

      const mainId = getCurrentMainStoreId();
      const subIds = getSubStoreIds();

      const qs = [];
      if (mainId) qs.push(`main_store_id=${mainId}`);
      if (subIds) qs.push(`sub_store_ids=${encodeURIComponent(subIds)}`);
      const qsStr = qs.length ? `?${qs.join("&")}` : "";

      try {
        const res = await fetch(
          `${API_BASE}/api/app/map-products/${encodeURIComponent(jan_code)}${qsStr}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          console.warn("商品APIエラー", res.status);
          if (!cancelled) setLoading(false);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setProduct(data);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled && e.name !== "AbortError") {
          console.error("商品API読込エラー:", e);
          setLoading(false);
        }
      }

      // ローカルの userRatings 読込（従来通り）
      try {
        const ratings = JSON.parse(
          localStorage.getItem("userRatings") || "{}"
        );
        if (ratings[jan_code]) {
          const meta = ratings[jan_code];
          const val =
            meta?.source === "wish" && Number(meta?.rating) === 1
              ? 0
              : meta?.rating ?? 0;
          setRating(val);
        } else {
          setRating(0);
        }
      } catch {}
    };

    fetchProduct();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [jan_code]);

  // 評価の同期（STATE_SNAPSHOT / SET_RATING）は従来通り
  useEffect(() => {
    const onMsgSnapshot = (e) => {
      const { type, jan: targetJan, rating: ratingPayload } = e.data || {};
      if (type !== "STATE_SNAPSHOT") return;
      if (String(targetJan) !== String(jan_code)) return;
      try {
        setRating(Number(ratingPayload?.rating) || 0);
      } catch {}
    };
    window.addEventListener("message", onMsgSnapshot);
    return () => window.removeEventListener("message", onMsgSnapshot);
  }, [jan_code]);

  useEffect(() => {
    const onMsgSet = (e) => {
      const { type, jan: targetJan, rating: payload } = e.data || {};
      if (type !== "SET_RATING") return;
      if (String(targetJan) !== String(jan_code)) return;
      const next =
        payload && Number(payload?.rating) > 0
          ? Number(payload.rating)
          : 0;
      setRating(next);
      try {
        const store = JSON.parse(
          localStorage.getItem("userRatings") || "{}"
        );
        if (next > 0)
          store[jan_code] = {
            rating: next,
            date: payload?.date || new Date().toISOString(),
          };
        else delete store[jan_code];
        localStorage.setItem("userRatings", JSON.stringify(store));
      } catch {}
    };
    window.addEventListener("message", onMsgSet);
    return () => window.removeEventListener("message", onMsgSet);
  }, [jan_code]);

  const handleCircleClick = async (value) => {
    // 1) 未ログインなら評価NG → アラート → マイアカウントパネルを開く
    if (!isAppLoggedIn()) {
      alert("評価機能はログインしてからご利用いただけます。");
      try {
        window.parent?.postMessage({ type: "OPEN_MYACCOUNT" }, "*");
      } catch {}
      return;
    }

    const newRating = value === rating ? 0 : value;

    // 2) UI と localStorage を即時更新
    setRating(newRating);

    const ratings = JSON.parse(
      localStorage.getItem("userRatings") || "{}"
    );
    let payload = null;
    if (newRating === 0) {
      delete ratings[jan_code];
    } else {
      payload = {
        rating: newRating,
        date: new Date().toISOString(),
      };
      ratings[jan_code] = payload;

      // ★が付いていたら外す（排他）
      try {
        const favs = JSON.parse(
          localStorage.getItem("favorites") || "{}"
        );
        if (favs[jan_code]) {
          delete favs[jan_code];
          localStorage.setItem("favorites", JSON.stringify(favs));
          try {
            window.parent?.postMessage(
              { type: "SET_FAVORITE", jan: jan_code, value: false },
              "*"
            );
          } catch {}
        }
      } catch {}
    }
    localStorage.setItem("userRatings", JSON.stringify(ratings));
    postToParent({
      type: "RATING_UPDATED",
      jan: jan_code,
      payload,
    });

    // 3) バックエンドへも送信
    try {
      await postRating({ jan_code, rating: newRating });
    } catch (e) {
      console.error(e);
    }
  };

  // 価格・タイプ色などの表示用
  const price = product?.price_inc_tax ?? null;
  const displayPrice =
    price != null ? `¥${Number(price).toLocaleString()}` : "価格未定";

  const typeColors = {
    Red: "#8B2E3B",
    White: "#D9D76C",
    Rose: "#E48E8E",
    Sparkling: "#6BAED6",
    Spa: "#6BAED6",
    Other: "#CCCCCC",
  };
  const wineTypeKey =
    product?.wine_type && typeColors[product.wine_type]
      ? product.wine_type
      : "Other";
  const typeColor = typeColors[wineTypeKey];

  const title =
    product?.title || product?.name_kana || product?.jan_code || "（名称不明）";

  const handleAddToCart = async () => {
    try {
      setAdding(true);
      await add({
        jan: jan_code,
        title,
        price: Number(price) || 0,
        qty: 1,
        volume_ml: Number(product?.volume_ml) || 750,
        imageUrl:
          product?.image_url_v ||
          product?.image_url ||
          `${PUBLIC_BASE}/img/${jan_code}.png`,
      });
      // 親へ「カートが変わった」通知
      try {
        window.parent?.postMessage({ type: "CART_CHANGED" }, "*");
      } catch {}
      try {
        const bc = new BroadcastChannel("cart_bus");
        bc.postMessage({
          type: "CART_CHANGED",
          at: Date.now(),
        });
        bc.close();
      } catch {}

      // 軽いトースト表示
      setToast(true);
      setTimeout(() => setToast(false), 1200);
    } catch (e) {
      alert(`追加に失敗: ${e?.message || e}`);
    } finally {
      setAdding(false);
    }
  };

  if (loading && !product) {
    return <div style={{ padding: 16 }}>読み込み中です…</div>;
  }
  if (!product) {
    return <div style={{ padding: 16 }}>商品が見つかりませんでした。</div>;
  }

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
        <ProductImage product={product} jan_code={jan_code} maxHeight={225} />
      </div>

      {/* 商品名 */}
      <h2
        style={{
          margin: "8px 0",
          fontWeight: "bold",
          fontSize: 16,
        }}
      >
        {title}
      </h2>

      {/* タイプマーク＋価格 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          margin: "4px 0 12px 0",
        }}
      >
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
        <span style={{ marginLeft: 8 }}>{displayPrice}</span>
      </div>

      {/* カートに入れる */}
      <div style={{ margin: "8px 0 16px" }}>
        <button
          onClick={handleAddToCart}
          disabled={adding}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "8px 20px",
            lineHeight: 1.2,
            background: "rgb(230,227,219)", // SliderPage と統一
            color: "#000",
            border: "none",
            borderRadius: 10,
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1,
            cursor: adding ? "default" : "pointer",
            boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            WebkitBackdropFilter: "blur(2px)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: adding ? 0.7 : 1,
          }}
        >
          <img
            src={`${PUBLIC_BASE}/img/icon cart2.png`}
            alt="cart"
            style={{
              width: 40,
              height: 40,
              objectFit: "contain",
              display: "block",
            }}
          />
          カートに入れる
        </button>

        {toast && (
          <div
            role="status"
            style={{
              marginTop: 8,
              fontSize: 20,
              background: "#111",
              color: "#fff",
              display: "inline-block",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            カートに入れました
          </div>
        )}
      </div>

      {/* 評価（◎） */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 8,
          paddingBottom: 8,
          borderTop: "1px solid #ccc",
          borderBottom: "1px solid #ccc",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* 左：お気に入り */}
          <div
            style={{
              flex: "0 0 64px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 4px",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#666",
                alignSelf: "flex-start",
                lineHeight: 1,
                position: "relative",
                top: "-11px",
                marginLeft: "10px",
              }}
            >
              {"飲みたい"}
            </div>
            <HeartButton jan_code={jan_code} size={28} />
          </div>
          <div
            style={{
              width: 1,
              background: "#d9d9d9",
              marginLeft: "4px",
              marginRight: "12px",
              alignSelf: "stretch",
            }}
          />
          {/* 右：◎ */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: 12,
                color: "#666",
                padding: "0 4px",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  flex: 1,
                  textAlign: "center",
                  marginLeft: -175,
                }}
              >
                イマイチ
              </span>
              <span
                style={{
                  flex: "0 0 60px",
                  textAlign: "right",
                  marginLeft: 0,
                }}
              >
                好き
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                paddingRight: 4,
                maxWidth: 320,
              }}
            >
              {[1, 2, 3, 4, 5].map((v) => (
                <CircleRating
                  key={v}
                  value={v}
                  currentRating={rating}
                  onClick={handleCircleClick}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 説明＋基本情報 */}
      <ProductInfoSection product={product} />
    </div>
  );
}
