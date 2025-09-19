// src/SliderPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ====== 小ユーティリティ ======
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

// 重み付き最小二乗（ローカルアフィン）
function fitLocalAffineAndPredict(px, py, neigh) {
  if (neigh.length < 3) {
    let wsum = 0, u1 = 0, u2 = 0;
    for (const n of neigh) { wsum += n.w; u1 += n.w * n.UMAP1; u2 += n.w * n.UMAP2; }
    if (!wsum) return [0, 0];
    return [u1 / wsum, u2 / wsum];
  }
  let Sxx=0,Sxy=0,Sx1=0,Syx=0,Syy=0,Sy1=0,S1x=0,S1y=0,S11=0;
  let Tx1=0,Ty1=0,T11=0, Tx2=0,Ty2=0,T12=0;
  for (const n of neigh) {
    const w=n.w,x=n.PCA1,y=n.PCA2,u1=n.UMAP1,u2=n.UMAP2; const wx=w*x, wy=w*y;
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
    if (!wsum) return [0,0];
    return [u1/wsum,u2/wsum];
  }
  const a1=multiplyMatVec(invM,[Tx1,Ty1,T11]);
  const a2=multiplyMatVec(invM,[Tx2,Ty2,T12]);
  return [a1[0]*px+a1[1]*py+a1[2], a2[0]*px+a2[1]*py+a2[2]];
}
function invert3x3(M){
  const [[a,b,c],[d,e,f],[g,h,i]]=M;
  const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g;
  const D=-(b*i-c*h), E=a*i-c*g, F=-(a*h-b*g);
  const G=b*f-c*e, H=-(a*f-c*d), I=a*e-b*d;
  const det=a*A+b*B+c*C; if (Math.abs(det)<1e-12) return null;
  const s=1/det; return [[A*s,D*s,G*s],[B*s,E*s,H*s],[C*s,F*s,I*s]];
}
function multiplyMatVec(M,v){return [M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2], M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2], M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]];}

export default function SliderPage() {
  const navigate = useNavigate();
  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);
  const [minMax, setMinMax] = useState(null);
  const [blendF, setBlendF] = useState(null);
  const [dataset, setDataset] = useState([]);

  useEffect(() => {
    fetch("UMAP_PCA_coordinates.json")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        if (!Array.isArray(data) || !data.length) return;
        const hasSweetBody = "SweetAxis" in data[0] && "BodyAxis" in data[0];
        const sweetKey = hasSweetBody ? "SweetAxis" : "UMAP2";
        const bodyKey  = hasSweetBody ? "BodyAxis"  : "UMAP1";

        const sweetValues = data.map((d) => num(d[sweetKey]));
        const bodyValues  = data.map((d) => num(d[bodyKey]));
        setMinMax({
          minSweet: Math.min(...sweetValues),
          maxSweet: Math.max(...sweetValues),
          minBody:  Math.min(...bodyValues),
          maxBody:  Math.max(...bodyValues),
          sweetKey, bodyKey,
        });

        const b = data.find((d) => String(d.JAN) === "blendF");
        setBlendF(
          b
            ? { SweetAxis: num(b[sweetKey]), BodyAxis: num(b[bodyKey]) }
            : { SweetAxis: median(sweetValues), BodyAxis: median(bodyValues) }
        );

        const rows = data
          .map((d) => ({
            JAN: String(d.JAN ?? ""),
            PCA1: num(d[bodyKey]),
            PCA2: num(d[sweetKey]),
            UMAP1: num(d.UMAP1),
            UMAP2: num(d.UMAP2),
          }))
          .filter(
            (r) =>
              Number.isFinite(r.PCA1) &&
              Number.isFinite(r.PCA2) &&
              Number.isFinite(r.UMAP1) &&
              Number.isFinite(r.UMAP2)
          );
        setDataset(rows);
      })
      .catch((e) => console.error(e));
  }, []);

  function pcaToUmap(px, py, k = 20) {
    if (!dataset.length) return [0, 0];
    const eps = 1e-6;
    const neigh = dataset
      .map((d) => {
        const d2 = dist2(px, py, d.PCA1, d.PCA2);
        return { ...d, d2, w: 1 / (d2 + eps) };
      })
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, Math.min(k, dataset.length));
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

    // 初回のみ保存（UMAP実座標）
    if (!localStorage.getItem("userPinCoords")) {
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
        padding: 16,
        fontFamily: "sans-serif",
        background: "#fff",
        minHeight: "100vh",
        boxSizing: "border-box",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {/* ヘッダー（スクショ準拠） */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          borderBottom: "1px solid #eee",
          paddingBottom: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>嗜好スライダー</h2>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "#f2f2f2",
            border: "1px solid #dcdcdc",
            borderRadius: 6,
            fontSize: 13,
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          閉じる
        </button>
      </div>

      {/* 説明 */}
      <p style={{ fontWeight: 700, margin: "12px 0 20px" }}>
        基準のワインを飲んだ印象は？
      </p>

      {/* 甘味スライダー */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            marginBottom: 8,
          }}
        >
          <span>← こんなに甘みは不要</span>
          <span>もっと甘みが欲しい →</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={sweetness}
          onChange={(e) => setSweetness(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>

      {/* コクスライダー */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            marginBottom: 8,
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
          style={{ width: "100%" }}
        />
      </div>

      {/* 生成ボタン（ベージュ・太字） */}
      <button
        onClick={handleNext}
        style={{
          width: "100%",
          padding: "16px 18px",
          background: "#f5e9dd",
          border: "none",
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        あなたの好みからMAPを生成
      </button>
    </div>
  );
}
