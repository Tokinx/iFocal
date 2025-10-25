export { };
let isOpeningGlobalWindow = false; // 打开全局窗口的重入保护
// 全局助手窗口单例 ID 存储键
const GLOBAL_WIN_KEY = 'globalAssistantWindowId';

// 监听窗口关闭，若为全局助手，则清理存储的 ID
try {
  chrome.windows.onRemoved.addListener((windowId) => {
    try {
      chrome.storage.local.get([GLOBAL_WIN_KEY], (items) => {
        if (items && items[GLOBAL_WIN_KEY] === windowId) {
          chrome.storage.local.remove([GLOBAL_WIN_KEY]);
        }
      });
    } catch { }
  });
} catch { }

async function getStoredGlobalWindowId(): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([GLOBAL_WIN_KEY], (items) => {
        const id = items && typeof items[GLOBAL_WIN_KEY] === 'number' ? items[GLOBAL_WIN_KEY] : null;
        resolve(id);
      });
    } catch {
      resolve(null);
    }
  });
}

async function setStoredGlobalWindowId(id: number | null): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof id === 'number') chrome.storage.local.set({ [GLOBAL_WIN_KEY]: id }, () => resolve());
      else chrome.storage.local.remove([GLOBAL_WIN_KEY], () => resolve());
    } catch {
      resolve();
    }
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  // 无侧边栏与全文翻译：无需创建上下文菜单
});

chrome.action.onClicked.addListener(async () => {
  openOrFocusGlobalWindow();
});

// 已移除：上下文菜单点击处理

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-global-window') {
    openOrFocusGlobalWindow();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  // 移除侧边栏相关消息处理（bootstrap/capture-page/selection）

  // 移除 getSupportedLanguages：前端直接使用共享常量

  if (message.action === 'performAiAction') {
    handleLegacyAction(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.action === 'testChannel') {
    handleTestChannel(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  // translateBatch/getRateStatus 已移除（删除全文翻译与侧边栏指标）
});

// 已移除：bootstrap / 页面内容采集相关函数

// 非流式：已移除 handleStreamRequest

async function handleLegacyAction(request: any) {
  const cfg = await readConfig(['channels', 'defaultModel', 'translateModel', 'translateTargetLang', 'promptTemplates']);
  const pair = pickModelFromConfig(request.task, request.channel && request.model ? { channel: request.channel, model: request.model } : null, cfg);
  if (!pair) throw new Error('No available model');
  const channel = ensureChannel(cfg.channels, pair.channel);
  const targetLang = request.targetLang || cfg.translateTargetLang || 'zh-CN';
  const prompt = makePrompt(request.task, request.text || '', targetLang, cfg.promptTemplates || {});
  const context = request.context || undefined;
  const resultText = await invokeModel(channel, pair.model, prompt, context);
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

// 解析供应商响应中的 JSON 数组（容错处理：去除代码块、截取首尾方括号）
function extractJsonArray(raw: string): any[] {
  try {
    // 常见模型会包裹 ```json ... ```
    const fenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const first = fenced.indexOf('[');
    const last = fenced.lastIndexOf(']');
    const slice = first >= 0 && last >= first ? fenced.slice(first, last + 1) : fenced;
    const arr = JSON.parse(slice);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// 自适应限流（B3）：命中 429 时下调并发/QPS，30s 后恢复
import { DEFAULT_RATE } from '@/shared/app-config';
let baseRate = { ...DEFAULT_RATE };
let degradedUntil = 0;
let restoreTimer: any = null;
function applyRate(qps: number, qpm: number, maxConcurrent: number) {
  baseRate = { qps, qpm, maxConcurrent };
  rateLimiter.set({ qps, qpm, maxConcurrent });
}
async function loadBaseRateFromStorage() {
  try {
    const cfg = await readConfig(['txQps', 'txQpm', 'txMaxConcurrent']);
    applyRate(Number(cfg.txQps) || 2, Number(cfg.txQpm) || 120, Number(cfg.txMaxConcurrent) || 1);
  } catch { }
}
function degradeRate() {
  const now = Date.now();
  // 将 QPS 减半，并发降为 1，设置 30s 窗口
  const dqps = Math.max(1, Math.floor(baseRate.qps / 2));
  rateLimiter.set({ qps: dqps, maxConcurrent: 1 });
  degradedUntil = now + 30000;
  if (restoreTimer) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => {
    // 若期间用户修改了配置，以存储为准再恢复
    loadBaseRateFromStorage().then(() => { degradedUntil = 0; }).catch(() => { degradedUntil = 0; });
  }, 30000);
}

// 429/5xx/超时退避策略：429→15s；5xx/超时→2s；最多1次重试
async function withBackoff<T>(fn: () => Promise<T>, opts?: { timeoutMs?: number }): Promise<T> {
  const timeoutMs = opts?.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : undefined;
  const attempt = async (): Promise<T> => {
    if (!timeoutMs) return fn();
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
    ]);
  };
  try {
    return await attempt();
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (msg.includes('429')) {
      degradeRate();
      await sleep(15000);
      return attempt();
    }
    if (msg.includes('5') || msg.toLowerCase().includes('timeout')) {
      await sleep(2000);
      return attempt();
    }
    throw err;
  }
}

// 已移除：全文翻译批量调用相关函数

// ================== B) 并发与令牌桶限流（后台统一出口） ==================
type RateConfig = { qps: number; qpm: number; maxConcurrent: number };
class SimpleRateLimiter {
  private qps = 2;
  private qpm = 120;
  private maxConcurrent = 1;
  private inflight = 0;
  private waiters: Array<() => void> = [];
  private lastSec: number[] = [];
  private lastMin: number[] = [];
  private timer: any = null;
  set(cfg: Partial<RateConfig>) {
    if (typeof cfg.qps === 'number' && cfg.qps > 0) this.qps = cfg.qps;
    if (typeof cfg.qpm === 'number' && cfg.qpm > 0) this.qpm = cfg.qpm;
    if (typeof cfg.maxConcurrent === 'number' && cfg.maxConcurrent > 0) this.maxConcurrent = cfg.maxConcurrent;
    this.tick();
  }
  private cleanup(now: number) {
    const secAgo = now - 1000;
    while (this.lastSec.length && this.lastSec[0]! < secAgo) this.lastSec.shift();
    const minAgo = now - 60000;
    while (this.lastMin.length && this.lastMin[0]! < minAgo) this.lastMin.shift();
  }
  private nextDelay(now: number): number {
    this.cleanup(now);
    let delay = 0;
    if (this.lastSec.length >= this.qps) delay = Math.max(delay, (this.lastSec[0]! + 1000) - now);
    if (this.lastMin.length >= this.qpm) delay = Math.max(delay, (this.lastMin[0]! + 60000) - now);
    if (this.inflight >= this.maxConcurrent) delay = Math.max(delay, 50);
    return Math.max(0, delay);
  }
  private schedule(next: number) {
    if (this.timer) clearTimeout(this.timer);
    // 始终异步调度，避免递归触发栈溢出
    const delay = Math.max(0, next);
    this.timer = setTimeout(() => this.tick(), delay + 1);
  }
  private tick() {
    this.timer = null;
    const now = Date.now();
    let progressed = false;
    this.cleanup(now);
    while (this.waiters.length && this.lastSec.length < this.qps && this.lastMin.length < this.qpm && this.inflight < this.maxConcurrent) {
      const w = this.waiters.shift()!;
      this.lastSec.push(now);
      this.lastMin.push(now);
      this.inflight++;
      progressed = true;
      try { w(); } catch { }
    }
    // 若没有等待者则无需继续调度，避免空转递归
    if (!this.waiters.length) return;
    const delay = this.nextDelay(Date.now());
    this.schedule(delay);
  }
  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.tick();
    });
  }
  release() {
    if (this.inflight > 0) this.inflight--;
    this.tick();
  }
}

