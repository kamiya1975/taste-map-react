// src/components/BarcodeScanner.jsx
// 依存: npm i @zxing/browser
import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const OVERLAY_Z = 2147483647;

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: OVERLAY_Z };
const panelStyle   = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle= { flex: 1, position: "relative", background: "#000", overflow: "hidden" };
const footerStyle  = { padding: 12, borderTop: "1px solid #222", color: "#ddd", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 };

const btn = { background: "#fff", color: "#000", border: "none", padding: "10px 16px", fontSize: 16, borderRadius: 10, cursor: "pointer", fontWeight: 700 };

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
    }, 200);
    video.addEventListener("loadedmetadata", ok, { once: true });
    video.addEventListener("canplay", ok, { once: true });
    video.addEventListener("error", err, { once: true });
  });
}

async function pickBackDeviceId() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const cams = devs.filter((d) => d.kind === "videoinput");
    if (!cams.length) return undefined;
    const rows = cams.map((d) => ({ id: d.deviceId, label: (d.label || "").toLowerCase() }));
    // マクロ/広角/背面っぽいのを優先
    const prefer = rows.find((d) => /macro|ultra|wide|tele/.test(d.label) && /back|rear|environment|外側|環境/.test(d.label));
    const back   = rows.find((d) => /back|rear|environment|外側|環境/.test(d.label));
    return prefer?.id || back?.id || cams[cams.length - 1]?.deviceId;
  } catch { return undefined; }
}

async function getBackStream() {
  const id = await pickBackDeviceId();
  const common = { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 }, focusMode: "continuous" };
  if (id) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: id }, ...common } });
    } catch {}
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: "environment" }, ...common } });
  } catch {}
  return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, ...common } });
}

function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}

