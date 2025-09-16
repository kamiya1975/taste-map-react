// src/components/BarcodeScanner.jsx
// 目的：PWA には安定ルートのみ、Safari(ブラウザ)にだけ穏やかな追加解放を適用
// - PWA 判定: display-mode: standalone / navigator.standalone
// - Safari(ブラウザ)のみ stop→srcObject=null→load の簡潔な解放 + 120ms 待機
// - エンジンは単独(BarcodeDetector 優先、なければ ZXing)

import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const REREAD_LS_KEY = "tm_reread_until";
const OVERLAY_Z = 2147483647;
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: OVERLAY_Z };
const panelStyle   = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle= { flex: 1, position: "relative", background: "#000", overflow: "hidden", touchAction: "none" };
const footerStyle  = { padding: 12, borderTop: "1px solid #222", color: "#ddd", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 };
const btnBase      = { background: "#fff", color: "#000", border: "none", padding: "12px 18px", fontSize: 16, borderRadius: 10, cursor: "pointer", fontWeight: 700 };

const hasBD = () => typeof window !== "undefined" && "BarcodeDetector" in window;
const norm  = (s) => String(s ?? "").replace(/\D/g, "");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ===== PWA/Safari 判定を厳密化 ===== */
const isStandalonePWA = () => {
  try {
    // iOS: navigator.standalone、他: display-mode
    if (typeof window !== "undefined" && window.matchMedia) {
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
    }
    if (typeof navigator !== "undefined" && "standalone" in navigator) return !!navigator.standalone;
  } catch {}
  return false;
};
const isSafariUA = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const vendor = navigator.vendor || "";
  const isAppleVendor = /Apple/i.test(vendor);
  const isSafariLike = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg|EdgiOS|OPR/.test(ua);
  return isAppleVendor && isSafariLike;
};
// Safari(ブラウザ)のみ true。PWA なら false にする
const isSafariBrowserOnly = () => isSafariUA() && !isStandalonePWA();

/* ===== 抑止 ===== */
const GLOBAL_SUPPRESS = new Map();
const LS_KEY = "tastemap_barcode_suppress";
function readLS()  { try { return JSON.parse(sessionStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } }
function writeLS(o){ try { sessionStorage.setItem(LS_KEY, JSON.stringify(o)); } catch {} }
function isSuppressed(code, windowMs) {
  const now = Date.now();
  const g = GLOBAL_SUPPRESS.get(code);
  if (g && (now - g.at) < windowMs) return true;
  const m = readLS(); const l = m[code];
  return !!(l && (now - l.at) < windowMs);
}
function markSuppress(code, kind) {
  const now = Date.now();
  GLOBAL_SUPPRESS.set(code, { at: now, kind });
  const m = readLS(); m[code] = { at: now, kind }; writeLS(m);
}

/* ===== EAN-13 ===== */
function isValidEan13(ean) {
  if (!/^\d{13}$/.test(ean)) return false;
  let sum = 0; for (let i=0;i<12;i++){ const d = ean.charCodeAt(i)-48; sum += (i%2===0)? d : d*3; }
  const check = (10 - (sum % 10)) % 10;
  return check === (ean.charCodeAt(12) - 48);
}
function toEan13(raw) {
  let s = norm(raw);
  if (s.length === 12) s = "0" + s;     // UPC-A -> EAN-13
  if (s.length !== 13) return null;
  return isValidEan13(s) ? s : null;
}

/* ===== 起動補助 ===== */
function assertHTTPS() {
  const isLocal = ["localhost","127.0.0.1","::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}
async function waitVideoReady(video, timeoutMs = 9000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const err = (e) => { cleanup(); reject(e); };
    const iv = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) ok();
      else if (Date.now() > deadline) err(new Error("VIDEO_TIMEOUT"));
    }, 120);
    const cleanup = () => {
      clearInterval(iv);
      video.removeEventListener("loadedmetadata", ok);
      video.removeEventListener("canplay", ok);
      video.removeEventListener("error", err);
    };
    video.addEventListener("loadedmetadata", ok, { once:true });
    video.addEventListener("canplay", ok, { once:true });
    video.addEventListener("error", err, { once:true });
  });
}
async function getStream() {
  const base = { aspectRatio: { ideal: 16/9 }, frameRate: { ideal: 30, max: 60 }, width: { ideal: 1280 }, height: { ideal: 720 } };
  try { return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ exact:"environment" }, ...base } }); } catch {}
  return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ ideal:"environment" }, ...base } });
}

