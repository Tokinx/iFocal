export { };

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { stepCountIs, streamText, type ModelMessage, type ToolSet } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID,
  getDefaultMachineTranslateApiUrl,
  getMachineTranslateProviderMeta,
  normalizeMachineTranslateChannels,
  normalizeMachineTranslateDefaultChannelId,
  type MachineTranslateChannel,
  type MachineTranslateProvider,
} from '@/shared/machine-translation';
import {
  normalizeMcpServers,
  type McpServerConfig,
  type McpServersConfig,
} from '@/shared/mcp';

let isOpeningGlobalWindow = false; // 打开全局窗口的重入保护
// 全局助手窗口单例 ID 存储键
const GLOBAL_WIN_KEY = 'globalAssistantWindowId';
const GLOBAL_WIN_VIEW_KEY = 'globalAssistantWindowRequestedView';
const CONTEXT_MENU_TRANSLATE_FULL_PAGE = 'ifocal-translate-full-page';
const CONTEXT_MENU_TITLE_TRANSLATE = '网页全文翻译';
const CONTEXT_MENU_TITLE_SHOW_ORIGINAL = '显示原文';
const CONTEXT_MENU_TITLE_SHOW_TRANSLATION = '显示译文';

type FullPageTranslationState = {
  ok?: boolean;
  hasSession?: boolean;
  visibleMode?: 'translation' | 'original' | 'none';
  translated?: number;
  failed?: number;
  processing?: boolean;
};

type McpOpenAITool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type McpToolReference = {
  serverName: string;
  server: McpServerConfig;
  toolName: string;
};

type McpToolContext = {
  tools: McpOpenAITool[];
  toolRefs: Record<string, McpToolReference>;
};

type McpToolCacheEntry = McpToolContext & {
  expiresAt: number;
};

type AiSdkMcpToolContext = {
  tools: ToolSet;
  clients: MCPClient[];
  toolRefs: Record<string, McpToolReference>;
};

type ModelInvokeOptions = {
  enableReasoning?: boolean;
  reasoningEffort?: ReasoningEffort;
  shouldStop?: () => boolean;
  signal?: AbortSignal;
  attachments?: any[];
  systemPrompt?: string;
  enabledMcpServers?: string[];
  mcpServers?: McpServersConfig;
};

const MCP_TOOL_CACHE_TTL_MS = 5 * 60 * 1000;
const MCP_CONNECT_TIMEOUT_MS = 15000;
const MCP_REQUEST_TIMEOUT_MS = 20000;
const MCP_MAX_TOOL_CALLS_PER_TURN = 8;
const MCP_MAX_TOOL_RESULT_CHARS = 20000;
const mcpToolCache = new Map<string, McpToolCacheEntry>();
const MCP_CSP_SAFE_JSON_SCHEMA_VALIDATOR = {
  getValidator() {
    return (input: unknown) => ({ valid: true, data: input, errorMessage: undefined });
  },
};

// 监听窗口关闭，若为全局助手，则清理存储的 ID
// 非流式请求中断：为每个 requestId 维护 AbortController
const abortControllers: Record<string, AbortController> = {};
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

function ensureContextMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      try { void chrome.runtime.lastError; } catch { }
      try {
        chrome.contextMenus.create({
          id: CONTEXT_MENU_TRANSLATE_FULL_PAGE,
          title: CONTEXT_MENU_TITLE_TRANSLATE,
          contexts: ['page', 'selection'],
        }, () => {
          try { void chrome.runtime.lastError; } catch { }
        });
      } catch { }
    });
  } catch { }
}

function sendTabMessage<T = any>(tabId: number, message: any, frameId?: number): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const callback = (response?: T) => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          resolve(null);
          return;
        }
        resolve(response ?? null);
      };
      if (typeof frameId === 'number') chrome.tabs.sendMessage(tabId, message, { frameId }, callback);
      else chrome.tabs.sendMessage(tabId, message, callback);
    } catch {
      resolve(null);
    }
  });
}

function sendFullPageTranslateMessage(tabId: number, frameId?: number): Promise<void> {
  return sendTabMessage(tabId, { action: 'translateFullPage' }, frameId).then(() => undefined);
}

async function getFullPageTranslationState(tabId: number, frameId?: number): Promise<FullPageTranslationState | null> {
  return sendTabMessage<FullPageTranslationState>(tabId, { action: 'getFullPageTranslationState' }, frameId);
}

function updateFullPageContextMenuTitle(title: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.contextMenus.update(CONTEXT_MENU_TRANSLATE_FULL_PAGE, { title }, () => {
        try { void chrome.runtime.lastError; } catch { }
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

async function refreshFullPageContextMenuTitle(tabId: number, frameId?: number) {
  const state = await getFullPageTranslationState(tabId, frameId);
  let title = CONTEXT_MENU_TITLE_TRANSLATE;
  if (state?.hasSession && Number(state.translated || 0) > 0) {
    title = state.visibleMode === 'original'
      ? CONTEXT_MENU_TITLE_SHOW_TRANSLATION
      : CONTEXT_MENU_TITLE_SHOW_ORIGINAL;
  }
  await updateFullPageContextMenuTitle(title);
}

async function toggleFullPageTranslationDisplay(tabId: number, frameId?: number) {
  const state = await getFullPageTranslationState(tabId, frameId);
  if (state?.hasSession && Number(state.translated || 0) > 0) {
    if (state.visibleMode === 'original') {
      await sendTabMessage(tabId, { action: 'showFullPageTranslation' }, frameId);
    } else {
      await sendTabMessage(tabId, { action: 'showFullPageOriginal' }, frameId);
    }
    return;
  }
  await sendFullPageTranslateMessage(tabId, frameId);
}

async function triggerFullPageTranslateInActiveTab() {
  try {
    const tabId = await new Promise<number | null>((resolve) => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve(typeof tabs?.[0]?.id === 'number' ? tabs[0]!.id! : null);
        });
      } catch {
        resolve(null);
      }
    });
    if (typeof tabId !== 'number') return;
    await sendFullPageTranslateMessage(tabId);
  } catch { }
}

chrome.runtime.onInstalled.addListener(async () => {
  ensureContextMenus();
});

try {
  chrome.runtime.onStartup.addListener(() => {
    ensureContextMenus();
  });
} catch { }

ensureContextMenus();

chrome.action.onClicked.addListener(async () => {
  openOrFocusGlobalWindow();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_TRANSLATE_FULL_PAGE) return;
  if (typeof tab?.id !== 'number') return;
  const frameId = typeof info.frameId === 'number' ? info.frameId : undefined;
  void toggleFullPageTranslationDisplay(tab.id, frameId).then(() => refreshFullPageContextMenuTitle(tab.id!, frameId));
});

