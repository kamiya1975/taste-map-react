import React, { useCallback, useEffect, useRef, useState } from "react";
import BarcodeScanner from "./BarcodeScanner"; // ← 前回の強化版
// ProductPage を Drawer/Modal/iframe などで表示する前提の“外枠 UI”（例）
import ProductDrawer from "./ProductDrawer";   // あなたの既存ラッパーUI

const CLEAR_KEYS = [
  "selectedJAN",
  "lastScannedJAN",
  "scan_last_jan",
  "scanTriggerJAN",
  "scanner_selected_jan",
];

const clearScanHints = () => {
  try {
    CLEAR_KEYS.forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  } catch {}
};

export default function ScanAndProductFlow() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerSession, setScannerSession] = useState(0); // key用（毎回リセット）
  const [productOpen, setProductOpen] = useState(false);
  const [selectedJAN, setSelectedJAN] = useState(null);

  // 直近の検出を抑制（連続同一JANの誤再開防止）
  const lastScanRef = useRef({ code: null, at: 0 });

  // postMessage 受信（ProductPage からの通知を受ける）
  useEffect(() => {
    const onMsg = (e) => {
      const { type, jan } = e.data || {};
      if (type === "PRODUCT_CLOSED") {
        // 商品ページ側が閉じた → 親も確実にクリア
        setProductOpen(false);
        setSelectedJAN(null);
        clearScanHints();
      }
      if (type === "PRODUCT_OPENED") {
        // 必要なら状態同期
      }
      if (type === "RATING_UPDATED") {
        // 必要ならUI反映
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // スキャナを開く：前回JANの痕跡を必ずクリアし、セッションを更新
  const openScanner = useCallback(() => {
    setProductOpen(false);
    setSelectedJAN(null); // ← これが最重要
    clearScanHints();     // ← ローカルのトリガーも一掃
    setScannerSession((s) => s + 1); // key更新で完全リマウント
    setScannerOpen(true);
  }, []);

  const closeScanner = useCallback(() => {
    setScannerOpen(false);
  }, []);

  // 検出時のみ商品ページを開く（セッション内ワンショット）
  const handleDetected = useCallback((jan) => {
    const now = Date.now();
    if (lastScanRef.current.code === jan && now - lastScanRef.current.at < 1500) {
      // 連続同一JANは無視（1.5秒クールダウン）
      return;
    }
    lastScanRef.current = { code: jan, at: now };

    setSelectedJAN(jan);
    setProductOpen(true);
    setScannerOpen(false); // スキャナを閉じる（オーバーレイ消去）
  }, []);

  // 親側の「閉じる」（外枠の下の閉じる）→ 必ずクリアして閉じるだけ。ナビゲーションはしない。
  const handleProductClose = useCallback(() => {
    setProductOpen(false);
    setSelectedJAN(null);
    clearScanHints();
  }, []);

  return (
    <>
      <button onClick={openScanner}>バーコード読み取り</button>

      {scannerOpen && (
        <BarcodeScanner
          key={scannerSession}       // 完全リマウントで前回状態を持ち越さない
          open={scannerOpen}
          onClose={closeScanner}
          onDetected={handleDetected}
        />
      )}

      <ProductDrawer
        open={productOpen}
        jan={selectedJAN}
        onClose={handleProductClose}
      />
    </>
  );
}
