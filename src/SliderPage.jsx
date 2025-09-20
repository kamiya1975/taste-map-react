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
const GRID_STEP_PX = 13;
const THIN_W_PX = 1;
const THICK_W_PX = 1.4;
const THICK_EVERY = 5;
const THIN_RGBA  = "rgba(200,200,200,0.39)";
const THICK_RGBA = "rgba(180,180,180,0.47)";
const MOVE_PER_UNIT_PX = 5.0;

const COMPASS_URL = `${process.env.PUBLIC_URL || ""}/img/compass.png`;
const COMPASS_SIZE_PCT = 9;

// 上余白カット後のUI高さ見込み
const RESERVED_SVH = 34;

// 罫線ピッチなどの定数の下あたりに1行追加（中央に太線が来る調整）
const ALIGN_OFFSET = GRID_STEP_PX * THICK_EVERY / 2 - THICK_W_PX / 2; // 32.5 - 0.7 = 31.8px

export default function SliderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedStore = location.state?.selectedStore;

  // ===== スクロールロック（このページ滞在中のみ有効）=====
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

  /* ---------- データ読込 & 写像（既存） ---------- */
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
        setBlendF(b?{PC1:b.PC1,PC2:b.PC2,UMAP1:b.UMAP1,UMAP2:b.UMAP2}:null);
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

  // 「閉じる」→ blendF の位置に戻す
  const handleClose = () => {
    try {
      let x = null, y = null;
      // 最優先：データ内の blendF の UMAP 座標
      const b = rows.find((d) => String(d.JAN) === "blendF");
      if (b && Number.isFinite(b.UMAP1) && Number.isFinite(b.UMAP2)) {
        x = b.UMAP1; y = b.UMAP2;
      }
      // フォールバック：UMAP の中央値
      if (x == null || y == null) {
        const xs = rows.map(r=>r.UMAP1).filter(Number.isFinite);
        const ys = rows.map(r=>r.UMAP2).filter(Number.isFinite);
        if (xs.length && ys.length) { x = median(xs); y = median(ys); }
        else { x = 0; y = 0; }
      }
      sessionStorage.setItem("tm_center_umap", JSON.stringify({ x, y }));
    } catch {}
    navigate("/map", { replace: true, state: { centerOnBlendF: true } });
  };

  /* ---------- JSX（上余白カット & 「閉じる」をマップ内へ） ---------- */
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
        padding: "8px 16px 12px",
        boxSizing: "border-box",
        gap: 8,
      }}
    >
      {/* ===== ダミーマップ（正方形・はみ出さない） ===== */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "center" }}>
        <div
          aria-label="taste-map-dummy"
          style={{
            position: "relative",
            width: "min(calc(100svw - 32px), calc(100svh - 34svh))",
            aspectRatio: "1 / 1",
            overflow: "hidden",

            /* === グリッド罫線: 細線/太線とも中央基準で交差 === */
            backgroundImage: `
             /* 細：横 */
             linear-gradient(
               0deg,
               transparent calc(50% - ${THIN_W_PX / 2}px),
               ${THIN_RGBA}  calc(50% - ${THIN_W_PX / 2}px),
               ${THIN_RGBA}  calc(50% + ${THIN_W_PX / 2}px),
               transparent   calc(50% + ${THIN_W_PX / 2}px)
              ),
              /* 細：縦 */
              linear-gradient(
                90deg,
                transparent calc(50% - ${THIN_W_PX / 2}px),
                ${THIN_RGBA}  calc(50% - ${THIN_W_PX / 2}px),
                ${THIN_RGBA}  calc(50% + ${THIN_W_PX / 2}px),
                transparent   calc(50% + ${THIN_W_PX / 2}px)
              ),
              /* 太：横（5ピッチごと） */
              linear-gradient(
                0deg,
                transparent  calc(50% - ${THICK_W_PX / 2}px),
                ${THICK_RGBA} calc(50% - ${THICK_W_PX / 2}px),
                ${THICK_RGBA} calc(50% + ${THICK_W_PX / 2}px),
                transparent  calc(50% + ${THICK_W_PX / 2}px)
              ),
              /* 太：縦（5ピッチごと） */
              linear-gradient(
                90deg,
                transparent  calc(50% - ${THICK_W_PX / 2}px),
                ${THICK_RGBA} calc(50% - ${THICK_W_PX / 2}px),
                ${THICK_RGBA} calc(50% + ${THICK_W_PX / 2}px),
                transparent  calc(50% + ${THICK_W_PX / 2}px)
              )
            `,
            backgroundSize: `
              ${GRID_STEP_PX}px ${GRID_STEP_PX}px,
              ${GRID_STEP_PX}px ${GRID_STEP_PX}px,
              ${GRID_STEP_PX * THICK_EVERY}px ${GRID_STEP_PX * THICK_EVERY}px,
              ${GRID_STEP_PX * THICK_EVERY}px ${GRID_STEP_PX * THICK_EVERY}px
            `,
            backgroundPosition: `
              calc(50% + ${bgOffset.dx}px) calc(50% + ${bgOffset.dy}px),
              calc(50% + ${bgOffset.dx}px) calc(50% + ${bgOffset.dy}px),
              calc(50% + ${bgOffset.dx}px) calc(50% + ${bgOffset.dy}px),
              calc(50% + ${bgOffset.dx}px) calc(50% + ${bgOffset.dy}px)
            `,
            backgroundRepeat: "repeat",
            transition: "background-position 120ms linear",
          }}
        >
           {/* 閉じる（マップ内右上） */}
           <button
             onClick={() => {
               // blendF を中心に戻す合図（任意：入れておくと便利）
               try {
                 const b = (rows || []).find(d => String(d.JAN) === "blendF");
                 if (b) {
                   sessionStorage.setItem(
                     "tm_center_umap",
                     JSON.stringify({ x: Number(b.UMAP1), y: Number(b.UMAP2) })
                   );
                 }
               } catch {}
               navigate("/map", { replace: true, state: { centerOnBlendF: true } });
             }}
             style={{
               position: "absolute",
               top: 8,
               right: 8,
               zIndex: 5,
               background: "rgba(255,255,255,0.9)",
               border: "1px solid #ccc",
               borderRadius: 8,
               fontSize: 13,
               padding: "6px 10px",
               cursor: "pointer",
               boxShadow: "0 2px 6px rgba(0,0,0,.15)",
               WebkitBackdropFilter: "blur(2px)",
               backdropFilter: "blur(2px)"
             }}
           >
             閉じる
           </button>

          {/* コンパス画像 */}
          <img
            src={COMPASS_URL}
            alt="compass"
            draggable={false}
           style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: `${COMPASS_SIZE_PCT}%`,
              height: "auto",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              userSelect: "none",
              opacity: 0.9,
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
              zIndex: 1
            }}
          />
        </div>
      </div>

      {/* 見出し */}
      <p style={{ fontWeight:700, fontSize:16, margin:"2px 0 6px", textAlign:"center", flexShrink:0 }}>
        基準のワインを飲んだ印象は？
      </p>

      {/* スライダーCSS */}
      <style>{`
        .taste-slider{ appearance:none; -webkit-appearance:none; width:100%; height:6px; background:transparent; margin-top:6px; outline:none; }
        .taste-slider::-webkit-slider-runnable-track{ height:6px; border-radius:9999px; background:var(--range,#e9e9e9); }
        .taste-slider::-moz-range-track{ height:6px; border-radius:9999px; background:var(--range,#e9e9e9); }
        .taste-slider::-webkit-slider-thumb{ -webkit-appearance:none; width:28px; height:28px; border-radius:50%; background:#fff; border:0; box-shadow:0 2px 6px rgba(0,0,0,.25); margin-top:-11px; cursor:pointer; }
        .taste-slider::-moz-range-thumb{ width:28px; height:28px; border-radius:50%; background:#fff; border:0; box-shadow:0 2px 6px rgba(0,0,0,.25); cursor:pointer; }
      `}</style>

      {/* 甘み */}
      <div style={{ marginBottom:10, flexShrink:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:700, marginBottom:4 }}>
          <span>← こんなに甘みは不要</span><span>もっと甘みが欲しい →</span>
        </div>
        <input
          type="range" min="0" max="100" value={sweetness}
          onChange={(e)=>setSweetness(Number(e.target.value))}
          className="taste-slider" style={{ "--range": centerGradient(sweetness) }}
        />
      </div>

      {/* コク（ボディ） */}
      <div style={{ marginBottom:10, flexShrink:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:700, marginBottom:4 }}>
          <span>← もっと軽やかが良い</span><span>濃厚なコクが欲しい →</span>
        </div>
        <input
          type="range" min="0" max="100" value={body}
          onChange={(e)=>setBody(Number(e.target.value))}
          className="taste-slider" style={{ "--range": centerGradient(body) }}
        />
      </div>

      {/* 生成ボタン：マップ内 下中央オーバーレイ */}
      <button
        onClick={handleGenerate}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 150,
          transform: "translateX(-50%)",
          width: "min(80%, 420px)",
          padding: "14px 16px",
          background: "rgba(245,233,221,0.98)",
          color: "#000",
          border: "none",
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
          zIndex: 3,
          WebkitBackdropFilter: "blur(2px)",
          backdropFilter: "blur(2px)",
        }}
        disabled={!blendF || !pcMinMax || !rows.length}
      >
        あなたの好みからMAPを生成
      </button>
    </div>
  );
}