try {
  chrome.contextMenus.onShown.addListener((info, tab) => {
    if (typeof tab?.id !== 'number') return;
    const frameId = typeof (info as any)?.frameId === 'number' ? (info as any).frameId : undefined;
    void refreshFullPageContextMenuTitle(tab.id, frameId).finally(() => {
      try { chrome.contextMenus.refresh(); } catch { }
    });
  });
} catch { }

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-global-window') {
    openOrFocusGlobalWindow();
    return;
  }
  if (command === 'translate-full-page') {
    void triggerFullPageTranslateInActiveTab();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  // 移除侧边栏相关消息处理（bootstrap/capture-page/selection）

  // 移除 getSupportedLanguages：前端直接使用共享常量

  if (message.action === 'performAiAction') {
    handleLegacyAction(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }
  if (message.action === 'abortRequest') {
    try {
      const id = String(message.requestId || '');
      if (id && abortControllers[id]) {
        try { abortControllers[id]!.abort(); } catch { }
        delete abortControllers[id];
      }
      sendResponse({ ok: true });
    } catch (e: any) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return false;
  }

  if (message.action === 'testChannel') {
    handleTestChannel(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (message.action === 'testMcpServer') {
    handleTestMcpServer(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (message.action === 'testMachineTranslateChannel') {
    handleTestMachineTranslateChannel(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (message.action === 'machineTranslateBatch') {
    handleMachineTranslateBatch(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (message.action === 'openSettingsCenter') {
    openOrFocusGlobalWindow({ openSettings: true }).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  // translateBatch/getRateStatus 已移除（删除全文翻译与侧边栏指标）
});


// 流式响应：通过 Port 长连接通信
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'streaming') return;

  let portDisconnected = false;
  try { port.onDisconnect.addListener(() => { portDisconnected = true; }); } catch { }

  const safePost = (msg: any) => {
    if (portDisconnected) return;
    try { port.postMessage(msg); } catch { /* 端口已断开，忽略 */ }
  };

  port.onMessage.addListener(async (message) => {
    if (message.action !== 'performAiAction') return;

    try {
      const attachments = Array.isArray(message.attachments) ? message.attachments : undefined;
      const text = ensureTextOrAttachments(message.text, attachments);
      const cfg = await readConfig(['channels', 'defaultModel', 'activeModel', 'translateTargetLang', 'prevLanguage', 'promptTemplates', 'systemPrompt', 'mcpServers']);
      const pair = pickModelFromConfig(message.task, message.channel && message.model ? { channel: message.channel, model: message.model } : null, cfg);
      if (!pair) throw new Error('No available model');
      const channel = ensureChannel(cfg.channels, pair.channel);
      const targetLang = message.targetLang || cfg.translateTargetLang || 'zh-CN';
      const prevLang = message.prevLang || cfg.prevLanguage || 'en';
      const assistantPrompt = typeof message.assistantPrompt === 'string' ? message.assistantPrompt.trim() : '';
      const { systemPrompt: taskSystemPrompt, userPrompt } = assistantPrompt
        ? makePromptPartsFromTemplate(assistantPrompt, text, targetLang, prevLang)
        : makePromptParts(message.task, text, targetLang, cfg.promptTemplates || {}, prevLang);
      const prompt = userPrompt;
      const context = message.context || undefined;
      const enableReasoning = !!message.enableReasoning;
      const reasoningEffort = normalizeReasoningEffort(message.reasoningEffort);
      const enabledMcpServers = Array.isArray(message.enabledMcpServers)
        ? normalizeEnabledMcpServerNames(message.enabledMcpServers)
        : undefined;
      const requestSystemPrompt = typeof message.systemPrompt === 'string' ? message.systemPrompt.trim() : '';
      const configSystemPrompt = typeof cfg.systemPrompt === 'string' ? cfg.systemPrompt.trim() : '';
      const systemPrompt = requestSystemPrompt || configSystemPrompt || taskSystemPrompt;

      // 通知开始
      safePost({ type: 'start', channel: pair.channel, model: pair.model });

      // 流式调用，每次收到 chunk 就发送给前端
      await invokeModel(
        channel,
        pair.model,
        prompt,
        context,
        true,
        (chunk: string) => {
          if (!portDisconnected) safePost({ type: 'chunk', content: chunk });
        },
        {
          enableReasoning,
          reasoningEffort,
          shouldStop: () => portDisconnected,
          attachments,
          systemPrompt,
          enabledMcpServers,
          mcpServers: cfg.mcpServers,
        }
      );

      // 通知完成
      safePost({ type: 'done' });
    } catch (error: any) {
      safePost({ type: 'error', error: getErrorMessage(error) });
    }
  });
});

// 已移除：bootstrap / 页面内容采集相关函数

// 非流式：已移除 handleStreamRequest

async function handleLegacyAction(request: any) {
  const attachments = Array.isArray(request.attachments) ? request.attachments : undefined;
  const text = ensureTextOrAttachments(request.text, attachments);
  const cfg = await readConfig(['channels', 'defaultModel', 'activeModel', 'translateTargetLang', 'prevLanguage', 'promptTemplates', 'systemPrompt', 'mcpServers']);
  const pair = pickModelFromConfig(request.task, request.channel && request.model ? { channel: request.channel, model: request.model } : null, cfg);
  if (!pair) throw new Error('No available model');
  const channel = ensureChannel(cfg.channels, pair.channel);
  const targetLang = request.targetLang || cfg.translateTargetLang || 'zh-CN';
  const prevLang = request.prevLang || cfg.prevLanguage || 'en';
  const assistantPrompt = typeof request.assistantPrompt === 'string' ? request.assistantPrompt.trim() : '';
  const { systemPrompt: taskSystemPrompt, userPrompt } = assistantPrompt
    ? makePromptPartsFromTemplate(assistantPrompt, text, targetLang, prevLang)
    : makePromptParts(request.task, text, targetLang, cfg.promptTemplates || {}, prevLang);
  const prompt = userPrompt;
  const context = request.context || undefined;
  const enableStreaming = request.enableStreaming || false;
  const enableReasoning = !!request.enableReasoning;
  const reasoningEffort = normalizeReasoningEffort(request.reasoningEffort);
  const enabledMcpServers = Array.isArray(request.enabledMcpServers)
    ? normalizeEnabledMcpServerNames(request.enabledMcpServers)
    : undefined;
  const requestSystemPrompt = typeof request.systemPrompt === 'string' ? request.systemPrompt.trim() : '';
  const configSystemPrompt = typeof cfg.systemPrompt === 'string' ? cfg.systemPrompt.trim() : '';
  const systemPrompt = requestSystemPrompt || configSystemPrompt || taskSystemPrompt;
  const reqId = request.requestId ? String(request.requestId) : '';
  const controller = new AbortController();
  if (!enableStreaming && reqId) abortControllers[reqId] = controller;

  if (enableStreaming) {
    // 流式响应：通过 Port 通信
    throw new Error('Stream mode requires port connection');
  } else {
    // 非流式响应
    try {
      const resultText = await invokeModel(channel, pair.model, prompt, context, false, undefined, {
        enableReasoning,
        reasoningEffort,
        signal: controller.signal,
        attachments,
        systemPrompt,
        enabledMcpServers,
        mcpServers: cfg.mcpServers,
      });
      return { ok: true, result: resultText, channel: pair.channel, model: pair.model };
    } finally {
      if (reqId && abortControllers[reqId]) delete abortControllers[reqId];
    }
  }
}

function ensureTextOrAttachments(text: unknown, attachments?: unknown): string {
  const normalized = String(text ?? '').trim();
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!normalized && !hasAttachments) {
    throw new Error('输入内容不能为空，请先输入文本或上传文件后再试。');
  }
  return normalized;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
    const msg = (error as any).message.trim();
    if (msg) return msg;
  }
  return String(error ?? '未知错误');
}

function normalizeEnabledMcpServerNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = new Set<string>();
  for (const item of value) {
    const name = String(item || '').trim();
    if (name) names.add(name);
  }
  return [...names];
}

function resolveEnabledMcpServerNames(enabledServers: unknown, rawServers: unknown): string[] {
  if (Array.isArray(enabledServers)) {
    return normalizeEnabledMcpServerNames(enabledServers);
  }

  const servers = normalizeMcpServers(rawServers);
  return Object.entries(servers)
    .filter(([, server]) => server.enabled !== false)
    .map(([name]) => name);
}

async function resolveMcpToolContext(rawServers: unknown, enabledServers: unknown): Promise<McpToolContext> {
  const names = resolveEnabledMcpServerNames(enabledServers, rawServers);
  if (!names.length) return { tools: [], toolRefs: {} };

  const servers = normalizeMcpServers(rawServers);
  const tools: McpOpenAITool[] = [];
  const toolRefs: Record<string, McpToolReference> = {};

  for (const name of names) {
    const server = servers[name];
    if (!server?.url) continue;
    try {
      const entry = await getMcpServerTools(name, server);
      tools.push(...entry.tools);
      Object.assign(toolRefs, entry.toolRefs);
    } catch (error) {
      console.warn(`[MCP] 加载工具失败：${name}`, error);
    }
  }

  if (!tools.length) {
    console.warn('[MCP] 已启用 MCP Server，但未加载到可注入工具：', names);
  }
  return { tools, toolRefs };
}

async function resolveAiSdkMcpToolContext(rawServers: unknown, enabledServers: unknown): Promise<AiSdkMcpToolContext> {
  const names = resolveEnabledMcpServerNames(enabledServers, rawServers);
  if (!names.length) return { tools: {}, clients: [], toolRefs: {} };

  const servers = normalizeMcpServers(rawServers);
  const tools: ToolSet = {};
  const clients: MCPClient[] = [];
  const toolRefs: Record<string, McpToolReference> = {};
  const usedNames = new Set<string>();

  for (const name of names) {
    const server = servers[name];
    if (!server?.url) continue;

    let client: MCPClient | null = null;
    try {
      client = await withMcpTimeout(createAiSdkMcpClient(name, server), MCP_CONNECT_TIMEOUT_MS, `连接 MCP 超时：${name}`);
      const definitions = await withMcpTimeout(client.listTools({
        options: {
          timeout: MCP_REQUEST_TIMEOUT_MS,
          maxTotalTimeout: MCP_REQUEST_TIMEOUT_MS,
        },
      }), MCP_REQUEST_TIMEOUT_MS, `读取 MCP 工具超时：${name}`);
      const serverTools = client.toolsFromDefinitions(definitions);

      for (const [toolName, toolDef] of Object.entries(serverTools)) {
        const functionName = chooseAiSdkMcpFunctionName(name, toolName, usedNames);
        usedNames.add(functionName);
        tools[functionName] = toolDef as ToolSet[string];
        toolRefs[functionName] = {
          serverName: name,
          server: { ...server },
          toolName,
        };
      }

      clients.push(client);
      client = null;
    } catch (error) {
      console.warn(`[MCP] 加载 AI SDK 工具失败：${name}`, error);
    } finally {
      if (client) {
        try { await client.close(); } catch { }
      }
    }
  }

  if (!Object.keys(tools).length) {
    console.warn('[MCP] 已启用 MCP Server，但未加载到可注入 AI SDK 工具：', names);
    await closeAiSdkMcpClients(clients);
    return { tools: {}, clients: [], toolRefs: {} };
  }

  return { tools, clients, toolRefs };
}

async function createAiSdkMcpClient(serverName: string, server: McpServerConfig): Promise<MCPClient> {
  const headers = headersInitToRecord(buildMcpAuthHeaders(server));
  return createMCPClient({
    name: 'ifocal',
    version: '0.4.0',
    transport: {
      type: server.type === 'sse' ? 'sse' : 'http',
      url: server.url,
      ...(headers ? { headers } : {}),
      fetch: safeWorkerFetch as any,
    },
    onUncaughtError(error) {
      console.warn(`[MCP] ${serverName} 未捕获错误：`, error);
    },
  });
}

function headersInitToRecord(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const record: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      record[String(key)] = String(value);
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'undefined') record[key] = String(value);
    }
  }

  return Object.keys(record).length ? record : undefined;
}

function chooseAiSdkMcpFunctionName(serverName: string, toolName: string, usedNames: Set<string>): string {
  const preferred = normalizeAiSdkFunctionName(toolName);
  if (preferred && !usedNames.has(preferred)) return preferred;
  return uniqueMcpFunctionName(buildMcpFunctionName(serverName, toolName), usedNames);
}

function normalizeAiSdkFunctionName(value: string): string {
  const sanitized = sanitizeMcpFunctionName(value);
  if (!sanitized) return '';
  if (sanitized.length <= 64) return sanitized;
  const hash = hashMcpToolName(value);
  return `${sanitized.slice(0, Math.max(1, 63 - hash.length))}_${hash}`;
}

async function closeAiSdkMcpClients(clients: MCPClient[]): Promise<void> {
  await Promise.all(clients.map(async (client) => {
    try { await client.close(); } catch { }
  }));
}

async function getMcpServerTools(
  serverName: string,
  server: McpServerConfig,
  options: { refresh?: boolean } = {},
): Promise<McpToolContext> {
  const cacheKey = getMcpServerCacheKey(serverName, server);
  const cached = mcpToolCache.get(cacheKey);
  if (!options.refresh && cached && cached.expiresAt > Date.now()) {
    return { tools: cached.tools, toolRefs: cached.toolRefs };
  }

  const client = createMcpClient();
  try {
    await withMcpTimeout(client.connect(createMcpTransport(server)), MCP_CONNECT_TIMEOUT_MS, `连接 MCP 超时：${serverName}`);
    const result = await client.listTools(undefined, {
      timeout: MCP_REQUEST_TIMEOUT_MS,
      maxTotalTimeout: MCP_REQUEST_TIMEOUT_MS,
    });
    const context = convertMcpToolsToOpenAI(serverName, server, Array.isArray(result?.tools) ? result.tools : []);
    mcpToolCache.set(cacheKey, {
      ...context,
      expiresAt: Date.now() + MCP_TOOL_CACHE_TTL_MS,
    });
    return context;
  } finally {
    try { await client.close(); } catch { }
  }
}

