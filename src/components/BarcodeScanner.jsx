// src/components/BarcodeScanner.jsx
// 連続スキャン・超強化版（Front→Backフラッシュ + ARMEDフェーズ）
// 依存: npm i @zxing/browser

import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const OVERLAY_Z = 2147483647;
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: OVERLAY_Z };
const panelStyle   = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle= { flex: 1, position: "relative", background: "#000", overflow: "hidden", touchAction: "none" };
const footerStyle  = { padding: 12, borderTop: "1px solid #222", color: "#ddd", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 };
const btn          = { background: "#fff", color: "#000", border: "none", padding: "10px 16px", fontSize: 16, borderRadius: 10, cursor: "pointer", fontWeight: 700 };

const hasBarcodeDetector = () => typeof window !== "undefined" && "BarcodeDetector" in window;
const norm = (s) => String(s ?? "").replace(/\D/g, "");

function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}

async function enumerateBackCameras() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const cams = devs.filter((d) => d.kind === "videoinput");
  const rows = cams.map((d, i) => ({
    id: d.deviceId,
    label: d.label || `Camera ${i + 1}`,
    score:
      (/back|rear|environment|外側|環境/i.test(d.label || "") ? 10 : 0) +
      (/macro|ultra|wide|tele/i.test(d.label || "") ? 3 : 0),
  }));
  return rows.sort((a, b) => b.score - a.score);
}

async function waitForVideoReady(video, timeoutMs = 9000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let done = false;
    const ok  = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const err = (e) => { if (!done) { done = true; cleanup(); reject(e); } };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", ok);
      video.removeEventListener("canplay", ok);
      video.removeEventListener("error", err);
      clearInterval(iv);
    };
    const iv = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) ok();
      else if (Date.now() > deadline) err(new Error("VIDEO_TIMEOUT"));
    }, 150);
    video.addEventListener("loadedmetadata", ok, { once: true });
    video.addEventListener("canplay", ok, { once: true });
    video.addEventListener("error", err, { once: true });
  });
}

// rVFC: mediaTimeウォームアップ（ユニーク数 & 累計Δ）
async function warmupByMediaTime(video, { uniq = 14, sumSec = 0.8, timeoutMs = 5000 } = {}) {
  if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) {
    await new Promise((r) => setTimeout(r, 900)); return;
  }
  const t0 = performance.now();
  return new Promise((resolve) => {
    const seen = new Set(); let last = 0, accum = 0;
    const cb = (_ts, meta) => {
      const mt = meta?.mediaTime ?? 0;
      if (!seen.has(mt)) {
        if (last > 0 && mt > last) accum += (mt - last);
        seen.add(mt); last = mt;
      }
      if (seen.size >= uniq && accum >= sumSec) return resolve();
      if (performance.now() - t0 > timeoutMs) return resolve();
      video.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
  });
}

// ROIシャノンエントロピー（16ビン）
function roiEntropy(ctx, w, h) {
  try {
    const img = ctx.getImageData(0, 0, w, h).data;
    const bins = new Array(16).fill(0);
    const step = 8; let total = 0;
    for (let i = 0; i < img.length; i += 4 * step) {
      const y = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
      const b = Math.max(0, Math.min(15, (y | 0) >> 4));
      bins[b]++; total++;
    }
    let H = 0;
    for (let k = 0; k < 16; k++) if (bins[k]) { const p = bins[k] / total; H -= p * Math.log2(p); }
    return H; // 0〜4程度
  } catch { return 0; }
}

// “動き量”を積算（正規化輝度差の総和）
function motionDelta(prev, cur) {
  const den = Math.abs(prev) + 1e-6;
  return Math.abs(cur - prev) / den;
}

// Front→Back フラッシュ：前面カメラを 200ms だけ開いて即破棄し、背面を起動
async function flushPipelineThenBack(deviceId) {
  try {
    const f = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: "user" } } });
    await new Promise(r => setTimeout(r, 200));
    f.getTracks().forEach(t => t.stop());
  } catch { /* 前面が無い端末はスキップ */ }
  // 背面で再取得
  return await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }
  });
}

