// src/components/BarcodeScanner.jsx
// 連続スキャン安定版（禁止JANなし）
// 対策：ウォームアップ / フレーム差分ゲート / video再マウント / ZXing受け付け遅延 / 軽い重複無効化（時間制限）
// 依存: npm i @zxing/browser

import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
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

// 新鮮フレームを一定数/一定時間待つ
async function waitForFreshFrames(video, { minFrames = 8, minElapsedMs = 600 } = {}) {
  const start = performance.now();
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    let count = 0;
    return new Promise((resolve) => {
      const cb = () => {
        count += 1;
        const elapsed = performance.now() - start;
        if (count >= minFrames && elapsed >= minElapsedMs) resolve();
        else video.requestVideoFrameCallback(cb);
      };
      video.requestVideoFrameCallback(cb);
    });
  }
  await new Promise((r) => setTimeout(r, minElapsedMs));
}

async function getStreamById(deviceId) {
  const base = {
    width: { ideal: 1920 }, height: { ideal: 1080 },
    aspectRatio: { ideal: 16 / 9 },
    frameRate: { ideal: 30, max: 60 },
  };
  try {
    if (deviceId) {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: deviceId }, ...base } });
    }
  } catch {}
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: "environment" }, ...base } });
  } catch {}
  return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, ...base } });
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

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
  // 任意：短時間の同一JAN無効化（禁止リストではない）
  ignoreCode = null,
  ignoreForMs = 1200,
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

  const [errorMsg, setErrorMsg] = useState("");
  const [caps, setCaps] = useState(null);
  const [zoomVal, setZoomVal] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [hud, setHud] = useState("-");
  const [usingDetector, setUsingDetector] = useState(false);

  // videoを再マウントしてデコーダ残像を消す
  const [vidKey, setVidKey] = useState(0);
  const bumpVideoKey = () => setVidKey((k) => k + 1);

  const stopAll = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch {}
    cancelAnimationFrame(rafIdRef.current || 0);
    rafIdRef.current = 0;
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
    streamRef.current = null;
    trackRef.current = null;
    prevHashRef.current = null;
  }, []);

  const applyZoom = useCallback(async (val) => {
    const track = trackRef.current;
    const c = track?.getCapabilities?.();
    if (!track || !track.applyConstraints || !c?.zoom) return;
    const clamped = Math.max(c.zoom.min ?? 1, Math.min(c.zoom.max ?? 1, val));
    try {
      await track.applyConstraints({ advanced: [{ zoom: clamped }] });
      setZoomVal(clamped);
    } catch {}
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
    assertHTTPS();

    try { setDevices(await enumerateBackCameras()); } catch {}

    // stream
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

    // capabilities
    const c = track?.getCapabilities?.() || {};
    setCaps(c);
    await nudgeNearThenContinuous(track);
    await setAutoAFOn();
    if (c.zoom) {
      const init = Math.max(
        c.zoom.min ?? 1,
        Math.min(c.zoom.max ?? 1, (c.zoom.min ?? 1) + ((c.zoom.max ?? 1) - (c.zoom.min ?? 1)) * 0.15)
      );
      await applyZoom(init);
    }

    // warmup
    await waitForFreshFrames(video, { minFrames: 8, minElapsedMs: 600 });
    zxingReadyAtRef.current = Date.now();

    // Detector → ZXing
    const canUseDetector = hasBarcodeDetector();
    setUsingDetector(!!canUseDetector);

    const handleHit = (raw) => {
      const val = norm(raw);
      if (!val) return false;

      // 短時間の同一JAN無効化（禁止JANではない）
      if (ignoreCode && val === String(ignoreCode)) {
        if (Date.now() - (lastHitRef.current.at || 0) < (ignoreForMs || 0)) {
          return false;
        }
      }
      // 直近ヒットが同一JANなら短時間だけ無効化（デフォ1200ms）
      if (val === lastHitRef.current.code && Date.now() - lastHitRef.current.at < 1200) {
        return false;
      }

      lastHitRef.current = { code: val, at: Date.now() };
      detectedRef.current = true;
      stopAll();
      onDetected?.(val);
      onClose?.();
      return true;
    };

    if (canUseDetector) {
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"]
      });

      const loop = async () => {
        if (detectedRef.current) return;
        const v = videoRef.current;
        if (!v) return;

        // ROI: 画面中央 3:1
        let cw = canvasRef.current?.width || 0;
        let ch = canvasRef.current?.height || 0;
        if (!cw || !ch) {
          const canvas = (canvasRef.current = document.createElement("canvas"));
          cw = canvas.width = 960;
          ch = canvas.height = 320;
        }
        const ctx = canvasRef.current.getContext("2d");
        const vw = v.videoWidth, vh = v.videoHeight;

        if (vw && vh) {
          const rh = Math.floor(vh * 0.30);
          const rw = Math.floor(rh * 3);
          const sx = Math.floor((vw - rw) / 2);
          const sy = Math.floor(vh * 0.45 - rh / 2);
          ctx.drawImage(v, sx, sy, rw, rh, 0, 0, cw, ch);

          // フレーム差分ゲート
          try {
            const img = ctx.getImageData(0, 0, cw, ch).data;
            let sum = 0, step = 32;
            for (let i = 0; i < img.length; i += 4 * step) {
              sum += img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114;
            }
            const prev = prevHashRef.current;
            prevHashRef.current = sum;
            if (prev != null) {
              const diffRatio = Math.abs(sum - prev) / (Math.abs(prev) + 1e-6);
              if (diffRatio < 0.0035) { // 少しだけ閾値を上げて残像を更に弾く
                rafIdRef.current = requestAnimationFrame(loop);
                return;
              }
            }
          } catch {}

          try {
            const barcodes = await detector.detect(canvasRef.current);
            if (barcodes && barcodes[0]) {
              const raw = barcodes[0].rawValue || barcodes[0].rawText || "";
              if (handleHit(raw)) return;
            }
          } catch {}
        }

        rafIdRef.current = requestAnimationFrame(loop);
      };
      rafIdRef.current = requestAnimationFrame(loop);
    } else {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      else try { readerRef.current.reset(); } catch {}

      readerRef.current.decodeFromStream(stream, video, (result) => {
        if (!result || detectedRef.current) return;
        if (Date.now() < zxingReadyAtRef.current) return;
        const raw = result.getText();
        handleHit(raw);
      }).catch(() => {});
    }
  }, [applyZoom, deviceId, ignoreCode, ignoreForMs, onClose, onDetected, setAutoAFOn, stopAll]);

  // open → 自動起動/停止（video再マウント）
  useEffect(() => {
    if (!open) { stopAll(); return; }
    let cancelled = false;
    bumpVideoKey();
    (async () => {
      try { await start(); }
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
        else if (name === "VIDEO_TIMEOUT") setErrorMsg("初期化に時間がかかっています。ページ再読込を試してください。");
        else setErrorMsg(`カメラ起動失敗（${name}${msg}）`);
        stopAll();
      }
    })();
    return () => { cancelled = true; stopAll(); };
  }, [open, start, stopAll]);

  // 可視不可視で再起動（PWA対策）
  useEffect(() => {
    const onVis = () => {
      if (!open) return;
      if (document.visibilityState === "hidden") { stopAll(); }
      if (document.visibilityState === "visible") { bumpVideoKey(); start().catch(() => {}); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, start, stopAll]);

  // HUD
  useEffect(() => {
    const v = videoRef.current;
    const i = setInterval(() => {
      const s = trackRef.current?.getSettings?.() || {};
      setHud(`${v?.readyState ?? "-"} ${v?.videoWidth ?? 0}x${v?.videoHeight ?? 0} zoom:${(s.zoom ?? zoomVal ?? "").toString()}`);
    }, 500);
    return () => clearInterval(i);
  }, [zoomVal]);

  // タップで軽い再AF
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
    stopAll();
    bumpVideoKey();
    start(id).catch(() => {});
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
