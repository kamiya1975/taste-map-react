import { http, HttpResponse } from "msw";
import stores from "../../public/stores.mock.json";

export const handlers = [
  http.get("/api/stores", ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    const limit = Number(url.searchParams.get("limit") || 10);

    let rows = stores;
    if (q) {
      rows = rows.filter(d =>
        (d.name || "").toLowerCase().includes(q) ||
        (d.address || "").toLowerCase().includes(q) ||
        (d.genre || "").toLowerCase().includes(q)
      );
    }
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const R = 6371;
      const distKm = (a, b) => {
        const dLat = (b.lat - a.lat) * Math.PI / 180;
        const dLon = (b.lon - a.lon) * Math.PI / 180;
        const la1 = a.lat * Math.PI / 180;
        const la2 = b.lat * Math.PI / 180;
        const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
        return 2 * R * Math.asin(Math.sqrt(h));
      };
      const me = { lat, lon };
      rows = [...rows].map(d => ({ ...d, _dist: distKm(me, { lat: d.lat, lon: d.lon }) }))
                       .sort((a,b)=>a._dist-b._dist);
    }
    return HttpResponse.json(rows.slice(0, limit));
  }),

  // 将来用：お気に入り系（ここではLocalStorage利用 or インメモリにしてもOK）
];
