import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3461;
const PORT_NO_KEY = 3462;
const MOCK_PORT = 3463;
const BASE = `http://127.0.0.1:${PORT}`;
const BASE_NO_KEY = `http://127.0.0.1:${PORT_NO_KEY}`;
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const FAKE_KEY = 'sk-test-ne-doit-pas-fuir-0123456789';

let proc;
let procNoKey;
let mock;
let lastMockRequest = null;

function startMock() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const parsed = JSON.parse(body);
          lastMockRequest = { authorization: req.headers.authorization, body: parsed };
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({
            id: 'mock-1',
            object: 'chat.completion',
            created: 1730000000,
            model: parsed.model,
            choices: [{ index: 0, message: { role: 'assistant', content: 'Réponse mock' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
          }));
        });
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    srv.listen(MOCK_PORT, '127.0.0.1', () => resolve(srv));
  });
}

function startServer(port, extraEnv) {
  const p = spawn('node', ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ...extraEnv },
    stdio: 'ignore'
  });
  return p;
}

async function waitReady(base) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${base}/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('serveur non démarré');
}

async function postChat(base, payload) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  return { status: res.status, text, json: () => JSON.parse(text) };
}

before(async () => {
  mock = await startMock();
  proc = startServer(PORT, { MISTRAL_API_KEY: FAKE_KEY, MISTRAL_BASE_URL: MOCK_BASE });
  procNoKey = startServer(PORT_NO_KEY, { MISTRAL_API_KEY: '' });
  await waitReady(BASE);
  await waitReady(BASE_NO_KEY);
});

after(() => {
  proc?.kill();
  procNoKey?.kill();
  mock?.close();
});

test('page de chat servie', async () => {
  const res = await fetch(`${BASE}/chat.html`);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('Chat Mistral'));
});

test('503 si MISTRAL_API_KEY absente côté serveur', async () => {
  const { status, text } = await postChat(BASE_NO_KEY, { messages: [{ role: 'user', content: 'salut' }] });
  assert.equal(status, 503);
  assert.ok(!text.includes(FAKE_KEY));
});

test('400 si messages invalides', async () => {
  for (const payload of [
    {},
    { messages: [] },
    { messages: 'non-un-tableau' },
    { messages: [{ role: 'pirate', content: 'x' }] },
    { messages: [{ role: 'user', content: '   ' }] },
    { messages: [{ role: 'user', content: 'x'.repeat(4001) }] }
  ]) {
    const { status } = await postChat(BASE, payload);
    assert.equal(status, 400, JSON.stringify(payload).slice(0, 60));
  }
});

test('chat complet : relai vers l’API Mistral avec mistral-small-latest, sans fuite de clé', async () => {
  const messages = [
    { role: 'system', content: 'Tu es concis.' },
    { role: 'user', content: 'Bonjour' }
  ];
  const { status, text, json } = await postChat(BASE, { messages });
  assert.equal(status, 200);
  const data = json();
  assert.equal(data.reply, 'Réponse mock');
  assert.equal(data.model, 'mistral-small-latest');
  assert.ok(!text.includes(FAKE_KEY), 'la clé ne doit pas apparaître dans la réponse client');

  assert.equal(lastMockRequest.authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(lastMockRequest.body.model, 'mistral-small-latest');
  assert.deepEqual(lastMockRequest.body.messages, messages);
});
