// src/components/BarcodeScanner.jsx
// iOS/Android/Mac Safari 安定版（連続スキャン／ユーザータップ開始）
// 依存: npm i @zxing/browser

import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatContinuousReader } from "@zxing/browser";

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

// ---- ヘルパ：video が安定再生できるまで待つ（Safari 黒画面対策）
const waitForCanPlay = (video, timeoutMs = 8000) =>
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
    const to = setTimeout(() => err(new Error("VIDEO_TIMEOUT")), timeoutMs);
    // 念のためメタデータ確認ループ（Safariで videoWidthが遅延するケース）
    const iv = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) ok();
    }, 250);
    const oldCleanup = cleanup;
    cleanup = () => { oldCleanup(); clearTimeout(to); clearInterval(iv); };
  });

// ---- 背面と思われるデバイスIDを推定
async function pickBackDeviceId() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const cams = devs.filter((d) => d.kind === "videoinput");
    if (!cams.length) return undefined;
    const lower = cams.map((d) => ({ id: d.deviceId, label: (d.label || "").toLowerCase() }));
    const back = lower.find((d) => /back|rear|environment|外側|環境/.test(d.label));
    return back?.id || cams[cams.length - 1]?.deviceId;
  } catch {
    return undefined;
  }
}

// ---- 背面狙いで MediaStream を取得（段階的フォールバック）
async function getBackStream() {
  // まず権限を取りにいく（Safariでlabel取得＆以後安定化）
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tmp.getTracks().forEach((t) => t.stop());
  } catch (e) {
    if (e?.name === "NotAllowedError") throw new Error("PERM_DENIED");
    if (e?.name === "NotFoundError") throw new Error("NO_CAMERA");
  }

  const constraintsBase = {
    audio: false,
    video: {
      // 低解像度から始めるとSafariで安定しやすい
      width: { ideal: 1280 },
      height: { ideal: 720 },
      // frameRate を下げると黒画面が減る機種あり
      frameRate: { ideal: 24, max: 30 },
    },
  };

  // 1) deviceId exact
  const backId = await pickBackDeviceId();
  if (backId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        ...constraintsBase,
        video: { ...constraintsBase.video, deviceId: { exact: backId } },
      });
    } catch { /* 次へ */ }
  }

  // 2) facingMode exact
  try {
    return await navigator.mediaDevices.getUserMedia({
      ...constraintsBase,
      video: { ...constraintsBase.video, facingMode: { exact: "environment" } },
    });
  } catch { /* 次へ */ }

  // 3) facingMode ideal
  try {
    return await navigator.mediaDevices.getUserMedia({
      ...constraintsBase,
      video: { ...constraintsBase.video, facingMode: { ideal: "environment" } },
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
  const [needsTapStart, setNeedsTapStart] = useState(true); // ← 初回は必ずタップ開始

  const stopAll = useCallback(() => {
    try { readerRef.current?.stopContinuousDecode?.(); } catch {}
    try { readerRef.current?.reset?.(); } catch {}
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      if (s) s.getTracks?.().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    } catch {}
    streamRef.current = null;
  }, []);

  const prepareStream = useCallback(async () => {
    // HTTPSチェック（localhostはOK）
    if (typeof window !== "undefined") {
      const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (window.location.protocol !== "https:" && !isLocal) {
        throw new Error("NEED_HTTPS");
      }
    }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("NO_GUM");

    const video = videoRef.current;
    if (!video) throw new Error("NO_VIDEO");

    // Safari 自動再生対策
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.autoplay = true;

    // ストリーム取得＆貼付け
    const stream = await getBackStream();
    streamRef.current = stream;
    video.srcObject = stream;

    // メタデータが乗るまで待機 → 再生
    await waitForCanPlay(video, 8000);
    try { await video.play(); } catch { /* gesture 待ち */ }

    // それでも 0px なら gesture を要求
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      throw new Error("NEED_GESTURE");
    }
  }, []);

  const startDecode = useCallback(async () => {
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatContinuousReader();
      // 読み取り負荷を下げて安定度UP
      readerRef.current.timeBetweenDecodingAttempts = 150;
    } else {
      try { readerRef.current.reset(); } catch {}
    }

    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) throw new Error("NO_VIDEO_OR_STREAM");

    // “自前で貼ったストリーム”から連続読み取り
    await readerRef.current.decodeFromStream(stream, video, (result, err) => {
      if (result) {
        const text = result.getText();
        stopAll();
        onDetected?.(text);
      }
      // err はスキャン中の通常エラーなので無視
    });
  }, [onDetected, stopAll]);

  // open に応じて開始/停止
  useEffect(() => {
    if (!open) {
      stopAll();
      return;
    }
    setErrorMsg("");
    // open時はまずgestureを要求 → ユーザーが「開始」押下で実起動
    setNeedsTapStart(true);
    return () => stopAll();
  }, [open, stopAll]);

  // タブ非表示/復帰で停止/再起動（Safari 安定化）
  useEffect(() => {
    const onVis = () => {
      if (!open) return;
      if (document.visibilityState === "hidden") {
        stopAll();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, stopAll]);

  const handleCancel = () => {
    stopAll();
    onClose?.();
  };

  const handleTapStart = async () => {
    setErrorMsg("");
    try {
      await prepareStream();   // ストリーム確保 & 再生
      await startDecode();     // 連続デコード開始
      setNeedsTapStart(false); // 以後は自動で回る
    } catch (e) {
      console.error(e);
      if (e?.message === "NEED_HTTPS") setErrorMsg("セキュアコンテキスト(HTTPS)が必須です。httpsでアクセスしてください。");
      else if (e?.message === "NO_GUM") setErrorMsg("このブラウザはカメラ取得に未対応です。別のブラウザをご利用ください。");
      else if (e?.message === "PERM_DENIED" || e?.name === "NotAllowedError") setErrorMsg("カメラの使用が拒否されています。ブラウザ/OS設定で許可してください。");
      else if (e?.message === "NO_CAMERA" || e?.name === "NotFoundError") setErrorMsg("カメラが見つかりません。別の端末でお試しください。");
      else if (e?.name === "OverconstrainedError") setErrorMsg("指定条件のカメラが見つかりません。別のブラウザ/端末でお試しください。");
      else if (e?.message === "VIDEO_TIMEOUT" || e?.message === "NEED_GESTURE") {
        // gesture不足の場合はタップ要求を継続
        setNeedsTapStart(true);
        if (!e?.message?.includes("NEED_GESTURE")) setErrorMsg("カメラ映像の初期化に時間がかかっています。再度「カメラを開始」を押してください。");
      } else setErrorMsg("カメラの起動に失敗しました。権限設定をご確認ください。");
      stopAll();
    }
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
          {/* ユーザータップ開始（常に初回表示） */}
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
