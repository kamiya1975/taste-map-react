// src/SliderPage.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

/* =========================
   小ユーティリティ
========================= */
const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const median = (arr) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const dist2 = (x1, y1, x2, y2) => {
  const dx = x1 - x2, dy = y1 - y2;
  return dx * dx + dy * dy;
};
function invert3x3(M) {
  const [[a,b,c],[d,e,f],[g,h,i]] = M;
  const A = e*i - f*h,  B = -(d*i - f*g), C = d*h - e*g;
  const D = -(b*i - c*h), E = a*i - c*g,  F = -(a*h - b*g);
  const G = b*f - c*e,  H = -(a*f - c*d), I = a*e - b*d;
  const det = a*A + b*B + c*C;
  if (Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  return [[A*k,D*k,G*k],[B*k,E*k,H*k],[C*k,F*k,I*k]];
}
function multiplyMatVec(M, v) {
  return [
    M[0][0]*v[0] + M[0][1]*v[1] + M[0][2]*v[2],
    M[1][0]*v[0] + M[1][1]*v[1] + M[1][2]*v[2],
    M[2][0]*v[0] + M[2][1]*v[1] + M[2][2]*v[2],
  ];
}
function fitLocalAffineAndPredict(px, py, neigh) {
  if (neigh.length < 3) {
    let wsum = 0, u1 = 0, u2 = 0;
    for (const n of neigh) { wsum += n.w; u1 += n.w*n.UMAP1; u2 += n.w*n.UMAP2; }
    if (!wsum) return [0,0];
    return [u1/wsum, u2/wsum];
  }
  let Sxx=0,Sxy=0,Sx1=0,Syx=0,Syy=0,Sy1=0,S1x=0,S1y=0,S11=0;
  let Tx1=0,Ty1=0,T11=0, Tx2=0,Ty2=0,T12=0;
  for (const n of neigh) {
    const w=n.w,x=n.PCA1,y=n.PCA2,u1=n.UMAP1,u2=n.UMAP2;
    const wx=w*x, wy=w*y;
    Sxx+=wx*x; Sxy+=wx*y; Sx1+=wx;
    Syx+=wy*x; Syy+=wy*y; Sy1+=wy;
    S1x+=w*x;  S1y+=w*y;  S11+=w;
    Tx1+=wx*u1; Ty1+=wy*u1; T11+=w*u1;
    Tx2+=wx*u2; Ty2+=wy*u2; T12+=w*u2;
  }
  const M=[[Sxx,Sxy,Sx1],[Syx,Syy,Sy1],[S1x,S1y,S11]];
  const invM=invert3x3(M);
  if (!invM) {
    let wsum=0,u1=0,u2=0; for (const n of neigh){wsum+=n.w;u1+=n.w*n.UMAP1;u2+=n.w*n.UMAP2;}
    if (!wsum) return [0,0]; return [u1/wsum,u2/wsum];
  }
  const a1=multiplyMatVec(invM,[Tx1,Ty1,T11]);
  const a2=multiplyMatVec(invM,[Tx2,Ty2,T12]);
  return [a1[0]*px + a1[1]*py + a1[2], a2[0]*px + a2[1]*py + a2[2]];
}

/* =========================
   画像（中央固定のコンパス）
   /public/img/compass.png を想定
========================= */
const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;

/* =========================
   背景の罫線（SVGタイル）を画像として埋め込み
   → backgroundPosition を更新して動かす
========================= */
const RINGS_SVG = (() => {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='360' height='360' viewBox='0 0 360 360'>
      <defs>
        <g id='rings'>
          ${Array.from({length:9}, (_,i) => {
            const r = 40 + i*25; // 半径
            const w = i%2===0 ? 3 : 2; // 太さをわずかに揺らす
            const op = 0.22 + i*0.02;
            return `<circle cx='180' cy='180' r='${r}' fill='none' stroke='black' stroke-opacity='${op}' stroke-width='${w}' />`;
          }).join("")}
        </g>
      </defs>
      <rect width='100%' height='100%' fill='white'/>
      <use href='#rings' />
    </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
})();

/* =========================
   SliderPage
========================= */
function SliderPage() {
  const navigate = useNavigate();

  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);

  const [minMax, setMinMax] = useState(null);
  const [blendF, setBlendF] = useState(null);
  const [dataset, setDataset] = useState([]);

  // 罫線の移動感度（必要に応じて 3〜10 の間で調整）
  const BG_SENSITIVITY = 6;

  // 甘味：右へ動かす → 背景は左（Xマイナス）
  // コク：右へ動かす → 背景は下（Yプラス）
  const offsetX = (50 - sweetness) * BG_SENSITIVITY;
  const offsetY = (body - 50) * BG_SENSITIVITY;

  useEffect(() => {
    fetch("UMAP_PCA_coordinates.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) return;

        const hasSweetBody = "SweetAxis" in data[0] && "BodyAxis" in data[0];
        const sweetKey = hasSweetBody ? "SweetAxis" : "UMAP2";
        const bodyKey  = hasSweetBody ? "BodyAxis"  : "UMAP1";

        const sweetValues = data.map((d) => num(d[sweetKey]));
        const bodyValues  = data.map((d) => num(d[bodyKey]));

        const minSweet = Math.min(...sweetValues);
        const maxSweet = Math.max(...sweetValues);
        const minBody  = Math.min(...bodyValues);
        const maxBody  = Math.max(...bodyValues);
        setMinMax({ minSweet, maxSweet, minBody, maxBody, sweetKey, bodyKey });

        const foundBlend = data.find((d) => String(d.JAN) === "blendF");
        setBlendF(foundBlend
          ? { SweetAxis: num(foundBlend[sweetKey]), BodyAxis: num(foundBlend[bodyKey]) }
          : { SweetAxis: median(sweetValues),        BodyAxis: median(bodyValues) }
        );

        const rows = data.map((d) => ({
          JAN: String(d.JAN ?? ""),
          PCA1: num(d[bodyKey]),
          PCA2: num(d[sweetKey]),
          UMAP1: num(d.UMAP1),
          UMAP2: num(d.UMAP2),
        })).filter(r =>
          Number.isFinite(r.PCA1) && Number.isFinite(r.PCA2) &&
          Number.isFinite(r.UMAP1) && Number.isFinite(r.UMAP2)
        );
        setDataset(rows);
      })
      .catch((e) => console.error("データ取得エラー:", e));
  }, []);

  function pcaToUmap(px, py, k = 20) {
    if (!dataset.length) return [0, 0];
    const eps = 1e-6;
    const withDist = dataset.map((d) => {
      const d2 = dist2(px, py, d.PCA1, d.PCA2);
      return { ...d, d2, w: 1/(d2+eps) };
    });
    withDist.sort((a,b)=>a.d2-b.d2);
    const neigh = withDist.slice(0, Math.min(k, withDist.length));
    return fitLocalAffineAndPredict(px, py, neigh);
  }

  const handleNext = () => {
    if (!minMax || !blendF) return;
    const { minSweet, maxSweet, minBody, maxBody } = minMax;

    const sweetValue =
      sweetness <= 50
        ? blendF.SweetAxis - ((50 - sweetness) / 50) * (blendF.SweetAxis - minSweet)
        : blendF.SweetAxis + ((sweetness - 50) / 50) * (maxSweet - blendF.SweetAxis);

    const bodyValue =
      body <= 50
        ? blendF.BodyAxis - ((50 - body) / 50) * (blendF.BodyAxis - minBody)
        : blendF.BodyAxis + ((body - 50) / 50) * (maxBody - blendF.BodyAxis);

    // 初回のみ保存（UMAPの実値）
    const already = localStorage.getItem("userPinCoords");
    if (!already) {
      localStorage.setItem(
        "userPinCoords",
        JSON.stringify({ coordsUMAP: [bodyValue, sweetValue], version: 2 })
      );
    }
    navigate("/map", { state: { centerOnUserPin: true } });
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        overflow: "hidden",
        fontFamily: "sans-serif",
        backgroundColor: "#fff",
      }}
    >
      {/* === 背景の罫線（SVGタイル） === */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("${RINGS_SVG}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "360px 360px",
          // スライダー操作で罫線が動く
          backgroundPosition: `${offsetX}px ${offsetY}px`,
          zIndex: 0,
          willChange: "background-position",
          transition: "background-position 90ms ease-out",
        }}
      />

      {/* === 中央固定のコンパス === */}
      <img
        src={COMPASS_URL}
        alt="基準のワイン（コンパス）"
        style={{
          position: "absolute",
          left: "50%",
          top: "45%",
          transform: "translate(-50%, -50%)",
          width: 160,
          height: 160,
          zIndex: 2,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />

      {/* タイトル */}
      <h2
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 16,
          margin: 0,
          textAlign: "center",
          fontSize: 20,
          fontWeight: 700,
          color: "#111",
          zIndex: 3,
          textShadow: "0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        基準のワインを飲んだ印象は？
      </h2>

      {/* === スライダー群 === */}
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 96,
          zIndex: 3,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(4px)",
          borderRadius: 12,
          boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
          padding: "18px 16px",
        }}
      >
        {/* 甘味 */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            <span>← こんなに甘みは不要</span>
            <span>もっと甘みが欲しい →</span>
          </div>
          <input
            type="range" min="0" max="100" value={sweetness}
            onChange={(e) => setSweetness(Number(e.target.value))}
            style={{
              width: "100%", appearance: "none", height: 8, borderRadius: 5,
              background: `linear-gradient(to right, #0d6efd ${sweetness}%, #e5e7eb ${sweetness}%)`,
              outline: "none", WebkitAppearance: "none",
            }}
          />
        </div>

        {/* コク */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            <span>← もっと軽やかが良い</span>
            <span>濃厚なコクが欲しい →</span>
          </div>
          <input
            type="range" min="0" max="100" value={body}
            onChange={(e) => setBody(Number(e.target.value))}
            style={{
              width: "100%", appearance: "none", height: 8, borderRadius: 5,
              background: `linear-gradient(to right, #0d6efd ${body}%, #e5e7eb ${body}%)`,
              outline: "none", WebkitAppearance: "none",
            }}
          />
        </div>
      </div>

      {/* 地図生成 */}
      <button
        onClick={handleNext}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 24,
          transform: "translateX(-50%)",
          background: "#fff", color: "#0d6efd",
          padding: "14px 30px", fontSize: 16, fontWeight: 800,
          border: "2px solid #0d6efd", borderRadius: 8, cursor: "pointer",
          zIndex: 3, boxShadow: "0 6px 16px rgba(13,110,253,0.2)",
        }}
      >
        地図生成
      </button>
    </div>
  );
}

export default SliderPage;
