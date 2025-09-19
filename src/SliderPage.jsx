// src/SliderPage.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/* =======================
   小ユーティリティ（既存）
======================= */
const num = (v, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
const median = (arr) => { if (!arr.length) return 0; const a=[...arr].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; };
const dist2 = (x1,y1,x2,y2)=>{const dx=x1-x2, dy=y1-y2; return dx*dx+dy*dy;};
const centerGradient = (val) => {
  const base="#e9e9e9", active="#b59678";
  const v=Math.max(0,Math.min(100,Number(val)));
  if(v===50) return base;
  const a=Math.min(50,v), b=Math.max(50,v);
  return `linear-gradient(to right, ${base} 0%, ${base} ${a}%, ${active} ${a}%, ${active} ${b}%, ${base} ${b}%, ${base} 100%)`;
};

// 3x3 逆行列系（既存）
function invert3x3(M){const [[a,b,c],[d,e,f],[g,h,i]]=M;const A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g;const D=-(b*i-c*h),E=a*i-c*g,F=-(a*h-b*g);const G=b*f-c*e,H=-(a*f-c*d),I=a*e-b*d;const det=a*A+b*B+c*C;if(Math.abs(det)<1e-12)return null;const s=1/det;return[[A*s,D*s,G*s],[B*s,E*s,H*s],[C*s,F*s,I*s]];}
function mulMatVec(M,v){return[M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]];}
function fitLocalAffineAndPredict(px,py,neigh){
  if(neigh.length<3){let wsum=0,u1=0,u2=0;for(const n of neigh){wsum+=n.w;u1+=n.w*n.UMAP1;u2+=n.w*n.UMAP2;}if(!wsum)return[0,0];return[u1/wsum,u2/wsum];}
  let Sxx=0,Sxy=0,Sx1=0,Syx=0,Syy=0,Sy1=0,S1x=0,S1y=0,S11=0,Tx1=0,Ty1=0,T11=0,Tx2=0,Ty2=0,T12=0;
  for(const n of neigh){const w=n.w,x=n.PC1,y=n.PC2,u1=n.UMAP1,u2=n.UMAP2;const wx=w*x,wy=w*y;
    Sxx+=wx*x; Sxy+=wx*y; Sx1+=wx; Syx+=wy*x; Syy+=wy*y; Sy1+=wy; S1x+=w*x; S1y+=w*y; S11+=w;
    Tx1+=wx*u1; Ty1+=wy*u1; T11+=w*u1; Tx2+=wx*u2; Ty2+=wy*u2; T12+=w*u2;
  }
  const M=[[Sxx,Sxy,Sx1],[Syx,Syy,Sy1],[S1x,S1y,S11]], invM=invert3x3(M);
  if(!invM){let wsum=0,u1=0,u2=0;for(const n of neigh){wsum+=n.w;u1+=n.w*n.UMAP1;u2+=n.w*n.UMAP2;}if(!wsum)return[0,0];return[u1/wsum,u2/wsum];}
  const a1=mulMatVec(invM,[Tx1,Ty1,T11]); const a2=mulMatVec(invM,[Tx2,Ty2,T12]);
  return[a1[0]*px+a1[1]*py+a1[2],a2[0]*px+a2[1]*py+a2[2]];
}

/* =======================
   ダミーマップ設定（Map と同等の罫線）
======================= */
// 罫線ピッチ（DeckGLの cellSize に見た目を合わせる値。必要に応じ調整）
const GRID_STEP_PX = 10;
// 薄線・太線の太さ（px）
const THIN_W_PX = 1;
const THICK_W_PX = 1.5;
// 何本ごとに太線にするか（MapPageは 5）
const THICK_EVERY = 5;
// 線色（MapPage の [r,g,b,a] に近似）
const THIN_RGBA  = "rgba(200,200,200,0.39)"; // [200,200,200,100]
const THICK_RGBA = "rgba(180,180,180,0.47)"; // [180,180,180,120]

// スライダー1目盛りあたりの地図移動量（px）
const MOVE_PER_UNIT_PX = 3.0;

// コンパス画像
const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;
// ← コンパスの大きさ（%）。小さくしたいぶん下げてください（例: 20）
const COMPASS_SIZE_PCT = 20;

