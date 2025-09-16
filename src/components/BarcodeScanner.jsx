// src/components/BarcodeScanner.jsx
// 読み取り率優先＋残像は“検出後に確認で止める”最小ガード版
// ・Detector優先、ZXingフォールバック
// ・前処理ガードは最小（軽いウォームアップ＆ごく緩いROI差分スキップのみ）
// ・確定は「同一コードを別フレームでもう一度検出」かつROI微変化あり

import React, { useEffect, useRef, useCallback, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const OVERLAY_Z = 2147483647;
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: OVERLAY_Z };
const panelStyle   = { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000" };
const videoBoxStyle= { flex: 1, position: "relative", background: "#000", overflow: "hidden", touchAction: "none" };
const footerStyle  = { padding: 12, borderTop: "1px solid #222", color: "#ddd", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 };
const btn          = { background: "#fff", color: "#000", border: "none", padding: "10px 16px", fontSize: 16, borderRadius: 10, cursor: "pointer", fontWeight: 700 };

const hasBD = () => typeof window !== "undefined" && "BarcodeDetector" in window;
const norm  = (s) => String(s ?? "").replace(/\D/g, "");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function assertHTTPS() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocal) throw new Error("NEED_HTTPS");
}

async function enumerateBackCameras() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const cams = devs.filter(d => d.kind === "videoinput");
  const rows = cams.map((d, i) => ({
    id: d.deviceId,
    label: d.label || `Camera ${i + 1}`,
    score: (/back|rear|environment|外側|環境/i.test(d.label||"") ? 10 : 0) + (/macro|ultra|wide|tele/i.test(d.label||"") ? 3 : 0)
  }));
  return rows.sort((a,b)=>b.score-a.score);
}

async function waitVideoReady(video, timeoutMs = 9000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const err = (e) => { cleanup(); reject(e); };
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
}

// rVFC ウォームアップ（超軽）
async function warmupMediaTime(video, { uniq=6, sumSec=0.3, timeoutMs=2500 } = {}) {
  if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) { await sleep(400); return; }
  const t0 = performance.now();
  await new Promise((resolve) => {
    const seen = new Set(); let last=0, acc=0;
    const cb = (_ts, meta) => {
      const mt = meta?.mediaTime ?? 0;
      if (!seen.has(mt)) { if (last>0 && mt>last) acc += (mt-last); seen.add(mt); last = mt; }
      if (seen.size>=uniq && acc>=sumSec) return resolve();
      if (performance.now()-t0 > timeoutMs) return resolve();
      video.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
  });
}

async function getStream(deviceId) {
  const base = { aspectRatio: { ideal: 16/9 }, frameRate: { ideal: 30, max: 60 }, width: { ideal: 1280 }, height: { ideal: 720 } };
  try { if (deviceId) return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ deviceId:{ exact: deviceId }, ...base } }); } catch {}
  try { return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ exact:"environment" }, ...base } }); } catch {}
  return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ ideal:"environment" }, ...base } });
}

// AF（軽）
async function setAF(track) {
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  try { if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) await track.applyConstraints({ advanced:[{ focusMode:"continuous" }] }); } catch {}
}

