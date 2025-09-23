export {};

const SIDEBAR_PATH = 'dist/sidebar.html';
let selectionBuffer = '';

chrome.runtime.onInstalled.addListener(async () => {
  try {
    if ((chrome as any).sidePanel?.setOptions) {
      await (chrome as any).sidePanel.setOptions({ enabled: true, path: SIDEBAR_PATH });
    } else {
      console.info('[FloatingCopilot] sidePanel API not available, using popup fallback');
    }
  } catch (error) {
    console.warn('[FloatingCopilot] sidePanel.setOptions failed, using popup fallback', error);
  }
  try {
    chrome.contextMenus.create({ id: 'floating-copilot-selection', title: 'Use FloatingCopilot', contexts: ['selection'] });
  } catch (error) {
    console.warn('[FloatingCopilot] failed to create context menu', error);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    if ((chrome as any).sidePanel?.open) {
      await (chrome as any).sidePanel.open({ tabId: tab.id });
      return;
    }
    openOrFocusSidebarPopup();
  } catch (error) {
    console.warn('[FloatingCopilot] sidePanel open failed, using popup fallback', error);
    openOrFocusSidebarPopup();
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'floating-copilot-selection') {
    chrome.runtime.sendMessage({ source: 'floating-copilot', type: 'selection', text: info.selectionText || '' });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-global-window') {
    openOrFocusGlobalWindow();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.source === 'floating-copilot') {
    const handler = message.type as string;
    if (handler === 'bootstrap') {
      bootstrap().then(sendResponse).catch((error) => sendResponse({ error: String(error) }));
      return true;
    }
    if (handler === 'capture-page') {
      collectPagePreview(sender.tab?.id).then(sendResponse).catch((error) => sendResponse({ error: String(error) }));
      return true;
    }
    if (handler === 'stream-message') {
      handleStreamRequest(message, sender.tab?.id).then(sendResponse).catch((error) => sendResponse({ error: String(error) }));
      return true;
    }
    if (handler === 'selection') {
      selectionBuffer = message.text || '';
      return;
    }
  }

  if (message.action === 'performAiAction') {
    handleLegacyAction(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.action === 'testChannel') {
    handleTestChannel(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});

async function bootstrap() {
  const cfg = await readConfig(['channels', 'defaultModel', 'translateModel', 'translateTargetLang', 'preferredFeature']);
  const models = Array.isArray(cfg.channels)
    ? cfg.channels.flatMap((ch: any) => (ch.models || []).map((model: string) => `${ch.name}:${model}`))
    : [];
  return {
    models: models.length ? models : ['gpt-4o-mini'],
    defaultFeature: cfg.preferredFeature || 'chat',
    targetLang: cfg.translateTargetLang || 'zh-CN'
  };
}

async function collectPagePreview(tabId?: number | null) {
  if (!tabId) {
    return { preview: selectionBuffer ? `Selection:\n${selectionBuffer}` : 'No active tab.' };
  }

  const fallback = selectionBuffer ? `Selection:\n${selectionBuffer}` : 'Unable to extract page content.';

  const messageResult = await requestPageContentFromContentScript(tabId);
  if (messageResult?.excerpt) {
    return { preview: `Page: ${messageResult.title}\n${messageResult.excerpt}` };
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title || 'Current page';
        const article = document.querySelector('article');
        const main = document.querySelector('main');
        const text = article?.textContent || main?.textContent || document.body?.innerText || '';
        return { title, excerpt: text.slice(0, 2000) };
      }
    });
    if (!result?.result) return { preview: fallback };
    const { title, excerpt } = result.result as { title: string; excerpt: string };
    return { preview: `Page: ${title}\n${excerpt}` };
  } catch (error) {
    console.warn('[FloatingCopilot] collectPagePreview failed', error);
    return { preview: fallback };
  }
}

async function requestPageContentFromContentScript(tabId: number): Promise<{ title: string; excerpt: string } | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'get-page-content' }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve(null);
        return;
      }
      if (response && typeof response.title === 'string') {
        resolve({ title: response.title, excerpt: String(response.excerpt || '') });
      } else {
        resolve(null);
      }
    });
  });
}

