// src/components/panels/MilesPanelContent.jsx
// 獲得マイル パネル
import React, { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../ui/constants";

function toYmd(dateLike) {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${dd}`;
}

function AuthRequiredMessage({ label = "獲得マイル" }) {
  return (
    <div style={{ padding: "16px 18px" }}>
      <div style={{fontSize: 16, lineHeight: 1.8 }}>
        {label}の表示にはログインが必要です。マイアカウントからログインして再度お試しください。
      </div>
    </div>
  );
}

export default function MilesPanelContent() {
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState("");
  const [totalMiles, setTotalMiles] = useState(null);
  const [rows, setRows] = useState([]); // raw list

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      setAuthRequired(false);

      let token = "";
      try {
        token = localStorage.getItem("app.access_token") || "";
      } catch {}

      if (!token) {
        if (!cancelled) {
          setAuthRequired(true);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/app/miles`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          if (!cancelled) {
            setAuthRequired(true);
            setLoading(false);
          }
          return;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();

        // 互換吸収：total/balance 系
        const total =
          (typeof json?.total_miles === "number" ? json.total_miles : null) ??
          (typeof json?.total === "number" ? json.total : null) ??
          (typeof json?.balance === "number" ? json.balance : null) ??
          null;

        // 互換吸収：items/history/transactions 系
        const list =
          (Array.isArray(json?.items) ? json.items : null) ??
          (Array.isArray(json?.history) ? json.history : null) ??
          (Array.isArray(json?.transactions) ? json.transactions : null) ??
          [];

        if (!cancelled) {
          setTotalMiles(total);
          setRows(list);
          setLoading(false);
        }
      } catch (e) {
        console.error("miles fetch failed:", e);
        if (!cancelled) {
          setError("獲得マイルの取得に失敗しました。");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 日別集計（購入日/作成日が何で来ても吸収）
  const daily = useMemo(() => {
    const map = new Map(); // ymd -> miles
    for (const r of rows || []) {
      const dt =
        r?.purchased_at ??
        r?.order_date ??
        r?.created_at ??
        r?.date ??
        r?.at ??
        null;

      const ymd = toYmd(dt) || "日付不明";

      // 付与数の候補を吸収
      const miles =
        (typeof r?.miles === "number" ? r.miles : null) ??
        (typeof r?.earned_miles === "number" ? r.earned_miles : null) ??
        (typeof r?.delta === "number" ? r.delta : null) ??
        (typeof r?.amount === "number" ? r.amount : null) ??
        0;

      map.set(ymd, (map.get(ymd) || 0) + Number(miles || 0));
    }

    // 直近が上（YYYY/MM/DD想定）
    const arr = Array.from(map.entries()).map(([date, miles]) => ({ date, miles }));
    arr.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return arr;
  }, [rows]);

  if (authRequired) return <AuthRequiredMessage label="獲得マイル" />;

  return (
    <div style={{ padding: "16px 18px" }}>
      {/* 残高 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
          現在のマイル
        </div>
        <div style={{ fontSize: 28, color: "#111", fontWeight: 700 }}>
          {typeof totalMiles === "number" ? totalMiles.toLocaleString() : "—"}
        </div>
      </div>

      {/* 状態 */}
      {loading && <div style={{ color: "#666" }}>読み込み中…</div>}
      {!loading && error && (
        <div style={{ color: "red", lineHeight: 1.7 }}>
          {error}
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              再読み込み
            </button>
          </div>
        </div>
      )}

      {/* 履歴 */}
      {!loading && !error && (
        <>
          <div style={{ marginTop: 8, marginBottom: 8, fontSize: 13, color: "#555" }}>
            マイル獲得履歴（購入日 / その日の獲得数）
          </div>

          {daily.length === 0 ? (
            <div style={{ color: "#666" }}>獲得履歴はまだありません。</div>
          ) : (
            <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, overflow: "hidden" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px",
                  background: "rgba(0,0,0,0.04)",
                  fontSize: 12,
                  color: "#333",
                  padding: "10px 12px",
                }}
              >
                <div>購入日</div>
                <div style={{ textAlign: "right" }}>獲得マイル</div>
              </div>

              {daily.map((r, idx) => (
                <div
                  key={`${r.date}-${idx}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px",
                    padding: "10px 12px",
                    borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ color: "#111" }}>{r.date}</div>
                  <div style={{ textAlign: "right", color: "#111", fontWeight: 600 }}>
                    +{Number(r.miles || 0).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
