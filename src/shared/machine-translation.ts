export type MachineTranslateProvider =
  | 'google-free'
  | 'microsoft-free'
  | 'google-official'
  | 'microsoft-official'
  | 'deepl'
  | 'deeplx'
  | 'baidu';

export interface MachineTranslateChannel {
  id: string;
  name: string;
  provider: MachineTranslateProvider;
  apiUrl?: string;
  apiKey?: string;
  secretKey?: string;
  region?: string;
  enabled: boolean;
  builtin?: boolean;
  qps?: number;
  maxConcurrent?: number;
  timeoutMs?: number;
}

export interface MachineTranslateBatchRequest {
  action: 'machineTranslateBatch';
  channelId?: string;
  texts: string[];
  sourceLang?: string;
  targetLang: string;
  format?: 'plain' | 'html';
}

export interface MachineTranslateProviderMeta {
  value: MachineTranslateProvider;
  label: string;
  description: string;
  defaultApiUrl: string;
  requiresApiKey: boolean;
  requiresSecretKey?: boolean;
  supportsRegion?: boolean;
  experimental?: boolean;
  defaultQps: number;
  defaultMaxConcurrent: number;
  defaultTimeoutMs: number;
}

export const MT_BUILTIN_MICROSOFT_FREE_ID = 'builtin-microsoft-free';
export const MT_BUILTIN_GOOGLE_FREE_ID = 'builtin-google-free';
export const DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID = MT_BUILTIN_MICROSOFT_FREE_ID;

export const MACHINE_TRANSLATE_PROVIDER_METAS: Record<MachineTranslateProvider, MachineTranslateProviderMeta> = {
  'microsoft-free': {
    value: 'microsoft-free',
    label: 'Microsoft Translator',
    description: '内置免费实验渠道，使用 Edge Translator 临时令牌，可能限流或失效。',
    defaultApiUrl: 'https://api-edge.cognitive.microsofttranslator.com',
    requiresApiKey: false,
    experimental: true,
    defaultQps: 4,
    defaultMaxConcurrent: 4,
    defaultTimeoutMs: 15000,
  },
  'google-free': {
    value: 'google-free',
    label: 'Google Translate',
    description: '内置免费实验渠道，使用 Google Web 翻译接口，部分网络环境不可用。',
    defaultApiUrl: 'https://translate.googleapis.com',
    requiresApiKey: false,
    experimental: true,
    defaultQps: 3,
    defaultMaxConcurrent: 3,
    defaultTimeoutMs: 15000,
  },
  'google-official': {
    value: 'google-official',
    label: 'Google Translate',
    description: 'Google Cloud Translation Basic v2，用户自备 API Key。',
    defaultApiUrl: 'https://translation.googleapis.com',
    requiresApiKey: true,
    defaultQps: 5,
    defaultMaxConcurrent: 5,
    defaultTimeoutMs: 20000,
  },
  'microsoft-official': {
    value: 'microsoft-official',
    label: 'Microsoft Translator',
    description: 'Azure AI Translator 官方接口，用户自备订阅 Key，区域可选。',
    defaultApiUrl: 'https://api.cognitive.microsofttranslator.com',
    requiresApiKey: true,
    supportsRegion: true,
    defaultQps: 5,
    defaultMaxConcurrent: 5,
    defaultTimeoutMs: 20000,
  },
  deepl: {
    value: 'deepl',
    label: 'DeepL',
    description: 'DeepL 官方 API，Free/Pro 可通过 API URL 区分。',
    defaultApiUrl: 'https://api-free.deepl.com',
    requiresApiKey: true,
    defaultQps: 4,
    defaultMaxConcurrent: 4,
    defaultTimeoutMs: 20000,
  },
  deeplx: {
    value: 'deeplx',
    label: 'DeepLX',
    description: 'DeepLX 或兼容自建服务，Token 可选。',
    defaultApiUrl: 'http://localhost:1188/translate',
    requiresApiKey: false,
    defaultQps: 4,
    defaultMaxConcurrent: 4,
    defaultTimeoutMs: 20000,
  },
  baidu: {
    value: 'baidu',
    label: '百度翻译',
    description: '百度智能云机器翻译，使用 API Key + Secret Key 获取 access token。',
    defaultApiUrl: 'https://aip.baidubce.com',
    requiresApiKey: true,
    requiresSecretKey: true,
    defaultQps: 3,
    defaultMaxConcurrent: 3,
    defaultTimeoutMs: 20000,
  },
};

export const MACHINE_TRANSLATE_PROVIDER_OPTIONS = Object.values(MACHINE_TRANSLATE_PROVIDER_METAS);

