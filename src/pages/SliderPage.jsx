// src/pages/SliderPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import PanelHeader from "../components/ui/PanelHeader";
import { getReferenceLotById } from "../ui/constants";

/* ============ 小ユーティリティ（既存） ============ */
const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
//const median = (arr) => { if (!arr.length) return 0; const a=[...arr].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; };
const dist2 = (x1, y1, x2, y2) => {
  const dx = x1 - x2,
    dy = y1 - y2;
  return dx * dx + dy * dy;
};
const centerGradient = (val) => {
  const base = "#e9e9e9",
    active = "#b59678"; // ← 見本の色味
  const v = Math.max(0, Math.min(100, Number(val)));
  if (v === 50) return base;
  const a = Math.min(50, v),
    b = Math.max(50, v);
  return `linear-gradient(to right, ${base} 0%, ${base} ${a}%, ${active} ${a}%, ${active} ${b}%, ${base} ${b}%, ${base} 100%)`;
};

// 逆行列/近傍写像（既存）
function invert3x3(M) {
  const [
    [a, b, c],
    [d, e, f],
    [g, h, i],
  ] = M;
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const D = -(b * i - c * h),
    E = a * i - c * g,
    F = -(a * h - b * g);
  const G = b * f - c * e,
    H = -(a * f - c * d),
    I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const s = 1 / det;
  return [
    [A * s, D * s, G * s],
    [B * s, E * s, H * s],
    [C * s, F * s, I * s],
  ];
}
function mulMatVec(M, v) {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}
function fitLocalAffineAndPredict(px, py, neigh) {
  if (neigh.length < 3) {
    let wsum = 0,
      u1 = 0,
      u2 = 0;
    for (const n of neigh) {
      wsum += n.w;
      u1 += n.w * n.UMAP1;
      u2 += n.w * n.UMAP2;
    }
    if (!wsum) return [0, 0];
    return [u1 / wsum, u2 / wsum];
  }
  let Sxx = 0,
    Sxy = 0,
    Sx1 = 0,
    Syx = 0,
    Syy = 0,
    Sy1 = 0,
    S1x = 0,
    S1y = 0,
    S11 = 0,
    Tx1 = 0,
    Ty1 = 0,
    T11 = 0,
    Tx2 = 0,
    Ty2 = 0,
    T12 = 0;
  for (const n of neigh) {
    const w = n.w,
      x = n.PC1,
      y = n.PC2,
      u1 = n.UMAP1,
      u2 = n.UMAP2;
    const wx = w * x,
      wy = w * y;
    Sxx += wx * x;
    Sxy += wx * y;
    Sx1 += wx;
    Syx += wy * x;
    Syy += wy * y;
    Sy1 += wy;
    S1x += w * x;
    S1y += w * y;
    S11 += w;
    Tx1 += wx * u1;
    Ty1 += wy * u1;
    T11 += w * u1;
    Tx2 += wx * u2;
    Ty2 += wy * u2;
    T12 += w * u2;
  }
  const M = [
      [Sxx, Sxy, Sx1],
      [Syx, Syy, Sy1],
      [S1x, S1y, S11],
    ],
    invM = invert3x3(M);
  if (!invM) {
    let wsum = 0,
      u1 = 0,
      u2 = 0;
    for (const n of neigh) {
      wsum += n.w;
      u1 += n.w * n.UMAP1;
      u2 += n.w * n.UMAP2;
    }
    if (!wsum) return [0, 0];
    return [u1 / wsum, u2 / wsum];
  }
  const a1 = mulMatVec(invM, [Tx1, Ty1, T11]);
  const a2 = mulMatVec(invM, [Tx2, Ty2, T12]);
  return [a1[0] * px + a1[1] * py + a1[2], a2[0] * px + a2[1] * py + a2[2]];
}

