// src/pages/ProductPage.jsx
// 商品詳細画面
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useSimpleCart } from "../cart/simpleCart";
import { postRating } from "../lib/appRatings";
import {
  fetchWishlistStatus,
  addWishlist,
  removeWishlist,
} from "../lib/appWishlist";
import {
  getClusterRGBA,
  clusterRGBAtoCSS,
  toJapaneseWineType,
  TASTEMAP_POINTS_URL,
} from "../ui/constants";
import { getCurrentMainStoreIdSafe } from "../utils/store"; // 2025.12.22.追加

const API_BASE = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE || "";
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
function HeartButton({ jan_code, value, onChange, size = 28, hidden = false }) {
  const fav = !!value;
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    // 親からの反映（一覧⇄詳細の即時同期用）
    const onMsg = (e) => {
      const { type, jan: targetJan, value } = e.data || {};
      if (String(targetJan) !== String(jan_code)) return;
      if (type === "SET_WISHLIST") onChange?.(!!value);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [jan_code, onChange]);

  const toggle = async () => {
    if (busy) return;

    if (!isAppLoggedIn()) {
      alert("飲みたい機能はログインしてからご利用いただけます。");
      try { window.parent?.postMessage({ type: "OPEN_MYACCOUNT" }, "*"); } catch {}
      return;
    }

    const willAdd = !fav;
    setBusy(true);
    // 先にUI更新（楽観）
    onChange?.(willAdd);

    // 2) wishlist ON で rating を触らない（排他しない）

    // 3) DBへ反映（失敗したら戻す）
    let finalWish = willAdd;
    try {
      if (willAdd) await addWishlist(jan_code);
      else await removeWishlist(jan_code);
      // DB確定値で最終状態を同期（ズレ防止）
      try {
        const st = await fetchWishlistStatus(jan_code);
        finalWish = !!st?.is_wished;
        onChange?.(finalWish);
      } catch {}
    } catch (e) {
      console.error(e);
      onChange?.(!willAdd);
      setBusy(false);
      return;
    } finally {
      setBusy(false);
    }

    // 4) 親へ通知（一覧/Map側の即時同期）
    try { window.parent?.postMessage({ type: "SET_WISHLIST", jan: jan_code, value: finalWish }, "*"); } catch {}
    try {
      const bc = new BroadcastChannel("product_bridge");
      bc.postMessage({ type: "SET_WISHLIST", jan: jan_code, value: finalWish, at: Date.now() });
      bc.close();
    } catch {}
  };

  return (
    <button
      aria-label={fav ? "お気に入り解除" : "お気に入りに追加"}
      onClick={toggle}
      disabled={hidden || busy}
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
      fetchPriority="high"
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
function ProductInfoSection({ product, jan_code }) {
  if (!product) return null;

  // 追加：表示用 JAN（APIが返す product.jan_code を優先、無ければURLの jan_code）
  const janValue = product?.jan_code || jan_code || "—";

  const detailRows = [
    ["タイプ", toJapaneseWineType(product.wine_type)],
    ["生産者名", product.producer_name || "—"],
    ["容量", product.volume_ml ? `${product.volume_ml}ml` : "—"],
    ["国", product.country || "—"],
    ["産地", product.region || "—"],
    ["品種", product.grape_variety || "—"],
    ["JAN", janValue],
    [
      "成分検査年",
      product.production_year_taste
        ? `${product.production_year_taste}：酒類総合情報センター調べ`
        : "—",
    ],
  ];

  // ECなら ec_* だけ。店舗なら comment だけ。空ならブロックごと非表示（詰める）
  const isEcContext = !!product?.is_ec_product; // ← ec_product ではなく最終判定を使う

  const commentBlocks = [];

  if (isEcContext) {
    // EC：ec_* だけ（1..5）
    for (let i = 1; i <= 5; i++) {
      const t = product?.[`ec_title_${i}`];
      const c = product?.[`ec_comment_${i}`];
      if (!t && !c) continue;
      commentBlocks.push({ title: t, body: c });
    }
  } else {
    // 店舗：comment だけ（title/comment は今回は使わない方針）
    if (product?.comment) {
      commentBlocks.push({ title: "ワインの特徴", body: product.comment });
    }
  }

  const hasComments = commentBlocks.length > 0;

  return (
    <div
      className="pb-safe"
      style={{
        paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* コメントブロック（あるときだけ） */}
      {hasComments &&
        commentBlocks.map((b, idx) => (
          <div
            key={idx}
            style={{
              marginTop: idx === 0 ? 20 : 16,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {b.title && (
              <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                {b.title}
              </div>
            )}
            {b.body && <div>{b.body}</div>}
          </div>
        ))}

      {/* 基本情報 */}
      <div
        style={{
          marginTop: hasComments ? 24 : 12, // ★コメントが無ければ詰める
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
  const jan_code = useJanParam();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [wish, setWish] = useState(false);
  const [clusterId, setClusterId] = useState(null);

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
        if (err?.code === 1) return; // deny は黙る
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

    const fetchProduct = async () => {
      setLoading(true);
      setProduct(null);

    // 正キーが無い状態で旧キー migrate されると「過去店舗」が復活するので抑止　2026.01.
    let mainId = null;
    try {
      const rawMain = localStorage.getItem("app.main_store_id");
      const n = Number(rawMain);
      mainId = Number.isFinite(n) && n > 0 ? n : null;
    } catch {}

      // sub_store_ids は送らない（未ログイン時は main だけ、ログイン時はトークンで sub を見る）
      const qsStr = mainId ? `?main_store_id=${encodeURIComponent(String(mainId))}` : "";

      // app API 用トークン（存在すれば付ける）2026.01.
      let token = "";
      try { token = localStorage.getItem("app.access_token") || ""; } catch {}
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      try {
        const res = await fetch(
          `${API_BASE}/api/app/map-products/${encodeURIComponent(jan_code)}${qsStr}`,
        { signal: controller.signal, headers, cache: "no-store" }
        );
        // 重要：res.ok で早期 return しない（後続の wish/rating 初期化が飛ぶため）
        if (!res.ok) {
          console.warn("商品APIエラー", res.status);
          if (!cancelled) {
            setProduct({ jan_code }); // 最低限
            setLoading(false);
          }  
        } else {
          const data = await res.json();
          if (!cancelled) {
            setProduct(data);
            setLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled && e.name !== "AbortError") {
          console.error("商品API読込エラー:", e);
          setLoading(false);
        }
      }

      // wishlist 初期点灯（DB 正）
      // ※ 商品取得とは独立に、ログイン状態に応じて確定
      try {
        if (!cancelled) {
          if (isAppLoggedIn()) {
            const st = await fetchWishlistStatus(jan_code);
            if (!cancelled) setWish(!!st?.is_wished);
          } else {
            setWish(false);
          }
        }
      } catch {
        if (!cancelled) setWish(false);
      }

      // ローカルの userRatings 読込（従来通り）
      try {
        const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
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

  // 風味データ（umapData or JSON）から cluster を取得
  useEffect(() => {
    if (!jan_code) return;

    let cancelled = false;

    const findCluster = async () => {
      // 1) まず MapPage が保存した umapData を見る
      try {
        const raw = localStorage.getItem("umapData");
        if (raw) {
          const arr = JSON.parse(raw);
          const hit = (arr || []).find(
            (r) => String(r.jan_code || r.JAN) === String(jan_code)
          );
          if (hit && Number.isFinite(Number(hit.cluster))) {
            if (!cancelled) setClusterId(Number(hit.cluster));
            return;
          }
        }
      } catch (e) {
        console.warn("ProductPage: umapData 読み込み失敗:", e);
      }

      // 2) なければ風味データJSONを直接 fetch
      try {
        const res = await fetch(TASTEMAP_POINTS_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        if (cancelled) return;

        const hit = (rows || []).find(
          (r) => String(r.jan_code || r.JAN) === String(jan_code)
        );
        if (hit && Number.isFinite(Number(hit.cluster))) {
          setClusterId(Number(hit.cluster));
        } else {
          setClusterId(null);
        }
      } catch (e) {
        console.error("ProductPage: クラスタ取得に失敗:", e);
        if (!cancelled) setClusterId(null);
      }
    };

    findCluster();

    return () => {
      cancelled = true;
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

    // 重要：壊れたJSONで落ちないようにする
    let ratings = {};
    try {
      ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
      if (!ratings || typeof ratings !== "object") ratings = {};
    } catch {
      ratings = {};
    }

    let payload = null;
    if (newRating === 0) {
      delete ratings[jan_code];
    } else {
      payload = {
        rating: newRating,
        date: new Date().toISOString(),
      };
      ratings[jan_code] = payload;

      // ★が付いていたら外す（排他：DBを正）
      // ※ 失敗したら wish 表示は落とさない（嘘をつかない）
      if (wish) {
        try {
          await removeWishlist(jan_code);
          setWish(false);
          try { window.parent?.postMessage({ type: "SET_WISHLIST", jan: jan_code, value: false }, "*"); } catch {}
          try {
            const bc = new BroadcastChannel("product_bridge");
            bc.postMessage({ type: "SET_WISHLIST", jan: jan_code, value: false, at: Date.now() });
            bc.close();
          } catch {}
        } catch (e) {
          console.warn("removeWishlist failed while rating ON:", e);
        }
      }
    }
    try {
      localStorage.setItem("userRatings", JSON.stringify(ratings));
    } catch {}
    postToParent({
      type: "SET_RATING",
      jan: jan_code,
      rating: payload ? { rating: newRating, date: payload.date } : { rating: 0, date: new Date().toISOString() },
    });

    // 3) バックエンドへも送信
    try {
      if (newRating > 0) {
        await postRating({ jan_code, rating: newRating });
      } else {
        // 0 は送らない（削除APIが無い前提）
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 価格・タイプ色などの表示用
  const price = product?.price_inc_tax;
  const priceNum =
    price === null || price === undefined || price === "" ? null : Number(price);
  const displayPrice =
    priceNum !== null && Number.isFinite(priceNum)
      ? `¥${priceNum.toLocaleString()}`
      : "価格未定";

  // 選択中店舗にアクティブ取扱があるか（※EC判定には使わない。availabilityLineの「評価履歴」表示用）
  const availableInSelected = product?.available_in_selected_stores;

  // クラスタ色
  const clusterRgba = getClusterRGBA(
    clusterId != null ? clusterId : product?.cluster_id
  );
  const typeColor = clusterRGBAtoCSS(clusterRgba);

  const title =
    product?.name_kana ||
    product?.title ||
    product?.jan_code ||
    "（名称不明）";

  // EC商品かどうか　 is_ec_product で 1本化（これだけを真実にする）
  const isEcContext = !!product?.is_ec_product;
  const canShowCartButton = isEcContext;

  // 価格下の文言（EC / 店舗 / それ以外）
  // 店舗文言は「店名がある」ではなく「選択中店舗で取扱あり」のときだけ出す
  let availabilityLine = null;
  if (isEcContext) {
    availabilityLine = <>この商品はネット購入できます。</>;
  } else if (availableInSelected === true) {
    // 取扱が「ある」と確定した時だけ店名を出す（誤表示防止）
    const storeLabel =
      product?.candidate_store_name || // 取扱判定の店舗名（最優先）
      product?.price_store_name ||     // 価格算出元（次点）
      product?.store_name ||           // 旧互換
      "";
    availabilityLine = (
      <>
        この商品は、近くの{storeLabel || "店舗"}でお買い求めいただけます。
        在庫・価格は店舗でご確認ください。
      </>
    );
  } else if (availableInSelected === false) {
    availabilityLine = (
      <>
        現在、お選びの店舗ではお取り扱いがありません。<br />
        過去の評価履歴として表示しています。
      </>
    );
  } else {
    // availableInSelected が未取得/不明なときは何も出さない（サブ店舗名の誤表示を防ぐ）
    availabilityLine = null;
  }

  const handleAddToCart = async () => {
    // 未ログインなら MyAccount へ誘導（評価ボタンと同じ挙動）
    if (!isAppLoggedIn()) {
      alert("購入機能はログインしてからご利用いただけます。");
      try {
        window.parent?.postMessage({ type: "OPEN_MYACCOUNT" }, "*");
      } catch {}
      return;
    }
    
    try {
      setAdding(true);
      await add({
        jan: jan_code,
        title,
        price: priceNum ?? 0,
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

      {/* タイプマーク＋価格＋「どの店舗の商品か」 */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
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
            marginTop: 4,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            {displayPrice}
          </div>

          {availabilityLine && (
            <div
              style={{
                marginTop: 2,
                fontSize: 11,
                lineHeight: 1.6,
                color: "#555",
              }}
            >
              {availabilityLine}
            </div>
          )}
        </div>
      </div>

      {/* カートに入れる（EC対象商品のときだけ表示） */}
      {canShowCartButton && (
        <div style={{ margin: "8px 0 16px" }}>
          <button
            onClick={handleAddToCart}
            disabled={adding}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "8px 20px",
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
              src={`${PUBLIC_BASE}/img/icon-cart2.png`}
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
      )}

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
            <HeartButton jan_code={jan_code} value={wish} onChange={setWish} size={28} />
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
      <ProductInfoSection product={product} jan_code={jan_code} />
    </div>
  );
}
