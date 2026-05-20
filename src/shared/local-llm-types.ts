// 端侧 AI 模型相关的共享类型与常量
// 被 background / offscreen / window 三端共享使用
//
// 当前仅支持 Chrome 内置 Gemini Nano（Prompt API），其他本地推理（WebGPU/ONNX 等）已下线。

export const LOCAL_CHANNEL_TYPE = 'local' as const;
// 端侧渠道 name 固定为常量，用户不可编辑；改动此值会触发历史渠道自动重命名
export const LOCAL_DEFAULT_CHANNEL_NAME = 'Gemini-Nano';
export const LOCAL_DEFAULT_MODEL_SPEC = 'gemini-nano#Gemini-Nano';

export type LocalLlmProviderId = 'gemini-nano';

export const LOCAL_PROVIDER_IDS: LocalLlmProviderId[] = ['gemini-nano'];

export type LocalLlmAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'no-language-model'
  | 'no-offscreen-api'
  | 'probe-failed';

export type LocalLlmParams = {
  temperature?: number;
  topK?: number;
};

export type LocalLlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LocalMcpToolDescriptor = {
  functionName: string;
  serverName: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LocalMcpToolStatus = {
  phase: 'preparing' | 'running' | 'finished' | 'error' | 'clear';
  id?: string;
  toolName?: string;
  displayName?: string;
  message: string;
  url?: string;
};

export type LocalLlmRequest = {
  reqId: string;
  providerId: LocalLlmProviderId;
  modelId: string;
  messages: LocalLlmMessage[];
  params?: LocalLlmParams;
  tools?: LocalMcpToolDescriptor[];
};

export type LocalLlmDownloadProgress = {
  loaded?: number;
  total?: number;
  percent?: number;
};

export type LocalLlmProbeResult = {
  providerId: LocalLlmProviderId;
  availability: LocalLlmAvailability;
  reason?: string;
  defaultParams?: LocalLlmParams;
};

// background → offscreen
export type LocalLlmHostInbound =
  | ({ kind: 'start' } & LocalLlmRequest)
  | { kind: 'tool-result'; reqId: string; callId: string; ok: boolean; result?: unknown; error?: string }
  | { kind: 'abort'; reqId: string };

// offscreen → background
export type LocalLlmHostOutbound =
  | { kind: 'start'; reqId: string; channel: string; model: string }
  | { kind: 'chunk'; reqId: string; content: string }
  | { kind: 'tool-call-request'; reqId: string; callId: string; functionName: string; args: unknown }
  | { kind: 'toolStatus'; reqId: string; status: LocalMcpToolStatus }
  | { kind: 'done'; reqId: string; finishReason?: string }
  | { kind: 'error'; reqId: string; error: string }
  | { kind: 'download-progress'; reqId: string; progress: LocalLlmDownloadProgress };

export const PORT_PREFIX_LOCAL_LLM_STREAM = 'local-llm:stream:';
export const PORT_NAME_LOCAL_LLM_PROBE = 'local-llm:probe';
export const PORT_NAME_LOCAL_LLM_DOWNLOAD = 'local-llm:download';
export const PORT_NAME_OFFSCREEN_KEEPALIVE = 'offscreen-keepalive';

export function makeStreamPortName(reqId: string): string {
  return `${PORT_PREFIX_LOCAL_LLM_STREAM}${reqId}`;
}

export function parseStreamPortName(name: string): string | null {
  if (!name.startsWith(PORT_PREFIX_LOCAL_LLM_STREAM)) return null;
  return name.slice(PORT_PREFIX_LOCAL_LLM_STREAM.length);
}

// download port message protocol
// client → offscreen: { kind: 'start', providerId }
// offscreen → client: progress / done / error
export type LocalLlmDownloadInbound =
  | { kind: 'start'; providerId: LocalLlmProviderId };

export type LocalLlmDownloadOutbound =
  | { kind: 'progress'; progress: LocalLlmDownloadProgress }
  | { kind: 'done' }
  | { kind: 'error'; error: string };

// 本地渠道结构
export type LocalChannelConfig = {
  name: string;
  type: typeof LOCAL_CHANNEL_TYPE;
  providerId: LocalLlmProviderId;
  models: string[];
  systemPromptCompatMode?: boolean;
  params?: LocalLlmParams;
  apiUrl?: '';
  apiKey?: '';
};

export function isLocalChannelLike(channel: unknown): channel is LocalChannelConfig {
  return !!channel && typeof channel === 'object' && (channel as any).type === LOCAL_CHANNEL_TYPE;
}

export function makeDefaultLocalChannel(): LocalChannelConfig {
  return {
    name: LOCAL_DEFAULT_CHANNEL_NAME,
    type: LOCAL_CHANNEL_TYPE,
    providerId: 'gemini-nano',
    models: [LOCAL_DEFAULT_MODEL_SPEC],
    params: { temperature: 0.8, topK: 3 },
  };
}

export function normalizeLocalProviderId(providerId: unknown): LocalLlmProviderId | '' {
  const value = String(providerId || '').trim();
  if (value === 'gemini-nano') return value;
  return '';
}

// 通用规范化：把任何 channel 的 models 字段强制成 string[]，避免历史坏数据导致 .map/.forEach 崩溃
export function normalizeAnyChannelModels<T extends { models?: unknown }>(channel: T): { channel: T; changed: boolean } {
  if (!channel || typeof channel !== 'object') return { channel, changed: false };
  const raw = (channel as any).models;
  if (Array.isArray(raw)) {
    const filtered = raw.filter((m) => typeof m === 'string');
    if (filtered.length === raw.length) return { channel, changed: false };
    return { channel: { ...(channel as any), models: filtered } as T, changed: true };
  }
  if (typeof raw === 'string' && raw.trim()) {
    return { channel: { ...(channel as any), models: [raw.trim()] } as T, changed: true };
  }
  if (raw === undefined && Array.isArray((channel as any).models)) {
    return { channel, changed: false };
  }
  return { channel: { ...(channel as any), models: [] } as T, changed: true };
}

// 老用户升级 / 新装首次启动都会调，缺则补；
// 把所有渠道的 models 字段强制规范化为 string[]；
// 本地渠道：
//   - providerId 不是 gemini-nano（如已下线的 local-webgpu-model）直接丢弃
//   - name 强制改为 LOCAL_DEFAULT_CHANNEL_NAME（用户不可自定义），renamed 字段记录映射
//   - models 强制单条且使用 LOCAL_DEFAULT_MODEL_SPEC
//   - 移除已废弃的 systemPromptCompatMode 字段
// 本地模型互斥：本地渠道只保留第一个（多余的合并掉）
export type LocalChannelRename = { from: string; to: string };

export function ensureLocalChannelInjected<T extends { type?: string; providerId?: string; name?: string; models?: unknown }>(
  list: T[] | null | undefined,
): { list: (T | LocalChannelConfig)[]; injected: boolean; renames: LocalChannelRename[] } {
  const base = Array.isArray(list) ? list.slice() : [];
  let mutated = false;
  let firstLocalSeen = false;
  const renames: LocalChannelRename[] = [];
  const normalized: T[] = [];
  for (const c of base) {
    if (!c) continue;
    // 第一步：所有渠道都先把 models 规范化为 string[]
    const general = normalizeAnyChannelModels(c as any);
    if (general.changed) mutated = true;
    let next: any = general.channel;
    if (next?.type === LOCAL_CHANNEL_TYPE) {
      // 历史本地渠道：providerId 不是 gemini-nano（如已下线的 local-webgpu-model）直接丢弃
      const provider = normalizeLocalProviderId(next.providerId);
      if (!provider) {
        mutated = true;
        continue;
      }
      // 本地模型互斥：只保留第一个 local 渠道，后续 local 渠道直接丢弃
      if (firstLocalSeen) {
        mutated = true;
        continue;
      }
      firstLocalSeen = true;
      const previousName = typeof next.name === 'string' ? next.name : '';
      const patch: any = {};
      let touched = false;
      if (previousName !== LOCAL_DEFAULT_CHANNEL_NAME) {
        patch.name = LOCAL_DEFAULT_CHANNEL_NAME;
        if (previousName) renames.push({ from: previousName, to: LOCAL_DEFAULT_CHANNEL_NAME });
        touched = true;
      }
      const models = Array.isArray(next.models) ? next.models : [];
      const firstModel = typeof models[0] === 'string' ? models[0] : '';
      if (models.length !== 1 || firstModel !== LOCAL_DEFAULT_MODEL_SPEC) {
        patch.models = [LOCAL_DEFAULT_MODEL_SPEC];
        touched = true;
      }
      if ('systemPromptCompatMode' in next) {
        patch.systemPromptCompatMode = undefined;
        touched = true;
      }
      if (touched) {
        next = { ...next, ...patch };
        if ('systemPromptCompatMode' in next && next.systemPromptCompatMode === undefined) {
          delete next.systemPromptCompatMode;
        }
        mutated = true;
      }
    }
    normalized.push(next as T);
  }
  if (firstLocalSeen) {
    return { list: normalized, injected: mutated, renames };
  }
  return { list: [makeDefaultLocalChannel(), ...normalized], injected: true, renames };
}
