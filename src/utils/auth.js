// src/utils/auth.js
export const USER_ID_KEY  = "tm_user_id";
export const GUEST_KEY    = "tm_guest";      // ゲストフラグ（既存互換）
export const GUEST_ID_KEY = "tm_guest_id";   // 端末ローカルのゲストID（新規）

// --- Cookie helpers ---
const setCookie = (name, value, days = 365) => {
  try {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
  } catch {}
};
const getCookie = (name) => {
  try {
    const m = document.cookie.split("; ").find((r) => r.startsWith(`${name}=`));
    return m ? decodeURIComponent(m.split("=")[1]) : "";
  } catch { return ""; }
};
const delCookie = (name) => {
  try { document.cookie = `${name}=; path=/; max-age=0; samesite=lax`; } catch {}
};

/* ======================
   保存系
   ====================== */
export const setGuest = () => {
  // 既に本登録IDがあるならゲスト化しない（IDを消さない）
  if (getUserId()) {
    localStorage.removeItem(GUEST_KEY);
    return getGuestId();
  }
  localStorage.setItem(GUEST_KEY, "1");
  localStorage.removeItem(USER_ID_KEY);
  delCookie(USER_ID_KEY);
  // ついでにゲストIDを確保（無ければ発行）
  return getGuestId();
};

export const clearGuest = () => {
  localStorage.removeItem(GUEST_KEY);
};

export const setUserId = (id) => {
  if (id == null || `${id}`.trim() === "") return;
  localStorage.setItem(USER_ID_KEY, String(id));
  setCookie(USER_ID_KEY, String(id));   // ★ Cookieにも保存（Safari/ホーム共有用）
  clearGuest();         // ゲストフラグは解除
  // 本登録後はゲストIDも不要なら消す（任意）
  // localStorage.removeItem(GUEST_ID_KEY);
};

/* ======================
   参照系（既存）
   ====================== */
export const getUserId  = () => localStorage.getItem(USER_ID_KEY);
export const isGuest    = () => !!localStorage.getItem(GUEST_KEY) && !getUserId();
export const canUseRating = () => !!getUserId();

/* ======================
   起動時ブートストラップ
   ====================== */
export const bootstrapIdentity = () => {
  // 1) 既に localStorage にあれば Cookieも同期して終了
  const uid = getUserId();
  if (uid) { setCookie(USER_ID_KEY, uid); return uid; }
  // 2) Cookie に残っていれば localStorage に復元
  const fromCookie = getCookie(USER_ID_KEY);
  if (fromCookie) { setUserId(fromCookie); return fromCookie; }
  // 3) 旧キー（user.id）があれば移行
  const legacy = localStorage.getItem("user.id");
  if (legacy) { setUserId(legacy); return legacy; }
  return null;
};

/* ======================
   新規：ゲストIDの発行/取得 & クリア
   ====================== */
export const getGuestId = () => {
  let g = localStorage.getItem(GUEST_ID_KEY);
  if (!g) {
    const fallback = () =>
      "g-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
    g = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : fallback();
    localStorage.setItem(GUEST_ID_KEY, g);
  }
  return g;
};

export const clearGuestId = () => localStorage.removeItem(GUEST_ID_KEY);

/* ======================
   評価前チェック（既存）
   ====================== */
/**
 * 評価前チェック：未登録なら警告→MyPageを開くためのクエリに遷移
 * @param {Function} navigate react-router の navigate
 * @param {string} openParam デフォルト "open=mypage"
 * @returns {boolean} true=評価続行OK、false=中断（遷移済み）
 */
export const requireRatingOrRedirect = (navigate, dest = "/mymyaccount") => {
   if (canUseRating()) return true;
   alert("評価機能を使用するにはID登録が必要です。");
   try {
     // 商品ページは iframe 内なので、親（MapPage）に遷移依頼を送る
     if (window.top && window.top !== window.self) {
       window.parent?.postMessage(
         { type: "OPEN_MYACCOUNT", reason: "rating_redirect" },
         "*"
       );
     } else if (typeof navigate === "function") {
       navigate(dest);            // 直接 /my-account へ
     } else {
       window.location.href = dest;
     }
   } catch {
     if (typeof navigate === "function") navigate(dest);
   }
   return false;
 };
