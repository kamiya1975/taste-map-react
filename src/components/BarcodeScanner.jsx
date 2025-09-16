// src/components/BarcodeScanner.jsx
// 目的：
//  - 誤って“以前のJAN”が出る問題をさらに抑止（強いモーション&時差要件）
//  - 起動/復帰直後は十分な動きが出るまで確定しない（staleガード）
//  - 「再読込み」ボタンは抑止解除のみ（直前JANの強制解除をやめる）
//  - HUD/デバイスUI/フラッシュ無し、ROI→fullframe 検出で精度維持
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

// ---- グローバル + sessionStorage 抑止 ----
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
// clearSuppressFor は削除（再読込みでの強制解除はやめる）

// ---- utils ----
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
async function getStream() {
  const base = { aspectRatio: { ideal: 16/9 }, frameRate: { ideal: 30, max: 60 }, width: { ideal: 1280 }, height: { ideal: 720 } };
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
  confirmMs = 750,              // 時間間隔もやや長めに
  minRoiDiff = 0.0028,          // ROI差分を強化（以前の画が紛れ込みにくい）
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
  moveMAThreshold = 0.0030,     // 平均動き閾値を強化
  moveAfterCommitDiff = 0.015,  // 直前コミット画からより大きな差を要求
  // 追加：二段確認の“別フレーム”要件をさらに強化（2点比較）
  confirmSecondPointDiff = 0.0045, // 二回目検出時、初回と別のフレーム点でも十分な差分が必要
  confirmMinDtMs = 90,             // 二段間で最低90msの時間差
  // 起動/復帰直後のstaleガード
  requireMotionAtStartMs = 800,    // 開始からこの間は十分な動きが無いと確定しない
  // 精度
  fullFrameProbe = true,
  // 「再読込み」ボタン（抑止解除のみ）
  enableRereadButton = true,
  rereadWindowMs = 6000,        // 再読込みを押してから抑止緩和のウィンドウ（採用OK抑止のみ緩和）
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
  const lastHitRef = useRef({ code: null, at: 0, hash: 0 });
  const zxingReadyAtRef = useRef(0);
  const notifiedRef = useRef(new Map());   // 未採用時の抑止（ローカル）

  // 候補→確認→確定
  const candRef = useRef(null); // { code, t0, hash0, t1?, hash1? }

  // ライフサイクル制御
  const committingRef = useRef(false);
  const pausedScanRef = useRef(false);
  const aliveRef      = useRef(false);

  // 再読込みモード（採用OK抑止のみ緩和）
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

    const stream = await getStream();
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

    const effectiveIgnoreMs = () => ignoreForMs;

    const tryCommit = async (val) => {
      const now = Date.now();
      if (!aliveRef.current) return false;

      // 起動直後は前セッション先頭JANを採用しない
      if (prevSessionFirstRef.current.code &&
          now - sessionAtRef.current < firstIgnorePrevMs &&
          val === prevSessionFirstRef.current.code) return false;

      // 起動/復帰直後のstaleガード：十分な動きが溜まるまで確定禁止
      const elapsed = now - sessionAtRef.current;
      const maStart = motionBufRef.current.length ? motionBufRef.current.reduce((a,b)=>a+b,0)/motionBufRef.current.length : 0;
      if (elapsed < requireMotionAtStartMs && maStart < moveMAThreshold) return false;

      // ローカル・デバウンス
      if (ignoreCode && val === String(ignoreCode)) {
        if (now - (lastHitRef.current.at||0) < effectiveIgnoreMs()) return false;
      }
      if (val === lastHitRef.current.code && now - lastHitRef.current.at < effectiveIgnoreMs()) return false;

      // 抑止：未登録NGは常に抑止、採用OKの抑止は再読込み中のみ緩める
      if (!isRereadActive() && isSuppressed(val, suppressAcceptedMs)) return false;
      if (isSuppressed(val, suppressUnknownMs)) return false;

      // ---- 親へ通知（確定） ----
      committingRef.current = true;
      pausedScanRef.current = true;

      lastHitRef.current = { code: val, at: now, hash: prevHashRef.current ?? 0 };
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
        lastCommitHashRef.current = prevHashRef.current;
        aliveRef.current = false;
        stopAll();
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

      // 抑止（採用OKは再読込み中のみ緩める／NGは常に）
      if (!isRereadActive() && isSuppressed(val, suppressAcceptedMs)) return false;
      if (isSuppressed(val, suppressUnknownMs)) return false;

      // ローカル未採用抑止
      const lastN = notifiedRef.current.get(val) || 0;
      if (now - lastN < suppressUnknownMs) return false;

      // 放置対策：同一JANは“動き”必須（より強く）
      const diffs = motionBufRef.current;
      const ma = diffs.length ? diffs.reduce((a,b)=>a+b,0)/diffs.length : 0;
      const lastCommittedHash = lastCommitHashRef.current;
      const movedSinceCommit = lastCommittedHash == null ? true :
        (Math.abs((hashNow ?? 0) - lastCommittedHash) / (Math.abs(lastCommittedHash) + 1e-6)) >= moveAfterCommitDiff;

      // 同一JANに厳しめ（以前のJANが紛れ込むのを防ぐ）
      if (val === lastHitRef.current.code) {
        if (ma < moveMAThreshold || !movedSinceCommit) return false;
      }

      // 二段確認（強化版：時間差 + 2点差分）
      const cand = candRef.current;
      if (!cand || cand.code !== val || (now - cand.t0) > confirmMs) {
        candRef.current = { code: val, t0: now, hash0: hashNow };
        return false;
      }
      const dt = now - cand.t0;
      const diff1 = Math.abs(hashNow - cand.hash0) / (Math.abs(cand.hash0) + 1e-6);
      // 一度「別フレーム」を拾ったら、その次も十分離れていることを要求
      if (cand.hash1 == null) {
        if (dt >= confirmMinDtMs && diff1 >= minRoiDiff) {
          cand.hash1 = hashNow; // 二点目の基準を保存
          cand.t1 = now;
        }
        return false;
      } else {
        const diff2 = Math.abs(hashNow - cand.hash1) / (Math.abs(cand.hash1) + 1e-6);
        const ok = dt >= confirmMinDtMs && diff1 >= minRoiDiff && diff2 >= confirmSecondPointDiff;
        if (ok) {
          const committed = await tryCommit(val);
          if (!committed && aliveRef.current) candRef.current = null;
          return committed;
        }
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

      // Detector：まずROI(canvas)、空振り時はvideo全体
      const detector = hasBD() ? new window.BarcodeDetector({
        formats:["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code"]
      }) : null; // 再生成で古い内部状態を避ける（軽量）
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
    if (!hasBD()) {
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
  }, [confirmMs, minRoiDiff, confirmSecondPointDiff, confirmMinDtMs, skipSameFrameDiff, ignoreCode, ignoreForMs, firstIgnorePrevMs, suppressUnknownMs, suppressAcceptedMs, moveMAWindow, moveMAThreshold, moveAfterCommitDiff, requireMotionAtStartMs, fullFrameProbe, onDetected, onClose, stopAll]);

  // 「再読込み」：採用OK抑止のみ短時間緩和（直前JANの強制解除はしない）
  const activateReread = useCallback(() => {
    rereadUntilRef.current = Date.now() + rereadWindowMs;
    // 抑止テーブルの消去は行わない（誤発火の原因になり得るため）
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
          {/* 枠ガイドのみ */}
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