async function handleStreamRequest(payload: any, tabId?: number | null) {
  const cfg = await readConfig(['channels', 'defaultModel', 'translateModel', 'activeModel', 'translateTargetLang', 'promptTemplates']);
  const task = mapFeatureToTask(payload.feature);
  const baseText = String(payload.text || '').trim();
  let finalText = baseText;
  if (payload.feature === 'analyze-page') {
    const page = await collectPagePreview(tabId);
    finalText = `${page.preview}\n\nUser note: ${baseText || '(empty)'}`;
  } else if (!finalText && selectionBuffer) {
    finalText = selectionBuffer;
  }

  if (!finalText) {
    return { response: 'No input provided. Please select text on the page or enter a prompt.' };
  }

  const targetLang = payload.targetLang || cfg.translateTargetLang || 'zh-CN';
  const pair = pickModelFromConfig(task, parsePair(payload.model), cfg);
  if (!pair) throw new Error('No available model');
  const channel = ensureChannel(cfg.channels, pair.channel);
  const prompt = makePrompt(task, finalText, targetLang, cfg.promptTemplates || {});
  const response = await runWithStreaming(channel, pair.model, task, prompt);
  return { response };
}

async function handleLegacyAction(request: any) {
  const cfg = await readConfig(['channels', 'defaultModel', 'translateModel', 'translateTargetLang', 'promptTemplates']);
  const pair = pickModelFromConfig(request.task, request.channel && request.model ? { channel: request.channel, model: request.model } : null, cfg);
  if (!pair) throw new Error('No available model');
  const channel = ensureChannel(cfg.channels, pair.channel);
  const targetLang = request.targetLang || cfg.translateTargetLang || 'zh-CN';
  const prompt = makePrompt(request.task, request.text || '', targetLang, cfg.promptTemplates || {});
  const resultText = await invokeModel(channel, pair.model, prompt);
  return { ok: true, result: resultText, channel: pair.channel, model: pair.model };
}

async function handleTestChannel(request: any) {
  const cfg = await readConfig(['channels', 'translateTargetLang', 'promptTemplates']);
  const name = request.channel;
  const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
  const channel = channels.find((c: any) => c.name === name);
  if (!channel) throw new Error('Channel not found');
  const model = request.model || (channel.models && channel.models[0]);
  if (!model) throw new Error('Channel has no models configured');
  const prompt = makePrompt('summarize', 'Connection test. Respond with OK.', cfg.translateTargetLang || 'zh-CN', cfg.promptTemplates || {});
  const sample = await invokeModel(channel, model, prompt);
  return { ok: true, sample };
}

function mapFeatureToTask(feature: string): string {
  if (feature === 'translate') return 'translate';
  if (feature === 'summarize' || feature === 'analyze-page') return 'summarize';
  if (feature === 'rewrite') return 'rewrite';
  return 'chat';
}

function parsePair(value: string | null | undefined) {
  if (!value) return null;
  const [channel, model] = String(value).split(':');
  if (!channel || !model) return null;
  return { channel, model };
}

function ensureChannel(channels: any, name: string) {
  const list = Array.isArray(channels) ? channels : [];
  const channel = list.find((c) => c.name === name);
  if (!channel) throw new Error(`Channel not found: ${name}`);
  return channel;
}

function joinBasePath(base: string, path: string) {
  const b = (base || '').replace(/\/+$/, '');
  return b + path;
}

async function readConfig(keys: string[]) {
  return new Promise<any>((resolve) => {
    chrome.storage.sync.get(keys, (items) => resolve(items));
  });
}

function pickModelFromConfig(task: string, requestPair: any, cfg: any) {
  const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
  const isValid = (pair: any) => {
    if (!pair || !pair.channel || !pair.model) return false;
    const ch = channels.find((c: any) => c.name === pair.channel);
    return !!(ch && Array.isArray(ch.models) && ch.models.includes(pair.model));
  };
  if (isValid(requestPair)) return requestPair;
  if (task === 'translate' && isValid(cfg.translateModel)) return cfg.translateModel;
  if (isValid(cfg.defaultModel)) return cfg.defaultModel;
  if (isValid(cfg.activeModel)) return cfg.activeModel;
  for (const ch of channels) {
    if (Array.isArray(ch.models) && ch.models.length) {
      return { channel: ch.name, model: ch.models[0] };
    }
  }
  return null;
}

