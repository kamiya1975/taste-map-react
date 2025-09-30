// src/ProductPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requireRatingOrRedirect } from "../utils/auth";

/** =========================
 *  ユーティリティ
 * ========================= */
const getJANFromURL = () => {
  try {
    const url = new URL(window.location.href);
    const byPath = window.location.pathname.split("/").filter(Boolean).pop();
    const byQuery = url.searchParams.get("jan");
    return String(byQuery || byPath || "").trim();
  } catch {
    return "";
  }
};

const postToParent = (payload) => {
  try {
    window.parent?.postMessage(payload, "*");
  } catch {}
};

// スキャン系の“自動再オープン”原因になりがちなキーを掃除
const clearScanHints = (jan) => {
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
      JSON.stringify({ jan, at: Date.now() })
    );
  } catch {}
};

// 親へ「閉じたよ。JANはクリアしてね」を多経路で通知（アンマウント時）
const notifyParentClosed = (jan) => {
  postToParent({ type: "PRODUCT_CLOSED", jan, clear: true });
  clearScanHints(jan);
  try {
    const bc = new BroadcastChannel("product_bridge");
    bc.postMessage({ type: "PRODUCT_CLOSED", jan, clear: true, at: Date.now() });
    bc.close();
  } catch {}
};

// ◎一覧から開いたか（?fromRated=1|true）をURLクエリで判定
const useHideHeartFromQuery = () => {
  const [hide, setHide] = useState(false);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const v = (url.searchParams.get("fromRated") || "").toLowerCase();
      setHide(v === "1" || v === "true");
    } catch {
      setHide(false);
    }
  }, []);
  return hide;
};

// 埋め込み判定（ヘッダー非表示用）
const useIsEmbed = () => {
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const q = (url.searchParams.get("embed") || "").toLowerCase();
      const byQuery = q === "1" || q === "true";
      const inIframe = window.self !== window.top;
      setEmbed(byQuery || inIframe);
    } catch {
      setEmbed(false);
    }
  }, []);
  return embed;
};

/** =========================
 *  お気に入りハート
 * ========================= */
function HeartButton({ jan, size = 22 }) {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    const readFav = () => {
      try {
        const obj = JSON.parse(localStorage.getItem("favorites") || "{}");
        setFav(!!obj[jan]);
      } catch {
        setFav(false);
      }
    };
    readFav();

    const onStorage = (e) => {
      if (e.key === "favorites") readFav();
    };
    window.addEventListener("storage", onStorage);

    const onMsg = (e) => {
      const { type, jan: targetJan, value } = e.data || {};
      if (String(targetJan) !== String(jan)) return;
      if (type === "SET_FAVORITE") setFav(!!value);
    };
    window.addEventListener("message", onMsg);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMsg);
    };
  }, [jan]);

  const toggle = () => {
    const favs = JSON.parse(localStorage.getItem("favorites") || "{}");
    let isFav = false;
    if (favs[jan]) {
      delete favs[jan];
      isFav = false;
    } else {
      favs[jan] = { addedAt: new Date().toISOString() };
      isFav = true;
    }
    localStorage.setItem("favorites", JSON.stringify(favs));
    setFav(isFav);

    // 親へ即時通知（MapPage用）
    postToParent({ type: "tm:fav-updated", jan, isFavorite: isFav });
  };

  return (
    <button
      aria-label={fav ? "お気に入り解除" : "お気に入りに追加"}
      onClick={toggle}
      style={{
        border: "1px solid #ddd",
        borderRadius: 999,
        background: "#fff",
        width: size + 16,
        height: size + 16,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: size,
        lineHeight: 1,
        boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
      }}
      title={fav ? "お気に入りに登録済み" : "お気に入りに追加"}
    >
      {fav ? "♥" : "♡"}
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
              backgroundColor:
                i === 0 ? (selected ? centerColor : "rgb(150,150,150)") : "transparent",
            }}
          />
        );
      })}
    </div>
  );
};

/** =========================
 *  ProductPage
 * ========================= */
