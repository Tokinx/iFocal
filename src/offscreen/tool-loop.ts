// 解析模型流式输出中的 <tool_call>...</tool_call> JSON
// 通过反向 port message 请求 background 调用 MCP 工具，再把结果包成 <tool_result> 续 prompt
//
// 协议（推荐）：
//   <tool_call>{"name":"<functionName>","args":{...}}</tool_call>
//   <tool_result name="<functionName>" id="<callId>">...</tool_result>
//
// 为了适配 Gemini Nano 这类小模型对协议遵循能力差的问题，解析器额外接受以下变体：
//   - <tool_calls>...</tool_calls>、<function_call>...</function_call>、<tool_use>...</tool_use>
//   - 自闭合标签 <tool_call ... />（无内容则跳过）
//   - 闭合标签缺尾部 `>`（如 `</tool_call`）—— 在流结束兜底处理
//   - 工具调用 JSON 被 ```json ... ``` / ``` ... ``` 代码块包裹
//   - 完全裸的 JSON 对象（无任何标签包裹）—— 仅当 name 命中已知工具时才视为调用，避免误判正文

import type {
  LocalLlmMessage,
  LocalMcpToolDescriptor,
  LocalMcpToolStatus,
} from '@/shared/local-llm-types';

const TOOL_TAG_NAMES = ['tool_call', 'tool_calls', 'function_call', 'tool_use'];
const TOOL_TAG_ALT = TOOL_TAG_NAMES.join('|');

// 起始 tag：<tool_call ...> 或 <tool_call ... />。属性段忽略
const OPEN_TAG_RE = new RegExp(`<(${TOOL_TAG_ALT})\\b[^>]*?(/?)>`, 'i');
// 闭合 tag：必须带尾部 '>'，避免在流中段误判
const CLOSE_TAG_RE = new RegExp(`<\\/(${TOOL_TAG_ALT})\\s*>`, 'i');
// 宽松闭合：</tool_call 后跟非字母数字下划线，用于 finalize 兜底
const CLOSE_TAG_LOOSE_RE = new RegExp(`<\\/(${TOOL_TAG_ALT})(?![A-Za-z0-9_])`, 'i');

// 增量处理时 buffer 末尾保留长度（覆盖最长可能 tag `<function_call>` 共 15 字符 + 余量）
const SAFE_TAIL_LEN = 24;

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
      const openMatch = OPEN_TAG_RE.exec(state.buffer);
      if (!openMatch) {
        // 没有完整起始 tag：保留末尾防边界切断
        const safeEmitLen = Math.max(0, state.buffer.length - SAFE_TAIL_LEN);
        if (safeEmitLen > 0) {
          out.push({ kind: 'visible', text: state.buffer.slice(0, safeEmitLen) });
          state.buffer = state.buffer.slice(safeEmitLen);
        }
        break;
      }
      const start = openMatch.index;
      const tagEnd = openMatch.index + openMatch[0].length;
      const isSelfClosing = openMatch[2] === '/';
      if (start > 0) {
        out.push({ kind: 'visible', text: state.buffer.slice(0, start) });
      }
      state.buffer = state.buffer.slice(tagEnd);
      if (isSelfClosing) continue;
      state.inToolCall = true;
    } else {
      const closeMatch = CLOSE_TAG_RE.exec(state.buffer);
      if (!closeMatch) {
        // 未闭合：等待更多 chunk
        break;
      }
      const raw = state.buffer.slice(0, closeMatch.index).trim();
      state.buffer = state.buffer.slice(closeMatch.index + closeMatch[0].length);
      state.inToolCall = false;
      const parsed = parseToolCallPayload(raw);
      if (parsed.ok) {
        out.push({ kind: 'tool-call', call: parsed.call });
      } else {
        out.push({ kind: 'tool-call-malformed', raw, error: parsed.error });
      }
    }
  }
  return out;
}

