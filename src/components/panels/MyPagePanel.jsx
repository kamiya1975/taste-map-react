// src/components/panels/MyPagePanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import Drawer from "@mui/material/Drawer";

/* =========================
   共通UI
   ========================= */
const CIRCLE_BTN = {
  position: "fixed",
  left: "12px",
  bottom: "max(12px, env(safe-area-inset-bottom))",
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: "#eee",
  border: "1px solid #ccc",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 20,
  zIndex: 1400,
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  userSelect: "none",
};

function Header({ title, onClose, onBack }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: "1px solid rgba(0,0,0,0.1)",
        background: "rgba(0,0,0,0.04)",
      }}
    >
      {/* 左側：戻る or ロゴ */}
      {onBack ? (
        <button
          onClick={onBack}
          aria-label="戻る"
          style={{ background: "transparent", border: "none", fontSize: 18, padding: 6, cursor: "pointer" }}
        >
          ←
        </button>
      ) : (
        <div
          style={{
            width: 28, height: 28, borderRadius: "50%", background: "#ddd",
            display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          }}
          aria-hidden
        >
          ●
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 15, flex: 1, color: "#111" }}>{title}</div>
      <button
        onClick={onClose}
        aria-label="閉じる"
        style={{ background: "transparent", border: "none", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 6 }}
      >
        ×
      </button>
    </div>
  );
}

function Row({ icon, label, onClick, last = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", padding: "14px 18px",
        background: "transparent", border: "none", cursor: "pointer", WebkitTapHighlightColor: "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 22, display: "inline-flex", justifyContent: "center" }}>{icon}</span>
        <span style={{ fontSize: 15, color: "#111" }}>{label}</span>
      </div>
      {!last && <div style={{ marginTop: 14, height: 1, background: "rgba(0,0,0,0.08)" }} />}
    </button>
  );
}

/* =========================
   位置・店舗ユーティリティ（簡易版）
   ========================= */
const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function resolveLocation() {
  const geo = await new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
    );
  });
  if (geo) return geo;

  try {
    const token = process.env.REACT_APP_IPINFO_TOKEN;
    if (token) {
      const r = await fetch(`https://ipinfo.io/json?token=${token}`);
      const j = await r.json();
      const [la, lo] = (j.loc || "").split(",").map(Number);
      if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lon: lo };
    }
  } catch {}

  return { lat: 35.681236, lon: 139.767125 }; // 東京駅
}

async function fetchStores({ q = "", lat = null, lon = null, limit = 50 } = {}) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (Number.isFinite(lat) && Number.isFinite(lon)) { qs.set("lat", String(lat)); qs.set("lon", String(lon)); }
  if (limit) qs.set("limit", String(limit));

  // 本番API（将来）
  try {
    const res = await fetch(`/api/stores?${qs.toString()}`, { credentials: "include" });
    if (res.ok) return await res.json();
  } catch {}

  // モック（public/stores.mock.json）
  const res2 = await fetch("/stores.mock.json");
  if (!res2.ok) return [];
  const all = await res2.json();
  let rows = Array.isArray(all) ? all : [];
  if (q) {
    const qq = q.trim().toLowerCase();
    rows = rows.filter((d) =>
      (d.name || "").toLowerCase().includes(qq) ||
      (d.branch || "").toLowerCase().includes(qq) ||
      (d.address || "").toLowerCase().includes(qq) ||
      (d.genre || "").toLowerCase().includes(qq)
    );
  }
  return limit ? rows.slice(0, limit) : rows;
}

/* =========================
   メイン：MyPagePanel
   ========================= */
