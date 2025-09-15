// CameraSmokePWA.jsx
import React, { useRef, useState } from "react";

const WAIT_MS = 9000;

function waitForVideoReady(video, timeout = WAIT_MS) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    let done = false;
    const ok = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const err = (e) => { if (!done) { done = true; cleanup(); reject(e); } };

    const onCanPlay = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) ok();
    };

    // rAF で readyState / 寸法をポーリング（iOS PWA 向け）
    const tick = () => {
      if (done) return;
      if ((video.readyState ?? 0) >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return ok();
      if (Date.now() > deadline) return err(new Error("VIDEO_TIMEOUT"));
      requestAnimationFrame(tick);
    };

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onCanPlay);
      video.removeEventListener("canplay", onCanPlay);
    };

    video.addEventListener("loadedmetadata", onCanPlay, { once: true });
    video.addEventListener("canplay", onCanPlay, { once: true });
    tick();
  });
}

async function getStream({ preferFront }) {
  // できるだけ単純な制約から
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { exact: preferFront ? "user" : "environment" } },
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: preferFront ? "user" : "environment" } },
    });
  }
}

export default function CameraSmokePWA() {
  const vRef = useRef(null);
  const streamRef = useRef(null);
  const [log, setLog] = useState("");
  const [preferFront, setPreferFront] = useState(true);

  const stop = () => {
    try { vRef.current?.pause?.(); } catch {}
    try {
      const s = streamRef.current || vRef.current?.srcObject;
      s?.getTracks?.().forEach(t => t.stop());
    } catch {}
    if (vRef.current) vRef.current.srcObject = null;
    streamRef.current = null;
  };

  const start = async () => {
    setLog("starting...");
    stop();

    const video = vRef.current;
    if (!video) return;

    // iOS Safari / PWA 必須フラグ（srcObject 代入前に設定）
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;

    // 1) 取得
    const stream = await getStream({ preferFront });
    streamRef.current = stream;

    // 2) アタッチ → 再生
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* ユーザー操作後に再試行するので無視 */ }

    // 3) 準備待ち
    try {
      await waitForVideoReady(video);
    } catch (e) {
      // ---- iOS PWA ワークアラウンド：一度デタッチして再アタッチ
      try {
        video.pause();
        video.srcObject = null;
        await new Promise(r => setTimeout(r, 100));
        video.srcObject = stream;
        try { await video.play(); } catch {}
        await waitForVideoReady(video, 4000);
      } catch (ee) {
        stop();
        throw ee;
      }
    }

    const t = stream.getVideoTracks?.()[0];
    setLog(`OK rs=${video.readyState} W=${video.videoWidth} H=${video.videoHeight} | track=${t?.readyState}/${t?.enabled}`);
  };

  const handleStart = async () => {
    try {
      await start();
    } catch (e) {
      setLog(`Error: ${e?.name || ""}${e?.message ? `: ${e.message}` : ""}`);
    }
  };

  const handleRetrySame = async () => {
    try {
      await start();
    } catch (e) {
      // それでもダメなら向きを切替
      setPreferFront(p => !p);
      setTimeout(handleStart, 50);
    }
  };

  return (
    <div style={{ padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif" }}>
      <h1>Camera Smoke Test</h1>
      <div style={{ width: "100%", maxWidth: 700, aspectRatio: "16/9", background: "#000", marginBottom: 12 }}>
        <video
          ref={vRef}
          style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          playsInline
          muted
          autoPlay
        />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={handleStart}>Start</button>
        <button onClick={stop}>Stop</button>
        <button onClick={() => { setPreferFront(p => !p); handleStart(); }}>
          カメラ切替（→ {preferFront ? "背面" : "前面"}）
        </button>
        <button onClick={handleRetrySame}>再取得（同じ向き）</button>
      </div>

      <div style={{ fontFamily: "Menlo, Consolas, monospace", whiteSpace: "pre-wrap", color: /Error/.test(log) ? "crimson" : "#555" }}>
        {log}
      </div>

      <div style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
        PWA で映らない場合: <br />
        1) <b>設定 → Safari → カメラ → 許可</b> にする（確認ではなく）。<br />
        2) Safari で当該サイトを開き、<b>aA → Web サイトの設定 → カメラ = 許可</b> を明示。<br />
        3) <b>設定 → Safari → 詳細 → Webサイトデータ</b> で該当ドメインを削除 → PWA を再インストール。<br />
        4) 低電力モード/OLED 常時表示の解除、スクリーンタイムでの制限OFFも確認。<br />
      </div>
    </div>
  );
}
