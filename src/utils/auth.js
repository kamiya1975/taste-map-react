// src/utils/auth.js
export const USER_ID_KEY  = "tm_user_id";
export const GUEST_KEY    = "tm_guest";      // ゲストフラグ（既存互換）
export const GUEST_ID_KEY = "tm_guest_id";   // 端末ローカルのゲストID（新規）

/* ======================
   保存系
   ====================== */
export const setGuest = () => {
  // 既存互換：ゲストフラグを立て、ユーザーIDは消す
  localStorage.setItem(GUEST_KEY, "1");
  localStorage.removeItem(USER_ID_KEY);
  // ついでにゲストIDを確保（無ければ発行）
  return getGuestId();
};

export const clearGuest = () => {
  localStorage.removeItem(GUEST_KEY);
};

export const setUserId = (id) => {
  if (id == null || `${id}`.trim() === "") return;
  localStorage.setItem(USER_ID_KEY, String(id));
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
export const requireRatingOrRedirect = (navigate, dest = "/my-account") => {
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
