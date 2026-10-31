import express from 'express';
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
app.get('/vendor/lang/:lang/:variant/:file', (req, res) => {
  const { lang, variant, file } = req.params;
  const okLang = /^[a-z]{2,3}$/.test(lang);
  const okVariant = /^4\.0\.0(_best_int)?$/.test(variant);
  const okFile = new RegExp(`^${lang}\\.traineddata\\.gz$`).test(file);
  if (!okLang || !okVariant || !okFile) return res.status(400).end();
  const p = path.join(langDataRoot, lang, variant, file);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, HOST, () => {
  console.log(`blur-video-app démarré sur http://${HOST}:${PORT} (boucle locale uniquement)`);
});