// 流结束时调用，处理 buffer 残余：
//   1. 若仍在 tool_call 内：把 buffer 当作 tool call 内容解析（剥掉尾部 `</tool_call` 碎片、代码块）
//   2. 否则尝试从剩余 buffer 中抽取一段裸 JSON 工具调用（仅当 name 命中 knownToolNames 才采纳）
//   3. 剩下的作为 visible 输出
export function finalizeToolBuffer(
  state: ToolBufferState,
  knownToolNames?: Set<string>,
): ToolBufferChunk[] {
  const out: ToolBufferChunk[] = [];

  if (state.inToolCall) {
    state.inToolCall = false;
    let payload = state.buffer;
    state.buffer = '';
    const looseClose = CLOSE_TAG_LOOSE_RE.exec(payload);
    if (looseClose) payload = payload.slice(0, looseClose.index);
    payload = payload.trim();
    if (!payload) return out;

    // 优先按 JSON 对象解析；JSON 之后的内容作为可见文本输出
    const obj = extractFirstJsonObject(payload);
    if (obj) {
      const parsed = parseToolCallPayload(obj.json);
      if (parsed.ok) {
        out.push({ kind: 'tool-call', call: parsed.call });
        const tail = payload.slice(obj.end).trim();
        if (tail) out.push({ kind: 'visible', text: tail });
        return out;
      }
    }
    const parsed = parseToolCallPayload(payload);
    if (parsed.ok) {
      out.push({ kind: 'tool-call', call: parsed.call });
    } else {
      out.push({ kind: 'tool-call-malformed', raw: payload, error: parsed.error });
    }
    return out;
  }

  // 不在 tool_call 内：尝试在剩余 buffer 中找一段裸 JSON / 代码块 tool call
  const candidate = tryExtractLooseToolCall(state.buffer, knownToolNames);
  if (candidate) {
    const before = candidate.precedingText.trimEnd();
    if (before) out.push({ kind: 'visible', text: before });
    out.push({ kind: 'tool-call', call: candidate.call });
    state.buffer = candidate.trailingText;
  }

  if (state.buffer) {
    out.push({ kind: 'visible', text: state.buffer });
    state.buffer = '';
  }
  return out;
}

type ParseResult =
  | { ok: true; call: ParsedToolCall }
  | { ok: false; error: string };

function parseToolCallPayload(raw: string): ParseResult {
  const text = stripCodeFence(raw.trim());
  if (!text) return { ok: false, error: 'empty payload' };
  const obj = extractFirstJsonObject(text);
  const jsonStr = obj ? obj.json : text;
  try {
    const parsed = JSON.parse(jsonStr);
    return toolCallFromObject(parsed);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// 支持多种命名约定：
//   { name, args } / { name, arguments } / { name, parameters }
//   { tool, args } / { function, args }
//   { function: { name, arguments } }（OpenAI 风格）
function toolCallFromObject(obj: any): ParseResult {
  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'tool call payload is not an object' };
  }
  let name = '';
  let args: any;
  if (typeof obj.name === 'string') {
    name = obj.name;
    args = pickArgs(obj);
  } else if (typeof obj.tool === 'string') {
    name = obj.tool;
    args = pickArgs(obj);
  } else if (typeof obj.tool_name === 'string') {
    name = obj.tool_name;
    args = pickArgs(obj);
  } else if (obj.function && typeof obj.function === 'object') {
    name = String(obj.function.name || '');
    args = obj.function.arguments ?? obj.function.args ?? obj.function.parameters ?? {};
  }
  name = name.trim();
  if (!name) return { ok: false, error: 'missing "name"' };
  if (typeof args === 'string') {
    // OpenAI 风格 arguments 经常是字符串化 JSON
    try { args = JSON.parse(args); } catch { /* keep raw string */ }
  }
  return { ok: true, call: { functionName: name, args: args ?? {} } };
}

function pickArgs(obj: any): unknown {
  if (obj.args !== undefined) return obj.args;
  if (obj.arguments !== undefined) return obj.arguments;
  if (obj.parameters !== undefined) return obj.parameters;
  if (obj.input !== undefined) return obj.input;
  return {};
}

