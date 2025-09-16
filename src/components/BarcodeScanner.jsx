// src/components/BarcodeScanner.jsx
// 目的：
//  - 読み取り精度↑（ROI→fullframe、二段確認、軽いモーションゲート）
//  - パシャ演出なし、HUD/デバイスUIなし
//  - 放置で過去JANが勝手に出ない（60s抑止 + 動き必須）
//  - 「再読込み」ボタン：押した直後から短時間だけ“同一JANの再確定”を許可（安全なバイパス）
//
// 依存: npm i @zxing/browser

import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const OVERLAY_Z = 2147483647;
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: OVERLAY_Z };
const panelStyle   = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle= { flex: 1, position: "relative", background: "#000", overflow: "hidden", touchAction: "none" };
const footerStyle  = { padding: 12, borderTop: "1px solid #222", color: "#ddd", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 };
const btn          = { background: "#fff", color: "#000", border: "none", padding: "10px 16px", fontSize: 16, borderRadius: 10, cursor: "pointer", fontWeight: 700 };

const hasBD = () => typeof window !== "undefined" && "BarcodeDetector" in window;
const norm  = (s) => String(s ?? "").replace(/\D/g, "");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- グローバル + sessionStorage 抑止（セッションまたぎで同じJANの再確定/再通知を防ぐ） ----
const GLOBAL_SUPPRESS = new Map(); // code -> { at: number, kind: 'ok'|'ng' }
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
function clearSuppressFor(code) {
  try {
    GLOBAL_SUPPRESS.delete(code);
    const m = readLS(); if (m[code]) { delete m[code]; writeLS(m); }
  } catch {}
}

// ---- utils ----
function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}
async function enumerateBackCameras() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const cams = devs.filter(d => d.kind === "videoinput");
  const rows = cams.map((d, i) => ({
    id: d.deviceId,
    label: d.label || `Camera ${i + 1}`,
    score: (/back|rear|environment|外側|環境/i.test(d.label||"") ? 10 : 0) + (/macro|ultra|wide|tele/i.test(d.label||"") ? 3 : 0)
  }));
  return rows.sort((a,b)=>b.score-a.score);
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
// rVFC ウォームアップ
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
async function getStream(deviceId) {
  const base = { aspectRatio: { ideal: 16/9 }, frameRate: { ideal: 30, max: 60 }, width: { ideal: 1280 }, height: { ideal: 720 } };
  try { if (deviceId) return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ deviceId:{ exact: deviceId }, ...base } }); } catch {}
  try { return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ exact:"environment" }, ...base } }); } catch {}
  return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ ideal:"environment" }, ...base } });
}
async function setAF(track) {
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  try { if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) await track.applyConstraints({ advanced:[{ focusMode:"continuous" }] }); } catch {}
}

