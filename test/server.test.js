import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3457;
const BASE = `http://127.0.0.1:${PORT}`;
let proc;

async function get(p) {
  const res = await fetch(BASE + p);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf };
}

before(async () => {
  proc = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('serveur non démarré');
});

after(() => { proc?.kill(); });

test('page d’accueil servie', async () => {
  const { status, buf } = await get('/');
  assert.equal(status, 200);
  assert.ok(buf.includes('Blur App'));
});

test('assets vendor servis localement (hors-ligne)', async () => {
  for (const p of [
    '/vendor/tesseract.min.js',
    '/vendor/worker.min.js',
    '/vendor/core/tesseract-core-lstm.wasm.js',
    '/vendor/core/tesseract-core-lstm.wasm',
    '/vendor/core/tesseract-core-simd-lstm.wasm.js'
  ]) {
    const { status, buf } = await get(p);
    assert.equal(status, 200, p);
    assert.ok(buf.length > 1000, p);
  }
});

// tesseract.js v5 demande `${langPath}/${lang}.traineddata.gz` (langPath = '/vendor/lang')
test('langues servies à l’URL exacte demandée par tesseract.js v5', async () => {
  for (const p of ['/vendor/lang/fra.traineddata.gz', '/vendor/lang/eng.traineddata.gz']) {
    const { status, buf } = await get(p);
    assert.equal(status, 200, p);
    assert.ok(buf.length > 1000, p);
    assert.equal(buf[0], 0x1f, 'fichier gzippé attendu');
    assert.equal(buf[1], 0x8b, 'fichier gzippé attendu');
    const head = await fetch(`${BASE}/vendor/lang/fra.traineddata.gz`, { method: 'HEAD' });
    assert.equal(head.status, 200, 'HEAD /vendor/lang/fra.traineddata.gz');
  }
});

test('chemin lang invalide rejeté', async () => {
  for (const p of [
    '/vendor/lang/../../../etc/passwd',
    '/vendor/lang/..%2F..%2Fetc%2Fpasswd',
    '/vendor/lang/passwd.traineddata.gz',
    '/vendor/lang/fra.traineddata',
    '/vendor/lang/zzz.traineddata.gz'
  ]) {
    const { status } = await get(p);
    assert.ok([400, 404].includes(status), `${p} -> ${status}`);
  }
});
