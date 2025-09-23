import React from "react";

// 各◎を表示（評価0〜5に応じて黒/グレー）
const CircleRatingIcon = ({ ringLevel, currentRating }) => {
  const baseSize = 6; // ← 元より70%小さい
  const ringGap = 2.2;
  const ringCount = ringLevel + 1;

  return (
    <div
      style={{
        position: "relative",
        width: `${baseSize + ringGap * 2 * (ringCount - 1)}px`,
        height: `${baseSize + ringGap * 2 * (ringCount - 1)}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginRight: "4px",
      }}
    >
      {[...Array(ringCount)].map((_, i) => {
        const size = baseSize + ringGap * 2 * i;
        const color = i === 0
          ? currentRating >= 0 ? "#000" : "#ccc"
          : i <= currentRating ? "#000" : "#ccc";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${size}px`,
              height: `${size}px`,
              border: `1.2px solid ${color}`,
              borderRadius: "50%",
              backgroundColor: i === 0 ? color : "transparent",
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
};

// 横並びで6段階すべて表示（小さめに中心揃え）
const CircleRatingRowDisplay = ({ currentRating = -1 }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center", // 垂直中心
        justifyContent: "flex-start",
        height: "34px",     // 商品名との高さを合わせる
        marginTop: "-4px",  // 上に寄せる
        marginLeft: "-8px", // 左に寄せる
      }}
    >
      {[1, 2, 3, 4, 5].map((val) => (
        <CircleRatingIcon
          key={val}
          value={v}
          currentRating={currentRating}
          centerColor={typeColor}
        />
      ))}
    </div>
  );
};

export default CircleRatingRowDisplay;
