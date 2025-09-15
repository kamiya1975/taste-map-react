<!doctype html>
<html lang="ja">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Camera Smoke Test (tiny)</title>
<style>
  body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; }
  h1 { text-align:center; margin:20px 0; }
  #wrap { max-width: 720px; margin: 0 auto; padding: 12px; }
  #v { width: 100%; aspect-ratio: 4/3; background:#000; display:block; }
  #log { color: #c00; white-space: pre-wrap; margin-top: 12px; min-height: 1.5em; }
  .row { margin: 12px 0; display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
  button { padding:10px 16px; border-radius:10px; border:1px solid #ccc; background:#fff; }
  small { color:#666 }
</style>
<div id="wrap">
  <h1>Camera Smoke Test</h1>
  <video id="v" playsinline webkit-playsinline autoplay muted></video>
  <div class="row">
    <button id="btnStart">Start</button>
    <button id="btnStop">Stop</button>
    <button id="btnFrontBack">Face/Back</button>
  </div>
  <small id="hud"></small>
  <div id="log"></div>
</div>

<script>
(() => {
  const v = document.getElementById('v');
  const log = (m) => { document.getElementById('log').textContent = m ?? ''; };
  const hud = document.getElementById('hud');

  let stream = null;
  let preferFront = true;

  const hudTick = () => {
    const rs = v.readyState ?? '-';
    hud.textContent =
      `rs=${rs} paused=${v.paused} W=${v.videoWidth} H=${v.videoHeight} | ` +
      `track=${stream?.getVideoTracks?.()[0]?.readyState}/${stream?.getVideoTracks?.()[0]?.enabled ?? '-'}`;
    requestAnimationFrame(hudTick);
  };
  hudTick();

  const waitForVideo = (timeout = 8000) => new Promise((res, rej) => {
    const deadline = Date.now() + timeout;
    const ok = () => { cleanup(); res(); };
    const err = (e) => { cleanup(); rej(e); };
    const iv = setInterval(() => {
      if (v.videoWidth > 0 && v.videoHeight > 0 && v.readyState >= 2) ok();
      else if (Date.now() > deadline) err(new Error('VIDEO_TIMEOUT'));
    }, 120);
    const cleanup = () => {
      clearInterval(iv);
      v.removeEventListener('loadedmetadata', ok);
      v.removeEventListener('canplay', ok);
      v.removeEventListener('error', err);
    };
    v.addEventListener('loadedmetadata', ok, { once:true });
    v.addEventListener('canplay', ok, { once:true });
    v.addEventListener('error', err, { once:true });
  });

  const getStream = async () => {
    // device を特定できなくてもまずは facingMode だけで
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: preferFront ? 'user' : 'environment' }
    });
  };

  const stop = () => {
    try { stream?.getTracks?.().forEach(t => t.stop()); } catch {}
    try { v.pause(); } catch {}
    try { v.srcObject = null; } catch {}
    stream = null;
  };

  const start = async () => {
    log('');
    stop();
    try {
      // iOS Safari: 先に属性とプロパティを両方立てておく
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.setAttribute('autoplay', '');
      v.muted = true; v.playsInline = true;

      stream = await getStream();
      v.srcObject = stream;

      await waitForVideo(9000);
      // iOS で稀に play が例外出すので握りつぶして継続
      try { await v.play(); } catch (e) { console.warn('play() err:', e); }

      if (!(v.videoWidth > 0 && v.videoHeight > 0)) throw new Error('VIDEO_DIM_ZERO');
    } catch (e) {
      console.error(e);
      log(`${e.name ? e.name : 'Error'}: ${e.message || e.toString()}`);
      stop();
    }
  };

  document.getElementById('btnStart').onclick = start;
  document.getElementById('btnStop').onclick  = stop;
  document.getElementById('btnFrontBack').onclick = () => { preferFront = !preferFront; start(); };

  // ページを離れたら停止（iOSで裏に回るとフレームが来なくなることがある）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
  });
})();
</script>
