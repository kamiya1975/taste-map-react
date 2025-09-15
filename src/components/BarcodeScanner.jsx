// src/components/BarcodeScanner.jsx
// 依存: npm i @zxing/browser
import React, { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const OVERLAY_Z = 2147483647; // どのUIよりも最前面
const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: OVERLAY_Z,
  pointerEvents: "auto",
};

const panelStyle = {
  width: "min(720px, 94vw)",
  background: "#111",
  color: "#fff",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "0 16px 36px rgba(0,0,0,.65)",
  display: "flex",
  flexDirection: "column",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  borderBottom: "1px solid #222",
};

const videoBoxStyle = {
  position: "relative",
  background: "#000",
  width: "100%",
  aspectRatio: "16 / 10",
  overflow: "hidden",
};

const footerStyle = {
  display: "flex",
  gap: 8,
  padding: 12,
  borderTop: "1px solid #222",
  flexWrap: "wrap",
  alignItems: "center",
};

const btnStyle = {
  background: "#222",
  color: "#fff",
  border: "1px solid #333",
  borderRadius: 10,
  padding: "10px 16px",
  cursor: "pointer",
  fontWeight: 600,
};

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const codeReaderRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState("");

  const stopAll = useCallback(() => {
    try {
      codeReaderRef.current?.reset();
    } catch {}
    try {
      const s = streamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
  }, []);

  const startScanner = useCallback(async () => {
    setErrorMsg("");

    const video = videoRef.current;
    if (!video) return;

    // iOS/Android 共通の自動再生対策
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true; // モバイルは無音のみ自動再生可
    video.autoplay = true;

    // ZXing 準備
    if (!codeReaderRef.current) codeReaderRef.current = new BrowserMultiFormatReader();
    else codeReaderRef.current.reset();

    try {
      // 背面カメラを優先するヒント（Chrome/Android, iOS Safari）
      // decodeFromVideoDevice(null, ...) にするとZXing側に委譲できるが、
      // 確率を上げるため ideal: environment の MediaTrackConstraints を付与する。
      // ZXing APIでは直接constraintsを渡せないため、先に手動でgetUserMediaしてから video.srcObject に流し込む。
      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: "environment" }, // 背面優先（iOS/Android）
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      // まずストリームを確保
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      video.srcObject = stream;

      // 再生を明示的に試行（iOSで稀に必要）
      try { await video.play(); } catch {}

      // ZXingのデコードループを開始（デバイスID不要で videoElement 経由）
      // decodeFromVideoDevice を使うと内部で getUserMedia を取り直すので、
      // ここでは decodeFromVideoElement を使って今の stream をそのまま読ませる。
      await codeReaderRef.current.decodeFromVideoElement(
        video,
        (result, err) => {
          if (result) {
            const text = result.getText();
            stopAll();                 // 重複読み取り防止
            onDetected?.(text);
          }
          // err はデコード失敗（毎フレーム起こり得る）なので握りつぶす
        }
      );
    } catch (e) {
      console.error("Scanner start error:", e);
      let msg = "カメラの起動に失敗しました。";
      if (e?.name === "NotAllowedError") {
        msg = "カメラの使用が許可されていません。端末の設定で本サイトのカメラ許可を有効にしてください。";
      } else if (e?.name === "NotFoundError" || e?.message?.includes("Requested device not found")) {
        msg = "カメラが見つかりません。別の端末でお試しください。";
      } else if (e?.name === "OverconstrainedError") {
        msg = "指定のカメラ設定を満たせませんでした。別のブラウザ/端末でお試しください。";
      }
      setErrorMsg(msg);
      stopAll();
    }
  }, [onDetected, stopAll]);

  // 開閉に応じて起動/停止
  useEffect(() => {
    if (!open) {
      stopAll();
      return;
    }
    let cancelled = false;
    (async () => {
      if (!cancelled) await startScanner();
    })();
    return () => {
      cancelled = true;
      stopAll();
    };
  }, [open, startScanner, stopAll]);

  // タブ非表示/復帰で停止/再起動（iOS/Androidの安定化）
  useEffect(() => {
    const onVis = async () => {
      if (!open) return;
      if (document.visibilityState === "hidden") {
        stopAll();
      } else if (document.visibilityState === "visible") {
        await startScanner();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, startScanner, stopAll]);

  const handleCancel = () => {
    stopAll();
    onClose?.();
  };

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ fontWeight: 700 }}>バーコードをスキャン</div>
          {/* 要望に合わせ「キャンセル」のみ */}
          <button onClick={handleCancel} style={btnStyle}>キャンセル</button>
        </div>

        <div style={videoBoxStyle}>
          <video
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            playsInline
            muted
            autoPlay
          />
          {/* ガイド枠（中央を少し明るく） */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              boxShadow: "inset 0 0 0 3px rgba(255,255,255,.28)",
            }}
          />
        </div>

        <div style={footerStyle}>
          <div style={{ fontSize: 13, color: "#aaa" }}>
            カメラをバーコードに向けると自動で読み取ります。読み取り後は自動で閉じます。
          </div>
          {errorMsg && (
            <div style={{ color: "#ffb3b3", fontSize: 13 }}>{errorMsg}</div>
          )}
        </div>
      </div>
    </div>
  );
}