export default function MyPagePanel({
  isOpen,
  onClose,

  // 任意：スライダーを開く等、外部へ委譲したいときに利用
  onOpenSlider,
}) {
  const [view, setView] = useState("menu"); // menu | mapGuide | baseline | account | favorites | faq
  const goMenu = () => setView("menu");

  // アカウント（最小構成。値は localStorage に保存）
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [gender, setGender] = useState("");

  // 店舗（近い順10件）
  const [stores, setStores] = useState([]);
  const [geo, setGeo] = useState(null);
  const [loadingStores, setLoadingStores] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (view === "account") {
      setNickname(localStorage.getItem("user.nickname") || "");
      setEmail(localStorage.getItem("user.id") || "");
      setBirthYear(localStorage.getItem("user.birthYear") || "");
      setBirthMonth(localStorage.getItem("user.birthMonth") || "");
      setGender(localStorage.getItem("user.gender") || "");
    }
    if (view === "favorites") {
      (async () => {
        setLoadingStores(true);
        const loc = await resolveLocation();
        setGeo(loc);
        const rows = await fetchStores({ lat: loc.lat, lon: loc.lon, limit: 80 });
        const normalized = rows.map((d) => ({
          ...d,
          lat: Number.isFinite(d.lat) ? d.lat : d.latitude,
          lon: Number.isFinite(d.lon) ? d.lon : d.lng,
        }));
        // 距離付与 & 近い順→35km以内優先→最大10件
        const withDist = normalized.map((s) => ({
          ...s,
          _dist: (Number.isFinite(s.lat) && Number.isFinite(s.lon))
            ? haversineKm(loc.lat, loc.lon, s.lat, s.lon)
            : Infinity,
        }));
        withDist.sort((a, b) => a._dist - b._dist);
        const within = withDist.filter((s) => s._dist <= 35);
        const top10 = (within.length ? within : withDist).slice(0, 10);
        setStores(top10);
        setLoadingStores(false);
      })();
    }
  }, [isOpen, view]);

  const saveProfile = () => {
    localStorage.setItem("user.nickname", nickname || "");
    localStorage.setItem("user.id", email || "");
    localStorage.setItem("user.birthYear", birthYear || "");
    localStorage.setItem("user.birthMonth", birthMonth || "");
    localStorage.setItem("user.gender", gender || "");
    alert("保存しました。");
  };

  const fmtKm = (d) => (Number.isFinite(d) ? `（${d.toFixed(1)}km）` : "");

  return (
    <>
      {isOpen && (
        <button
          onClick={() => {
            if (document.activeElement && "blur" in document.activeElement) document.activeElement.blur();
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
            onClose?.();
          }}
          style={CIRCLE_BTN}
          aria-label="閉じる"
        >
          ×
        </button>
      )}

      <Drawer
        anchor="left"
        open={isOpen}
        onClose={onClose}
        PaperProps={{
          style: {
            width: "86vw",
            maxWidth: 480,
            borderRadius: "0 12px 12px 0",
            display: "flex",
            flexDirection: "column",
            background: "#FAF7F1",
          },
        }}
      >
        {/* ヘッダー */}
        <Header
          title={
            view === "menu" ? "アプリガイド" :
            view === "mapGuide" ? "マップガイド" :
            view === "baseline" ? "基準のワイン 再設定" :
            view === "account" ? "マイアカウント" :
            view === "favorites" ? "お気に入り店舗登録" :
            "よくある質問"
          }
          onClose={onClose}
          onBack={view === "menu" ? undefined : goMenu}
        />

        {/* 本文 */}
        <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
          {view === "menu" && (
            <>
              <Row icon={<span role="img" aria-label="target">🎯</span>} label="マップガイド" onClick={() => setView("mapGuide")} />
              <Row icon={<span role="img" aria-label="slider">🎚️</span>} label="基準のワイン 再設定" onClick={() => setView("baseline")} />
              <Row icon={<span role="img" aria-label="footsteps">👣</span>} label="マイアカウント" onClick={() => setView("account")} />
              <Row icon={<span role="img" aria-label="star">⭐</span>} label="お気に入り店舗登録" onClick={() => setView("favorites")} />
              <Row icon={<span role="img" aria-label="question">❓</span>} label="よくある質問" onClick={() => setView("faq")} last />
            </>
          )}

          {view === "mapGuide" && (
            <section style={{ padding: "14px 16px", lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                基準のワインを出発点に、様々なワインを飲んで評価し、<br />
                自分の好みの位置を知りながら、自分だけの地図を完成させましょう。
              </p>
              <ul style={{ paddingLeft: 18 }}>
                <li>周辺で購入できるワインを示し、味や香りによって分布します。</li>
                <li>「あとで飲む」に登録されたワインは専用リストに表示されます。</li>
                <li>ワインを評価すると地図上に表示され、評価に応じて記号サイズが変化します。</li>
                <li>枠は「ワインが配置されている範囲」を表します。</li>
              </ul>
              <div style={{ marginTop: 16, fontSize: 12, color: "#6e6e73" }}>
                ※ 表示内容は将来アップデートで調整される場合があります。
              </div>
            </section>
          )}

          {view === "baseline" && (
            <section style={{ padding: "14px 16px", lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                あなたの「基準のワイン」（甘味・酸味・渋み・濃淡などの好み）を再設定します。
              </p>
              <button
                onClick={() => { onClose?.(); onOpenSlider?.(); }}
                style={{
                  width: "100%", padding: "12px", background: "#fff",
                  border: "1px solid #d1d1d6", borderRadius: 10, fontWeight: 600, cursor: "pointer",
                }}
              >
                スライダーを開く
              </button>
            </section>
          )}

          {view === "account" && (
            <section style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>アカウント</div>
              <div style={{ background: "#fff", border: "1px solid #d1d1d6", borderRadius: 12, overflow: "hidden" }}>
                {[
                  ["ニックネーム", nickname, setNickname, "text", "-"],
                  ["ID", email, setEmail, "email", "example@mail.com"],
                  ["生まれ年", birthYear, setBirthYear, "year", ""],
                  ["生まれ月", birthMonth, setBirthMonth, "month", ""],
                  ["性別", gender, setGender, "gender", ""],
                ].map(([label, val, setter, kind, ph], i, arr) => (
                  <div
                    key={label}
                    style={{
                      display: "grid", gridTemplateColumns: "80px 1fr", gap: 8,
                      padding: "12px 14px",
                      borderBottom: i !== arr.length - 1 ? "1px solid #e5e5ea" : "none",
                      alignItems: "center", fontSize: 12,
                    }}
                  >
                    <div style={{ color: "#1c1c1e" }}>{label}</div>
                    {kind === "year" ? (
                      <select value={val} onChange={(e) => setter(e.target.value)} style={selectStyle}>
                        <option value="">-</option>
                        {Array.from({ length: 80 }, (_, i) => (2025 - i).toString()).map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    ) : kind === "month" ? (
                      <select value={val} onChange={(e) => setter(e.target.value)} style={selectStyle}>
                        <option value="">-</option>
                        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : kind === "gender" ? (
                      <select value={val} onChange={(e) => setter(e.target.value)} style={selectStyle}>
                        <option value="">-</option>
                        <option value="男性">男性</option>
                        <option value="女性">女性</option>
                        <option value="その他">その他</option>
                      </select>
                    ) : (
                      <input
                        type={kind}
                        value={val}
                        onChange={(e) => setter(e.target.value)}
                        placeholder={ph}
                        style={inputStyle}
                        autoComplete={kind === "email" ? "email" : "off"}
                        inputMode={kind === "email" ? "email" : undefined}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button
                  onClick={saveProfile}
                  style={{ padding: "10px 16px", background: "#007aff", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}
                >
                  保存
                </button>
              </div>
            </section>
          )}

          {view === "favorites" && (
            <section style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "#6e6e73", marginBottom: 8 }}>
                お気に入り店舗登録（35km以内／最大10件）
              </div>
              {loadingStores ? (
                <div>店舗情報を読み込み中…</div>
              ) : (
                <div style={{ background: "#fff", border: "1px solid #d1d1d6", borderRadius: 12, overflow: "hidden" }}>
                  {stores.map((s, i) => (
                    <div
                      key={`${s.name || s.storeName}-${s.branch || s.storeBranch}-${i}`}
                      style={{
                        padding: "12px 14px",
                        borderBottom: i !== stores.length - 1 ? "1px solid #e5e5ea" : "none",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {(s.name || s.storeName) + " " + (s.branch || s.storeBranch || "")}
                      </div>
                      <div style={{ fontSize: 12, color: "#6e6e73" }}>
                        {fmtKm(s._dist)} {geo ? "" : "(位置未取得)"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {view === "faq" && (
            <section style={{ padding: "14px 16px", lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>データの扱い</div>
              <ul style={{ paddingLeft: 18 }}>
                <li>現在は DB 未接続のため、プロフィール・店舗・お気に入りはブラウザの <code>localStorage</code> に保存します。</li>
                <li>店舗一覧は <code>/api/stores</code> 失敗時に <code>/stores.mock.json</code>（ダミーデータ）へフォールバックします。</li>
                <li>本番は、杉浦さんの管理ページ API（FastAPI想定）に差し替え予定です。</li>
              </ul>

              <div style={{ height: 12 }} />

              <div style={{ fontWeight: 700, marginBottom: 6 }}>よくある質問</div>
              <p style={{ margin: 0 }}>
                <strong>Q.</strong> 位置情報を許可しないと使えない？<br />
                <strong>A.</strong> 許可しなくても使えます。東京駅を基準に並び替えます。
              </p>
              <div style={{ height: 8 }} />
              <p style={{ margin: 0 }}>
                <strong>Q.</strong> 店舗が出てこない／固定店舗が変わらない<br />
                <strong>A.</strong> <code>stores.mock.json</code> の配置と、マイページの「モック読込」を確認してください。
              </p>
            </section>
          )}
        </div>
      </Drawer>
    </>
  );
}

/* ===== 入力系（ズーム回避のため14px以上） ===== */
const baseInput = {
  border: "none",
  outline: "none",
  fontSize: 14,
  padding: "8px 4px",
  background: "transparent",
  color: "#1c1c1e",
  lineHeight: "1.4",
  textAlign: "left",
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const inputStyle = { ...baseInput };
const selectStyle = { ...baseInput, appearance: "none" };
