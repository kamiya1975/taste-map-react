// src/components/BarcodeScanner.jsx
// iOS/Android/Mac Safari 対応版
// ・背面カメラ“のみ”狙い（deviceId exact → facingMode exact → ideal）
// ・getUserMedia を明示取得して video.srcObject に張る（Safari向けに最も安定）
// ・loadedmetadata/canplay を待ってから play()（iOS/Mac Safari 黒画面対策）
// ・videoWidth=0 の場合は自動フォールバック＆最後はユーザータップで開始
// ・UIは「キャンセル」のみ、起動直後から自動スキャン開始
// 依存: @zxing/browser → 未導入なら `npm i @zxing/browser`

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

// ---- ヘルパ：video が再生できるまで待つ（Safari黒画面対策）
const waitForCanPlay = (video, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    let done = false;
    const ok = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const err = (e) => { if (!done) { done = true; cleanup(); reject(e); } };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", ok);
      video.removeEventListener("canplay", ok);
      video.removeEventListener("error", err);
    };
    video.addEventListener("loadedmetadata", ok, { once: true });
    video.addEventListener("canplay", ok, { once: true });
    video.addEventListener("error", err, { once: true });
    setTimeout(() => err(new Error("VIDEO_TIMEOUT")), timeoutMs);
  });

// ---- 背面と思われるデバイスIDを推定
async function pickBackDeviceId() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const cams = devs.filter((d) => d.kind === "videoinput");
    if (!cams.length) return undefined;
    const lower = cams.map((d) => ({ id: d.deviceId, label: (d.label || "").toLowerCase() }));
    const back = lower.find((d) => /back|rear|environment|外側|環境/.test(d.label));
    return back?.id || cams[cams.length - 1]?.deviceId; // 最後尾が背面のことが多い
  } catch {
    return undefined;
  }
}

// ---- 背面“のみ”狙いで MediaStream を取得（段階的フォールバック）
async function getBackStream() {
  // 一度 permission を取る（iOSで label を得るためにも有効）
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tmp.getTracks().forEach((t) => t.stop());
  } catch (e) {
    if (e?.name === "NotAllowedError") throw new Error("PERM_DENIED");
    if (e?.name === "NotFoundError") throw new Error("NO_CAMERA");
    // その他は次で再挑戦
  }

  // 1) deviceId exact
  const backId = await pickBackDeviceId();
  if (backId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: backId } },
      });
    } catch { /* 次へ */ }
  }

  // 2) facingMode exact
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { exact: "environment" } },
    });
  } catch { /* 次へ */ }

  // 3) facingMode ideal
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
}

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
      if (s) s.getTracks?.().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    } catch {}
    streamRef.current = null;
    setNeedsTapStart(false);
  }, []);

  const startScanner = useCallback(async () => {
    setErrorMsg("");

    // HTTPSチェック（localhostはOK）
    if (typeof window !== "undefined") {
      const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (window.location.protocol !== "https:" && !isLocal) {
        setErrorMsg("セキュアコンテキスト(HTTPS)が必須です。httpsでアクセスしてください。");
        return;
      }
    }

    const video = videoRef.current;
    if (!video) return;

    // iOS/Safari 自動再生対策
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.autoplay = true;

    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    else readerRef.current.reset();

    try {
      // ① 背面ストリームを取得して video に直張り
      const stream = await getBackStream();
      streamRef.current = stream;
      video.srcObject = stream;

      // ② canplay を待ってから play（ここで失敗→ユーザータップ）
      try {
        await waitForCanPlay(video, 3000);
      } catch {
        try { await video.play(); } catch {
          setNeedsTapStart(true);
          return;
        }
      }
      try { await video.play(); } catch { /* 無視 */ }

      // ③ videoWidth/Height が 0 なら更に取り直し
      if (!video.videoWidth || !video.videoHeight) {
        // exact environment で再トライ
        try {
          const alt = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { exact: "environment" } },
          });
          try { stream.getTracks().forEach((t) => t.stop()); } catch {}
          streamRef.current = alt;
          video.srcObject = alt;
          await waitForCanPlay(video, 3000);
          try { await video.play(); } catch {}
        } catch {
          // ideal で再トライ
          const alt2 = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" } },
          });
          try { stream.getTracks().forEach((t) => t.stop()); } catch {}
          streamRef.current = alt2;
          video.srcObject = alt2;
          await waitForCanPlay(video, 3000);
          try { await video.play(); } catch {}
        }
      }

      // ④ それでも 0px ならユーザータップで開始
      if (!video.videoWidth || !video.videoHeight) {
        setNeedsTapStart(true);
        return;
      }

      // ⑤ ZXing を videoElement に対して開始（連続デコード）
      await readerRef.current.decodeFromVideoElement(video, (result) => {
        if (result) {
          const text = result.getText();
          stopAll();
          onDetected?.(text);
        }
        // エラーは毎フレーム起こり得るので握りつぶしでOK
      });
    } catch (e) {
      console.error("camera start error:", e);
      if (e?.message === "PERM_DENIED" || e?.name === "NotAllowedError") {
        setErrorMsg("カメラの使用が拒否されています。ブラウザ/OSの設定でこのサイトのカメラを許可してください。");
      } else if (e?.message === "NO_CAMERA" || e?.name === "NotFoundError") {
        setErrorMsg("カメラが見つかりません。別の端末でお試しください。");
      } else if (e?.name === "OverconstrainedError") {
        setErrorMsg("カメラ条件を満たせませんでした。別のブラウザ/端末でお試しください。");
      } else if (e?.message === "VIDEO_TIMEOUT") {
        setErrorMsg("カメラ映像の初期化に時間がかかっています。いったん閉じて再度お試しください。");
      } else {
        setErrorMsg("カメラの起動に失敗しました。権限設定をご確認ください。");
      }
      stopAll();
    }
  }, [onDetected, stopAll]);

  // open に応じて開始/停止
  useEffect(() => {
    if (!open) {
      stopAll();
      return;
    }
    let cancelled = false;
    (async () => { if (!cancelled) await startScanner(); })();
    return () => { cancelled = true; stopAll(); };
  }, [open, startScanner, stopAll]);

  // タブ非表示/復帰で停止/再起動（iOS/Safari 安定化）
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
          {/* ユーザータップ開始フォールバック（必要時のみ） */}
          {needsTapStart && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.35)",
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