function createMcpClient() {
  return new Client({ name: 'ifocal', version: '0.4.0' }, {
    capabilities: {},
    // MV3 禁止 unsafe-eval；SDK 默认 Ajv 校验器会触发 new Function。
    jsonSchemaValidator: MCP_CSP_SAFE_JSON_SCHEMA_VALIDATOR,
  });
}

function createMcpTransport(server: McpServerConfig) {
  const url = new URL(server.url);
  const headers = buildMcpAuthHeaders(server);
  if (server.type === 'sse') {
    return new SSEClientTransport(url, {
      eventSourceInit: headers ? ({ headers } as any) : undefined,
      requestInit: headers ? { headers } : undefined,
    });
  }
  return new StreamableHTTPClientTransport(url, {
    requestInit: headers ? { headers } : undefined,
  });
}

function getMcpServerCacheKey(serverName: string, server: McpServerConfig): string {
  return `${serverName}:${server.type}:${server.url}:${JSON.stringify({
    authType: server.authType || 'none',
    authToken: server.authToken || '',
    username: server.username || '',
    password: server.password || '',
    headerName: server.headerName || '',
    headerValue: server.headerValue || '',
  })}`;
}

function buildMcpAuthHeaders(server: McpServerConfig): HeadersInit | undefined {
  const authType = server.authType || 'none';
  if (authType === 'bearer') {
    const token = String(server.authToken || '').trim();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }
  if (authType === 'basic') {
    const username = String(server.username || '');
    const password = String(server.password || '');
    if (!username && !password) return undefined;
    return {
      Authorization: `Basic ${encodeBase64(`${username}:${password}`)}`,
    };
  }
  if (authType === 'header') {
    const headerName = String(server.headerName || '').trim();
    const headerValue = String(server.headerValue || '');
    return headerName && headerValue ? { [headerName]: headerValue } : undefined;
  }
  return undefined;
}

function encodeBase64(value: string): string {
  try {
    return btoa(unescape(encodeURIComponent(value)));
  } catch {
    return btoa(value);
  }
}

function convertMcpToolsToOpenAI(serverName: string, server: McpServerConfig, rawTools: any[]): McpToolContext {
  const tools: McpOpenAITool[] = [];
  const toolRefs: Record<string, McpToolReference> = {};
  const usedNames = new Set<string>();

  for (const tool of rawTools) {
    const toolName = String(tool?.name || '').trim();
    if (!toolName) continue;
    const functionName = uniqueMcpFunctionName(buildMcpFunctionName(serverName, toolName), usedNames);
    usedNames.add(functionName);
    tools.push({
      type: 'function',
      function: {
        name: functionName,
        description: `[${serverName}] ${String(tool?.description || toolName).trim()}`,
        parameters: normalizeMcpToolParameters(tool?.inputSchema),
      },
    });
    toolRefs[functionName] = {
      serverName,
      server: { ...server },
      toolName,
    };
  }

  return { tools, toolRefs };
}

function normalizeMcpToolParameters(inputSchema: unknown): Record<string, unknown> {
  if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
    return { type: 'object', properties: {} };
  }
  const schema = JSON.parse(JSON.stringify(inputSchema)) as Record<string, unknown>;
  if (!schema.type) schema.type = 'object';
  if (schema.type !== 'object') {
    return { type: 'object', properties: {} };
  }
  if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
    schema.properties = {};
  }
  return schema;
}

function buildMcpFunctionName(serverName: string, toolName: string): string {
  const hash = hashMcpToolName(`${serverName}:${toolName}`);
  const base = sanitizeMcpFunctionName(`${serverName}__${toolName}`) || `mcp_tool_${hash}`;
  if (base.length <= 64) return base;
  return `${base.slice(0, Math.max(1, 63 - hash.length))}_${hash}`;
}

function sanitizeMcpFunctionName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

function uniqueMcpFunctionName(baseName: string, usedNames: Set<string>): string {
  if (!usedNames.has(baseName)) return baseName;
  for (let i = 2; i < 100; i++) {
    const suffix = `_${i}`;
    const candidate = `${baseName.slice(0, 64 - suffix.length)}${suffix}`;
    if (!usedNames.has(candidate)) return candidate;
  }
  return `${baseName.slice(0, 55)}_${Date.now().toString(36)}`;
}

function hashMcpToolName(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).slice(0, 8);
}

async function withMcpTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: any = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getOpenAIToolCalls(message: any): any[] {
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  return toolCalls.filter((call) => call?.type === 'function' && call?.function?.name);
}

function isDsmlToolCall(call: any): boolean {
  return call?.ifocalProtocol === 'dsml';
}

function stripInternalToolCallFields(call: any): any {
  return {
    id: String(call?.id || ''),
    type: 'function',
    function: {
      name: String(call?.function?.name || ''),
      arguments: String(call?.function?.arguments || ''),
    },
  };
}

const DSML_TOOL_CALLS_OPEN = '<｜DSML｜tool_calls>';
const DSML_TOOL_CALLS_CLOSE = '</｜DSML｜tool_calls>';

type DsmlStreamState = {
  pending: string;
  insideBlock: boolean;
  blockBuffer: string;
  completedBlocks: string[];
};

function resolveDsmlFunctionName(name: string, mcpContext: McpToolContext): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  if (mcpContext.toolRefs[trimmed]) return trimmed;

  const normalized = sanitizeMcpFunctionName(trimmed);
  for (const [functionName, ref] of Object.entries(mcpContext.toolRefs)) {
    if (ref.toolName === trimmed) return functionName;
    if (sanitizeMcpFunctionName(ref.toolName) === normalized) return functionName;
    if (sanitizeMcpFunctionName(functionName) === normalized) return functionName;
  }

  return trimmed;
}

function parseDsmlParameterValue(rawValue: string, forceString: boolean, parameterName = ''): unknown {
  const value = String(rawValue ?? '').trim();
  const normalizedValue = normalizeDsmlParameterText(parameterName, value);
  if (forceString) return normalizedValue;
  if (normalizedValue !== value) return normalizedValue;
  if (!value) return '';

  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (lower === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);

  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function normalizeDsmlParameterText(parameterName: string, value: string): string {
  const text = String(value || '').trim();
  if (!text) return text;
  const key = String(parameterName || '').toLowerCase();
  if (!key.includes('url')) return text;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  return looksLikeDomainPath(text) ? `https://${text.replace(/^\/+/, '')}` : text;
}

function looksLikeDomainPath(value: string): boolean {
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#].*)?$/i.test(String(value || '').trim());
}

function parseLooseDsmlParameterNameAndValue(nameValue: string, bodyValue: string): { name: string; value: string } {
  const rawName = String(nameValue || '').trim();
  const body = String(bodyValue || '').trim();
  if (!rawName) return { name: '', value: body };
  if (body || !/[.:/]/.test(rawName)) return { name: rawName, value: body };

  const split = rawName.match(/^([a-zA-Z_$][\w$-]*)([.:/][\s\S]*)$/);
  if (!split) return { name: rawName, value: body };

  const key = split[1];
  let inferredValue = split[2].trim();
  if (inferredValue.startsWith('.')) inferredValue = inferredValue.slice(1);
  if (inferredValue.startsWith(':') || inferredValue.startsWith('/')) inferredValue = inferredValue.replace(/^[:/]+/, '');
  return { name: key, value: inferredValue };
}

function parseDsmlParameters(value: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const parameterRegex = /<｜DSML｜parameter\b([\s\S]*?)<\/｜DSML｜parameter>/g;
  let match: RegExpExecArray | null = null;

  while ((match = parameterRegex.exec(String(value || '')))) {
    const parameterSource = String(match[1] || '');
    const closeOfOpeningTag = parameterSource.indexOf('>');
    const rawAttributes = closeOfOpeningTag >= 0 ? parameterSource.slice(0, closeOfOpeningTag) : parameterSource;
    const rawValue = closeOfOpeningTag >= 0 ? parameterSource.slice(closeOfOpeningTag + 1) : '';
    const strictName = rawAttributes.match(/\bname\s*=\s*"([^"]*)"/);
    const looseName = strictName ? null : rawAttributes.match(/\bname\s*=\s*"([^"\s>]*)/);
    const nameValue = strictName?.[1] || looseName?.[1] || '';
    const { name, value: parsedValue } = parseLooseDsmlParameterNameAndValue(nameValue, rawValue);
    const key = String(name || '').trim();
    if (!key) continue;

    const stringAttr = rawAttributes.match(/\bstring\s*=\s*"([^"]*)"/);
    const forceString = String(stringAttr?.[1] || '').trim().toLowerCase() === 'true';
    args[key] = parseDsmlParameterValue(parsedValue, forceString, key);
  }

  return args;
}

function normalizeDsmlMarkup(content: string): string {
  return String(content || '')
    .replace(/<\|DSML\|/g, '<｜DSML｜')
    .replace(/<\/\|DSML\|/g, '</｜DSML｜');
}

function extractDsmlToolCallsFromContent(content: string, mcpContext: McpToolContext): { content: string; toolCalls: any[] } {
  const raw = normalizeDsmlMarkup(content);
  if (!raw.includes(DSML_TOOL_CALLS_OPEN)) {
    return { content: raw, toolCalls: [] };
  }

  const toolCalls: any[] = [];
  let parsedCount = 0;
  const cleaned = raw.replace(/<｜DSML｜tool_calls>([\s\S]*?)<\/｜DSML｜tool_calls>/g, (_block, inner) => {
    const invokeRegex = /<｜DSML｜invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/｜DSML｜invoke>/g;
    let invokeMatch: RegExpExecArray | null = null;

    while ((invokeMatch = invokeRegex.exec(String(inner || '')))) {
      const originalName = String(invokeMatch[1] || '').trim();
      const functionName = resolveDsmlFunctionName(originalName, mcpContext);
      if (!functionName) continue;

      const args = parseDsmlParameters(invokeMatch[2] || '');

      toolCalls.push({
        id: `dsml_tool_call_${toolCalls.length + 1}`,
        type: 'function',
        ifocalProtocol: 'dsml',
        function: {
          name: functionName,
          arguments: JSON.stringify(args),
        },
      });
      parsedCount += 1;
    }

    return '';
  });

  if (!parsedCount) {
    return { content: raw, toolCalls: [] };
  }

  return {
    content: cleaned.replace(/\n{3,}/g, '\n\n').trim(),
    toolCalls,
  };
}

