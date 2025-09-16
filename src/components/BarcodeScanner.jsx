// src/components/BarcodeScanner.jsx
// Detector優先 / ZXingフォールバック
// 機能: AF補助・フレーム差分・ウォームアップ・再読込み・EAN13チェックサム
import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const OVERLAY_Z = 2147483647;
const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.85)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: OVERLAY_Z,
};
const panelStyle = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  background: "#000",
};
const videoBoxStyle = {
  flex: 1,
  position: "relative",
  background: "#000",
  overflow: "hidden",
  touchAction: "none",
};
const footerStyle = {
  padding: 12,
  borderTop: "1px solid #222",
  color: "#ddd",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
};
const btnBase = {
  border: "none",
  padding: "10px 16px",
  fontSize: 16,
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};
const btnCancel = { ...btnBase, background: "#fff", color: "#000" };
const btnReload = { ...btnBase, background: "#ff0", color: "#000" };

// 定数
const REREAD_LS_KEY = "tm_reread_until";

// ===== ユーティリティ =====
const hasBarcodeDetector = () =>
  typeof window !== "undefined" && "BarcodeDetector" in window;
const norm = (s) => String(s ?? "").replace(/\D/g, "");
function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname
  );
  if (window.location.protocol !== "https:" && !isLocal)
    throw new Error("NEED_HTTPS");
}

// EAN13チェック
function isValidEan13(ean) {
  if (!/^\d{13}$/.test(ean)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = ean.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === ean.charCodeAt(12) - 48;
}
function toEan13(raw) {
  let s = norm(raw);
  if (s.length === 12) s = "0" + s; // UPC-A
  if (s.length !== 13) return null;
  return isValidEan13(s) ? s : null;
}

// ウォームアップ: 新鮮なフレームが一定数流れるまで待つ
async function waitForFreshFrames(video, { minFrames = 8, minElapsedMs = 600 }) {
  const start = performance.now();
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    let count = 0;
    return new Promise((resolve) => {
      const cb = () => {
        count += 1;
        const elapsed = performance.now() - start;
        if (count >= minFrames && elapsed >= minElapsedMs) {
          resolve();
        } else {
          video.requestVideoFrameCallback(cb);
        }
      };
      video.requestVideoFrameCallback(cb);
    });
  }
  await new Promise((r) => setTimeout(r, minElapsedMs));
}

// 軽いAF: タップで再AF
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
    try {
      await track.applyConstraints({ advanced: adv });
    } catch {}
  }
}

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const readerRef = useRef(null);
  const rafIdRef = useRef(0);
  const detectedRef = useRef(false);
  const prevHashRef = useRef(null);
  const rereadUntilRef = useRef(0);

  const [errorMsg, setErrorMsg] = useState("");
  const [usingDetector, setUsingDetector] = useState(false);
  const [rereadPressed, setRereadPressed] = useState(false);

  // 停止処理
  const stopAll = useCallback(() => {
    try {
      readerRef.current?.reset?.();
    } catch {}
    cancelAnimationFrame(rafIdRef.current || 0);
    const s = streamRef.current;
    if (s) s.getTracks?.forEach((t) => t.stop());
    if (videoRef.current) {
      videoRef.current.pause?.();
      videoRef.current.srcObject = null;
    }
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  // 再読込みボタン
  const activateReread = useCallback(() => {
    const until = Date.now() + 5000;
    rereadUntilRef.current = until;
    try {
      sessionStorage.setItem(REREAD_LS_KEY, String(until));
    } catch {}
    setRereadPressed(true);
    setTimeout(() => setRereadPressed(false), 180);
  }, []);

  // スキャン開始
  const start = useCallback(async () => {
    setErrorMsg("");
    detectedRef.current = false;
    prevHashRef.current = null;
    assertHTTPS();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: 1280, height: 720 },
    });
    streamRef.current = stream;
    const track = stream.getVideoTracks?.()[0];
    trackRef.current = track;

    const video = videoRef.current;
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    await video.play();

    await waitForFreshFrames(video);

    const canUseDetector = hasBarcodeDetector();
    setUsingDetector(!!canUseDetector);

    if (canUseDetector) {
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "upc_a"] });
      const loop = async () => {
        if (detectedRef.current) return;
        const v = videoRef.current;
        if (!v) return;
        const cw = 640,
          ch = 220;
        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
          canvasRef.current.width = cw;
          canvasRef.current.height = ch;
        }
        const ctx = canvasRef.current.getContext("2d");
        ctx.drawImage(
          v,
          (v.videoWidth - cw) / 2,
          (v.videoHeight - ch) / 2,
          cw,
          ch,
          0,
          0,
          cw,
          ch
        );

        // フレーム差分ゲート
        try {
          const img = ctx.getImageData(0, 0, cw, ch).data;
          let sum = 0,
            step = 32;
          for (let i = 0; i < img.length; i += 4 * step) {
            sum += img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114;
          }
          const prev = prevHashRef.current;
          prevHashRef.current = sum;
          if (prev != null) {
            const diffRatio = Math.abs(sum - prev) / (prev + 1e-6);
            if (diffRatio < 0.003) {
              rafIdRef.current = requestAnimationFrame(loop);
              return;
            }
          }
        } catch {}

        try {
          const barcodes = await detector.detect(canvasRef.current);
          if (barcodes && barcodes[0]) {
            const val = toEan13(barcodes[0].rawValue);
            if (val) {
              detectedRef.current = true;
              stopAll();
              onDetected?.(val);
              onClose?.();
              return;
            }
          }
        } catch {}
        rafIdRef.current = requestAnimationFrame(loop);
      };
      rafIdRef.current = requestAnimationFrame(loop);
    } else {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      else try {
        readerRef.current.reset();
      } catch {}
      readerRef.current
        .decodeFromStream(stream, video, (result) => {
          if (!result || detectedRef.current) return;
          const val = toEan13(result.getText());
          if (!val) return;
          detectedRef.current = true;
          stopAll();
          onDetected?.(val);
          onClose?.();
        })
        .catch(() => {});
    }
  }, [onClose, onDetected, stopAll]);

  useEffect(() => {
    if (!open) {
      stopAll();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await start();
      } catch (e) {
        if (cancelled) return;
        setErrorMsg("カメラ起動失敗: " + (e?.message || e));
        stopAll();
      }
    })();
    return () => {
      cancelled = true;
      stopAll();
    };
  }, [open, start, stopAll]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle} onClick={(e) => tapToFocus(trackRef.current, e.currentTarget, e)}>
          <video
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            autoPlay
            muted
          />
          {/* ガイド枠 */}
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
        </div>
        <div style={footerStyle}>
          {errorMsg ? (
            <span style={{ color: "#ffb3b3" }}>{errorMsg}</span>
          ) : (
            <span>
              中央の枠にバーコードを合わせてください。
              読み取りができない場合は「再読込み」を押してください。
            </span>
          )}
          <button
            onClick={activateReread}
            style={{
              ...btnReload,
              background: rereadPressed ? "#fc0" : "#ff0",
              transition: "background 0.2s",
            }}
          >
            再読込み
          </button>
          <button onClick={() => { stopAll(); onClose?.(); }} style={btnCancel}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