// ロットID解決（state → localStorage → URLクエリ → デフォルト）
const resolveReferenceLotId = (location) => {
  // 1) Map からの遷移時に state で渡された lotId
  const stateLot = location?.state?.referenceLotId;
  if (stateLot) return stateLot;

  // 2) 過去に保存した lotId
  try {
    const saved = localStorage.getItem("referenceLotId");
    if (saved) return saved;
  } catch {
    // ignore
  }

  // 3) URL クエリ ?lot=rw1_2026_08 など
  if (location?.search) {
    const params = new URLSearchParams(location.search);
    const qLot = params.get("lot");
    if (qLot) return qLot;
  }

  // 4) デフォルト（初回ロット）
  return "rw1_2025_11";
};

export default function SliderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedStore = location.state?.selectedStore;

  // スクロールロック（このページのみ）
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevOverscroll = document.documentElement.style.overscrollBehaviorY;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehaviorY = "none";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.style.overscrollBehaviorY = prevOverscroll;
    };
  }, []);

  // 直接来た人は店舗選択へ
  useEffect(() => {
    const saved = localStorage.getItem("selectedStore");
    const cameFromMap = location.state?.from === "map";
    if (!selectedStore && !saved && !cameFromMap) {
      navigate("/store", { replace: true });
    }
  }, [selectedStore, navigate, location.state]);

  /* ---------- UI 状態 ---------- */
  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);

  /* ---------- データ読込 & 写像 ---------- */
  const [rows, setRows] = useState([]);
  const [referenceLot, setReferenceLot] = useState(null); // ← 基準ワイン（ロット）情報
  const [pcMinMax, setPcMinMax] = useState(null);

  // 基準ワインロットの決定
  useEffect(() => {
    const lotId = resolveReferenceLotId(location);
    const lot = getReferenceLotById(lotId);
    setReferenceLot(lot);
    try {
      localStorage.setItem("referenceLotId", lot.lotId);
    } catch {
      // ignore
    }
  }, [location]);

  // UMAP座標＆PC1/PC2 全体分布の読み込み
  useEffect(() => {
    const url = `${process.env.PUBLIC_URL || ""}/umap_coords_c.json`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const cleaned = (data || [])
          .map((d) => ({
            JAN: String(d.jan_code ?? ""),
            PC1: num(d.PC1),
            PC2: num(d.PC2),
            UMAP1: num(d.umap_x),
            UMAP2: num(d.umap_y),
          }))
          .filter(
            (r) =>
              Number.isFinite(r.PC1) &&
              Number.isFinite(r.PC2) &&
              Number.isFinite(r.UMAP1) &&
              Number.isFinite(r.UMAP2)
          );

        setRows(cleaned);
        if (cleaned.length) {
          const pc1s = cleaned.map((r) => r.PC1);
          const pc2s = cleaned.map((r) => r.PC2);
          setPcMinMax({
            minPC1: Math.min(...pc1s),
            maxPC1: Math.max(...pc1s),
            minPC2: Math.min(...pc2s),
            maxPC2: Math.max(...pc2s),
          });
        } else {
          setPcMinMax(null);
        }
      })
      .catch((e) => console.error("load failed:", e));
  }, []);

  const pca2umap = (px, py, k = 20) => {
    if (!rows.length) return [0, 0];
    const eps = 1e-6;
    const neigh = rows
      .map((d) => {
        const d2 = dist2(px, py, d.PC1, d.PC2);
        return { ...d, d2, w: 1 / (d2 + eps) };
      })
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, Math.min(k, rows.length));
    return fitLocalAffineAndPredict(px, py, neigh);
  };

  const handleGenerate = () => {
    if (!referenceLot || !pcMinMax || !rows.length) return;
    const { minPC1, maxPC1, minPC2, maxPC2 } = pcMinMax;

    // ロットごとの基準点（PC空間）
    const basePC1 = referenceLot.pc1;
    const basePC2 = referenceLot.pc2;

    // 0-100(中央50) → PC空間へ線形補間
    const pc1Value =
      body <= 50
        ? basePC1 - ((50 - body) / 50) * (basePC1 - minPC1)
        : basePC1 + ((body - 50) / 50) * (maxPC1 - basePC1);

    const pc2Value =
      sweetness <= 50
        ? basePC2 - ((50 - sweetness) / 50) * (basePC2 - minPC2)
        : basePC2 + ((sweetness - 50) / 50) * (maxPC2 - basePC2);

    const [umapX, umapY] = pca2umap(pc1Value, pc2Value);

    // ユーザー嗜好ピンを保存（どのロットを基準にしたかも一緒に）
    localStorage.setItem(
      "userPinCoords",
      JSON.stringify({
        coordsUMAP: [umapX, umapY],
        version: 2,
        referenceLotId: referenceLot.lotId,
      })
    );
    try {
      sessionStorage.setItem("tm_center_on_userpin", "1");
    } catch {}
    try {
      sessionStorage.setItem("tm_autopen_nearest", "1");
    } catch {}

    // ガイドドロワーを一度だけ開く（?open=guide）
    navigate("/map?open=guide", { state: { centerOnUserPin: true } });
  };

  /* ---------- スタイル（簡潔） ---------- */
  const pagePad = "16px";
  const cardW = "min(480px, 92svw)";

  const disabled = !referenceLot || !pcMinMax || !rows.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        fontFamily: "sans-serif",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PanelHeader
        title="基準のワイン"
        onBack={() => navigate(-1)}
        onClose={() => navigate("/map", { replace: true })}
        icon="bar.svg"
      />

      <div
        style={{
          padding: pagePad,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        {/* 見出し */}
        <p
          style={{
            fontWeight: 700,
            fontSize: 16,
            margin: "8px 0 4px",
            textAlign: "center",
            width: cardW,
          }}
        >
          基準のワインを飲んだ印象は？
        </p>

        {/* 現在のロット表示（任意） */}
        {referenceLot && (
          <p
            style={{
              fontSize: 12,
              color: "#555",
              margin: "0 0 16px",
              textAlign: "center",
              width: cardW,
            }}
          >
            現在のロット：{referenceLot.label}
          </p>
        )}

        {/* スライダーCSS（中央を強調） */}
        <style>{`
          .taste-slider{ appearance:none; -webkit-appearance:none; width:100%; height:6px; background:transparent; margin-top:6px; outline:none; }
          .taste-slider::-webkit-slider-runnable-track{ height:6px; border-radius:9999px; background:var(--range,#e9e9e9); }
          .taste-slider::-moz-range-track{ height:6px; border-radius:9999px; background:var(--range,#e9e9e9); }
          .taste-slider::-webkit-slider-thumb{ -webkit-appearance:none; width:22px; height:22px; border-radius:50%; background:#262626; border:0; box-shadow:0 1px 2px rgba(0,0,0,.25); margin-top:-8px; cursor:pointer; }
          .taste-slider::-moz-range-thumb{ width:22px; height:22px; border-radius:50%; background:#262626; border:0; box-shadow:0 1px 2px rgba(0,0,0,.25); cursor:pointer; }
        `}</style>

        {/* 甘み */}
        <div style={{ width: cardW, marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            <span>← こんなに甘味は不要</span>
            <span>もっと甘みが欲しい →</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={sweetness}
            onChange={(e) => setSweetness(Number(e.target.value))}
            className="taste-slider"
            style={{ "--range": centerGradient(sweetness) }}
          />
        </div>

        {/* コク（ボディ） */}
        <div style={{ width: cardW, marginBottom: 36 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            <span>← もっと軽やかが良い</span>
            <span>濃厚なコクが欲しい →</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={body}
            onChange={(e) => setBody(Number(e.target.value))}
            className="taste-slider"
            style={{ "--range": centerGradient(body) }}
          />
        </div>

        {/* 生成ボタン */}
        <button
          onClick={handleGenerate}
          style={{
            alignSelf: "center",
            marginTop: 60,
            marginBottom: 8,
            width: "min(calc(100svw - 32px), calc(100svh - 34svh))",
            maxWidth: 560,
            padding: "14px 16px",
            lineHeight: 1.2,
            background: "rgb(230,227,219)",
            color: "#000",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: disabled ? "default" : "pointer",
            boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
            WebkitBackdropFilter: "blur(2px)",
            backdropFilter: "blur(2px)",
            opacity: disabled ? 0.6 : 1,
          }}
          disabled={disabled}
        >
          あなたの好みからMAPを生成
        </button>
      </div>
    </div>
  );
}
