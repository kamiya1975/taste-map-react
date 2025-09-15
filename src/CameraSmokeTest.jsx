// src/CameraSmokeTest.jsx
import React, { useEffect, useRef, useState } from "react";

export default function CameraSmokeTest() {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch((err) => console.log("play() error:", err));
      }
    } catch (err) {
      setError(err.message);
      console.error("Camera error:", err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, []);

  return (
    <div style={{ background: "black", width: "100%", height: "100vh" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {error && (
        <div style={{ color: "red", position: "absolute", top: 10, left: 10 }}>
          ERROR: {error}
        </div>
      )}
      <button
        onClick={startCamera}
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "10px 20px",
        }}
      >
        START
      </button>
    </div>
  );
}
