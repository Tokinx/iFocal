// Gemini Nano provider (Chrome 内置 LanguageModel API)
// 仅在 offscreen document 中运行，访问全局 LanguageModel 对象

import type {
  LocalLlmAvailability,
  LocalLlmDownloadProgress,
  LocalLlmMessage,
  LocalLlmParams,
  LocalLlmProbeResult,
} from '@/shared/local-llm-types';

type SessionOptions = {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
  onDownloadProgress?: (progress: LocalLlmDownloadProgress) => void;
};

function hasLanguageModel(): boolean {
  return typeof (globalThis as any).LanguageModel !== 'undefined';
}

export async function probeGeminiNano(): Promise<LocalLlmProbeResult> {
  if (!hasLanguageModel()) {
    return { providerId: 'gemini-nano', availability: 'no-language-model' };
  }
  try {
    const LM = (globalThis as any).LanguageModel;
    const availabilityRaw: string = await LM.availability({
      expectedInputs: [{ type: 'text', languages: ['en', 'es', 'ja'] }],
      expectedOutputs: [{ type: 'text', languages: ['en', 'es', 'ja'] }]
    });
    const availability = normalizeAvailability(availabilityRaw);

    let defaultParams: LocalLlmParams | undefined;
    try {
      const p = await LM.params();
      if (p && typeof p === 'object') {
        defaultParams = {
          temperature: typeof p.defaultTemperature === 'number' ? p.defaultTemperature : undefined,
          topK: typeof p.defaultTopK === 'number' ? p.defaultTopK : undefined,
        };
      }
    } catch {
      defaultParams = undefined;
    }

    return { providerId: 'gemini-nano', availability, defaultParams };
  } catch (error) {
    return {
      providerId: 'gemini-nano',
      availability: 'probe-failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeAvailability(value: string): LocalLlmAvailability {
  if (value === 'available' || value === 'downloadable' || value === 'downloading' || value === 'unavailable') {
    return value;
  }
  // 旧版 API 可能返回 'readily' / 'after-download' / 'no'
  if (value === 'readily') return 'available';
  if (value === 'after-download') return 'downloadable';
  if (value === 'no') return 'unavailable';
  return 'unavailable';
}

async function createSession(options: SessionOptions): Promise<any> {
  const LM = (globalThis as any).LanguageModel;
  if (!LM) throw new Error('LanguageModel API is not available');

  const createOpts: any = {};
  if (options.systemPrompt) {
    createOpts.initialPrompts = [{ role: 'system', content: options.systemPrompt }];
  }
  // topK 和 temperature 必须同时设置或同时省略
  if (typeof options.temperature === 'number' && typeof options.topK === 'number') {
    createOpts.temperature = options.temperature;
    createOpts.topK = options.topK;
  }
  // Chrome 内置 LanguageModel 自 2024 末起要求显式声明 expected I/O 语言，否则会在
  // 控制台打印 "No output language was specified" 警告。当前 Chrome 官方支持
  // [en, es, ja]，未声明的语言模型仍可处理，仅不保证质量。声明这三种以消除警告。
  createOpts.expectedInputs = [{ type: 'text', languages: ['en', 'es', 'ja'] }];
  createOpts.expectedOutputs = [{ type: 'text', languages: ['en', 'es', 'ja'] }];
  if (options.signal) createOpts.signal = options.signal;
  if (options.onDownloadProgress) {
    createOpts.monitor = (m: any) => {
      try {
        m.addEventListener('downloadprogress', (e: any) => {
          options.onDownloadProgress?.({
            loaded: typeof e?.loaded === 'number' ? e.loaded : undefined,
            total: typeof e?.total === 'number' ? e.total : undefined,
            percent: typeof e?.loaded === 'number' && typeof e?.total === 'number' && e.total > 0
              ? Math.round((e.loaded / e.total) * 100)
              : undefined,
          });
        });
      } catch { /* monitor 不可用时静默 */ }
    };
  }

  return await LM.create(createOpts);
}

// 把 messages 数组里的 system 抽出来（offscreen 收到的 messages 已经规范化过
// system 拼接由 background 完成，理论上 messages 内不会再有 system，
// 但为防御性处理：再次提取首个 system）
export function extractSystemFromMessages(messages: LocalLlmMessage[]): {
  system?: string;
  rest: LocalLlmMessage[];
} {
  if (!Array.isArray(messages) || !messages.length) return { rest: [] };
  const first = messages[0];
  if (first?.role === 'system') {
    return { system: first.content || '', rest: messages.slice(1) };
  }
  return { rest: messages };
}

// 触发 Chrome Gemini Nano 模型下载（如果状态是 downloadable / downloading）
// 通过创建一个临时 session + monitor 进度回调实现；session 创建完成即销毁
export async function downloadGeminiNano(args: {
  signal: AbortSignal;
  onDownloadProgress?: (progress: LocalLlmDownloadProgress) => void;
}): Promise<void> {
  if (!hasLanguageModel()) throw new Error('LanguageModel API 不可用');
  const session = await createSession({
    signal: args.signal,
    onDownloadProgress: args.onDownloadProgress,
  });
  try { session.destroy?.(); } catch { /* ignore */ }
}

// 释放 Gemini Nano 在 offscreen 中持有的资源
// Nano 每个请求 create + destroy session，没有 module-level 缓存，noop
export async function releaseGeminiNano(): Promise<void> {
  // 占位：当前 streamGeminiNano 已经 per-request destroy，没有需要清理的 module 状态
}

export async function* streamGeminiNano(args: {
  messages: LocalLlmMessage[];
  params?: LocalLlmParams;
  signal: AbortSignal;
  onDownloadProgress?: (progress: LocalLlmDownloadProgress) => void;
}): AsyncIterable<string> {
  const { system, rest } = extractSystemFromMessages(args.messages);
  const session = await createSession({
    systemPrompt: system,
    temperature: args.params?.temperature,
    topK: args.params?.topK,
    signal: args.signal,
    onDownloadProgress: args.onDownloadProgress,
  });

  try {
    const input = restToPromptInput(rest);
    const stream: ReadableStream<string> = session.promptStreaming(input, { signal: args.signal });
    const reader = stream.getReader();
    let previous = '';
    while (true) {
      if (args.signal.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      if (typeof value === 'string') {
        // 兼容：部分版本返回累计文本，部分返回增量
        if (value.startsWith(previous) && value.length > previous.length) {
          const delta = value.slice(previous.length);
          previous = value;
          if (delta) yield delta;
        } else {
          previous += value;
          yield value;
        }
      }
    }
  } finally {
    try { session.destroy?.(); } catch { /* ignore */ }
  }
}

function restToPromptInput(messages: LocalLlmMessage[]): any {
  // 新版 LanguageModel API 支持 [{role,content}] 形式
  // 旧版仅支持字符串，做一次拼接 fallback
  if (!messages.length) return '';
  const compatPairs = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  // 优先用 messages 数组；如果模型不支持，调用方会捕获异常并降级
  return messages as any || compatPairs;
}
