import { useEffect, useRef, useState } from "react";

export default function CameraSmokeTiny() {
  const vRef = useRef(null);
  const [msg, setMsg] = useState("");
  const [preferFront, setPreferFront] = useState(true);
  const [tick, setTick] = useState(0);
  const [stream, setStream] = useState(null);

  useEffect(() => {
    const id = requestAnimationFrame(function raf(){
      setTick(t => t + 1);
      requestAnimationFrame(raf);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const hud =
    (() => {
      const v = vRef.current;
      const rs = v?.readyState ?? "-";
      const tr = stream?.getVideoTracks?.()[0];
      return `rs=${rs} paused=${!!v?.paused} W=${v?.videoWidth||0} H=${v?.videoHeight||0} | track=${tr?.readyState||"-"}/${tr?.enabled??"-"}`;
    })();

  const waitForVideo = (video, timeout = 8000) => new Promise((res, rej) => {
    const deadline = Date.now() + timeout;
    const ok = () => { cleanup(); res(); };
    const err = (e) => { cleanup(); rej(e); };
    const iv = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) ok();
      else if (Date.now() > deadline) err(new Error("VIDEO_TIMEOUT"));
    }, 120);
    const cleanup = () => {
      clearInterval(iv);
      video.removeEventListener("loadedmetadata", ok);
      video.removeEventListener("canplay", ok);
      video.removeEventListener("error", err);
    };
    video.addEventListener("loadedmetadata", ok, { once:true });
    video.addEventListener("canplay", ok, { once:true });
    video.addEventListener("error", err, { once:true });
  });

  const stop = () => {
    try { stream?.getTracks?.().forEach(t => t.stop()); } catch {}
    try { const v = vRef.current; v?.pause?.(); if (v) v.srcObject = null; } catch {}
    setStream(null);
  };

  const start = async () => {
    setMsg("");
    stop();
    const v = vRef.current;
    try {
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.setAttribute("autoplay", "");
      v.muted = true; v.playsInline = true;

      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: preferFront ? "user" : "environment" },
      });
      setStream(s);
      v.srcObject = s;

      await waitForVideo(v, 9000);
      try { await v.play(); } catch (e) { console.warn("play() err:", e); }
      if (!(v.videoWidth > 0 && v.videoHeight > 0)) throw new Error("VIDEO_DIM_ZERO");
    } catch (e) {
      console.error(e);
      setMsg(`${e.name || "Error"}: ${e.message || e.toString()}`);
      stop();
    }
  };

  useEffect(() => () => stop(), []); // unmount で停止
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div style={{maxWidth:720, margin:"0 auto", padding:12}}>
      <h1 style={{textAlign:"center"}}>Camera Smoke Test</h1>
      <video
        ref={vRef}
        style={{width:"100%", aspectRatio:"4 / 3", background:"#000", display:"block"}}
        autoPlay playsInline muted
      />
      <div style={{marginTop:8, color:"#666"}}>{hud} | tick={tick}</div>
      <div style={{display:"flex", gap:8, justifyContent:"center", marginTop:12, flexWrap:"wrap"}}>
        <button onClick={start}>Start</button>
        <button onClick={stop}>Stop</button>
        <button onClick={() => { setPreferFront(p=>!p); start(); }}>
          カメラ切替（→ {preferFront ? "背面" : "前面"}）
        </button>
      </div>
      <div style={{color:"#c00", marginTop:12, minHeight:"1.5em"}}>{msg}</div>
    </div>
  );
}
