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

// 距離（PCA空間のユークリッド）
const dist2 = (x1, y1, x2, y2) => {
  const dx = x1 - x2, dy = y1 - y2;
  return dx * dx + dy * dy;
};

// 重み付き最小二乗で 2出力(UMAP1,UMAP2) のアフィン変換を局所推定
// X = [[px, py, 1], ...], Y1 = [umap1_i], Y2 = [umap2_i], w = weights
function fitLocalAffineAndPredict(px, py, neigh) {
  // 近傍が少ないときは重み付き平均にフォールバック
  if (neigh.length < 3) {
    let wsum = 0, u1 = 0, u2 = 0;
    for (const n of neigh) {
      const w = n.w;
      wsum += w;
      u1 += w * n.UMAP1;
      u2 += w * n.UMAP2;
    }
    if (wsum === 0) return [0, 0];
    return [u1 / wsum, u2 / wsum];
  }

  // 行列要素（X^T W X）と（X^T W Y）を明示展開（3x3 と 3x1 を2本分）
  // X の各行は [x, y, 1]
  let Sxx = 0, Sxy = 0, Sx1 = 0;
  let Syx = 0, Syy = 0, Sy1 = 0;
  let S1x = 0, S1y = 0, S11 = 0;

  let Tx1 = 0, Ty1 = 0, T11 = 0; // for Y1 (UMAP1)
  let Tx2 = 0, Ty2 = 0, T12 = 0; // for Y2 (UMAP2)

  for (const n of neigh) {
    const w = n.w, x = n.PCA1, y = n.PCA2, u1 = n.UMAP1, u2 = n.UMAP2;
    const wx = w * x, wy = w * y;
    Sxx += wx * x;  Sxy += wx * y;  Sx1 += wx * 1;
    Syx += wy * x;  Syy += wy * y;  Sy1 += wy * 1;
    S1x += w  * x;  S1y += w  * y;  S11 += w  * 1;

    Tx1 += wx * u1; Ty1 += wy * u1; T11 += w * 1 * u1;
    Tx2 += wx * u2; Ty2 += wy * u2; T12 += w * 1 * u2;
  }

  // 3x3 行列 M と 右辺ベクトル b1, b2 を解く： M * a1 = b1, M * a2 = b2
  const M = [
    [Sxx, Sxy, Sx1],
    [Syx, Syy, Sy1],
    [S1x, S1y, S11],
  ];
  const b1 = [Tx1, Ty1, T11];
  const b2 = [Tx2, Ty2, T12];

  const invM = invert3x3(M);
  if (!invM) {
    // 退避：重み付き平均
    let wsum = 0, u1 = 0, u2 = 0;
    for (const n of neigh) {
      const w = n.w;
      wsum += w;
      u1 += w * n.UMAP1;
      u2 += w * n.UMAP2;
    }
    if (wsum === 0) return [0, 0];
    return [u1 / wsum, u2 / wsum];
  }

  const a1 = multiplyMatVec(invM, b1); // [a,b,c] s.t. UMAP1 ≈ a*x + b*y + c
  const a2 = multiplyMatVec(invM, b2); // [d,e,f] s.t. UMAP2 ≈ d*x + e*y + f

  const umap1 = a1[0] * px + a1[1] * py + a1[2];
  const umap2 = a2[0] * px + a2[1] * py + a2[2];
  return [umap1, umap2];
}

function invert3x3(M) {
  const [
    [a, b, c],
    [d, e, f],
    [g, h, i],
  ] = M;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;

  const invDet = 1 / det;
  return [
    [A * invDet, D * invDet, G * invDet],
    [B * invDet, E * invDet, H * invDet],
    [C * invDet, F * invDet, I * invDet],
  ];
}
function multiplyMatVec(M, v) {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}

