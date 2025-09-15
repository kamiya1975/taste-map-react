// CameraSmokeTest.jsx
import { useRef, useState } from "react";

export default function CameraSmokeTest() {
  const vRef = useRef(null);
  const [log, setLog] = useState("ready");

  const start = async () => {
    setLog("requesting...");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      vRef.current.srcObject = s;
      vRef.current.playsInline = true;
      vRef.current.muted = true;
      await vRef.current.play();
      setLog(
        `OK width=${vRef.current.videoWidth} height=${vRef.current.videoHeight} ` +
        `track=${s.getVideoTracks()[0]?.readyState}/${s.getVideoTracks()[0]?.enabled}`
      );
    } catch (e) {
      setLog(`ERROR ${e.name}: ${e.message || ""}`);
    }
  };

  return (
    <div style={{padding:16}}>
      <button onClick={start}>Start</button>
      <div style={{marginTop:8}}>{log}</div>
      <video ref={vRef} style={{width:"100%",maxWidth:360,background:"#000"}} />
    </div>
  );
}
