export type McpServerType = 'sse' | 'streamable_http';

export interface McpServerConfig {
  type: McpServerType;
  url: string;
  enabled: boolean;
  builtin?: boolean;
}

export type McpServersConfig = Record<string, McpServerConfig>;

export interface McpServerEntry extends McpServerConfig {
  name: string;
}

export const DEFAULT_MCP_SERVER_NAMES = ['duckduckgo-mcp-server', 'time'] as const;

export const DEFAULT_MCP_SERVERS: McpServersConfig = {
  'duckduckgo-mcp-server': {
    type: 'sse',
    url: 'https://mcp.api-inference.modelscope.net/641472f8636f43/sse',
    enabled: true,
    builtin: true,
  },
  time: {
    type: 'streamable_http',
    url: 'https://mcp.api-inference.modelscope.net/3934a224f65e4e/mcp',
    enabled: true,
    builtin: true,
  },
};

export function isMcpServerType(value: unknown): value is McpServerType {
  return value === 'sse' || value === 'streamable_http';
}

export function normalizeMcpServerName(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeMcpServers(raw: unknown): McpServersConfig {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const normalized: McpServersConfig = {};

  for (const name of DEFAULT_MCP_SERVER_NAMES) {
    const fallback = DEFAULT_MCP_SERVERS[name];
    const source = input[name] && typeof input[name] === 'object'
      ? input[name] as Partial<McpServerConfig>
      : fallback;
    normalized[name] = normalizeMcpServerConfig(source, fallback, true);
  }

  for (const [name, value] of Object.entries(input)) {
    const normalizedName = normalizeMcpServerName(name);
    if (!normalizedName || DEFAULT_MCP_SERVER_NAMES.includes(normalizedName as any)) continue;
    if (!value || typeof value !== 'object') continue;
    const server = normalizeMcpServerConfig(value as Partial<McpServerConfig>, null, false);
    if (!server.url) continue;
    normalized[normalizedName] = server;
  }

  return normalized;
}

export function mcpServersToEntries(raw: unknown): McpServerEntry[] {
  const servers = normalizeMcpServers(raw);
  return Object.entries(servers).map(([name, server]) => ({
    name,
    ...server,
  }));
}

export function mcpEntriesToServers(entries: McpServerEntry[]): McpServersConfig {
  const next: McpServersConfig = {};
  for (const entry of entries) {
    const name = normalizeMcpServerName(entry.name);
    if (!name) continue;
    next[name] = {
      type: isMcpServerType(entry.type) ? entry.type : 'streamable_http',
      url: String(entry.url || '').trim(),
      enabled: true,
      builtin: DEFAULT_MCP_SERVER_NAMES.includes(name as any) ? true : !!entry.builtin,
    };
  }
  return normalizeMcpServers(next);
}

function normalizeMcpServerConfig(
  raw: Partial<McpServerConfig>,
  fallback: McpServerConfig | null,
  builtin: boolean,
): McpServerConfig {
  const fallbackType = fallback?.type || 'streamable_http';
  const fallbackUrl = fallback?.url || '';
  const type = isMcpServerType(raw.type) ? raw.type : fallbackType;
  return {
    type,
    url: String(raw.url || fallbackUrl).trim(),
    enabled: true,
    builtin,
  };
}