function consumeDsmlStreamChunk(
  chunk: string,
  state: DsmlStreamState,
): string {
  if (!chunk) return '';
  state.pending += normalizeDsmlMarkup(chunk);
  let visible = '';

  while (state.pending) {
    if (!state.insideBlock) {
      const openIndex = state.pending.indexOf(DSML_TOOL_CALLS_OPEN);
      if (openIndex >= 0) {
        visible += state.pending.slice(0, openIndex);
        state.pending = state.pending.slice(openIndex + DSML_TOOL_CALLS_OPEN.length);
        state.insideBlock = true;
        state.blockBuffer = DSML_TOOL_CALLS_OPEN;
        continue;
      }

      const safeLength = Math.max(0, state.pending.length - (DSML_TOOL_CALLS_OPEN.length - 1));
      if (!safeLength) break;
      visible += state.pending.slice(0, safeLength);
      state.pending = state.pending.slice(safeLength);
      break;
    }

    const closeIndex = state.pending.indexOf(DSML_TOOL_CALLS_CLOSE);
    if (closeIndex >= 0) {
      state.blockBuffer += state.pending.slice(0, closeIndex + DSML_TOOL_CALLS_CLOSE.length);
      state.completedBlocks.push(state.blockBuffer);
      state.blockBuffer = '';
      state.pending = state.pending.slice(closeIndex + DSML_TOOL_CALLS_CLOSE.length);
      state.insideBlock = false;
      continue;
    }

    const safeLength = Math.max(0, state.pending.length - (DSML_TOOL_CALLS_CLOSE.length - 1));
    if (!safeLength) break;
    state.blockBuffer += state.pending.slice(0, safeLength);
    state.pending = state.pending.slice(safeLength);
    break;
  }

  return visible;
}

function flushDsmlStreamState(
  state: DsmlStreamState,
): { visible: string; dsmlContent: string } {
  const dsmlContent = state.completedBlocks.join('\n');
  if (state.insideBlock) {
    return {
      visible: '\n\n> 工具调用内容不完整，已隐藏原始调用内容。\n\n',
      dsmlContent: [dsmlContent, `${state.blockBuffer}${state.pending}`].filter(Boolean).join('\n'),
    };
  }
  return {
    visible: state.pending,
    dsmlContent,
  };
}

function getMcpToolDisplayName(functionName: string, mcpContext: McpToolContext): string {
  const ref = mcpContext.toolRefs[functionName];
  if (!ref) return functionName;
  return `${ref.serverName}/${ref.toolName}`;
}

function formatMcpToolCallStatus(toolCalls: any[], mcpContext: McpToolContext): string {
  const lines = toolCalls
    .map((call) => {
      const functionName = String(call?.function?.name || '').trim();
      if (!functionName) return '';
      const args = parseOpenAIToolArguments(call?.function?.arguments);
      const url = typeof args.url === 'string' && args.url.trim() ? ` ${args.url.trim()}` : '';
      return `> 正在调用 MCP 工具：${getMcpToolDisplayName(functionName, mcpContext)}${url}`;
    })
    .filter(Boolean);
  return lines.length ? `\n\n${lines.join('\n')}\n\n` : '';
}

function buildMcpToolsUnavailableMessage(toolCalls: any[]): string {
  const names = toolCalls
    .map((call) => String(call?.function?.name || '').trim())
    .filter(Boolean);
  const suffix = names.length ? `：${names.join(', ')}` : '';
  return `模型请求调用 MCP 工具${suffix}，但当前没有启用可用的 MCP 服务。请在输入框功能菜单启用对应 MCP 后重试。`;
}

function formatMcpToolResultsAsText(toolCalls: any[], toolMessages: any[], mcpContext: McpToolContext): string {
  const blocks = toolMessages.map((message, index) => {
    const call = toolCalls[index];
    const functionName = String(call?.function?.name || message?.name || '').trim();
    const displayName = getMcpToolDisplayName(functionName, mcpContext);
    const args = parseOpenAIToolArguments(call?.function?.arguments);
    const argsText = Object.keys(args).length ? `\n参数：${JSON.stringify(args)}` : '';
    return `工具：${displayName}${argsText}\n结果：\n${String(message?.content || '')}`;
  });

  return `以下是 MCP 工具调用结果。请基于这些结果回答用户，不要再次输出 DSML 或工具调用标签。\n\n${blocks.join('\n\n---\n\n')}`;
}

async function buildMcpToolMessages(toolCalls: any[], mcpContext: McpToolContext): Promise<any[]> {
  const messages: any[] = [];

  for (let index = 0; index < toolCalls.length; index++) {
    const call = toolCalls[index];
    const toolCallId = String(call?.id || `mcp_tool_call_${index + 1}`);
    const functionName = String(call?.function?.name || '').trim();
    const ref = mcpContext.toolRefs[functionName];
    let content = '';

    if (index >= MCP_MAX_TOOL_CALLS_PER_TURN) {
      content = `本轮最多执行 ${MCP_MAX_TOOL_CALLS_PER_TURN} 个 MCP 工具调用，此调用已跳过。`;
    } else if (!ref) {
      console.warn(`[MCP] 工具未找到：${functionName}，可用工具：`, Object.keys(mcpContext.toolRefs));
      content = `MCP 工具未找到：${functionName}`;
    } else {
      try {
        console.log(`[MCP] 调用工具：${ref.serverName}/${ref.toolName}`);
        content = await executeMcpTool(ref, parseOpenAIToolArguments(call?.function?.arguments));
      } catch (error) {
        content = `MCP 工具执行失败：${getErrorMessage(error)}`;
      }
    }

    messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      name: functionName,
      content,
    });
  }

  return messages;
}

function parseOpenAIToolArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  const raw = String(value || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function executeMcpTool(ref: McpToolReference, args: Record<string, unknown>): Promise<string> {
  const client = createMcpClient();
  try {
    await withMcpTimeout(client.connect(createMcpTransport(ref.server)), MCP_CONNECT_TIMEOUT_MS, `连接 MCP 超时：${ref.serverName}`);
    const result = await client.callTool({
      name: ref.toolName,
      arguments: args,
    }, undefined, {
      timeout: MCP_REQUEST_TIMEOUT_MS,
      maxTotalTimeout: MCP_REQUEST_TIMEOUT_MS,
    });
    return truncateMcpToolContent(formatMcpToolResult(result));
  } finally {
    try { await client.close(); } catch { }
  }
}

function formatMcpToolResult(result: any): string {
  const parts: string[] = [];
  if (result?.isError) parts.push('[MCP tool error]');

  if (Array.isArray(result?.content)) {
    for (const item of result.content) {
      const formatted = formatMcpContentItem(item);
      if (formatted) parts.push(formatted);
    }
  }

  if (result?.structuredContent !== undefined) {
    parts.push(JSON.stringify(result.structuredContent));
  }

  if (!parts.length) {
    try { return JSON.stringify(result); } catch { return String(result ?? ''); }
  }
  return parts.join('\n');
}

function formatMcpContentItem(item: any): string {
  const type = String(item?.type || '');
  if (type === 'text') return String(item?.text || '');
  if (type === 'image') return `[image:${String(item?.mimeType || 'unknown')}]`;
  if (type === 'audio') return `[audio:${String(item?.mimeType || 'unknown')}]`;
  if (type === 'resource') {
    const resource = item?.resource || {};
    if (typeof resource.text === 'string') return resource.text;
    return `[resource:${String(resource.uri || 'unknown')}]`;
  }
  if (type === 'resource_link') return `[resource_link:${String(item?.uri || item?.name || 'unknown')}]`;
  try { return JSON.stringify(item); } catch { return String(item ?? ''); }
}

function truncateMcpToolContent(value: string): string {
  const text = String(value || '');
  if (text.length <= MCP_MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MCP_MAX_TOOL_RESULT_CHARS)}\n[内容过长，已截断]`;
}

async function handleTestMcpServer(request: any) {
  const input = request?.server && typeof request.server === 'object' ? request.server : request;
  const serverName = String(input?.name || '').trim();
  const url = String(input?.url || '').trim();
  const type = input?.type === 'sse' ? 'sse' : 'streamable_http';
  if (!serverName) throw new Error('MCP 名称不能为空');
  if (!url) throw new Error('MCP URL 不能为空');

  const server: McpServerConfig = {
    type,
    url,
    enabled: true,
    authType: input?.authType,
    authToken: input?.authToken,
    username: input?.username,
    password: input?.password,
    headerName: input?.headerName,
    headerValue: input?.headerValue,
  };
  const context = await getMcpServerTools(serverName, server, { refresh: true });
  const tools = context.tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
  }));
  if (!tools.length) {
    throw new Error('连接成功，但 MCP Server 未返回可用于模型调用的 tools');
  }
  return { ok: true, serverName, tools };
}

async function handleTestChannel(request: any) {
  const cfg = await readConfig(['channels', 'translateTargetLang', 'promptTemplates']);
  const name = request.channel;
  const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
  const channel = channels.find((c: any) => c.name === name);
  if (!channel) throw new Error('Channel not found');
  const requestedModel = modelIdFromSpec(request.model);
  const model = requestedModel || firstModelIdFromChannel(channel);
  if (!model) throw new Error('Channel has no models configured');
  const { systemPrompt, userPrompt } = makePromptParts('summarize', 'Connection test. Respond with OK.', cfg.translateTargetLang || 'zh-CN', cfg.promptTemplates || {});
  const sample = await invokeModel(channel, model, userPrompt, undefined, false, undefined, { systemPrompt });
  return { ok: true, sample };
}

type MachineTranslateFormat = 'plain' | 'html';
type MachineTranslateSingleRequest = {
  text: string;
  sourceLang?: string;
  targetLang: string;
  format: MachineTranslateFormat;
};

type MachineTranslateAdapter = (channel: MachineTranslateChannel, request: MachineTranslateSingleRequest) => Promise<string>;

async function handleTestMachineTranslateChannel(request: any) {
  const channel = await resolveMachineTranslateChannel(request);
  const targetLang = String(request.targetLang || 'zh-CN').trim() || 'zh-CN';
  const sourceLang = String(request.sourceLang || 'en').trim() || 'en';
  validateMachineTranslateChannel(channel);
  const sample = await translateWithMachineChannel(channel, {
    text: 'Hello world',
    sourceLang,
    targetLang,
    format: 'plain',
  });
  return { ok: true, sample, channelId: channel.id, provider: channel.provider };
}

async function handleMachineTranslateBatch(request: any) {
  const channel = await resolveMachineTranslateChannel(request);
  validateMachineTranslateChannel(channel);

  const texts = Array.isArray(request.texts) ? request.texts.map((item: unknown) => String(item ?? '')) : [];
  if (!texts.length) throw new Error('texts 不能为空');
  const targetLang = String(request.targetLang || '').trim();
  if (!targetLang) throw new Error('targetLang 不能为空');
  const sourceLang = String(request.sourceLang || 'auto').trim() || 'auto';
  const format: MachineTranslateFormat = request.format === 'html' ? 'html' : 'plain';

  const translations = new Array<string>(texts.length).fill('');
  const errors = new Array<string>(texts.length).fill('');
  const tasks = texts.map((text, index) => ({ text, index })).filter((item) => item.text.trim());

  await runMachineTranslateTasks(tasks, channel, async ({ text, index }) => {
    try {
      translations[index] = await translateWithMachineChannel(channel, { text, sourceLang, targetLang, format });
    } catch (error) {
      errors[index] = getErrorMessage(error);
    }
  });

  const ok = errors.every((item) => !item);
  return { ok, translations, errors, channelId: channel.id, provider: channel.provider };
}

async function resolveMachineTranslateChannel(request: any): Promise<MachineTranslateChannel> {
  if (request.channel && typeof request.channel === 'object') {
    const normalized = normalizeMachineTranslateChannels([request.channel]);
    const channel = normalized.find((item) => item.id === request.channel.id) || normalized[0];
    if (!channel) throw new Error('机器翻译渠道无效');
    return channel;
  }

  const cfg = await readConfig(['mtChannels', 'mtDefaultChannelId']);
  const channels = normalizeMachineTranslateChannels(cfg.mtChannels);
  const channelId = String(request.channelId || '').trim()
    || normalizeMachineTranslateDefaultChannelId(cfg.mtDefaultChannelId, channels)
    || DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID;
  const channel = channels.find((item) => item.id === channelId) || channels.find((item) => item.enabled);
  if (!channel) throw new Error('没有可用的机器翻译渠道');
  if (!channel.enabled) throw new Error(`机器翻译渠道已禁用：${channel.name}`);
  return channel;
}

function validateMachineTranslateChannel(channel: MachineTranslateChannel) {
  const meta = getMachineTranslateProviderMeta(channel.provider);
  if (meta.requiresApiKey && !String(channel.apiKey || '').trim()) {
    throw new Error(`${meta.label} 需要配置 API Key`);
  }
  if (meta.requiresSecretKey && !String(channel.secretKey || '').trim()) {
    throw new Error(`${meta.label} 需要配置 Secret Key`);
  }
  if (!String(channel.apiUrl || meta.defaultApiUrl || '').trim()) {
    throw new Error(`${meta.label} 需要配置 API URL`);
  }
}

async function runMachineTranslateTasks<T>(
  tasks: T[],
  channel: MachineTranslateChannel,
  worker: (task: T) => Promise<void>,
) {
  const maxConcurrent = Math.max(1, Math.min(Number(channel.maxConcurrent) || 1, 12));
  const qps = Math.max(1, Math.min(Number(channel.qps) || maxConcurrent, 50));
  const minIntervalMs = Math.ceil(1000 / qps);
  let cursor = 0;
  let nextStartAt = 0;
  const waitForQpsSlot = async () => {
    const now = Date.now();
    const startAt = Math.max(now, nextStartAt);
    nextStartAt = startAt + minIntervalMs;
    if (startAt > now) await sleep(startAt - now);
  };
  const runners = Array.from({ length: Math.min(maxConcurrent, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      const task = tasks[index];
      if (task !== undefined) {
        await waitForQpsSlot();
        await worker(task);
      }
    }
  });
  await Promise.all(runners);
}

async function translateWithMachineChannel(channel: MachineTranslateChannel, request: MachineTranslateSingleRequest): Promise<string> {
  const adapter = machineTranslateAdapters[channel.provider];
  if (!adapter) throw new Error(`Unsupported machine translate provider: ${channel.provider}`);
  return adapter(channel, request);
}

const machineTranslateAdapters: Record<MachineTranslateProvider, MachineTranslateAdapter> = {
  'google-free': callGoogleFreeTranslate,
  'microsoft-free': callMicrosoftFreeTranslate,
  'google-official': callGoogleOfficialTranslate,
  'microsoft-official': callMicrosoftOfficialTranslate,
  deepl: callDeepLTranslate,
  deeplx: callDeepLXTranslate,
  baidu: callBaiduTranslate,
};

async function callGoogleFreeTranslate(channel: MachineTranslateChannel, request: MachineTranslateSingleRequest) {
  const base = trimTrailingSlash(channel.apiUrl || getDefaultMachineTranslateApiUrl(channel.provider));
  const params = new URLSearchParams({
    client: 'gtx',
    sl: mapMachineLang(channel.provider, request.sourceLang || 'auto', 'source'),
    tl: mapMachineLang(channel.provider, request.targetLang, 'target'),
    dt: 't',
    strip: '1',
    nonced: '1',
    q: request.text,
  });
  const res = await fetchWithTimeout(`${base}/translate_a/single?${params.toString()}`, { method: 'GET' }, channel.timeoutMs);
  if (!res.ok) throw await buildHttpError('Google Web Free', res);
  const json = await res.json();
  const parts = Array.isArray(json?.[0]) ? json[0] : [];
  const text = parts.map((part: any) => Array.isArray(part) ? String(part[0] || '') : '').join('');
  if (!text) throw new Error('Google Web Free 返回空结果');
  return text;
}

let microsoftEdgeTokenCache: { token: string; expiresAt: number } | null = null;

async function callMicrosoftFreeTranslate(channel: MachineTranslateChannel, request: MachineTranslateSingleRequest) {
  const base = trimTrailingSlash(channel.apiUrl || getDefaultMachineTranslateApiUrl(channel.provider));
  const token = await getMicrosoftEdgeToken(channel.timeoutMs);
  const params = new URLSearchParams({
    'api-version': '3.0',
    to: mapMachineLang(channel.provider, request.targetLang, 'target'),
    includeSentenceLength: 'true',
    textType: request.format === 'html' ? 'html' : 'plain',
  });
  const source = mapMachineLang(channel.provider, request.sourceLang || 'auto', 'source');
  if (source) params.set('from', source);
  const res = await fetchWithTimeout(`${base}/translate?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify([{ Text: request.text }]),
  }, channel.timeoutMs);
  if (!res.ok) throw await buildHttpError('Microsoft Edge Free', res);
  const json = await res.json();
  const text = json?.[0]?.translations?.[0]?.text;
  if (!text) throw new Error('Microsoft Edge Free 返回空结果');
  return String(text);
}

async function getMicrosoftEdgeToken(timeoutMs?: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (microsoftEdgeTokenCache?.token && microsoftEdgeTokenCache.expiresAt - 60 > now) {
    return microsoftEdgeTokenCache.token;
  }
  const res = await fetchWithTimeout('https://edge.microsoft.com/translate/auth', { method: 'GET' }, timeoutMs);
  if (!res.ok) throw await buildHttpError('Microsoft Edge Auth', res);
  const token = (await res.text()).trim();
  if (!token) throw new Error('Microsoft Edge Auth 返回空 token');
  microsoftEdgeTokenCache = { token, expiresAt: readJwtExp(token) || now + 300 };
  return token;
}

async function callGoogleOfficialTranslate(channel: MachineTranslateChannel, request: MachineTranslateSingleRequest) {
  const base = trimTrailingSlash(channel.apiUrl || getDefaultMachineTranslateApiUrl(channel.provider));
  const url = `${base}/language/translate/v2?key=${encodeURIComponent(String(channel.apiKey || ''))}`;
  const body: any = {
    q: request.text,
    target: mapMachineLang(channel.provider, request.targetLang, 'target'),
    format: request.format === 'html' ? 'html' : 'text',
  };
  const source = mapMachineLang(channel.provider, request.sourceLang || 'auto', 'source');
  if (source && source !== 'auto') body.source = source;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, channel.timeoutMs);
  if (!res.ok) throw await buildHttpError('Google Cloud Translation', res);
  const json = await res.json();
  const text = json?.data?.translations?.[0]?.translatedText;
  if (!text) throw new Error('Google Cloud Translation 返回空结果');
  return String(text);
}

async function callMicrosoftOfficialTranslate(channel: MachineTranslateChannel, request: MachineTranslateSingleRequest) {
  const base = trimTrailingSlash(channel.apiUrl || getDefaultMachineTranslateApiUrl(channel.provider));
  const params = new URLSearchParams({
    'api-version': '3.0',
    to: mapMachineLang(channel.provider, request.targetLang, 'target'),
    textType: request.format === 'html' ? 'html' : 'plain',
  });
  const source = mapMachineLang(channel.provider, request.sourceLang || 'auto', 'source');
  if (source) params.set('from', source);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Ocp-Apim-Subscription-Key': String(channel.apiKey || ''),
  };
  if (channel.region) headers['Ocp-Apim-Subscription-Region'] = channel.region;
  const res = await fetchWithTimeout(`${base}/translate?${params.toString()}`, {
    method: 'POST',
    headers,
    body: JSON.stringify([{ Text: request.text }]),
  }, channel.timeoutMs);
  if (!res.ok) throw await buildHttpError('Microsoft Azure Translator', res);
  const json = await res.json();
  const text = json?.[0]?.translations?.[0]?.text;
  if (!text) throw new Error('Microsoft Azure Translator 返回空结果');
  return String(text);
}

