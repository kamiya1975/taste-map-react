// src/lib/appRatings.js
const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

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
// POST /app/ratings
// -----------------------------
export async function postRating({ jan_code, rating }) {
  const token = getAppToken();
  if (!token) {
    throw new Error("アプリ用トークンがありません（未ログイン）");
  }

  const { latitude, longitude, located_at } = getLatLonFromStorage();

  const res = await fetch(`${API_BASE}/app/ratings`, {
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
// GET /app/ratings?sort=...
// -----------------------------
export async function fetchLatestRatings(sort = "date") {
  const token = getAppToken();
  if (!token) {
    throw new Error("アプリ用トークンがありません（未ログイン）");
  }

  const res = await fetch(`${API_BASE}/app/ratings?sort=${sort}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `評価一覧の取得に失敗しました (${res.status}) ${txt || ""}`.trim()
    );
  }

  return await res.json(); // RatingListOut { items: [...] }
}
