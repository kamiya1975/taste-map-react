// src/components/BarcodeScanner.jsx
// 完全コピペで置き換え/新規追加してください。
// 依存: @zxing/browser
//   インストール未済なら: npm i @zxing/browser
//
// 主な改善点:
// - iOS Safari 対応 (playsInline, muted, user-gesture 再生対策)
// - 背面カメラ優先選択 + カメラ切替
// - トーチ(ライト)ON/OFF (対応端末のみ)
// - 画面非表示/タブ切替時に一時停止、戻ったら再開
// - 閉じる時は MediaStream/ZXing を必ず停止・解放
// - エラーハンドリングとユーザ向け案内

import React, { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle = {
  width: "min(680px, 92vw)",
  background: "#111",
  color: "#fff",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "0 12px 28px rgba(0,0,0,.5)",
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
};

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const codeReaderRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const stopStream = useCallback(() => {
    try {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    } catch {}
    try {
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
      }
    } catch {}
    streamRef.current = null;
  }, []);

  const pickBackCamera = useCallback((list) => {
    if (!Array.isArray(list) || list.length === 0) return null;
    // "back", "rear" などを優先。なければ最後(背面であることが多い)
    const lower = list.map((d) => ({
      id: d.deviceId,
      label: (d.label || "").toLowerCase(),
    }));
    const back = lower.find((d) => /back|rear|環境|外側/.test(d.label));
    return back?.id || list[list.length - 1].deviceId;
  }, []);

  const applyTorch = useCallback(async (on) => {
    try {
      const s = streamRef.current;
      if (!s) return false;
      const track = s.getVideoTracks?.()[0];
      if (!track) return false;
      const caps = track.getCapabilities?.();
      if (!caps || !caps.torch) return false;
      await track.applyConstraints({ advanced: [{ torch: !!on }] });
      setTorchOn(!!on);
      return true;
    } catch {
      return false;
    }
  }, []);

  const startScanner = useCallback(async (targetDeviceId = null) => {
    setErrorMsg("");

    // iOS Safari 再生対策
    const video = videoRef.current;
    if (!video) return;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.autoplay = true;

    // ZXing 準備
    if (!codeReaderRef.current) {
      codeReaderRef.current = new BrowserMultiFormatReader();
    } else {
      codeReaderRef.current.reset();
    }

    try {
      // デバイス列挙
      const cams = await BrowserMultiFormatReader.listVideoInputDevices();
      setDevices(cams);
      const chosen = targetDeviceId || pickBackCamera(cams) || cams[0]?.deviceId;
      setDeviceId(chosen || null);

      // ZXing の decodeFromVideoDevice は内部で getUserMedia を呼ぶ
      const controls = await codeReaderRef.current.decodeFromVideoDevice(
        chosen,
        video,
        (result, err) => {
          if (result) {
            const text = result.getText();
            // 重複読み取り抑制: 即時停止
            stopStream();
            onDetected?.(text);
          }
        }
      );

      // decodeFromVideoDevice の戻り値から MediaStream を取得できないため、
      // video.srcObject から参照を保持しておく
      const s = video.srcObject;
      if (s instanceof MediaStream) {
        streamRef.current = s;
      }

      // iOS で稀に play が同期されないことがあるので明示的に呼ぶ
      try { await video.play(); } catch {}

      return () => {
        try { controls?.stop(); } catch {}
      };
    } catch (e) {
      console.error("Scanner start error:", e);
      let msg = "カメラの起動に失敗しました。";
      if (e && e.name === "NotAllowedError") {
        msg = "カメラの使用が許可されていません。設定で本サイトのカメラ許可を有効にしてください。";
      } else if (e && e.name === "NotFoundError") {
        msg = "カメラが見つかりません。別の端末でお試しください。";
      }
      setErrorMsg(msg);
      stopStream();
    }
  }, [onDetected, pickBackCamera, stopStream]);

  // 開閉に応じて起動/停止
  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }
    let cleanup = null;
    (async () => {
      cleanup = await startScanner();
    })();
    return () => {
      try { cleanup?.(); } catch {}
      stopStream();
    };
  }, [open, startScanner, stopStream]);

  // タブ非表示/復帰で停止/再開 (iOSのバックグラウンド挙動対策)
  useEffect(() => {
    const onVis = async () => {
      if (!open) return;
      if (document.visibilityState === "hidden") {
        stopStream();
      } else if (document.visibilityState === "visible") {
        await startScanner(deviceId);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, deviceId, startScanner, stopStream]);

  const handleClose = () => {
    stopStream();
    onClose?.();
  };

  const handleSwitchCamera = async () => {
    if (!devices.length) return;
    const idx = devices.findIndex((d) => d.deviceId === deviceId);
    const next = devices[(idx + 1) % devices.length]?.deviceId;
    setDeviceId(next);
    await startScanner(next);
  };

  const handleTorchToggle = async () => {
    const ok = await applyTorch(!torchOn);
    if (!ok) {
      alert("この端末/ブラウザはライト制御に対応していません。");
    }
  };

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ fontWeight: 700 }}>バーコードをスキャン</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSwitchCamera} style={btnStyle}>カメラ切替</button>
            <button onClick={handleTorchToggle} style={btnStyle}>{torchOn ? "ライトOFF" : "ライトON"}</button>
            <button onClick={handleClose} style={btnStyle}>閉じる</button>
          </div>
        </div>
        <div style={videoBoxStyle}>
          <video
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            playsInline
            muted
            autoPlay
          />
          {/* 簡易ガイド枠 */}
          <div style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            boxShadow: "inset 0 0 0 3px rgba(255,255,255,.25)",
          }}/>
        </div>
        <div style={footerStyle}>
          <div style={{ fontSize: 13, color: "#aaa" }}>
            JANコードが読み取れない場合は、照明を明るくし、枠内でバーコードを水平に合わせてください。
          </div>
          {errorMsg && (
            <div style={{ color: "#ffb3b3", fontSize: 13 }}>{errorMsg}</div>
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  background: "#222",
  color: "#fff",
  border: "1px solid #333",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
};
