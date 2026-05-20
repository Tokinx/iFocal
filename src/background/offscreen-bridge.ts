// 端侧模型在 background 端的桥接：
//   1. ensureOffscreen()：管理 offscreen document 生命周期
//   2. forwardLocalStream()：把请求转发到 offscreen，处理 tool-call 反向请求 + 流式回投
//   3. probeLocalProvider()：能力检测
//
// 设计要点：
//   - per-request 创建一个 chrome.runtime.connect port，对应 offscreen 侧的 stream 处理
//   - tool 描述符（来自 local-mcp-dispatcher.prepareLocalMcpTools）随 'start' 消息一起下发
//   - tool-call-request 反向请求由 callOneLocalMcpTool 执行，结果通过 'tool-result' 回 offscreen

import {
  PORT_NAME_LOCAL_LLM_PROBE,
  PORT_NAME_OFFSCREEN_KEEPALIVE,
  makeStreamPortName,
  type LocalLlmAvailability,
  type LocalLlmHostInbound,
  type LocalLlmHostOutbound,
  type LocalLlmMessage,
  type LocalLlmParams,
  type LocalLlmProbeResult,
  type LocalLlmProviderId,
} from '@/shared/local-llm-types';


const OFFSCREEN_URL = 'dist/offscreen.html';

let ensurePromise: Promise<void> | null = null;
let keepalivePort: chrome.runtime.Port | null = null;

function diagnoseOffscreenApi(): { ok: boolean; reason?: string } {
  const c: any = (typeof chrome !== 'undefined') ? chrome : undefined;
  if (!c) return { ok: false, reason: 'chrome 全局对象不可用' };
  if (typeof c.offscreen === 'undefined') {
    return {
      ok: false,
      reason: 'chrome.offscreen API 不存在。请确认：(1) Chrome 版本 ≥ 109；(2) manifest 包含 "offscreen" permission；(3) 已在 chrome://extensions 重新加载扩展使权限生效。',
    };
  }
  if (typeof c.offscreen.createDocument !== 'function') {
    return { ok: false, reason: 'chrome.offscreen 存在但 createDocument 不是函数（Chrome 版本可能过旧）' };
  }
  return { ok: true };
}

function hasOffscreenApi(): boolean {
  return diagnoseOffscreenApi().ok;
}
void hasOffscreenApi; // 保留导出形态以便后续扩展，silence unused warning


async function offscreenExists(): Promise<boolean> {
  const api: any = chrome as any;
  if (typeof api.runtime?.getContexts === 'function') {
    try {
      const ctx = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      return Array.isArray(ctx) && ctx.length > 0;
    } catch { /* fall through */ }
  }
  if (typeof api.offscreen?.hasDocument === 'function') {
    try { return await api.offscreen.hasDocument(); } catch { /* fall through */ }
  }
  return false;
}

export async function ensureOffscreen(): Promise<void> {
  const diag = diagnoseOffscreenApi();
  if (!diag.ok) {
    console.error('[iFocal][offscreen] ensureOffscreen failed:', diag.reason);
    throw new Error(diag.reason || 'chrome.offscreen API 不可用');
  }
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    if (await offscreenExists()) return;
    try {
      await (chrome as any).offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ['WORKERS'],
        justification: 'Run Chrome built-in Gemini Nano on-device model which requires the LanguageModel API unavailable in service workers.',
      });
    } catch (error) {
      ensurePromise = null;
      console.error('[iFocal][offscreen] createDocument failed:', error);
      throw error;
    }
  })();
  try {
    await ensurePromise;
  } catch (e) {
    ensurePromise = null;
    throw e;
  }
  ensureKeepalive();
}

function ensureKeepalive(): void {
  if (keepalivePort) return;
  try {
    keepalivePort = chrome.runtime.connect({ name: PORT_NAME_OFFSCREEN_KEEPALIVE });
    keepalivePort.onDisconnect.addListener(() => {
      keepalivePort = null;
    });
  } catch {
    keepalivePort = null;
  }
}

export async function checkOffscreenAvailability(): Promise<LocalLlmAvailability | null> {
  const diag = diagnoseOffscreenApi();
  if (!diag.ok) return 'no-offscreen-api';
  return null;
}

