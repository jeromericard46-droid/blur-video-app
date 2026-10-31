import { detectSensitive, mergeOverlaps } from './sensitive.js';

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

function selectFile(f) {
  currentFile = f;
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
  worker = await Tesseract.createWorker(langSelect.value.split('+'), 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') setProgress(0.3 + 0.7 * m.progress, `OCR : ${Math.round(m.progress * 100)} %`);
    },
    workerPath: '/vendor/worker.min.js',
    corePath: '/vendor/core',
    langPath: '/vendor/lang',
    gzip: true,
    cacheMethod: 'none'
  });
  return worker;
}

async function ocrImage(w, canvas) {
  const { data } = await w.recognize(canvas);
  return data;
}

function applyBlur(ctx, boxes, amount, full) {
  const { width, height } = ctx.canvas;
  if (full) {
    ctx.filter = `blur(${amount}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = 'none';
    return;
  }
  for (const b of boxes) {
    const pad = Math.max(6, amount / 2);
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
    const w = Math.min(width - x, b.w + 2 * pad), h = Math.min(height - y, b.h + 2 * pad);
    const region = ctx.getImageData(x, y, w, h);
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d').putImageData(region, 0, 0);
    ctx.save();
    ctx.filter = `blur(${amount}px)`;
    ctx.drawImage(tmp, x, y);
    ctx.restore();
  }
}

function boxesFromWords(words, hits) {
  const boxes = [];
  for (const word of words) {
    const t = word.text || '';
    if (!t.trim()) continue;
    const h = hits.find((x) => t.includes(x.text) || x.text.includes(t));
    if (h) {
      boxes.push({ x: word.bbox.x0, y: word.bbox.y0, w: word.bbox.x1 - word.bbox.x0, h: word.bbox.y1 - word.bbox.y0 });
    }
  }
  return boxes;
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
  const words = data.words || [];
  const boxes = boxesFromWords(words, hits);
  outCanvas.width = srcCanvas.width;
  outCanvas.height = srcCanvas.height;
  const ctx = outCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);
  applyBlur(ctx, boxes, Number(blurAmount.value), !onlySensitive.checked);
  resultBlob = await new Promise((res) => outCanvas.toBlob(res, 'image/png'));
  resultName = currentFile.name.replace(/\.[^.]+$/, '') + '-floute.png';
  downloadBtn.disabled = false;
  progress.classList.add('hidden');
}

async function analyzeVideo() {
  const w = await getWorker();
  const video = srcVideo;
  await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = rej; });
  const vw = video.videoWidth, vh = video.videoHeight;
  outCanvas.width = vw; outCanvas.height = vh;
  const vctx = outCanvas.getContext('2d');
  const recCanvas = document.createElement('canvas');
  recCanvas.width = vw; recCanvas.height = vh;
  const recStream = recCanvas.captureStream(30);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(recStream, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : undefined);
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
    video.currentTime = Math.min(t, video.duration - 0.01);
    await new Promise((res) => { video.onseeked = res; });
    vctx.drawImage(video, 0, 0);
    if (analyzed < 40 && Math.abs(t / ocrEvery - Math.round(t / ocrEvery)) < step / 2) {
      probeCtx.drawImage(video, 0, 0);
      const data = await ocrImage(w, probeCanvas);
      const hits = mergeOverlaps(detectSensitive(data.text));
      for (const word of data.words || []) {
        const txt = word.text || '';
        if (!txt.trim()) continue;
        if (hits.some((h) => txt.includes(h.text) || h.text.includes(txt))) {
          allBoxes.push({ x: word.bbox.x0, y: word.bbox.y0, w: word.bbox.x1 - word.bbox.x0, h: word.bbox.y1 - word.bbox.y0 });
        }
      }
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
  resultName = currentFile.name.replace(/\.[^.]+$/, '') + '-floute.webm';
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
