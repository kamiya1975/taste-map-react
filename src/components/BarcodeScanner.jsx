// src/components/BarcodeScanner.jsx
// 安定版: 自前 getUserMedia → <video>.srcObject → @zxing/browser
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
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

/* ========== ユーティリティ ========== */

// video が再生可能になるのを待つ（loadedmetadata 来ない個体対策でポーリング）
async function waitForVideoReady(video, timeoutMs = 9000) {
  const deadline = Date.now() + timeoutMs;
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

// 背面デバイス推定（ラベルに back/外側 等があればそれを採用）
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

// ストリーム取得（背面固定・横長優先）
async function getBackStream() {
  // 1) deviceId exact（一番確実）
  const id = await pickBackDeviceId();
  if (id) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: id },
          // 横長に寄せるヒント（無視されてもOK）
          aspectRatio: { ideal: 16 / 9 },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch { /* fallthrough */ }
  }
  // 2) facingMode exact → 3) ideal
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { exact: "environment" },
        aspectRatio: { ideal: 16 / 9 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch { /* fallthrough */ }
  return await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      aspectRatio: { ideal: 16 / 9 },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
}

// HTTPS 必須（localhost は例外）
function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}

// 可能なら AF/AE/WB を連続に（未対応は握り潰す）
async function tuneTrack(track) {
  try {
    const caps = track.getCapabilities?.() || {};
    const advanced = [];
    if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
      advanced.push({ focusMode: "continuous" });
    }
    if (caps.exposureMode && Array.isArray(caps.exposureMode) && caps.exposureMode.includes("continuous")) {
      advanced.push({ exposureMode: "continuous" });
    }
    if (caps.whiteBalanceMode && Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes("continuous")) {
      advanced.push({ whiteBalanceMode: "continuous" });
    }
    // 端末によっては zoom を少し入れるとピントが合いやすいことがある
    // if (caps.zoom) advanced.push({ zoom: Math.min(caps.zoom.max, Math.max(caps.zoom.min, (caps.zoom.min + caps.zoom.max) / 2)) });
    if (advanced.length) await track.applyConstraints({ advanced });
  } catch {
    /* ignore */
  }
}

/* ========== コンポーネント本体 ========== */

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const readerRef = useRef(null);

  const [errorMsg, setErrorMsg] = useState("");

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

    // Safari 必須プロパティ
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.muted = true; // モバイルの自動再生対策
    video.autoplay = true;

    // ① 背面カメラ取得（横長ヒント付き）
    const stream = await getBackStream();
    streamRef.current = stream;

    // ② srcObject セット（load() は呼ばない）
    video.srcObject = stream;

    // ③ メタデータ待ち → play
    await waitForVideoReady(video, 9000);
    try { await video.play(); } catch {}

    // ④ 可能なら AF/AE/WB を連続に
    const track = stream.getVideoTracks?.()[0];
    if (track) await tuneTrack(track);

    if (!(video.videoWidth > 0 && video.videoHeight > 0)) {
      throw new Error("VIDEO_DIM_ZERO");
    }

    // ⑤ ZXing 連続読取
    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    else try { readerRef.current.reset(); } catch {}

    await readerRef.current.decodeFromStream(stream, video, (result) => {
      if (result) {
        const text = result.getText();
        stopAll();
        onDetected?.(text);
      }
    });
  }, [onDetected, stopAll]);

  // open のオン/オフで開始/停止（→ 開いたら即起動）
  useEffect(() => {
    if (!open) { stopAll(); return; }
    let cancelled = false;
    (async () => {
      try {
        await start();
      } catch (e) {
        if (cancelled) return;
        console.error("[camera start error]", e);
        const name = e?.name || "Error";
        const msg = e?.message ? `: ${e.message}` : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setErrorMsg("カメラが『拒否』になっています。iOSの「設定 > Safari > カメラ」を『許可』にしてください。");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setErrorMsg("背面カメラが見つかりません。端末の再起動またはブラウザ変更をお試しください。");
        } else if (name === "NotReadableError") {
          setErrorMsg("他のアプリがカメラを使用中の可能性があります。全て終了してから再試行してください。");
        } else if (name === "AbortError") {
          setErrorMsg("カメラ初期化が中断されました。もう一度お試しください。");
        } else if (name === "NEED_HTTPS") {
          setErrorMsg("セキュアコンテキスト(HTTPS)が必須です。https でアクセスしてください。");
        } else if (name === "VIDEO_TIMEOUT" || name === "VIDEO_DIM_ZERO") {
          setErrorMsg("映像の初期化に時間がかかっています。ページの再読み込みをお試しください。");
        } else {
          setErrorMsg(`カメラの起動に失敗しました（${name}${msg}）。`);
        }
        stopAll();
      }
    })();
    return () => { cancelled = true; stopAll(); };
  }, [open, start, stopAll]);

  // タブ非表示で止める（復帰時は再起動）
  useEffect(() => {
    const onVis = () => {
      if (!open) return;
      if (document.visibilityState === "hidden") { stopAll(); }
      if (document.visibilityState === "visible") {
        // 復帰したら再起動（エラーは上のハンドラで表示）
        start().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, start, stopAll]);

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
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",       // 画面いっぱい
              backgroundColor: "black",
            }}
            autoPlay
            playsInline
            muted
          />
          {/* 横長ガイド枠（バーコード向け 3:1） */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "45%",
              transform: "translate(-50%, -50%)",
              width: "88%",
              aspectRatio: "3 / 1",     // 横長
              border: "3px solid rgba(255,255,255,0.9)",
              borderRadius: 10,
              pointerEvents: "none",
              boxShadow: "0 0 0 200vmax rgba(0,0,0,0.25) inset", // 周囲をうっすら暗く
            }}
          />
          {/* HUD */}
          <div style={{ position: "absolute", right: 8, top: 8, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "4px 8px", borderRadius: 8 }}>
            {hud}
          </div>
        </div>

        <div style={footerStyle}>
          <span style={{ color: errorMsg ? "#ffb3b3" : "#ddd" }}>
            {errorMsg || "バーコードにかざすと自動で読み取ります（読み取り後は自動で閉じます）。"}
          </span>
          <button
            onClick={handleCancel}
            style={{
              background: "#fff",
              color: "#000",
              border: "none",
              padding: "12px 24px",
              fontSize: "16px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
