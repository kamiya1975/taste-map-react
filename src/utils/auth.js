// src/utils/auth.js
export const USER_ID_KEY = "tm_user_id";
export const GUEST_KEY = "tm_guest";

// ===== 保存系 =====
export const setGuest = () => {
  localStorage.setItem(GUEST_KEY, "1");
  localStorage.removeItem(USER_ID_KEY);
};

export const clearGuest = () => {
  localStorage.removeItem(GUEST_KEY);
};

export const setUserId = (id) => {
  if (id == null || `${id}`.trim() === "") return;
  localStorage.setItem(USER_ID_KEY, String(id));
  clearGuest();
};

// ===== 参照系 =====
export const getUserId = () => localStorage.getItem(USER_ID_KEY);
export const isGuest = () => !!localStorage.getItem(GUEST_KEY) && !getUserId();

// 「評価できる条件」= ユーザーIDがあること（＝登録済み）
export const canUseRating = () => !!getUserId();

/**
 * 評価前チェック：未登録なら警告→MyPageを開くためのクエリに遷移
 * @param {Function} navigate react-router の navigate
 * @param {string} openParam デフォルト "open=mypage"
 * @returns {boolean} true=評価続行OK、false=中断（遷移済み）
 */
export const requireRatingOrRedirect = (navigate, openParam = "open=mypage") => {
  if (canUseRating()) return true;
  // ※ 表記は「使用」が正です
  alert("評価機能を使用するにはID登録が必要です。");
  navigate(`/?${openParam}`);
  return false;
};
