// src/components/BarcodeScanner.jsx
// - 枠ガイド＆中央テキストを添付の見た目に寄せる
// - 「再読込み」ボタン：枠の中央下に固定、押下で色＆縮小、再読込み中は文言/色を変化
// - 再読込みは“同一JANの再確定を一時許可”＋デバウンス短縮（体感を上げる）
// - 読み取り精度は Detector を使い回し + 二段確認で維持
// - ★重要★ クローズ時に**必ず**スマホカメラも停止するようクリーンアップを強化
// - ★iOS安定化★ video要素の置換 / getUserMedia リトライ / stop→待機→start / 二重起動防止

import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const REREAD_LS_KEY = "tm_reread_until"; // 再読込みの有効期限タイムスタンプ(ms)
const OVERLAY_Z = 2147483647;
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: OVERLAY_Z };
const panelStyle   = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle= { flex: 1, position: "relative", background: "#000", overflow: "hidden", touchAction: "none" };
const footerStyle  = { padding: 12, borderTop: "1px solid #222", color: "#ddd", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 };
const btnBase      = { background: "#fff", color: "#000", border: "none", padding: "12px 18px", fontSize: 16, borderRadius: 10, cursor: "pointer", fontWeight: 700 };

const hasBD = () => typeof window !== "undefined" && "BarcodeDetector" in window;
const norm  = (s) => String(s ?? "").replace(/\D/g, "");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isiOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|od|ad)/.test(navigator.platform || "") || /iPhone|iPad/.test(navigator.userAgent || ""));

