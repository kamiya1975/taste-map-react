// src/components/panels/RefreshPanelContent.jsx
// 更新ボタンパネル
import React, { useEffect, useRef, useState } from "react";

export default function RefreshPanelContent({ onRefresh }) {
  const [pressed, setPressed] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const spinTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    };
  }, []);

  const triggerSpin = () => {
    setSpinning(true);
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    spinTimerRef.current = setTimeout(() => setSpinning(false), 700); // 体感: 2回転くらい
  };

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "12px auto" }}>
      <style>{`
        @keyframes tmSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(540deg); } /* 2回転 */
        }
      `}</style>      
      <div style={{ fontSize: 14.5, lineHeight: 1.9, color: "#222" }}>
        今後も検査により打点や店舗を随時増やしていきます。<br></br><br></br>
        環境により自動で反映されない場合がありますので、下の更新ボタンを押すかバックグラウンド削除を習慣づけてみてください。
      </div>

      <div style={{ height: 14 }} />

      <button
        onClick={() => {
          triggerSpin();     // 見た目だけ（クルクル2回転）
          onRefresh?.();     // 既存の更新処理（そのまま）
        }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        onTouchStart={() => setPressed(true)}
        onTouchEnd={() => setPressed(false)}
        style={{
            marginTop: 16,
            width: "100%",
            padding: "10px 20px",
            lineHeight: 1.2,
            background: "rgb(230,227,219)",
            color: "#000",
            border: "none",
            borderRadius: 10,
            fontSize: 18,
            fontWeight: 700,
            boxShadow: pressed
              ? "0 2px 4px rgba(0,0,0,0.12)"
              : "0 4px 10px rgba(0,0,0,0.15)",
            transform: pressed ? "translateY(2px)" : "translateY(0)",
            transition: "all 0.08s ease",
            WebkitBackdropFilter: "blur(2px)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
        }}
      >
        更 新
        {spinning && (
          <span
            aria-hidden
            style={{
              display: "inline-block",
              marginLeft: 8,
              fontSize: 18,
              lineHeight: 1,
              animation: "tmSpin 0.7s linear",
            }}
          >
            ⟳
          </span>
        )}
      </button>

      {/* <div style={{ height: 30 }} />
      <div style={{ marginTop: 14, fontSize: 12, color: "#666", lineHeight: 1.7, textAlign: "center" }}>
        ※環境により即時反映されない場合もありますが、アプリを閉じて少し時間を置くと反映されます
      </div> */}
    </div>
  );
}
