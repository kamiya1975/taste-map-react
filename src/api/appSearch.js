// src/api/appSearch.js
// アプリ用検索API: /api/app/search/products を叩くラッパー

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

export async function fetchSearchProducts({
  q,
  limit = 50,
  mainStoreId,
  subStoreIds,      // 配列 [1,2,3] 想定
  accessToken,      // app用アクセストークン（任意）
}) {
  const needle = String(q || "").trim();
  if (!needle) return [];

  const params = new URLSearchParams();
  params.set("q", needle);
  params.set("limit", String(limit));
  if (mainStoreId != null) params.set("main_store_id", String(mainStoreId));
  if (Array.isArray(subStoreIds) && subStoreIds.length) {
    params.set("sub_store_ids", subStoreIds.join(","));
  }

  const res = await fetch(`${API_BASE}/api/app/search/products?${params.toString()}`, {
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  });

  if (!res.ok) {
    throw new Error(`検索APIエラー: HTTP ${res.status}`);
  }

  const json = await res.json();   // { items: [...] }
  return Array.isArray(json.items) ? json.items : [];
}
