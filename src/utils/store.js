// src/utils/store.js
/**
 * 店舗文脈を localStorage から安全に取得・保存するユーティリティ
 *
 * - app.main_store_id
 *   通常導線で選択したメイン店舗。
 *   ログイン時は DB の user.main_store_id から復元される。
 *
 * - app.qr_context_store_id
 *   QRから現在表示している店舗。
 *   DBや app.main_store_id は変更せず、表示文脈としてのみ優先する。
 */

const MAIN_STORE_KEY = "app.main_store_id";
export const QR_CONTEXT_STORE_KEY = "app.qr_context_store_id";

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

/* =========================================================
 * 通常メイン店舗
 * ========================================================= */

export const setCurrentMainStoreId = (storeId) => {
  const id = toPositiveIntOrNull(storeId);
  if (id == null) return false;

  try {
    localStorage.setItem(MAIN_STORE_KEY, String(id));
    return true;
  } catch {
    return false;
  }
};

export const clearCurrentMainStoreId = () => {
  try {
    localStorage.removeItem(MAIN_STORE_KEY);
  } catch {}
};

export const clearLegacyMainStoreKeys = () => {
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {}
};

export const getCurrentMainStoreIdSafe = () => {
  try {
    // 正式キーを最優先
    const rawMain = localStorage.getItem(MAIN_STORE_KEY);
    const main = toPositiveIntOrNull(rawMain);
    if (main != null) return main;

    // 旧キーは読み取り互換のみ
    for (const k of LEGACY_KEYS) {
      const raw = localStorage.getItem(k);
      const value = toPositiveIntOrNull(raw);
      if (value != null) return value;
    }
  } catch {
    return null;
  }

  return null;
};

export const getCurrentMainStoreIdSafeOr = (fallback = null) => {
  const value = getCurrentMainStoreIdSafe();
  return value == null ? fallback : value;
};

/* =========================================================
 * QR店舗文脈
 * ========================================================= */

export const setQrContextStoreId = (storeId) => {
  const id = toPositiveIntOrNull(storeId);
  if (id == null) return false;

  try {
    localStorage.setItem(QR_CONTEXT_STORE_KEY, String(id));
    return true;
  } catch {
    return false;
  }
};

export const getQrContextStoreIdSafe = () => {
  try {
    return toPositiveIntOrNull(
      localStorage.getItem(QR_CONTEXT_STORE_KEY)
    );
  } catch {
    return null;
  }
};

export const clearQrContextStoreId = () => {
  try {
    localStorage.removeItem(QR_CONTEXT_STORE_KEY);
  } catch {}
};

/* =========================================================
 * 現在の表示店舗
 * QR店舗があればQR店舗、なければ通常メイン店舗
 * ========================================================= */

export const getCurrentDisplayStoreIdSafe = () => {
  return (
    getQrContextStoreIdSafe() ??
    getCurrentMainStoreIdSafe()
  );
};