function SliderPage() {
  const navigate = useNavigate();
  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);
  const [minMax, setMinMax] = useState(null);
  const [blendF, setBlendF] = useState(null);
  const [dataset, setDataset] = useState([]); // ← 近傍探索用に全件保持

  useEffect(() => {
    fetch("UMAP_PCA_coordinates.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) return;

        // 軸名の自動判定
        const hasSweetBody = "SweetAxis" in data[0] && "BodyAxis" in data[0];
        const sweetKey = hasSweetBody ? "SweetAxis" : "UMAP2"; // 仮: 甘味=Y
        const bodyKey  = hasSweetBody ? "BodyAxis"  : "UMAP1"; // 仮: コク=X

        const sweetValues = data.map((d) => num(d[sweetKey]));
        const bodyValues  = data.map((d) => num(d[bodyKey]));

        const minSweet = Math.min(...sweetValues);
        const maxSweet = Math.max(...sweetValues);
        const minBody  = Math.min(...bodyValues);
        const maxBody  = Math.max(...bodyValues);
        setMinMax({ minSweet, maxSweet, minBody, maxBody, sweetKey, bodyKey });

        // blendF or 中央値
        const foundBlend = data.find((d) => String(d.JAN) === "blendF");
        if (foundBlend) {
          setBlendF({
            SweetAxis: num(foundBlend[sweetKey]),
            BodyAxis:  num(foundBlend[bodyKey]),
          });
        } else {
          setBlendF({
            SweetAxis: median(sweetValues),
            BodyAxis:  median(bodyValues),
          });
        }

        // 近傍探索に必要な列だけ整形して保持（PCAは SweetAxis/BodyAxis を想定、UMAPは UMAP1/UMAP2 必須）
        // ※ JSONに PCA と UMAP が両方入っている前提（無いときは別ファイルからマージが必要）
        const rows = data.map((d) => ({
          JAN: String(d.JAN ?? ""),
          PCA1: num(d[bodyKey]),   // PCAのX（=コク）とみなす
          PCA2: num(d[sweetKey]),  // PCAのY（=甘味）とみなす
          UMAP1: num(d.UMAP1),
          UMAP2: num(d.UMAP2),
        })).filter(r => Number.isFinite(r.PCA1) && Number.isFinite(r.PCA2) && Number.isFinite(r.UMAP1) && Number.isFinite(r.UMAP2));
        setDataset(rows);
      })
      .catch((error) => {
        console.error("データ取得エラー:", error);
      });
  }, []);

  // PCA → UMAP の局所アフィン写像
  function pcaToUmap(px, py, k = 20) {
    if (!dataset.length) return [0, 0];
    // 距離と重み
    const eps = 1e-6;
    const withDist = dataset.map((d) => {
      const d2 = dist2(px, py, d.PCA1, d.PCA2);
      const w = 1 / (d2 + eps);        // d^2 を使うなら 1/(d2+eps)^? でもOK
      return { ...d, d2, w };
    });
    withDist.sort((a, b) => a.d2 - b.d2);
    const neigh = withDist.slice(0, Math.min(k, withDist.length));
    return fitLocalAffineAndPredict(px, py, neigh);
  }

  const handleNext = () => {
    if (!minMax || !blendF) return;
    const { minSweet, maxSweet, minBody, maxBody } = minMax;

    // ---- スライダー（0-100）→ PCA連続値（BodyAxis, SweetAxis）へ補間 ----
    const pcaSweet =
      sweetness <= 50
        ? blendF.SweetAxis - ((50 - sweetness) / 50) * (blendF.SweetAxis - minSweet)
        : blendF.SweetAxis + ((sweetness - 50) / 50) * (maxSweet - blendF.SweetAxis);

    const pcaBody =
      body <= 50
        ? blendF.BodyAxis - ((50 - body) / 50) * (blendF.BodyAxis - minBody)
        : blendF.BodyAxis + ((body - 50) / 50) * (maxBody - blendF.BodyAxis);

    // ---- PCA (x=Body, y=Sweet) を UMAP に写像 ----
    const [umapX, umapY] = pcaToUmap(pcaBody, pcaSweet, 20); // k=20 はお好みで

    // MapPageは UMAP軸で描画 → そのまま保存（符号反転なし）
    const payload = {
      coordsUMAP: [umapX, umapY],
      slider: { sweetness, body },
      pcaPoint: [pcaBody, pcaSweet],
      meta: { method: "local_affine_knn", k: 20 }
    };
    localStorage.setItem("userPinCoords", JSON.stringify(payload));
    const already = localStorage.getItem("userPinCoords");
    if (!already) {
      localStorage.setItem(
        "userPinCoords",
        JSON.stringify([bodyValue, -sweetValue]) // 互換のため従来フォーマットでもOK
      );
    } 
    navigate("/map");
  };

  return (
    <div style={{ padding: "24px", maxWidth: "600px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <h2 style={{ textAlign: "center", fontSize: "20px", marginBottom: "30px" }}>
        基準のワインを飲んだ印象は？
      </h2>

      {/* 甘味スライダー */}
      <div style={{ marginBottom: "40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "bold", marginBottom: "6px" }}>
          <span>← こんなに甘みは不要</span>
          <span>もっと甘みが欲しい →</span>
        </div>
        <input
          type="range" min="0" max="100" value={sweetness}
          onChange={(e) => setSweetness(Number(e.target.value))}
          style={{
            width: "100%", appearance: "none", height: "8px", borderRadius: "5px",
            background: `linear-gradient(to right, #007bff ${sweetness}%, #ddd ${sweetness}%)`,
            outline: "none", marginTop: "8px", WebkitAppearance: "none",
          }}
        />
      </div>

      {/* コクスライダー */}
      <div style={{ marginBottom: "40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "bold", marginBottom: "6px" }}>
          <span>← もっと軽やかが良い</span>
          <span>濃厚なコクが欲しい →</span>
        </div>
        <input
          type="range" min="0" max="100" value={body}
          onChange={(e) => setBody(Number(e.target.value))}
          style={{
            width: "100%", appearance: "none", height: "8px", borderRadius: "5px",
            background: `linear-gradient(to right, #007bff ${body}%, #ddd ${body}%)`,
            outline: "none", marginTop: "8px", WebkitAppearance: "none",
          }}
        />
      </div>

      <button
        onClick={handleNext}
        style={{
          background: "#fff", color: "#007bff", padding: "14px 30px",
          fontSize: "16px", fontWeight: "bold", border: "2px solid #007bff",
          borderRadius: "6px", cursor: "pointer", display: "block", margin: "0 auto",
        }}
      >
        地図生成
      </button>
    </div>
  );
}

export default SliderPage;
