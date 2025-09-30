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
    // /products/:JAN or ?jan=XXXX の両対応
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
 *  お気に入りハート（手動のみ）
 * ========================= */
function HeartButton({ jan, size = 22 }) {
  const [fav, setFav] = useState(false);

  // ローカルストレージと親からの同期
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

    // 親からのメッセージを受信（SET_FAVORITE / STATE_SNAPSHOT）
    const onMsg = (e) => {
      const { type, jan: targetJan, value } = e.data || {};
      const match = String(targetJan) === String(jan);
      if (!match) return;

      if (type === "SET_FAVORITE") {
        setFav(!!value);
      }
    };
    window.addEventListener("message", onMsg);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMsg);
    };
  }, [jan]);

  const toggle = () => {
    const favs = JSON.parse(localStorage.getItem("favorites") || "{}");
    if (favs[jan]) {
      delete favs[jan];
    } else {
      favs[jan] = { addedAt: new Date().toISOString() };
    }
    localStorage.setItem("favorites", JSON.stringify(favs));
    setFav(!!favs[jan]);

    postToParent({ type: "TOGGLE_FAVORITE", jan });
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

/** =========================
 *  ProductPage
 * ========================= */
export default function ProductPage() {
  const isEmbed = useIsEmbed();
  const navigate = useNavigate();
  const jan = useMemo(() => getJANFromURL(), []);
  const [product, setProduct] = useState(null);
  const [rating, setRating] = useState(0);

  // ◎一覧から来たか（来ていれば♡を隠す）
  const hideHeartFromQuery = useHideHeartFromQuery();
  const [hideHeart, setHideHeart] = useState(hideHeartFromQuery);
  useEffect(() => {
    setHideHeart(hideHeartFromQuery);
  }, [hideHeartFromQuery]);

  // マウント→OPEN通知、アンマウント→CLOSED通知
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

  // 親からの STATE_SNAPSHOT
  useEffect(() => {
    const onMsg = (e) => {
      const { type, jan: targetJan, rating: ratingPayload, hideHeart } = e.data || {};
      if (type !== "STATE_SNAPSHOT") return;
      if (String(targetJan) !== String(jan)) return;
      try {
        setRating(ratingPayload?.rating ?? 0);
        if (typeof hideHeart === "boolean") setHideHeart(hideHeart);
      } catch {}
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [jan]);

  // 親からの HIDE_HEART
  useEffect(() => {
    const onMsg = (e) => {
      const { type, jan: targetJan, value } = e.data || {};
      if (String(targetJan) !== String(jan)) return;
      if (type === "HIDE_HEART") {
        setHideHeart(Boolean(value));
      }
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
      let weather = {};
      try {
        const token = process.env.REACT_APP_IPINFO_TOKEN;
        const ipRes = await fetch(`https://ipinfo.io/json?token=${token}`);
        const ipData = await ipRes.json();
        const [lat, lon] = (ipData.loc || ",").split(",");

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const HH = String(now.getHours()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const targetTime = `${dateStr}T${HH}:00`;

        const meteoUrl =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&start_date=${dateStr}&end_date=${dateStr}` +
          `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,cloudcover,precipitation,wind_speed_10m,weathercode` +
          `&timezone=Asia%2FTokyo`;

        const weatherRes = await fetch(meteoUrl);
        const weatherData = await weatherRes.json();
        const hourly = weatherData.hourly || {};
        const idx = Array.isArray(hourly.time) ? hourly.time.indexOf(targetTime) : -1;

        if (idx !== -1) {
          weather = {
            temperature: hourly.temperature_2m?.[idx],
            apparentTemperature: hourly.apparent_temperature?.[idx],
            humidity: hourly.relative_humidity_2m?.[idx],
            pressure: hourly.surface_pressure?.[idx],
            cloudcover: hourly.cloudcover?.[idx],
            precipitation: hourly.precipitation?.[idx],
            windSpeed: hourly.wind_speed_10m?.[idx],
            weatherCode: hourly.weathercode?.[idx],
          };
        }
      } catch (err) {
        console.warn("気象情報の取得に失敗しました:", err);
      }

      payload = { rating: newRating, date: new Date().toISOString(), weather };
      ratings[jan] = payload;
    }

    localStorage.setItem("userRatings", JSON.stringify(ratings));
    postToParent({ type: "RATING_UPDATED", jan, payload });
  };

  if (!product) {
    return <div style={{ padding: 16 }}>商品が見つかりませんでした。</div>;
  }

  const price = product.希望小売価格 ?? product.価格 ?? 1800;

  // ★ Typeごとの色マップ
  const typeColors = {
    Spa: "#6BAED6",
    White: "#D9D76C",
    Red: "#8B2E3B",
    Rose: "#E48E8E",
    Other: "#CCCCCC",
  };
  const typeColor = typeColors[product.Type] || typeColors.Other;

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        WebkitOverflowScrolling: "touch",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        maxWidth: "500px",
        margin: "0 auto",
        padding: "16px",
        position: "relative",
      }}
    >
      {/* 左上に固定の♡（embed でも表示） */}
      {!hideHeart && (
        <div style={{ position: "fixed", top: 12, left: 12, zIndex: 1000 }}>
          <HeartButton jan={jan} size={22} />
        </div>
      )}

      {/* 商品画像 */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <img
          src={`/img/${jan}.png`}
          alt="商品画像"
          style={{ maxHeight: 250, objectFit: "contain" }}
          onError={(e) => {
            e.currentTarget.style.opacity = 0.3;
          }}
        />
      </div>

      {/* 商品名 */}
      <h2 style={{ margin: "8px 0", fontWeight: "bold", fontSize: 18 }}>
        {product.商品名 || "（名称不明）"}
      </h2>

      {/* タイプマーク＋価格 */}
      <p style={{ display: "flex", alignItems: "center", margin: "4px 0 12px 0" }}>
        <span
          style={{
            width: 16,
            height: 16,
            backgroundColor: typeColor,
            borderRadius: 4,
            marginRight: 8,
          }}
        />
        ¥{Number(price).toLocaleString()}
      </p>

      {/* 味データ */}
      <p style={{ margin: "4px 0" }}>
        Sweet: {Number(product.PC2).toFixed(2)}, body: {Number(product.PC1).toFixed(2)}
      </p>

      {/* 原産地・年 */}
      <p style={{ margin: "4px 0" }}>
        {product.産地 || product.生産地 || "シチリア / イタリア"} /{" "}
        {product.生産年 || product.収穫年 || "2022"}
      </p>

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              fontSize: 16,
              minWidth: 48,
              whiteSpace: "nowrap",
            }}
          >
            評価
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              maxWidth: 300,
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

      {/* 説明ダミー */}
      <div style={{ marginTop: 20, fontSize: 14, lineHeight: 1.6 }}>
        ワインとは、主にブドウから作られたお酒（酒税法上は果実酒に分類）です。
        また、きわめて長い歴史をもつこのお酒は、西洋文明の象徴の一つであると同時に、
        昨今では、世界標準の飲み物と言えるまでになっています。 …（略）
        ワインとは、主にブドウから作られたお酒（酒税法上は果実酒に分類）です。
        また、きわめて長い歴史をもつこのお酒は、西洋文明の象徴の一つであると同時に、
        昨今では、世界標準の飲み物と言えるまでになっています。
      </div>
    </div>
  );
}
