// src/CameraSmokeTest.jsx  ←この名前で置き換えOK
import React, { useEffect, useRef, useState } from "react";

function waitForReady(video, ms = 6000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const ok = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const fail = (e) => { if (!done) { done = true; cleanup(); reject(e || new Error("VIDEO_TIMEOUT")); } };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", ok);
      video.removeEventListener("canplay", ok);
      video.removeEventListener("error", fail);
      clearInterval(tick);
    };
    const deadline = Date.now() + ms;
    const tick = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) ok();
      else if (Date.now() > deadline) fail(new Error("VIDEO_TIMEOUT"));
    }, 150);
    video.addEventListener("loadedmetadata", ok, { once: true });
    video.addEventListener("canplay", ok, { once: true });
    video.addEventListener("error", fail, { once: true });
  });
}

export default function CameraSmokeTest() {
  const hostRef  = useRef(null);     // video を入れ替える枠
  const videoRef = useRef(null);
  const [front, setFront] = useState(false);
  const [log, setLog] = useState("ready | 0x0");
  const [err, setErr] = useState("");

  const newVideoEl = () => {
    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.autoplay = true;
    v.muted = true;
    v.playsInline = true;
    Object.assign(v.style, {
      width: "100%", height: "100%", objectFit: "cover",
      backgroundColor: "#000", display: "block",
    });
    return v;
  };

  const attach = (el) => {
    if (!hostRef.current) return;
    hostRef.current.innerHTML = "";
    hostRef.current.appendChild(el);
    videoRef.current = el;
  };

  const stop = () => {
    try {
      const v = videoRef.current;
      const s = v?.srcObject;
      if (s) s.getTracks().forEach(t => t.stop());
      if (v) { v.srcObject = null; v.removeAttribute("src"); }
    } catch {}
  };

  const updateHUD = () => {
    const v = videoRef.current;
    const track = v?.srcObject?.getVideoTracks?.()[0];
    const st = track?.readyState ?? "-";
    const en = String(track?.enabled ?? "-");
    setLog(`rs=${v?.readyState ?? "-"} paused=${String(!!v?.paused)} W=${v?.videoWidth ?? 0} H=${v?.videoHeight ?? 0} | track=${st}/${en}`);
  };

  // ---- 起動シーケンス（段階的フォールバック）
  const start = async () => {
    setErr(""); stop();

    // video を新規生成して DOM に先に挿す（←iOSで重要）
    const vid = newVideoEl();
    attach(vid);

    // 1) 素朴に getUserMedia → srcObject
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: front ? { exact: "user" } : { ideal: "environment" } },
      });
    } catch (e) {
      setErr(`${e.name}: ${e.message || ""}`);
      updateHUD();
      return;
    }

    try {
      vid.srcObject = stream;

      // 2) まず通常ルート
      await waitForReady(vid, 6000);
      await vid.play().catch(() => {});
      updateHUD();
      if (vid.videoWidth > 0) return; // 映った

      // 3) だめなら srcObject 付け直し＋ load() 併用（iOS黒画面対策）
      vid.pause();
      const s = vid.srcObject;
      vid.srcObject = null;
      vid.removeAttribute("src");
      // 一呼吸おく
      await new Promise(r => setTimeout(r, 50));
      vid.srcObject = s;
      vid.load();               // ← これが効く個体がある
      await waitForReady(vid, 6000);
      await vid.play().catch(() => {});
      updateHUD();
      if (vid.videoWidth > 0) return;

      // 4) さらに video 要素を作り直して再アタッチ（別個体で効く）
      const v2 = newVideoEl();
      attach(v2);
      v2.srcObject = s;
      // load() 先呼び → play()（順序が効くことがある）
      v2.load();
      await waitForReady(v2, 6000);
      await v2.play().catch(() => {});
      updateHUD();
      if (v2.videoWidth > 0) return;

      setErr("VIDEO_TIMEOUT: 映像が描画されませんでした");
    } catch (e) {
      setErr(`${e.name || "Error"}: ${e.message || ""}`);
      updateHUD();
    }
  };

  useEffect(() => {
    // 初期表示（黒画面なら START を押す）
    updateHUD();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{width:"100vw",height:"100vh",background:"#000",color:"#fff"}}>
      <div style={{position:"absolute",top:8,left:12,fontFamily:"monospace",fontSize:16}}>{log}{err ? ` | ERROR: ${err}` : ""}</div>
      {/* ここに <video> を差し込む */}
      <div ref={hostRef} style={{width:"100%",height:"100%"}} />

      {/* コントロール */}
      <div style={{position:"absolute",bottom:18,left:0,right:0,display:"flex",gap:12,justifyContent:"center"}}>
        <button onClick={start} style={btn}>START</button>
        <button onClick={() => { setFront(p=>!p); setTimeout(start,0); }} style={btn}>
          カメラ切替（{front ? "→ 背面" : "→ 前面"}）
        </button>
        <button onClick={() => { stop(); setTimeout(start,0); }} style={btnGhost}>再取得（同じ向き）</button>
        <button onClick={() => { stop(); updateHUD(); }} style={btnGhost}>STOP</button>
      </div>
    </div>
  );
}

const btn = {
  background:"#fff", color:"#000", border:"none", padding:"10px 14px",
  borderRadius:12, fontWeight:700, cursor:"pointer"
};
const btnGhost = { ...btn, background:"transparent", color:"#fff", border:"1px solid #fff" };
