// src/lib/appWishlist.js
// 飲みたい
// 評価＋飲みたいの統合一覧は /api/app/rated-panel を正とする
// この lib は「飲みたいのCRUD（詳細画面の★トグル等）」専用に残す

const API_BASE =
  process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE || "";

// アプリ用トークン取得（MyAccountと同じキー）
function getAppToken() {
  try {
    return localStorage.getItem("app.access_token") || "";
  } catch {
    return "";
  }
}

// -----------------------------
// GET /api/app/wishlist/{jan_code}
// -----------------------------
export async function fetchWishlistStatus(jan_code) {
  const token = getAppToken();
  if (!token) throw new Error("アプリ用トークンがありません（未ログイン）");

  const res = await fetch(
    `${API_BASE}/api/app/wishlist/${encodeURIComponent(String(jan_code))}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `飲みたい状態の取得に失敗しました (${res.status}) ${txt || ""}`.trim()
    );
  }
  return await res.json();
}

// -----------------------------
// POST /api/app/wishlist
// -----------------------------
export async function addWishlist(jan_code) {
  const token = getAppToken();
  if (!token) throw new Error("アプリ用トークンがありません（未ログイン）");

  const res = await fetch(`${API_BASE}/api/app/wishlist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jan_code }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `飲みたい登録に失敗しました (${res.status}) ${txt || ""}`.trim()
    );
  }
  return await res.json();
}

// -----------------------------
// DELETE /api/app/wishlist/{jan_code}
// -----------------------------
export async function removeWishlist(jan_code) {
  const token = getAppToken();
  if (!token) throw new Error("アプリ用トークンがありません（未ログイン）");

  const res = await fetch(
    `${API_BASE}/api/app/wishlist/${encodeURIComponent(String(jan_code))}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `飲みたい解除に失敗しました (${res.status}) ${txt || ""}`.trim()
    );
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  return { ok: true };  
}

// -----------------------------
// 互換：旧RatedPanelが fetchWishlist を呼んでいても壊れないように残す
// ただし「一覧表示」は rated-panel 正なので、新規では使わない。
// -----------------------------
export async function fetchWishlist() {
  const token = getAppToken();
  if (!token) throw new Error("アプリ用トークンがありません（未ログイン）");

  const res = await fetch(`${API_BASE}/api/app/wishlist`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `飲みたい一覧の取得に失敗しました (${res.status}) ${txt || ""}`.trim()
    );
  }
  return await res.json();
}