function makePrompt(task: string, text: string, lang: string, templates: any) {
  const t = templates && typeof templates === 'object' ? templates : {};
  const target = (lang || 'zh-CN').trim();
  const vars: Record<string, string> = { '{{targetLang}}': target, '{{text}}': (text || '').trim() };
  let tpl = '';
  if (task === 'translate') tpl = t.translate || 'Translate the following content to {{targetLang}}. Return the translation only.\n\n{{text}}';
  else if (task === 'summarize') tpl = t.summarize || 'Summarize the following content in {{targetLang}} with concise bullet points.\n\n{{text}}';
  else if (task === 'rewrite') tpl = t.rewrite || 'Rewrite the following content in {{targetLang}}, keeping the original meaning.\n\n{{text}}';
  else if (task === 'polish') tpl = t.polish || 'Polish the following content in {{targetLang}} to improve fluency.\n\n{{text}}';
  else tpl = 'Provide a helpful answer for the following content:\n\n{{text}}';
  return Object.keys(vars).reduce((acc, key) => acc.split(key).join(vars[key]), tpl);
}

async function runWithStreaming(channel: any, model: string, task: string, prompt: string) {
  const chunks: string[] = [];
  const onChunk = (text: string | null) => {
    if (text) chunks.push(text);
  };
  if (channel.type === 'openai' || channel.type === 'openai-compatible') {
    await streamOpenAI(channel.apiUrl, channel.apiKey, model, prompt, onChunk);
    return chunks.join('');
  }
  if (channel.type === 'gemini') {
    try {
      await streamGemini(channel.apiUrl, channel.apiKey, model, prompt, onChunk);
      return chunks.join('');
    } catch (error) {
      const fallback = await invokeModel(channel, model, prompt);
      return String(fallback);
    }
  }
  const fallback = await invokeModel(channel, model, prompt);
  return String(fallback);
}

async function invokeModel(channel: any, model: string, prompt: string) {
  if (!channel?.apiKey) throw new Error('Channel is missing API key');
  if (channel.type === 'openai' || channel.type === 'openai-compatible') {
    return callOpenAI(channel.apiUrl, channel.apiKey, model, prompt);
  }
  if (channel.type === 'gemini') {
    return callGemini(channel.apiUrl, channel.apiKey, model, prompt);
  }
  throw new Error(`Unsupported channel type: ${channel.type}`);
}

async function callOpenAI(baseUrl: string, apiKey: string, model: string, prompt: string) {
  const url = joinBasePath(baseUrl || 'https://api.openai.com/v1', '/chat/completions');
  const body = { model, messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: prompt }], temperature: 0.2 };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty response');
  return content;
}

async function callGemini(baseUrl: string, apiKey: string, model: string, prompt: string) {
  const base = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = joinBasePath(base, `/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`);
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts;
  const out = Array.isArray(parts) ? parts.map((p: any) => p?.text || '').join('\n') : '';
  if (!out) throw new Error('Gemini returned empty response');
  return out;
}

async function streamOpenAI(baseUrl: string, apiKey: string, model: string, prompt: string, onDelta: (token: string | null, done?: boolean) => void) {
  const url = joinBasePath(baseUrl || 'https://api.openai.com/v1', '/chat/completions');
  const body = { model, stream: true, messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: prompt }], temperature: 0.2 };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('OpenAI stream reader unavailable');
  await sseLoopFromReader(reader, (line) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') {
      onDelta(null, true);
      return;
    }
    try {
      const json = JSON.parse(data);
      const token = json?.choices?.[0]?.delta?.content || '';
      if (token) onDelta(token, false);
    } catch (error) {
      console.warn('[FloatingCopilot] OpenAI chunk parse failed', error);
    }
  });
}

async function streamGemini(baseUrl: string, apiKey: string, model: string, prompt: string, onDelta: (token: string | null, done?: boolean) => void) {
  const base = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = joinBasePath(base, `/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`);
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Gemini stream reader unavailable');
  await sseLoopFromReader(reader, (line) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') {
      onDelta(null, true);
      return;
    }
    try {
      const json = JSON.parse(data);
      const parts = json?.candidates?.[0]?.content?.parts;
      const out = Array.isArray(parts) ? parts.map((p: any) => p?.text || '').join('') : '';
      if (out) onDelta(out, false);
    } catch (error) {
      console.warn('[FloatingCopilot] Gemini chunk parse failed', error);
    }
  });
}

