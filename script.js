let __dotGlow = 0;

// Fade out glow each frame
function fadeDotGlow() {
    if (__dotGlow > 0) {
        __dotGlow -= 0.15;
        if (__dotGlow < 0) __dotGlow = 0;
    }
}


// === TICK ENGINE (Web Audio, clean) ===
let audioCtx = null;
let tickBuffer = null;
function ensureAudio(){
  if (!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended'){
    try { audioCtx.resume(); } catch(e){}
  }
  if (!tickBuffer && audioCtx){
    fetch("sounds/tick.wav")
      .then(r=>r.arrayBuffer())
      .then(buf=> audioCtx.decodeAudioData(buf))
      .then(decoded=>{ tickBuffer = decoded; })
      .catch(()=>{});
  }
}
function playTick(){
  const en = document.getElementById('enableTick');
  if (en && !en.checked) return;
  if (!audioCtx || !tickBuffer) return;
  const volEl = document.getElementById('tickVolume');
  const vol = volEl ? Math.max(0, Math.min(1, parseFloat(volEl.value)||0.5)) : 0.5;
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = tickBuffer;
    const g = audioCtx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(audioCtx.destination);
    src.start();
  } catch(e){}
}

function onBeat(){
    if (window.__taskPreBeat) { try { window.__taskPreBeat(); } catch(e){} }
    if (window.__suppressBeats) { return; }

    // ensure tick plays every beat
  /* tick via rAF */
    // spawn beat dot
    spawnBeatDot();
    // trigger tick sound// trigger stroke animation
    animateStroke();
}(() => {
  // Elements
  const el = {
    settings: document.getElementById('settings'),
    game: document.getElementById('game'),
    playerWrap: document.getElementById('playerWrap'),
    videoLinks: document.getElementById('videoLinks'),
    minBpm: document.getElementById('minBpm'),
    maxBpm: document.getElementById('maxBpm'),
    changeInterval: document.getElementById('changeInterval'),
    minSession: document.getElementById('minSession'),
    maxSession: document.getElementById('maxSession'),
    scramble: document.getElementById('scramble'),
    tickVolume: document.getElementById('tickVolume'),
    volLabel: document.getElementById('volLabel'),
    enableTick: document.getElementById('enableTick'),
    enableVoice: document.getElementById('enableVoice'),
    startBtn: document.getElementById('startBtn'),
    resetBtn: document.getElementById('resetBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    endBtn: document.getElementById('endBtn'),
    returnBtn: document.getElementById('returnBtn'),
    complete: document.getElementById('complete'),
    beatTrack: document.getElementById('beatTrack'),
    strokeThumb: document.getElementById('strokeThumb'),
    strokeMeter: document.getElementById('strokeMeter'),
    beatLine: document.getElementById('beatLine'),
    vMeter: document.getElementById('vMeter'),
    tick: document.getElementById('tick'),
    voiceFaster: document.getElementById('voiceFaster'),
    voiceSlower: document.getElementById('voiceSlower'),
    voiceKeep: document.getElementById('voiceKeep'),
  };

  // Persist settings
  const STORE = 'instructor_v3_1';
  function save() {
    const d = {
      links: el.videoLinks.value,
      min: el.minBpm.value,
      max: el.maxBpm.value,
      change: el.changeInterval.value,
      minSess: el.minSession.value,
      maxSess: el.maxSession.value,
      scr: el.scramble.checked,
      vol: el.tickVolume.value,
      tick: el.enableTick.checked,
      voice: el.enableVoice.checked,
    };
    localStorage.setItem(STORE, JSON.stringify(d));
  }
  function load() {
    const raw = localStorage.getItem(STORE);
    if(!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.links) el.videoLinks.value = d.links;
      if (d.min) el.minBpm.value = d.min;
      if (d.max) el.maxBpm.value = d.max;
      if (d.change) el.changeInterval.value = d.change;
      if (d.minSess) { el.minSession.value = d.minSess; } else if (!el.minSession.value) { el.minSession.value = 5; }
      if (d.maxSess) { el.maxSession.value = d.maxSess; } else if (!el.maxSession.value) { el.maxSession.value = 15; }
      if (typeof d.scr === 'boolean') el.scramble.checked = d.scr;
      if (d.vol) el.tickVolume.value = d.vol;
      if (typeof d.tick === 'boolean') el.enableTick.checked = d.tick;
      if (typeof d.voice === 'boolean') el.enableVoice.checked = d.voice;
      updateVolLabel();
    } catch(e){}
  }
  load();

  // ---------- NEW: image hotlink protection helpers ----------
  const IMG_PROXY = '/.netlify/functions/imgProxy';
  function proxied(u){ return `${IMG_PROXY}?url=${encodeURIComponent(u)}`; }
  function isImageUrl(u){ return /\.(png|jpe?g|gif|webp|bmp|avif|jfif|pjpeg|pjp)(\?|#|$)/i.test(u); }
  function isVideoUrl(u){ return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(u); }
  // -----------------------------------------------------------

  // State
  let list = [];
  let idx = 0;
  let bpm = 80, minBpm=60, maxBpm=120;
  let changeMs = 15000;
  let sessionMs = 0;
  let masterTimer = null; // beat scheduler
  let nextBeatAt = 0;     // ms timestamp for next beat
  let rafId = null;       // stroke animation
  let changeId = null;
  let sessionId = null;
  let ended = false;

  // Volume
  el.tickVolume.addEventListener('input', ()=>{
    const v = parseFloat(el.tickVolume.value);
    [el.tick, el.voiceFaster, el.voiceSlower, el.voiceKeep].forEach(a=>a.volume=v);
    updateVolLabel();
    save();
  });
  function updateVolLabel(){ document.getElementById('volLabel').textContent = Math.round(parseFloat(el.tickVolume.value)*100)+'%'; }

  // Start
  el.startBtn.addEventListener('click', start);
  el.endBtn.addEventListener('click', stopToSettings);
  el.returnBtn.addEventListener('click', stopToSettings);
  el.resetBtn.addEventListener('click', ()=>{ localStorage.removeItem(STORE); location.reload(); });

  el.prevBtn.addEventListener('click', ()=>{ loadMedia(idx-1); });
  el.nextBtn.addEventListener('click', ()=>{ loadMedia(idx+1); });

  function start(){
  ensureAudio();
    save();
    const urls = el.videoLinks.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(urls.length===0){ alert('Please paste at least one link (video or image).'); return; }
    list = urls;
    if (el.scramble.checked) shuffle(list);
    idx = 0;

    minBpm = parseInt(el.minBpm.value,10);
    maxBpm = parseInt(el.maxBpm.value,10);
    if (maxBpm < minBpm) [minBpm, maxBpm] = [maxBpm, minBpm];
    bpm = rand(minBpm, maxBpm);

    changeMs = Math.max(3000, parseInt(el.changeInterval.value,10)*1000);
    let minM = Math.max(0, parseInt(el.minSession.value,10)||0);
    let maxM = Math.max(0, parseInt(el.maxSession.value,10)||0);
    if (maxM && minM && maxM < minM) { const t=minM; minM=maxM; maxM=t; }
    if (!minM && !maxM) { sessionMs = 0; } else {
      const lo = (minM||1)*60000; const hi = (maxM||minM||1)*60000;
      sessionMs = lo + Math.floor(Math.random()*(Math.max(hi-lo,1)));
    }

    el.tick.muted = false;
    // Set volumes
    const vol = parseFloat(el.tickVolume.value);
    [el.tick, el.voiceFaster, el.voiceSlower, el.voiceKeep].forEach(a=>a.volume=vol);

    // Swap screens
    el.settings.classList.add('hidden');
    el.game.classList.remove('hidden');
    el.complete.classList.add('hidden');
    ended = false;

    loadMedia(idx);
    startBeatEngine();
    const _tasksToggle = document.getElementById('enableTasks');
    if(!_tasksToggle || !_tasksToggle.checked){ startChangeTimer(); }
    startStrokeRAF();
    if (sessionMs>0) sessionId = setTimeout(autoEnd, sessionMs);
  }

  function stopToSettings(){
    cleanup();
    el.game.classList.add('hidden');
    el.settings.classList.remove('hidden');
  }

  function autoEnd(){
    ended = true;
    cleanupBeatVisuals();
    el.complete.classList.remove('hidden');
  }

  // Media support (native video + images + YouTube + Pornhub)

  
function loadMedia(i){
  if (list.length === 0) return;
  idx = (i + list.length) % list.length;
  const url = list[idx];
  el.playerWrap.innerHTML = '';

  if (isImageUrl(url)) {
    renderDirectImage(url);
    return;
  }
  const type = detectLinkType(url);
  if (type === 'luscious') { renderLuscious(url); return; }
  if (type === 'youtube') {
    const id = parseYouTubeId(url);
    const src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&playsinline=1&enablejsapi=1`;
    const ifr = document.createElement('iframe');
    ifr.src = src;
    ifr.allow = 'autoplay; encrypted-media; picture-in-picture';
    ifr.style.width = '100%'; ifr.style.height = '100%';
    el.playerWrap.appendChild(ifr);
    return;
  }
  if (type === 'pornhub') {
    const embed = `https://www.pornhub.com/embed/${extractPHKey(url)}`;
    const ifr = document.createElement('iframe');
    ifr.src = embed;
    ifr.allow = 'autoplay; encrypted-media; picture-in-picture';
    ifr.style.width = '100%'; ifr.style.height = '100%';
    el.playerWrap.appendChild(ifr);
    return;
  }
  const v = document.createElement('video');
  v.src = url; v.playsInline = true; v.autoplay = true; v.controls = true; v.muted = false;
  v.addEventListener('click', e=>e.preventDefault());
  v.addEventListener('ended', ()=>{ if (idx === list.length-1) loadMedia(0); else loadMedia(idx+1); });
  el.playerWrap.appendChild(v);
  v.play().catch(()=>{ v.muted = true; v.play().catch(()=>{}); });
}

      // Direct link: choose image or video
      if (isImageUrl(url)) {
        const img = document.createElement('img');
        img.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto;background:#000";
        img.draggable = false;
        img.referrerPolicy = 'no-referrer'; // avoid hotlink referrer blocking
        let triedProxy = false;
        img.onerror = () => {
          if (triedProxy) return;
          triedProxy = true;
          img.src = proxied(url);
        };
        img.src = url;
        el.playerWrap.appendChild(img);
      } else {
        const v = document.createElement('video');
        v.src = url;
        v.playsInline = true;
        v.autoplay = true;
        v.controls = true;
        v.muted = false;
        v.onplay = ()=>{};
        v.onerror = ()=>{};
        // prevent redirect on click
        v.addEventListener('click', e=>e.preventDefault());
        v.addEventListener('ended', ()=>{
          // On last item, loop to start; do NOT auto-end.
          if (idx === list.length-1) { loadMedia(0); }
          else { loadMedia(idx+1); }
        });
        el.playerWrap.appendChild(v);
        v.play().catch(()=>{
          v.muted = true;
          v.play().catch(()=>{});
        });
      }
    }
  


  
function detectLinkType(u){
  if (isImageUrl(u)) return 'direct';
  try {
    const parsed = new URL(u, window.location.href);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if (host.includes('pornhub.com')) return 'pornhub';
    if (host.endsWith('luscious.net') && path.startsWith('/albums/')) return 'luscious';
  } catch(e){}
  return 'direct';
}

  async function renderLuscious(url){
    // Clear any previous timer
    if (lusciousTimer) { clearInterval(lusciousTimer); lusciousTimer = null; }
    el.playerWrap.innerHTML = '<div style="padding:16px;text-align:center;font:14px system-ui">Loading gallery…</div>';
    const id = extractLusciousAlbumId(url);
    if (!id){
      el.playerWrap.innerHTML = '<div style="padding:16px;text-align:center;font:14px system-ui">Could not detect album ID from this URL. Paste a gallery URL like <code>https://luscious.net/albums/my-album_123456/</code>.</div>';
      return;
    }
    // Try GraphQL API
    let images = [];
    try {
      
      const q = {
        operationName: "PictureListInsideAlbum",
        variables: {
          album_id: String(id),
          page: 1,
          items_per_page: 50
        },
        query: `query PictureListInsideAlbum($album_id: ID!, $page: Int!, $items_per_page: Int!) {
          picture {
            list(album_id: $album_id, page: $page, items_per_page: $items_per_page) {
              items {
                id
                url_to_original
                url_to_resized
                url_to_medium
              }
            }
          }
        }`
      };
      const res = await fetch(`/.netlify/functions/lusciousProxy?id=${id}`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(q),
        mode: "cors",
        credentials: "omit"
      });
      if (res.ok){
        const data = await res.json();
        const items = (((data||{}).data||{}).picture||{}).list?.items||[];
        images = items.map(it => it.url_to_original || it.url_to_resized || it.url_to_medium).filter(Boolean);
      }
    } catch(e){ /* ignore for graceful fallback */ }

    if (!images.length){
      el.playerWrap.innerHTML = '<div style="padding:16px;text-align:center;font:14px system-ui">Could not load images directly (CORS or API blocked).<br/>Workarounds: 1) Use a CORS proxy; 2) Paste direct image URLs; 3) Download images and paste local file URLs.</div>';
      return;
    }

    // Build simple slideshow
    let i = 0;
    el.playerWrap.innerHTML = "";
    const wrap = document.createElement('div');
    wrap.style.cssText = "position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#000";
    const img = document.createElement('img');
    img.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;user-select:none";
    img.draggable = false;
    img.referrerPolicy = 'no-referrer';

    const makeBtn = (txt, side)=> {
      const b = document.createElement('button');
      b.textContent = txt;
      b.style.cssText = "position:absolute;top:50%;transform:translateY(-50%);"+side+":8px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.25);padding:8px 10px;border-radius:8px;color:#fff;cursor:pointer";
      return b;
    };
    const prev = makeBtn("◀", "left");
    const next = makeBtn("▶", "right");

    function show(k){
      if (!images.length) return;
      i = (k + images.length) % images.length;
      const raw = images[i];
      let triedProxy = false;
      img.onerror = () => {
        if (triedProxy) return;
        triedProxy = true;
        img.src = proxied(raw);
      };
      img.src = raw;
    }

    prev.addEventListener('click', ()=> show(i-1));
    next.addEventListener('click', ()=> show(i+1));
    wrap.addEventListener('click', (e)=>{ 
      // click right half -> next, left half -> prev
      const rect = wrap.getBoundingClientRect();
      if (e.clientX > rect.left + rect.width/2) show(i+1); else show(i-1);
    });

    wrap.appendChild(img);
    wrap.appendChild(prev);
    wrap.appendChild(next);
    el.playerWrap.appendChild(wrap);
    show(0);

    // Auto-advance using changeMs
    if (lusciousTimer) clearInterval(lusciousTimer);
    lusciousTimer = setInterval(()=> show(i+1), Math.max(3000, changeMs));
  }
  function intOrString(v){ try{ const n = parseInt(v,10); return Number.isNaN(n) ? v : n; } catch(e){ return v; } }
  // --- End Luscious.net support ---




  // Beat engine — precise scheduling
  
  // Canvas meter state
  let lastBeatAt = 0; // timestamp when center hit occurs
  const streamSpeed = 260; // px/sec the stream moves; spacing auto-scales with BPM
  let meterRaf = 0;
  function layoutCanvases(){
    const dpr = window.devicePixelRatio || 1;
    function fit(c){
      if (!c) return;
      const rect = c.getBoundingClientRect();
      c.width = Math.max(1, Math.floor(rect.width*dpr));
      c.height = Math.max(1, Math.floor(rect.height*dpr));
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    fit(el.beatLine);
    fit(el.vMeter);
  }
  window.addEventListener('resize', layoutCanvases);

  function drawBeatLine(now){
    fadeDotGlow();
    if (!el.beatLine) return;
    const ctx = el.beatLine.getContext('2d');
    const w = el.beatLine.clientWidth, h = el.beatLine.clientHeight;
    ctx.clearRect(0,0,w,h);
    const y = h*0.55, cx = w*0.5;

    // baseline
    ctx.globalAlpha=0.6; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(12,y); ctx.lineTo(w-12,y); ctx.stroke();

    const period = 60000 / bpm; // ms per beat
    const since = now - lastBeatAt; // ms since last center hit
    const frac = (since % period) / period; // 0..1
    const bps = bpm/60;
    const spacing = streamSpeed / bps; // px between dots; higher bpm -> smaller spacing
    // Draw dots across a wide range
    for (let i=-Math.ceil(w/spacing)-2; i<=Math.ceil(w/spacing)+2; i++){
      const x = cx + (i - frac)*spacing;
      if (x<8 || x>w-8) continue;
      const dist = Math.abs(x-cx);
      const near = dist < spacing*0.25;
      const g = ctx.createRadialGradient(x,y,1,x,y, near?44:28);
      g.addColorStop(0,'rgba(120,255,230,0.9)');
      g.addColorStop(1,'rgba(120,255,230,0.0)');
      ctx.fillStyle=g; ctx.globalAlpha=0.6;
      ctx.beginPath(); ctx.arc(x,y, near?44:28, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
      ctx.beginPath(); ctx.arc(x,y, near?9:5, 0, Math.PI*2); ctx.fill();
    }
    // center marker
    ctx.globalAlpha=0.9;
    ctx.beginPath(); ctx.moveTo(cx, y-24); ctx.lineTo(cx, y+24); ctx.stroke();
    ctx.globalAlpha=0.5; ctx.beginPath(); ctx.arc(cx,y,22,0,Math.PI*2); ctx.stroke();
  }

  function drawPump(now){
    if (!el.vMeter) return;
    const ctx = el.vMeter.getContext('2d');
    const w = el.vMeter.clientWidth, h = el.vMeter.clientHeight;
    ctx.clearRect(0,0,w,h);
    const pad=10, innerW=w-pad*2, innerH=h-pad*2;
    // Outline
    ctx.globalAlpha=1; ctx.lineWidth=3; ctx.strokeStyle = '#000';
const __r=12;
ctx.beginPath();
ctx.moveTo(pad+__r, pad);
ctx.lineTo(pad+innerW-__r, pad);
ctx.quadraticCurveTo(pad+innerW, pad, pad+innerW, pad+__r);
ctx.lineTo(pad+innerW, pad+innerH-__r);
ctx.quadraticCurveTo(pad+innerW, pad+innerH, pad+innerW-__r, pad+innerH);
ctx.lineTo(pad+__r, pad+innerH);
ctx.quadraticCurveTo(pad, pad+innerH, pad, pad+innerH-__r);
ctx.lineTo(pad, pad+__r);
ctx.quadraticCurveTo(pad, pad, pad+__r, pad);
ctx.closePath();
ctx.stroke();
ctx.save();
ctx.clip();
const period = 60000 / bpm;
    const since = performance.now() - lastBeatAt;
    const t = (since % period) / period; // 0..1
    const base = t<0.5 ? (t/0.5) : (1-(t-0.5)/0.5);
    const tri = 1 - base;
    const fillH = (innerH-6)*(0.15 + tri*0.8);
    const fy = pad + innerH - 3 - fillH;

    
    
    // Battery-style segmented stroke meter (6 blocks) with gradient colors
    const segments = 6;
    const availableH = innerH - 6;
    const segH = availableH / segments;
    const progressRatio = Math.max(0, Math.min(1, fillH / availableH)); // 0..1
    let blocksFilled = Math.round(progressRatio * segments);
    if (blocksFilled > segments) blocksFilled = segments;
    if (blocksFilled < 0) blocksFilled = 0;

    // Define per-block colors from bottom to top
    const blockColors = [
      ['#ffff66', '#ffcc33'], // bottom: yellowish
      ['#ffcc33', '#ff9933'], // yellow-orange
      ['#ff9933', '#ff6600'], // orange
      ['#ff6600', '#ff3300'], // barely red (orange-red)
      ['#ff3300', '#ff2222'], // reddish
      ['#ff2222', '#ff0000']  // top: bright red
    ];

    ctx.globalAlpha = 0.95;
    for (let i = 0; i < blocksFilled; i++) {
      const yBlock = pad + innerH - 3 - (i+1) * segH;
      const gradient = ctx.createLinearGradient(0, yBlock, 0, yBlock + segH);
      gradient.addColorStop(0, blockColors[i][0]);
      gradient.addColorStop(1, blockColors[i][1]);
      ctx.fillStyle = gradient;
      ctx.fillRect(pad+3, yBlock, innerW-6, segH-2);
    }

    // Draw segment dividers (outlines)
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#000000';
    for (let i = 1; i < segments; i++) {
      const yLine = pad + innerH - 3 - i * segH;
      ctx.beginPath();
      ctx.moveTo(pad+1, yLine);
      ctx.lineTo(pad + innerW - 1, yLine);
      ctx.stroke();
    }

const cx = pad + innerW/2, cy = fy;
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 40);
    g.addColorStop(0,'rgba(255,160,60,0.6)');
    g.addColorStop(1,'rgba(255,160,60,0.0)');
    ctx.fillStyle = g; ctx.globalAlpha=0.6;
    ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI*2); ctx.fill();
  }

  
// --- rAF-driven tick (sound only, visuals untouched) ---
var __rafLastBeatIndex = -1;
function __maybeTickByRaf(ts){
  // Only tick when engine is running
  if (!masterTimer) return;
  const period = 60000 / bpm;
  const elapsed = ts - lastBeatAt; // lastBeatAt set at engine start; modulo gives phase
  const idx = Math.floor(elapsed / period);
  if (idx !== __rafLastBeatIndex){
    __rafLastBeatIndex = idx;
    try { playTick(); } catch(e){}
  }
}
function renderLoop(ts){
    __maybeTickByRaf(ts);
    layoutCanvases();
    drawBeatLine(ts);
    drawPump(ts);
    meterRaf = requestAnimationFrame(renderLoop);
  }

function startBeatEngine(){
    stopBeatEngine();
    const start = performance.now();
    nextBeatAt = start;
    lastBeatAt = start;
    scheduleNext();
  }
  function stopBeatEngine(){
    if (masterTimer) { clearTimeout(masterTimer); masterTimer=null; }
  }
  function scheduleNext(){
    const period = 60000 / bpm;
    const delay = Math.max(0, nextBeatAt - performance.now());
    masterTimer = setTimeout(()=>{
      // Fire beat
      onBeat();
      // plan the next
      nextBeatAt += period;
      scheduleNext();
    }, delay);
  }

  function onBeatOLD(){
    lastBeatAt = performance.now();
    // Tick sound
    if (el.enableTick.checked) {
      try { el.tick.currentTime = 0; el.tick.play(); } catch(e){}
    }
    dot.style.left = (w-7)+'px';
    track.appendChild(dot);
    requestAnimationFrame(step);
  }

  // Stroke animation — synced to BPM (cosine up/down)
  function startStrokeRAF(){
    if (meterRaf) cancelAnimationFrame(meterRaf);
    renderLoop(performance.now());
  }
// Random BPM change + voice cues
  function startChangeTimer(){
    if (changeId) clearInterval(changeId);
    changeId = setInterval(()=>{
      const prev = bpm;
      bpm = rand(minBpm, maxBpm);
      // voice cues
      if (el.enableVoice.checked){
        if (bpm > prev) playVoice(el.voiceFaster);
        else if (bpm < prev) playVoice(el.voiceSlower);
        else playVoice(el.voiceKeep);
      }
    }, changeMs);
  }
  function playVoice(aud){
    try { aud.currentTime = 0; aud.play(); } catch(e){}
  }

  function cleanup(){
    if (meterRaf) cancelAnimationFrame(meterRaf);
    stopBeatEngine();
    if (rafId) cancelAnimationFrame(rafId);
    if (changeId) clearInterval(changeId);
    if (sessionId) clearTimeout(sessionId);
    cleanupBeatVisuals();
    // kill player
    el.playerWrap.innerHTML='';
    if (lusciousTimer) { clearInterval(lusciousTimer); lusciousTimer = null; }
    el.complete.classList.add('hidden');
  }
  function cleanupBeatVisuals(){
    // remove any leftover dots
    const track = el.beatTrack; if (track) [...track.querySelectorAll('.beatDot')].forEach(n=>n.remove());
  }

  // Utils
  function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
  function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }}



