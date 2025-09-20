// window/window.js（UTF-8）

console.log('全局助手窗口已加载');

const mainInput = document.getElementById('main-input');
const resultArea = document.getElementById('result-area');
const modelSelect = document.getElementById('modelSelect');
const taskSelect = document.getElementById('taskSelect');
const runBtn = document.getElementById('run-btn');
let currentPort = null;

function joinPair(pair) {
  return pair && pair.channel && pair.model ? `${pair.channel}|${pair.model}` : '';
}

function parsePair(value) {
  if (!value) return null;
  const [channel, model] = value.split('|');
  if (!channel || !model) return null;
  return { channel, model };
}

function renderModels(channels, active, fallback) {
  const pairs = [];
  channels.forEach(ch => (ch.models || []).forEach(m => pairs.push({ channel: ch.name, model: m })));
  modelSelect.innerHTML = pairs.map(p => `<option value="${p.channel}|${p.model}">${p.channel} • ${p.model}</option>`).join('');
  const prefer = joinPair(active) || joinPair(fallback);
  if (prefer) modelSelect.value = prefer;
}

function loadModels() {
  chrome.storage.sync.get(['channels', 'defaultModel', 'activeModel'], (items) => {
    const channels = Array.isArray(items.channels) ? items.channels : [];
    renderModels(channels, items.activeModel || null, items.defaultModel || null);
  });
}

function startStream(task) {
  const text = mainInput.value.trim();
  if (!text) return;
  if (currentPort) { try { currentPort.disconnect(); } catch {} currentPort = null; }
  resultArea.textContent = task === 'summarize' ? '正在总结…\n' : '正在翻译…\n';
  const pair = parsePair(modelSelect.value);
  const msg = { type: 'start', task, text };
  if (pair) Object.assign(msg, { channel: pair.channel, model: pair.model });
  const port = chrome.runtime.connect({ name: 'ai-stream' });
  currentPort = port;
  port.onMessage.addListener((m) => {
    if (m.type === 'delta') {
      resultArea.textContent += m.text;
    } else if (m.type === 'done') {
      // no-op
    } else if (m.type === 'error') {
      resultArea.textContent += `\n[错误] ${m.error}`;
    }
  });
  port.postMessage(msg);
}

modelSelect.addEventListener('change', () => {
  const pair = parsePair(modelSelect.value);
  chrome.storage.sync.set({ activeModel: pair || null });
});

document.addEventListener('DOMContentLoaded', () => {
  loadModels();
  // 默认任务类型
  if (taskSelect && !taskSelect.value) taskSelect.value = 'translate';
});
runBtn.addEventListener('click', () => {
  const task = (taskSelect && taskSelect.value) || 'translate';
  startStream(task);
});
