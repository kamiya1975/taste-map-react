// src/lib/shopifyMeta.js
// TasteMap → Shopify cart attributes を共通生成（user紐付けの正）
//
// 期待する localStorage:
// - tm_user_id
// - tm_main_store_id
//
// Shopify cart attributes のキー（衝突回避のため名前空間付き）:
// - tdb_user_id
// - tdb_main_store_id
// - tm_version

export function buildShopifyCartMeta() {
  const userId = localStorage.getItem("tm_user_id") || "";
  const mainStoreId = localStorage.getItem("tm_main_store_id") || "";
  const tmVersion =
    process.env.REACT_APP_TM_VERSION ||
    process.env.REACT_APP_TM_VERSION_NAME || // もし過去互換があるなら保険
    "unknown";

  return {
    cartAttributes: {
      tdb_user_id: userId,
      tdb_main_store_id: mainStoreId,
      tm_version: tmVersion,
    },
    note: `TasteMap order\nuser=${userId}\nstore=${mainStoreId}\nclient=${navigator.userAgent}`,
    discountCodes: [],
  };
}
