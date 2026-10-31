const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_FR = /(?:(?:\+33|0033)\s?[1-9]|0[1-9])(?:[\s.\-]?\d{2}){4}/g;
const PHONE_INTL = /\+\d{1,3}[\s.\-]?(?:\(\d{1,4}\)[\s.\-]?)?(?:\d[\s.\-]?){5,11}\d/g;
const ADDRESS_FR = /\b\d{1,5}(?:[\s,]+(?:bis|ter|quater|inquies|[A-Za-zÀ-ÿ-]+)){0,3}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|impasse|place|allée|allee|quai|passage|route|rue|cours|square|faubourg|sentier)\b[^\n,.;]{0,60}/gi;
const CP_VILLE = /\b(?:0[1-9]|[1-8]\d|9[0-8])\s?\d{3}\s+[A-ZÀ-Þ][A-Za-zÀ-ÿ' -]{1,40}\b/g;
const NOM_PRENOM = /\b(?:nom|prénom|prenom)\s*[:\-]\s*[A-ZÀ-Þ][A-Za-zÀ-ÿ'-]*(?:\s+[A-ZÀ-Þ][A-Za-zÀ-ÿ'-]*)*/gi;

const RULES = [
  { type: 'email', re: EMAIL },
  { type: 'telephone', re: PHONE_FR },
  { type: 'telephone', re: PHONE_INTL },
  { type: 'adresse', re: ADDRESS_FR },
  { type: 'adresse', re: CP_VILLE },
  { type: 'nom', re: NOM_PRENOM }
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
