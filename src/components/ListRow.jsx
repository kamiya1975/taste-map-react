import React from "react";

export default function ListRow({ index, item, onPick }) {
  return (
    <li
      onClick={() => onPick?.(item)}
      style={{
        padding: "10px 0",
        borderBottom: "1px solid #eee",
        cursor: "pointer",
      }}
    >
      <div>
        <strong
          style={{
            display: "inline-block",
            color: "rgb(50, 50, 50)",
            fontSize: "16px",
            fontWeight: "bold",
            marginRight: "4px",
          }}
        >
          {index}.
        </strong>
        <span style={{ fontSize: "15px", color: "#555" }}>
          {item.addedAt
            ? new Date(item.addedAt).toLocaleDateString()
            : "（日付不明）"}
        </span>
        <br />
        {item.商品名 || "（名称不明）"}
      </div>
      <small>
        Type: {item.Type || "不明"} / 価格:{" "}
        {Number.isFinite(item.希望小売価格)
          ? `¥${Number(item.希望小売価格).toLocaleString()}`
          : "不明"}
        <br />
        Body:{" "}
        {Number.isFinite(item.BodyAxis)
          ? item.BodyAxis.toFixed(2)
          : "—"}
        , Sweet:{" "}
        {Number.isFinite(item.SweetAxis)
          ? item.SweetAxis.toFixed(2)
          : "—"}
        <br />
        JAN: {item.JAN || "—"}
      </small>
    </li>
  );
}
