import { detectSensitive, mergeOverlaps, collectWords, boxesFromWords, pickVideoMime } from './sensitive.js';

const fileInput = document.getElementById('fileInput');
const drop = document.getElementById('drop');
const dropLabel = document.getElementById('dropLabel');
const analyzeBtn = document.getElementById('analyzeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const langSelect = document.getElementById('langSelect');
const blurAmount = document.getElementById('blurAmount');
const blurAmountVal = document.getElementById('blurAmountVal');
const onlySensitive = document.getElementById('onlySensitive');
const progress = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const srcCanvas = document.getElementById('srcCanvas');
const outCanvas = document.getElementById('outCanvas');
const srcVideo = document.getElementById('srcVideo');
const findingsSection = document.getElementById('findings');
const findingsList = document.getElementById('findingsList');
const formatNote = document.getElementById('formatNote');

let currentFile = null;
let currentKind = null; // 'image' | 'video'
let worker = null;
let resultBlob = null;
let resultName = 'result';

blurAmount.addEventListener('input', () => { blurAmountVal.textContent = blurAmount.value; });

['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f) selectFile(f);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) selectFile(fileInput.files[0]); });

function setFormatNote(text) {
  if (!text) {
    formatNote.classList.add('hidden');
    formatNote.textContent = '';
    return;
  }
  formatNote.textContent = text;
  formatNote.classList.remove('hidden');
}

function selectFile(f) {
  currentFile = f;
  setFormatNote('');
  currentKind = f.type.startsWith('video/') ? 'video' : 'image';
  dropLabel.textContent = `${f.name} (${(f.size / 1048576).toFixed(1)} Mo) — ${currentKind === 'video' ? 'vidéo' : 'image'}`;
  analyzeBtn.disabled = false;
  downloadBtn.disabled = true;
  resultBlob = null;
  loadPreview();
}

function loadPreview() {
  const url = URL.createObjectURL(currentFile);
  if (currentKind === 'image') {
    srcVideo.hidden = true;
    srcCanvas.hidden = false;
    const img = new Image();
    img.onload = () => {
      srcCanvas.width = img.naturalWidth;
      srcCanvas.height = img.naturalHeight;
      srcCanvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  } else {
    srcCanvas.hidden = true;
    srcVideo.hidden = false;
    srcVideo.src = url;
  }
}

function setProgress(p, text) {
  progress.classList.remove('hidden');
  progressBar.style.width = `${Math.round(p * 100)}%`;
  progressText.textContent = text;
}

async function getWorker() {
  if (worker) return worker;
  const langs = langSelect.value.split('+');
  for (const lang of langs) {
    const r = await fetch(`/vendor/lang/${lang}.traineddata.gz`, { method: 'HEAD' });
    if (!r.ok) throw new Error(`Langue « ${lang} » indisponible en local (HTTP ${r.status}) — relancez « npm install »`);
  }
  let fail;
  const failP = new Promise((_, rej) => { fail = rej; });
  const timeoutP = new Promise((_, rej) => { setTimeout(() => rej(new Error('Chargement du moteur OCR dépassé (90 s)')), 90000); });
  worker = await Promise.race([
    Tesseract.createWorker(langs, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') setProgress(0.3 + 0.7 * m.progress, `OCR : ${Math.round(m.progress * 100)} %`);
        else if (m.status) setProgress(0.1, m.status);
      },
      errorHandler: (e) => fail(typeof e === 'string' ? e : (e?.message || String(e))),
      workerPath: '/vendor/worker.min.js',
      corePath: '/vendor/core',
      langPath: '/vendor/lang',
      gzip: true,
      cacheMethod: 'none'
    }),
    failP,
    timeoutP
  ]);
  return worker;
}

async function ocrImage(w, canvas) {
  const { data } = await w.recognize(canvas);
  return data;
}

// Floute une zone. ctx.filter (blur gaussien) n'existe pas sur Safari < 18 :
// repli universel par sous-échantillonnage + lissage, lisible nullement après.
function blurArea(ctx, x, y, w, h, amount) {
  if (w <= 0 || h <= 0) return;
  if (typeof ctx.filter === 'string') {
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d').drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);
    ctx.save();
    ctx.filter = `blur(${amount}px)`;
    ctx.drawImage(tmp, x, y);
    ctx.restore();
    return;
  }
  let src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);
  const k = Math.max(2, Math.round(amount));
  for (let i = 0; i < 2; i++) {
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(src.width / k));
    small.height = Math.max(1, Math.round(src.height / k));
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(src, 0, 0, small.width, small.height);
    const up = document.createElement('canvas');
    up.width = src.width; up.height = src.height;
    const uctx = up.getContext('2d');
    uctx.imageSmoothingEnabled = true;
    uctx.drawImage(small, 0, 0, up.width, up.height);
    src = up;
  }
  ctx.drawImage(src, x, y);
}

function applyBlur(ctx, boxes, amount, full) {
  const { width, height } = ctx.canvas;
  if (full) {
    blurArea(ctx, 0, 0, width, height, amount);
    return;
  }
  for (const b of boxes) {
    const pad = Math.max(6, amount / 2);
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
    const w = Math.min(width - x, b.w + 2 * pad), h = Math.min(height - y, b.h + 2 * pad);
    blurArea(ctx, x, y, w, h, amount);
  }
}

