// src/components/BarcodeScanner.jsx
// iOS & Android 双方対応 / 常に最前面レイヤー / 即スキャン開始 / UIは「キャンセル」のみ
// 依存: @zxing/browser  →  未導入なら:  npm i @zxing/browser
// 既存の BarcodeScanner をこのファイルで“完全置き換え”してください。

import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

// ────────────────────────────────────────────────────────────────
// 最前面に固定（親の transform 等の影響を受けにくい超高 z-index）
// ────────────────────────────────────────────────────────────────
const OVERLAY_Z = 2147483647;
const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: OVERLAY_Z,
  pointerEvents: "auto",
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
  justifyContent: "center",
  gap: 12,
  flexWrap: "wrap",
};

const btnStyle = {
  background: "#fff",
  color: "#000",
  border: "none",
  padding: "12px 24px",
  fontSize: "16px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};

export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const stopHandleRef = useRef(null); // ZXing 側の stop 参照
  const [errorMsg, setErrorMsg] = useState("");

  const stopScanner = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch {}
    try {
      const v = videoRef.current;
      const s = v?.srcObject;
      if (s) {
        s.getTracks?.().forEach((t) => t.stop());
        v.srcObject = null;
      }
    } catch {}
    try { stopHandleRef.current?.stop?.(); } catch {}
    stopHandleRef.current = null;
  }, []);

  // 主要因と思われるポイント：
  // 1) HTTPS でないとモバイルは getUserMedia が拒否される（localhost はOK）
  // 2) iOS Safari は user-gesture 後でも自動再生まわりで不安定 → playsInline/muted/autoplay/明示的 play()
  // 3) デバイス列挙の前に権限が必要な環境がある → constraints 指定で decodeFromConstraints を優先
  // 4) OverconstrainedError などは制約を緩めて再試行
  // 5) 最後の手段として decodeFromVideoDevice(null, …) でブラウザ任せ

  const startScanner = useCallback(async () => {
    setErrorMsg("");

    // (1) HTTPS チェック
    if (typeof window !== "undefined") {
      const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (window.location.protocol !== "https:" && !isLocalhost) {
        setErrorMsg("セキュアコンテキスト(HTTPS)が必須です。httpsでアクセスしてください。");
        return;
      }
    }

    const video = videoRef.current;
    if (!video) return;

    // (2) iOS/Android 自動再生対策
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.autoplay = true;

    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    else readerRef.current.reset();

    // 先に getUserMedia で権限を確実に取りに行く（iOS 安定化）
    // 背面カメラをなるべく選ぶ
    const constraintsPref = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      // ① まず一度だけストリームを取得して permission を確立
      const preStream = await navigator.mediaDevices.getUserMedia(constraintsPref);
      // 即座に停止（以降は ZXing に任せる）
      preStream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      console.error("pre-permission getUserMedia error:", e);
      if (e?.name === "NotAllowedError") {
        setErrorMsg("カメラの使用が拒否されています。端末の設定で本サイトのカメラを許可してください（Safari: 設定 > Safari > カメラ）。");
        return;
      }
      if (e?.name === "NotFoundError") {
        setErrorMsg("カメラが見つかりません。別の端末でお試しください。");
        return;
      }
      // それ以外は後段の ZXing 側で再挑戦
    }

    // ② ZXing: constraints を直接渡す（最も安定）
    try {
      const controls = await readerRef.current.decodeFromConstraints(
        constraintsPref,
        video,
        (result, err) => {
          if (result) {
            const text = result.getText();
            stopScanner();
            onDetected?.(text);
          }
        }
      );
      stopHandleRef.current = controls;
      try { await video.play(); } catch {}
      return; // 成功
    } catch (e1) {
      console.warn("decodeFromConstraints(ideal) failed:", e1);
      if (e1?.name === "OverconstrainedError") {
        // 画素制約を緩めて再試行
        const relaxed = { audio: false, video: { facingMode: { ideal: "environment" } } };
        try {
          const controls2 = await readerRef.current.decodeFromConstraints(
            relaxed,
            video,
            (result) => {
              if (result) {
                const text = result.getText();
                stopScanner();
                onDetected?.(text);
              }
            }
          );
          stopHandleRef.current = controls2;
          try { await video.play(); } catch {}
          return;
        } catch (e2) {
          console.warn("decodeFromConstraints(relaxed) failed:", e2);
        }
      }
    }

    // ③ 最後の手段：デバイスIDなしでブラウザ任せ
    try {
      const controls3 = await readerRef.current.decodeFromVideoDevice(
        undefined,
        video,
        (result) => {
          if (result) {
            const text = result.getText();
            stopScanner();
            onDetected?.(text);
          }
        }
      );
      stopHandleRef.current = controls3;
      try { await video.play(); } catch {}
    } catch (e3) {
      console.error("decodeFromVideoDevice fallback failed:", e3);
      let msg = "カメラの起動に失敗しました。";
      if (e3?.name === "NotAllowedError") msg = "カメラの使用が許可されていません。端末の設定で本サイトのカメラを許可してください。";
      else if (e3?.name === "NotFoundError") msg = "カメラが見つかりません。別の端末でお試しください。";
      else if (e3?.name === "OverconstrainedError") msg = "指定のカメラ設定を満たせませんでした。別のブラウザ/端末でお試しください。";
      setErrorMsg(msg);
      stopScanner();
    }
  }, [onDetected, stopScanner]);

  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }
    let cancelled = false;
    (async () => { if (!cancelled) await startScanner(); })();
    return () => { cancelled = true; stopScanner(); };
  }, [open, startScanner, stopScanner]);

  // タブ非表示/復帰で停止/再起動（iOS/Androidの安定化）
  useEffect(() => {
    const onVis = async () => {
      if (!open) return;
      if (document.visibilityState === "hidden") {
        stopScanner();
      } else if (document.visibilityState === "visible") {
        await startScanner();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, startScanner, stopScanner]);

  const handleCancel = () => {
    stopScanner();
    onClose?.();
  };

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle}>
          <video
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            playsInline
            muted
            autoPlay
          />
          {/* ガイド枠 */}
          <div
            style={{
              position: "absolute",
              top: "18%",
              left: "10%",
              width: "80%",
              height: "64%",
              border: "3px solid rgba(255,255,255,0.8)",
              borderRadius: 12,
              pointerEvents: "none",
            }}
          />
        </div>
        <div style={footerStyle}>
          {errorMsg ? (
            <span style={{ color: "#ffb3b3" }}>{errorMsg}</span>
          ) : (
            <span>バーコードにかざすと自動で読み取ります（読み取り後は自動で閉じます）。</span>
          )}
          <button onClick={handleCancel} style={btnStyle}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