const rateLimiter = new SimpleRateLimiter();
// 从存储加载限流配置（如未设置使用默认）
(async () => { await loadBaseRateFromStorage(); })();
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const has = (k: string) => changes[k] && typeof changes[k].newValue !== 'undefined';
    if (has('txQps') || has('txQpm') || has('txMaxConcurrent')) {
      rateLimiter.set({ qps: Number(changes.txQps?.newValue) || undefined as any, qpm: Number(changes.txQpm?.newValue) || undefined as any, maxConcurrent: Number(changes.txMaxConcurrent?.newValue) || undefined as any });
    }
  });
} catch { }

async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  await rateLimiter.acquire();
  try { return await fn(); }
  finally { rateLimiter.release(); }
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

import { makePrompt, makeMessage } from '@/shared/ai';

// 非流式：移除 runWithStreaming 与流式供应商实现

async function invokeModel(channel: any, model: string, prompt: string, context?: Array<{role: string, content: string}>) {
  if (!channel?.apiKey) throw new Error('Channel is missing API key');
  if (channel.type === 'openai' || channel.type === 'openai-compatible') {
    return callOpenAI(channel.apiUrl, channel.apiKey, model, prompt, context);
  }
  if (channel.type === 'gemini') {
    return callGemini(channel.apiUrl, channel.apiKey, model, prompt, context);
  }
  throw new Error(`Unsupported channel type: ${channel.type}`);
}