export default function ProductPage() {
  const isEmbed = useIsEmbed();
  const navigate = useNavigate();
  const jan = useMemo(() => getJANFromURL(), []);
  const [product, setProduct] = useState(null);
  const [rating, setRating] = useState(0);

  const hideHeartFromQuery = useHideHeartFromQuery();
  const [hideHeart, setHideHeart] = useState(hideHeartFromQuery);
  useEffect(() => setHideHeart(hideHeartFromQuery), [hideHeartFromQuery]);

  useEffect(() => {
    postToParent({ type: "PRODUCT_OPENED", jan });
    postToParent({ type: "REQUEST_STATE", jan });

    const onBeforeUnload = () => notifyParentClosed(jan);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      notifyParentClosed(jan);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [jan]);

  // 商品・評価ロード
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem("umapData") || "[]");
      const found = data.find((d) => String(d.JAN) === String(jan));
      setProduct(found || null);
    } catch {
      setProduct(null);
    }
    try {
      const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
      if (ratings[jan]) setRating(ratings[jan].rating ?? 0);
    } catch {}
  }, [jan]);

  // 親からの snapshot
  useEffect(() => {
    const onMsg = (e) => {
      const { type, jan: targetJan, rating: ratingPayload, hideHeart } = e.data || {};
      if (type !== "STATE_SNAPSHOT") return;
      if (String(targetJan) !== String(jan)) return;
      setRating(ratingPayload?.rating ?? 0);
      if (typeof hideHeart === "boolean") setHideHeart(hideHeart);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [jan]);

  const handleCircleClick = async (value) => {
    if (!requireRatingOrRedirect(navigate, "open=mypage")) return;
    const newRating = value === rating ? 0 : value;
    setRating(newRating);

    const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
    let payload = null;

    if (newRating === 0) {
      delete ratings[jan];
    } else {
      payload = { rating: newRating, date: new Date().toISOString() };
      ratings[jan] = payload;
    }

    localStorage.setItem("userRatings", JSON.stringify(ratings));

    // 親へ即時通知（MapPage用）
    postToParent({ type: "tm:rating-updated", jan, rating: newRating, date: new Date().toISOString() });
  };

  if (!product) return <div style={{ padding: 16 }}>商品が見つかりませんでした。</div>;

  const price = product.希望小売価格 ?? product.価格 ?? 1800;
  const typeColors = { Spa: "#6BAED6", White: "#D9D76C", Red: "#8B2E3B", Rose: "#E48E8E", Other: "#CCCCCC" };
  const typeColor = typeColors[product.Type] || typeColors.Other;

  return (
    <div style={{ height: "100%", overflow: "auto", maxWidth: 500, margin: "0 auto", padding: 16 }}>
      {!hideHeart && (
        <div style={{ position: "fixed", top: 12, left: 12, zIndex: 1000 }}>
          <HeartButton jan={jan} size={22} />
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <img src={`/img/${jan}.png`} alt="商品画像" style={{ maxHeight: 225, objectFit: "contain" }}
          onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
      </div>

      <h2 style={{ margin: "8px 0", fontWeight: "bold", fontSize: 16 }}>
        {product.商品名 || "（名称不明）"}
      </h2>

      <div style={{ display: "flex", alignItems: "center", margin: "4px 0 12px 0" }}>
        <span style={{ width: 16, height: 16, backgroundColor: typeColor, borderRadius: 4, marginRight: 8 }} />
        <span style={{ marginLeft: 8 }}>¥{Number(price).toLocaleString()}</span>
        <span style={{ marginLeft: 24 }}>{product.産地 || "シチリア"} / {product.国 || "イタリア"}</span>
      </div>

      <p style={{ margin: "4px 0" }}>
        Sweet: {Number(product.PC2).toFixed(2)} / Body: {Number(product.PC1).toFixed(2)}
      </p>

      <div style={{ marginTop: 24, paddingTop: 8, paddingBottom: 8, borderTop: "1px solid #ccc", borderBottom: "1px solid #ccc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: "bold", fontSize: 16, minWidth: 48 }}>評価</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, width: "100%", maxWidth: 300 }}>
            {[1, 2, 3, 4, 5].map((v) => (
              <CircleRating key={v} value={v} currentRating={rating} onClick={handleCircleClick} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
