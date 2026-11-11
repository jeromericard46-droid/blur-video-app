import express from 'express';
import { Mistral } from '@mistralai/mistralai';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const tesseractDist = path.dirname(require.resolve('tesseract.js/package.json'));
const coreDist = path.dirname(require.resolve('tesseract.js-core/package.json'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/vendor/tesseract.min.js', (req, res) => {
  res.sendFile(path.join(tesseractDist, 'dist', 'tesseract.min.js'));
});
app.get('/vendor/worker.min.js', (req, res) => {
  res.sendFile(path.join(tesseractDist, 'dist', 'worker.min.js'));
});
app.use('/vendor/core', express.static(coreDist));

const langDataRoot = path.join(path.dirname(require.resolve('@tesseract.js-data/fra/package.json')), '..');
// tesseract.js v5 construit l'URL des langues ainsi : `${langPath}/${lang}.traineddata.gz`
app.get('/vendor/lang/:file', (req, res) => {
  const { file } = req.params;
  const m = /^([a-z]{2,3})\.traineddata(\.gz)?$/.exec(file);
  if (!m) return res.status(400).end();
  const [, lang, gz] = m;
  const name = `${lang}.traineddata${gz || ''}`;
  for (const variant of ['4.0.0_best_int', '4.0.0']) {
    const p = path.join(langDataRoot, lang, variant, name);
    if (p.startsWith(langDataRoot + path.sep) && fs.existsSync(p)) return res.sendFile(p);
  }
  return res.status(404).end();
});

const CHAT_MODEL = 'mistral-small-latest';
const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 4000;

let mistralClient = null;
function getMistral() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;
  if (!mistralClient) {
    mistralClient = new Mistral({
      apiKey,
      ...(process.env.MISTRAL_BASE_URL ? { serverURL: process.env.MISTRAL_BASE_URL } : {})
    });
  }
  return mistralClient;
}

function validateChatMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  if (messages.length > MAX_MESSAGES) return null;
  const clean = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    if (!['system', 'user', 'assistant'].includes(m.role)) return null;
    if (typeof m.content !== 'string' || !m.content.trim() || m.content.length > MAX_CONTENT_LENGTH) return null;
    clean.push({ role: m.role, content: m.content });
  }
  return clean;
}

app.use(express.json({ limit: '64kb' }));

app.post('/api/chat', async (req, res) => {
  const client = getMistral();
  if (!client) {
    return res.status(503).json({ error: 'MISTRAL_API_KEY non définie côté serveur.' });
  }
  const messages = validateChatMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ error: `Champ "messages" invalide (tableau de { role, content }, max ${MAX_MESSAGES} messages, ${MAX_CONTENT_LENGTH} caractères max par message).` });
  }
  try {
    const completion = await client.chat.complete({ model: CHAT_MODEL, messages });
    const content = completion.choices?.[0]?.message?.content;
    const reply = typeof content === 'string'
      ? content
      : (Array.isArray(content) ? content.map((p) => p?.text ?? '').join('') : '');
    res.json({ reply, model: completion.model ?? CHAT_MODEL });
  } catch (err) {
    console.error('appel Mistral en échec:', err?.message ?? err);
    res.status(502).json({ error: "Échec de l'appel à l'API Mistral." });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, HOST, () => {
  console.log(`blur-video-app démarré sur http://${HOST}:${PORT} (boucle locale uniquement)`);
});
