import React, { useRef, useState } from "react";

export default function CameraSmokeTest() {
  const videoRef = useRef(null);
  const [error, setError] = useState("");

  // カメラ開始
  const startCamera = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" }, // 背面優先
        },
        audio: false,
      });
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute("playsinline", ""); // iOS 必須
        video.setAttribute("webkit-playsinline", ""); // iOS Safari用
        video.muted = true; // 自動再生許可
        await video.play().catch((err) => {
          console.error("video.play() failed", err);
          setError("video.play() failed: " + err.message);
        });
      }
    } catch (err) {
      console.error("getUserMedia error", err);
      setError("getUserMedia error: " + err.message);
    }
  };

  // カメラ停止
  const stopCamera = () => {
    const video = videoRef.current;
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Camera Smoke Test</h2>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "#000",
        }}
      />
      <div style={{ marginTop: "1rem" }}>
        <button onClick={startCamera}>Start</button>
        <button onClick={stopCamera}>Stop</button>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
