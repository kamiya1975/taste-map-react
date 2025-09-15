// src/components/BarcodeScanner.jsx
// iOS/Android/Mac Safari 安定版（手動 getUserMedia → decodeFromStream）
// 依存: npm i @zxing/browser
// 使い方: <BarcodeScanner open={open} onClose={()=>setOpen(false)} onDetected={(text)=>...} />

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

const btnGhost = {
  ...btn,
  background: "transparent",
  color: "#fff",
  border: "1px solid #fff",
};

// ---- video が再生可能になるのを待つ（Safari 黒画面対策）
const waitForCanPlay = (video, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const done = (ok = true, err) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadedmetadata", onOK);
      video.removeEventListener("canplay", onOK);
      video.removeEventListener("error", onErr);
      clearTimeout(to);
      clearInterval(iv);
      ok ? resolve() : reject(err);
    };
    const onOK = () => done(true);
    const onErr = (e) => done(false, e);
    // 仕様上 loadedmetadata/canplay が来なくても videoWidth が立つケースがある
    const iv = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) done(true);
    }, 250);
    const to = setTimeout(() => done(false, new Error("VIDEO_TIMEOUT")), timeoutMs);

    video.addEventListener("loadedmetadata", onOK, { once: true });
    video.addEventListener("canplay", onOK, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });

// ---- 背面っぽい deviceId を推定
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

// ---- 明示的に getUserMedia でストリームを取る（段階フォールバック）
async function getStream({ preferFront = false } = {}) {
  // 低め解像度＋fps で安定度を上げる（発熱/電池消費も抑える）
  const base = {
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 24, max: 30 },
      // iOS Safari で黒画面になる個体対策として aspectRatio を緩く
      aspectRatio: { ideal: 1.777, max: 3 },
    },
  };

  // 向きの優先（通常は背面、トラブったら正面に切替）
  const wantEnv = !preferFront;

  // 1) deviceId exact（背面推定できた場合）
  if (wantEnv) {
    const backId = await pickBackDeviceId();
    if (backId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          ...base,
          video: { ...base.video, deviceId: { exact: backId } },
        });
      } catch { /* 次へ */ }
    }
  }

  // 2) facingMode exact
  try {
    return await navigator.mediaDevices.getUserMedia({
      ...base,
      video: { ...base.video, facingMode: { exact: wantEnv ? "environment" : "user" } },
    });
  } catch { /* 次へ */ }

  // 3) facingMode ideal
  return await navigator.mediaDevices.getUserMedia({
    ...base,
    video: { ...base.video, facingMode: { ideal: wantEnv ? "environment" : "user" } },
  });
}

// ---- HTTPS 必須（localhost 例外）
function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const readerRef = useRef(null);

  const [errorMsg, setErrorMsg] = useState("");
  const [needsTapStart, setNeedsTapStart] = useState(true); // 初回は必ずタップ
  const [preferFront, setPreferFront] = useState(false); // フロント/背面 切替

  const stopAll = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch {}
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      if (s) s.getTracks?.().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    } catch {}
    streamRef.current = null;
  }, []);

  const startCameraAndDecode = useCallback(async () => {
    setErrorMsg("");
    assertHTTPS();

    const video = videoRef.current;
    if (!video) throw new Error("NO_VIDEO");

    // Safari 自動再生条件
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.muted = true;
    video.autoplay = true;

    // ① 自前で getUserMedia
    const stream = await getStream({ preferFront });
    streamRef.current = stream;
    video.srcObject = stream;

    // ② 映像が来るのを待ってから play
    await waitForCanPlay(video, 9000);
    try { await video.play(); } catch {} // この時点では user gesture 済み

    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    else try { readerRef.current.reset(); } catch {}

    // ③ ZXing 連続読取（自前 video/stream を渡す）
    await readerRef.current.decodeFromStream(stream, video, (result, err) => {
      if (result) {
        const text = result.getText();
        stopAll();
        onDetected?.(text);
      }
      // err は読み取り過程で通常発生するため無視
    });

    setNeedsTapStart(false);
  }, [onDetected, preferFront, stopAll]);

  const handleTapStart = useCallback(async () => {
    try {
      await startCameraAndDecode();
    } catch (e) {
      console.error("[camera start error]", e);
      const name = e?.name || "Error";
      const msg = e?.message ? `: ${e.message}` : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErrorMsg("カメラが『拒否』になっています。iOSの「設定 > Safari > カメラ」を『許可』にしてください。");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setErrorMsg("指定のカメラが見つかりません。『別カメラで試す』を押して正面/背面を切り替えてください。");
      } else if (name === "NotReadableError") {
        setErrorMsg("他のアプリがカメラを使用中の可能性があります。全て終了してから再試行してください。");
      } else if (name === "AbortError") {
        setErrorMsg("カメラ初期化が中断されました。もう一度お試しください。");
      } else if (name === "NEED_HTTPS") {
        setErrorMsg("セキュアコンテキスト(HTTPS)が必須です。https でアクセスしてください。");
      } else if (name === "Error" && e?.message === "VIDEO_TIMEOUT") {
        setErrorMsg("映像の初期化に時間がかかっています。再度『カメラを開始』を押してください。");
      } else {
        setErrorMsg(`カメラの起動に失敗しました（${name}${msg}）。権限設定をご確認ください。`);
      }
      stopAll();
      setNeedsTapStart(true);
    }
  }, [startCameraAndDecode, stopAll]);

  // open のオン/オフで開始/停止
  useEffect(() => {
    if (!open) {
      stopAll();
      return;
    }
    setErrorMsg("");
    setNeedsTapStart(true);
    return () => stopAll();
  }, [open, stopAll]);

  // タブ非表示で止める（復帰時は再タップ要求）
  useEffect(() => {
    const onVis = () => {
      if (!open) return;
      if (document.visibilityState === "hidden") {
        stopAll();
        setNeedsTapStart(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, stopAll]);

  const handleCancel = () => {
    stopAll();
    onClose?.();
  };

  // デバッグHUD（映像が来てるか即確認できる）
  const v = videoRef.current;
  const hud = v
    ? `state=${v.readyState} ${v.videoWidth}x${v.videoHeight}`
    : "state=- 0x0";

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle}>
          <video
            ref={videoRef}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              backgroundColor: "black",
            }}
            // これらの属性は Safari で重要
            playsInline
            muted
            autoPlay
          />

          {/* 画面中央のガイド枠 */}
          <div
            style={{
              position: "absolute",
              top: "18%",
              left: "10%",
              width: "80%",
              height: "64%",
              border: "3px solid rgba(255,255,255,0.85)",
              borderRadius: 12,
              pointerEvents: "none",
            }}
          />

          {/* 初回/失敗時のタップ開始オーバーレイ */}
          {needsTapStart && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.35)",
                gap: 12,
                flexDirection: "column",
              }}
            >
              <button style={btn} onClick={handleTapStart}>カメラを開始</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={btnGhost}
                  onClick={() => {
                    setPreferFront((p) => !p);
                    setTimeout(() => handleTapStart(), 0);
                  }}
                >
                  別カメラで試す（{preferFront ? "背面に戻す" : "正面に切替"}）
                </button>
                <button style={btnGhost} onClick={handleTapStart}>再試行</button>
              </div>
            </div>
          )}

          {/* 右上デバッグHUD（小さく表示） */}
          <div
            style={{
              position: "absolute",
              right: 8,
              top: 8,
              background: "rgba(0,0,0,0.5)",
              color: "#fff",
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 8,
            }}
          >
            {hud}
          </div>
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