export async function probeLocalProvider(providerId: LocalLlmProviderId): Promise<LocalLlmProbeResult> {
  const diag = diagnoseOffscreenApi();
  if (!diag.ok) {
    return { providerId, availability: 'no-offscreen-api', reason: diag.reason };
  }
  try {
    await ensureOffscreen();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // ensureOffscreen 失败可能是 createDocument 失败（路径错、reasons 不支持、document 已存在但状态异常等）
    // 这种情况下 chrome.offscreen 本身存在，分类为 probe-failed 而不是 no-offscreen-api
    return {
      providerId,
      availability: 'probe-failed',
      reason: `offscreen 初始化失败：${reason}`,
    };
  }
  return new Promise<LocalLlmProbeResult>((resolve) => {
    let port: chrome.runtime.Port | null = null;
    let settled = false;
    const finish = (result: LocalLlmProbeResult) => {
      if (settled) return;
      settled = true;
      try { port?.disconnect(); } catch { /* ignore */ }
      resolve(result);
    };
    try {
      port = chrome.runtime.connect({ name: PORT_NAME_LOCAL_LLM_PROBE });
      port.onMessage.addListener((msg: LocalLlmProbeResult) => finish(msg));
      port.onDisconnect.addListener(() => finish({ providerId, availability: 'probe-failed', reason: 'offscreen disconnected' }));
      port.postMessage({ providerId });
      setTimeout(() => finish({ providerId, availability: 'probe-failed', reason: 'probe timeout' }), 5000);
    } catch (error) {
      finish({
        providerId,
        availability: 'probe-failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

// 把 background 已有的 system+context+prompt 组装成 LocalLlmMessage[]
export function buildLocalMessages(args: {
  systemPrompt?: string;
  prompt: string;
  context?: Array<{ role: string; content: string }>;
  systemPromptCompatMode?: boolean;
}): LocalLlmMessage[] {
  const messages: LocalLlmMessage[] = [];
  const sysContent = (args.systemPrompt || '').trim();

  if (sysContent && !args.systemPromptCompatMode) {
    messages.push({ role: 'system', content: sysContent });
  }

  const compatPrefix = args.systemPromptCompatMode && sysContent ? `${sysContent}\n\n` : '';

  if (Array.isArray(args.context)) {
    for (const m of args.context) {
      const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user';
      const content = String(m.content || '');
      if (!content) continue;
      messages.push({ role, content });
    }
  }

  messages.push({ role: 'user', content: `${compatPrefix}${args.prompt}` });
  return messages;
}

export type ForwardLocalStreamArgs = {
  channelName: string;
  providerId: LocalLlmProviderId;
  modelId: string;
  systemPrompt?: string;
  systemPromptCompatMode?: boolean;
  prompt: string;
  context?: Array<{ role: string; content: string }>;
  params?: LocalLlmParams;
  mcpServers: unknown;
  enabledMcpServers?: string[];
  stream: boolean;
  onChunk?: (chunk: string) => void;
  onToolStatus?: (status: import('@/shared/local-llm-types').LocalMcpToolStatus) => void;
  shouldStop?: () => boolean;
  signal?: AbortSignal;
};

export async function forwardLocalStream(args: ForwardLocalStreamArgs): Promise<{ content: string }> {
  await ensureOffscreen();

  const reqId = `local-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const messages = buildLocalMessages({
    systemPrompt: args.systemPrompt,
    prompt: args.prompt,
    context: args.context,
    systemPromptCompatMode: !!args.systemPromptCompatMode,
  });

  let fullContent = '';
  let port: chrome.runtime.Port | null = null;
  let disconnected = false;

  const cleanup = async () => {
    if (port && !disconnected) {
      try { port.disconnect(); } catch { /* ignore */ }
      disconnected = true;
    }
  };

  try {
    return await new Promise<{ content: string }>((resolve, reject) => {
      const portName = makeStreamPortName(reqId);
      port = chrome.runtime.connect({ name: portName });

      const safePost = (msg: LocalLlmHostInbound) => {
        if (disconnected) return;
        try { port?.postMessage(msg); } catch { /* ignore */ }
      };

      port.onDisconnect.addListener(() => {
        disconnected = true;
        reject(new Error('Offscreen 已断开'));
      });

      port.onMessage.addListener(async (msg: LocalLlmHostOutbound) => {
        switch (msg.kind) {
          case 'start':
            return;
          case 'chunk': {
            const piece = String(msg.content || '');
            fullContent += piece;
            if (args.stream && args.onChunk) args.onChunk(piece);
            return;
          }
          case 'toolStatus': {
            args.onToolStatus?.(msg.status);
            return;
          }
          case 'tool-call-request': {
            return;
          }
          case 'done':
            resolve({ content: fullContent });
            return;
          case 'error':
            reject(new Error(msg.error || '本地模型调用失败'));
            return;
          case 'download-progress':
            return;
        }
      });

      // abort 钩子
      const abort = () => safePost({ kind: 'abort', reqId });
      if (args.signal) {
        if (args.signal.aborted) abort();
        else args.signal.addEventListener('abort', abort, { once: true });
      }
      const stopChecker = args.shouldStop ? setInterval(() => {
        if (args.shouldStop?.()) {
          clearInterval(stopChecker as any);
          abort();
        }
      }, 100) : null;
      const clearTimer = () => { if (stopChecker) clearInterval(stopChecker as any); };

      // 发起
      safePost({
        kind: 'start',
        reqId,
        providerId: args.providerId,
        modelId: args.modelId,
        messages,
        params: args.params,
        tools: undefined,
      });

      const originalResolve = resolve;
      const originalReject = reject;
      resolve = ((v: any) => { clearTimer(); originalResolve(v); }) as typeof resolve;
      reject = ((e: any) => { clearTimer(); originalReject(e); }) as typeof reject;
    });
  } finally {
    await cleanup();
  }
}
