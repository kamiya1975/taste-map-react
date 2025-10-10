// src/ProductPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { requireRatingOrRedirect } from "../utils/auth";
import "../index.css";

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
  try {
    window.parent?.postMessage(payload, "*");
  } catch {}
};

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

const notifyParentClosed = (jan) => {
  postToParent({ type: "PRODUCT_CLOSED", jan, clear: true });
  clearScanHints(jan);
  try {
    const bc = new BroadcastChannel("product_bridge");
    bc.postMessage({ type: "PRODUCT_CLOSED", jan, clear: true, at: Date.now() });
    bc.close();
  } catch {}
};

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
    if (favs[jan]) delete favs[jan];
    else favs[jan] = { addedAt: new Date().toISOString() };
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

function ProductImage({ jan, maxHeight = 225 }) {
  const [loaded, setLoaded] = useState(() => {
    const img = new Image();
    img.src = `${process.env.PUBLIC_URL || ""}/img/${jan}.png`;
    return img.complete && img.naturalWidth > 0;
  });

  const [src, setSrc] = useState(`${process.env.PUBLIC_URL || ""}/img/${jan}.png`);
  const wasCachedRef = React.useRef(false);
  const imgElRef = React.useRef(null);

  const setImgRef = React.useCallback((node) => {
    if (node) wasCachedRef.current = node.complete && node.naturalWidth > 0;
    imgElRef.current = node;
  }, []);

  useEffect(() => {
    setLoaded(false);
    setSrc(`${process.env.PUBLIC_URL || ""}/img/${jan}.png`);
  }, [jan]);

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
      style={{
        // 固定余白 + セーフエリア（envが0でも固定分は効く）
        paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* 商品キャッチ＋コメント */}
      <div style={{ marginTop: 20, fontSize: 14, lineHeight: 1.6 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>
          ひと口で広がる華やかな香りと余韻
        </div>
        <div>
          このワインは、飲み始めから最後の一滴まで一貫して心地よい調和を感じさせる仕上がりです。グラスを近づけた瞬間に広がる華やかなアロマは、熟した果実の甘やかさと爽やかな酸味を同時に連想させます。口に含むと、果実味の豊かさと引き締まった酸がバランスよく調和し、余韻にはほのかなスパイスと樽由来の複雑さが重なります。ミディアムボディながら深みを備え、軽やかさと重厚感の両方を楽しめる点が特徴です。赤身の肉料理やトマトソースを使ったパスタと合わせることで、お互いの味わいをより引き立て合います。日常の食卓にも特別な日の演出にもふさわしい万能な一本として、幅広いシーンで活躍するワインです。
        </div>
      </div>

      {/* スペース */}
      <div style={{ height: 20 }} />

      {/* 生産者キャッチ＋コメント */}
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>
          伝統と革新が息づく情熱の造り手
        </div>
        <div>
          このワインを手掛ける生産者は、長年培ってきた伝統的な醸造技術と最新の研究成果を融合させ、常に最高品質のワインを追求してきました。畑は恵まれた気候と土壌条件に支えられ、手摘みによる収穫や徹底した温度管理が実施されています。小規模ながらも丁寧なアプローチを大切にし、一房一房に生産者のこだわりが込められています。また、持続可能な農業にも力を注ぎ、環境に配慮した栽培と醸造を実践。そうした取り組みが、複雑さと繊細さを併せ持つ独自のスタイルを生み出しています。地域を代表する存在として国内外から高く評価され、受賞歴も多数。造り手の情熱と土地の恵みが見事に調和した一本が、グラスを通して飲む人の心に語りかけます。
        </div>
      </div>

      {/* スペース */}
      <div style={{ height: 20 }} />

      {/* 基本情報（評価欄と同じ直線で囲む） */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 8,
          paddingBottom: 8,
          borderTop: "1px solid #ccc",
          borderBottom: "1px solid #ccc",
          marginBottom: 0, // 末尾marginは相殺されがちなので0
        }}
      >
        <div style={{ fontSize: 14, lineHeight: 1.9 }}>
          {[
            ["タイプ", "赤ワイン"],
            ["商品名", "プティ・ムートン"],
            ["生産者名", "シャトー・ムートン・ロートシルト"],
            ["生産国", "フランス"],
            ["生産地", "ボルドー"],
            ["容量", "750ml"],
            ["ブドウ品種", "カベルネ・ソーヴィニョン、メルロー、マルベック、プティ・ヴェルド他"],
            ["成分分析", "2024年産：酒類総合情報センター調べ"],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", marginTop: 2 }}>
              <div style={{ width: 96, flexShrink: 0 }}>{label}</div>
              <div style={{ flex: 1 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ページ終端の余白（保険） */}
      <div style={{ height: 100 }} />
    </div>
  );
}

/** =========================
 *  ProductPage（default export）
 * ========================= */
export default function ProductPage() {
  const navigate = useNavigate();
  const jan = useJanParam();
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

  useEffect(() => {
    let alive = true;
    const normJAN = (d) =>
      String(d?.JAN ?? d?.jan ?? d?.code ?? d?.barcode ?? "").trim();

    const load = async () => {
      let dataArr = [];
      try {
        dataArr = JSON.parse(localStorage.getItem("umapData") || "[]");
      } catch {}
      let found =
        Array.isArray(dataArr)
          ? dataArr.find((d) => normJAN(d) === String(jan).trim())
          : null;

      if (!found) {
        try {
          const url = `${process.env.PUBLIC_URL || ""}/UMAP_PCA_coordinates.json`;
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            const arr = Array.isArray(json) ? json : [];
            found = arr.find((d) => normJAN(d) === String(jan).trim()) || null;
            try {
              localStorage.setItem("umapData", JSON.stringify(arr));
            } catch {}
          }
        } catch (e) {
          console.warn("UMAP_PCA_coordinates.json の読込に失敗:", e);
        }
      }

      if (!alive) return;
      setProduct(found || null);

      try {
        const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
        if (ratings[jan]) setRating(ratings[jan].rating ?? 0);
      } catch {}
    };

    load();
    return () => { alive = false; };
  }, [jan]);

  useEffect(() => {
    const onMsgSnapshot = (e) => {
      const { type, jan: targetJan, rating: ratingPayload, hideHeart } = e.data || {};
      if (type !== "STATE_SNAPSHOT") return;
      if (String(targetJan) !== String(jan)) return;
      try {
        setRating(ratingPayload?.rating ?? 0);
        if (typeof hideHeart === "boolean") setHideHeart(hideHeart);
      } catch {}
    };
    window.addEventListener("message", onMsgSnapshot);
    return () => window.removeEventListener("message", onMsgSnapshot);
  }, [jan]);

  useEffect(() => {
    const onMsgHide = (e) => {
      const { type, jan: targetJan, value } = e.data || {};
      if (String(targetJan) !== String(jan)) return;
      if (type === "HIDE_HEART") setHideHeart(Boolean(value));
    };
    window.addEventListener("message", onMsgHide);
    return () => window.removeEventListener("message", onMsgHide);
  }, [jan]);

  const handleCircleClick = async (value) => {
    if (!requireRatingOrRedirect(navigate, "/my-account")) return;
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

  // Typeごとの色マップ
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
      {/* 左上に固定の♡ */}
      {!hideHeart && (
        <div style={{ position: "fixed", top: 12, left: 12, zIndex: 1000 }}>
          <HeartButton jan={jan} size={22} />
        </div>
      )}

      {/* 商品画像 */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <ProductImage jan={jan} maxHeight={225} />
      </div>

      {/* 商品名 */}
      <h2 style={{ margin: "8px 0", fontWeight: "bold", fontSize: 16 }}>
        {product.商品名 || "（名称不明）"}
      </h2>

      {/* タイプマーク＋価格＋産地/年 */}
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
        <span style={{ marginLeft: 24 }}>
          {(product.産地 || product.生産地 || "シチリア / イタリア")} /{" "}
          {(product.ヴィンテージ || product.ビンテージ || product.年 || product.vintage || "-")}
        </span>
      </div>

      {/* 味データ */}
      <p style={{ margin: "4px 0" }}>
        Sweet: {Number(product.PC2).toFixed(2)} / Body: {Number(product.PC1).toFixed(2)}
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
          <div style={{ fontWeight: "bold", fontSize: 16, minWidth: 48, whiteSpace: "nowrap" }}>
            評価
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, width: "100%", maxWidth: 300 }}>
            {[1, 2, 3, 4, 5].map((v) => (
              <CircleRating key={v} value={v} currentRating={rating} onClick={handleCircleClick} />
            ))}
          </div>
        </div>
      </div>

      {/* 説明セクション（末尾余白込み） */}
      <ProductInfoSection />
    </div>
  );
}
