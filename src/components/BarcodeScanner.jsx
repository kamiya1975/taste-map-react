// src/components/BarcodeScanner.jsx
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

// UPC-Aを0埋めしてEAN13に変換、チェックサム確認
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
  if (s.length === 12) s = "0" + s;
  if (s.length !== 13) return null;
  return isValidEan13(s) ? s : null;
}

const REREAD_LS_KEY = "tm_reread_until";

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const readerRef = useRef(null);
  const rafIdRef = useRef(0);
  const detectedRef = useRef(false);
  const rereadUntilRef = useRef(0);

  const [errorMsg, setErrorMsg] = useState("");
  const [usingDetector, setUsingDetector] = useState(false);
  const [rereadPressed, setRereadPressed] = useState(false);

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

  const activateReread = useCallback(() => {
    const until = Date.now() + 5000; // 5秒間再読込み許可
    rereadUntilRef.current = until;
    try {
      sessionStorage.setItem(REREAD_LS_KEY, String(until));
    } catch {}
    setRereadPressed(true);
    setTimeout(() => setRereadPressed(false), 180);
  }, []);

  const start = useCallback(async () => {
    setErrorMsg("");
    detectedRef.current = false;
    assertHTTPS();

    // カメラ起動
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

    const canUseDetector = hasBarcodeDetector();
    setUsingDetector(!!canUseDetector);

    if (canUseDetector) {
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "upc_a"],
      });
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
        <div style={videoBoxStyle}>
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
              読み取りができない場合は下の「再読込み」ボタンを押してください。
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