export const DEFAULT_MACHINE_TRANSLATE_CHANNELS: MachineTranslateChannel[] = [
  {
    id: MT_BUILTIN_MICROSOFT_FREE_ID,
    name: 'Microsoft Translator',
    provider: 'microsoft-free',
    apiUrl: MACHINE_TRANSLATE_PROVIDER_METAS['microsoft-free'].defaultApiUrl,
    enabled: true,
    builtin: true,
    qps: MACHINE_TRANSLATE_PROVIDER_METAS['microsoft-free'].defaultQps,
    maxConcurrent: MACHINE_TRANSLATE_PROVIDER_METAS['microsoft-free'].defaultMaxConcurrent,
    timeoutMs: MACHINE_TRANSLATE_PROVIDER_METAS['microsoft-free'].defaultTimeoutMs,
  },
  {
    id: MT_BUILTIN_GOOGLE_FREE_ID,
    name: 'Google Translate',
    provider: 'google-free',
    apiUrl: MACHINE_TRANSLATE_PROVIDER_METAS['google-free'].defaultApiUrl,
    enabled: true,
    builtin: true,
    qps: MACHINE_TRANSLATE_PROVIDER_METAS['google-free'].defaultQps,
    maxConcurrent: MACHINE_TRANSLATE_PROVIDER_METAS['google-free'].defaultMaxConcurrent,
    timeoutMs: MACHINE_TRANSLATE_PROVIDER_METAS['google-free'].defaultTimeoutMs,
  },
];

export function isMachineTranslateProvider(value: unknown): value is MachineTranslateProvider {
  return typeof value === 'string' && value in MACHINE_TRANSLATE_PROVIDER_METAS;
}

export function getMachineTranslateProviderMeta(provider: MachineTranslateProvider): MachineTranslateProviderMeta {
  return MACHINE_TRANSLATE_PROVIDER_METAS[provider];
}

export function getDefaultMachineTranslateApiUrl(provider: MachineTranslateProvider): string {
  return MACHINE_TRANSLATE_PROVIDER_METAS[provider].defaultApiUrl;
}

export function createMachineTranslateChannel(provider: MachineTranslateProvider = 'deeplx'): MachineTranslateChannel {
  const meta = getMachineTranslateProviderMeta(provider);
  return {
    id: `mt-${provider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: meta.label,
    provider,
    apiUrl: meta.defaultApiUrl,
    enabled: true,
    qps: meta.defaultQps,
    maxConcurrent: meta.defaultMaxConcurrent,
    timeoutMs: meta.defaultTimeoutMs,
  };
}

function positiveNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function normalizeChannel(raw: any, index: number): MachineTranslateChannel | null {
  if (!raw || typeof raw !== 'object' || !isMachineTranslateProvider(raw.provider)) return null;
  const meta = getMachineTranslateProviderMeta(raw.provider);
  const id = normalizeOptionalString(raw.id) || `mt-${raw.provider}-${index}`;
  return {
    id,
    name: normalizeOptionalString(raw.name) || meta.label,
    provider: raw.provider,
    apiUrl: normalizeOptionalString(raw.apiUrl) || meta.defaultApiUrl,
    apiKey: normalizeOptionalString(raw.apiKey),
    secretKey: normalizeOptionalString(raw.secretKey),
    region: normalizeOptionalString(raw.region),
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    builtin: !!raw.builtin,
    qps: positiveNumber(raw.qps, meta.defaultQps),
    maxConcurrent: positiveNumber(raw.maxConcurrent, meta.defaultMaxConcurrent),
    timeoutMs: positiveNumber(raw.timeoutMs, meta.defaultTimeoutMs),
  };
}

export function normalizeMachineTranslateChannels(raw: unknown): MachineTranslateChannel[] {
  const input = Array.isArray(raw) ? raw : [];
  const normalized = input
    .map((item, index) => normalizeChannel(item, index))
    .filter((item): item is MachineTranslateChannel => !!item);

  const builtinById = new Map(DEFAULT_MACHINE_TRANSLATE_CHANNELS.map((channel) => [channel.id, channel]));
  const next: MachineTranslateChannel[] = [];

  for (const builtin of DEFAULT_MACHINE_TRANSLATE_CHANNELS) {
    const existing = normalized.find((item) => item.id === builtin.id);
    if (!existing) {
      next.push({ ...builtin });
      continue;
    }
    const meta = getMachineTranslateProviderMeta(builtin.provider);
    next.push({
      ...existing,
      id: builtin.id,
      provider: builtin.provider,
      name: builtin.name,
      apiUrl: existing.apiUrl || meta.defaultApiUrl,
      builtin: true,
    });
  }

  const seen = new Set(next.map((item) => item.id));
  for (const channel of normalized) {
    if (builtinById.has(channel.id)) continue;
    let id = channel.id;
    if (seen.has(id)) id = `${id}-${seen.size}`;
    seen.add(id);
    next.push({ ...channel, id, builtin: false });
  }

  return next;
}

export function normalizeMachineTranslateDefaultChannelId(raw: unknown, channels: MachineTranslateChannel[]): string {
  const id = String(raw ?? '').trim();
  const enabled = channels.filter((channel) => channel.enabled);
  if (id && enabled.some((channel) => channel.id === id)) return id;
  if (enabled.some((channel) => channel.id === DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID)) {
    return DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID;
  }
  return enabled[0]?.id || DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID;
}
