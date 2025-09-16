// src/components/BarcodeScanner.jsx
// 連続スキャン・最強ガード版
// - 起動ごとの解像度プロファイル切替（1080p/720p）でデコーダ再利用を避ける
// - エントロピー・ゲート（ROIの Shannon entropy が閾値未満なら検出開始しない）
// - 起動直後のみ「前セッション最初のJAN」を一定時間だけ採用しない（禁止JANではない）
// - 既存: mediaTime ウォームアップ / ROI差分 / 連続2フレーム一致ガード / video再マウント / ZXing受け付け遅延
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

// mediaTime ウォームアップ
async function waitForFreshFramesMediaTime(video, { minUniqueCount = 10, minMediaTimeSeconds = 0.5, timeoutMs = 4500 } = {}) {
  if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) {
    await new Promise((r) => setTimeout(r, 800));
    return;
  }
  const start = performance.now();
  return new Promise((resolve) => {
    const seen = new Set();
    let last = 0;
    let accum = 0;
    const tick = (_ts, meta) => {
      const mt = meta?.mediaTime ?? 0;
      if (!seen.has(mt)) {
        if (last > 0 && mt > last) accum += (mt - last);
        seen.add(mt);
        last = mt;
      }
      const enough = seen.size >= minUniqueCount && accum >= minMediaTimeSeconds;
      const expired = performance.now() - start > timeoutMs;
      if (enough || expired) resolve();
      else video.requestVideoFrameCallback(tick);
    };
    video.requestVideoFrameCallback(tick);
  });
}

// 2つの解像度プロファイルを交互に使って、毎回パイプラインを変える
let PROFILE_TOGGLE = 0;
function nextVideoConstraints(deviceId) {
  PROFILE_TOGGLE ^= 1;
  const base = PROFILE_TOGGLE
    ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 } };
  return {
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
      ...base,
      aspectRatio: { ideal: 16 / 9 },
      frameRate: { ideal: 30, max: 60 },
    },
  };
}

async function getStreamById(deviceId) {
  try { return await navigator.mediaDevices.getUserMedia(nextVideoConstraints(deviceId)); } catch {}
  // フォールバック：もう一方のプロファイルで再トライ
  try { PROFILE_TOGGLE ^= 1; return await navigator.mediaDevices.getUserMedia(nextVideoConstraints(deviceId)); } catch {}
  // 最後の最後のフォールバック
  return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
}

// タップAF
async function tapToFocus(track, el, evt) {
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  const adv = [];
  if (caps.pointsOfInterest) {
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max((evt.clientX - r.left) / r.width, 0), 1);
    const y = Math.min(Math.max((evt.clientY - r.top) / r.height, 0), 1);
    adv.push({ pointsOfInterest: [{ x, y }] });
  }
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
    adv.push({ focusMode: "continuous" });
  }
  if (adv.length) {
    try { await track.applyConstraints({ advanced: adv }); } catch {}
  }
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

