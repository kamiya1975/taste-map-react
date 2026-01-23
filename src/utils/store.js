// src/utils/store.js
/**
 * localStorage から mainStoreId を安全に数値化して返す（見つからなければ null）
 * - 既存の保存キーが揺れていても吸収する（読み取りのみ）
 * - 0 / NaN / 負数は null 扱い
 * - 2025.12.22.作成
 **/

const MAIN_STORE_KEY = "app.main_store_id";
const LEGACY_KEYS = [
  "store.mainStoreId",
  "selectedStore",
  "main_store",
  "main_store_id",
];

const toPositiveIntOrNull = (raw) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const setCurrentMainStoreId = (storeId) => {
  const id = toPositiveIntOrNull(storeId);
  if (id == null) return;
  try {
    localStorage.setItem(MAIN_STORE_KEY, String(id));
  } catch {}
};

export const clearLegacyMainStoreKeys = () => {
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {}
};

export const getCurrentMainStoreIdSafe = () => {
  try {
    // 優先順位：正キー → 旧キー群（読み取りのみ / migrate しない）
    const rawMain = localStorage.getItem(MAIN_STORE_KEY);
    const main = toPositiveIntOrNull(rawMain);
    if (main != null) return main;

    for (const k of LEGACY_KEYS) {
      const raw = localStorage.getItem(k);
      const v = toPositiveIntOrNull(raw);
      if (v != null) return v;
    }
  } catch (e) {
  // localStorage が使えない環境（SSR/プライベートモード例外など）は null
    return null;
  }
  return null;
};

/**
 * mainStoreId を数値で返す（見つからない場合は fallback を返す）
 */
export const getCurrentMainStoreIdSafeOr = (fallback = null) => {
  const v = getCurrentMainStoreIdSafe();
  return v == null ? fallback : v;
};
