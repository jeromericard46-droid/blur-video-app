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
    '/vendor/lang/fra/4.0.0_best_int/fra.traineddata.gz',
    '/vendor/lang/eng/4.0.0/eng.traineddata.gz'
  ]) {
    const { status, buf } = await get(p);
    assert.equal(status, 200, p);
    assert.ok(buf.length > 1000, p);
  }
  const gz = await get('/vendor/lang/fra/4.0.0_best_int/fra.traineddata.gz');
  assert.equal(gz.buf[0], 0x1f, 'fichier gzippé attendu');
  assert.equal(gz.buf[1], 0x8b, 'fichier gzippé attendu');
});

test('chemin lang invalide rejeté', async () => {
  const { status } = await get('/vendor/lang/../../../etc/passwd');
  assert.ok([400, 404].includes(status));
});