// ROIのシャノンエントロピー（16ビン）
function roiEntropy(ctx, w, h) {
  try {
    const img = ctx.getImageData(0, 0, w, h).data;
    const bins = new Array(16).fill(0);
    const step = 8; // 軽量化
    let total = 0;
    for (let i = 0; i < img.length; i += 4 * step) {
      const y = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
      const b = Math.max(0, Math.min(15, (y | 0) >> 4));
      bins[b]++; total++;
    }
    let H = 0;
    for (let k = 0; k < 16; k++) {
      if (!bins[k]) continue;
      const p = bins[k] / total;
      H -= p * Math.log2(p);
    }
    return H; // 0〜4 の範囲程度
  } catch {
    return 0;
  }
}

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
  ignoreCode = null,      // 任意：短時間の同一JAN無効化（禁止リストではない）
  ignoreForMs = 1200,
  firstIgnorePrevMs = 1500,  // 起動直後のみ、前セッション1st JANを採用しない時間
  entropyThreshold = 2.2,    // エントロピー・ゲートの閾値（2.0〜2.8で調整）
}) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const trackRef    = useRef(null);
  const readerRef   = useRef(null);
  const rafIdRef    = useRef(0);
  const keepAFRef   = useRef(0);
  const detectedRef = useRef(false);
  const prevHashRef = useRef(null);
  const zxingReadyAtRef = useRef(0);
  const lastHitRef  = useRef({ code: null, at: 0 });

  // 初回検出ガード：連続2フレーム同値 + ROI差分
  const firstGuardRef = useRef({ lastVal: "", lastHash: null, okCount: 0 });

  // セッション間の“最初に読まれたJAN”を記憶（禁止ではない）
  const prevSessionFirstRef = useRef({ code: null });
  const sessionStartAtRef = useRef(0);

  const [errorMsg, setErrorMsg] = useState("");
  const [zoomVal, setZoomVal] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [hud, setHud] = useState("-");
  const [usingDetector, setUsingDetector] = useState(false);
  const [vidKey, setVidKey] = useState(0); // video再マウント

  const bumpVideoKey = () => setVidKey((k) => k + 1);

  async function waitTrackEnded(track, ms = 700) {
    if (!track) { await new Promise(r=>setTimeout(r, 50)); return; }
    if (track.readyState === "ended") return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      const onEnd = () => { clearTimeout(timer); resolve(); };
      track.addEventListener("ended", onEnd, { once: true });
    });
  }

  const stopAll = useCallback(async () => {
    try { readerRef.current?.reset?.(); } catch {}
    cancelAnimationFrame(rafIdRef.current || 0);
    rafIdRef.current = 0;
    if (keepAFRef.current) { clearInterval(keepAFRef.current); keepAFRef.current = 0; }
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      const track = s?.getTracks?.()[0] || trackRef.current;
      if (s) s.getTracks?.().forEach(t => t.stop());
      await waitTrackEnded(track);
      if (v) {
        try { v.pause?.(); } catch {}
        try { v.srcObject = null; } catch {}
        try { v.removeAttribute("src"); } catch {}
        try { v.load?.(); } catch {}
      }
    } catch {}
    streamRef.current = null;
    trackRef.current = null;
    prevHashRef.current = null;
    firstGuardRef.current = { lastVal: "", lastHash: null, okCount: 0 };
  }, []);

  const applyZoom = useCallback(async (val) => {
    const track = trackRef.current;
    const c = track?.getCapabilities?.();
    if (!track || !track.applyConstraints || !c?.zoom) return;
    const clamped = Math.max(c.zoom.min ?? 1, Math.min(c.zoom.max ?? 1, val));
    try { await track.applyConstraints({ advanced: [{ zoom: clamped }] }); setZoomVal(clamped); } catch {}
  }, []);

  const setAutoAFOn = useCallback(async () => {
    const track = trackRef.current;
    if (!track?.applyConstraints) return;
    try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
    if (!keepAFRef.current) {
      keepAFRef.current = setInterval(() => {
        track?.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }, 1500);
    }
  }, []);

  const start = useCallback(async (explicitId) => {
    setErrorMsg("");
    setHud("-");
    detectedRef.current = false;
    prevHashRef.current = null;
    firstGuardRef.current = { lastVal: "", lastHash: null, okCount: 0 };
    sessionStartAtRef.current = Date.now();
    assertHTTPS();

    try { setDevices(await enumerateBackCameras()); } catch {}

    // stream（解像度プロファイル切替）
    const stream = await getStreamById(explicitId || deviceId);
    streamRef.current = stream;
    const track = stream.getVideoTracks?.()[0];
    trackRef.current = track;

    // video
    const video = videoRef.current;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.muted = true;
    video.autoplay = true;
    video.srcObject = stream;

    await waitForVideoReady(video, 9000);
    try { await video.play(); } catch {}

    // AF/Zoom
    await nudgeNearThenContinuous(track);
    await setAutoAFOn();

    // mediaTime ウォームアップ
    await waitForFreshFramesMediaTime(video, { minUniqueCount: 10, minMediaTimeSeconds: 0.5, timeoutMs: 4500 });
    zxingReadyAtRef.current = Date.now();

    // Detector → ZXing
    const canUseDetector = hasBarcodeDetector();
    setUsingDetector(!!canUseDetector);

    // 共通：ROIの確保
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = 960;
      canvasRef.current.height = 320;
    }
    const cw = canvasRef.current.width;
    const ch = canvasRef.current.height;
    const ctx = canvasRef.current.getContext("2d");

    const sampleROI = (v) => {
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) return { hash: Math.random(), H: 0 };
      const rh = Math.floor(vh * 0.30);
      const rw = Math.floor(rh * 3);
      const sx = Math.floor((vw - rw) / 2);
      const sy = Math.floor(vh * 0.45 - rh / 2);
      ctx.drawImage(v, sx, sy, rw, rh, 0, 0, cw, ch);
      // hash
      let sum = 0, step = 32;
      const data = ctx.getImageData(0, 0, cw, ch).data;
      for (let i = 0; i < data.length; i += 4 * step) {
        sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }
      const H = roiEntropy(ctx, cw, ch);
      return { hash: sum, H };
    };

    const handleHitOnceStable = (raw, roiHash) => {
      const val = norm(raw);
      if (!val) return false;

      // 起動直後のみ、前セッションの最初のJANを一定時間だけ採用しない
      if (prevSessionFirstRef.current.code &&
          Date.now() - sessionStartAtRef.current < firstIgnorePrevMs &&
          val === prevSessionFirstRef.current.code) {
        return false;
      }

      // 連続2フレーム同値 + ROI変化（初回ガード）
      const fg = firstGuardRef.current;
      if (fg.okCount < 2) {
        if (fg.lastVal === val && fg.lastHash !== roiHash) {
          fg.okCount += 1;
        } else {
          fg.okCount = 1;
        }
        fg.lastVal = val;
        fg.lastHash = roiHash;
        if (fg.okCount < 2) return false;
      }

      // 同一JANの短時間デバウンス（禁止JANではない）
      if (ignoreCode && val === String(ignoreCode)) {
        if (Date.now() - (lastHitRef.current.at || 0) < (ignoreForMs || 0)) return false;
      }
      if (val === lastHitRef.current.code && Date.now() - lastHitRef.current.at < 1200) return false;

      lastHitRef.current = { code: val, at: Date.now() };
      detectedRef.current = true;
      prevSessionFirstRef.current.code = val; // 今セッションの最初を記録
      onDetected?.(val);
      onClose?.();
      return true;
    };

    const loopDetector = async () => {
      if (detectedRef.current) return;
      const v = videoRef.current;
      if (!v) return;

      const { hash, H } = sampleROI(v);

      // エントロピー・ゲート：画が“生きて”いなければ検出しない
      if (H < entropyThreshold) {
        requestAnimationFrame(loopDetector);
        return;
      }

      // ROI差分ゲート
      const prev = prevHashRef.current;
      prevHashRef.current = hash;
      if (prev != null) {
        const diff = Math.abs(hash - prev) / (Math.abs(prev) + 1e-6);
        if (diff < 0.0035) { requestAnimationFrame(loopDetector); return; }
      }

      try {
        const barcodes = await window.BarcodeDetector.prototype.detect.call(
          new window.BarcodeDetector({ formats: ["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"] }),
          canvasRef.current
        );
        if (barcodes && barcodes[0]) {
          const raw = barcodes[0].rawValue || barcodes[0].rawText || "";
          if (handleHitOnceStable(raw, hash)) return;
        }
      } catch {}
      requestAnimationFrame(loopDetector);
    };

    const startZXing = () => {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      else try { readerRef.current.reset(); } catch {}
      readerRef.current.decodeFromStream(stream, video, (result) => {
        if (!result || detectedRef.current) return;
        if (Date.now() < zxingReadyAtRef.current) return;

        const v = videoRef.current;
        const { hash, H } = sampleROI(v);
        if (H < entropyThreshold) return; // エントロピー・ゲート

        const prev = prevHashRef.current;
        prevHashRef.current = hash;
        if (prev != null) {
          const diff = Math.abs(hash - prev) / (Math.abs(prev) + 1e-6);
          if (diff < 0.0035) return;
        }

        const raw = result.getText();
        handleHitOnceStable(raw, hash);
      }).catch(() => {});
    };

    if (canUseDetector) {
      requestAnimationFrame(loopDetector);
    } else {
      startZXing();
    }
  }, [deviceId, entropyThreshold, firstIgnorePrevMs, ignoreCode, ignoreForMs, setAutoAFOn, stopAll]);

  // open → 自動起動/停止（video再マウント）
  useEffect(() => {
    if (!open) { stopAll(); return; }
    let cancelled = false;
    (async () => {
      try {
        setVidKey((k) => k + 1);
        await start();
      } catch (e) {
        if (cancelled) return;
        console.error("[camera start error]", e);
        const name = e?.name || "Error";
        const msg = e?.message ? `: ${e.message}` : "";
        if (name === "NotAllowedError" || name === "SecurityError") setErrorMsg("カメラが『拒否』です。設定でこのサイトのカメラを『許可』にしてください。");
        else if (name === "NotFoundError" || name === "OverconstrainedError") setErrorMsg("背面カメラが見つかりません。端末再起動または別ブラウザをお試しください。");
        else if (name === "NotReadableError") setErrorMsg("他アプリがカメラ使用中の可能性。全て終了後に再試行してください。");
        else if (name === "AbortError") setErrorMsg("カメラ初期化が中断されました。再試行してください。");
        else if (name === "NEED_HTTPS") setErrorMsg("HTTPS が必須です。https でアクセスしてください。");
        else if (name === "VIDEO_TIMEOUT") setErrorMsg("初期化に時間がかかっています。ページ再読込を試してください。");
        else setErrorMsg(`カメラ起動失敗（${name}${msg}）`);
        await stopAll();
      }
    })();
    return () => { cancelled = true; stopAll(); };
  }, [open, start, stopAll]);

  // 可視不可視で再起動（PWA対策）
  useEffect(() => {
    const onVis = async () => {
      if (!open) return;
      if (document.visibilityState === "hidden") { await stopAll(); }
      if (document.visibilityState === "visible") {
        setVidKey((k) => k + 1);
        await start().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, start, stopAll]);

  // HUD（簡易）
  useEffect(() => {
    const v = videoRef.current;
    const i = setInterval(() => {
      const s = trackRef.current?.getSettings?.() || {};
      setHud(`${v?.readyState ?? "-"} ${v?.videoWidth ?? 0}x${v?.videoHeight ?? 0} zoom:${(s.zoom ?? zoomVal ?? "").toString()}`);
    }, 500);
    return () => clearInterval(i);
  }, [zoomVal]);

  const onTap = useCallback((e) => {
    const track = trackRef.current;
    tapToFocus(track, e.currentTarget, e);
  }, []);

  // レンズ切替
  const [devicesState, setDevicesState] = useState({ ready: false });
  useEffect(() => { if (devices.length) setDevicesState({ ready: true }); }, [devices]);
  const onChangeDevice = async (e) => {
    const id = e.target.value || null;
    setDeviceId(id);
    await stopAll();
    setVidKey((k) => k + 1);
    await start(id).catch(() => {});
  };

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle} onClick={onTap}>
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
            {errorMsg
              ? <span style={{ color: "#ffb3b3" }}>{errorMsg}</span>
              : <span>中央の枠にバーコードを合わせてください。</span>}
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
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            )}
            <button onClick={() => { stopAll(); onClose?.(); }} style={btn}>キャンセル</button>
          </div>
        </div>
      </div>
    </div>
  );
}
