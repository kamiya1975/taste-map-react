// src/components/panels/SimpleCartPanel.jsx
import React, { useMemo, useState } from "react";
import { useSimpleCart } from "../../cart/simpleCart";
import { createCartWithMeta } from "../../lib/shopifyCart";

// 環境変数からドメインを取得（CRA/Vite の両対応＋最後にハードコードfallback）
const SHOP_DOMAIN =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SHOPIFY_SHOP_DOMAIN) ||
  process.env.REACT_APP_SHOPIFY_SHOP_DOMAIN ||
  process.env.SHOPIFY_SHOP_DOMAIN || // 万一 define されていれば拾う
  "tastemap.myshopify.com";

export default function SimpleCartPanel({ onClose }) {
  const { items, totalQty, updateQty, remove, clear } = useSimpleCart();
  const [busy, setBusy] = useState(false);

  // TasteMap から渡すメタ情報の組み立て（例）
  function buildMeta() {
    const userId      = localStorage.getItem("tm_user_id") || "";
    const mainStoreId = localStorage.getItem("tm_main_store_id") || "";
    const appVer      = process.env.REACT_APP_TM_VERSION || "";
    return {
      cartAttributes: { user_id: userId, main_store_id: mainStoreId, app_ver: appVer },
      note: `TasteMap order\nuser=${userId}\nstore=${mainStoreId}\nclient=${navigator.userAgent}`,
      discountCodes: [], // 任意
    };
  }

  // UI 都合の整形（空や0個は除外）
  const uiItems = useMemo(() => {
  return (Array.isArray(items) ? items : []).map((it) => ({
    jan: String(it?.jan || it?.jan_code || it?.JAN || ""),
    qty: Math.max(1, Number(it?.qty || it?.quantity || 0)),

    // line item properties（Shopify注文アイテムに残るメタ情報）
    properties: {
      volume_ml: it?.volume_ml != null ? String(it.volume_ml) : (
        it?.["容量 ml"] != null ? String(it["容量 ml"]) : ""
      ),
      source: "TasteMap",
      // 任意：打点や評価なども付与可能
      sweet:  it?.sweet  != null ? String(it.sweet)  : undefined,
      body:   it?.body   != null ? String(it.body)   : undefined,
      rating: it?.rating != null ? String(it.rating) : undefined,
    },
  })).filter(x => x.jan && x.qty > 0);
}, [items]);

  const subtotal = useMemo(() => {
    let s = 0;
    for (const it of Array.isArray(items) ? items : []) {
      s += (Number(it.price) || 0) * (Number(it.qty) || 0);
    }
    return s;
  }, [items]);

  const empty = !Array.isArray(items) || items.length === 0;

  // 30分バックアップ用キー
  const BACKUP_KEY = "tm_cart_backup_v1";
  const BACKUP_EXPIRES_KEY = "tm_cart_backup_until";

  async function handleCheckout() {
    if (busy) return;
    setBusy(true);
    try {
      const meta = buildMeta?.() || {};

      // 1) 事前バックアップ
      const now = Date.now();
      sessionStorage.setItem(BACKUP_KEY, JSON.stringify(items || []));
      sessionStorage.setItem(BACKUP_EXPIRES_KEY, String(now + 30 * 60 * 1000));

      // 2) カート生成
      const { checkoutUrl, unresolved } = await createCartWithMeta(uiItems, meta);

      // 3) 未解決JANはそのまま残す（成功行だけ消すためにフィルタ）
      if (Array.isArray(unresolved) && unresolved.length) {
        alert("一部JANが未解決でした: " + unresolved.join(", "));
      }

      // 4) 成功した行（= 解決できたJAN）を除去 → ローカルカートをクリア
      //    もし「全部消したい」ならこの if を丸ごと clear() に置き換え
      const unresolvedSet = new Set(unresolved || []);
      const remaining = (items || []).filter(it => unresolvedSet.has(String(it.jan)));
      if (remaining.length === 0) {
        clear();                // 全消し
      } else {
        // 一部だけ残す
        remaining.forEach(it => updateQty(it.jan, it.qty));
        (items || [])
          .filter(it => !unresolvedSet.has(String(it.jan)))
          .forEach(it => updateQty(it.jan, 0));
      }

      // 5) 遷移
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      alert("カートURLが返ってきませんでした。");
    } catch (e) {
      console.error("[checkout] error:", e);
      // 6) 失敗時は復元（期限内のみ）
      try {
        const until = Number(sessionStorage.getItem(BACKUP_EXPIRES_KEY) || 0);
        const raw = sessionStorage.getItem(BACKUP_KEY);
       if (Date.now() < until && raw) {
          const backup = JSON.parse(raw);
          clear();
          (backup || []).forEach(it => updateQty(it.jan, it.qty));
        }
      } catch {}
      alert("決済開始に失敗しました: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 12 }}>
      {empty ? (
        <div style={{ padding: 12, color: "#555" }}>カートの中身は空です</div>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((it, idx) => (
              <li
                key={it.jan || idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <img
                  src={it.imageUrl || `${process.env.PUBLIC_URL || ""}/img/${it.jan}.png`}
                  alt=""
                  style={{ width: 48, height: 48, objectFit: "contain", flexShrink: 0 }}
                  draggable={false}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {it.title || it.jan}
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>JAN: {it.jan}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    価格: ¥{Number(it.price || 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => updateQty(it.jan, Math.max(0, Number(it.qty || 0) - 1))}
                    aria-label="数量を減らす"
                    style={{
                      width: 28,
                      height: 28,
                      border: "1px solid #111",
                      borderRadius: 6,
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={Number(it.qty || 0)}
                    onChange={(e) => updateQty(it.jan, Number(e.target.value || 0))}
                    style={{
                      width: 44,
                      height: 28,
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      textAlign: "center",
                    }}
                  />
                  <button
                    onClick={() => updateQty(it.jan, Number(it.qty || 0) + 1)}
                    aria-label="数量を増やす"
                    style={{
                      width: 28,
                      height: 28,
                      border: "1px solid #111",
                      borderRadius: 6,
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    ＋
                  </button>
                </div>
                <button
                  onClick={() => remove(it.jan)}
                  aria-label="削除"
                  style={{
                    marginLeft: 6,
                    width: 28,
                    height: 28,
                    border: "1px solid #c00",
                    color: "#c00",
                    borderRadius: 6,
                    background: "#fff",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {/* 合計表示 */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontWeight: 700 }}>
            <div>合計点数: {totalQty}</div>
            <div>小計: ¥{subtotal.toLocaleString()}</div>
          </div>

          {/* ボタン群 */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => clear()}
              style={{
                flex: 1,
                padding: "12px 10px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#fff",
                color: "#111",
                cursor: "pointer",
                fontWeight: 700,
              }}
              disabled={busy}
            >
              クリア
            </button>

            <button
              onClick={handleCheckout}
              disabled={busy || (Number(totalQty) || 0) <= 0}
              style={{
                flex: 2,
                padding: "12px 10px",
                borderRadius: 10,
                border: "1px solid #111",
                background: (Number(totalQty) || 0) > 0 && !busy ? "#111" : "#eee",
                color: (Number(totalQty) || 0) > 0 && !busy ? "#fff" : "#999",
                cursor: (Number(totalQty) || 0) > 0 && !busy ? "pointer" : "default",
                fontWeight: 700,
              }}
              title={busy ? "処理中…" : SHOP_DOMAIN ? `Shopify: ${SHOP_DOMAIN}` : "Shopifyドメイン未設定"}
            >
              {busy ? "送信中…" : "決済に進む"}
            </button>
          </div>
        </>
      )}

      <div style={{ height: 12 }} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #999",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
