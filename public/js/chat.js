const messagesEl = document.getElementById('messages');
const form = document.getElementById('composer');
const input = document.getElementById('prompt');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');

const history = [];

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = role === 'user' ? 'Vous' : 'Mistral';
  const body = document.createElement('div');
  body.className = 'bubble';
  body.textContent = text;
  div.append(who, body);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  sendBtn.disabled = true;
  setStatus('Envoi en cours…');
  addMessage('user', text);
  history.push({ role: 'user', content: text });
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);
    addMessage('assistant', data.reply ?? '');
    history.push({ role: 'assistant', content: data.reply ?? '' });
    setStatus('');
  } catch (err) {
    setStatus(err.message || 'Erreur inconnue');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});

input.focus();
