// フォーカス最優先版: 背面固定 / 自動起動 / 横長ガイド / 手動フォーカス(対応端末のみ)
// 依存: npm i @zxing/browser
import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/browser";

const OVERLAY_Z = 2147483647;

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: OVERLAY_Z };
const panelStyle   = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle= { flex: 1, position: "relative", background: "#000", overflow: "hidden" };
const footerStyle  = { padding: 12, borderTop: "1px solid #222", color: "#ddd", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 };

const btn = { background: "#fff", color: "#000", border: "none", padding: "10px 16px", fontSize: 16, borderRadius: 10, cursor: "pointer", fontWeight: 700 };

// ===== helpers
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
    // マクロ/超広角/背面らしきものを優先
    const prefer = rows.find((d) => /macro|ultra|wide|tele/.test(d.label) && /back|rear|environment|外側|環境/.test(d.label));
    const back   = rows.find((d) => /back|rear|environment|外側|環境/.test(d.label));
    return prefer?.id || back?.id || cams[cams.length - 1]?.deviceId;
  } catch { return undefined; }
}

async function getBackStream() {
  const id = await pickBackDeviceId();
  const base = { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16/9 }, focusMode: "continuous" };
  if (id) {
    try { return await navigator.mediaDevices.getUserMedia({ audio:false, video: { deviceId: { exact:id }, ...base } }); } catch {}
  }
  try { return await navigator.mediaDevices.getUserMedia({ audio:false, video: { facingMode: { exact:"environment" }, ...base } }); } catch {}
  return await navigator.mediaDevices.getUserMedia({ audio:false, video: { facingMode: { ideal:"environment" }, ...base } });
}

function assertHTTPS() {
  const isLocal = ["localhost","127.0.0.1","::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}

// タップ位置へ再AF（対応端末のみ）
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

// 近距離に寄せる“揺さぶり”：manual→near→continuous（端末対応時のみ）
async function nudgeNearThenContinuous(track) {
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  const adv = [];
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) adv.push({ focusMode:"continuous" });
  if (adv.length) try { await track.applyConstraints({ advanced: adv }); } catch {}

  if (caps.focusDistance && Array.isArray(caps.focusMode) && caps.focusMode.includes("manual")) {
    const near = caps.focusDistance.max; // 近距離側（多くの実装で max が手前）
    try {
      await track.applyConstraints({ advanced: [{ focusMode:"manual", focusDistance: near }] });
      await new Promise(r => setTimeout(r, 120));
      // single-shot があれば使う
      if (caps.focusMode.includes("single-shot")) {
        await track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] });
      } else {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      }
    } catch {}
  } else {
    // manual不可でも continuous を再適用して“蹴り”を入れる
    try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
  }
}

