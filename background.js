// background.js - Service Worker（UTF-8）

// 安装时初始化右键菜单
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({ id: 'floating-copilot-selection', title: '使用 FloatingCopilot 分析', contexts: ['selection'] });
  } catch {}
});

// 工具函数
function joinBasePath(base, path) {
  const b = (base || '').replace(/\/+$/, '');
  return b + path;
}

function pickModelFromConfig(task, requestPair, cfg) {
  const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
  function isValidPair(pair) {
    if (!pair || !pair.channel || !pair.model) return false;
    const ch = channels.find(c => c.name === pair.channel);
    return !!(ch && Array.isArray(ch.models) && ch.models.includes(pair.model));
  }
  if (isValidPair(requestPair)) return requestPair;
  if (task === 'translate' && isValidPair(cfg.translateModel)) return cfg.translateModel;
  if (isValidPair(cfg.defaultModel)) return cfg.defaultModel;
  for (const ch of channels) { if (ch.models && ch.models.length) return { channel: ch.name, model: ch.models[0] }; }
  return null;
}

function makePrompt(task, text, lang, templates) {
  const t = (templates && typeof templates === 'object') ? templates : {};
  const target = (lang || '中文').trim();
  const vars = { '{{targetLang}}': target, '{{text}}': (text || '').trim() };
  let tpl = '';
  if (task === 'translate') tpl = t.translate || '请将以下内容高质量翻译为{{targetLang}}，只返回译文，不要添加多余说明：\n\n{{text}}';
  else if (task === 'summarize') tpl = t.summarize || '请用{{targetLang}}对以下内容进行简洁准确的要点总结，只返回总结，不要添加多余说明：\n\n{{text}}';
  else if (task === 'rewrite') tpl = t.rewrite || '请用{{targetLang}}改写以下内容，使其表达清晰准确且保持原意：\n\n{{text}}';
  else if (task === 'polish') tpl = t.polish || '请用{{targetLang}}润色以下内容，使其更加自然流畅并提升可读性：\n\n{{text}}';
  else tpl = '请围绕以下内容提供有帮助的回答：\n\n{{text}}';
  return Object.keys(vars).reduce((acc, k) => acc.split(k).join(vars[k]), tpl);
}

// 非流式调用
async function callOpenAI(baseUrl, apiKey, model, prompt) {
  const url = joinBasePath(baseUrl || 'https://api.openai.com/v1', '/chat/completions');
  const body = { model, messages: [ { role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: prompt } ], temperature: 0.2 };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI: 无可用返回');
  return content;
}

async function callGemini(baseUrl, apiKey, model, prompt) {
  const base = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = joinBasePath(base, `/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`);
  const body = { contents: [ { parts: [{ text: prompt }] } ] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts;
  const out = Array.isArray(parts) ? parts.map(p => p?.text || '').join('\n') : '';
  if (!out) throw new Error('Gemini: 无可用返回');
  return out;
}

async function invokeModel(ch, model, prompt) {
  if (!ch || !ch.type) throw new Error('未找到渠道配置');
  if (!model) throw new Error('未指定模型');
  if (!ch.apiKey) throw new Error('渠道缺少 API KEY');
  if (ch.type === 'openai' || ch.type === 'openai-compatible') return await callOpenAI(ch.apiUrl, ch.apiKey, model, prompt);
  if (ch.type === 'gemini') return await callGemini(ch.apiUrl, ch.apiKey, model, prompt);
  throw new Error(`未知渠道类型: ${ch.type}`);
}

// 消息：非流式请求 & 渠道测试
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === 'performAiAction') {
    chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'translateTargetLang', 'promptTemplates'], async (cfg) => {
      try {
        const pair = pickModelFromConfig(request.task, (request.channel && request.model) ? { channel: request.channel, model: request.model } : null, cfg);
        if (!pair) throw new Error('未找到可用模型');
        const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
        const ch = channels.find(c => c.name === pair.channel);
        if (!ch) throw new Error('未找到渠道：' + pair.channel);
        const targetLang = request.targetLang || cfg.translateTargetLang || '中文';
        const prompt = makePrompt(request.task, request.text || '', targetLang, cfg.promptTemplates || {});
        const resultText = await invokeModel(ch, pair.model, prompt);
        sendResponse({ ok: true, result: resultText, channel: pair.channel, model: pair.model });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    });
    return true;
  }
  if (request && request.action === 'testChannel') {
    const name = request.channel;
    const reqModel = request.model;
    chrome.storage.sync.get(['channels', 'translateTargetLang', 'promptTemplates'], async (cfg) => {
      try {
        const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
        const ch = channels.find(c => c.name === name);
        if (!ch) throw new Error('未找到渠道');
        const model = reqModel || (ch.models && ch.models[0]) || '';
        if (!model) throw new Error('该渠道未配置模型');
        const prompt = makePrompt('summarize', '测试连通性，请仅回复 OK。', cfg.translateTargetLang || '中文', cfg.promptTemplates || {});
        const sample = await invokeModel(ch, model, prompt);
        sendResponse({ ok: true, sample });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    });
    return true;
  }
});