// 画面タップで再フォーカス（対応端末のみ）
async function tapToFocus(track, el, evt) {
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  if (!caps.pointsOfInterest && !caps.focusMode) return;
  const r = el.getBoundingClientRect();
  const x = (evt.clientX - r.left) / r.width;
  const y = (evt.clientY - r.top) / r.height;
  const adv = [];
  if (caps.pointsOfInterest) adv.push({ pointsOfInterest: [{ x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) }] });
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) adv.push({ focusMode: "continuous" });
  if (adv.length) try { await track.applyConstraints({ advanced: adv }); } catch {}
}

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const readerRef = useRef(null);
  const keepAFRef = useRef(null);

  const [errorMsg, setErrorMsg] = useState("");

  // 手動調整用 state（サポートされていなければ UI を出さない）
  const [caps, setCaps] = useState(null);
  const [settings, setSettings] = useState({});
  const [autoAF, setAutoAF] = useState(true);
  const [zoomVal, setZoomVal] = useState(null);
  const [focusVal, setFocusVal] = useState(null);
  const [torch, setTorch] = useState(false);

  const stopAll = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch {}
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      if (s) s.getTracks?.().forEach((t) => t.stop());
      if (v) { v.pause?.(); v.srcObject = null; }
    } catch {}
    streamRef.current = null;
    if (keepAFRef.current) { clearInterval(keepAFRef.current); keepAFRef.current = null; }
  }, []);

  const applyZoom = useCallback(async (val) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: val }] });
      setZoomVal(val);
      setSettings(track.getSettings?.() || {});
    } catch {}
  }, []);

  const applyFocusManual = useCallback(async (val) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints || !caps?.focusDistance) return;
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "manual", focusDistance: val }] });
      setFocusVal(val);
      setAutoAF(false);
      setSettings(track.getSettings?.() || {});
    } catch {}
  }, [caps?.focusDistance]);

  const toggleAutoAF = useCallback(async (next) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    setAutoAF(next);
    if (next) {
      try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
      // AF維持タイマーを再開
      if (!keepAFRef.current) {
        keepAFRef.current = setInterval(() => {
          track.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        }, 1500);
      }
    } else {
      if (keepAFRef.current) { clearInterval(keepAFRef.current); keepAFRef.current = null; }
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints || !caps?.torch) return;
    const next = !torch;
    try { await track.applyConstraints({ advanced: [{ torch: next }] }); setTorch(next); } catch {}
  }, [torch, caps?.torch]);

  const start = useCallback(async () => {
    setErrorMsg("");
    assertHTTPS();

    const video = videoRef.current;
    if (!video) throw new Error("NO_VIDEO");

    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.muted = true;
    video.autoplay = true;

    const stream = await getBackStream();
    streamRef.current = stream;
    video.srcObject = stream;

    await waitForVideoReady(video, 9000);
    try { await video.play(); } catch {}

    const track = stream.getVideoTracks?.()[0];

    // 能力値を保存して UI 構築
    const c = track.getCapabilities?.() || {};
    setCaps(c);
    const s = track.getSettings?.() || {};
    setSettings(s);
    if (c.zoom) {
      const initZoom = s.zoom ?? Math.min(c.zoom.max, Math.max(c.zoom.min || 1, 1.5));
      setZoomVal(initZoom);
      try { await track.applyConstraints({ advanced: [{ zoom: initZoom }] }); } catch {}
    }
    if (Array.isArray(c.focusMode) && c.focusMode.includes("continuous")) {
      setAutoAF(true);
      keepAFRef.current = setInterval(() => {
        track.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }, 1500);
    }
    if (c.focusDistance) {
      // “最大=近距離側” 想定。初期値は近寄り気味に
      const initFocus = Math.min(c.focusDistance.max, Math.max(c.focusDistance.min || 0, (c.focusDistance.max ?? 0) * 0.9));
      setFocusVal(initFocus);
    }

    if (!(video.videoWidth > 0 && video.videoHeight > 0)) throw new Error("VIDEO_DIM_ZERO");

    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    else try { readerRef.current.reset(); } catch {}

    await readerRef.current.decodeFromStream(stream, video, (result) => {
      if (result) {
        const text = result.getText();
        stopAll();
        onDetected?.(text);
      }
    });
  }, [onDetected, stopAll]);

  // open で自動起動
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
        if (name === "NotAllowedError" || name === "SecurityError") {
          setErrorMsg("カメラが『拒否』になっています。iOSの「設定 > Safari > カメラ」を『許可』にしてください。");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setErrorMsg("背面カメラが見つかりません。端末の再起動またはブラウザ変更をお試しください。");
        } else if (name === "NotReadableError") {
          setErrorMsg("他のアプリがカメラを使用中の可能性があります。全て終了してから再試行してください。");
        } else if (name === "AbortError") {
          setErrorMsg("カメラ初期化が中断されました。もう一度お試しください。");
        } else if (name === "NEED_HTTPS") {
          setErrorMsg("セキュアコンテキスト(HTTPS)が必須です。https でアクセスしてください。");
        } else if (name === "VIDEO_TIMEOUT" || name === "VIDEO_DIM_ZERO") {
          setErrorMsg("映像の初期化に時間がかかっています。ページの再読み込みをお試しください。");
        } else {
          setErrorMsg(`カメラの起動に失敗しました（${name}${msg}）。`);
        }
        stopAll();
      }
    })();
    return () => { cancelled = true; stopAll(); };
  }, [open, start, stopAll]);

  // タブ表示/非表示で再起動
  useEffect(() => {
    const onVis = () => {
      if (!open) return;
      if (document.visibilityState === "hidden") { stopAll(); }
      if (document.visibilityState === "visible") { start().catch(() => {}); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, start, stopAll]);

  const handleCancel = () => { stopAll(); onClose?.(); };

  const v = videoRef.current;
  const hud = v ? `state=${v.readyState} ${v.videoWidth}x${v.videoHeight}` : "state=- 0x0";

  if (!open) return null;

  const fmt = (n) => (typeof n === "number" ? Math.round(n * 100) / 100 : "");

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div
          style={videoBoxStyle}
          onPointerDown={(e) => {
            const track = streamRef.current?.getVideoTracks?.()[0];
            tapToFocus(track, e.currentTarget, e);
          }}
        >
          <video
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover", backgroundColor: "black" }}
            autoPlay
            playsInline
            muted
          />
          {/* 横長ガイド（3:1） */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "45%",
              transform: "translate(-50%, -50%)",
              width: "88%",
              aspectRatio: "3 / 1",
              border: "3px solid rgba(255,255,255,0.9)",
              borderRadius: 10,
              pointerEvents: "none",
              boxShadow: "0 0 0 200vmax rgba(0,0,0,0.25) inset",
            }}
          />
          {/* HUD */}
          <div style={{ position: "absolute", right: 8, top: 8, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "4px 8px", borderRadius: 8 }}>{hud}</div>

          {/* 手動調整パネル（下部・半透明） */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "10px 12px",
              background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.8) 100%)",
              color: "#fff",
              fontSize: 12,
            }}
          >
            {/* AF 切替 & Torch */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              {Array.isArray(caps?.focusMode) && caps.focusMode.length > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={autoAF}
                    onChange={(e) => toggleAutoAF(e.target.checked)}
                  />
                  AF自動
                </label>
              )}
              {caps?.torch && (
                <button
                  onClick={toggleTorch}
                  style={{ background: torch ? "#ffec99" : "#333", color: torch ? "#000" : "#fff", border: "1px solid #666", padding: "6px 10px", borderRadius: 8 }}
                >
                  🔦 {torch ? "ライトON" : "ライトOFF"}
                </button>
              )}
              <div style={{ opacity: 0.8 }}>画面タップで再AF / 右側は数値</div>
            </div>

            {/* ズーム */}
            {caps?.zoom && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 42px", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input
                  type="range"
                  min={caps.zoom.min ?? 1}
                  max={caps.zoom.max ?? 3}
                  step={caps.zoom.step ?? 0.1}
                  value={zoomVal ?? caps.zoom.min ?? 1}
                  onChange={(e) => applyZoom(parseFloat(e.target.value))}
                />
                <div style={{ textAlign: "right" }}>{fmt(zoomVal)}x</div>
              </div>
            )}

            {/* 手動フォーカス（近 ←→ 遠） */}
            {caps?.focusDistance && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 42px", gap: 8, alignItems: "center" }}>
                <input
                  type="range"
                  min={caps.focusDistance.min ?? 0}
                  max={caps.focusDistance.max ?? 100}
                  step={caps.focusDistance.step ?? 1}
                  value={focusVal ?? caps.focusDistance.min ?? 0}
                  onChange={(e) => applyFocusManual(parseFloat(e.target.value))}
                  disabled={autoAF}
                />
                <div style={{ textAlign: "right" }}>{fmt(focusVal)}</div>
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", opacity: 0.7 }}>
                  <span>近距離</span><span>遠距離</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={footerStyle}>
          <div style={{ minHeight: 18 }}>
            {errorMsg
              ? <span style={{ color: "#ffb3b3" }}>{errorMsg}</span>
              : <span>バーコードにかざすと自動で読み取ります。ピントが来ない場合は下のスライダーで調整。</span>}
          </div>
          <button onClick={handleCancel} style={btn}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
