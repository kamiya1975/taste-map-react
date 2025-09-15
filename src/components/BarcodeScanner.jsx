// src/components/BarcodeScanner.jsx
// iOS & Android 両対応 / 背面カメラ優先固定 / カメラは最前面レイヤー / 起動直後からスキャン / UIは「キャンセル」のみ
// 依存: @zxing/browser → 未導入なら `npm i @zxing/browser`

import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const OVERLAY_Z = 2147483647;

// スタイル定義
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
};
const footerStyle = {
  padding: 16,
  borderTop: "1px solid #222",
  textAlign: "center",
  color: "#ddd",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  flexWrap: "wrap",
};
const btnStyle = {
  background: "#fff",
  color: "#000",
  border: "none",
  padding: "12px 24px",
  fontSize: "16px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};

// video の準備を待つ（iOS Safari の黒画面対策）
const waitForCanPlay = (video, timeoutMs = 2500) =>
  new Promise((resolve, reject) => {
    let done = false;
    const onOk = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const onErr = (e) => { if (!done) { done = true; cleanup(); reject(e); } };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onOk);
      video.removeEventListener("canplay", onOk);
      video.removeEventListener("error", onErr);
    };
    video.addEventListener("loadedmetadata", onOk, { once: true });
    video.addEventListener("canplay", onOk, { once: true });
    video.addEventListener("error", onErr, { once: true });
    setTimeout(() => onErr(new Error("VIDEO_TIMEOUT")), timeoutMs);
  });

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const stopHandleRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState("");

  // スキャナ停止処理
  const stopScanner = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch {}
    try {
      const v = videoRef.current;
      const s = v?.srcObject;
      if (s) {
        s.getTracks?.().forEach((t) => t.stop());
        v.srcObject = null;
      }
    } catch {}
    try { stopHandleRef.current?.stop?.(); } catch {}
    stopHandleRef.current = null;
  }, []);

  // スキャナ開始処理
  const startScanner = useCallback(async () => {
    setErrorMsg("");

    // HTTPS チェック
    if (typeof window !== "undefined") {
      const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (window.location.protocol !== "https:" && !isLocal) {
        setErrorMsg("セキュアコンテキスト(HTTPS)が必須です。httpsでアクセスしてください。");
        return;
      }
    }

    const video = videoRef.current;
    if (!video) return;

    // iOS Safari の自動再生対策
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.autoplay = true;

    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    else readerRef.current.reset();

    // ZXing 用制約（背面カメラ優先）
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      // ZXing: constraints 指定で decode
      const controls = await readerRef.current.decodeFromConstraints(
        constraints,
        video,
        (result) => {
          if (result) {
            const text = result.getText();
            stopScanner();
            onDetected?.(text);
          }
        }
      );
      stopHandleRef.current = controls;

      // canplay を待ってから再生
      try { await waitForCanPlay(video, 2500); } catch {}
      try { await video.play(); } catch {}

      // video が 0px のままなら再フォールバック
      if (!video.videoWidth || !video.videoHeight) {
        throw new Error("VIDEO_TIMEOUT");
      }
    } catch (e) {
      console.error("camera start error:", e);
      let msg = "カメラの起動に失敗しました。";
      if (e?.name === "NotAllowedError") msg = "カメラの使用が拒否されています。端末の設定をご確認ください。";
      else if (e?.name === "NotFoundError") msg = "カメラが見つかりません。";
      else if (e?.name === "OverconstrainedError") msg = "カメラ条件を満たせませんでした。";
      else if (e?.message === "VIDEO_TIMEOUT") msg = "カメラ映像が表示されませんでした。いったん閉じて再度お試しください。";
      setErrorMsg(msg);
      stopScanner();
    }
  }, [onDetected, stopScanner]);

  // open の切り替えに応じて開始/停止
  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }
    let cancelled = false;
    (async () => { if (!cancelled) await startScanner(); })();
    return () => { cancelled = true; stopScanner(); };
  }, [open, startScanner, stopScanner]);

  // タブ非表示/復帰で停止/再起動
  useEffect(() => {
    const onVis = async () => {
      if (!open) return;
      if (document.visibilityState === "hidden") {
        stopScanner();
      } else if (document.visibilityState === "visible") {
        await startScanner();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, startScanner, stopScanner]);

  const handleCancel = () => {
    stopScanner();
    onClose?.();
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
              position: "absolute",
              top: "18%",
              left: "10%",
              width: "80%",
              height: "64%",
              border: "3px solid rgba(255,255,255,0.8)",
              borderRadius: 12,
              pointerEvents: "none",
            }}
          />
        </div>
        <div style={footerStyle}>
          {errorMsg ? (
            <span style={{ color: "#ffb3b3" }}>{errorMsg}</span>
          ) : (
            <span>バーコードにかざすと自動で読み取ります（読み取り後は自動で閉じます）。</span>
          )}
          <button onClick={handleCancel} style={btnStyle}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
