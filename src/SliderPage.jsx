// src/SliderPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

// ===== 小ユーティリティ =====
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
/** スライダーの中央グラデーション（MapPage と同じ） */
const centerGradient = (val) => {
  const base = "#e9e9e9";
  const active = "#b59678";
  const v = Math.max(0, Math.min(100, Number(val)));
  if (v === 50) return base;
  const a = Math.min(50, v);
  const b = Math.max(50, v);
  return `linear-gradient(to right, ${base} 0%, ${base} ${a}%, ${active} ${a}%, ${active} ${b}%, ${base} ${b}%, ${base} 100%)`;
};

// ===== 3x3 逆行列（局所アフィン用）
function invert3x3(M){
  const [[a,b,c],[d,e,f],[g,h,i]] = M;
  const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g;
  const D=-(b*i-c*h), E=a*i-c*g, F=-(a*h-b*g);
  const G=b*f-c*e, H=-(a*f-c*d), I=a*e-b*d;
  const det=a*A+b*B+c*C;
  if (Math.abs(det)<1e-12) return null;
  const s=1/det; return [[A*s,D*s,G*s],[B*s,E*s,H*s],[C*s,F*s,I*s]];
}
function mulMatVec(M,v){return [M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2], M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2], M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]];}

// 重み付き最小二乗でローカルアフィン（PCA→UMAP）を推定して予測
function fitLocalAffineAndPredict(px, py, neigh) {
  if (neigh.length < 3) {
    let wsum=0,u1=0,u2=0;
    for (const n of neigh){wsum+=n.w;u1+=n.w*n.UMAP1;u2+=n.w*n.UMAP2;}
    if (!wsum) return [0,0];
    return [u1/wsum,u2/wsum];
  }
  let Sxx=0,Sxy=0,Sx1=0,Syx=0,Syy=0,Sy1=0,S1x=0,S1y=0,S11=0;
  let Tx1=0,Ty1=0,T11=0, Tx2=0,Ty2=0,T12=0;
  for (const n of neigh) {
    const w=n.w,x=n.PC1,y=n.PC2,u1=n.UMAP1,u2=n.UMAP2;
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
    if (!wsum) return [0,0];
    return [u1/wsum,u2/wsum];
  }
  const a1=mulMatVec(invM,[Tx1,Ty1,T11]);
  const a2=mulMatVec(invM,[Tx2,Ty2,T12]);
  return [a1[0]*px+a1[1]*py+a1[2], a2[0]*px+a2[1]*py+a2[2]];
}

  export default function SliderPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const selectedStore = location.state?.selectedStore;

    useEffect(() => {
    if (!selectedStore) {
      const saved = localStorage.getItem("selectedStore");
      if (!saved) {
        // ほんとに何も無ければストアへ
        navigate("/store", { replace: true });
      } else {
        // 必要ならここでパースして state に載せ直す処理を追加してOK
        // ただし必須ではない（現在のコードでは selectedStore を後続で使ってない）
      }
    }
  }, [selectedStore, navigate]);

  // UI 状態
  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);

  // データと前処理
  const [rows, setRows] = useState([]);               // 近傍探索・回帰用（PC/UMAP）
  const [blendF, setBlendF] = useState(null);         // 基準点（PC空間）
  const [pcMinMax, setPcMinMax] = useState(null);     // PC1/PC2 の min/max

  useEffect(() => {
    const url = `${process.env.PUBLIC_URL || ""}/UMAP_PCA_coordinates.json`;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        const cleaned = (data || [])
          .map((d) => ({
            JAN: String(d.JAN ?? ""),
            PC1: num(d.PC1), PC2: num(d.PC2),
            UMAP1: num(d.UMAP1), UMAP2: num(d.UMAP2),
          }))
          .filter((r) =>
            Number.isFinite(r.PC1) && Number.isFinite(r.PC2) &&
            Number.isFinite(r.UMAP1) && Number.isFinite(r.UMAP2)
          );

        setRows(cleaned);

        // blendF（なければ中央値）
        const b = cleaned.find((d) => d.JAN === "blendF");
        if (b) setBlendF({ PC1: b.PC1, PC2: b.PC2 });
        else {
          setBlendF({
            PC1: median(cleaned.map((r) => r.PC1)),
            PC2: median(cleaned.map((r) => r.PC2)),
          });
        }

        // PC のレンジ
        const pc1s = cleaned.map((r) => r.PC1);
        const pc2s = cleaned.map((r) => r.PC2);
        setPcMinMax({
          minPC1: Math.min(...pc1s), maxPC1: Math.max(...pc1s),
          minPC2: Math.min(...pc2s), maxPC2: Math.max(...pc2s),
        });
      })
      .catch((e) => console.error("load failed:", e));
  }, []);

  // PCA → UMAP の局所アフィン（MapPage と同じ思想）
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

  // 生成
  const handleGenerate = () => {
    if (!blendF || !pcMinMax || !rows.length) return;

    const { minPC1, maxPC1, minPC2, maxPC2 } = pcMinMax;

    // スライダー（0-100、中央50）→ PC値線形補間（MapPageと同じ計算式）
    const pc1Value =
      body <= 50
        ? blendF.PC1 - ((50 - body) / 50) * (blendF.PC1 - minPC1)
        : blendF.PC1 + ((body - 50) / 50) * (maxPC1 - blendF.PC1);

    const pc2Value =
      sweetness <= 50
        ? blendF.PC2 - ((50 - sweetness) / 50) * (blendF.PC2 - minPC2)
        : blendF.PC2 + ((sweetness - 50) / 50) * (maxPC2 - blendF.PC2);

    // PCA → UMAP へ写像（UMAP実座標を保存）
    const [umapX, umapY] = pca2umap(pc1Value, pc2Value);
    localStorage.setItem(
      "userPinCoords",
      JSON.stringify({ coordsUMAP: [umapX, umapY], version: 2 })
    );

    // Map へ遷移（userPin をセンタリング）
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
      {/* ヘッダー（MapPage のパネルと同じ雰囲気） */}
      <div
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 12, borderBottom: "1px solid #eee", paddingBottom: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>嗜好スライダー</h2>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "#eee", border: "1px solid #ccc",
            borderRadius: 6, fontSize: 13, padding: "6px 10px", cursor: "pointer",
          }}
        >
          閉じる
        </button>
      </div>

      {/* スライダーの CSS（つまみ・中央グラデーション） */}
      <style>{`
        .taste-slider{
          appearance: none; -webkit-appearance: none;
          width: 100%; height: 6px; background: transparent;
          margin-top: 8px; outline: none;
        }
        .taste-slider::-webkit-slider-runnable-track{
          height: 6px; border-radius: 9999px; background: var(--range, #e9e9e9);
        }
        .taste-slider::-moz-range-track{
          height: 6px; border-radius: 9999px; background: var(--range, #e9e9e9);
        }
        .taste-slider::-webkit-slider-thumb{
          -webkit-appearance: none;
          width: 28px; height: 28px; border-radius: 50%;
          background: #fff; border: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,.25);
          margin-top: -11px; cursor: pointer;
        }
        .taste-slider::-moz-range-thumb{
          width: 28px; height: 28px; border-radius: 50%;
          background: #fff; border: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,.25);
          cursor: pointer;
        }
      `}</style>

      <p style={{ fontWeight: 700, margin: "12px 0 18px" }}>
        基準のワインを飲んだ印象は？
      </p>

      {/* 甘み */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          <span>← こんなに甘みは不要</span>
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

      {/* コク */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
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

      {/* 生成ボタン（Map のスライダーパネルと同じ見た目） */}
      <button
        onClick={handleGenerate}
        style={{
          width: "80%",
          maxWidth: 420,
          margin: "0 auto",
          padding: "16px 18px",
          background: "#f5e9dd",
          color: "#000",
          border: "none",
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
          display: "block",
        }}
        disabled={!blendF || !pcMinMax || !rows.length}
      >
        あなたの好みからMAPを生成
      </button>
    </div>
  );
}
