import React, { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const reader = new BrowserMultiFormatReader();
    codeReaderRef.current = reader;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (videoRef.current) videoRef.current.srcObject = stream;

        await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (res, err) => {
            if (res?.getText) {
              const text = res.getText();
              onDetected?.(text);
              onClose?.();
            }
          }
        );
      } catch (e) {
        alert("カメラを起動できませんでした。権限を確認してください。");
        onClose?.();
      }
    })();

    return () => {
      try { codeReaderRef.current?.reset(); } catch {}
      const tracks = videoRef.current?.srcObject?.getTracks?.() || [];
      tracks.forEach((t) => t.stop());
    };
  }, [open, onDetected, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.75)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
      onClick={onClose}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: "90vw", maxWidth: 420, borderRadius: 12, background: "#000" }}
      />
      <button
        onClick={(e) => { e.stopPropagation(); onClose?.(); }}
        style={{
          position: "fixed", top: 16, right: 16,
          background: "#fff", border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px"
        }}
      >
        閉じる
      </button>
    </div>
  );
}