// ===== component
export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const readerRef = useRef(null);
  const keepAFRef = useRef(null);

  const [errorMsg, setErrorMsg] = useState("");
  const [caps, setCaps] = useState(null);
  const [focusVal, setFocusVal] = useState(null);   // manual フォーカス値（対応時のみ）
  const [autoAF, setAutoAF] = useState(true);       // 連続AFの維持

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

  const start = useCallback(async () => {
    setErrorMsg("");
    assertHTTPS();

    const video = videoRef.current;
    if (!video) throw new Error("NO_VIDEO");

    // iOS/Safari 必須属性は srcObject 前に
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.muted = true;
    video.autoplay = true;

    // 1) 背面カメラ取得
    const stream = await getBackStream();
    streamRef.current = stream;
    const track = stream.getVideoTracks?.()[0];

    // 2) 再生
    video.srcObject = stream;
    await waitForVideoReady(video, 9000);
    try { await video.play(); } catch {}

    // 3) フォーカス用の能力を収集
    const c = track?.getCapabilities?.() || {};
    setCaps(c);

    // 4) 近距離寄せ “揺さぶり”＋連続AF維持
    await nudgeNearThenContinuous(track);
    if (Array.isArray(c.focusMode) && c.focusMode.includes("continuous")) {
      setAutoAF(true);
      keepAFRef.current = setInterval(() => {
        track.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }, 1500);
    }

    // 5) ZXing (TRY_HARDER + 主要バーコードに限定)
    if (!readerRef.current) {
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE, // ついでの保険
      ]);
      readerRef.current = new BrowserMultiFormatReader(hints);
    } else {
      try { readerRef.current.reset(); } catch {}
    }

    if (!(video.videoWidth > 0 && video.videoHeight > 0)) throw new Error("VIDEO_DIM_ZERO");

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
        if (name === "NotAllowedError" || name === "SecurityError") setErrorMsg("カメラが『拒否』です。設定でこのサイトのカメラを『許可』にしてください。");
        else if (name === "NotFoundError" || name === "OverconstrainedError") setErrorMsg("背面カメラが見つかりません。端末再起動または別ブラウザをお試しください。");
        else if (name === "NotReadableError") setErrorMsg("他のアプリがカメラ使用中の可能性。全て終了後に再試行してください。");
        else if (name === "AbortError") setErrorMsg("カメラ初期化が中断されました。再試行してください。");
        else if (name === "NEED_HTTPS") setErrorMsg("HTTPS が必須です。https でアクセスしてください。");
        else if (name === "VIDEO_TIMEOUT" || name === "VIDEO_DIM_ZERO") setErrorMsg("初期化に時間がかかっています。ページ再読込を試してください。");
        else setErrorMsg(`カメラ起動失敗（${name}${msg}）`);
        stopAll();
      }
    })();
    return () => { cancelled = true; stopAll(); };
  }, [open, start, stopAll]);

  // タブ可視/不可視で処理
  useEffect(() => {
    const onVis = () => {
      if (!open) return;
      if (document.visibilityState === "hidden") { stopAll(); }
      if (document.visibilityState === "visible") { start().catch(() => {}); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, start, stopAll]);

  // 手動フォーカス適用
  const applyFocusManual = useCallback(async (val) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints || !caps?.focusDistance) return;
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "manual", focusDistance: val }] });
      setFocusVal(val);
      setAutoAF(false);
      if (keepAFRef.current) { clearInterval(keepAFRef.current); keepAFRef.current = null; }
    } catch {}
  }, [caps?.focusDistance]);

  // AF自動 切替
  const toggleAutoAF = useCallback(async (next) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    setAutoAF(next);
    if (next) {
      try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
      if (!keepAFRef.current) {
        keepAFRef.current = setInterval(() => {
          track.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        }, 1500);
      }
    } else {
      if (keepAFRef.current) { clearInterval(keepAFRef.current); keepAFRef.current = null; }
    }
  }, []);

  // 画面タップで再AF
  const onTap = useCallback((e) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    tapToFocus(track, e.currentTarget, e);
  }, []);

  const handleCancel = () => { stopAll(); onClose?.(); };

  const v = videoRef.current;
  const hud = v ? `state=${v.readyState} ${v.videoWidth}x${v.videoHeight}` : "state=- 0x0";

  if (!open) return null;

  const fmt = (n) => (typeof n === "number" ? Math.round(n * 100) / 100 : "");

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle} onPointerDown={onTap}>
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
          <div style={{ position: "absolute", right: 8, top: 8, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "4px 8px", borderRadius: 8 }}>{hud}</div>

          {/* 手動フォーカス（対応端末のみ表示） */}
          {caps?.focusDistance && (
            <div
              style={{
                position: "absolute", left: 0, right: 0, bottom: 0,
                padding: "8px 12px",
                background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.8) 100%)",
                color: "#fff", fontSize: 12
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={autoAF} onChange={(e) => toggleAutoAF(e.target.checked)} />
                  AF自動
                </label>
                <button
                  onClick={() => nudgeNearThenContinuous(streamRef.current?.getVideoTracks?.()[0])}
                  style={{ background:"#333", color:"#fff", border:"1px solid #666", padding:"6px 10px", borderRadius:8 }}
                >
                  近距離へ寄せて再AF
                </button>
                <div style={{ opacity: 0.8 }}>（画面タップでも再AF）</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 48px", gap: 8, alignItems: "center" }}>
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
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <div style={{ minHeight: 18 }}>
            {errorMsg
              ? <span style={{ color: "#ffb3b3" }}>{errorMsg}</span>
              : <span>バーコードにかざすと自動で読み取ります。ピントが来ない時は画面タップ、対応端末は下部で手動調整できます。</span>}
          </div>
          <button onClick={handleCancel} style={btn}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
