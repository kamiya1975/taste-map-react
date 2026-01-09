// src/components/panels/MilesPanelContent.jsx
// 獲得マイル パネル
import React, { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../ui/constants";
import ListRow from "../ui/ListRow";

function toTimeMs(v) {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

function toDottedYmd(dateLike) {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${dd}.`;
}

function pickOrderNo(t) {
  // shopify_order_name が "#1007" の想定（無ければ空）
  const s = String(t?.shopify_order_name || "").trim();
  if (s) return s;
  // 予備：idしか無い場合は "#<id>" にはしない（勝手に番号を捏造しない）
  return "";
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

// 右側：+49 の表示
function RightDelta({ delta }) {
  const n = Number(delta || 0);
  const sign = n >= 0 ? "+" : "";
  return (
    <div
      style={{
        width: 70,
        textAlign: "right",
        fontWeight: 700,
        fontSize: 16,
        lineHeight: 1,
      }}
      aria-label="獲得マイル"
      title="獲得マイル"
    >
      {sign}{n.toLocaleString()}
    </div>
  );
}

export default function MilesPanelContent() {
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState("");
  const [totalMiles, setTotalMiles] = useState(null); // balance
  const [rows, setRows] = useState([]); // transactions
  const [totalCount, setTotalCount] = useState(0);
  // 行タップで展開（注文items簡易表示）
  const [openKey, setOpenKey] = useState(""); // 展開中のキー（1行だけ開く）
  const [orderCache, setOrderCache] = useState({}); // { [key]: { loading, error, data } }

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

        // 新API（summary）：balance / transactions / count
        const total =
          (typeof json?.balance === "number" ? json.balance : null) ??
          (typeof json?.total_miles === "number" ? json.total_miles : null) ??
          (typeof json?.total === "number" ? json.total : null) ??
          null;

        const list =
          (Array.isArray(json?.transactions) ? json.transactions : null) ??
          (Array.isArray(json?.items) ? json.items : null) ??
          (Array.isArray(json?.history) ? json.history : null) ??
          [];

        const cnt =
          (typeof json?.count === "number" ? json.count : null) ??
          list.length ??
          0;

        if (!cancelled) {
          setTotalMiles(total);
          setRows(list);
          setTotalCount(Number(cnt || 0));
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

  // 念のため created_at desc に整列（バックを信頼しつつ安全弁）
  const ordered = useMemo(() => {
    const arr = Array.isArray(rows) ? [...rows] : [];
    arr.sort((a, b) => {
      const ta = toTimeMs(a?.created_at);
      const tb = toTimeMs(b?.created_at);
      if (ta !== tb) return tb - ta;
      return Number(b?.id || 0) - Number(a?.id || 0);
    });
    return arr;
  }, [rows]);

  function getTokenSafe() {
    try {
      return localStorage.getItem("app.access_token") || "";
    } catch {
      return "";
    }
  }

  function getShopifyOrderIdFromTx(t) {
    // transactions の形が揺れても拾えるように
    // 期待：t.shopify_order_id（Shopifyの注文ID文字列）
    const v =
      t?.shopify_order_id ??
      t?.shopifyOrderId ??
      t?.order_id ??
      t?.shopify_order?.shopify_order_id ??
      "";
    return v ? String(v) : "";
  }

  async function ensureOrderDetail(key, shopifyOrderId) {
    if (!shopifyOrderId) return;
    if (orderCache[key]?.data || orderCache[key]?.loading) return;

    const token = getTokenSafe();
    if (!token) return;

    setOrderCache((m) => ({ ...m, [key]: { loading: true, error: "", data: null } }));
    try {
      const res = await fetch(`${API_BASE}/api/app/orders/${encodeURIComponent(shopifyOrderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setOrderCache((m) => ({ ...m, [key]: { loading: false, error: "", data: json } }));
    } catch (e) {
      console.error("order detail fetch failed:", e);
      setOrderCache((m) => ({ ...m, [key]: { loading: false, error: "注文詳細の取得に失敗しました。", data: null } }));
    }
  }

  function OrderItemsPreview({ state }) {
    if (!state) return null;
    if (state.loading) {
      return <div style={{ fontSize: 13, color: "#666" }}>注文内容を読み込み中…</div>;
    }
    if (state.error) {
      return <div style={{ fontSize: 13, color: "red" }}>{state.error}</div>;
    }
    const items = Array.isArray(state?.data?.items) ? state.data.items : [];
    if (items.length === 0) {
      return <div style={{ fontSize: 13, color: "#666" }}>注文内容がありません。</div>;
    }

    const head = items.slice(0, 3);
    const rest = items.length - head.length;
    return (
      <div
        onClick={(e) => e.stopPropagation()} // 展開内タップで行の開閉が暴れないように
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: "#f7f7f7",
          border: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>注文内容</div>
        <div style={{ display: "grid", gap: 4 }}>
          {head.map((it, i) => {
            const jan = it?.jan_code ? String(it.jan_code) : "JAN不明";
            const qty = Number(it?.quantity || 0);
            return (
              <div key={`${jan}-${i}`} style={{ fontSize: 13, color: "#222", lineHeight: 1.5 }}>
                {jan} × {qty}
              </div>
            );
          })}
          {rest > 0 && (
            <div style={{ fontSize: 13, color: "#666" }}>他 {rest} 点</div>
          )}
        </div>
      </div>
    );
  }

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
            マイル獲得履歴
          </div>

          {ordered.length === 0 ? (
            <div style={{ color: "#666" }}>獲得履歴はまだありません。</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {ordered.map((t, idx) => {
                const rank = totalCount ? Math.max(totalCount - idx, 1) : idx + 1;
                const date = toDottedYmd(t?.created_at);
                const orderNo = pickOrderNo(t);
                const dateText = orderNo ? `${date}  注文番号 ${orderNo}` : date;

                const shopifyOrderId = getShopifyOrderIdFromTx(t);
                const rowKey = `${t?.id ?? ""}-${t?.created_at ?? ""}-${idx}`;
                const isOpen = openKey === rowKey;
                const detailState = orderCache[rowKey];

                return (
                  <ListRow
                    key={rowKey}
                    index={rank}
                    item={{}}                 // 表示に使わない（ListRow側でhideName/hideBadge）
                    onPick={() => {
                      // トグル　　注文詳細表示
                      const next = isOpen ? "" : rowKey;
                      setOpenKey(next);
                      if (!isOpen && shopifyOrderId) {
                        ensureOrderDetail(rowKey, shopifyOrderId);
                      }
                    }}
                    showDate
                    dateValue={t?.created_at}
                    dateText={dateText}       // 日付行に注文番号を合体
                    hideName                  // 「その日の獲得数」等の2行目を出さない
                    hideBadge                 // wine_type色ブロックを出さない
                    // Miles は色チップいらないので薄いグレー固定
                    accentColor={"#b4b4b4"}
                    extraRight={<RightDelta delta={t?.delta} />}
                    extraBottom={
                      isOpen ? <OrderItemsPreview state={detailState} /> : null
                    }
                  />
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
