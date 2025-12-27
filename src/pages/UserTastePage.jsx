// src/pages/UserTastePage.jsx
// 現在使っていない（必要ない）（App.js にimportあり 削除するなら整理必要）
// （ローカル保存ベースの「ユーザー評価ログ閲覧・CSV出力」ページ として想定）
import React, { useEffect, useMemo, useState } from "react";

export default function UserTastePage() {
  const [userInfo, setUserInfo] = useState({});
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // CSVエスケープ（カンマ/ダブルクォート/改行を含むセルを安全に出力）
  const csvCell = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  useEffect(() => {
    const run = async () => {
      try {
        const info = JSON.parse(localStorage.getItem("userInfo") || "{}");
        const ratings = JSON.parse(localStorage.getItem("userRatings") || "{}");
        let products = [];

        // MapPage を通っていれば umapData がある
        try {
          products = JSON.parse(localStorage.getItem("umapData") || "[]");
        } catch {
          products = [];
        }

        // 無ければ JSON を直接読む（初回アクセス対策）
        if (!Array.isArray(products) || products.length === 0) {
          const url = `${process.env.PUBLIC_URL || ""}/UMAP_PCA_coordinates.json`;
          const res = await fetch(url);
          if (res.ok) {
            const raw = await res.json();
            products = (raw || []).filter(Boolean).map((r) => ({
              jan_code: String(r.jan_code ?? r.JAN ?? ""),
              商品名: r["商品名"] ?? "",
            }));
          }
        }

        setUserInfo(info);

        // 結合（JANで商品名を付与）
        const merged = Object.entries(ratings).map(([jan, data]) => {
          const product = products.find(
            (p) => String(p?.jan_code ?? p?.JAN ?? "") === String(jan)
          );
          return {
            jan_code: String(jan),
            name: product?.商品名 || "(不明)",
            rating: data?.rating ?? "",
            date: data?.date ?? "",
            weather: data?.weather ?? null, // {temperature, humidity, pressure}
          };
        });

        // 日付があるものを新しい順に
        merged.sort((a, b) => {
          const ta = Date.parse(a.date || "") || 0;
          const tb = Date.parse(b.date || "") || 0;
          return tb - ta;
        });

        setRecords(merged);
      } catch (e) {
        console.error("UserTastePage init error:", e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const exportCSV = () => {
    const headers = ["jan_code", "商品名", "評価", "日時", "気温", "湿度", "気圧"];
    const rows = records.map((r) => [
      csvCell(r.jan_code),
      csvCell(r.name),
      csvCell(r.rating),
      csvCell(r.date),
      csvCell(r.weather?.temperature ?? ""),
      csvCell(r.weather?.humidity ?? ""),
      csvCell(r.weather?.pressure ?? ""),
    ]);
    const csv = [headers.map(csvCell).join(","), ...rows.map((row) => row.join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "user_taste_log.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns = useMemo(
    () => [
      { key: "jan_code", label: "JAN", width: "12ch" },
      { key: "name", label: "商品名", width: "auto" },
      { key: "rating", label: "評価", width: "8ch" },
      { key: "date", label: "日時", width: "20ch" },
      { key: "temperature", label: "気温", width: "10ch" },
      { key: "humidity", label: "湿度", width: "10ch" },
      { key: "pressure", label: "気圧", width: "10ch" },
    ],
    []
  );

  return (
    <div style={{ padding: "24px", fontFamily: "sans-serif" }}>
      <h2>ユーザー評価履歴</h2>

      <div style={{ marginBottom: "20px", lineHeight: 1.6 }}>
        <strong>ユーザーID:</strong> {userInfo.id || "(未設定)"} <br />
        <strong>ニックネーム:</strong> {userInfo.nickname || "-"} <br />
        <strong>生年月:</strong>{" "}
        {userInfo.birthYear || "----"}年 {userInfo.birthMonth || "--"}月 <br />
        <strong>性別:</strong> {userInfo.gender || "-"} <br />
        <strong>初期選択店舗:</strong> {userInfo.storeName || "-"}
      </div>

      {loading ? (
        <div style={{ color: "#666" }}>読み込み中…</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#eee" }}>
                {columns.map((c) => (
                  <th key={c.key} style={{ border: "1px solid #ccc", padding: "6px", width: c.width }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => (
                <tr key={idx}>
                  <td style={{ border: "1px solid #ccc", padding: "6px" }}>{r.jan_code}</td>
                  <td style={{ border: "1px solid #ccc", padding: "6px" }}>{r.name}</td>
                  <td style={{ border: "1px solid #ccc", padding: "6px" }}>{r.rating}</td>
                  <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                    {r.date
                      ? new Date(r.date).toLocaleString()
                      : ""}
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
              {records.length === 0 && (
                <tr>
                  <td colSpan={columns.length} style={{ padding: "12px", textAlign: "center", color: "#666" }}>
                    まだ評価履歴がありません。
                  </td>
                </tr>
              )}
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
        </>
      )}
    </div>
  );
}
