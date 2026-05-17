import { reactive, ref, watch } from 'vue';
import { saveConfig } from '@/shared/config';
import {
  isMcpAuthType,
  mcpEntriesToServers,
  mcpServersToEntries,
  normalizeMcpServerName,
  type McpAuthType,
  type McpServerType,
} from '@/shared/mcp';
import { useToast } from '@/window/composables/useToast';
import type { SettingsStore } from './useSettingsStore';

export const MCP_AUTH_TYPE_OPTIONS: Array<{ value: McpAuthType; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'header', label: '自定义请求头' },
];

export function useMcpServers(store: SettingsStore) {
  const toast = useToast();
  const { mcpServers, config } = store;

  const mcpExpanded = reactive<boolean[]>([]);
  const mcpTesting = reactive<boolean[]>([]);
  const mcpShowAuthSecret = reactive<boolean[]>([]);
  const showAddMcpServer = ref(false);
  const mcpAddForm = reactive({
    name: '',
    type: 'streamable_http' as McpServerType,
    url: '',
    authType: 'none' as McpAuthType,
    authToken: '',
    username: '',
    password: '',
    headerName: '',
    headerValue: '',
  });

  function syncMcpServerUiState() {
    mcpServers.value.forEach((_, index) => {
      mcpExpanded[index] = !!mcpExpanded[index];
      mcpTesting[index] = !!mcpTesting[index];
      mcpShowAuthSecret[index] = !!mcpShowAuthSecret[index];
    });
    mcpExpanded.length = mcpServers.value.length;
    mcpTesting.length = mcpServers.value.length;
    mcpShowAuthSecret.length = mcpServers.value.length;
  }

  watch(() => mcpServers.value.length, () => syncMcpServerUiState(), { immediate: true });

  function resetMcpAddForm() {
    mcpAddForm.name = '';
    mcpAddForm.type = 'streamable_http';
    mcpAddForm.url = '';
    mcpAddForm.authType = 'none';
    mcpAddForm.authToken = '';
    mcpAddForm.username = '';
    mcpAddForm.password = '';
    mcpAddForm.headerName = '';
    mcpAddForm.headerValue = '';
  }

  function openAddMcpServer() {
    resetMcpAddForm();
    showAddMcpServer.value = true;
  }

  function closeAddMcpServer() {
    showAddMcpServer.value = false;
  }

  function validateMcpNames(): boolean {
    const seen = new Set<string>();
    for (const server of mcpServers.value) {
      const name = normalizeMcpServerName(server.name);
      if (!name) {
        toast.error('MCP 名称不能为空');
        return false;
      }
      if (seen.has(name)) {
        toast.error(`MCP 名称重复：${name}`);
        return false;
      }
      seen.add(name);
      server.name = name;
      server.url = String(server.url || '').trim();
      server.authType = isMcpAuthType(server.authType) ? server.authType : 'none';
      server.authToken = String(server.authToken || '').trim();
      server.username = String(server.username || '').trim();
      server.password = String(server.password || '');
      server.headerName = String(server.headerName || '').trim();
      server.headerValue = String(server.headerValue || '');
      if (!server.url) {
        toast.error(`MCP URL 不能为空：${name}`);
        return false;
      }
      if (server.authType === 'bearer' && !server.authToken) {
        toast.error(`Bearer Token 不能为空：${name}`);
        return false;
      }
      if (server.authType === 'basic' && !server.username) {
        toast.error(`Basic Auth 用户名不能为空：${name}`);
        return false;
      }
      if (server.authType === 'header' && (!server.headerName || !server.headerValue)) {
        toast.error(`自定义请求头鉴权不能为空：${name}`);
        return false;
      }
    }
    return true;
  }

  async function saveMcpSettings(showToast = true) {
    try {
      if (!validateMcpNames()) return;
      const servers = mcpEntriesToServers(mcpServers.value);
      mcpServers.value = mcpServersToEntries(servers);
      (config.value as any).mcpServers = servers;
      await saveConfig({ mcpServers: servers } as any);
      if (showToast) toast.success('MCP 设置已保存');
    } catch (e: any) {
      toast.error(String(e?.message || e || '保存失败'));
    }
  }

  async function handleAddMcpServer() {
    const name = normalizeMcpServerName(mcpAddForm.name);
    const url = String(mcpAddForm.url || '').trim();
    if (!name) {
      toast.error('MCP 名称不能为空');
      return;
    }
    if (mcpServers.value.some((item) => item.name === name)) {
      toast.error('MCP 名称已存在');
      return;
    }
    if (!url) {
      toast.error('MCP URL 不能为空');
      return;
    }
    mcpServers.value = [
      ...mcpServers.value,
      {
        name,
        type: mcpAddForm.type,
        url,
        enabled: true,
        authType: mcpAddForm.authType,
        authToken: mcpAddForm.authToken,
        username: mcpAddForm.username,
        password: mcpAddForm.password,
        headerName: mcpAddForm.headerName,
        headerValue: mcpAddForm.headerValue,
      },
    ];
    await saveMcpSettings(false);
    closeAddMcpServer();
    toast.success('MCP 服务已添加');
  }

  async function removeMcpServer(idx: number) {
    const server = mcpServers.value[idx];
    if (!server) return;
    mcpServers.value.splice(idx, 1);
    await saveMcpSettings(false);
    toast.success('MCP 服务已删除');
  }

  async function handleTestMcpServer(idx: number) {
    const server = mcpServers.value[idx];
    if (!server) return;
    const name = normalizeMcpServerName(server.name);
    const url = String(server.url || '').trim();
    if (!name) {
      toast.error('MCP 名称不能为空');
      return;
    }
    if (!url) {
      toast.error('MCP URL 不能为空');
      return;
    }

    mcpTesting[idx] = true;
    try {
      const resp = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'testMcpServer',
          server: {
            name,
            type: server.type,
            url,
            authType: server.authType,
            authToken: server.authToken,
            username: server.username,
            password: server.password,
            headerName: server.headerName,
            headerValue: server.headerValue,
          },
        }, (result: any) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(result);
        });
      });

      if (!resp) {
        toast.error('MCP 测试失败：无响应');
        return;
      }
      if (!resp.ok) {
        toast.error(`MCP 测试失败：${resp.error || '未知错误'}`);
        return;
      }
      const tools = Array.isArray(resp.tools) ? resp.tools : [];
      const names = tools.map((tool: any) => String(tool?.name || '').trim()).filter(Boolean);
      const suffix = names.length ? `：${names.slice(0, 6).join('、')}${names.length > 6 ? '…' : ''}` : '';
      toast.success(`MCP 测试成功，发现 ${tools.length} 个工具${suffix}`);
    } catch (e: any) {
      toast.error(`MCP 测试失败：${String(e?.message || e || '调用失败')}`);
    } finally {
      mcpTesting[idx] = false;
    }
  }

  return {
    mcpExpanded,
    mcpTesting,
    mcpShowAuthSecret,
    showAddMcpServer,
    mcpAddForm,
    mcpAuthTypeOptions: MCP_AUTH_TYPE_OPTIONS,
    openAddMcpServer,
    closeAddMcpServer,
    handleAddMcpServer,
    removeMcpServer,
    handleTestMcpServer,
    saveMcpSettings,
  };
}
