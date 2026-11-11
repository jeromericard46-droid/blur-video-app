const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_FR = /(?:(?:\+33|0033)\s?[1-9]|0[1-9])(?:[\s.\-]?\d{2}){4}/g;
const PHONE_INTL = /\+\d{1,3}[\s.\-]?(?:\(\d{1,4}\)[\s.\-]?)?(?:\d[\s.\-]?){5,11}\d/g;
const ADDRESS_FR = /\b\d{1,5}(?:[\s,]+(?:bis|ter|quater|inquies|[A-Za-zÀ-ÿ-]+)){0,3}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|impasse|place|allée|allee|quai|passage|route|rue|cours|square|faubourg|sentier)\b[^\n,.;]{0,60}/gi;
const CP_VILLE = /\b(?:0[1-9]|[1-8]\d|9[0-8])\s?\d{3}\s+[A-ZÀ-Þ][A-Za-zÀ-ÿ' -]{1,40}\b/g;
const LABELS = 'nom|prénom|prenom|société|societe|entreprise|collectivité|collectivite|organisme|raison\\s+sociale';
const LABEL_VALUE = new RegExp(`\\b(?:${LABELS})\\s*[:\\-]\\s*[A-ZÀ-Þ](?:(?!${LABELS}\\b)[^\\n,.;:]){0,60}`, 'gi');

const RULES = [
  { type: 'email', re: EMAIL },
  { type: 'telephone', re: PHONE_FR },
  { type: 'telephone', re: PHONE_INTL },
  { type: 'adresse', re: ADDRESS_FR },
  { type: 'adresse', re: CP_VILLE },
  { type: 'nom', re: LABEL_VALUE }
];

function normalize(text) {
  return text
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectSensitive(text) {
  const clean = normalize(text);
  const hits = [];
  for (const { type, re } of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(clean)) !== null) {
      const value = m[0];
      if (value.length < 3) continue;
      const hit = { type, text: value, start: m.index, end: m.index + value.length };
      if (!hits.some((h) => h.start === hit.start && h.end === hit.end && h.type === hit.type)) {
        hits.push(hit);
      }
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  return hits;
}

export function mergeOverlaps(hits) {
  const out = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && h.start < last.end) {
      last.end = Math.max(last.end, h.end);
      last.text = last.text; // on garde le début
      if (!last.types.includes(h.type)) last.types.push(h.type);
    } else {
      out.push({ start: h.start, end: h.end, text: h.text, types: [h.type] });
    }
  }
  return out;
}

// tesseract.js v5 : les mots ne sont pas dans data.words mais dans
// data.blocks[].paragraphs[].lines[].words[] (chacun avec text et bbox {x0,y0,x1,y1})
export function collectWords(data) {
  const words = [];
  for (const block of data?.blocks || []) {
    for (const para of block?.paragraphs || []) {
      for (const line of para?.lines || []) {
        for (const w of line?.words || []) {
          if (w && w.text && w.bbox) words.push(w);
        }
      }
    }
  }
  return words;
}

function normalizeWord(s) {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}@.+_-]/gu, '');
}

export function wordMatchesHit(wordText, hits) {
  const nt = normalizeWord(wordText);
  if (nt.length < 2) return false;
  return hits.some((h) => {
    const ht = normalizeWord(h.text);
    return ht.length >= 2 && (ht.includes(nt) || nt.includes(ht));
  });
}

export function boxesFromWords(words, hits) {
  const boxes = [];
  for (const word of words) {
    if (!word.text || !word.text.trim()) continue;
    if (!wordMatchesHit(word.text, hits)) continue;
    const { x0, y0, x1, y1 } = word.bbox;
    boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return boxes;
}

// Choisit le mime MediaRecorder le plus proche du format d'entree (avec piste audio),
// en retombant sur webm. `isSupported` est injecte (MediaRecorder.isTypeSupported côté navigateur).
export function pickVideoMime(inputType, isSupported) {
  const order = [];
  if (inputType) {
    order.push(inputType);
    if (inputType.startsWith('video/mp4') || inputType.startsWith('video/quicktime')) {
      order.push('video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=vp09.00.10.08,opus', 'video/mp4');
    } else if (inputType.startsWith('video/webm')) {
      order.push('video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm');
    }
  }
  order.push('video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm');
  return order.find((m) => { try { return isSupported(m); } catch { return false; } }) || '';
}
