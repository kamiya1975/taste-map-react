// src/components/panels/SearchPanel.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import Drawer from "@mui/material/Drawer";
import { normalizeJP } from "../../utils/search";
import { drawerModalProps, paperBaseStyle, DRAWER_HEIGHT } from "../../ui/constants";
import ListRow from "../ui/ListRow";
import PanelHeader from "../ui/PanelHeader";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

// number or NaN に統一
const toNum = (v) => (v === "" || v == null ? NaN : Number(v));

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

  // UMAP データを JAN → item のマップにしておく
  const janToLocal = useMemo(() => {
    const m = new Map();
    (Array.isArray(data) ? data : []).forEach((d) => {
      const key = String(d.jan_code ?? d.JAN ?? "").trim();
      if (!key) return;
      if (!m.has(key)) m.set(key, d);
    });
    return m;
  }, [data]);

  // 初期一覧（検索語なし）の並び：希望小売価格 昇順、未登録は最後 → これはローカルのみ
  const initialSorted = useMemo(() => {
    const arr = Array.isArray(data) ? [...data] : [];
    arr.sort((a, b) => {
      const pa = Number.isFinite(a?.["希望小売価格"]) ? a["希望小売価格"] : Infinity;
      const pb = Number.isFinite(b?.["希望小売価格"]) ? b["希望小売価格"] : Infinity;
      if (pa !== pb) return pa - pb;
      const na = String(a?.["商品名"] ?? a?.JAN ?? "");
      const nb = String(b?.["商品名"] ?? b?.JAN ?? "");
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
        setApiItems(items);
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

        // 表示用名前
        const name =
          (local && (local["商品名"] || local.temp_name)) ||
          p.name_kana ||
          jan;

        // Type
        const type =
          (local && (local.Type || local.wine_type)) ||
          p.wine_type ||
          "";

        // 価格：まず API の price_inc_tax、なければローカルの 希望小売価格
        const price = Number.isFinite(p.price_inc_tax)
          ? p.price_inc_tax
          : local?.["希望小売価格"];

        // 甘味/ボディ：API sweet/body → 無ければローカル PC 軸など
        const sweet =
          (p.sweet != null ? p.sweet : local?.SweetAxis) ??
          (Number.isFinite(local?.PC2) ? local.PC2 : undefined);
        const body =
          (p.body != null ? p.body : local?.BodyAxis) ??
          (Number.isFinite(local?.PC1) ? local.PC1 : undefined);

        return {
          // まずローカルの情報を敷き（UMAP座標など）
          ...(local || {}),
          // その上に API 情報をマージ
          JAN: jan,
          jan_code: jan,
          wine_type: p.wine_type,
          name_kana: p.name_kana,
          api_price_inc_tax: p.price_inc_tax,
          api_sweet: p.sweet,
          api_body: p.body,

          // ListRow / MapPage 側でよく使うキーを改めて整える
          商品名: name,
          Type: type,
          希望小売価格: price != null ? price : NaN,
          BodyAxis: Number.isFinite(body) ? body : undefined,
          SweetAxis: Number.isFinite(sweet) ? sweet : undefined,
        };
      });
    }

    // 検索語がないときは、従来通り「全件・価格昇順」
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
