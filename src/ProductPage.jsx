import React, { useEffect, useState } from "react";

/** =========================
 *  ハートボタン（お気に入り）
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
    return () => window.removeEventListener("storage", onStorage);
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

    window.parent?.postMessage({ type: "TOGGLE_FAVORITE", jan }, "*");
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
      }}
      title={fav ? "お気に入りに登録済み" : "お気に入りに追加"}
    >
      {fav ? "♥" : "♡"}
    </button>
  );
}

/** =========================
 *  評価コンポーネント（◎）
 * ========================= */
const CircleRating = ({ value, currentRating, onClick }) => {
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
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${size}px`,
              height: `${size}px`,
              border: `1.5px solid ${value === currentRating ? "#000" : "#bbb"}`,
              borderRadius: "50%",
              boxSizing: "border-box",
              backgroundColor: i === 0 ? "#000" : "transparent",
            }}
          />
        );
      })}
    </div>
  );
};

export default function ProductPage() {
  const [product, setProduct] = useState(null);
  const [rating, setRating] = useState(0);

  const jan = window.location.pathname.split("/").pop();

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("umapData") || "[]");
    const found = data.find((d) => String(d.JAN) === String(jan));
    setProduct(found || null);

    const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
    if (ratings[jan]) setRating(ratings[jan].rating || 0);
  }, [jan]);

  const handleCircleClick = async (value) => {
    const newRating = value === rating ? 0 : value;
    setRating(newRating);

    const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");

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
        const hourStr = `${HH}:00`;
        const targetTime = `${dateStr}T${hourStr}`;

        const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,cloudcover,precipitation,wind_speed_10m,weathercode&timezone=Asia%2FTokyo`;

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

      ratings[jan] = {
        rating: newRating,
        date: new Date().toISOString(),
        weather,
      };
    }

    localStorage.setItem("userRatings", JSON.stringify(ratings));
  };

  if (!product) return <div style={{ padding: 16 }}>商品が見つかりませんでした。</div>;

  const price =
    product.希望小売価格 ??
    product.価格 ??
    1800;

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        maxWidth: "500px",
        margin: "0 auto",
        padding: "16px",
      }}
    >
      {/* 商品画像 */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <img
          src={`/img/${jan}.png`}
          alt="商品画像"
          style={{ maxHeight: 300, objectFit: "contain" }}
          onError={(e) => {
            e.currentTarget.style.opacity = 0.3;
          }}
        />
      </div>

      {/* 商品名 + ハート */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h2 style={{ margin: "8px 0", fontWeight: "bold", fontSize: 20 }}>
          {product.商品名 || "（名称不明）"}
        </h2>
        <HeartButton jan={jan} />
      </div>

      {/* タイプマーク + 価格 */}
      <p style={{ display: "flex", alignItems: "center", margin: "4px 0 12px 0" }}>
        <span
          style={{
            width: 16,
            height: 16,
            backgroundColor: "#651E3E",
            borderRadius: 4,
            marginRight: 8,
          }}
        />
        ¥{Number(price).toLocaleString()}
      </p>

      {/* 味データ */}
      <p style={{ margin: "4px 0" }}>
        Body: {Number(product.BodyAxis).toFixed(2)}, Sweet: {Number(product.SweetAxis).toFixed(2)}
      </p>

      {/* 原産地・年 */}
      <p style={{ margin: "4px 0" }}>
        {product.産地 || product.生産地 || "リオハ, スペイン"} / {product.生産年 || product.収穫年 || "1996"}
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
            {[0, 1, 2, 3, 4, 5].map((v) => (
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

      {/* 解説文 */}
      <div style={{ marginTop: 20, fontSize: 14, lineHeight: 1.6 }}>
        ワインとは、主にブドウから作られたお酒（酒税法上は果実酒に分類）です。
        また、きわめて長い歴史をもつこのお酒は、西洋文明の象徴の一つであると同時に、
        昨今では、世界標準の飲み物と言えるまでになっています。
        ワインとは、主にブドウから作られたお酒（酒税法上は果実酒に分類）です。
        また、きわめて長い歴史をもつこのお酒は、西洋文明の象徴の一つであると同時に、
        昨今では、世界標準の飲み物と言えるまでになっています。
        ワインとは、主にブドウから作られたお酒（酒税法上は果実酒に分類）です。
        また、きわめて長い歴史をもつこのお酒は、西洋文明の象徴の一つであると同時に、
        昨今では、世界標準の飲み物と言えるまでになっています。
        ワインとは、主にブドウから作られたお酒（酒税法上は果実酒に分類）です。
        また、きわめて長い歴史をもつこのお酒は、西洋文明の象徴の一つであると同時に、
        昨今では、世界標準の飲み物と言えるまでになっています。
      </div>
    </div>
  );
}
