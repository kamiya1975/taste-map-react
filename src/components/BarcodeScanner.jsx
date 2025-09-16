// src/components/BarcodeScanner.jsx
// 連続スキャン 調整版：読み取り率を戻しつつ“残像”は弾く
// - ARMED: mediaTimeウォームアップ + ROI差分の移動平均 + 動的エントロピー（軽め）
// - 初回一致: 2連続一致 & ROIが微変化（同一フレームはNG）
// - フェイルセーフ: 起動1.2sで最低条件満たせば ARMED
// - 前セッション最初JANの一時無効化（禁止JANではなく時間限定）
// 依存: npm i @zxing/browser

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

// rVFC ウォームアップ（軽め）
async function warmupMediaTime(video, { uniq=10, sumSec=0.5, timeoutMs=4000 } = {}) {
  if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) {
    await sleep(700); return;
  }
  const t0 = performance.now();
  await new Promise((resolve) => {
    const seen = new Set(); let last=0, accum=0;
    const cb = (_ts, meta) => {
      const mt = meta?.mediaTime ?? 0;
      if (!seen.has(mt)) { if (last>0 && mt>last) accum += (mt-last); seen.add(mt); last = mt; }
      if (seen.size>=uniq && accum>=sumSec) return resolve();
      if (performance.now()-t0 > timeoutMs) return resolve();
      video.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
  });
}

async function getStream(deviceId) {
  const base = { aspectRatio: { ideal: 16/9 }, frameRate: { ideal: 30, max: 60 }, width: { ideal: 1280 }, height: { ideal: 720 } };
  try {
    if (deviceId) return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ deviceId:{ exact: deviceId }, ...base } });
  } catch {}
  try {
    return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ exact:"environment" }, ...base } });
  } catch {}
  return await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ ideal:"environment" }, ...base } });
}

// AF 維持（軽）
async function setAF(track) {
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  try {
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
      await track.applyConstraints({ advanced:[{ focusMode:"continuous" }] });
    }
  } catch {}
}