async function callDeepLTranslate(channel: MachineTranslateChannel, request: MachineTranslateSingleRequest) {
  const base = trimTrailingSlash(channel.apiUrl || getDefaultMachineTranslateApiUrl(channel.provider));
  const body: any = {
    text: [request.text],
    target_lang: mapMachineLang(channel.provider, request.targetLang, 'target'),
    preserve_formatting: true,
  };
  const source = mapMachineLang(channel.provider, request.sourceLang || 'auto', 'source');
  if (source && source !== 'auto') body.source_lang = source;
  if (request.format === 'html') body.tag_handling = 'html';
  const res = await fetchWithTimeout(`${base}/v2/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `DeepL-Auth-Key ${channel.apiKey}`,
    },
    body: JSON.stringify(body),
  }, channel.timeoutMs);
  if (!res.ok) throw await buildHttpError('DeepL', res);
  const json = await res.json();
  const text = json?.translations?.[0]?.text;
  if (!text) throw new Error('DeepL 返回空结果');
  return String(text);
}

async function callDeepLXTranslate(channel: MachineTranslateChannel, request: MachineTranslateSingleRequest) {
  const url = channel.apiUrl || getDefaultMachineTranslateApiUrl(channel.provider);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (channel.apiKey) headers.Authorization = `Bearer ${channel.apiKey}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text: request.text,
      source_lang: mapMachineLang(channel.provider, request.sourceLang || 'auto', 'source'),
      target_lang: mapMachineLang(channel.provider, request.targetLang, 'target'),
    }),
  }, channel.timeoutMs);
  if (!res.ok) throw await buildHttpError('DeepLX', res);
  const json = await res.json();
  if (typeof json?.code !== 'undefined' && Number(json.code) !== 200) {
    throw new Error(`DeepLX 翻译失败：${json?.message || json?.msg || json.code}`);
  }
  const text = json?.data ?? json?.translation ?? json?.translated_text ?? json?.result;
  if (!text) throw new Error('DeepLX 返回空结果');
  return String(text);
}

const baiduTokenCache = new Map<string, { token: string; expiresAt: number }>();