// 右键菜单点击（预留）
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'floating-copilot-selection') {
    console.log('选中文本:', info.selectionText || '');
  }
});

// 打开或聚焦全局助手（单例）
function openOrFocusGlobalWindow() {
  const url = chrome.runtime.getURL('window/window.html');
  chrome.tabs.query({ url }, (tabs) => {
    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      chrome.windows.update(tab.windowId, { focused: true });
      chrome.tabs.update(tab.id, { active: true });
    } else {
      chrome.windows.create({ url, type: 'popup', width: 400, height: 600, focused: true });
    }
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-global-window') openOrFocusGlobalWindow();
});

// ============ 流式输出（SSE） ============
function sseLoopFromReader(reader, onLine) {
  const decoder = new TextDecoder();
  let buffer = '';
  return reader.read().then(function process({ done, value }) {
    if (done) {
      if (buffer) { buffer.split(/\r?\n/).forEach(line => onLine(line)); buffer = ''; }
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/); buffer = lines.pop();
    for (const line of lines) onLine(line);
    return reader.read().then(process);
  });
}

async function streamOpenAI(baseUrl, apiKey, model, prompt, onDelta) {
  const url = joinBasePath(baseUrl || 'https://api.openai.com/v1', '/chat/completions');
  const body = { model, stream: true, messages: [ { role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: prompt } ], temperature: 0.2 };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const reader = res.body.getReader();
  await sseLoopFromReader(reader, (line) => {
    const l = line.trim(); if (!l || !l.startsWith('data:')) return;
    const data = l.slice(5).trim(); if (data === '[DONE]') { onDelta(null, true); return; }
    try { const json = JSON.parse(data); const token = json?.choices?.[0]?.delta?.content || ''; if (token) onDelta(token, false); } catch {}
  });
}

async function streamGemini(baseUrl, apiKey, model, prompt, onDelta) {
  const base = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = joinBasePath(base, `/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`);
  const body = { contents: [ { parts: [{ text: prompt }] } ] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const reader = res.body.getReader();
  await sseLoopFromReader(reader, (line) => {
    const l = line.trim(); if (!l || !l.startsWith('data:')) return;
    const data = l.slice(5).trim(); if (data === '[DONE]') { onDelta(null, true); return; }
    try { const json = JSON.parse(data); const parts = json?.candidates?.[0]?.content?.parts; const out = Array.isArray(parts) ? parts.map(p => p?.text || '').join('') : ''; if (out) onDelta(out, false); } catch {}
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-stream') return;
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== 'start') return;
    try {
      const { task, text, channel, model } = msg;
      chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'translateTargetLang', 'promptTemplates'], async (cfg) => {
        try {
          const pair = pickModelFromConfig(task, (channel && model) ? { channel, model } : null, cfg);
          if (!pair) throw new Error('未找到可用模型');
          const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
          const ch = channels.find(c => c.name === pair.channel);
          if (!ch) throw new Error('未找到渠道：' + pair.channel);
          const targetLang = msg.targetLang || cfg.translateTargetLang || '中文';
          const prompt = makePrompt(task, text || '', targetLang, cfg.promptTemplates || {});
          const onDelta = (delta, done) => {
            if (done) port.postMessage({ type: 'done' });
            else if (delta) port.postMessage({ type: 'delta', text: delta });
          };
          if (ch.type === 'openai' || ch.type === 'openai-compatible') {
            await streamOpenAI(ch.apiUrl, ch.apiKey, pair.model, prompt, onDelta);
          } else if (ch.type === 'gemini') {
            try {
              await streamGemini(ch.apiUrl, ch.apiKey, pair.model, prompt, onDelta);
            } catch (e) {
              // 回退：非流式调用 + 简单分段
              const full = await invokeModel(ch, pair.model, prompt);
              String(full).split(/(?<=。|\.|!|！|\?|？)/).forEach(seg => { if (seg) onDelta(seg, false); });
              onDelta(null, true);
            }
          } else {
            const full = await invokeModel(ch, pair.model, prompt);
            port.postMessage({ type: 'delta', text: full });
            port.postMessage({ type: 'done' });
          }
        } catch (e) {
          port.postMessage({ type: 'error', error: String(e) });
        }
      });
    } catch (e) {
      port.postMessage({ type: 'error', error: String(e) });
    }
  });
});