// ROI（簡易ハッシュ）
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

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,                    // (val) => boolean | {ok:boolean} | Promise<boolean|{ok:boolean}>
  // 二段確認（確定側で残像を弾く）
  confirmMs = 700,
  minRoiDiff = 0.0018,
  // 抑止ウィンドウ
  suppressUnknownMs = 12000,
  suppressAcceptedMs = 60000,
  // 軽いスキップ
  skipSameFrameDiff = 0.0012,
  // デバウンス
  ignoreCode = null,
  ignoreForMs = 1100,
  firstIgnorePrevMs = 1500,
  // 動きゲート（放置で再出現防止）
  moveMAWindow = 10,
  moveMAThreshold = 0.0025,
  moveAfterCommitDiff = 0.010,
  // 精度
  fullFrameProbe = true,
  // ★「再読込み」ボタンの挙動
  enableRereadButton = true,
  rereadWindowMs = 6000,        // 再読込みを押してからの許可ウィンドウ
  rereadMinDebounceMs = 300,    // 許可ウィンドウ中の最小デバウンス
}) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef  = useRef(null);
  const readerRef = useRef(null);

  const rafRef    = useRef(0);
  const prevHashRef = useRef(null);
  const motionBufRef = useRef([]);         // 直近のROI差分
  const lastCommitHashRef = useRef(null);  // 直近コミット時のROIハッシュ
  const sessionAtRef = useRef(0);
  const prevSessionFirstRef = useRef({ code: null });
  const lastHitRef = useRef({ code: null, at: 0 });
  const zxingReadyAtRef = useRef(0);
  const notifiedRef = useRef(new Map());   // 未採用時の抑止（ローカル）

  // 候補→確認→確定
  const candRef = useRef(null); // { code, t0, hash0 }

  // ライフサイクル制御
  const committingRef = useRef(false);
  const pausedScanRef = useRef(false);
  const aliveRef      = useRef(false);

  // ★ 再読込みモード（短時間だけ同一JANの再確定を許可）
  const rereadUntilRef = useRef(0);
  const isRereadActive = () => Date.now() < rereadUntilRef.current;

  const [errorMsg, setErrorMsg] = useState("");

  const stopAll = useCallback(() => {
    aliveRef.current = false;
    try { readerRef.current?.reset?.(); } catch {}
    if (readerRef.current) readerRef.current._started = false;
    cancelAnimationFrame(rafRef.current||0); rafRef.current = 0;
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      s?.getTracks?.().forEach(t=>t.stop());
      if (v) { try{v.pause?.();}catch{} v.srcObject=null; v.removeAttribute("src"); v.load?.(); }
    } catch {}
    streamRef.current=null; trackRef.current=null;
    prevHashRef.current=null; candRef.current=null;
    committingRef.current=false; pausedScanRef.current=false;
    motionBufRef.current = [];
  }, []);

  const start = useCallback(async () => {
    setErrorMsg("");
    assertHTTPS();
    try { await enumerateBackCameras(); } catch {}

    const stream = await getStream(null);
    streamRef.current = stream;
    const track = stream.getVideoTracks?.()[0];
    trackRef.current = track;

    const v = videoRef.current;
    v.playsInline = true; v.setAttribute("playsinline",""); v.setAttribute("webkit-playsinline","");
    v.muted = true; v.autoplay = true; v.srcObject = stream;
    await waitVideoReady(v, 9000);
    try { await v.play(); } catch {}
    await setAF(track);

    await warmupMediaTime(v);
    zxingReadyAtRef.current = Date.now();
    sessionAtRef.current = Date.now();
    candRef.current = null;
    notifiedRef.current.clear();
    committingRef.current=false; pausedScanRef.current=false;
    motionBufRef.current = [];
    aliveRef.current = true;

    const detector = hasBD() ? new window.BarcodeDetector({
      formats:["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code"]
    }) : null;

    // 許可ウィンドウ中の実効デバウンス
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

      // 抑止：未登録NGは常に抑止、採用OKの抑止は再読込み中だけ緩める
      if (!isRereadActive() && isSuppressed(val, suppressAcceptedMs)) return false;
      if (isSuppressed(val, suppressUnknownMs)) return false;

      // ---- 親へ通知（確定） ----
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
      } catch {
        accepted = false;
      }
      if (!aliveRef.current) return false;

      if (accepted) {
        markSuppress(val, "ok");
        lastCommitHashRef.current = prevHashRef.current; // 直近コミット画を記録
        aliveRef.current = false;
        stopAll();
        onClose?.();
        return true;
      } else {
        // 未登録など：1回だけ通知 → 抑止しスキャン継続
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

      // グローバル抑止：未登録NGは常に、採用OKは再読込み中のみ緩める
      if (!isRereadActive() && isSuppressed(val, suppressAcceptedMs)) return false;
      if (isSuppressed(val, suppressUnknownMs)) return false;

      // ローカル未採用抑止
      const lastN = notifiedRef.current.get(val) || 0;
      if (now - lastN < suppressUnknownMs) return false;

      // 放置対策：同一JANは“動き”が必要（ただし再読込み中はバイパス）
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
      if (!cand || cand.code !== val || (now - cand.t0) > confirmMs) {
        candRef.current = { code: val, t0: now, hash0: hashNow };
        return false;
      }
      const diff = Math.abs(hashNow - cand.hash0) / (Math.abs(cand.hash0) + 1e-6);
      if (diff >= minRoiDiff) {
        const ok = await tryCommit(val);
        if (!ok && aliveRef.current) candRef.current = null;
        return ok;
      } else {
        return false;
      }
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

      // Detector：まずROI(canvas)、空振り時はvideo全体（精度↑）
      if (detector) {
        try {
          const res1 = await detector.detect(canvasRef.current);
          const candidate = (res1 && res1.length) ? res1 : (fullFrameProbe ? await detector.detect(video) : []);
          if (candidate && candidate[0]) {
            const pick = candidate.find(b => /^(EAN_|UPC_)/i.test(String(b.format||""))) || candidate[0];
            const raw = pick.rawValue || pick.rawText || "";
            const val = norm(raw);
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

    // ZXing（Detectorが無い端末用）
    if (!detector) {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      else try { readerRef.current.reset(); } catch {}
      readerRef.current._started = true;
      readerRef.current.decodeFromStream(stream, v, async (result) => {
        if (!aliveRef.current) return;
        if (pausedScanRef.current || committingRef.current) return;
        if (!result) return;
        if (Date.now() < zxingReadyAtRef.current) return;
        const val = norm(result.getText());
        if (!val) return;
        const hashNow = latestHashRef.current ?? 0;
        await seenNow(val, hashNow);
      }).catch(()=>{});
    }
  }, [confirmMs, minRoiDiff, skipSameFrameDiff, ignoreCode, ignoreForMs, firstIgnorePrevMs, suppressUnknownMs, suppressAcceptedMs, moveMAWindow, moveMAThreshold, moveAfterCommitDiff, fullFrameProbe, rereadMinDebounceMs, onDetected, onClose, stopAll]);

  // 「再読込み」：次の1回だけ同一JAN再確定を許可
  const activateReread = useCallback(() => {
    const lastCode = lastHitRef.current.code;
    const now = Date.now();
    // ウィンドウを開く
    rereadUntilRef.current = now + rereadWindowMs;
    // 直前の採用済み抑止を一度だけ解除（そのJANをすぐ読めるように）
    if (lastCode) {
      clearSuppressFor(lastCode);
      notifiedRef.current.delete(lastCode); // 未登録抑止は消さないのが基本だが、直前がOKだったケースを想定
    }
  }, [rereadWindowMs]);

  // open 制御
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open) { stopAll(); return; }
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
        stopAll();
      }
    })();
    return () => { cancelled = true; stopAll(); };
  }, [open, start, stopAll]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle}>
          <video
            ref={videoRef}
            style={{ width:"100%", height:"100%", objectFit:"cover", backgroundColor:"black" }}
            autoPlay playsInline muted
          />
          {/* 枠ガイド（UIのみ） */}
          <div
            style={{
              position:"absolute", left:"50%", top:"45%", transform:"translate(-50%, -50%)",
              width:"88%", aspectRatio:"3 / 1",
              border:"3px solid rgba(255,255,255,0.9)", borderRadius:10, pointerEvents:"none",
              boxShadow:"0 0 0 200vmax rgba(0,0,0,0.25) inset"
            }}
          />
        </div>
        <div style={footerStyle}>
          <div style={{ minHeight: 18 }}>
            {errorMsg ? <span style={{ color:"#ffb3b3" }}>{errorMsg}</span> : <span>中央の枠にバーコードを合わせてください。</span>}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {enableRereadButton && (
              <button onClick={activateReread} style={{ ...btn, background:"#ffd83d" }}>
                再読込み
              </button>
            )}
            <button onClick={() => { stopAll(); onClose?.(); }} style={btn}>キャンセル</button>
          </div>
        </div>
      </div>
    </div>
  );
}
