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
  modelSelect.innerHTML = pairs.map(p => `<option value="${p.channel}|${p.model}">${p.model} (${p.channel})</option>`).join('');
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
  resultArea.textContent = '';
  const pair = parsePair(modelSelect.value);
  const msg = { type: 'start', task, text };
  if (pair) Object.assign(msg, { channel: pair.channel, model: pair.model });
  const port = chrome.runtime.connect({ name: 'ai-stream' });
  currentPort = port;
  port.onMessage.addListener((m) => {
    if (m.type === 'delta') {
      resultArea.textContent += m.text;
    } else if (m.type === 'done') {
      // done
    } else if (m.type === 'error') {
      resultArea.textContent += `\n[错误] ${m.error}`;
    }
  });
  try { port.onDisconnect.addListener(() => { try { const err = chrome.runtime.lastError; if (err) { resultArea.textContent += `\n[错误] ${err.message}`; } } catch {} }); } catch {}
  port.postMessage(msg);
}

modelSelect.addEventListener('change', () => {
  const pair = parsePair(modelSelect.value);
  chrome.storage.sync.set({ activeModel: pair || null });
  const text = mainInput.value.trim();
  if (text) {
    const task = (taskSelect && taskSelect.value) || 'translate';
    startStream(task);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadModels();
  if (taskSelect && !taskSelect.value) taskSelect.value = 'translate';
});

runBtn.addEventListener('click', () => {
  const task = (taskSelect && taskSelect.value) || 'translate';
  startStream(task);
});

// 当目标语言在设置面板中更改时，如果当前有文本则重跑
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.translateTargetLang) {
      if (mainInput && mainInput.value.trim()) {
        const task = (taskSelect && taskSelect.value) || 'translate';
        startStream(task);
      }
    }
  });
} catch {}
