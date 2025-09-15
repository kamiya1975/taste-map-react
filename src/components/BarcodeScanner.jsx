// src/components/BarcodeScanner.jsx
// iOS/Android/Mac Safari 安定版（自前 getUserMedia → video.srcObject → decodeFromStream）
// 依存: npm i @zxing/browser

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
const panelStyle = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle = { flex: 1, position: "relative", background: "#000", overflow: "hidden" };
const footerStyle = {
  padding: 16, borderTop: "1px solid #222", textAlign: "center", color: "#ddd",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap",
};
const btn = { background: "#fff", color: "#000", border: "none", padding: "12px 24px", fontSize: "16px", borderRadius: 10, cursor: "pointer", fontWeight: 700 };
const btnGhost = { ...btn, background: "transparent", color: "#fff", border: "1px solid #fff" };

// ---- video が再生可能になるのを待つ
async function waitForVideoReady(video, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  // loadedmetadata が来ない個体があるのでポーリング併用
  return new Promise((resolve, reject) => {
    let done = false;
    const ok = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const err = (e) => { if (!done) { done = true; cleanup(); reject(e); } };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", ok);
      video.removeEventListener("canplay", ok);
      video.removeEventListener("error", err);
      clearInterval(iv);
    };
    const iv = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) ok();
      else if (Date.now() > deadline) err(new Error("VIDEO_TIMEOUT"));
    }, 200);
    video.addEventListener("loadedmetadata", ok, { once: true });
    video.addEventListener("canplay", ok, { once: true });
    video.addEventListener("error", err, { once: true });
  });
}

// ---- 背面デバイスを推定
async function pickBackDeviceId() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const cams = devs.filter((d) => d.kind === "videoinput");
    if (!cams.length) return undefined;
    const lower = cams.map((d) => ({ id: d.deviceId, label: (d.label || "").toLowerCase() }));
    const back = lower.find((d) => /back|rear|environment|外側|環境/.test(d.label));
    return back?.id || cams[cams.length - 1]?.deviceId;
  } catch { return undefined; }
}

// ---- ストリーム取得（まず超シンプルな制約で）
async function getStream({ preferFront = false } = {}) {
  const wantEnv = !preferFront;

  // 1) deviceId exact
  if (wantEnv) {
    const id = await pickBackDeviceId();
    if (id) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: id } },
        });
      } catch {}
    }
  }
  // 2) facingMode exact → 3) ideal
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { exact: wantEnv ? "environment" : "user" } },
    });
  } catch {}
  return await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: wantEnv ? "environment" : "user" } },
  });
}

// ---- HTTPS 必須（localhostは例外）
function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const readerRef = useRef(null);

  const [errorMsg, setErrorMsg] = useState("");
  const [needsTapStart, setNeedsTapStart] = useState(true);
  const [preferFront, setPreferFront] = useState(false);

  const stopAll = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch {}
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      if (s) s.getTracks?.().forEach((t) => t.stop());
      if (v) { v.pause?.(); v.srcObject = null; }
    } catch {}
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setErrorMsg("");
    assertHTTPS();

    const video = videoRef.current;
    if (!video) throw new Error("NO_VIDEO");

    // Safari 必須プロパティ（属性だけでなくプロパティも立てる）
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.muted = true;
    video.autoplay = true;

    // ① getUserMedia（制約は極力シンプル）
    const stream = await getStream({ preferFront });
    streamRef.current = stream;

    // ② srcObject を貼る（⚠️ load() は呼ばない！）
    video.srcObject = stream;

    // ③ メタデータ＆描画準備を待つ → play
    await waitForVideoReady(video, 9000);
    try { await video.play(); } catch {}

    if (!(video.videoWidth > 0 && video.videoHeight > 0)) {
      throw new Error("VIDEO_DIM_ZERO");
    }

    // ④ ZXing で連続読取
    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    else try { readerRef.current.reset(); } catch {}

    await readerRef.current.decodeFromStream(stream, video, (result, err) => {
      if (result) {
        const text = result.getText();
        stopAll();
        onDetected?.(text);
      }
    });

    setNeedsTapStart(false);
  }, [onDetected, preferFront, stopAll]);

  const handleTapStart = useCallback(async () => {
    try {
      await start();
    } catch (e) {
      console.error("[camera start error]", e);
      const name = e?.name || "Error";
      const msg = e?.message ? `: ${e.message}` : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErrorMsg("カメラが『拒否』になっています。iOSの「設定 > Safari > カメラ」を『許可』にしてください。");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setErrorMsg("指定のカメラが見つかりません。『別カメラで試す』で正面/背面を切り替えてください。");
      } else if (name === "NotReadableError") {
        setErrorMsg("他のアプリがカメラを使用中の可能性があります。全て終了してから再試行してください。");
      } else if (name === "AbortError") {
        setErrorMsg("カメラ初期化が中断されました。もう一度お試しください。");
      } else if (name === "NEED_HTTPS") {
        setErrorMsg("セキュアコンテキスト(HTTPS)が必須です。https でアクセスしてください。");
      } else if (name === "VIDEO_TIMEOUT" || name === "VIDEO_DIM_ZERO") {
        setErrorMsg("映像の初期化に時間がかかっています。『再試行』または『別カメラで試す』を押してください。");
      } else {
        setErrorMsg(`カメラの起動に失敗しました（${name}${msg}）。`);
      }
      stopAll();
      setNeedsTapStart(true);
    }
  }, [start, stopAll]);

  // open のオン/オフで開始/停止
  useEffect(() => {
    if (!open) { stopAll(); return; }
    setErrorMsg(""); setNeedsTapStart(true);
    return () => stopAll();
  }, [open, stopAll]);

  // タブ非表示で止める（復帰時は再タップ）
  useEffect(() => {
    const onVis = () => {
      if (!open) return;
      if (document.visibilityState === "hidden") { stopAll(); setNeedsTapStart(true); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, stopAll]);

  const handleCancel = () => { stopAll(); onClose?.(); };

  const v = videoRef.current;
  const hud = v ? `state=${v.readyState} ${v.videoWidth}x${v.videoHeight}` : "state=- 0x0";

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle}>
          <video
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover", backgroundColor: "black" }}
            autoPlay
            playsInline
            muted
          />
          {/* ガイド枠 */}
          <div
            style={{ position: "absolute", top: "18%", left: "10%", width: "80%", height: "64%", border: "3px solid rgba(255,255,255,0.85)", borderRadius: 12, pointerEvents: "none" }}
          />
          {/* タップ開始オーバーレイ */}
          {needsTapStart && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", gap: 12, flexDirection: "column" }}>
              <button style={btn} onClick={handleTapStart}>カメラを開始</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnGhost} onClick={() => { setPreferFront(p => !p); setTimeout(() => handleTapStart(), 0); }}>
                  別カメラで試す（{preferFront ? "背面に戻す" : "正面に切替"}）
                </button>
                <button style={btnGhost} onClick={handleTapStart}>再試行</button>
              </div>
            </div>
          )}
          {/* HUD */}
          <div style={{ position: "absolute", right: 8, top: 8, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "4px 8px", borderRadius: 8 }}>{hud}</div>
        </div>
        <div style={footerStyle}>
          {errorMsg ? <span style={{ color: "#ffb3b3" }}>{errorMsg}</span> : <span>バーコードにかざすと自動で読み取ります（読み取り後は自動で閉じます）。</span>}
          <button onClick={handleCancel} style={btn}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
