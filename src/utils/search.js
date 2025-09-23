export const normalizeJP = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‐－―–]/g, "-")
    .replace(/[・･．。､，]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const buildSearchText = (d) =>
  normalizeJP(
    [
      d?.JAN,
      d?.Type,
      d?.商品名,
      d?.国,
      d?.産地,
      d?.葡萄品種,
      Number.isFinite(d?.希望小売価格) ? `¥${d.希望小売価格}` : "",
      d?.コメント,   // ★ 商品コメントも検索対象に追加
    ]
      .filter(Boolean)
      .join(" ")
  );

export const makeIndexed = (rows = []) =>
  rows.map((d) => ({ ...d, _searchText: buildSearchText(d) }));

export const searchItems = (indexed = [], query = "", limit = 50) => {
  const q = normalizeJP(query);
  if (!q) return [];
  const terms = q.split(" ");
  const out = [];
  for (const it of indexed) {
    const txt = it._searchText;
    let ok = true;
    for (const t of terms) {
      if (!txt.includes(t)) { ok = false; break; }
    }
    if (ok) out.push(it);
    if (out.length >= limit) break;
  }
  return out;
};