function sseLoopFromReader(reader: ReadableStreamDefaultReader<Uint8Array>, onLine: (line: string) => void) {
  const decoder = new TextDecoder();
  let buffer = '';
  return reader.read().then(function process({ done, value }): Promise<void> | void {
    if (done) {
      if (buffer) {
        buffer.split(/\r?\n/).forEach(onLine);
        buffer = '';
      }
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) onLine(line);
    return reader.read().then(process);
  });
}

async function openOrFocusGlobalWindow() {
  const distUrl = chrome.runtime.getURL('dist/window.html');
  const fallbackUrl = chrome.runtime.getURL('window/dev-fallback.html');
  try {
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => chrome.tabs.query({ url: [distUrl, fallbackUrl] as any }, resolve));
    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      chrome.windows.update(tab.windowId, { focused: true });
      if (tab.id) chrome.tabs.update(tab.id, { active: true });
      return;
    }
  } catch {}
  const targetUrl = await pickExistingExtensionUrl(['dist/window.html', 'dist/src/window/index.html', 'window/dev-fallback.html']);
  chrome.windows.create({ url: targetUrl, type: 'popup', width: 400, height: 600, focused: true });
}

async function pickExistingExtensionUrl(paths: string[]): Promise<string> {
  for (const p of paths) {
    const url = chrome.runtime.getURL(p);
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return url;
    } catch {}
  }
  return chrome.runtime.getURL(paths[0]!);
}

function openOrFocusSidebarPopup() {
  const url = chrome.runtime.getURL(SIDEBAR_PATH);
  chrome.windows.getAll({ populate: true }, (wins) => {
    const tabMatch = (t: chrome.tabs.Tab) => t.url === url;
    const found = wins.find(w => (w.tabs || []).some(tabMatch));
    if (found && found.id) {
      chrome.windows.update(found.id, { focused: true });
      const t = found.tabs?.find(tabMatch);
      if (t?.id) chrome.tabs.update(t.id, { active: true });
    } else {
      chrome.windows.create({ url, type: 'popup', width: 420, height: 640, focused: true });
    }
  });
}





// 端口：用于内容脚本与选项页的流式输出
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-stream') return;
  let disconnected = false;
  try { port.onDisconnect.addListener(() => { disconnected = true; }); } catch {}
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== 'start') return;
    try {
      const { task, text, channel, model, targetLang } = msg as any;
      const cfg = await readConfig(['channels', 'defaultModel', 'translateModel', 'activeModel', 'translateTargetLang', 'promptTemplates']);
      const pair = pickModelFromConfig(task, (channel && model) ? { channel, model } : null, cfg);
      if (!pair) throw new Error('No available model');
      const ch = ensureChannel(cfg.channels, pair.channel);
      const tLang = targetLang || cfg.translateTargetLang || 'zh-CN';
      const prompt = makePrompt(task, String(text || ''), tLang, cfg.promptTemplates || {});
      const safePost = (payload: any) => { if (disconnected) return; try { port.postMessage(payload); } catch {} };
      // 提前告知前端本次实际使用的模型标识
      safePost({ type: 'meta', channel: pair.channel, model: pair.model });

      const onDelta = (delta: string | null, done?: boolean) => {
        if (disconnected) return;
        if (done) safePost({ type: 'done' });
        else if (delta) safePost({ type: 'delta', text: delta });
      };
      if (ch.type === 'openai' || ch.type === 'openai-compatible') {
        await streamOpenAI(ch.apiUrl, ch.apiKey, pair.model, prompt, onDelta);
      } else if (ch.type === 'gemini') {
        try {
          await streamGemini(ch.apiUrl, ch.apiKey, pair.model, prompt, onDelta);
        } catch {
          const full = await invokeModel(ch, pair.model, prompt);
          safePost({ type: 'delta', text: String(full) });
          safePost({ type: 'done' });
        }
      } else {
        const full = await invokeModel(ch, pair.model, prompt);
        safePost({ type: 'delta', text: String(full) });
        safePost({ type: 'done' });
      }
    } catch (error) {
      if (!disconnected) { try { port.postMessage({ type: 'error', error: String(error) }); } catch {} }
    }
  });
});