/* ===== ROI（簡易ハッシュ） ===== */
function ensureCanvas(ref) {
  if (!ref.current) { const c = document.createElement("canvas"); c.width = 960; c.height = 320; ref.current = c; }
  return ref.current.getContext("2d");
}
function sampleROI(video, canvasRef) {
  const ctx = ensureCanvas(canvasRef);
  const c = canvasRef.current; const cw = c.width, ch = c.height;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return { hash: Math.random() };
  const rh = Math.floor(vh * 0.30), rw = Math.floor(rh * 3);
  const sx = Math.floor((vw - rw)/2), sy = Math.floor(vh * 0.45 - rh/2);
  ctx.drawImage(video, sx, sy, rw, rh, 0, 0, cw, ch);
  const data = ctx.getImageData(0,0,cw,ch).data; let sum=0, step=32;
  for (let i=0;i<data.length;i+=4*step) sum += 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
  return { hash: sum };
}

/* ========================================================= */
export default function BarcodeScanner({
  open,
  onClose,
  onDetected,                    // (val) => boolean | {ok:boolean} | Promise<boolean|{ok:boolean}>
  // 二段確認
  confirmMs = 650,
  minRoiDiff = 0.0022,
  // 抑止
  suppressUnknownMs = 12000,
  suppressAcceptedMs = 60000,
  // スキップ
  skipSameFrameDiff = 0.0009,
  // デバウンス
  ignoreCode = null,
  ignoreForMs = 900,
  firstIgnorePrevMs = 1200,
  // 動きゲート
  moveMAWindow = 10,
  moveMAThreshold = 0.0022,
  moveAfterCommitDiff = 0.010,
  // 精度
  fullFrameProbe = false,
  // 再読込み
  enableRereadButton = true,
  rereadWindowMs = 6000,
  rereadMinDebounceMs = 260,
}) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef  = useRef(null);
  const readerRef = useRef(null);   // ZXing（Detector非対応端末のみ）

  const rafRef    = useRef(0);
  const prevHashRef = useRef(null);
  const motionBufRef = useRef([]);
  const lastCommitHashRef = useRef(null);
  const sessionAtRef = useRef(0);
  const prevSessionFirstRef = useRef({ code: null });
  const lastHitRef = useRef({ code: null, at: 0 });
  const notifiedRef = useRef(new Map());

  const candRef = useRef(null);
  const committingRef = useRef(false);
  const pausedScanRef = useRef(false);
  const aliveRef      = useRef(false);

  const rereadUntilRef = useRef(0);
  const isRereadActive = () => Date.now() < rereadUntilRef.current;

  const [errorMsg, setErrorMsg] = useState("");
  const [rereadPressed, setRereadPressed] = useState(false);

  /* ==== クリーンアップ（PWAは従来、Safariブラウザのみ追加ワーク） ==== */
  const stopAll = useCallback(async () => {
    aliveRef.current = false;

    // ZXing は先に停止・破棄
    try { readerRef.current?.reset?.(); } catch {}
    readerRef.current = null;

    try { cancelAnimationFrame(rafRef.current || 0); } catch {}
    rafRef.current = 0;

    const v = videoRef.current;
    const s = v?.srcObject || streamRef.current;

    // 1) まず全トラック停止（共通）
    try { (s?.getTracks?.() || []).forEach(t => { try { t.enabled=false; } catch{} try { t.stop(); } catch{} }); } catch {}
    try { trackRef.current?.stop?.(); } catch {}

    // 2) 参照を外す
    if (v) {
      try { v.pause?.(); } catch {}
      try { v.srcObject = null; } catch {}
      try { v.removeAttribute("srcObject"); } catch {}
      // Safari ブラウザのみ、load() を挟んで安静化（PWAは触らない）
      if (isSafariBrowserOnly()) {
        try { v.removeAttribute("src"); } catch {}
        try { v.src = ""; } catch {}
        try { v.load?.(); } catch {}
      }
    }

    // 3) 参照クリア
    streamRef.current=null;
    trackRef.current=null;
    prevHashRef.current=null;
    candRef.current=null;
    committingRef.current=false;
    pausedScanRef.current=false;
    motionBufRef.current = [];

    // 4) Safari(ブラウザ)のみ、次回 GUM の前に少し待つ
    if (isSafariBrowserOnly()) await sleep(120);
  }, []);

  const start = useCallback(async () => {
    setErrorMsg("");
    assertHTTPS();

    // 念のため残りを落とす（Safariブラウザは stopAll 内で 120ms 待つ）
    await stopAll();

    const stream = await getStream();
    streamRef.current = stream;
    trackRef.current  = stream.getVideoTracks?.()[0] || null;

    const v = videoRef.current;
    v.playsInline = true; v.setAttribute("playsinline",""); v.setAttribute("webkit-playsinline","");
    v.muted = true; v.autoplay = true; v.srcObject = stream;

    await waitVideoReady(v, 9000);
    try { await v.play(); } catch {}

    sessionAtRef.current = Date.now();
    candRef.current = null;
    notifiedRef.current.clear();
    committingRef.current=false; pausedScanRef.current=false;
    motionBufRef.current = [];
    aliveRef.current = true;

    // 単独エンジン運用
    const detector = hasBD() ? new window.BarcodeDetector({
      formats:["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code"]
    }) : null;

    const effectiveIgnoreMs = () =>
      (isRereadActive() ? Math.min(ignoreForMs, rereadMinDebounceMs) : ignoreForMs);

    const tryCommit = async (val) => {
      const now = Date.now();
      if (!aliveRef.current) return false;

      if (prevSessionFirstRef.current.code &&
          now - sessionAtRef.current < firstIgnorePrevMs &&
          val === prevSessionFirstRef.current.code) return false;

      if (ignoreCode && val === String(ignoreCode)) {
        if (now - (lastHitRef.current.at||0) < effectiveIgnoreMs()) return false;
      }
      if (val === lastHitRef.current.code && now - lastHitRef.current.at < effectiveIgnoreMs()) return false;

      if (!isRereadActive() && isSuppressed(val, suppressAcceptedMs)) return false;
      if (isSuppressed(val, suppressUnknownMs)) return false;

      committingRef.current = true;
      pausedScanRef.current = true;

      lastHitRef.current = { code: val, at: now };
      prevSessionFirstRef.current.code = val;

      let accepted = true;
      try {
        const ret = onDetected?.(val);
        const r = ret instanceof Promise ? await ret : ret;
        if (typeof r === "boolean") accepted = r;
        else if (r && typeof r === "object" && "ok" in r) accepted = !!r.ok;
      } catch { accepted = false; }
      if (!aliveRef.current) return false;

      if (accepted) {
        markSuppress(val, "ok");
        lastCommitHashRef.current = prevHashRef.current;
        await stopAll();     // 採用時は即停止
        onClose?.();
        return true;
      } else {
        notifiedRef.current.set(val, now);
        markSuppress(val, "ng");
        committingRef.current = false;
        pausedScanRef.current = false;
        return false;
      }
    };

    const seenNow = async (val, hashNow) => {
      if (!aliveRef.current) return false;
      const now = Date.now();

      if (!isRereadActive() && isSuppressed(val, suppressAcceptedMs)) return false;
      if (isSuppressed(val, suppressUnknownMs)) return false;

      const lastN = notifiedRef.current.get(val) || 0;
      if (now - lastN < suppressUnknownMs) return false;

      const diffs = motionBufRef.current;
      const ma = diffs.length ? diffs.reduce((a,b)=>a+b,0)/diffs.length : 0;
      const lastCommittedHash = lastCommitHashRef.current;
      const movedSinceCommit = lastCommittedHash == null ? true :
        (Math.abs((hashNow ?? 0) - lastCommittedHash) / (Math.abs(lastCommittedHash) + 1e-6)) >= moveAfterCommitDiff;

      if (!isRereadActive() && val === lastHitRef.current.code) {
        if (ma < moveMAThreshold || !movedSinceCommit) return false;
      }

      const cand = candRef.current;
      if (!cand || cand.code !== val || (now - cand.t0) > confirmMs) {
        candRef.current = { code: val, t0: now, hash0: hashNow };
        return false;
      }
      const diff = Math.abs(hashNow - cand.hash0) / (Math.abs(cand.hash0) + 1e-6);
      if (diff >= minRoiDiff) {
        const ok = await tryCommit(val);
        if (!ok && aliveRef.current) candRef.current = null;
        return ok;
      }
      return false;
    };

    const latestHashRef = { current: null };

    const loop = async () => {
      if (!aliveRef.current) return;
      const video = videoRef.current; if (!video) return;

      if (pausedScanRef.current || committingRef.current) { rafRef.current = requestAnimationFrame(loop); return; }

      const { hash } = sampleROI(video, canvasRef);
      latestHashRef.current = hash;

      const prev = prevHashRef.current; prevHashRef.current = hash;
      if (prev != null) {
        const d = Math.abs(hash - prev) / (Math.abs(prev) + 1e-6);
        const buf = motionBufRef.current; buf.push(d); if (buf.length > moveMAWindow) buf.shift();
        if (d < skipSameFrameDiff) { rafRef.current = requestAnimationFrame(loop); return; }
      }

      if (detector) {
        try {
          const res1 = await detector.detect(canvasRef.current);
          const cand = (res1 && res1.length) ? res1 : (fullFrameProbe ? await detector.detect(video) : []);
          if (cand && cand[0]) {
            const pick = cand.find(b => /^(EAN_|UPC_)/i.test(String(b.format||""))) || cand[0];
            const raw = pick.rawValue || pick.rawText || "";
            const val = toEan13(raw);
            if (val) {
              const committed = await seenNow(val, hash);
              if (committed) return;
            }
          }
        } catch {}
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    if (!detector) {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      else try { readerRef.current.reset(); } catch {}
      try {
        readerRef.current.decodeFromStream(stream, v, async (result) => {
          if (!aliveRef.current || pausedScanRef.current || committingRef.current) return;
          if (!result) return;
          const val = toEan13(result.getText());
          if (!val) return;
          const hashNow = latestHashRef.current ?? 0;
          await seenNow(val, hashNow);
        }).catch(()=>{});
      } catch {}
    }
  }, [
    confirmMs, minRoiDiff, skipSameFrameDiff, ignoreCode, ignoreForMs, firstIgnorePrevMs,
    suppressUnknownMs, suppressAcceptedMs, moveMAWindow, moveMAThreshold, moveAfterCommitDiff,
    fullFrameProbe, rereadMinDebounceMs, onDetected, onClose, stopAll
  ]);

  const activateReread = useCallback(() => {
    const until = Date.now() + rereadWindowMs;
    rereadUntilRef.current = until;
    try { sessionStorage.setItem(REREAD_LS_KEY, String(until)); } catch {}
    setRereadPressed(true);
    setTimeout(() => setRereadPressed(false), 140);
    lastHitRef.current = { code: lastHitRef.current.code, at: 0 };
  }, [rereadWindowMs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open) { await stopAll(); return; }
      try { await start(); }
      catch (e) {
        if (cancelled) return;
        console.error("[camera start error]", e);
        const name = e?.name || "Error"; const msg = e?.message ? `: ${e.message}` : "";
        setErrorMsg(
          name==="NotAllowedError"||name==="SecurityError" ? "カメラが『拒否』です。設定でこのサイトのカメラを『許可』にしてください。" :
          name==="NotFoundError"||name==="OverconstrainedError" ? "背面カメラが見つかりません。端末再起動または別ブラウザをお試しください。" :
          name==="NotReadableError" ? "他アプリがカメラ使用中の可能性。全て終了後に再試行してください。" :
          name==="AbortError" ? "カメラ初期化が中断されました。再試行してください。" :
          name==="NEED_HTTPS" ? "HTTPS が必須です。https でアクセスしてください。" :
          name==="VIDEO_TIMEOUT" ? "初期化に時間がかかっています。ページ再読込を試してください。" :
          `カメラ起動失敗（${name}${msg}）`
        );
        await stopAll();
      }
    })();
    return () => { cancelled = true; stopAll(); };
  }, [open, start, stopAll]);

  if (!open) return null;

  const rereadActive = isRereadActive();
  const rereadBtnStyle = {
    position: "absolute",
    left: "50%",
    transform: `translateX(-50%) ${rereadPressed ? "scale(0.98)" : "scale(1)"}`,
    bottom: "14%",
    background: rereadActive ? "#ffb020" : (rereadPressed ? "#f6c400" : "#ffd83d"),
    color: "#111",
    border: "none",
    padding: "12px 18px",
    fontSize: 16,
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 800,
    boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    userSelect: "none",
    touchAction: "manipulation",
    transition: "background 80ms linear, transform 80ms ease",
  };

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle}>
          <video
            ref={videoRef}
            style={{ width:"100%", height:"100%", objectFit:"cover", backgroundColor:"black" }}
            autoPlay playsInline muted
          />
          {/* 白枠（3:1） */}
          <div
            style={{
              position:"absolute", left:"50%", top:"45%", transform:"translate(-50%, -50%)",
              width:"88%", aspectRatio: "3 / 1",
              border:"3px solid rgba(255,255,255,0.9)", borderRadius: 12, pointerEvents:"none",
              boxShadow:"0 0 0 200vmax rgba(0,0,0,0.25) inset"
            }}
          />
          {/* 中央の説明テキスト */}
          <div
            style={{
              position:"absolute", left:"50%", top:"62%", transform:"translateX(-50%)",
              width:"86%", maxWidth: 520, textAlign:"center",
              color:"#fff", lineHeight: 1.5, fontSize: 16,
              textShadow: "0 2px 6px rgba(0,0,0,0.6)"
            }}
          >
            中央の枠にバーコードを合わせてください。<br/>
            読み取りができない場合は下の「再読込み」ボタンを押してください。
          </div>

          {/* 再読込み（枠の中央下） */}
          {enableRereadButton && (
            <button
              onClick={activateReread}
              onPointerDown={() => setRereadPressed(true)}
              onPointerUp={() => setRereadPressed(false)}
              onPointerCancel={() => setRereadPressed(false)}
              style={rereadBtnStyle}
              aria-label="再読込み（同一JANの再確定を一時的に許可）"
            >
              {rereadActive ? "再読込み中…" : "再読込み"}
            </button>
          )}
        </div>

        {/* 下部バー（黒地＋キャンセル） */}
        <div style={{ ...footerStyle, background:"#000" }}>
          <div style={{ minHeight: 18 }}>
            {errorMsg ? <span style={{ color:"#ffb3b3" }}>{errorMsg}</span> : <span>&nbsp;</span>}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button
              onClick={async () => { await stopAll(); onClose?.(); }}
              style={{ ...btnBase, background:"#fff" }}
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
