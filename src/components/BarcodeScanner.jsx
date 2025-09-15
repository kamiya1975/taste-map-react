// src/components/BarcodeScanner.jsx
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

const btn = {
  background: "#fff",
  color: "#000",
  border: "none",
  padding: "12px 24px",
  fontSize: "16px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const readerRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [needsTapStart, setNeedsTapStart] = useState(false);

  const stopAll = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch {}
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      if (s) s.getTracks?.().forEach(t => t.stop());
      if (v) v.srcObject = null;
    } catch {}
    streamRef.current = null;
    setNeedsTapStart(false);
  }, []);

  const pickBackDeviceId = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const cams = devs.filter(d => d.kind === "videoinput");
      if (!cams.length) return undefined;
      const l = cams.map(d => ({ id: d.deviceId, label: (d.label || "").toLowerCase() }));
      const back = l.find(d => /back|rear|environment|外側|環境/.test(d.label));
      return back?.id || cams[cams.length - 1]?.deviceId;
    } catch {
      return undefined;
    }
  };

  const getBackStream = async () => {
    // 1) deviceId exact（背面“のみ”）→ 2) facingMode exact → 3) facingMode ideal
    // 端末差異を吸収しつつ、できるだけ背面固定に近づける
    // ▼ まず permission を確実に得る（ラベル取得のため）
    try { 
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      tmp.getTracks().forEach(t => t.stop());
    } catch (e) {
      if (e?.name === "NotAllowedError")
        throw new Error("PERM_DENIED");
      if (e?.name === "NotFoundError")
        throw new Error("NO_CAMERA");
      // 続行（次の取得でリトライ）
    }

    // deviceId exact
    const backId = await pickBackDeviceId();
    if (backId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: backId } },
        });
      } catch { /* 次へ */ }
    }

    // facingMode exact
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { exact: "environment" } },
      });
    } catch { /* 次へ */ }

    // facingMode ideal
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
    } catch (e) {
      if (e?.name === "NotAllowedError") throw new Error("PERM_DENIED");
      if (e?.name === "NotFoundError") throw new Error("NO_CAMERA");
      throw e;
    }
  };

  const startScanner = useCallback(async () => {
    setErrorMsg("");

    // HTTPSチェック（localhost はOK）
    if (typeof window !== "undefined") {
      const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (window.location.protocol !== "https:" && !isLocal) {
        setErrorMsg("セキュアコンテキスト(HTTPS)が必須です。httpsでアクセスしてください。");
        return;
      }
    }

    const video = videoRef.current;
    if (!video) return;

    // 自動再生対策（iOS）
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;     // 無音のみ自動再生可
    video.autoplay = true;

    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    else readerRef.current.reset();

    try {
      // ① 背面ストリームをこちらで取得して video に直張り
      const stream = await getBackStream();
      streamRef.current = stream;
      video.srcObject = stream;

      // ② 明示 play（iOSで重要）
      try {
        await video.play();
      } catch {
        // “user gesture 必須”な環境用：タップで開始
        setNeedsTapStart(true);
        return;
      }

      // ③ ZXing を videoElement に対して開始（連続デコード）
      await readerRef.current.decodeFromVideoElement(video, (result, err) => {
        if (result) {
          const text = result.getText();
          stopAll();
          onDetected?.(text);
        }
        // err はフレームごとの失敗。握りつぶしでOK。
      });
    } catch (e) {
      console.error("camera start error:", e);
      if (e?.message === "PERM_DENIED") {
        setErrorMsg("カメラの使用が拒否されています。端末設定で本サイトのカメラを許可してください。");
      } else if (e?.message === "NO_CAMERA") {
        setErrorMsg("カメラが見つかりません。別の端末でお試しください。");
      } else if (e?.name === "OverconstrainedError") {
        setErrorMsg("カメラ条件を満たせませんでした。別のブラウザ/端末でお試しください。");
      } else {
        setErrorMsg("カメラの起動に失敗しました。ブラウザの権限設定をご確認ください。");
      }
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
    (async () => { if (!cancelled) await startScanner(); })();
    return () => { cancelled = true; stopAll(); };
  }, [open, startScanner, stopAll]);

  // タブ非表示/復帰で停止/再起動
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

  const handleTapStart = async () => {
    // iOS の「ユーザー操作が必要」ケースを解除
    try { await videoRef.current?.play(); } catch {}
    setNeedsTapStart(false);
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
          {/* タップ開始フォールバック（必要時のみ表示） */}
          {needsTapStart && (
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.35)"
            }}>
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