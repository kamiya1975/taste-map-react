// src/components/BarcodeScanner.jsx
// iOS/Android/Mac Safari 安定版（連続スキャン／ユーザータップ開始）
// 依存: npm i @zxing/browser

import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const OVERLAY_Z = 2147483647;

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: OVERLAY_Z,
  pointerEvents: "auto",
};
const panelStyle = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle = { flex: 1, position: "relative", background: "#000", overflow: "hidden" };
const footerStyle = {
  padding: 16, borderTop: "1px solid #222", textAlign: "center", color: "#ddd",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap",
};
const btn = {
  background: "#fff", color: "#000", border: "none", padding: "12px 24px",
  fontSize: "16px", borderRadius: 10, cursor: "pointer", fontWeight: 700,
};

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [needsTapStart, setNeedsTapStart] = useState(true); // 初回は必ずタップ開始

  const stopAll = useCallback(() => {
    try { readerRef.current?.reset(); } catch {}
    if (videoRef.current) {
      const s = videoRef.current.srcObject;
      if (s) s.getTracks?.().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const startDecode = useCallback(async () => {
    if (!videoRef.current) return;

    // Safari 自動再生対策
    const video = videoRef.current;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.autoplay = true;

    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    } else {
      try { readerRef.current.reset(); } catch {}
    }

    try {
      // 端末の背面カメラを狙う
      await readerRef.current.decodeFromVideoDevice(
        { facingMode: { ideal: "environment" } },
        video,
        (result, err) => {
          if (result) {
            const text = result.getText();
            stopAll();
            onDetected?.(text);
          }
          // エラーは握りつぶしでOK（読み取り中は常に発生する）
        }
      );
      setNeedsTapStart(false);
    } catch (e) {
      console.error("camera start error:", e);
      setErrorMsg("カメラの起動に失敗しました。権限設定をご確認ください。");
      stopAll();
    }
  }, [onDetected, stopAll]);

  // open に応じて開始/停止
  useEffect(() => {
    if (!open) {
      stopAll();
      return;
    }
    setErrorMsg("");
    setNeedsTapStart(true);
    return () => stopAll();
  }, [open, stopAll]);

  const handleCancel = () => {
    stopAll();
    onClose?.();
  };

  const handleTapStart = async () => {
    await startDecode();
  };

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle}>
          <video
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            playsInline
            muted
            autoPlay
          />
          {/* ガイド枠 */}
          <div
            style={{
              position: "absolute", top: "18%", left: "10%", width: "80%", height: "64%",
              border: "3px solid rgba(255,255,255,0.8)", borderRadius: 12, pointerEvents: "none",
            }}
          />
          {/* ユーザータップ開始 */}
          {needsTapStart && (
            <div
              style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)",
              }}
            >
              <button style={btn} onClick={handleTapStart}>カメラを開始</button>
            </div>
          )}
        </div>
        <div style={footerStyle}>
          {errorMsg ? (
            <span style={{ color: "#ffb3b3" }}>{errorMsg}</span>
          ) : (
            <span>バーコードにかざすと自動で読み取ります（読み取り後は自動で閉じます）。</span>
          )}
          <button onClick={handleCancel} style={btn}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