function renderFindings(hits) {
  findingsList.innerHTML = '';
  if (!hits.length) {
    findingsSection.classList.add('hidden');
    return;
  }
  findingsSection.classList.remove('hidden');
  const seen = new Set();
  for (const h of hits) {
    const key = `${h.type}:${h.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const li = document.createElement('li');
    const badge = document.createElement('span');
    badge.className = `badge ${h.type}`;
    badge.textContent = h.type;
    li.appendChild(badge);
    li.appendChild(document.createTextNode(h.text));
    findingsList.appendChild(li);
  }
}

async function analyzeImage() {
  const w = await getWorker();
  setProgress(0.05, 'Chargement du moteur OCR…');
  const data = await ocrImage(w, srcCanvas);
  setProgress(1, 'Analyse terminée');
  const hits = mergeOverlaps(detectSensitive(data.text));
  renderFindings(hits);
  const boxes = boxesFromWords(collectWords(data), hits);
  outCanvas.width = srcCanvas.width;
  outCanvas.height = srcCanvas.height;
  const ctx = outCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);
  applyBlur(ctx, boxes, Number(blurAmount.value), !onlySensitive.checked);
  const IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const imgType = IMG_TYPES.includes(currentFile.type) ? currentFile.type : 'image/png';
  resultBlob = await new Promise((res) => outCanvas.toBlob(res, imgType, 0.92));
  const imgExt = imgType === 'image/jpeg' ? 'jpg' : imgType === 'image/webp' ? 'webp' : 'png';
  resultName = currentFile.name.replace(/\.[^.]+$/, '') + '-floute.' + imgExt;
  setFormatNote(imgType === currentFile.type
    ? ''
    : `Format de sortie : ${imgExt.toUpperCase()} (le navigateur ne peut pas encoder en ${currentFile.type || 'ce format'})`);
  downloadBtn.disabled = false;
  progress.classList.add('hidden');
}

async function waitMetadata(video) {
  if (video.readyState >= 1) return;
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('Métadonnées de la vidéo non chargées (15 s)')), 15000);
    video.onloadedmetadata = () => { clearTimeout(to); res(); };
    video.onerror = () => { clearTimeout(to); rej(new Error('Lecture de la vidéo impossible')); };
  });
}

async function seekTo(video, t) {
  const target = Math.min(t, video.duration - 0.01);
  if (Math.abs(video.currentTime - target) < 1e-3) return;
  await new Promise((res) => {
    const to = setTimeout(res, 3000); // si le seek bloque, on dessine la frame courante
    video.onseeked = () => { clearTimeout(to); res(); };
    video.onerror = () => { clearTimeout(to); res(); };
    video.currentTime = target;
  });
}



async function analyzeVideo() {
  const w = await getWorker();
  const video = srcVideo;
  await waitMetadata(video);
  if (!isFinite(video.duration) || video.duration <= 0) throw new Error('Durée de la vidéo inconnue');
  const vw = video.videoWidth, vh = video.videoHeight;
  outCanvas.width = vw; outCanvas.height = vh;
  const vctx = outCanvas.getContext('2d');
  const mime = pickVideoMime(currentFile.type, (m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } });
  const recStream = outCanvas.captureStream(30);
  // Conserver le son : recuperer la piste audio de la video d'origine
  // (l'element n'est plus « muted » ; on ne lit jamais la video, on la seek frame par frame)
  try {
    const media = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
    if (media) for (const t of media.getAudioTracks()) recStream.addTrack(t);
  } catch (e) { console.warn('piste audio non capturee:', e); }
  const rec = new MediaRecorder(recStream, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = res; });

  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = vw; probeCanvas.height = vh;
  const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });
  const allBoxes = [];
  const ocrEvery = Math.max(1, Math.round(video.duration / 40)); // ~40 analyses sur la vidéo
  let analyzed = 0;
  let t = 0;
  const step = 1 / 30;

  rec.start(1000);
  setProgress(0, 'Analyse de la vidéo…');
  while (t < video.duration) {
    await seekTo(video, t);
    vctx.drawImage(video, 0, 0);
    if (analyzed < 40 && Math.abs(t / ocrEvery - Math.round(t / ocrEvery)) < step / 2) {
      probeCtx.drawImage(video, 0, 0);
      const data = await ocrImage(w, probeCanvas);
      const hits = mergeOverlaps(detectSensitive(data.text));
      allBoxes.push(...boxesFromWords(collectWords(data), hits));
      analyzed++;
      setProgress(t / video.duration, `OCR ${analyzed}/40 — ${Math.round((t / video.duration) * 100)} %`);
    }
    applyBlur(vctx, allBoxes, Number(blurAmount.value), !onlySensitive.checked);
    t += step;
  }
  rec.stop();
  await done;
  setProgress(1, 'Encodage terminé');
  resultBlob = new Blob(chunks, { type: mime || 'video/webm' });
  const outExt = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  resultName = currentFile.name.replace(/\.[^.]+$/, '') + '-floute.' + outExt;
  const inBase = (currentFile.type || '').split('/')[1] || '';
  setFormatNote(inBase === outExt
    ? ''
    : `Format de sortie : ${outExt.toUpperCase()} (ce navigateur ne sait pas encoder en ${inBase || 'ce format'})`);
  downloadBtn.disabled = false;
  progress.classList.add('hidden');
}

analyzeBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  analyzeBtn.disabled = true;
  try {
    if (currentKind === 'image') await analyzeImage();
    else await analyzeVideo();
  } catch (e) {
    console.error(e);
    setProgress(0, `Erreur : ${e.message}`);
  } finally {
    analyzeBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!resultBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(resultBlob);
  a.download = resultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
