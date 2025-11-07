// src/ProductPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { requireRatingOrRedirect } from "../utils/auth";
import "../index.css";
import { createCart } from "../lib/shopify";
import { getVariantGidByJan } from "../lib/ecLinks";

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
  // 自ウィンドウの HeartButton を即時同期
  try {
    window.postMessage({ type: "SET_FAVORITE", jan: jan_code, value: false }, "*");
  } catch {}
  // 親（MapPage 側）にも伝えて同期
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

  const base = process.env.PUBLIC_URL || "";
  const iconSrc = fav ? `${base}/img/store.svg` : `${base}/img/store2.svg`;

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
  const jan_code = useJanParam();
  const [product, setProduct] = useState(null);
  const [rating, setRating] = useState(0);

  // --- Shopify: 今すぐ購入（テスト） ---
  const handleBuyNow = async () => {
    try {
      console.log("[BUY] jan_code=", jan_code);
      const gid = await getVariantGidByJan(jan_code);
      if (!gid) throw new Error("EC対象外（variant未登録）");
      const { checkoutUrl } = await createCart(gid, 1);
      const w = window.open(checkoutUrl, "_blank", "noopener");
      if (!w) window.location.href = checkoutUrl;
    } catch (e) {
      alert(e.message || "購入処理に失敗しました");
      console.error(e);
    }
  };

  // ★は rating>0 なら常に非表示（クエリには依存しない）
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

  useEffect(() => {
    let alive = true;
    const normJAN = (d) =>
      String(d?.jan_code ?? d?.jan_code ?? d?.code ?? d?.barcode ?? "").trim();

    const load = async () => {
      let dataArr = [];
      try {
        dataArr = JSON.parse(localStorage.getItem("umapData") || "[]");
      } catch {}
      let found =
        Array.isArray(dataArr)
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
      try {
        const v = Number(ratingPayload?.rating) || 0;
        setRating(v);
      } catch {}
    };
    window.addEventListener("message", onMsgSnapshot);
    return () => window.removeEventListener("message", onMsgSnapshot);
  }, [jan_code]);

  // 親からの“明示適用”を受けて即時に◎を反映（nullならクリア）
  useEffect(() => {
    const onMsgSet = (e) => {
      const { type, jan: targetJan, rating: payload } = e.data || {};
      if (type !== "SET_RATING") return;
      if (String(targetJan) !== String(jan_code)) return;

      const next = payload && Number(payload?.rating) > 0 ? Number(payload.rating) : 0;
      setRating(next);

      // LSも同期（任意だが再読込時のズレ防止に有効）
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

  // HIDE_HEART メッセージは今後未使用（ratingにより自動で非表示）

  const handleCircleClick = async (value) => {
    if (!requireRatingOrRedirect(navigate, "/my-account")) return;

    const newRating = value === rating ? 0 : value;
    setRating(newRating);

    const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
    let payload = null;

    if (newRating === 0) {
      delete ratings[jan_code]; // 評価解除なら削除
    } else {
      payload = { rating: newRating, date: new Date().toISOString() }; // weatherは付けない
      ratings[jan_code] = payload;
      // ◎ を入れたら「飲みたい」を必ずOFF（一覧に載っていなくても）
      forceFavoriteOff(jan_code);
    }
  

    localStorage.setItem("userRatings", JSON.stringify(ratings));
    postToParent({ type: "RATING_UPDATED", jan: jan_code, payload });
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

      {/* 商品画像 */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <ProductImage jan_code={jan_code} maxHeight={225} />
      </div>

      {/* 商品名 */}
      <h2 style={{ margin: "8px 0", fontWeight: "bold", fontSize: 16 }}>
        {product.商品名 || "（名称不明）"}
      </h2>

      {/* タイプマーク＋価格*/}
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

      {/* 購入へ（テスト） */}
      <div style={{ margin: "8px 0 16px" }}>
        <button
          onClick={handleBuyNow}
          style={{
            display: "inline-block",
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
            fontSize: 14
          }}
        >
          購入へ（テスト）
        </button>
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
        {/* ▼ ここを alignItems: "center" に変更 */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* ★列（固定幅） */}
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
            {/* ▼ 「飲みたい」を少し上げる */}
            <div
              style={{
                fontSize: 12,
                color: "#666",
                alignSelf: "flex-start",
                lineHeight: 1,
                position: "relative",
                top: "-11px",
                marginLeft: "10px" // 横位置を右に動かす
              }}
            >
              {"飲みたい"}
            </div>

            {/* hideHeart の時は visibility で非表示（幅は保持） */}
            <HeartButton jan_code={jan_code} size={28} hidden={rating > 0} />
          </div>

          {/* 縦罫線（常に同じ高さに） */}
          <div
            style={{
              width: 1,
              background: "#d9d9d9",
              marginLeft: "4px",   // ← 左余白を小さく
              marginRight: "12px", // ← 右余白はそのまま
              alignSelf: "stretch",
            }}
          />

          {/* 右側（ラベル + リング） */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ラベル行 */}
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
              <span style={{ flex: 1, textAlign: "center", marginLeft: -175 }}>イマイチ</span>
              <span style={{ flex: "0 0 60px", textAlign: "right", marginLeft: 0 }}>好き</span>
            </div>

            {/* リング行 */}
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

      {/* 説明セクション（末尾余白込み） */}
      <ProductInfoSection />
    </div>
  );
}