export default function SliderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedStore = location.state?.selectedStore;

  // Map 以外から直接来た場合のみ店舗選択を強制
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

  // 背景のオフセット（甘み→左へ、ボディ→下へ）
  const bgOffset = useMemo(() => {
    const dx = -(sweetness - 50) * MOVE_PER_UNIT_PX;
    const dy =  (body      - 50) * MOVE_PER_UNIT_PX;
    return { dx, dy };
  }, [sweetness, body]);

  /* ---------- 既存：データ読込 & 写像 ---------- */
  const [rows, setRows] = useState([]);
  const [blendF, setBlendF] = useState(null);
  const [pcMinMax, setPcMinMax] = useState(null);

  useEffect(() => {
    const url = `${process.env.PUBLIC_URL || ""}/UMAP_PCA_coordinates.json`;
    fetch(url)
      .then((r)=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data)=>{
        const cleaned=(data||[]).map(d=>({
          JAN:String(d.JAN??""), PC1:num(d.PC1), PC2:num(d.PC2),
          UMAP1:num(d.UMAP1), UMAP2:num(d.UMAP2)
        })).filter(r=>Number.isFinite(r.PC1)&&Number.isFinite(r.PC2)&&Number.isFinite(r.UMAP1)&&Number.isFinite(r.UMAP2));
        setRows(cleaned);
        const b=cleaned.find(d=>d.JAN==="blendF");
        setBlendF(b?{PC1:b.PC1,PC2:b.PC2}:{PC1:median(cleaned.map(r=>r.PC1)),PC2:median(cleaned.map(r=>r.PC2))});
        const pc1s=cleaned.map(r=>r.PC1), pc2s=cleaned.map(r=>r.PC2);
        setPcMinMax({minPC1:Math.min(...pc1s),maxPC1:Math.max(...pc1s),minPC2:Math.min(...pc2s),maxPC2:Math.max(...pc2s)});
      })
      .catch(e=>console.error("load failed:", e));
  }, []);

  const pca2umap = (px,py,k=20)=>{
    if(!rows.length) return [0,0];
    const eps=1e-6;
    const neigh=rows.map(d=>{const d2=dist2(px,py,d.PC1,d.PC2);return {...d,d2,w:1/(d2+eps)};})
                    .sort((a,b)=>a.d2-b.d2).slice(0,Math.min(k,rows.length));
    return fitLocalAffineAndPredict(px,py,neigh);
  };

  const handleGenerate = () => {
    if (!blendF || !pcMinMax || !rows.length) return;
    const {minPC1,maxPC1,minPC2,maxPC2}=pcMinMax;

    // 0-100(中央50) → PC空間へ線形補間
    const pc1Value = body<=50
      ? blendF.PC1 - ((50-body)/50)*(blendF.PC1 - minPC1)
      : blendF.PC1 + ((body-50)/50)*(maxPC1 - blendF.PC1);

    const pc2Value = sweetness<=50
      ? blendF.PC2 - ((50-sweetness)/50)*(blendF.PC2 - minPC2)
      : blendF.PC2 + ((sweetness-50)/50)*(maxPC2 - blendF.PC2);

    const [umapX, umapY] = pca2umap(pc1Value, pc2Value);
    localStorage.setItem("userPinCoords", JSON.stringify({ coordsUMAP: [umapX, umapY], version: 2 }));
    sessionStorage.setItem("tm_autopen_nearest", "1");
    navigate("/map", { state: { centerOnUserPin: true } });
  };

  /* ---------- JSX ---------- */
  return (
    <div
      style={{
        padding:16, fontFamily:"sans-serif", background:"#fff",
        minHeight:"100vh", boxSizing:"border-box", maxWidth:720, margin:"0 auto",
      }}
    >
      {/* ヘッダー */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        marginBottom:12, borderBottom:"1px solid #eee", paddingBottom:8
      }}>
        <h2 style={{ margin:0, fontSize:18 }}>嗜好スライダー</h2>
        {/* 必ず /map に戻す */}
        <button
          onClick={() => navigate("/map", { replace: true })}
          style={{ background:"#eee", border:"1px solid #ccc", borderRadius:6, fontSize:13, padding:"6px 10px", cursor:"pointer" }}
        >
          閉じる
        </button>
      </div>

      {/* ===== ダミーマップ（中央にコンパス固定／背景罫線のみ移動） ===== */}
      <div
        aria-label="taste-map-dummy"
        style={{
          position:"relative",
          width:"100%",
          maxWidth:640,
          aspectRatio:"1 / 1",
          margin:"0 auto 16px auto",
          border:"none",
          borderRadius:0,
          overflow:"hidden",

          /* ▼ MapPage の thin/thick を縦横2層ずつ = 4レイヤーで再現 */
          backgroundImage: `
            /* 横：薄い線（水平） */
            repeating-linear-gradient(
              0deg,
              ${THIN_RGBA} 0px,
              ${THIN_RGBA} ${THIN_W_PX}px,
              transparent  ${THIN_W_PX}px,
              transparent  ${GRID_STEP_PX}px
            ),
            /* 縦：薄い線（垂直） */
            repeating-linear-gradient(
              90deg,
              ${THIN_RGBA} 0px,
              ${THIN_RGBA} ${THIN_W_PX}px,
              transparent  ${THIN_W_PX}px,
              transparent  ${GRID_STEP_PX}px
            ),
            /* 横：5本ごとの太線（水平） */
            repeating-linear-gradient(
              0deg,
              ${THICK_RGBA} 0px,
              ${THICK_RGBA} ${THICK_W_PX}px,
              transparent  ${THICK_W_PX}px,
              transparent  ${GRID_STEP_PX * THICK_EVERY}px
            ),
            /* 縦：5本ごとの太線（垂直） */
            repeating-linear-gradient(
              90deg,
              ${THICK_RGBA} 0px,
              ${THICK_RGBA} ${THICK_W_PX}px,
              transparent  ${THICK_W_PX}px,
              transparent  ${GRID_STEP_PX * THICK_EVERY}px
            )
          `,
          /* 4レイヤーを同じオフセットで動かす（甘み→左／ボディ→下） */
          backgroundPosition: `
            ${bgOffset.dx}px ${bgOffset.dy}px,
            ${bgOffset.dx}px ${bgOffset.dy}px,
            ${bgOffset.dx}px ${bgOffset.dy}px,
            ${bgOffset.dx}px ${bgOffset.dy}px
          `,
          /* ピッチ指定（太線は5倍ピッチ） */
          backgroundSize: `
            ${GRID_STEP_PX}px ${GRID_STEP_PX}px,
            ${GRID_STEP_PX}px ${GRID_STEP_PX}px,
            ${GRID_STEP_PX * THICK_EVERY}px ${GRID_STEP_PX * THICK_EVERY}px,
            ${GRID_STEP_PX * THICK_EVERY}px ${GRID_STEP_PX * THICK_EVERY}px
          `,
          transition:"background-position 120ms linear",
        }}
      >
        {/* コンパス（中央固定） */}
        <img
          src={COMPASS_URL}
          alt="compass"
          draggable={false}
          style={{
            position:"absolute",
            left:"50%",
            top:"50%",
            width:`${COMPASS_SIZE_PCT}%`,
            height:"auto",
            transform:"translate(-50%, -50%)",
            pointerEvents:"none",
            userSelect:"none",
            opacity:0.9,
            filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
          }}
        />
      </div>

      {/* スライダー見出し（画像位置に合わせて中央・直上） */}
      <p style={{ fontWeight:700, fontSize:16, margin:"4px 0 12px", textAlign:"center" }}>
        基準のワインを飲んだ印象は？
      </p>

      {/* スライダーCSS */}
      <style>{`
        .taste-slider{ appearance:none; -webkit-appearance:none; width:100%; height:6px; background:transparent; margin-top:8px; outline:none; }
        .taste-slider::-webkit-slider-runnable-track{ height:6px; border-radius:9999px; background:var(--range,#e9e9e9); }
        .taste-slider::-moz-range-track{ height:6px; border-radius:9999px; background:var(--range,#e9e9e9); }
        .taste-slider::-webkit-slider-thumb{ -webkit-appearance:none; width:28px; height:28px; border-radius:50%; background:#fff; border:0; box-shadow:0 2px 6px rgba(0,0,0,.25); margin-top:-11px; cursor:pointer; }
        .taste-slider::-moz-range-thumb{ width:28px; height:28px; border-radius:50%; background:#fff; border:0; box-shadow:0 2px 6px rgba(0,0,0,.25); cursor:pointer; }
      `}</style>

      {/* 甘み */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:700, marginBottom:6 }}>
          <span>← こんなに甘みは不要</span><span>もっと甘みが欲しい →</span>
        </div>
        <input
          type="range" min="0" max="100" value={sweetness}
          onChange={(e)=>setSweetness(Number(e.target.value))}
          className="taste-slider" style={{ "--range": centerGradient(sweetness) }}
        />
      </div>

      {/* コク（ボディ） */}
      <div style={{ marginBottom:22 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:700, marginBottom:6 }}>
          <span>← もっと軽やかが良い</span><span>濃厚なコクが欲しい →</span>
        </div>
        <input
          type="range" min="0" max="100" value={body}
          onChange={(e)=>setBody(Number(e.target.value))}
          className="taste-slider" style={{ "--range": centerGradient(body) }}
        />
      </div>

      {/* 生成ボタン */}
      <button
        onClick={handleGenerate}
        style={{
          width:"80%", maxWidth:420, margin:"0 auto", padding:"16px 18px",
          background:"#f5e9dd", color:"#000", border:"none", borderRadius:10,
          fontSize:16, fontWeight:700, cursor:"pointer", display:"block",
        }}
        disabled={!blendF || !pcMinMax || !rows.length}
      >
        あなたの好みからMAPを生成
      </button>
    </div>
  );
}
