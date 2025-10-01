import React from "react";

/**
 * 評価の「n重丸」を1個だけ描くミニ表示コンポーネント。
 * ProductPage の CircleRating で「選択された状態」の見た目に合わせています。
 *
 * props:
 *  - rating:        1..5 の整数
 *  - size:          全体サイズ(px)。24〜28 がおすすめ
 *  - centerColor:   中心ドット色（既定 #000）
 */
export default function CircleRatingDisplay({
  rating = 0,
  size = 24,
  centerColor = "#000",
}) {
  const v = Math.max(0, Math.min(5, Math.floor(Number(rating) || 0)));
  if (v <= 0) return null; // 未評価は表示しない（◎一覧では常に >=1 のはず）

  // ProductPage の比率に合わせて相対化
  const outerSize = size;
  const baseSize = size * 0.2;   // 元: 8px 相当
  const ringGap  = size * 0.075; // 元: 3px 相当
  const ringCount = v + 1;       // 「中心ドット + v本のリング」

  return (
    <div
      aria-label={`評価 ${v}`}
      style={{
        position: "relative",
        width: `${outerSize}px`,
        height: `${outerSize}px`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {[...Array(ringCount)].map((_, i) => {
        const w = baseSize + ringGap * 2 * i;
        // 一覧は常に「選択済み」の見た目＝枠は黒
        const stroke = "#000";
        const fill = i === 0 ? centerColor : "transparent";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${w}px`,
              height: `${w}px`,
              border: `1.5px solid ${stroke}`,
              borderRadius: "50%",
              backgroundColor: fill,
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}
