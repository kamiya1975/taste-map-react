import React, { useEffect, useState } from "react";

export default function UserTastePage() {
  const [userInfo, setUserInfo] = useState({});
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const info = JSON.parse(localStorage.getItem("userInfo") || "{}");
    const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
    const products = JSON.parse(localStorage.getItem("umapData") || "[]");

    setUserInfo(info);

    const merged = Object.entries(ratings).map(([jan, data]) => {
      const product = products.find((p) => String(p.JAN) === jan);
      return {
        jan,
        name: product?.商品名 || "(不明)",
        ...data,
      };
    });

    setRecords(merged);
  }, []);

  const exportCSV = () => {
    const headers = [
      "JAN",
      "商品名",
      "評価",
      "日時",
      "気温",
      "湿度",
      "気圧",
    ];
    const rows = records.map((r) => [
      r.jan,
      r.name,
      r.rating,
      r.date,
      r.weather?.temperature ?? "",
      r.weather?.humidity ?? "",
      r.weather?.pressure ?? "",
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "user_taste_log.csv";
    link.click();
  };

  return (
    <div style={{ padding: "24px", fontFamily: "sans-serif" }}>
      <h2>ユーザー評価履歴</h2>

      <div style={{ marginBottom: "20px", lineHeight: "1.6" }}>
        <strong>ユーザーID:</strong> {userInfo.id || "(未設定)"} <br />
        <strong>ニックネーム:</strong> {userInfo.nickname || "-"} <br />
        <strong>生年月:</strong>{" "}
        {userInfo.birthYear || "----"}年 {userInfo.birthMonth || "--"}月 <br />
        <strong>性別:</strong> {userInfo.gender || "-"} <br />
        <strong>初期選択店舗:</strong> {userInfo.storeName || "-"}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#eee" }}>
            <th style={{ border: "1px solid #ccc", padding: "6px" }}>JAN</th>
            <th style={{ border: "1px solid #ccc", padding: "6px" }}>商品名</th>
            <th style={{ border: "1px solid #ccc", padding: "6px" }}>評価</th>
            <th style={{ border: "1px solid #ccc", padding: "6px" }}>日時</th>
            <th style={{ border: "1px solid #ccc", padding: "6px" }}>気温</th>
            <th style={{ border: "1px solid #ccc", padding: "6px" }}>湿度</th>
            <th style={{ border: "1px solid #ccc", padding: "6px" }}>気圧</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, idx) => (
            <tr key={idx}>
              <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                {r.jan}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                {r.name}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                {r.rating}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                {r.date}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                {r.weather?.temperature ?? ""}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                {r.weather?.humidity ?? ""}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                {r.weather?.pressure ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "20px" }}>
        <button
          onClick={exportCSV}
          style={{
            padding: "8px 16px",
            backgroundColor: "#651E3E",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          CSVで保存
        </button>
      </div>
    </div>
  );
}
