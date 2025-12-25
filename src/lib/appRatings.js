// src/lib/appRatings.js
// 評価
// 評価＋飲みたいの統合一覧は /api/app/rated-panel を正とする

const API_BASE = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE || "";

// アプリ用トークン取得（MyAccountと同じキー）
function getAppToken() {
  try {
    return localStorage.getItem("app.access_token") || "";
  } catch {
    return "";
  }
}

// 位置情報を localStorage から拾う場合はここでまとめて取得
// いまはダミー（あとで ProductPage 側の仕様に合わせて書き換えでOK）
function getLatLonFromStorage() {
  try {
    const raw = localStorage.getItem("tm_last_location");
    if (!raw) return { latitude: null, longitude: null, located_at: null };
    const obj = JSON.parse(raw);
    return {
      latitude: obj.latitude ?? null,
      longitude: obj.longitude ?? null,
      located_at: obj.located_at ?? null,
    };
  } catch {
    return { latitude: null, longitude: null, located_at: null };
  }
}

// -----------------------------
// POST /api/app/ratings   ← ここだけ /api/app に
// -----------------------------
export async function postRating({ jan_code, rating }) {
  if (!API_BASE) {
    throw new Error("API_BASE が未設定です");
  }
  const token = getAppToken();
  if (!token) {
    throw new Error("アプリ用トークンがありません（未ログイン）");
  }

  const { latitude, longitude, located_at } = getLatLonFromStorage();

  const res = await fetch(`${API_BASE}/api/app/ratings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jan_code,
      rating,
      latitude,
      longitude,
      located_at,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `評価登録に失敗しました (${res.status}) ${txt || ""}`.trim()
    );
  }

  return await res.json(); // RatingOut
}

// -----------------------------
// GET /api/app/rated-panel?sort=...
// 評価＋飲みたいの統合一覧は rated-panel を正にする
// -----------------------------
export async function fetchRatedPanel(sort = "date") {
  if (!API_BASE) {
    throw new Error("API_BASE が未設定です");
  }
  const token = getAppToken();
  if (!token) {
    throw new Error("アプリ用トークンがありません（未ログイン）");
  }

  const qs = new URLSearchParams({ sort: String(sort || "date") });
  const res = await fetch(`${API_BASE}/api/app/rated-panel?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `評価・飲みたい一覧の取得に失敗しました (${res.status}) ${txt || ""}`.trim()
    );
  }

  return await res.json(); // RatedPanelOut { items:[...] }
}

// -----------------------------
// 互換：既存呼び出しが残っていても壊れないようにエイリアス
// （置き換えが完了したら削除OK）
// -----------------------------
export async function fetchLatestRatings(sort = "date") {
  return await fetchRatedPanel(sort);
}
