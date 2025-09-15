import React, { useEffect, useRef, useState, useCallback } from "react";

const Z = 2147483647;

export default function CameraSmokeTest() {
  const vRef = useRef(null);
  const [log, setLog] = useState("ready");
  const [dim, setDim] = useState("0x0");
  const [started, setStarted] = useState(false);
  const [err, setErr] = useState("");

  const start = useCallback(async () => {
    if (started) return;
    setStarted(true);
    setErr("");
    setLog("requesting...");

    try {
      // HTTPSチェック（localhostはOK）
      const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (window.location.protocol !== "https:" && !isLocal) {
        throw new Error("NEED_HTTPS");
      }

      const v = vRef.current;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.muted = true;
      v.autoplay = true;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      // デバッグ: トラック情報
      setLog(
        `track="${track?.label || "-"}" state=${track?.readyState}/${track?.enabled}`
      );

      v.srcObject = stream;

      // メタデータ待ち
      await new Promise((resolve) => {
        const onMeta = () => resolve();
        v.addEventListener("loadedmetadata", onMeta, { once: true });
      });

      await v.play().catch(() => {});

      // 画面サイズを監視
      const iv = setInterval(() => {
        const w = v.videoWidth | 0;
        const h = v.videoHeight | 0;
        setDim(`${w}x${h}`);
      }, 250);
      // 終了時に止める
      v.__smokeIv = iv;

      // 何も表示されない場合のタイムアウト
      setTimeout(() => {
        if (v.videoWidth === 0 && v.videoHeight === 0) {
          setErr("VIDEO_TIMEOUT");
        }
      }, 8000);
    } catch (e) {
      const name = e?.name || "Error";
      const msg = e?.message || "";
      setErr(name === "NEED_HTTPS" ? "NEED_HTTPS" : `${name}${msg ? ": " + msg : ""}`);
      setStarted(false);
    }
  }, [started]);

  useEffect(() => {
    return () => {
      const v = vRef.current;
      try {
        if (v?.__smokeIv) clearInterval(v.__smokeIv);
        const s = v?.srcObject;
        s?.getTracks?.().forEach((t) => t.stop());
        if (v) v.srcObject = null;
      } catch {}
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        color: "#fff",
        zIndex: Z,
        display: "flex",
        flexDirection: "column",
      }}
      // 画面どこでも1回タップで開始
      onClick={() => !started && start()}
    >
      {/* HUD */}
      <div style={{ position: "absolute", top: 8, left: 8, fontSize: 14 }}>
        {log} | {dim}{err ? ` | ERROR: ${err}` : ""}
      </div>

      {/* ビデオ */}
      <video
        ref={vRef}
        style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
        autoPlay
        playsInline
        muted
      />

      {/* 中央の開始ボタン（前面・大きく） */}
      {!started && (
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
          <button
            onClick={(e) => { e.stopPropagation(); start(); }}
            style={{
              padding: "14px 32px",
              fontSize: 20,
              fontWeight: 800,
              background: "#fff",
              color: "#000",
              border: "none",
              borderRadius: 12,
              boxShadow: "0 6px 16px rgba(0,0,0,.3)",
            }}
          >
            START
          </button>
        </div>
      )}
    </div>
  );
}