async function callBaiduTranslate(channel: MachineTranslateChannel, request: MachineTranslateSingleRequest) {
  const base = trimTrailingSlash(channel.apiUrl || getDefaultMachineTranslateApiUrl(channel.provider));
  const token = await getBaiduAccessToken(channel, base);
  const url = `${base}/rpc/2.0/mt/texttrans/v1?access_token=${encodeURIComponent(token)}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: request.text,
      from: mapMachineLang(channel.provider, request.sourceLang || 'auto', 'source'),
      to: mapMachineLang(channel.provider, request.targetLang, 'target'),
    }),
  }, channel.timeoutMs);
  if (!res.ok) throw await buildHttpError('百度智能云机器翻译', res);
  const json = await res.json();
  if (json?.error_code) throw new Error(`百度翻译失败：${json.error_msg || json.error_code}`);
  const candidates = [
    json?.result?.trans_result?.[0]?.dst,
    json?.trans_result?.[0]?.dst,
    json?.result?.dst,
  ];
  const text = candidates.find((item) => typeof item === 'string' && item);
  if (!text) throw new Error('百度翻译返回空结果');
  return String(text);
}

async function getBaiduAccessToken(channel: MachineTranslateChannel, base: string) {
  const apiKey = String(channel.apiKey || '');
  const secretKey = String(channel.secretKey || '');
  const cacheKey = `${base}:${apiKey}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = baiduTokenCache.get(cacheKey);
  if (cached && cached.expiresAt - 60 > now) return cached.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: apiKey,
    client_secret: secretKey,
  });
  const res = await fetchWithTimeout(`${base}/oauth/2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, channel.timeoutMs);
  if (!res.ok) throw await buildHttpError('百度 OAuth', res);
  const json = await res.json();
  if (!json?.access_token) throw new Error(`百度 OAuth 失败：${json?.error_description || json?.error || '未返回 access_token'}`);
  const expiresIn = Number(json.expires_in) || 2592000;
  baiduTokenCache.set(cacheKey, { token: String(json.access_token), expiresAt: now + expiresIn });
  return String(json.access_token);
}

function mapMachineLang(provider: MachineTranslateProvider, lang: string, role: 'source' | 'target'): string {
  const code = String(lang || '').trim();
  if (!code || code === 'auto') {
    if (provider === 'microsoft-free' || provider === 'microsoft-official') return '';
    return 'auto';
  }

  if (provider === 'microsoft-free' || provider === 'microsoft-official') {
    if (code === 'zh-CN') return 'zh-Hans';
    if (code === 'zh-TW') return 'zh-Hant';
    return code;
  }

  if (provider === 'deepl') {
    const map: Record<string, string> = {
      'zh-CN': 'ZH-HANS',
      'zh-TW': 'ZH-HANT',
      en: role === 'target' ? 'EN-US' : 'EN',
      ja: 'JA',
      ko: 'KO',
      fr: 'FR',
      es: 'ES',
      de: 'DE',
    };
    return map[code] || code.toUpperCase();
  }

  if (provider === 'deeplx') {
    const map: Record<string, string> = {
      'zh-CN': 'ZH',
      'zh-TW': 'ZH',
      en: 'EN',
      ja: 'JA',
      ko: 'KO',
      fr: 'FR',
      es: 'ES',
      de: 'DE',
    };
    return map[code] || code.toUpperCase();
  }

  if (provider === 'baidu') {
    const map: Record<string, string> = {
      'zh-CN': 'zh',
      'zh-TW': 'cht',
      en: 'en',
      ja: 'jp',
      ko: 'kor',
      fr: 'fra',
      es: 'spa',
      de: 'de',
    };
    return map[code] || code;
  }

  return code;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
  const timeout = Math.max(1000, Number(timeoutMs) || 20000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function buildHttpError(label: string, res: Response): Promise<Error> {
  let detail = '';
  try {
    const text = await res.text();
    if (text) detail = `: ${text.slice(0, 240)}`;
  } catch { }
  return new Error(`${label} HTTP ${res.status} ${res.statusText}${detail}`);
}

function trimTrailingSlash(value: string) {
  return String(value || '').replace(/\/+$/, '');
}

function readJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = JSON.parse(atob(padded));
    const exp = Number(json?.exp);
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
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
  const normalizePair = (pair: any) => {
    if (!pair || !pair.channel || !pair.model) return null;
    const channel = String(pair.channel || '').trim();
    const model = modelIdFromSpec(pair.model);
    if (!channel || !model) return null;
    return { channel, model };
  };
  const isValid = (pair: any) => {
    const normalized = normalizePair(pair);
    if (!normalized) return false;
    const ch = channels.find((c: any) => c.name === normalized.channel);
    return !!(ch && channelContainsModelId(ch, normalized.model));
  };
  if (isValid(requestPair)) return normalizePair(requestPair);
  if (isValid(cfg.defaultModel)) return normalizePair(cfg.defaultModel);
  if (task === 'translate') {
    for (const ch of channels) {
      const firstModelId = firstModelIdFromChannel(ch);
      if (firstModelId) return { channel: ch.name, model: firstModelId };
    }
    return null;
  }
  if (isValid(cfg.activeModel)) return normalizePair(cfg.activeModel);
  for (const ch of channels) {
    const firstModelId = firstModelIdFromChannel(ch);
    if (firstModelId) return { channel: ch.name, model: firstModelId };
  }
  return null;
}

import { makeMessage, makePromptParts, makePromptPartsFromTemplate } from '@/shared/ai';
import { channelContainsModelId, firstModelIdFromChannel, modelIdFromSpec } from '@/shared/model-utils';

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  const v = String(value || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'xhigh') return v;
  return 'medium';
}

function mapReasoningEffortForModel(model: string, effort: ReasoningEffort): string {
  const normalized = normalizeReasoningEffort(effort);
  if (!model.includes('deepseek-v4')) return normalized;
  // DeepSeek V4 仅支持 high / max：
  // low、medium 会兼容映射到 high；xhigh 会映射到 max。
  if (normalized === 'xhigh') return 'max';
  return 'high';
}

async function invokeModel(
  channel: any,
  model: string,
  prompt: string,
  context?: Array<{ role: string; content: string; attachments?: any[] }>,
  stream: boolean = false,
  onChunk?: (chunk: string) => void,
  opts?: ModelInvokeOptions
) {
  if (!channel?.apiKey) throw new Error('Channel is missing API key');
  const systemPromptCompatMode = !!channel?.systemPromptCompatMode;
  if (channel.type === 'openai' || channel.type === 'openai-compatible') {
    return callOpenAI(channel.apiUrl, channel.apiKey, model, prompt, context, stream, onChunk, opts, systemPromptCompatMode);
  }
  if (channel.type === 'gemini') {
    return callGemini(channel.apiUrl, channel.apiKey, model, prompt, context, stream, onChunk, { ...opts, systemPromptCompatMode });
  }
  throw new Error(`Unsupported channel type: ${channel.type}`);
}

// 基于模型名和开关注入“思考”相关参数（尽量兼容常见 OpenAI 兼容生态）
function buildReasoningParams(model: string, enabled: boolean | undefined, effort: ReasoningEffort = 'medium') {
  const m = (model || '').toLowerCase();
  const normalizedEffort = normalizeReasoningEffort(effort);
  const modelEffort = mapReasoningEffortForModel(model, normalizedEffort);
  // 常见别名，未被识别的字段通常会被服务端忽略（OpenAI 兼容行为）
  const params: any = {
    enable_thinking: undefined,         // 通用开关
    enable_reasoning: undefined,        // 别名
    enable_thoughts: undefined,         // Qwen/DashScope 常见命名
    reasoning: undefined,               // 对支持 reasoning.effort 的服务尽量降到最低（禁用与否取决于服务实现）
    reasoning_effort: undefined,        // 别名
  };
  // DeepSeek 特殊：通常 deepseek-reasoner 会默认返回 reasoning_content，这里显式开启亦可被忽略
  // Qwen：部分兼容端要求 enable_thoughts/enable_thinking
  if (m.includes('deepseek-v4') || m.includes('qwen')) {
    params.model = model; // 不改模型，仅确保所有别名传递
  }
  // 显式关闭：部分模型默认开启思考，需要明确指定才能关闭
  if (!enabled) {
    if (m.includes('deepseek-v4') || m.includes('glm')) {
      params.thinking = { type: 'disabled' };
    }
    if (m.includes('qwen')) {
      params.enable_thinking = false;
    }
    return params;
  }
  params.enable_thinking = true;   // 通用开关（如部分聚合服务/Qwen/DeepSeek 代理）
  params.enable_reasoning = true;  // 别名 
  params.enable_thoughts = true;   // Qwen/DashScope 常见命名
  // OpenAI o3 系列在 Responses API 支持 reasoning.effort，这里仅作为兼容字段透传
  params.reasoning = { effort: modelEffort };
  params.reasoning_effort = modelEffort;
  // GLM（智谱/ChatGLM）思考开关：官方文档为 thinking: { type: 'enabled' }
  if (m.includes('deepseek-v4') || m.includes('glm')) {
    params.thinking = { type: 'enabled' };
  }
  return params;
}

const AI_SDK_OPENAI_COMPAT_PROVIDER_NAME = 'ifocal';

function buildAiSdkOpenAIProvider(baseUrl: string, apiKey: string) {
  return createOpenAICompatible({
    name: AI_SDK_OPENAI_COMPAT_PROVIDER_NAME,
    baseURL: trimTrailingSlash(baseUrl || 'https://api.openai.com/v1'),
    apiKey,
    fetch: safeWorkerFetch as any,
    transformRequestBody(body) {
      return stripUndefinedValues(body);
    },
  });
}

function safeWorkerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input as any, init as any);
}

function buildAiSdkProviderOptions(model: string, opts?: ModelInvokeOptions): Record<string, any> | undefined {
  const lowerModel = String(model || '').toLowerCase();
  if (lowerModel.includes('gpt')) {
    if (opts?.enableReasoning) {
      console.warn('[OpenAI] Chat Completions 不支持 reasoning 参数，已忽略 enableReasoning。');
    }
    return undefined;
  }

  const raw = buildReasoningParams(model, opts?.enableReasoning, opts?.reasoningEffort);
  const reasoningEffort = typeof raw.reasoning_effort === 'string' ? raw.reasoning_effort : undefined;
  const providerOptions = stripUndefinedValues({
    ...raw,
    ...(reasoningEffort ? { reasoningEffort } : {}),
  });

  return Object.keys(providerOptions).length
    ? { [AI_SDK_OPENAI_COMPAT_PROVIDER_NAME]: providerOptions }
    : undefined;
}

function stripUndefinedValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedValues(item)) as T;
  }
  if (value && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item !== 'undefined') cleaned[key] = stripUndefinedValues(item);
    }
    return cleaned as T;
  }
  return value;
}

function buildAiSdkMessages(
  model: string,
  prompt: string,
  context: Array<{ role: string; content: string; attachments?: any[] }> | undefined,
  opts: ModelInvokeOptions | undefined,
  systemPromptCompatMode: boolean,
): ModelMessage[] {
  const messages = makeMessage(model, prompt, opts?.systemPrompt || '', context, systemPromptCompatMode) as any[];

  if (context && Array.isArray(context)) {
    const contextStartIndex = Math.max(0, messages.length - context.length - 1);
    for (let i = 0; i < context.length; i++) {
      const ctxMsg = context[i];
      if (!ctxMsg.attachments?.length) continue;
      const msgIndex = contextStartIndex + i;
      const msg = messages[msgIndex];
      if (!msg || msg.role !== ctxMsg.role || msg.content !== ctxMsg.content) continue;
      if (msg.role === 'user') {
        msg.content = buildAiSdkUserContent(msg.content, ctxMsg.attachments);
      }
    }
  }

  if (opts?.attachments?.length) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'user') {
      lastMsg.content = buildAiSdkUserContent(lastMsg.content, opts.attachments);
    }
  }

  return messages.map(normalizeAiSdkModelMessage).filter(Boolean) as ModelMessage[];
}

function normalizeAiSdkModelMessage(message: any): ModelMessage | null {
  const role = String(message?.role || '').trim();
  if (role === 'system') {
    return { role: 'system', content: String(message?.content ?? '') };
  }
  if (role === 'assistant') {
    return { role: 'assistant', content: normalizeAiSdkTextContent(message?.content) };
  }
  return { role: 'user', content: normalizeAiSdkUserContent(message?.content) };
}

function normalizeAiSdkTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n');
  }
  return String(content ?? '');
}

function normalizeAiSdkUserContent(content: unknown): any {
  if (!Array.isArray(content)) return String(content ?? '');
  const parts = content
    .map((part) => {
      if (part?.type === 'text') return { type: 'text', text: String(part.text || '') };
      if (part?.type === 'file') return part;
      return null;
    })
    .filter(Boolean);
  return parts.length ? parts : '';
}

function buildAiSdkUserContent(text: unknown, attachments: any[]): any {
  const parts: any[] = [];
  const textContent = String(text ?? '');
  if (textContent.trim()) {
    parts.push({ type: 'text', text: textContent });
  }

  for (const attachment of attachments) {
    const part = buildAiSdkAttachmentPart(attachment);
    if (part) parts.push(part);
  }

  return parts.length ? parts : textContent;
}

function buildAiSdkAttachmentPart(attachment: any): any | null {
  const mediaType = String(attachment?.type || '').trim();
  if (!mediaType.startsWith('image/')) return null;

  const data = String(attachment?.data || '').trim();
  if (!data) return null;

  if (/^https?:\/\//i.test(data)) {
    try {
      return { type: 'file', data: new URL(data), mediaType };
    } catch {
      return null;
    }
  }

  const dataUrl = data.match(/^data:([^;,]+);base64,(.*)$/i);
  if (dataUrl) {
    return {
      type: 'file',
      data: dataUrl[2],
      mediaType: dataUrl[1] || mediaType,
    };
  }

  return { type: 'file', data, mediaType };
}

async function buildOpenAIHttpError(res: Response): Promise<Error> {
  let detail = '';
  try {
    const text = await res.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        const msg = json?.error?.message || json?.message || '';
        detail = msg ? `: ${msg}` : `: ${text.slice(0, 200)}`;
      } catch {
        detail = `: ${text.slice(0, 200)}`;
      }
    }
  } catch { }
  return new Error(`OpenAI HTTP ${res.status}${detail}`);
}

function extractOpenAIMessageText(message: any): string {
  let content = '';
  if (typeof message?.content === 'string') {
    content = message.content;
  } else if (Array.isArray(message?.content)) {
    content = message.content
      .map((part: any) => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n');
  }
  const reasoningContent = message?.reasoning_content;
  if (typeof reasoningContent === 'string' && reasoningContent) {
    content = `<think>${reasoningContent}</think>\n` + content;
  }
  return content;
}

function mergeOpenAIStreamToolCalls(target: any[], deltas: any[]) {
  for (const delta of deltas) {
    const index = Number.isInteger(delta?.index) ? Number(delta.index) : target.length;
    const current = target[index] || {
      id: '',
      type: 'function',
      function: { name: '', arguments: '' },
    };
    if (typeof delta?.id === 'string') current.id += delta.id;
    if (typeof delta?.type === 'string') current.type = delta.type;
    if (typeof delta?.function?.name === 'string') current.function.name += delta.function.name;
    if (typeof delta?.function?.arguments === 'string') current.function.arguments += delta.function.arguments;
    target[index] = current;
  }
}

function normalizeStreamedOpenAIToolCalls(toolCalls: any[]): any[] {
  return toolCalls
    .filter((call) => String(call?.function?.name || '').trim())
    .map((call, index) => ({
      id: String(call?.id || `mcp_stream_tool_call_${index + 1}`),
      type: 'function',
      function: {
        name: String(call?.function?.name || ''),
        arguments: String(call?.function?.arguments || ''),
      },
    }));
}

async function callOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  context?: Array<{ role: string; content: string; attachments?: any[] }>,
  stream: boolean = false,
  onChunk?: (chunk: string) => void,
  opts?: ModelInvokeOptions,
  systemPromptCompatMode: boolean = false
) {
  const provider = buildAiSdkOpenAIProvider(baseUrl, apiKey);
  const messages = buildAiSdkMessages(model, prompt, context, opts, systemPromptCompatMode);
  const providerOptions = buildAiSdkProviderOptions(model, opts);
  const aiMcpContext = await resolveAiSdkMcpToolContext(opts?.mcpServers, opts?.enabledMcpServers);
  const mcpDisplayContext: McpToolContext = { tools: [], toolRefs: aiMcpContext.toolRefs };
  const toolNames = Object.keys(aiMcpContext.tools);

  if (toolNames.length > 0) {
    console.log(`[MCP] AI SDK 已注入 ${toolNames.length} 个工具：`, toolNames);
  }

  console.log('[OpenAI] AI SDK 发送请求，消息数量:', messages.length);

  try {
    return await rateLimited(async () => {
      const firstResult = await streamAiSdkOpenAICompletion({
        provider,
        model,
        messages,
        tools: aiMcpContext.tools,
        providerOptions,
        stream,
        onChunk,
        opts,
        mcpContext: mcpDisplayContext,
      });

      if (firstResult.dsmlToolCalls.length > 0) {
        if (!toolNames.length) {
          const message = `\n\n${buildMcpToolsUnavailableMessage(firstResult.dsmlToolCalls)}`;
          if (stream && onChunk) onChunk(message);
          return `${firstResult.content}${message}`;
        }

        console.log(`[MCP] DSML 兜底执行 ${firstResult.dsmlToolCalls.length} 个工具调用。`);
        const toolMessages = await buildAiSdkDsmlToolMessages(firstResult.dsmlToolCalls, aiMcpContext, messages, opts);
        const finalMessages: ModelMessage[] = [
          ...messages,
          { role: 'assistant', content: firstResult.content || '' },
          { role: 'user', content: formatMcpToolResultsAsText(firstResult.dsmlToolCalls, toolMessages, mcpDisplayContext) },
        ];

        console.log('[MCP] DSML 工具结果已回填，准备通过 AI SDK 发起最终回答请求。');
        const finalResult = await streamAiSdkOpenAICompletion({
          provider,
          model,
          messages: finalMessages,
          tools: {},
          providerOptions,
          stream,
          onChunk,
          opts,
          mcpContext: mcpDisplayContext,
        });
        if (!finalResult.content) throw new Error('OpenAI returned empty response');
        return stream ? `${firstResult.content}${finalResult.content}` : finalResult.content;
      }

      if (!firstResult.content) throw new Error('OpenAI returned empty response');
      return firstResult.content;
    });
  } finally {
    await closeAiSdkMcpClients(aiMcpContext.clients);
  }
}

async function streamAiSdkOpenAICompletion(args: {
  provider: ReturnType<typeof buildAiSdkOpenAIProvider>;
  model: string;
  messages: ModelMessage[];
  tools: ToolSet;
  providerOptions?: Record<string, any>;
  stream: boolean;
  onChunk?: (chunk: string) => void;
  opts?: ModelInvokeOptions;
  mcpContext: McpToolContext;
}): Promise<{ content: string; dsmlToolCalls: any[] }> {
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  if (args.opts?.signal) {
    if (args.opts.signal.aborted) abortController.abort();
    else args.opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  const emit = (chunk: string) => {
    if (!chunk) return;
    if (args.stream && args.onChunk) args.onChunk(chunk);
  };

  let fullContent = '';
  let thinkingStarted = false;
  const dsmlState: DsmlStreamState = { pending: '', insideBlock: false, blockBuffer: '', completedBlocks: [] };
  const dsmlToolCalls: any[] = [];
  const emittedToolCallIds = new Set<string>();
  let processedDsmlBlocks = 0;

  const append = (chunk: string) => {
    if (!chunk) return;
    fullContent += chunk;
    emit(chunk);
  };

  const emitStatus = (chunk: string) => {
    if (!chunk) return;
    emit(chunk);
  };

  const closeThinking = () => {
    if (!thinkingStarted) return;
    append('</think>');
    thinkingStarted = false;
  };

  const processCompletedDsmlBlocks = () => {
    while (processedDsmlBlocks < dsmlState.completedBlocks.length) {
      const block = dsmlState.completedBlocks[processedDsmlBlocks];
      processedDsmlBlocks += 1;
      const parsed = extractDsmlToolCallsFromContent(block, args.mcpContext);
      if (!parsed.toolCalls.length) {
        append('\n\n> 已隐藏一段未识别的工具调用内容。\n\n');
        continue;
      }

      dsmlToolCalls.push(...parsed.toolCalls);
      console.log(`[MCP] 识别到 DSML 工具调用 ${parsed.toolCalls.length} 个：`, parsed.toolCalls.map((call) => call.function?.name));
      emitStatus(formatMcpToolCallStatus(parsed.toolCalls, args.mcpContext));
    }
  };

  try {
    const result = streamText({
      model: args.provider(args.model),
      messages: args.messages,
      allowSystemInMessages: true,
      temperature: 0.2,
      tools: Object.keys(args.tools).length ? args.tools : undefined,
      toolChoice: Object.keys(args.tools).length ? 'auto' : undefined,
      stopWhen: stepCountIs(5),
      maxRetries: 1,
      abortSignal: abortController.signal,
      providerOptions: args.providerOptions,
    });

    for await (const part of result.fullStream as any) {
      if (args.opts?.shouldStop?.()) {
        abortController.abort();
        break;
      }

      if (part.type === 'reasoning-delta') {
        const text = String(part.text ?? part.delta ?? '');
        if (text) {
          append(thinkingStarted ? text : `<think>${text}`);
          thinkingStarted = true;
        }
        continue;
      }

      if (part.type === 'text-delta') {
        closeThinking();
        const text = String(part.text ?? part.delta ?? '');
        const visibleContent = consumeDsmlStreamChunk(text, dsmlState);
        append(visibleContent);
        processCompletedDsmlBlocks();
        continue;
      }

      if (part.type === 'tool-call') {
        closeThinking();
        const toolCallId = String(part.toolCallId || part.id || `${part.toolName || 'tool'}-${emittedToolCallIds.size + 1}`);
        if (!emittedToolCallIds.has(toolCallId)) {
          emittedToolCallIds.add(toolCallId);
          emitStatus(formatAiSdkToolCallStatus(part, args.mcpContext));
        }
        continue;
      }

      if (part.type === 'tool-error') {
        closeThinking();
        emitStatus(`\n\n> MCP 工具执行失败：${getErrorMessage(part.error)}\n\n`);
        continue;
      }

      if (part.type === 'error') {
        throw part.error instanceof Error ? part.error : new Error(getErrorMessage(part.error));
      }
    }

    closeThinking();
    const { visible } = flushDsmlStreamState(dsmlState);
    processCompletedDsmlBlocks();
    append(visible);

    return { content: fullContent, dsmlToolCalls };
  } finally {
    if (args.opts?.signal) {
      try { args.opts.signal.removeEventListener('abort', onAbort); } catch { }
    }
  }
}

function formatAiSdkToolCallStatus(part: any, mcpContext: McpToolContext): string {
  const functionName = String(part?.toolName || '').trim();
  if (!functionName) return '';
  const args = parseOpenAIToolArguments(part?.input);
  const url = typeof args.url === 'string' && args.url.trim() ? ` ${args.url.trim()}` : '';
  return `\n\n> 正在调用 MCP 工具：${getMcpToolDisplayName(functionName, mcpContext)}${url}\n\n`;
}

async function buildAiSdkDsmlToolMessages(
  toolCalls: any[],
  aiMcpContext: AiSdkMcpToolContext,
  messages: ModelMessage[],
  opts?: ModelInvokeOptions,
): Promise<any[]> {
  const toolMessages: any[] = [];

  for (let index = 0; index < toolCalls.length; index++) {
    const call = toolCalls[index];
    const toolCallId = String(call?.id || `dsml_tool_call_${index + 1}`);
    const functionName = String(call?.function?.name || '').trim();
    const toolDef = aiMcpContext.tools[functionName] as any;
    let content = '';

    if (index >= MCP_MAX_TOOL_CALLS_PER_TURN) {
      content = `本轮最多执行 ${MCP_MAX_TOOL_CALLS_PER_TURN} 个 MCP 工具调用，此调用已跳过。`;
    } else if (!toolDef?.execute) {
      console.warn(`[MCP] AI SDK 工具未找到：${functionName}，可用工具：`, Object.keys(aiMcpContext.tools));
      content = `MCP 工具未找到：${functionName}`;
    } else {
      try {
        const ref = aiMcpContext.toolRefs[functionName];
        if (ref) console.log(`[MCP] AI SDK 调用工具：${ref.serverName}/${ref.toolName}`);
        const result = await toolDef.execute(parseOpenAIToolArguments(call?.function?.arguments), {
          toolCallId,
          messages,
          abortSignal: opts?.signal,
        });
        content = truncateMcpToolContent(formatAiSdkToolResult(result));
      } catch (error) {
        content = `MCP 工具执行失败：${getErrorMessage(error)}`;
      }
    }

    toolMessages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      name: functionName,
      content,
    });
  }

  return toolMessages;
}

function formatAiSdkToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const value = result as any;
    if (Array.isArray(value.content) || typeof value.structuredContent !== 'undefined' || value.isError) {
      return formatMcpToolResult(value);
    }
    if (typeof value.toolResult !== 'undefined') {
      return formatAiSdkToolResult(value.toolResult);
    }
  }
  try { return JSON.stringify(result); } catch { return String(result ?? ''); }
}

async function callGemini(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  context?: Array<{ role: string; content: string }>,
  stream: boolean = false,
  onChunk?: (chunk: string) => void,
  opts?: { shouldStop?: () => boolean; signal?: AbortSignal; systemPrompt?: string; systemPromptCompatMode?: boolean }
) {
  const base = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
  const url = joinBasePath(base, `/models/${encodeURIComponent(model)}:${endpoint}?key=${encodeURIComponent(apiKey)}`);

  const systemPrompt = String(opts?.systemPrompt || '').trim();
  const compatMode = !!opts?.systemPromptCompatMode;
  const finalPrompt = systemPrompt && compatMode ? `${systemPrompt}\n\n${prompt}` : prompt;

  // 构建 Gemini 格式的消息内容
  let contents;
  if (context && Array.isArray(context) && context.length > 0) {
    // 多轮对话：转换为 Gemini 的 contents 格式
    contents = context.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    })).concat([{
      role: 'user',
      parts: [{ text: finalPrompt }]
    }]);
  } else {
    // 单轮对话
    contents = [{ parts: [{ text: finalPrompt }] }];
  }

  const body: any = { contents };
  if (systemPrompt && !compatMode) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }
  return rateLimited(async () => {
    const res = await withBackoff(() => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: opts?.signal as any }));
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);

    if (stream) {
      // 流式响应
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body reader');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        if (opts?.shouldStop && opts.shouldStop()) {
          try { await reader.cancel(); } catch { }
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            const parts = json?.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
              const content = parts.map((p: any) => p?.text || '').join('');
              if (content) {
                fullContent += content;
                if (onChunk) onChunk(content);
              }
            }
          } catch (e) {
            console.warn('Failed to parse Gemini stream chunk:', e);
          }
        }
      }

      if (!fullContent) throw new Error('Gemini returned empty response');
      return fullContent;
    } else {
      // 非流式响应
      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts;
      const out = Array.isArray(parts) ? parts.map((p: any) => p?.text || '').join('\n') : '';
      if (!out) throw new Error('Gemini returned empty response');
      return out;
    }
  });
}

async function openOrFocusGlobalWindow(options?: { openSettings?: boolean }) {
  if (isOpeningGlobalWindow) return;
  isOpeningGlobalWindow = true;
  try {
    if (options?.openSettings) {
      try { await chrome.storage.local.set({ [GLOBAL_WIN_VIEW_KEY]: 'settings' }); } catch { }
    }
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
    const width = 1280;
    const height = 860;
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
