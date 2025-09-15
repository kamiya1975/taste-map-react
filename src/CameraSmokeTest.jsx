import React, { useEffect, useRef, useState, useCallback } from "react";

const Z = 2147483647;

export default function CameraSmokeTest() {
  const vRef = useRef(null);
  const streamRef = useRef(null);
  const [hud, setHud] = useState("ready | 0x0");
  const [err, setErr] = useState("");
  const [started, setStarted] = useState(false);
  const [env, setEnv] = useState(true); // true=背面, false=前面
  const [useLoadNudge, setUseLoadNudge] = useState(false); // srcObject後にload()を呼ぶか

  const updateHud = useCallback(() => {
    const v = vRef.current;
    if (!v) return;
    setHud(
      `rs=${v.readyState} paused=${v.paused} ` +
      `W=${v.videoWidth} H=${v.videoHeight}`
    );
  }, []);

  const stop = useCallback(() => {
    try {
      const v = vRef.current;
      if (v) { v.pause?.(); v.srcObject = null; }
      const s = streamRef.current;
      s?.getTracks?.().forEach(t => t.stop());
    } catch {}
    streamRef.current = null;
    setStarted(false);
  }, []);

  const start = useCallback(async () => {
    setErr("");
    setStarted(true);

    try {
      const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");

      const constraints = env
        ? { video: { facingMode: { ideal: "environment" } }, audio: false }
        : { video: { facingMode: { ideal: "user" } }, audio: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const v = vRef.current;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.muted = true;
      v.autoplay = true;

      v.srcObject = stream;

      // iOS で描画が始まらない個体向けの "nudge"
      if (useLoadNudge && v.load) v.load();

      // 再生を何度か試みる
      let tries = 0;
      while (tries < 5 && v.paused) {
        try { await v.play(); } catch {}
        await new Promise(r => setTimeout(r, 250));
        tries++;
      }

      // 監視ループ
      const iv = setInterval(() => {
        updateHud();
      }, 250);
      v.__iv = iv;

      // 8秒待っても 0x0 ならタイムアウト表示
      setTimeout(() => {
        if (v.videoWidth === 0 || v.videoHeight === 0) setErr("VIDEO_TIMEOUT");
      }, 8000);
    } catch (e) {
      stop();
      setErr(`${e.name || "Error"}${e.message ? ": " + e.message : ""}`);
    } finally {
      updateHud();
    }
  }, [env, stop, updateHud, useLoadNudge]);

  useEffect(() => () => {
    const v = vRef.current;
    if (v?.__iv) clearInterval(v.__iv);
    stop();
  }, [stop]);

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
    >
      {/* HUD */}
      <div style={{ position: "absolute", top: 8, left: 8, right: 8, fontSize: 14, lineHeight: 1.4 }}>
        {hud}{err ? ` | ERROR: ${err}` : ""}
      </div>

      {/* 操作用ツールバー */}
      <div style={{
        position: "absolute", top: 40, left: 8, right: 8, display: "flex",
        gap: 8, flexWrap: "wrap", alignItems: "center"
      }}>
        {!started ? (
          <>
            <button onClick={start} style={btn}>START</button>
            <button onClick={() => setEnv(e => !e)} style={btnGhost}>
              カメラ切替（{env ? "→ 正面" : "→ 背面"}）
            </button>
            <label style={{display:"inline-flex",gap:6,alignItems:"center"}}>
              <input type="checkbox" checked={useLoadNudge}
                     onChange={e => setUseLoadNudge(e.target.checked)} />
              srcObject 後に load() を呼ぶ
            </label>
          </>
        ) : (
          <>
            <button onClick={async ()=>{ try { await vRef.current?.play(); } catch{}; updateHud(); }} style={btnGhost}>play() 再試行</button>
            <button onClick={()=>{
              const v=vRef.current; const s=streamRef.current;
              if (v && s){ v.srcObject=null; v.srcObject=s; if (useLoadNudge && v.load) v.load(); v.play().catch(()=>{}); updateHud(); }
            }} style={btnGhost}>srcObject 付け直し</button>
            <button onClick={start} style={btnGhost}>再取得（同じ向き）</button>
            <button onClick={stop} style={btn}>STOP</button>
          </>
        )}
      </div>

      {/* VIDEO */}
      <video
        ref={vRef}
        style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
        autoPlay playsInline muted
        onLoadedMetadata={updateHud}
        onPlaying={updateHud}
      />
    </div>
  );
}

const btn = {
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 700,
  background: "#fff",
  color: "#000",
  border: "none",
  borderRadius: 10,
};
const btnGhost = {
  ...btn,
  background: "transparent",
  color: "#fff",
  border: "1px solid #fff",
};
