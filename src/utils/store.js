// src/utils/store.js
/**
 * localStorage から mainStoreId を安全に数値化して返す（見つからなければ null）
 * - 既存の保存キーが揺れていても吸収する（読み取りのみ）
 * - 0 / NaN / 負数は null 扱い
 * - 2025.12.22.作成

 * メイン店舗確定時に旧キーを全部消す（＝過去の残骸を無効化）
 * - 2026.01.追加
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
    // 旧キーを全削除（過去ブラウザ値の混入を防ぐ）
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {}
};

export const clearLegacyMainStoreKeys = () => {
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {}
};

export const getCurrentMainStoreIdSafe = () => {
  try {
    // 1) 正キー（これだけを“正”にする）
    const rawMain = localStorage.getItem(MAIN_STORE_KEY);
    const main = toPositiveIntOrNull(rawMain);
    if (main != null) return main;

    // 2) 正キーが無い場合だけ、旧キーを探して “移行（migrate）” する
    for (const k of LEGACY_KEYS) {
      const raw = localStorage.getItem(k);
      const v = toPositiveIntOrNull(raw);
      if (v != null) {
        // migrate：今後は必ず正キーで読む
        localStorage.setItem(MAIN_STORE_KEY, String(v));
        LEGACY_KEYS.forEach((kk) => localStorage.removeItem(kk));
        return v;
      }
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