// === Task System (BPM-driven) ===
(function(){
  const enableTasksCheckbox = document.getElementById("enableTasks");
  const tasksBox = document.getElementById("tasksBox");
  const taskIntervalSlider = document.getElementById("taskInterval");
  const taskIntervalValue = document.getElementById("taskIntervalValue");
  const selectAllTasksCheckbox = document.getElementById("selectAllTasks");
  const randomizeTasksBtn = document.getElementById("randomizeTasks");
  const taskBubble = document.getElementById("taskBubble");
  const startBtn = document.getElementById("startBtn");
  const endBtn = document.getElementById("endBtn");
  const returnBtn = document.getElementById("returnBtn");

  let tasksEnabled = false;
  let taskTimer = null;
  let subTimer = null;   // for RLGL/Cluster/Accel
  let activeTask = null;
  let baseBpm = 80;
  const ABS_MIN_BPM = 20, ABS_MAX_BPM = 450;

  window.__taskPreBeat = null;
  window.__suppressBeats = false; // when true, onBeat() does nothing

  function clearSubTimer(){
    if (subTimer) { try{ clearTimeout(subTimer); }catch(e){} try{ clearInterval(subTimer); }catch(e){} subTimer=null; }
  }
  function clearTaskTimer(){ if (taskTimer) { clearTimeout(taskTimer); taskTimer = null; } }
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

  function showTaskBubble(text){
    if (!taskBubble) return;
    taskBubble.textContent = text;
    taskBubble.style.display = "block";
    setTimeout(()=>{ taskBubble.style.display = "none"; }, 3000);
  }

  function getEnabledTasks(){
    const boxes = document.querySelectorAll(".task-option:checked");
    return Array.from(boxes).map(cb => cb.value);
  }

  function getTaskIntervalMs(){
    const val = taskIntervalSlider ? parseInt(taskIntervalSlider.value,10)||10 : 10;
    return clamp(val,1,50)*1000;
  }

  function stopChangeTimerIfAny(){
    try { if (changeId) clearInterval(changeId); } catch(e){}
  }

  function setBpm(newBpm){
    bpm = clamp(newBpm, ABS_MIN_BPM, ABS_MAX_BPM);
  }

  function applyTask(name){
    activeTask = name;
    baseBpm = bpm;
    window.__taskPreBeat = null;
    window.__suppressBeats = false;
    clearSubTimer();

    if (name === "Double Strokes"){
      setBpm(baseBpm*2);
    } else if (name === "Halved Strokes"){
      setBpm(baseBpm/2);
    } else if (name === "Teasing Strokes"){
      // bubble only
    } else if (name === "Acceleration Cycles"){
      const startBpm = 40;
      const targetBpm = 350;
      const totalMs = getTaskIntervalMs();
      const startAt = performance.now();
      setBpm(startBpm);
      subTimer = setInterval(()=>{
        const t = performance.now() - startAt;
        const ratio = clamp(t/totalMs, 0, 1);
        const exp = Math.pow(targetBpm/startBpm, ratio);
        setBpm(startBpm * exp);
      }, 120);
    } else if (name === "Random Beats"){
      window.__taskPreBeat = function(){
        const lo = Math.max(ABS_MIN_BPM, Math.min(minBpm, ABS_MAX_BPM));
        const hi = Math.max(ABS_MIN_BPM, Math.min(maxBpm, ABS_MAX_BPM));
        setBpm(randInt(lo,hi));
      };
    } else if (name === "Random Stroke Speed"){
      const lo = Math.max(ABS_MIN_BPM, Math.min(minBpm, ABS_MAX_BPM));
      const hi = Math.max(ABS_MIN_BPM, Math.min(maxBpm, ABS_MAX_BPM));
      setBpm(randInt(lo,hi));
    } else if (name === "Red Light Green Light"){
      // Alternates STOP (bpm=0, suppress beats) and GO (200–370 BPM) for 3–8s each.
      function toRed(){
        window.__suppressBeats = true;
        setBpm(0);
        showTaskBubble("Red Light – STOP");
        subTimer = setTimeout(toGreen, randInt(3000, 8000));
      }
      function toGreen(){
        window.__suppressBeats = false;
        setBpm(randInt(200,370));
        showTaskBubble("Green Light – GO");
        subTimer = setTimeout(toRed, randInt(3000, 8000));
      }
      toRed();
    } else if (name === "Cluster Strokes"){
      // Alternate between high BPM (200–450) for 2–5s and low BPM (45–90) for 2–5s
      function toFast(){
        setBpm(randInt(200,450));
        subTimer = setTimeout(toSlow, randInt(2000, 5000));
      }
      function toSlow(){
        setBpm(randInt(45,90));
        subTimer = setTimeout(toFast, randInt(2000, 5000));
      }
      toFast();
    } }

  function pickAndApplyTask(){
    const options = getEnabledTasks();
    if (options.length === 0){
      activeTask = null;
      window.__taskPreBeat = null;
      window.__suppressBeats = false;
      clearSubTimer();
      return;
    }
    const chosen = options[Math.floor(Math.random()*options.length)];
    // Show task name once (RLGL will show STOP/GO during phases)
    showTaskBubble(chosen);
    applyTask(chosen);
  }

  function startTaskTimer(){
    clearTaskTimer();
    clearSubTimer();
    window.__suppressBeats = false;
    stopChangeTimerIfAny();
    taskTimer = setTimeout(function run(){
      pickAndApplyTask();
      taskTimer = setTimeout(run, getTaskIntervalMs());
    }, getTaskIntervalMs());
  }

  function stopTaskSystem(){
    clearTaskTimer();
    clearSubTimer();
    window.__taskPreBeat = null;
    window.__suppressBeats = false;
  }

  // UI bindings
  if (enableTasksCheckbox && tasksBox){
    tasksBox.style.display = "none";
    enableTasksCheckbox.addEventListener("change", ()=>{
      tasksEnabled = enableTasksCheckbox.checked;
      tasksBox.style.display = tasksEnabled ? "block" : "none";
    });
  }
  if (taskIntervalSlider && taskIntervalValue){
    taskIntervalValue.textContent = taskIntervalSlider.value;
    taskIntervalSlider.addEventListener("input", ()=>{
      taskIntervalValue.textContent = taskIntervalSlider.value;
    });
  }
  if (selectAllTasksCheckbox){
    selectAllTasksCheckbox.addEventListener("change", ()=>{
      const boxes = document.querySelectorAll(".task-option");
      boxes.forEach(cb => cb.checked = selectAllTasksCheckbox.checked);
    });
  }
  if (randomizeTasksBtn){
    randomizeTasksBtn.addEventListener("click", ()=>{
      const boxes = document.querySelectorAll(".task-option");
      boxes.forEach(cb => cb.checked = Math.random() > 0.5);
    });
  }

  if (startBtn){
    startBtn.addEventListener("click", ()=>{
      tasksEnabled = !!(enableTasksCheckbox && enableTasksCheckbox.checked);
      stopTaskSystem(); 
      if (tasksEnabled) startTaskTimer();
    });
  }
  if (endBtn) endBtn.addEventListener("click", stopTaskSystem);
  if (returnBtn) returnBtn.addEventListener("click", stopTaskSystem);

  // Make sure legacy auto-change never runs while tasks are enabled
  const _startChangeTimer = startChangeTimer;
  startChangeTimer = function(){
    const on = !!(enableTasksCheckbox && enableTasksCheckbox.checked);
    if (on) { try{ if (changeId) clearInterval(changeId); }catch(e){} return; }
    return _startChangeTimer();
  };
})(); // End Task System
// End Task System
})();