// ROI
function ensureCanvas(ref) {
  if (!ref.current) { const c = document.createElement("canvas"); c.width = 960; c.height = 320; ref.current = c; }
  return ref.current.getContext("2d");
}
function sampleROI(video, canvasRef) {
  const ctx = ensureCanvas(canvasRef);
  const c = canvasRef.current; const cw = c.width, ch = c.height;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return { hash: Math.random() };
  const rh = Math.floor(vh * 0.30), rw = Math.floor(rh * 3);
  const sx = Math.floor((vw - rw)/2), sy = Math.floor(vh * 0.45 - rh/2);
  ctx.drawImage(video, sx, sy, rw, rh, 0, 0, cw, ch);
  // hash（軽量輝度サマリ）
  const data = ctx.getImageData(0,0,cw,ch).data; let sum=0, step=32;
  for (let i=0;i<data.length;i+=4*step) sum += 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
  return { hash: sum };
}

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
  // “確認パラメータ”：ここを少し弄るだけでバランス調整できます
  confirmMs = 500,         // 初回検出からこの時間内に再検出できたら確定
  minRoiDiff = 0.0020,     // 再検出時に ROI ハッシュがこれ以上変化していること
  skipSameFrameDiff = 0.0015, // 直前とほぼ同じフレームはスキップ（軽く）
  ignoreCode = null,       // 同一JANの短時間デバウンス（禁止JANではない）
  ignoreForMs = 900,
  firstIgnorePrevMs = 1000 // 起動直後のみ、前セッション最初JANを採用しない
}) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef  = useRef(null);
  const readerRef = useRef(null);

  const rafRef    = useRef(0);
  const prevHashRef = useRef(null);
  const sessionAtRef = useRef(0);
  const prevSessionFirstRef = useRef({ code: null });
  const lastHitRef = useRef({ code: null, at: 0 });
  const zxingReadyAtRef = useRef(0);

  // “候補→確認→確定”の状態
  const candRef = useRef(null); // { code, t0, hash0 }

  const [hud, setHud] = useState("-");
  const [errorMsg, setErrorMsg] = useState("");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [usingDetector, setUsingDetector] = useState(false);
  const [vidKey, setVidKey] = useState(0);

  const stopAll = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch {}
    cancelAnimationFrame(rafRef.current||0); rafRef.current = 0;
    try {
      const v = videoRef.current;
      const s = v?.srcObject || streamRef.current;
      s?.getTracks?.().forEach(t=>t.stop());
      if (v) { try{v.pause?.();}catch{} v.srcObject=null; v.removeAttribute("src"); v.load?.(); }
    } catch {}
    streamRef.current=null; trackRef.current=null;
    prevHashRef.current=null; candRef.current=null;
  }, []);

  const start = useCallback(async (explicitId) => {
    setErrorMsg("");
    assertHTTPS();
    try { setDevices(await enumerateBackCameras()); } catch {}

    const stream = await getStream(explicitId || deviceId);
    streamRef.current = stream;
    const track = stream.getVideoTracks?.()[0];
    trackRef.current = track;

    const v = videoRef.current;
    v.playsInline = true; v.setAttribute("playsinline",""); v.setAttribute("webkit-playsinline","");
    v.muted = true; v.autoplay = true; v.srcObject = stream;
    await waitVideoReady(v, 9000);
    try { await v.play(); } catch {}
    await setAF(track);

    // 軽いウォームアップ
    await warmupMediaTime(v);
    zxingReadyAtRef.current = Date.now();
    sessionAtRef.current = Date.now();
    candRef.current = null;

    const detector = hasBD() ? new window.BarcodeDetector({ formats:["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"] }) : null;
    setUsingDetector(!!detector);

    const tryCommit = (val, hashNow) => {
      const now = Date.now();
      // 起動直後：直前セッションの最初JANは一時無効（禁止ではない）
      if (prevSessionFirstRef.current.code &&
          now - sessionAtRef.current < firstIgnorePrevMs &&
          val === prevSessionFirstRef.current.code) return false;

      // デバウンス
      if (ignoreCode && val === String(ignoreCode)) {
        if (now - (lastHitRef.current.at||0) < ignoreForMs) return false;
      }
      if (val === lastHitRef.current.code && now - lastHitRef.current.at < ignoreForMs) return false;

      lastHitRef.current = { code: val, at: now };
      prevSessionFirstRef.current.code = val;
      onDetected?.(val);
      onClose?.();
      return true;
    };

    const seenNow = (val, hashNow) => {
      const now = Date.now();
      const cand = candRef.current;

      if (!cand || cand.code !== val || (now - cand.t0) > confirmMs) {
        // 候補を張り直す（まだ確定しない）
        candRef.current = { code: val, t0: now, hash0: hashNow };
        return false;
      }
      // 同一コードが確認ウィンドウ内にもう一度来た：ROIが“同一フレーム”でないことを確認
      const diff = Math.abs(hashNow - cand.hash0) / (Math.abs(cand.hash0) + 1e-6);
      if (diff >= minRoiDiff) {
        // 確定
        return tryCommit(val, hashNow);
      } else {
        // 同一フレームっぽいので未確定のまま
        return false;
      }
    };

    // ZXing のために常に最新の ROI ハッシュを更新しておく
    const latestHashRef = { current: null };

    const loop = async () => {
      const video = videoRef.current;
      if (!video) return;

      const { hash } = sampleROI(video, canvasRef);
      latestHashRef.current = hash;

      // 直前とほぼ同じフレームは軽くスキップ（残像の連続ヒットを避ける）
      const prev = prevHashRef.current; prevHashRef.current = hash;
      if (prev != null) {
        const diff = Math.abs(hash - prev) / (Math.abs(prev) + 1e-6);
        if (diff < skipSameFrameDiff) { rafRef.current = requestAnimationFrame(loop); return; }
      }

      if (detector) {
        try {
          const res = await detector.detect(canvasRef.current);
          if (res && res[0]) {
            const raw = res[0].rawValue || res[0].rawText || "";
            const val = norm(raw);
            if (val) {
              if (seenNow(val, hash)) return; // 確定したら終了（onClose内でstop）
            }
          }
        } catch {}
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ZXing も並走（Detectorが無い場合 or 補助）
    if (!detector) {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      else try { readerRef.current.reset(); } catch {}
      readerRef.current.decodeFromStream(stream, v, (result) => {
        if (!result) return;
        if (Date.now() < zxingReadyAtRef.current) return;
        const val = norm(result.getText());
        if (!val) return;
        const hashNow = latestHashRef.current ?? 0;
        if (seenNow(val, hashNow)) return;
      }).catch(()=>{});
    }
  }, [deviceId, confirmMs, minRoiDiff, skipSameFrameDiff, ignoreCode, ignoreForMs, firstIgnorePrevMs, onClose, onDetected]);

  // open 制御
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open) { stopAll(); return; }
      try { setVidKey(k=>k+1); await start(); }
      catch (e) {
        if (cancelled) return;
        console.error("[camera start error]", e);
        const name = e?.name || "Error"; const msg = e?.message ? `: ${e.message}` : "";
        setErrorMsg(
          name==="NotAllowedError"||name==="SecurityError" ? "カメラが『拒否』です。設定でこのサイトのカメラを『許可』にしてください。" :
          name==="NotFoundError"||name==="OverconstrainedError" ? "背面カメラが見つかりません。端末再起動または別ブラウザをお試しください。" :
          name==="NotReadableError" ? "他アプリがカメラ使用中の可能性。全て終了後に再試行してください。" :
          name==="AbortError" ? "カメラ初期化が中断されました。再試行してください。" :
          name==="NEED_HTTPS" ? "HTTPS が必須です。https でアクセスしてください。" :
          name==="VIDEO_TIMEOUT" ? "初期化に時間がかかっています。ページ再読込を試してください。" :
          `カメラ起動失敗（${name}${msg}）`
        );
        stopAll();
      }
    })();
    return () => { cancelled = true; stopAll(); };
  }, [open, start, stopAll]);

  // HUD
  useEffect(() => {
    const i = setInterval(() => {
      const v = videoRef.current;
      const s = trackRef.current?.getSettings?.() || {};
      const cand = candRef.current;
      setHud(`${v?.readyState ?? "-"} ${v?.videoWidth ?? 0}x${v?.videoHeight ?? 0} cand:${cand?cand.code:"-"} zoom:${s.zoom ?? "-"}`);
    }, 500);
    return () => clearInterval(i);
  }, []);

  // カメラ切替
  const [devicesState, setDevicesState] = useState({ ready:false });
  useEffect(()=>{ if (devices.length) setDevicesState({ ready:true }); }, [devices]);
  const onChangeDevice = async (e) => {
    const id = e.target.value || null;
    setDeviceId(id);
    stopAll(); setVidKey(k=>k+1);
    await start(id).catch(()=>{});
  };

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={videoBoxStyle}>
          <video
            key={vidKey}
            ref={videoRef}
            style={{ width:"100%", height:"100%", objectFit:"cover", backgroundColor:"black" }}
            autoPlay playsInline muted
          />
          {/* ガイド */}
          <div
            style={{
              position:"absolute", left:"50%", top:"45%", transform:"translate(-50%, -50%)",
              width:"88%", aspectRatio:"3 / 1",
              border:"3px solid rgba(255,255,255,0.9)", borderRadius:10, pointerEvents:"none",
              boxShadow:"0 0 0 200vmax rgba(0,0,0,0.25) inset",
            }}
          />
          {/* HUD */}
          <div style={{ position:"absolute", right:8, top:8, background:"rgba(0,0,0,0.5)", color:"#fff", fontSize:12, padding:"4px 8px", borderRadius:8 }}>
            {hasBD() ? "Detector" : "ZXing"} | {hud}
          </div>
        </div>
        <div style={footerStyle}>
          <div style={{ minHeight: 18 }}>
            {errorMsg ? <span style={{ color:"#ffb3b3" }}>{errorMsg}</span> : <span>中央の枠にバーコードを合わせてください。</span>}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {devicesState.ready && (
              <select
                onChange={onChangeDevice}
                value={deviceId || ""}
                style={{ background:"#111", color:"#eee", border:"1px solid #333", borderRadius:8, padding:"8px" }}
                aria-label="カメラ切替"
              >
                <option value="">自動</option>
                {devices.map((d)=>(<option key={d.id} value={d.id}>{d.label}</option>))}
              </select>
            )}
            <button onClick={() => { stopAll(); onClose?.(); }} style={btn}>キャンセル</button>
          </div>
        </div>
      </div>
    </div>
  );
}