async function callOpenAI(baseUrl: string, apiKey: string, model: string, prompt: string, context?: Array<{role: string, content: string}>) {
  const url = joinBasePath(baseUrl || 'https://api.openai.com/v1', '/chat/completions');
  const body = { model, messages: makeMessage(model, prompt, 'You are a helpful assistant.', context), temperature: 0.2 };
  return rateLimited(async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty response');
    return content;
  });
}

async function callGemini(baseUrl: string, apiKey: string, model: string, prompt: string, context?: Array<{role: string, content: string}>) {
  const base = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = joinBasePath(base, `/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`);

  // 构建 Gemini 格式的消息内容
  let contents;
  if (context && Array.isArray(context) && context.length > 0) {
    // 多轮对话：转换为 Gemini 的 contents 格式
    contents = context.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    })).concat([{
      role: 'user',
      parts: [{ text: prompt }]
    }]);
  } else {
    // 单轮对话
    contents = [{ parts: [{ text: prompt }] }];
  }

  const body = { contents };
  return rateLimited(async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts;
    const out = Array.isArray(parts) ? parts.map((p: any) => p?.text || '').join('\n') : '';
    if (!out) throw new Error('Gemini returned empty response');
    return out;
  });
}

async function openOrFocusGlobalWindow() {
  if (isOpeningGlobalWindow) return;
  isOpeningGlobalWindow = true;
  try {
    const distUrl = chrome.runtime.getURL('dist/window.html');
    const altDistUrl = chrome.runtime.getURL('dist/src/window/index.html');
    // 先尝试通过已记录的窗口 ID 聚焦，确保单例
    try {
      const storedId = await getStoredGlobalWindowId();
      if (typeof storedId === 'number') {
        try {
          await new Promise<void>((resolve, reject) => {
            chrome.windows.update(storedId, { focused: true }, (w) => {
              const err = chrome.runtime.lastError; if (err || !w) reject(err || new Error('no window'));
              else resolve();
            });
          });
          return;
        } catch {
          // 若失败，说明记录已失效，继续走后续逻辑
          await setStoredGlobalWindowId(null);
        }
      }
    } catch { }
    try {
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => chrome.tabs.query({ url: [distUrl, altDistUrl] as any }, resolve));
      if (tabs && tabs.length > 0) {
        // 仅保留第一个，全局窗口保持单例
        const primary = tabs[0];
        try {
          chrome.windows.update(primary.windowId, { focused: true });
          if (primary.id) chrome.tabs.update(primary.id, { active: true });
          // 记录主窗口 ID
          if (typeof primary.windowId === 'number') { try { await setStoredGlobalWindowId(primary.windowId); } catch { } }
        } catch { }
        // 关闭多余的重复页面（若有）
        const extras = tabs.slice(1).map((t) => t.id).filter((id): id is number => typeof id === 'number');
        if (extras.length) {
          try { chrome.tabs.remove(extras); } catch { }
        }
        return;
      }
    } catch { }

    const targetUrl = await pickExistingExtensionUrl(['dist/window.html', 'dist/src/window/index.html']);
    // 居中计算：基于最后聚焦的浏览器窗口
    const width = 420;
    const height = 640;
    let left: number | undefined;
    let top: number | undefined;
    try {
      const last = await new Promise<chrome.windows.Window>((resolve) => chrome.windows.getLastFocused(resolve));
      const hasBounds = typeof last.left === 'number' && typeof last.top === 'number' && typeof last.width === 'number' && typeof last.height === 'number';
      if (hasBounds) {
        left = Math.max(0, (last.left as number) + Math.round(((last.width as number) - width) / 2));
        top = Math.max(0, (last.top as number) + Math.round(((last.height as number) - height) / 2));
      }
    } catch { }
    const createData: chrome.windows.CreateData = { url: targetUrl, type: 'popup', width, height, focused: true } as any;
    if (typeof left === 'number' && typeof top === 'number') {
      (createData as any).left = left;
      (createData as any).top = top;
    }
    try {
      const win = await new Promise<chrome.windows.Window | null>((resolve) => chrome.windows.create(createData, (w) => resolve(w || null)));
      if (win && typeof win.id === 'number') { try { await setStoredGlobalWindowId(win.id); } catch { } }
    } catch {
      chrome.windows.create({ url: targetUrl, type: 'popup', width, height, focused: true }, (w) => {
        try { if (w && typeof w.id === 'number') setStoredGlobalWindowId(w.id); } catch { }
      });
    }
  } finally {
    isOpeningGlobalWindow = false;
  }
}

async function pickExistingExtensionUrl(paths: string[]): Promise<string> {
  for (const p of paths) {
    const url = chrome.runtime.getURL(p);
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return url;
    } catch { }
  }
  return chrome.runtime.getURL(paths[0]!);
}

// 已移除：侧边栏弹窗入口





// 流式端口已移除：统一使用非流式 performAiAction
