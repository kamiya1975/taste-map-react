// 超シンプルなローカル保存（デモ用）
// 本番はトークン化/暗号化 or サーバー保管に置き換えてください
const KEY = "tm.user.profile";

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p || {}));
    return true;
  } catch {
    return false;
  }
}