function animateStroke(){
    const fill = document.getElementById("strokeFill");
    if(!fill) return;
    // Animate stroke going up and down with bpm
    let start = null;
    const duration = (60/bpm)*1000; // one beat duration
    function step(ts){
        if(!start) start = ts;
        let progress = (ts-start)/duration;
        if(progress>1) progress=1;
        let height = progress*100;
        fill.style.height = height + "%";
        if(progress<1){
            requestAnimationFrame(step);
        } else {
            // reset down
            fill.style.height = "0%";
        }
    }
    requestAnimationFrame(step);
}

function renderDirectImage(url){
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#000';
  const img = document.createElement('img');
  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;user-select:none';
  img.decoding = 'async'; img.loading = 'eager';
  img.referrerPolicy = 'no-referrer';
  let retried = false;
  img.onerror = () => {
    if (!retried){ retried = true; const bust=(url.includes('?')?'&':'?')+'__rb='+Date.now(); img.src=url+bust; return; }
    wrap.innerHTML = `<div style="color:#fff;padding:16px;text-align:center;font:14px system-ui">
      Image blocked (403). <br><a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#8ff;text-decoration:underline">Open in new tab</a>
    </div>`;
  };
  img.src = url;
  wrap.appendChild(img);
  el.playerWrap.appendChild(wrap);
}
