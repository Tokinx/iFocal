// LocalLlmHost: 接收 background 转发的请求，按 providerId 路由到对应 provider，
// 处理 tool calling 循环，输出与现有流式协议同构的 chunk
//
// 当前仅支持 Gemini Nano（浏览器内置 LanguageModel API）。

import type {
  LocalLlmHostInbound,
  LocalLlmHostOutbound,
  LocalLlmDownloadProgress,
  LocalLlmMessage,
  LocalLlmProbeResult,
  LocalLlmProviderId,
  LocalLlmRequest,
  LocalMcpToolDescriptor,
} from '@/shared/local-llm-types';
import { downloadGeminiNano, probeGeminiNano, streamGeminiNano } from './providers/gemini-nano';
import {
  argsHashKey,
  buildToolsSystemSnippet,
  feedToolBuffer,
  finalizeToolBuffer,
  makeAssistantToolCallMessage,
  makeStatusEvent,
  makeToolBufferState,
  makeToolResultMessage,
  TOOL_LOOP_MAX_STEPS,
  type ParsedToolCall,
  type ToolBufferChunk,
} from './tool-loop';

type StreamPostFn = (msg: LocalLlmHostOutbound) => void;

type PendingToolCall = {
  callId: string;
  call: ParsedToolCall;
  resolve: (payload: { ok: boolean; result?: unknown; error?: string }) => void;
};

type RequestRuntime = {
  reqId: string;
  abortController: AbortController;
  pendingTools: Map<string, PendingToolCall>;
  stepCount: number;
  toolHistory: Set<string>;
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
  if (message.kind === 'tool-result') {
    const rt = runtimes.get(message.reqId);
    if (!rt) return;
    const pending = rt.pendingTools.get(message.callId);
    if (!pending) return;
    rt.pendingTools.delete(message.callId);
    pending.resolve({ ok: message.ok, result: message.result, error: message.error });
    return;
  }
}

async function runRequest(req: LocalLlmRequest, post: StreamPostFn): Promise<void> {
  const abortController = new AbortController();
  const runtime: RequestRuntime = {
    reqId: req.reqId,
    abortController,
    pendingTools: new Map(),
    stepCount: 0,
    toolHistory: new Set(),
  };
  runtimes.set(req.reqId, runtime);

  post({ kind: 'start', reqId: req.reqId, channel: '', model: req.modelId });

  let messages = withToolSystemPrompt(req.messages, req.tools || []);

  try {
    while (true) {
      runtime.stepCount += 1;
      if (runtime.stepCount > TOOL_LOOP_MAX_STEPS) {
        post({
          kind: 'toolStatus',
          reqId: req.reqId,
          status: {
            phase: 'error',
            message: `工具调用超过 ${TOOL_LOOP_MAX_STEPS} 步上限，已终止`,
          },
        });
        break;
      }

      const result = await streamOneStep(req, messages, runtime, post);

      if (result.kind === 'final') {
        break;
      }

      if (result.kind === 'tool-call') {
        const call = result.call;
        const key = argsHashKey(call);
        if (runtime.toolHistory.has(key)) {
          post({
            kind: 'toolStatus',
            reqId: req.reqId,
            status: makeStatusEvent('error', call, result.callId, '检测到重复调用同一工具相同参数，已终止'),
          });
          break;
        }
        runtime.toolHistory.add(key);

        // 通知 background 执行
        const toolResult = await new Promise<{ ok: boolean; result?: unknown; error?: string }>((resolve) => {
          runtime.pendingTools.set(result.callId, { callId: result.callId, call, resolve });
          post({
            kind: 'tool-call-request',
            reqId: req.reqId,
            callId: result.callId,
            functionName: call.functionName,
            args: call.args,
          });
        });

        post({
          kind: 'toolStatus',
          reqId: req.reqId,
          status: makeStatusEvent(
            toolResult.ok ? 'finished' : 'error',
            call,
            result.callId,
            toolResult.error,
          ),
        });

        messages = [
          ...messages,
          makeAssistantToolCallMessage(call),
          makeToolResultMessage(call.functionName, result.callId, toolResult.result, toolResult.error),
        ];
        continue;
      }

      break;
    }

    post({ kind: 'toolStatus', reqId: req.reqId, status: { phase: 'clear', message: '' } });
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

type StepResult =
  | { kind: 'final' }
  | { kind: 'tool-call'; callId: string; call: ParsedToolCall };

async function streamOneStep(
  req: LocalLlmRequest,
  messages: LocalLlmMessage[],
  runtime: RequestRuntime,
  post: StreamPostFn,
): Promise<StepResult> {
  const stream = pickProviderStream(req.providerId, {
    messages,
    params: req.params,
    signal: runtime.abortController.signal,
    onDownloadProgress: (progress) => {
      post({ kind: 'download-progress', reqId: req.reqId, progress });
    },
  });

  const knownToolNames = new Set((req.tools || []).map((t) => t.functionName));
  const toolBuf = makeToolBufferState();
  let interceptedCall: ParsedToolCall | null = null;

  const handleParsed = (parsed: ToolBufferChunk[]) => {
    for (const item of parsed) {
      if (item.kind === 'visible') {
        if (item.text) post({ kind: 'chunk', reqId: req.reqId, content: item.text });
      } else if (item.kind === 'tool-call-malformed') {
        // 静默吞掉调试信息，但把原始文本透传出去，避免内容凭空消失
        console.warn('[LocalLLM] malformed tool_call payload:', item.error, item.raw);
        if (item.raw) post({ kind: 'chunk', reqId: req.reqId, content: item.raw });
      } else if (item.kind === 'tool-call') {
        if (!interceptedCall) interceptedCall = item.call;
      }
    }
  };

  for await (const delta of stream) {
    if (runtime.abortController.signal.aborted) break;
    if (!delta) continue;

    handleParsed(feedToolBuffer(toolBuf, delta));
    if (interceptedCall) break;
  }

  if (!interceptedCall) {
    // 流结束兜底：从残余 buffer 中尝试提取 tool call（未闭合标签、裸 JSON、代码块）
    handleParsed(finalizeToolBuffer(toolBuf, knownToolNames));
  }

  if (interceptedCall) {
    const callId = `${interceptedCall.functionName}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    post({
      kind: 'toolStatus',
      reqId: req.reqId,
      status: makeStatusEvent('running', interceptedCall, callId),
    });
    return { kind: 'tool-call', callId, call: interceptedCall };
  }

  return { kind: 'final' };
}

function pickProviderStream(
  providerId: LocalLlmProviderId,
  args: {
    messages: LocalLlmMessage[];
    params?: LocalLlmRequest['params'];
    signal: AbortSignal;
    onDownloadProgress?: (progress: { loaded?: number; total?: number; percent?: number }) => void;
  },
): AsyncIterable<string> {
  if (providerId === 'gemini-nano') {
    return streamGeminiNano(args);
  }
  throw new Error(`Unsupported local providerId: ${providerId}`);
}

function withToolSystemPrompt(messages: LocalLlmMessage[], tools: LocalMcpToolDescriptor[]): LocalLlmMessage[] {
  if (!tools.length) return messages.slice();
  const snippet = buildToolsSystemSnippet(tools);
  if (!snippet) return messages.slice();
  if (messages.length && messages[0].role === 'system') {
    const merged: LocalLlmMessage = {
      role: 'system',
      content: `${messages[0].content}\n\n${snippet}`,
    };
    return [merged, ...messages.slice(1)];
  }
  return [{ role: 'system', content: snippet }, ...messages];
}
