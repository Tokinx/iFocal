// 本地模型路径的 MCP 工具调用 dispatcher
// 与 AI SDK 自动 dispatch 不同，这里是"手工 dispatch"：列工具 → 让 offscreen 端模型决定调用哪一个 → 单次执行
//
// 设计：per-request 生命周期，开始时连接所有启用的 server，结束后统一释放

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import {
  normalizeMcpServers,
  type McpServerConfig,
  type McpServersConfig,
} from '@/shared/mcp';
import type { LocalMcpToolDescriptor } from '@/shared/local-llm-types';

const MCP_CONNECT_TIMEOUT_MS = 15000;
const MCP_REQUEST_TIMEOUT_MS = 20000;

type ToolEntry = {
  serverName: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
  client: MCPClient;
  toolKey: string; // AI SDK tool key returned by toolsFromDefinitions
  toolDef: any;
};

export type PreparedLocalMcpTools = {
  descriptors: LocalMcpToolDescriptor[];
  byFunctionName: Map<string, ToolEntry>;
  clients: MCPClient[];
};

function safeWorkerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input as any, init as any);
}

function buildAuthHeaders(server: McpServerConfig): Record<string, string> | undefined {
  const authType = server.authType || 'none';
  if (authType === 'bearer') {
    const token = String(server.authToken || '').trim();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }
  if (authType === 'basic') {
    const username = String(server.username || '');
    const password = String(server.password || '');
    if (!username && !password) return undefined;
    let encoded = '';
    try { encoded = btoa(unescape(encodeURIComponent(`${username}:${password}`))); }
    catch { encoded = btoa(`${username}:${password}`); }
    return { Authorization: `Basic ${encoded}` };
  }
  if (authType === 'header') {
    const headerName = String(server.headerName || '').trim();
    const headerValue = String(server.headerValue || '');
    return headerName && headerValue ? { [headerName]: headerValue } : undefined;
  }
  return undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
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

function sanitizeFunctionName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

function chooseUniqueName(base: string, used: Set<string>): string {
  if (base && !used.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}_${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}

export function resolveEnabledServerNames(servers: McpServersConfig, enabled: string[] | undefined): string[] {
  if (!servers) return [];
  const allNames = Object.keys(servers).filter((n) => !!servers[n]?.url);
  if (!Array.isArray(enabled)) return allNames;
  const allowed = new Set(enabled.map((n) => String(n || '').trim()).filter(Boolean));
  return allNames.filter((n) => allowed.has(n));
}

export async function prepareLocalMcpTools(
  rawServers: unknown,
  enabledServerNames: string[] | undefined,
): Promise<PreparedLocalMcpTools> {
  const servers = normalizeMcpServers(rawServers);
  const names = resolveEnabledServerNames(servers, enabledServerNames);
  const descriptors: LocalMcpToolDescriptor[] = [];
  const byFunctionName = new Map<string, ToolEntry>();
  const clients: MCPClient[] = [];
  const usedNames = new Set<string>();

  if (!names.length) {
    return { descriptors, byFunctionName, clients };
  }

  for (const name of names) {
    const server = servers[name];
    if (!server?.url) continue;
    let client: MCPClient | null = null;
    try {
      const headers = buildAuthHeaders(server);
      client = await withTimeout(
        createMCPClient({
          name: 'ifocal-local-mcp',
          version: '0.4.0',
          transport: {
            type: server.type === 'sse' ? 'sse' : 'http',
            url: server.url,
            ...(headers ? { headers } : {}),
            fetch: safeWorkerFetch as any,
          },
          onUncaughtError(error) {
            console.warn(`[LocalMCP] ${name} 未捕获错误：`, error);
          },
        }),
        MCP_CONNECT_TIMEOUT_MS,
        `连接 MCP 超时：${name}`,
      );

      const definitions = await withTimeout(
        client.listTools({
          options: {
            timeout: MCP_REQUEST_TIMEOUT_MS,
            maxTotalTimeout: MCP_REQUEST_TIMEOUT_MS,
          },
        }),
        MCP_REQUEST_TIMEOUT_MS,
        `读取 MCP 工具超时：${name}`,
      );
      const serverTools = client.toolsFromDefinitions(definitions);

      for (const [toolKey, toolDef] of Object.entries(serverTools)) {
        const sanitized = sanitizeFunctionName(toolKey) || sanitizeFunctionName(`${name}_${toolKey}`);
        const functionName = chooseUniqueName(sanitized || `mcp_${name}`, usedNames);
        usedNames.add(functionName);
        const description = String((toolDef as any)?.description || toolKey);
        const parameters = normalizeParameters((toolDef as any)?.inputSchema ?? (definitions as any)?.[toolKey]?.inputSchema);
        descriptors.push({
          functionName,
          serverName: name,
          toolName: toolKey,
          description: `[${name}] ${description}`,
          parameters,
        });
        byFunctionName.set(functionName, {
          serverName: name,
          toolName: toolKey,
          description,
          parameters,
          client,
          toolKey,
          toolDef,
        });
      }

      clients.push(client);
      client = null;
    } catch (error) {
      console.warn(`[LocalMCP] 加载 ${name} 工具失败：`, error);
    } finally {
      if (client) {
        try { await client.close(); } catch { /* ignore */ }
      }
    }
  }

  return { descriptors, byFunctionName, clients };
}

function normalizeParameters(inputSchema: unknown): Record<string, unknown> {
  if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
    return { type: 'object', properties: {} };
  }
  try {
    const schema = JSON.parse(JSON.stringify(inputSchema)) as Record<string, unknown>;
    if (!schema.type) schema.type = 'object';
    if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
      schema.properties = {};
    }
    return schema;
  } catch {
    return { type: 'object', properties: {} };
  }
}

export async function callOneLocalMcpTool(
  prepared: PreparedLocalMcpTools,
  functionName: string,
  args: unknown,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const entry = prepared.byFunctionName.get(functionName);
  if (!entry) {
    return { ok: false, error: `Unknown tool: ${functionName}` };
  }
  try {
    const exec = (entry.toolDef as any)?.execute;
    if (typeof exec !== 'function') {
      return { ok: false, error: `Tool ${functionName} has no execute() method` };
    }
    const result = await withTimeout(
      Promise.resolve(exec(args ?? {}, { toolCallId: `local-${Date.now()}`, messages: [] })),
      MCP_REQUEST_TIMEOUT_MS,
      `调用 MCP 工具超时：${functionName}`,
    );
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function releaseLocalMcpTools(prepared: PreparedLocalMcpTools): Promise<void> {
  await Promise.all(prepared.clients.map(async (c) => {
    try { await c.close(); } catch { /* ignore */ }
  }));
  prepared.clients.length = 0;
  prepared.byFunctionName.clear();
  prepared.descriptors.length = 0;
}
