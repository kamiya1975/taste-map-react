// src/utils/store.js
/**
 * localStorage から mainStoreId を安全に数値化して返す（見つからなければ null）
 * - 既存の保存キーが揺れていても吸収する（読み取りのみ）
 * - 0 / NaN / 負数は null 扱い
 * - 2025.12.22.作成
 **/
export const getCurrentMainStoreIdSafe = () => {
  let raw = null;

  try {
    // 優先順位：現行で使われがちなキー順（app系→legacy系）
    raw =
      localStorage.getItem("app.main_store_id") ??
      localStorage.getItem("store.mainStoreId") ??
      localStorage.getItem("selectedStore") ??
      localStorage.getItem("main_store") ??
      localStorage.getItem("main_store_id") ??
      null;
  } catch (e) {
    // localStorage が使えない環境（SSR/プライベートモード例外など）は null
    return null;
  }

  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * mainStoreId を数値で返す（見つからない場合は fallback を返す）
 */
export const getCurrentMainStoreIdSafeOr = (fallback = null) => {
  const v = getCurrentMainStoreIdSafe();
  return v == null ? fallback : v;
};