// 近接→continuous
async function nudgeNearThenContinuous(track) {
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
    try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
  }
  if (caps.focusDistance && Array.isArray(caps.focusMode) && caps.focusMode.includes("manual")) {
    const near = caps.focusDistance.max;
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "manual", focusDistance: near }] });
      await new Promise(r => setTimeout(r, 120));
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    } catch {}
  }
}

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
  ignoreCode = null,
  ignoreForMs = 1200,
  firstIgnorePrevMs = 2000,  // 直前セッション最初JANの一時無効化
  entropyThreshold = 2.5,    // ARMED条件
  autoFrontBackFlush = true, // 既定ON：パイプライン強制フラッシュ
}) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const trackRef    = useRef(null);
  const readerRef   = useRef(null);
  const rafIdRef    = useRef(0);
  const keepAFRef   = useRef(0);

  const detectedRef = useRef(false);
  const zxingReadyAtRef = useRef(0);
  const lastHitRef  = useRef({ code: null, at: 0 });

  const prevSessionFirstRef = useRef({ code: null });
  const sessionStartAtRef = useRef(0);

  // ARMEDフェーズ状態
  const armedRef = useRef(false);
  const firstEntropyRef = useRef(null);
  const roiHashes = useRef([]);      // ユニークハッシュ観測
  const motionAccumRef = useRef(0);  // 動き量の積算
  const prevHashRef = useRef(null);  // 直前ハッシュ
  const firstGuardRef = useRef({ // 初回検出の安定化（3連続一致 & ROI差異）
    vals: [], hashes: []
  });

  const [errorMsg, setErrorMsg] = useState("");
  const [hud, setHud] = useState("-");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [usingDetector, setUsingDetector] = useState(false);
  const [vidKey, setVidKey] = useState(0);

  const stopAll = useCallback(async () => {
    try { readerRef.current?.reset?.(); } catch {}
    cancelAnimationFrame(rafIdRef.current || 0); rafIdRef.current = 0;
    if (keepAFRef.current) { clearInterval(keepAFRef.current); keepAFRef.current = 0; }
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      if (s) s.getTracks?.().forEach(t => t.stop());
      if (v) {
        try { v.pause?.(); } catch {}
        try { v.srcObject = null; } catch {}
        try { v.removeAttribute("src"); } catch {}
        try { v.load?.(); } catch {}
      }
    } catch {}
    streamRef.current = null; trackRef.current = null;
    detectedRef.current = false; armedRef.current = false;
    firstEntropyRef.current = null; roiHashes.current = [];
    motionAccumRef.current = 0; prevHashRef.current = null;
    firstGuardRef.current = { vals: [], hashes: [] };
  }, []);

  const ensureCanvas = () => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = 960; canvasRef.current.height = 320;
    }
    return canvasRef.current.getContext("2d");
  };

  const sampleROI = (video) => {
    const ctx = ensureCanvas(); const cw = canvasRef.current.width; const ch = canvasRef.current.height;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return { hash: Math.random(), H: 0 };
    const rh = Math.floor(vh * 0.30), rw = Math.floor(rh * 3);
    const sx = Math.floor((vw - rw) / 2), sy = Math.floor(vh * 0.45 - rh / 2);
    ctx.drawImage(video, sx, sy, rw, rh, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    let sum = 0, step = 32;
    for (let i = 0; i < data.length; i += 4 * step) sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const H = roiEntropy(ctx, cw, ch);
    return { hash: sum, H };
  };

  // ARMED判定：十分な“生”の映像が来たら armedRef.current = true
  const updateArmedState = (hash, H) => {
    if (firstEntropyRef.current == null) firstEntropyRef.current = H;
    const prev = prevHashRef.current;
    if (prev != null) motionAccumRef.current += motionDelta(prev, hash);
    prevHashRef.current = hash;

    if (!roiHashes.current.includes(hash)) {
      roiHashes.current.push(hash);
      if (roiHashes.current.length > 24) roiHashes.current.shift();
    }

    const entropyOK = (H >= entropyThreshold) && (H >= firstEntropyRef.current + 0.25);
    const uniqOK = roiHashes.current.length >= 6;        // 6個以上のユニークROI
    const motionOK = motionAccumRef.current >= 10000;    // 動き積算しきい値（要調整）
    if (entropyOK && uniqOK && motionOK) armedRef.current = true;
  };

  const handleStableHit = (raw, roiHash) => {
    const val = norm(raw);
    if (!val) return false;

    // 直前セッションの最初JANを起動直後は採用しない
    if (prevSessionFirstRef.current.code &&
        Date.now() - sessionStartAtRef.current < firstIgnorePrevMs &&
        val === prevSessionFirstRef.current.code) return false;

    // 初回検出の安定化：3連続一致 & ROI差異
    const fg = firstGuardRef.current;
    fg.vals.push(val); fg.hashes.push(roiHash);
    if (fg.vals.length > 3) { fg.vals.shift(); fg.hashes.shift(); }
    const threeSame = fg.vals.length === 3 && fg.vals.every(x => x === val);
    const allHashesDiff = new Set(fg.hashes).size === fg.hashes.length;

    if (!threeSame || !allHashesDiff) return false;

    // 同一JANの短時間デバウンス（禁止ではない）
    if (ignoreCode && val === String(ignoreCode)) {
      if (Date.now() - (lastHitRef.current.at || 0) < (ignoreForMs || 0)) return false;
    }
    if (val === lastHitRef.current.code && Date.now() - lastHitRef.current.at < 1200) return false;

    lastHitRef.current = { code: val, at: Date.now() };
    detectedRef.current = true;
    prevSessionFirstRef.current.code = val;
    onDetected?.(val);
    onClose?.();
    return true;
  };

  const start = useCallback(async (explicitId) => {
    setErrorMsg(""); setHud("-");
    assertHTTPS();
    try { setDevices(await enumerateBackCameras()); } catch {}

    sessionStartAtRef.current = Date.now();
    // --- Front→Back フラッシュ（既定ON）---
    let stream;
    try {
      if (autoFrontBackFlush) stream = await flushPipelineThenBack(explicitId || deviceId);
      else stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: explicitId ? { deviceId: { exact: explicitId } } : { facingMode: { ideal: "environment" } } });
    } catch (e) {
      // フラッシュ失敗時は背面のみ再試行
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: explicitId ? { deviceId: { exact: explicitId } } : { facingMode: { ideal: "environment" } } });
    }

    streamRef.current = stream;
    const track = stream.getVideoTracks?.()[0];
    trackRef.current = track;

    // video セット
    const v = videoRef.current;
    v.playsInline = true; v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
    v.muted = true; v.autoplay = true; v.srcObject = stream;
    await waitForVideoReady(v, 9000);
    try { await v.play(); } catch {}

    // AF
    await nudgeNearThenContinuous(track);

    // mediaTime ウォームアップ
    await warmupByMediaTime(v, { uniq: 14, sumSec: 0.8, timeoutMs: 5000 });
    zxingReadyAtRef.current = Date.now();

    // 検出ループ（ARMEDになるまで採用不可）
    setUsingDetector(hasBarcodeDetector());
    const detector = hasBarcodeDetector() ? new window.BarcodeDetector({
      formats: ["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"]
    }) : null;

    const tick = async () => {
      if (detectedRef.current) return;
      const { hash, H } = sampleROI(v);
      updateArmedState(hash, H);
      // ARMED前は検出しない
      if (!armedRef.current) { rafIdRef.current = requestAnimationFrame(tick); return; }

      if (detector) {
        try {
          const res = await detector.detect(canvasRef.current);
          if (res && res[0]) {
            const raw = res[0].rawValue || res[0].rawText || "";
            if (handleStableHit(raw, hash)) return;
          }
        } catch {}
      } else {
        if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
        // ZXing は decodeFromStream 内部ループなので1度だけ開始
        if (!readerRef.current._started) {
          readerRef.current._started = true;
          readerRef.current.decodeFromStream(stream, v, (result) => {
            if (!result || detectedRef.current) return;
            if (Date.now() < zxingReadyAtRef.current) return;
            const raw = result.getText();
            handleStableHit(raw, hash);
          }).catch(()=>{});
        }
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [autoFrontBackFlush, deviceId, firstIgnorePrevMs, ignoreCode, ignoreForMs]);

  // open制御
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (!open) { await stopAll(); return; }
      try { setVidKey(k => k + 1); await start(); }
      catch (e) {
        if (cancelled) return;
        console.error("[camera start error]", e);
        const name = e?.name || "Error";
        const msg = e?.message ? `: ${e.message}` : "";
        if (name === "NotAllowedError" || name === "SecurityError") setErrorMsg("カメラが『拒否』です。設定でこのサイトのカメラを『許可』にしてください。");
        else if (name === "NotFoundError" || name === "OverconstrainedError") setErrorMsg("背面カメラが見つかりません。端末再起動または別ブラウザをお試しください。");
        else if (name === "NotReadableError") setErrorMsg("他アプリがカメラ使用中の可能性。全て終了後に再試行してください。");
        else if (name === "AbortError") setErrorMsg("カメラ初期化が中断されました。再試行してください。");
        else if (name === "NEED_HTTPS") setErrorMsg("HTTPS が必須です。https でアクセスしてください。");
        else if (name === "VIDEO_TIMEOUT") setErrorMsg("初期化が長引いています。ページ再読込を試してください。");
        else setErrorMsg(`カメラ起動失敗（${name}${msg}）`);
        await stopAll();
      }
    };
    boot();
    return () => { cancelled = true; stopAll(); };
  }, [open, start, stopAll]);

  // 可視/不可視
  useEffect(() => {
    const onVis = async () => {
      if (!open) return;
      if (document.visibilityState === "hidden") { await stopAll(); }
      if (document.visibilityState === "visible") {
        setVidKey(k => k + 1); await start().catch(()=>{});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, start, stopAll]);

  // HUD
  useEffect(() => {
    const v = videoRef.current;
    const i = setInterval(() => {
      const s = trackRef.current?.getSettings?.() || {};
      setHud(`${v?.readyState ?? "-"} ${v?.videoWidth ?? 0}x${v?.videoHeight ?? 0} armed:${armedRef.current ? "1":"0"}`);
    }, 500);
    return () => clearInterval(i);
  }, []);

  // レンズ切替
  const [devicesState, setDevicesState] = useState({ ready: false });
  useEffect(() => { if (devices.length) setDevicesState({ ready: true }); }, [devices]);
  const onChangeDevice = async (e) => {
    const id = e.target.value || null;
    setDeviceId(id);
    await stopAll(); setVidKey(k => k + 1); await start(id).catch(()=>{});
  };

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle}>
          <video
            key={vidKey}
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover", backgroundColor: "black" }}
            autoPlay playsInline muted
          />
          {/* 横長ガイド（3:1） */}
          <div
            style={{
              position: "absolute",
              left: "50%", top: "45%", transform: "translate(-50%, -50%)",
              width: "88%", aspectRatio: "3 / 1",
              border: "3px solid rgba(255,255,255,0.9)", borderRadius: 10, pointerEvents: "none",
              boxShadow: "0 0 0 200vmax rgba(0,0,0,0.25) inset",
            }}
          />
          {/* HUD */}
          <div style={{ position: "absolute", right: 8, top: 8, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "4px 8px", borderRadius: 8 }}>
            {usingDetector ? "Detector" : "ZXing"} | {hud}
          </div>
        </div>

        <div style={footerStyle}>
          <div style={{ minHeight: 18 }}>
            {errorMsg ? <span style={{ color: "#ffb3b3" }}>{errorMsg}</span> : <span>中央の枠にバーコードを合わせてください。</span>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {devicesState.ready && (
              <select
                onChange={onChangeDevice}
                value={deviceId || ""}
                style={{ background: "#111", color: "#eee", border: "1px solid #333", borderRadius: 8, padding: "8px" }}
                aria-label="カメラ切替"
              >
                <option value="">自動</option>
                {devices.map((d) => (<option key={d.id} value={d.id}>{d.label}</option>))}
              </select>
            )}
            <button onClick={() => { stopAll(); onClose?.(); }} style={btn}>キャンセル</button>
          </div>
        </div>
      </div>
    </div>
  );
}
