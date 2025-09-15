// src/components/BarcodeScanner.jsx
// 強化版: 自動終了(検出後) / 二重発火防止 / 背面固定 / ピンチズーム / ROI最適化
// UI簡素化: 「AF自動」「ライトON」等の操作UIは撤去（そのまま読める前提）
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

// タップAF（pointsOfInterest対応端末は座標指定、無ければ continuous を再適用）
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

// 近距離寄せ→continuous（対応端末のみ）
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

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null); // ROI用
  const streamRef  = useRef(null);
  const trackRef   = useRef(null);
  const readerRef  = useRef(null);
  const rafIdRef   = useRef(0);
  const keepAFRef  = useRef(0);
  const detectedRef= useRef(false); // ← 二重発火防止

  const [errorMsg, setErrorMsg] = useState("");
  const [caps, setCaps] = useState(null);
  const [zoomVal, setZoomVal] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [hud, setHud] = useState("-");
  const [usingDetector, setUsingDetector] = useState(false);

  // ピンチズーム
  const pinchState = useRef({ a: null, b: null, baseZoom: null, baseDist: null });

  const stopAll = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch {}
    cancelAnimationFrame(rafIdRef.current || 0);
    if (keepAFRef.current) { clearInterval(keepAFRef.current); keepAFRef.current = 0; }
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      if (s) s.getTracks?.().forEach(t => t.stop());
      if (v) { v.pause?.(); v.srcObject = null; }
    } catch {}
    streamRef.current = null;
    trackRef.current = null;
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
        track.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }, 1500);
    }
  }, []);

  const start = useCallback(async (explicitId) => {
    setErrorMsg("");
    setHud("-");
    detectedRef.current = false; // 起動毎に解除
    assertHTTPS();

    try { setDevices(await enumerateBackCameras()); } catch {}

    // 1) ストリーム
    const stream = await getStreamById(explicitId || deviceId);
    streamRef.current = stream;
    const track = stream.getVideoTracks?.()[0];
    trackRef.current = track;

    // 2) ビデオ要素
    const video = videoRef.current;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.muted = true;
    video.autoplay = true;
    video.srcObject = stream;
    await waitForVideoReady(video, 9000);
    try { await video.play(); } catch {}

    // 3) 能力・AF・ズーム初期化
    const c = track?.getCapabilities?.() || {};
    setCaps(c);
    await nudgeNearThenContinuous(track);
    await setAutoAFOn();
    if (c.zoom) {
      const init = Math.max(c.zoom.min ?? 1, Math.min(c.zoom.max ?? 1, (c.zoom.min ?? 1) + ((c.zoom.max ?? 1) - (c.zoom.min ?? 1)) * 0.15));
      await applyZoom(init);
    }

    // 4) スキャナ起動（Detector優先 → ZXing）
    const canUseDetector = hasBarcodeDetector();
    setUsingDetector(!!canUseDetector);

    if (canUseDetector) {
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] });
      const loop = async () => {
        if (detectedRef.current) return;
        const v = videoRef.current;
        if (!v) return;

        // ROI：ガイド枠 3:1 を切り出し
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
          try {
            const barcodes = await detector.detect(canvasRef.current);
            if (!detectedRef.current && barcodes && barcodes[0]) {
              detectedRef.current = true;
              const val = barcodes[0].rawValue || barcodes[0].rawText || "";
              stopAll();
              onDetected?.(val);
              onClose?.(); // ← 検出後にスキャナを自動で閉じる
              return;
            }
          } catch {}
        }
        rafIdRef.current = requestAnimationFrame(loop);
      };
      rafIdRef.current = requestAnimationFrame(loop);
    } else {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      else try { readerRef.current.reset(); } catch {}
      await readerRef.current.decodeFromStream(stream, video, (result) => {
        if (!result || detectedRef.current) return;
        detectedRef.current = true;
        stopAll();
        onDetected?.(result.getText());
        onClose?.(); // ← 検出後にスキャナを自動で閉じる
      });
    }
  }, [applyZoom, deviceId, onClose, onDetected, setAutoAFOn, stopAll]);

  // open → 自動起動
  useEffect(() => {
    if (!open) { stopAll(); return; }
    let cancelled = false;
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
      if (document.visibilityState === "visible") { start().catch(() => {}); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, start, stopAll]);

  // HUD 更新
  useEffect(() => {
    const v = videoRef.current;
    const i = setInterval(() => {
      const s = trackRef.current?.getSettings?.() || {};
      setHud(`${v?.readyState ?? "-"} ${v?.videoWidth ?? 0}x${v?.videoHeight ?? 0} zoom:${(s.zoom ?? zoomVal ?? "").toString()}`);
    }, 500);
    return () => clearInterval(i);
  }, [zoomVal]);

  // タップで再AF（UIは出さないが挙動は維持）
  const onTap = useCallback((e) => {
    const track = trackRef.current;
    tapToFocus(track, e.currentTarget, e);
  }, []);

  // ピンチズーム
  const onPointerDown = useCallback(async (e) => {
    if (e.pointerType !== "touch") return;
    if (!pinchState.current.a) pinchState.current.a = e;
    else pinchState.current.b = e;
    const c = trackRef.current?.getCapabilities?.();
    if (c?.zoom && pinchState.current.a && pinchState.current.b) {
      const dx = pinchState.current.a.clientX - pinchState.current.b.clientX;
      const dy = pinchState.current.a.clientY - pinchState.current.b.clientY;
      pinchState.current.baseZoom = zoomVal ?? trackRef.current?.getSettings?.().zoom ?? c.zoom.min ?? 1;
      pinchState.current.baseDist = Math.hypot(dx, dy);
    }
  }, [zoomVal]);

  const onPointerMove = useCallback(async (e) => {
    if (e.pointerType !== "touch") return;
    if (pinchState.current.a?.pointerId === e.pointerId) pinchState.current.a = e;
    if (pinchState.current.b?.pointerId === e.pointerId) pinchState.current.b = e;
    const c = trackRef.current?.getCapabilities?.();
    if (c?.zoom && pinchState.current.a && pinchState.current.b && pinchState.current.baseDist) {
      const dx = pinchState.current.a.clientX - pinchState.current.b.clientX;
      const dy = pinchState.current.a.clientY - pinchState.current.b.clientY;
      const dist = Math.hypot(dx, dy);
      const k = dist / pinchState.current.baseDist;
      const next = (pinchState.current.baseZoom ?? 1) * k;
      applyZoom(next);
    }
  }, [applyZoom]);

  const onPointerUp = useCallback((e) => {
    if (pinchState.current.a?.pointerId === e.pointerId) pinchState.current.a = null;
    if (pinchState.current.b?.pointerId === e.pointerId) pinchState.current.b = null;
    if (!pinchState.current.a || !pinchState.current.b) {
      pinchState.current.baseDist = null;
      pinchState.current.baseZoom = null;
    }
  }, []);

  // レンズ切替
  const [devicesState, setDevicesState] = useState({ ready: false });
  useEffect(() => { if (devices.length) setDevicesState({ ready: true }); }, [devices]);
  const onChangeDevice = async (e) => {
    const id = e.target.value || null;
    setDeviceId(id);
    stopAll();
    start(id).catch(() => {});
  };

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div
          style={videoBoxStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          onClick={onTap}
        >
          <video
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

          {/* ズームスライダー（対応端末のみ表示） */}
          {caps?.zoom && (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 10, background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 30%, rgba(0,0,0,0.9) 100%)", color: "#fff" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 56px", gap: 8, alignItems: "center" }}>
                <input
                  type="range"
                  min={caps.zoom.min ?? 1} max={caps.zoom.max ?? 1} step={caps.zoom.step ?? 0.1}
                  value={zoomVal ?? caps.zoom.min ?? 1}
                  onChange={(e) => applyZoom(parseFloat(e.target.value))}
                />
                <div style={{ textAlign: "right" }}>{typeof zoomVal === "number" ? Math.round(zoomVal * 100) / 100 : ""}</div>
              </div>
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <div style={{ minHeight: 18 }}>
            {errorMsg
              ? <span style={{ color: "#ffb3b3" }}>{errorMsg}</span>
              : <span>中央の枠にバーコードを合わせてください。ピンチで拡大、タップで再AFできます。</span>}
          </div>
          <button onClick={() => { stopAll(); onClose?.(); }} style={btn}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
