let _cache = null;

export async function getVariantGidByJan(jan) {
  if (!_cache) {
    const url = (process.env.PUBLIC_URL || "") + "/ec/ec_links.json";
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`ec_links.json load failed: ${r.status} @ ${url}`);
    _cache = await r.json();
    console.log("[ec_links] loaded count=", Object.keys(_cache).length, "sample=", Object.keys(_cache).slice(0,3));
  }
  const key = String(jan).trim();
  console.log("[ec_links] lookup key=", key, "hit=", !!_cache[key]);
  return _cache[key];
}
