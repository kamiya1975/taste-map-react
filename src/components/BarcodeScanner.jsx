// src/components/BarcodeScanner.jsx
import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const OVERLAY_Z = 2147483647;

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: OVERLAY_Z };
const panelStyle   = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle= { flex: 1, position: "relative", background: "#000", overflow: "hidden" };
const footerStyle  = { padding: 16, borderTop: "1px solid #222", textAlign: "center", color: "#ddd", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };

// ---- helpers
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
    const lower = cams.map((d) => ({ id: d.deviceId, label: (d.label || "").toLowerCase() }));
    // ultrawide/macro っぽいラベルがあれば優先
    const prefer = lower.find((d) => /ultra|macro|tele|wide/.test(d.label) && /back|rear|environment|外側|環境/.test(d.label));
    const back   = lower.find((d) => /back|rear|environment|外側|環境/.test(d.label));
    return prefer?.id || back?.id || cams[cams.length - 1]?.deviceId;
  } catch { return undefined; }
}

async function getBackStream() {
  const id = await pickBackDeviceId();
  if (id) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: id },
          width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 },
          // ヒント（対応端末のみ）
          focusMode: "continuous"
        },
      });
    } catch {}
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { exact: "environment" },
        width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 },
        focusMode: "continuous"
      },
    });
  } catch {}
  return await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 },
      focusMode: "continuous"
    },
  });
}

function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}

// ---- フォーカス強化：可能なら連続AF/AE/WB + 近距離側に寄せる + 少しズーム
async function tuneForMacro(track, tapPoint /* 0..1 */ = { x: 0.5, y: 0.5 }, preferZoom = 1.5) {
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();

  const adv = [];

  // 連続AF/AE/WB
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous"))       adv.push({ focusMode: "continuous" });
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes("continuous")) adv.push({ exposureMode: "continuous" });
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes("continuous")) adv.push({ whiteBalanceMode: "continuous" });

  // タップ位置（初期は中央）にAF/AEのポイントを寄せる
  if (caps.pointsOfInterest) adv.push({ pointsOfInterest: [tapPoint] });

  // まず連続系を適用
  if (adv.length) { try { await track.applyConstraints({ advanced: adv }); } catch {} }

  // 端末が manual フォーカス距離を持っていたら「近距離側」へ一旦寄せてから continuous へ戻す
  // focusDistance は “0が無限遠、値が大きいほど近距離” の実装が多い
  if (caps.focusDistance && typeof caps.focusDistance.max === "number" && Array.isArray(caps.focusMode) && caps.focusMode.includes("manual")) {
    const near = caps.focusDistance.max; // 近距離側
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "manual", focusDistance: near }] });
      // ほんの少し待ってから continuous に戻す（ピント位置を起点に追従させる狙い）
      setTimeout(async () => {
        try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
      }, 120);
    } catch {}
  }

  // 近接は少しズームを入れると読み取りが安定することが多い（デジタルでもOK）
  if (caps.zoom) {
    const midZoom = Math.min(caps.zoom.max, Math.max(caps.zoom.min || 1, preferZoom));
    try { await track.applyConstraints({ advanced: [{ zoom: midZoom }] }); } catch {}
  }
}

// 画面タップで再フォーカス（非対応端末は無視）
async function tapToFocus(track, el, evt) {
  if (!track?.getCapabilities || !el) return;
  const caps = track.getCapabilities();
  const rect = el.getBoundingClientRect();
  const x = (evt.clientX - rect.left) / rect.width;
  const y = (evt.clientY - rect.top) / rect.height;
  const adv = [];

  if (caps.pointsOfInterest) adv.push({ pointsOfInterest: [{ x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) }] });
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) adv.push({ focusMode: "continuous" });
  if (adv.length) { try { await track.applyConstraints({ advanced: adv }); } catch {} }

  // manual があれば近距離側へ軽く寄せ → continuous (端末依存)
  if (caps.focusDistance && Array.isArray(caps.focusMode) && caps.focusMode.includes("manual")) {
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "manual", focusDistance: caps.focusDistance.max }] });
      setTimeout(async () => { try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}; }, 100);
    } catch {}
  }
}

/* ========= Component ========= */
export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const readerRef = useRef(null);
  const keepAFRef = useRef(null);

  const [errorMsg, setErrorMsg] = useState("");

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
    await tuneForMacro(track);

    if (!(video.videoWidth > 0 && video.videoHeight > 0)) throw new Error("VIDEO_DIM_ZERO");

    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    else try { readerRef.current.reset(); } catch {}

    // AF維持のため、定期的に continuous を再適用（端末依存）
    if (track?.getCapabilities) {
      keepAFRef.current = setInterval(() => {
        track.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }, 1500);
    }

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

  // 非表示→表示で再起動
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
        </div>
        <div style={footerStyle}>
          <span style={{ color: errorMsg ? "#ffb3b3" : "#ddd" }}>
            {errorMsg || "バーコードにかざすと自動で読み取ります。ピントが外れたら画面をタップしてください。"}
          </span>
          <button
            onClick={handleCancel}
            style={{ background: "#fff", color: "#000", border: "none", padding: "12px 24px", fontSize: "16px", borderRadius: 10, cursor: "pointer", fontWeight: 700 }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