function tryExtractLooseToolCall(
  buffer: string,
  knownToolNames?: Set<string>,
): { call: ParsedToolCall; precedingText: string; trailingText: string } | null {
  if (!buffer.trim()) return null;

  // 1. 代码块包裹 ```json {...} ``` / ```tool_call {...} ```
  const fenceRe = /```(?:[a-zA-Z_][\w-]*)?\s*\n?([\s\S]*?)\n?```/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRe.exec(buffer))) {
    const inner = fenceMatch[1];
    const parsed = parseToolCallPayload(inner);
    if (parsed.ok && isKnownName(parsed.call.functionName, knownToolNames)) {
      return {
        call: parsed.call,
        precedingText: buffer.slice(0, fenceMatch.index),
        trailingText: buffer.slice(fenceMatch.index + fenceMatch[0].length),
      };
    }
  }

  // 2. 裸 JSON 对象（从首个 { 开始的最大对象）
  const obj = extractFirstJsonObject(buffer);
  if (obj) {
    const parsed = parseToolCallPayload(obj.json);
    if (parsed.ok && isKnownName(parsed.call.functionName, knownToolNames)) {
      return {
        call: parsed.call,
        precedingText: buffer.slice(0, obj.start),
        trailingText: buffer.slice(obj.end),
      };
    }
  }
  return null;
}

// 裸 JSON 兜底必须严格：name 必须命中已知工具，避免把用户正文里的 JSON 误判为调用
function isKnownName(name: string, knownToolNames?: Set<string>): boolean {
  if (!knownToolNames || knownToolNames.size === 0) return false;
  return knownToolNames.has(name);
}

function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const m = /^```(?:[a-zA-Z_][\w-]*)?\s*\n?([\s\S]*?)\n?```$/.exec(trimmed);
  if (m) return m[1].trim();
  return trimmed;
}

// 从字符串中提取首个完整 JSON 对象（处理字符串内的转义和括号）
function extractFirstJsonObject(s: string): { json: string; start: number; end: number } | null {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { json: s.slice(start, i + 1), start, end: i + 1 };
      }
    }
  }
  return null;
}

// 把工具清单格式化成 system 段插入文本
// 设计要点（针对 Gemini Nano 等小模型）：
//   - 把"如何调用"放最前面，立刻给出格式样板
//   - 用具体的中文/英文 few-shot 示例约束输出形状
//   - 关键禁令（no code fences、no extra text）单独成行强调
//   - 工具清单放最后，避免把"规则"挤出 context window
export function buildToolsSystemSnippet(tools: LocalMcpToolDescriptor[]): string {
  if (!tools.length) return '';
  const list = tools.map((t) => {
    const params = safeStringifyShort(t.parameters);
    return `- ${t.functionName}: ${t.description}\n  parameters: ${params}`;
  }).join('\n');
  return [
    'You can use external tools to help the user. To call a tool, reply with ONLY one line in this EXACT format:',
    '<tool_call>{"name":"TOOL_NAME","args":{...}}</tool_call>',
    '',
    'Strict rules (must follow):',
    '- Output the <tool_call>...</tool_call> tag exactly as shown. Use the literal tag name "tool_call".',
    '- Do NOT wrap the call in ```code fences``` or markdown.',
    '- Do NOT write any other text in the same reply when you call a tool. No greetings, no explanations.',
    '- "args" MUST be a JSON object matching the tool\'s parameters schema. Use {} if there are no args.',
    '- After the tool runs, you will receive a <tool_result>...</tool_result> message. Then answer the user in natural language using that result.',
    '- If no tool is needed, just answer the user normally without any <tool_call> tag.',
    '',
    'Examples:',
    'User: 现在几点',
    'Assistant: <tool_call>{"name":"get_current_time","args":{}}</tool_call>',
    '',
    'User: 帮我搜一下东京天气',
    'Assistant: <tool_call>{"name":"web_search","args":{"query":"weather in Tokyo"}}</tool_call>',
    '',
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
    content: `<tool_call>${JSON.stringify({ name: call.functionName, args: call.args })}</tool_call>`,
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
