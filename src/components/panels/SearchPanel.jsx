// src/components/panels/SearchPanel.jsx
// 検索パネル
// 初期一覧は 選択した店舗（EC連携有無含む）商品一覧
// 検索対象は 上記初期一覧の商品の中から
// バーコードカメラ検索 の検索対象は tdb_product（DB全商品）の中から　※バーコードカメラについては別ファイル
import React, { useMemo, useState, useEffect, useRef } from "react";
import Drawer from "@mui/material/Drawer";
import { normalizeJP } from "../../utils/search";
import { drawerModalProps, paperBaseStyle, DRAWER_HEIGHT } from "../../ui/constants";
import ListRow from "../ui/ListRow";
import PanelHeader from "../ui/PanelHeader";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

export default function SearchPanel({ open, onClose, data = [], onPick, onScanClick }) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [apiItems, setApiItems] = useState([]); // /app/search/products の結果
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // パネルが閉じられたら状態をリセット
  useEffect(() => {
    if (!open) {
      setQ("");
      setQDebounced("");
      setApiItems([]);
      setLoading(false);
      setErrorMsg("");
    }
  }, [open]);

  // 入力のデバウンス
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setQDebounced(q), 260);
    return () => clearTimeout(id);
  }, [q, open]);

  const scrollRef = useRef(null);
  const SCROLL_KEY = "searchPanel.scrollTop";

  // ===== points.csv(UMAP) 側の揺れを吸収して「表示/遷移に必要なキー」に正規化 =====
  const getJan = (d) => {
    const v =
      d?.jan_code ??
      d?.JAN ??
      d?.jan ??
      d?.barcode ??
      d?.BARCODE ??
      d?.code ??
      null;
    return v === null || v === undefined ? "" : String(v).trim();
  };

  const getName = (d) => {
    // points.csv は temp_name のことが多いので拾う
    const v =
      d?.name_kana ??
      d?.name ??
      d?.商品名 ??
      d?.["商品名"] ??
      d?.temp_name ??
      null;
    return v === null || v === undefined ? "" : String(v).trim();
  };

  const getWineType = (d) => {
    const v =
      d?.wine_type ??
      d?.Type ??
      d?.type ??
      d?.wineType ??
      null;
    return v === null || v === undefined ? "" : String(v).trim().toLowerCase();
  };

  const normalizeLocalItem = (d) => {
    const jan = getJan(d);
    const name = getName(d) || jan;
    const wineType = getWineType(d);
    return {
      ...d,
      JAN: jan,
      jan_code: jan,
      name_kana: name,
      商品名: name,     // ListRow互換
      wine_type: wineType,
      Type: wineType,   // 旧互換
    };
  };
  
  // UMAP データを JAN → item のマップにしておく（必ず正規化して格納）
  const janToLocal = useMemo(() => {
    const m = new Map();
    (Array.isArray(data) ? data : []).forEach((d) => {
      const nd = normalizeLocalItem(d);
      const key = nd.jan_code;
      if (!key) return;
      if (!m.has(key)) m.set(key, nd);
    });
    return m;
  }, [data]);

  // 初期一覧（検索語なし）：正規化した上で商品名昇順
  const initialSorted = useMemo(() => {
    const arr = (Array.isArray(data) ? data : [])
      .map(normalizeLocalItem)
      .filter((x) => !!x.jan_code); // JAN無しは落とす（事故防止）
    arr.sort((a, b) => {
      const na = String(a?.name_kana || "").trim() || String(a?.jan_code || "");
      const nb = String(b?.name_kana || "").trim() || String(b?.jan_code || "");
      return na.localeCompare(nb, "ja");
    });
    return arr;
  }, [data]);

  // バックエンド検索呼び出し
  useEffect(() => {
    if (!open) return;

    const trimmed = (qDebounced || "").trim();
    // 空欄のときは API を叩かない（初期一覧のみローカルで表示）
    if (!trimmed) {
      setApiItems([]);
      setLoading(false);
      setErrorMsg("");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const token =
          (typeof window !== "undefined" &&
            (localStorage.getItem("app.access_token") || "")) ||
          "";

        const params = new URLSearchParams({
          q: trimmed,
          limit: "50",
        });

        const res = await fetch(
          `${API_BASE}/api/app/search/products?${params.toString()}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (cancelled) return;
        const items = Array.isArray(json?.items) ? json.items : [];
        // 検索対象は「初期一覧（=打点あり）に含まれるJANだけ」（協議 3）
        const filtered = items.filter((p) => {
          const jan = String(p?.jan_code || "").trim();
          return janToLocal.has(jan);
        });
        setApiItems(filtered);
      } catch (e) {
        if (cancelled || e.name === "AbortError") return;
        console.error("[SearchPanel] search error:", e);
        setErrorMsg("検索に失敗しました。時間をおいて再度お試しください。");
        setApiItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [qDebounced, open]);

  // 検索結果を UMAP データとマージ
  const results = useMemo(() => {
    const nq = normalizeJP(qDebounced || "");
    // 検索語があるとき：API の結果を基準
    if (nq) {
      if (!apiItems.length) return [];
      return apiItems.map((p, idx) => {
        const jan = String(p.jan_code || "").trim();
        const local = janToLocal.get(jan);

        // 表示用（ListRowが拾うキーに合わせる）
        const name = (String(p.name_kana || p.name || "").trim() || jan);
        const wineType = (String(p.wine_type || "").trim().toLowerCase());

        return {
          // まずローカルの情報を敷き（UMAP座標など）
          ...(local || {}),
          // その上に API 情報をマージ
          JAN: jan,
          jan_code: jan,
          wine_type: wineType,
          name_kana: name,
          商品名: name, // ListRow互換
          Type: wineType, // 旧互換（ListRowは item.wine_type を主に見る）
        };
      });
    }

    // 検索語がないとき：初期一覧をそのまま
    return initialSorted;
  }, [qDebounced, apiItems, janToLocal, initialSorted]);

  const pick = (i) => {
    const it = results[i] ?? results[0];
    if (it) onPick?.(it);
  };

  // 重複JAN/コードを除外してから表示用配列を作る
  const listed = useMemo(() => {
    const rows = results.map((x, i) => ({
      ...x,
      addedAt: x.addedAt || null,
      displayIndex: i + 1,
    }));
    const seen = new Map(); // key => true
    const out = [];
    for (const r of rows) {
      const k = String(
        r?.JAN ?? r?.jan_code ?? r?.code ?? r?.id ?? r?.jt_code ?? ""
      );
      if (k) {
        if (seen.has(k)) continue; // 重複はスキップ
        seen.set(k, true);
      }
      out.push(r);
    }
    return out;
  }, [results]);

  // スクロール位置復元
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    if (Number.isFinite(y)) {
      requestAnimationFrame(() => {
        el.scrollTop = y;
      });
    }
  }, [open]);

  // スクロール位置保存
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let t = 0;
    const onScroll = () => {
      const now = Date.now();
      if (now - t < 80) return;
      t = now;
      sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop || 0));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);

  const HEADER_H = 42;
  const hasQuery = !!(qDebounced && qDebounced.trim());

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      hideBackdrop
      sx={{ zIndex: 1450, pointerEvents: "none" }}
      BackdropProps={{ style: { background: "transparent", pointerEvents: "none" } }}
      ModalProps={{
        ...drawerModalProps,
        keepMounted: true,
        disableEnforceFocus: true,
        disableAutoFocus: true,
        disableRestoreFocus: true,
        disableScrollLock: true,
      }}
      PaperProps={{
        style: {
          ...paperBaseStyle,
          height: DRAWER_HEIGHT,
          display: "flex",
          flexDirection: "column",
        },
        sx: { pointerEvents: "auto" },
      }}
    >
      <PanelHeader
        title="検索"
        icon="search2.svg"
        iconFallback="search2.svg"
        onClose={() => {
          setQ("");
          setQDebounced("");
          setApiItems([]);
          setErrorMsg("");
          onClose?.();
        }}
      />

      {/* 検索行 */}
      <div
        style={{
          padding: "8px 12px 6px",
          borderBottom: "1px solid #eee",
          background: "#f9f9f9",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            border: "1px solid #ccc",
            borderRadius: 8,
            background: "#fff",
            padding: "6px 10px",
          }}
        >
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              sessionStorage.setItem(SCROLL_KEY, "0");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") pick(0);
            }}
            placeholder="商品名 / 産地 / 品種 / JAN で検索"
            style={{
              border: "none",
              outline: "none",
              width: "100%",
              fontSize: 16,
              paddingRight: 44,
              lineHeight: 1,
            }}
          />
          <button
            onClick={onScanClick}
            title="バーコード読み取り"
            aria-label="バーコード読み取り"
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              width: 34,
              height: 22,
              borderRadius: 6,
              border: "1px solid #d0d0d0",
              background: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: 2, height: 14, alignItems: "stretch" }}>
              {[3, 1, 2, 1, 2, 1].map((w, i) => (
                <span
                  key={i}
                  style={{ width: w, background: "#444", borderRadius: 1 }}
                />
              ))}
            </div>
          </button>
        </div>
        {loading && (
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>検索中…</div>
        )}
        {!loading && errorMsg && (
          <div style={{ marginTop: 4, fontSize: 12, color: "#c00" }}>{errorMsg}</div>
        )}
      </div>

      {/* リスト */}
      <div
        ref={scrollRef}
        style={{
          height: `calc(${DRAWER_HEIGHT} - ${HEADER_H}px - 52px)`,
          overflowY: "auto",
          padding: "6px 10px 12px",
          background: "#fff",
        }}
      >
        {hasQuery && !loading && !errorMsg && listed.length === 0 && (
          <div style={{ color: "#666", padding: "12px 6px" }}>
            該当する商品が見つかりません。
          </div>
        )}

        {!hasQuery && !loading && listed.length === 0 && (
          <div style={{ color: "#666", padding: "12px 6px" }}>
            商品データが読み込まれていません。
          </div>
        )}

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {listed.map((item, idx) => (
            <ListRow
              key={`${String(
                item?.JAN ?? item?.jan_code ?? item?.code ?? item?.id ?? "row"
              )}-${idx}`}
              index={item.displayIndex}
              item={item}
              onPick={() => pick(idx)}
              showDate={false}
              accentColor="#6b2e2e"
              hoverHighlight={true}
            />
          ))}
        </ul>
      </div>
    </Drawer>
  );
}
