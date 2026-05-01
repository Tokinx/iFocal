export type McpServerType = 'sse' | 'streamable_http';
export type McpAuthType = 'none' | 'bearer' | 'basic' | 'header';

export interface McpServerConfig {
  type: McpServerType;
  url: string;
  enabled: boolean;
  authType?: McpAuthType;
  authToken?: string;
  username?: string;
  password?: string;
  headerName?: string;
  headerValue?: string;
  builtin?: boolean;
  builtinId?: string;
}

export type McpServersConfig = Record<string, McpServerConfig>;

export interface McpServerEntry extends McpServerConfig {
  name: string;
}

export const DEFAULT_MCP_SERVER_NAMES: readonly string[] = [];
export const DEFAULT_MCP_SERVERS: McpServersConfig = {};

export function isMcpServerType(value: unknown): value is McpServerType {
  return value === 'sse' || value === 'streamable_http';
}

export function isMcpAuthType(value: unknown): value is McpAuthType {
  return value === 'none' || value === 'bearer' || value === 'basic' || value === 'header';
}

export function normalizeMcpServerName(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeBuiltinMcpServerName(value: unknown): string {
  return normalizeMcpServerName(value);
}

export function normalizeMcpServers(raw: unknown): McpServersConfig {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const normalized: McpServersConfig = {};

  for (const [name, value] of Object.entries(input)) {
    const normalizedName = normalizeMcpServerName(name);
    if (!normalizedName || !value || typeof value !== 'object') continue;
    const server = normalizeMcpServerConfig(value as Partial<McpServerConfig>);
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
    next[name] = normalizeMcpServerConfig(entry);
  }
  return normalizeMcpServers(next);
}

function normalizeMcpServerConfig(raw: Partial<McpServerConfig>): McpServerConfig {
  const authType = isMcpAuthType(raw.authType) ? raw.authType : 'none';
  return {
    type: isMcpServerType(raw.type) ? raw.type : 'streamable_http',
    url: String(raw.url || '').trim(),
    enabled: raw.enabled !== false,
    authType,
    authToken: authType === 'bearer' ? String(raw.authToken || '').trim() : '',
    username: authType === 'basic' ? String(raw.username || '').trim() : '',
    password: authType === 'basic' ? String(raw.password || '') : '',
    headerName: authType === 'header' ? String(raw.headerName || '').trim() : '',
    headerValue: authType === 'header' ? String(raw.headerValue || '') : '',
    builtin: false,
    builtinId: undefined,
  };
}