// ROI 処理
function ensureCanvas(ref) {
  if (!ref.current) {
    const c = document.createElement("canvas");
    c.width = 960; c.height = 320;
    ref.current = c;
  }
  return ref.current.getContext("2d");
}
function sampleROI(video, canvasRef) {
  const ctx = ensureCanvas(canvasRef);
  const c = canvasRef.current; const cw = c.width, ch = c.height;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return { hash: Math.random(), H: 0 };
  const rh = Math.floor(vh * 0.30), rw = Math.floor(rh * 3);
  const sx = Math.floor((vw - rw)/2), sy = Math.floor(vh * 0.45 - rh/2);
  ctx.drawImage(video, sx, sy, rw, rh, 0, 0, cw, ch);
  // hash（軽量輝度サマリ）
  const data = ctx.getImageData(0,0,cw,ch).data; let sum=0, step=32;
  for (let i=0;i<data.length;i+=4*step) sum += 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
  // 16-bin エントロピー
  const bins = new Array(16).fill(0); let total=0;
  for (let i=0;i<data.length;i+=4*8) { // 以前より粗く
    const y = 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
    bins[Math.max(0,Math.min(15,(y|0)>>4))]++; total++;
  }
  let H=0; for (let k=0;k<16;k++) if (bins[k]) { const p=bins[k]/total; H -= p*Math.log2(p); }
  return { hash: sum, H };
}

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
  ignoreCode = null,     // 同一JANの短時間デバウンス（禁止JANではない）
  ignoreForMs = 1200,
  firstIgnorePrevMs = 1500, // 前セッション最初JANの一時無効化
  armedFailSafeMs = 1200,   // ARMED フェイルセーフ
}) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef  = useRef(null);
  const readerRef = useRef(null);

  const rafRef    = useRef(0);
  const prevHashRef = useRef(null);
  const hashMARef = useRef([]); // ROI差分の移動平均用
  const baseEntropyRef = useRef(null);

  const armedRef  = useRef(false);
  const sessionAtRef = useRef(0);
  const prevSessionFirstRef = useRef({ code: null });
  const lastHitRef = useRef({ code: null, at: 0 });
  const zxingReadyAtRef = useRef(0);

  const firstMatchRef = useRef({ val:"", hash: null, ok:false }); // 2連続一致

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
    prevHashRef.current=null; hashMARef.current=[];
    baseEntropyRef.current=null; armedRef.current=false;
    firstMatchRef.current={ val:"", hash:null, ok:false };
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

    // ウォームアップ（軽）
    await warmupMediaTime(v, { uniq:10, sumSec:0.5, timeoutMs:4000 });
    zxingReadyAtRef.current = Date.now();
    sessionAtRef.current = Date.now();

    setUsingDetector(hasBD());

    // ループ
    const detector = hasBD() ? new window.BarcodeDetector({ formats:["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"] }) : null;

    const handleHit = (raw, roiHash) => {
      const val = norm(raw);
      if (!val) return false;

      // 起動直後のみ、前セッション最初JANを採用しない（時間限定）
      if (prevSessionFirstRef.current.code &&
          Date.now()-sessionAtRef.current < firstIgnorePrevMs &&
          val === prevSessionFirstRef.current.code) return false;

      // 初回一致（2連続 + ROIが微変化）
      const fm = firstMatchRef.current;
      if (!fm.ok) {
        if (fm.val === val && fm.hash !== roiHash) {
          fm.ok = true; // 2連続一致かつハッシュ微変化
        } else {
          fm.val = val; fm.hash = roiHash;
          return false; // まだ確定しない
        }
      }

      // 同一JANの短時間デバウンス
      if (ignoreCode && val === String(ignoreCode)) {
        if (Date.now() - (lastHitRef.current.at||0) < ignoreForMs) return false;
      }
      if (val === lastHitRef.current.code && Date.now()-lastHitRef.current.at < 900) return false;

      lastHitRef.current = { code: val, at: Date.now() };
      prevSessionFirstRef.current.code = val;
      onDetected?.(val);
      onClose?.();
      return true;
    };

    const tick = async () => {
      const video = videoRef.current;
      if (!video) return;

      const { hash, H } = sampleROI(video, canvasRef);
      if (baseEntropyRef.current == null) baseEntropyRef.current = H;

      // ROI差分ゲート（直前とほぼ同じはスキップ） しきい値はやや緩め
      const prev = prevHashRef.current; prevHashRef.current = hash;
      if (prev != null) {
        const diff = Math.abs(hash - prev) / (Math.abs(prev)+1e-6);
        // 移動平均に積む
        const arr = hashMARef.current; arr.push(diff); if (arr.length > 8) arr.shift();
        const ma = arr.reduce((a,b)=>a+b,0) / (arr.length || 1);

        // ARMED 判定（軽め & フェイルセーフ）
        const entOK = H >= Math.max(1.5, baseEntropyRef.current + 0.15); // 動的＋下限1.5
        const maOK  = ma >= 0.004; // 平均的に0.4%以上は変化している
        const age   = Date.now() - sessionAtRef.current;
        const failSafeOK = (age >= armedFailSafeMs) && (H >= 1.6) && (arr.length >= 5);

        if (!armedRef.current && ( (entOK && maOK && arr.length>=5) || failSafeOK )) {
          armedRef.current = true;
        }

        if (diff < 0.003) { // 0.3% 未満：残像っぽい
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      if (armedRef.current) {
        if (detector) {
          try {
            const res = await detector.detect(canvasRef.current);
            if (res && res[0]) {
              const raw = res[0].rawValue || res[0].rawText || "";
              if (handleHit(raw, hash)) return;
            }
          } catch {}
        } else {
          if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
          if (!readerRef.current._started) {
            readerRef.current._started = true;
            readerRef.current.decodeFromStream(stream, video, (result) => {
              if (!result) return;
              if (Date.now() < zxingReadyAtRef.current) return;
              handleHit(result.getText(), hash);
            }).catch(()=>{});
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [deviceId, firstIgnorePrevMs, ignoreCode, ignoreForMs, armedFailSafeMs, onClose, onDetected]);

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
      const v = videoRef.current; const s = trackRef.current?.getSettings?.() || {};
      const ma = hashMARef.current; const maVal = (ma.reduce?.((a,b)=>a+b,0)/(ma.length||1) || 0);
      setHud(`${v?.readyState ?? "-"} ${v?.videoWidth ?? 0}x${v?.videoHeight ?? 0} armed:${armedRef.current?1:0} ma:${maVal.toFixed(4)}`);
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
          {/* 横長ガイド（3:1） */}
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
