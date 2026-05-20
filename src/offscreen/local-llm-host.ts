// LocalLlmHost: 接收 background 转发的请求，按 providerId 路由到对应 provider，
// 输出与现有流式协议同构的 chunk。
//
// 当前仅支持 Gemini Nano（浏览器内置 LanguageModel API）。

import type {
  LocalLlmHostInbound,
  LocalLlmHostOutbound,
  LocalLlmDownloadProgress,
  LocalLlmProbeResult,
  LocalLlmProviderId,
  LocalLlmRequest,
  LocalLlmMessage,
  LocalLlmParams,
} from '@/shared/local-llm-types';
import { downloadGeminiNano, probeGeminiNano, streamGeminiNano } from './providers/gemini-nano';

type StreamPostFn = (msg: LocalLlmHostOutbound) => void;

type RequestRuntime = {
  reqId: string;
  abortController: AbortController;
};

const runtimes = new Map<string, RequestRuntime>();

export async function probe(providerId: LocalLlmProviderId): Promise<LocalLlmProbeResult> {
  if (providerId === 'gemini-nano') return probeGeminiNano();
  return { providerId, availability: 'unavailable', reason: `Unknown providerId: ${providerId}` };
}

export async function downloadModel(
  providerId: LocalLlmProviderId,
  signal: AbortSignal,
  onProgress: (progress: LocalLlmDownloadProgress) => void,
): Promise<void> {
  if (providerId === 'gemini-nano') {
    return downloadGeminiNano({ signal, onDownloadProgress: onProgress });
  }
  throw new Error(`Unknown providerId: ${providerId}`);
}

export function handleInbound(message: LocalLlmHostInbound, post: StreamPostFn): void {
  if (message.kind === 'start') {
    void runRequest(message, post);
    return;
  }
  if (message.kind === 'abort') {
    const rt = runtimes.get(message.reqId);
    if (rt) {
      try { rt.abortController.abort(); } catch { /* ignore */ }
    }
    return;
  }
}

async function runRequest(req: LocalLlmRequest, post: StreamPostFn): Promise<void> {
  const abortController = new AbortController();
  const runtime: RequestRuntime = {
    reqId: req.reqId,
    abortController,
  };
  runtimes.set(req.reqId, runtime);

  post({ kind: 'start', reqId: req.reqId, channel: '', model: req.modelId });

  try {
    const stream = pickProviderStream(req.providerId, {
      messages: req.messages,
      params: req.params,
      signal: runtime.abortController.signal,
      onDownloadProgress: (progress) => {
        post({ kind: 'download-progress', reqId: req.reqId, progress });
      },
    });

    for await (const delta of stream) {
      if (runtime.abortController.signal.aborted) break;
      if (delta) post({ kind: 'chunk', reqId: req.reqId, content: delta });
    }

    post({ kind: 'done', reqId: req.reqId });
  } catch (error) {
    post({
      kind: 'error',
      reqId: req.reqId,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    runtimes.delete(req.reqId);
  }
}

function pickProviderStream(
  providerId: LocalLlmProviderId,
  args: {
    messages: LocalLlmMessage[];
    params?: LocalLlmParams;
    signal: AbortSignal;
    onDownloadProgress?: (progress: LocalLlmDownloadProgress) => void;
  },
): AsyncIterable<string> {
  if (providerId === 'gemini-nano') {
    return streamGeminiNano(args);
  }
  throw new Error(`Unsupported local providerId: ${providerId}`);
}
