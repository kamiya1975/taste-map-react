let _cache = null;

export async function getVariantGidByJan(jan) {
  if (!_cache) {
    const r = await fetch(process.env.PUBLIC_URL + "/ec/ec_links.json", { cache: "no-store" });
    if (!r.ok) throw new Error("ec_links.json が読み込めません");
    _cache = await r.json();
  }
  return _cache[String(jan).trim()];
}
