import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// 安全に数値化
const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

// 中央値
const median = (arr) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

function SliderPage() {
  const navigate = useNavigate();
  const [sweetness, setSweetness] = useState(50);
  const [body, setBody] = useState(50);
  const [minMax, setMinMax] = useState(null);
  const [blendF, setBlendF] = useState(null);

  useEffect(() => {
    fetch("UMAP_PCA_coordinates.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) return;

        // カラムの自動判定：Sweet/Body が無ければ UMAP を使う
        const hasSweetBody =
          "SweetAxis" in data[0] && "BodyAxis" in data[0];
        const sweetKey = hasSweetBody ? "SweetAxis" : "UMAP2"; // 甘味はY側(例)
        const bodyKey = hasSweetBody ? "BodyAxis" : "UMAP1";   // コクはX側(例)

        const sweetValues = data.map((d) => num(d[sweetKey]));
        const bodyValues = data.map((d) => num(d[bodyKey]));

        const minSweet = Math.min(...sweetValues);
        const maxSweet = Math.max(...sweetValues);
        const minBody  = Math.min(...bodyValues);
        const maxBody  = Math.max(...bodyValues);
        setMinMax({ minSweet, maxSweet, minBody, maxBody, sweetKey, bodyKey });

        // 基準点：JAN === "blendF" が無い場合は中央値
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
      })
      .catch((error) => {
        console.error("データ取得エラー:", error);
      });
  }, []);

  const handleNext = () => {
    if (!minMax || !blendF) return;

    const { minSweet, maxSweet, minBody, maxBody } = minMax;

    // スライダー（0-100）→ 連続値へ補間
    const sweetValue =
      sweetness <= 50
        ? blendF.SweetAxis - ((50 - sweetness) / 50) * (blendF.SweetAxis - minSweet)
        : blendF.SweetAxis + ((sweetness - 50) / 50) * (maxSweet - blendF.SweetAxis);

    const bodyValue =
      body <= 50
        ? blendF.BodyAxis - ((50 - body) / 50) * (blendF.BodyAxis - minBody)
        : blendF.BodyAxis + ((body - 50) / 50) * (maxBody - blendF.BodyAxis);

    // Map側の想定が「x=ボディ, y=甘味（上を甘くしたいので符号反転）」ならこのまま
    localStorage.setItem("userPinCoords", JSON.stringify([bodyValue, -sweetValue]));
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
