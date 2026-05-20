// 解析模型流式输出中的 <tool_call>...</tool_call> JSON
// 通过反向 port message 请求 background 调用 MCP 工具，再把结果包成 <tool_result> 续 prompt
//
// 协议：
//   <tool_call>{"name":"<functionName>","args":{...}}</tool_call>
//   <tool_result name="<functionName>" id="<callId>">...</tool_result>

import type {
  LocalLlmMessage,
  LocalMcpToolDescriptor,
  LocalMcpToolStatus,
} from '@/shared/local-llm-types';

const TOOL_CALL_OPEN = '<tool_call>';
const TOOL_CALL_CLOSE = '</tool_call>';
export const TOOL_LOOP_MAX_STEPS = 5;

export type ParsedToolCall = {
  functionName: string;
  args: unknown;
};

export type ToolBufferState = {
  buffer: string;
  inToolCall: boolean;
};

export function makeToolBufferState(): ToolBufferState {
  return { buffer: '', inToolCall: false };
}

export type ToolBufferChunk =
  | { kind: 'visible'; text: string }
  | { kind: 'tool-call'; call: ParsedToolCall }
  | { kind: 'tool-call-malformed'; raw: string; error: string };

// 增量解析：把流式 chunk 拆成可见 text 与 tool_call 事件
export function feedToolBuffer(state: ToolBufferState, incoming: string): ToolBufferChunk[] {
  state.buffer += incoming;
  const out: ToolBufferChunk[] = [];

  while (state.buffer.length > 0) {
    if (!state.inToolCall) {
      const openIdx = state.buffer.indexOf(TOOL_CALL_OPEN);
      if (openIdx === -1) {
        // 没有起始标签：可能有部分前缀，保留 buffer 末尾以便后续匹配
        const safeEmitLen = Math.max(0, state.buffer.length - (TOOL_CALL_OPEN.length - 1));
        if (safeEmitLen > 0) {
          out.push({ kind: 'visible', text: state.buffer.slice(0, safeEmitLen) });
          state.buffer = state.buffer.slice(safeEmitLen);
        }
        break;
      }
      if (openIdx > 0) {
        out.push({ kind: 'visible', text: state.buffer.slice(0, openIdx) });
      }
      state.buffer = state.buffer.slice(openIdx + TOOL_CALL_OPEN.length);
      state.inToolCall = true;
    } else {
      const closeIdx = state.buffer.indexOf(TOOL_CALL_CLOSE);
      if (closeIdx === -1) {
        // 未闭合：等待更多 chunk
        break;
      }
      const raw = state.buffer.slice(0, closeIdx).trim();
      state.buffer = state.buffer.slice(closeIdx + TOOL_CALL_CLOSE.length);
      state.inToolCall = false;
      try {
        const parsed = JSON.parse(raw);
        const functionName = String(parsed?.name || '').trim();
        if (!functionName) {
          out.push({ kind: 'tool-call-malformed', raw, error: 'missing "name"' });
        } else {
          out.push({
            kind: 'tool-call',
            call: { functionName, args: parsed?.args ?? parsed?.arguments ?? {} },
          });
        }
      } catch (error) {
        out.push({
          kind: 'tool-call-malformed',
          raw,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return out;
}

// 把工具清单格式化成 system 段插入文本
export function buildToolsSystemSnippet(tools: LocalMcpToolDescriptor[]): string {
  if (!tools.length) return '';
  const list = tools.map((t) => {
    const params = safeStringifyShort(t.parameters);
    return `- ${t.functionName}: ${t.description}\n  parameters: ${params}`;
  }).join('\n');
  return [
    'You may call external tools to help answer the user. When you need a tool, output ONE call on its own line in this exact format and STOP further text until you receive a <tool_result>:',
    '<tool_call>{"name":"<functionName>","args":{...}}</tool_call>',
    'Rules:',
    '- "name" must be one of the available tools.',
    '- "args" must satisfy the tool parameters JSON schema.',
    '- Do not wrap the call in code fences.',
    '- After receiving <tool_result>, summarize the result for the user.',
    `Available tools:\n${list}`,
  ].join('\n');
}

function safeStringifyShort(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    if (s.length <= 400) return s;
    return s.slice(0, 397) + '...';
  } catch {
    return '{}';
  }
}

export function makeToolResultMessage(functionName: string, callId: string, result: unknown, error?: string): LocalLlmMessage {
  const payload = error
    ? JSON.stringify({ ok: false, error })
    : JSON.stringify({ ok: true, result: normalizeForJson(result) });
  return {
    role: 'user',
    content: `<tool_result name="${functionName}" id="${callId}">${payload}</tool_result>`,
  };
}

function normalizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return String(value);
  }
}

export function makeAssistantToolCallMessage(call: ParsedToolCall): LocalLlmMessage {
  return {
    role: 'assistant',
    content: `${TOOL_CALL_OPEN}${JSON.stringify({ name: call.functionName, args: call.args })}${TOOL_CALL_CLOSE}`,
  };
}

export function makeStatusEvent(
  phase: LocalMcpToolStatus['phase'],
  call: ParsedToolCall,
  callId: string,
  errorMsg?: string,
): LocalMcpToolStatus {
  const displayName = call.functionName;
  const message = phase === 'error'
    ? `调用工具失败：${displayName}${errorMsg ? `（${errorMsg}）` : ''}`
    : `调用工具：${displayName}`;
  return {
    phase,
    id: callId,
    toolName: call.functionName,
    displayName,
    message,
  };
}

export function argsHashKey(call: ParsedToolCall): string {
  let s = '';
  try { s = JSON.stringify(call.args); } catch { s = String(call.args ?? ''); }
  return `${call.functionName}::${s}`;
}