// ---- 抑止（過去JANの勝手な再出現を防止）
const GLOBAL_SUPPRESS = new Map(); // code -> { at, kind }
const LS_KEY = "tastemap_barcode_suppress";
function readLS() { try { return JSON.parse(sessionStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } }
function writeLS(obj) { try { sessionStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {} }
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
function isValidEan13(ean) {
  if (!/^\d{13}$/.test(ean)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = ean.charCodeAt(i) - 48;
    sum += (i % 2 === 0) ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === (ean.charCodeAt(12) - 48);
}
function toEan13(raw) {
  let s = norm(raw);
  if (s.length === 12) s = "0" + s;     // UPC-A -> EAN-13
  if (s.length !== 13) return null;
  return isValidEan13(s) ? s : null;
}
function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
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
async function warmupMediaTime(video, { uniq=6, sumSec=0.35, timeoutMs=3000 } = {}) {
  if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) { await sleep(450); return; }
  const t0 = performance.now();
  await new Promise((resolve) => {
    const seen = new Set(); let last=0, acc=0;
    const cb = (_ts, meta) => {
      const mt = meta?.mediaTime ?? 0;
      if (!seen.has(mt)) { if (last>0 && mt>last) acc += (mt-last); seen.add(mt); last = mt; }
      if (seen.size>=uniq && acc>=sumSec) return resolve();
      if (performance.now()-t0 > timeoutMs) return resolve();
      video.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
  });
}

// ---- デバイス選択 + getUserMedia リトライ（iOS対策）
async function listCameras() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter(d => d.kind === "videoinput");
  } catch { return []; }
}
async function getStreamWithRetry() {
  const base = { aspectRatio: { ideal: 16/9 }, frameRate: { ideal: 30, max: 60 }, width: { ideal: 1280 }, height: { ideal: 720 } };
  const waits = [0, 140, 320, 800]; // WebKit の“直後再取得”対策バックオフ
  const cams = await listCameras();
  const back = cams.find(c => /back|rear|wide/i.test(c.label || ""));
  const trySets = [
    back ? { audio:false, video:{ deviceId:{ exact: back.deviceId }, ...base } } : null,
    { audio:false, video:{ facingMode:{ exact:"environment" }, ...base } },
    { audio:false, video:{ facingMode:{ ideal:"environment" }, ...base } },
    { audio:false, video: base },
  ].filter(Boolean);

  let lastErr;
  for (const w of waits) {
    if (w) await sleep(w);
    for (const c of trySets) {
      try { return await navigator.mediaDevices.getUserMedia(c); }
      catch (e) { lastErr = e; }
    }
  }
  throw lastErr || new Error("GUM_FAILED");
}

// ---- ROI（簡易ハッシュ）
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

// ---- video の徹底解放補助
function reallyStopStream(stream) {
  try {
    if (!stream) return;
    const tracks = stream.getTracks?.() || [];
    tracks.forEach((t) => { try { t.enabled = false; } catch {} try { t.stop(); } catch {} });
  } catch {}
}
function hardReleaseVideo(v) {
  if (!v) return;
  try { v.pause?.(); } catch {}
  try { v.srcObject = null; } catch {}
  try { v.removeAttribute?.("srcObject"); } catch {}
  try { v.removeAttribute?.("src"); } catch {}
  try { v.src = ""; } catch {}
  try { v.load?.(); } catch {}
}
// まれに video ノード自体が握りを残すため、要素ごと置換
function replaceVideoElement(videoRef) {
  const v = videoRef.current;
  if (!v || !v.parentNode) return;
  const clone = v.cloneNode(true);
  try { clone.removeAttribute?.("src"); clone.removeAttribute?.("srcObject"); clone.srcObject = null; } catch {}
  v.parentNode.replaceChild(clone, v);
  videoRef.current = clone;
}

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,                    // (val) => boolean | {ok:boolean} | Promise<boolean|{ok:boolean}>
  // 二段確認（取りこぼし少なく）
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
  // 再読込み（押した感＋一時緩和）
  enableRereadButton = true,
  rereadWindowMs = 6000,
  rereadMinDebounceMs = 260,
}) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef  = useRef(null);
  const readerRef = useRef(null);   // ZXing

  const rafRef    = useRef(0);
  const prevHashRef = useRef(null);
  const motionBufRef = useRef([]);         // 直近のROI差分
  const lastCommitHashRef = useRef(null);  // 直近コミット時のROIハッシュ
  const sessionAtRef = useRef(0);
  const prevSessionFirstRef = useRef({ code: null });
  const lastHitRef = useRef({ code: null, at: 0 });
  const zxingReadyAtRef = useRef(0);
  const notifiedRef = useRef(new Map());   // 未採用抑止

  const candRef = useRef(null); // { code, t0, hash0 }
  const committingRef = useRef(false);
  const pausedScanRef = useRef(false);
  const aliveRef      = useRef(false);

  // iOS Safari 安定化
  const startingRef = useRef(false); // 二重 start 防止
  const sessionIdRef = useRef(0);    // セッション識別（レース防止）

  // 再読込み（“同JAN再確定の一時許可＆デバウンス短縮”）
  const rereadUntilRef = useRef(0);
  const isRereadActive = () => Date.now() < rereadUntilRef.current;

  const [errorMsg, setErrorMsg] = useState("");
  const [rereadPressed, setRereadPressed] = useState(false);

  const stopZxing = () => {
    try { readerRef.current?.reset?.(); } catch {}
    if (readerRef.current) {
      try { readerRef.current._started = false; } catch {}
      readerRef.current = null;
    }
  };

  const stopAll = useCallback(async () => {
    aliveRef.current = false;
    stopZxing();

    try { cancelAnimationFrame(rafRef.current || 0); } catch {}
    rafRef.current = 0;

    // video の握りを先に剥がす
    try { replaceVideoElement(videoRef); } catch {}

    try { reallyStopStream(videoRef.current?.srcObject); } catch {}
    try { reallyStopStream(streamRef.current); } catch {}
    try { reallyStopStream({ getTracks: () => (trackRef.current ? [trackRef.current] : []) }); } catch {}

    try { hardReleaseVideo(videoRef.current); } catch {}

    streamRef.current = null;
    trackRef.current  = null;
    prevHashRef.current = null;
    candRef.current = null;
    committingRef.current = false;
    pausedScanRef.current = false;
    motionBufRef.current = [];

    // iOS: stop直後は GUM 失敗しやすいので少し待つ
    await sleep(160);
    try { hardReleaseVideo(videoRef.current); } catch {}
    try { reallyStopStream(videoRef.current?.srcObject); } catch {}
  }, []);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setErrorMsg("");
    assertHTTPS();

    if (isiOS()) await sleep(120); // 直前 stop の残留回避

    const sid = ++sessionIdRef.current;

    let stream;
    try {
      stream = await getStreamWithRetry();
    } catch (e) {
      startingRef.current = false;
      throw e;
    }

    streamRef.current = stream;
    const track = stream.getVideoTracks?.()[0];
    trackRef.current = track;

    const v = videoRef.current;
    v.playsInline = true; v.setAttribute("playsinline",""); v.setAttribute("webkit-playsinline","");
    v.muted = true; v.autoplay = true; v.srcObject = stream;

    await waitVideoReady(v, 9000);
    try { await v.play(); } catch {}
    await warmupMediaTime(v);
    try {
      // AF連続（対応端末）
      if (track?.getCapabilities) {
        const caps = track.getCapabilities();
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
          try { await track.applyConstraints({ advanced:[{ focusMode:"continuous" }] }); } catch {}
        }
      }
    } catch {}

    zxingReadyAtRef.current = Date.now();
    sessionAtRef.current = Date.now();
    candRef.current = null;
    notifiedRef.current.clear();
    committingRef.current=false; pausedScanRef.current=false;
    motionBufRef.current = [];
    aliveRef.current = true;

    startingRef.current = false;
    if (sid !== sessionIdRef.current) { await stopAll(); return; } // レース防止

    // Detector を使い回し
    const detector = hasBD() ? new window.BarcodeDetector({
      formats:["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code"]
    }) : null;

    const effectiveIgnoreMs = () => (isRereadActive() ? Math.min(ignoreForMs, rereadMinDebounceMs) : ignoreForMs);

    const tryCommit = async (val) => {
      const now = Date.now();
      if (!aliveRef.current) return false;

      // 起動直後は前セッション先頭JANを採用しない
      if (prevSessionFirstRef.current.code &&
          now - sessionAtRef.current < firstIgnorePrevMs &&
          val === prevSessionFirstRef.current.code) return false;

      // ローカル・デバウンス
      if (ignoreCode && val === String(ignoreCode)) {
        if (now - (lastHitRef.current.at||0) < effectiveIgnoreMs()) return false;
      }
      if (val === lastHitRef.current.code && now - lastHitRef.current.at < effectiveIgnoreMs()) return false;

      // 抑止：未登録NGは常に、採用OKは再読込み中のみ緩める
      if (!isRereadActive() && isSuppressed(val, suppressAcceptedMs)) return false;
      if (isSuppressed(val, suppressUnknownMs)) return false;

      // 親へ通知
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
        await stopAll();        // ★採用時は即座に停止（緑ランプ消灯）
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

      // 動きゲート（再読込み中は同一JANでも緩和）
      const diffs = motionBufRef.current;
      const ma = diffs.length ? diffs.reduce((a,b)=>a+b,0)/diffs.length : 0;
      const lastCommittedHash = lastCommitHashRef.current;
      const movedSinceCommit = lastCommittedHash == null ? true :
        (Math.abs((hashNow ?? 0) - lastCommittedHash) / (Math.abs(lastCommittedHash) + 1e-6)) >= moveAfterCommitDiff;

      if (!isRereadActive() && val === lastHitRef.current.code) {
        if (ma < moveMAThreshold || !movedSinceCommit) return false;
      }

      // 二段確認
      const cand = candRef.current;
      const nowT = now;
      if (!cand || cand.code !== val || (nowT - cand.t0) > confirmMs) {
        candRef.current = { code: val, t0: nowT, hash0: hashNow };
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

    // ZXing 用：最新ROIハッシュ
    const latestHashRef = { current: null };

    const loop = async () => {
      if (!aliveRef.current) return;
      const video = videoRef.current;
      if (!video) return;

      if (pausedScanRef.current || committingRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const { hash } = sampleROI(video, canvasRef);
      latestHashRef.current = hash;

      // 動き量を更新
      const prev = prevHashRef.current; prevHashRef.current = hash;
      if (prev != null) {
        const d = Math.abs(hash - prev) / (Math.abs(prev) + 1e-6);
        const buf = motionBufRef.current; buf.push(d); if (buf.length > moveMAWindow) buf.shift();
        if (d < skipSameFrameDiff) { rafRef.current = requestAnimationFrame(loop); return; }
      }

      // Detector：ROI → 空振りなら fullFrame
      if (detector) {
        try {
          const res1 = await detector.detect(canvasRef.current);
          const candidate = (res1 && res1.length) ? res1 : (fullFrameProbe ? await detector.detect(video) : []);
          if (candidate && candidate[0]) {
            const pick = candidate.find(b => /^(EAN_|UPC_)/i.test(String(b.format||""))) || candidate[0];
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

    // ZXing（Detectorなし端末）
    if (!detector) {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      else try { readerRef.current.reset(); } catch {}
      try {
        readerRef.current._started = true;
        readerRef.current.decodeFromStream(stream, v, async (result) => {
          if (!aliveRef.current) return;
          if (pausedScanRef.current || committingRef.current) return;
          if (!result) return;
          if (Date.now() < zxingReadyAtRef.current) return;
          const val = toEan13(result.getText());
          if (!val) return;
          const hashNow = latestHashRef.current ?? 0;
          await seenNow(val, hashNow);
        }).catch(()=>{});
      } catch (e) {
        // ZXing初期化に失敗しても Detector ループは走っているので無視
        console.warn("[ZXing init warn]", e);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmMs, minRoiDiff, skipSameFrameDiff, ignoreCode, ignoreForMs, firstIgnorePrevMs, suppressUnknownMs, suppressAcceptedMs, moveMAWindow, moveMAThreshold, moveAfterCommitDiff, fullFrameProbe, rereadMinDebounceMs, onDetected, onClose, stopAll]);

  // 再読込み：ウィンドウを開き、押した感を出す。直後のデバウンスも短縮される
  const activateReread = useCallback(() => {
    const until = Date.now() + rereadWindowMs;
    rereadUntilRef.current = until;
    try { sessionStorage.setItem(REREAD_LS_KEY, String(until)); } catch {}
    // 体感フィードバック
    setRereadPressed(true);
    setTimeout(() => setRereadPressed(false), 140);
    // “直前JANのデバウンス短縮”
    lastHitRef.current = { code: lastHitRef.current.code, at: 0 };
  }, [rereadWindowMs]);

  // ====== open 制御 + 強制クリーンナップ（可視性/遷移）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open) { await stopAll(); return; }
      if (isiOS()) await sleep(120); // 直前 stop の残留を回避してから start
      try { await start(); }
      catch (e) {
        if (cancelled) return;
        console.error("[camera start error]", e);
        const name = e?.name || "Error"; const msg = e?.message ? `: ${e.message}` : "";
        setErrorMsg(
          name==="NotAllowedError"||name==="SecurityError" ? "カメラが『拒否』です。設定でこのサイトのカメラを『許可』にしてください。" :
          name==="NotFoundError"||name==="OverconstrainedError" ? "背面カメラが見つかりません。端末再起動または別ブラウザをお試しください。" :
          name==="NotReadableError" ? "他アプリがカメラ使用中の可能性。全て終了後に再試行してください。" :
          name==="AbortError" ? "カメラ初期化が一時的に失敗しました。数秒後に再度お試しください。" :
          name==="NEED_HTTPS" ? "HTTPS が必須です。https でアクセスしてください。" :
          name==="VIDEO_TIMEOUT" ? "初期化に時間がかかっています。ページ再読込を試してください。" :
          `カメラ起動失敗（${name}${msg}）`
        );
        await stopAll();
      }
    })();

    const onHidden = async () => { await stopAll(); };
    const onPageHide = async () => { await stopAll(); };
    const onBeforeUnload = async () => { await stopAll(); };

    document.addEventListener("visibilitychange", onHidden, { passive:true });
    window.addEventListener("pagehide", onPageHide, { passive:true });
    window.addEventListener("beforeunload", onBeforeUnload, { passive:true });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      stopAll();
    };
  }, [open, start, stopAll]);

  if (!open) return null;

  // === 見た目：添付のスクショに寄せたオーバーレイ ===
  const rereadActive = isRereadActive();
  const rereadBtnStyle = {
    position: "absolute",
    left: "50%",
    transform: `translateX(-50%) ${rereadPressed ? "scale(0.98)" : "scale(1)"}`,
    bottom: "14%", // 枠の少し下にくる位置
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
          {/* 中央の説明テキスト（添付のレイアウト風） */}
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
