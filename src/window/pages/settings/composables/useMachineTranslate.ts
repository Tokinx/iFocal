import { computed, reactive, ref, watch } from 'vue';
import { saveConfig } from '@/shared/config';
import {
  MACHINE_TRANSLATE_PROVIDER_OPTIONS,
  createMachineTranslateChannel,
  getMachineTranslateProviderMeta,
  normalizeMachineTranslateChannels,
  normalizeMachineTranslateDefaultChannelId,
  type MachineTranslateChannel,
  type MachineTranslateProvider,
} from '@/shared/machine-translation';
import { useToast } from '@/window/composables/useToast';
import type { SettingsStore } from './useSettingsStore';

function machineProviderShowsApiKey(provider: MachineTranslateProvider) {
  return provider !== 'google-free' && provider !== 'microsoft-free';
}

function machineProviderNeedsApiKey(provider: MachineTranslateProvider) {
  return getMachineTranslateProviderMeta(provider).requiresApiKey;
}

function machineProviderNeedsSecretKey(provider: MachineTranslateProvider) {
  return !!getMachineTranslateProviderMeta(provider).requiresSecretKey;
}

function machineProviderSupportsRegion(provider: MachineTranslateProvider) {
  return !!getMachineTranslateProviderMeta(provider).supportsRegion;
}

function machineProviderExperimental(provider: MachineTranslateProvider) {
  return !!getMachineTranslateProviderMeta(provider).experimental;
}

function machineProviderLabel(provider: MachineTranslateProvider) {
  return getMachineTranslateProviderMeta(provider).label;
}

function machineProviderDescription(provider: MachineTranslateProvider) {
  return getMachineTranslateProviderMeta(provider).description;
}

function machineProviderModeLabel(provider: MachineTranslateProvider) {
  if (provider === 'google-free' || provider === 'microsoft-free') return '内置免费';
  if (provider === 'google-official' || provider === 'microsoft-official' || provider === 'deepl' || provider === 'baidu') return '官方';
  if (provider === 'deeplx') return '自建';
  return '';
}

function applyMachineProviderDefaults(target: { provider: MachineTranslateProvider; name?: string; apiUrl?: string; qps?: number; maxConcurrent?: number; timeoutMs?: number; batchSize?: number }) {
  const meta = getMachineTranslateProviderMeta(target.provider);
  if (!target.name) target.name = meta.label;
  if (!target.apiUrl) target.apiUrl = meta.defaultApiUrl;
  target.qps = Number(target.qps) || meta.defaultQps;
  target.maxConcurrent = Number(target.maxConcurrent) || meta.defaultMaxConcurrent;
  target.timeoutMs = Number(target.timeoutMs) || meta.defaultTimeoutMs;
  target.batchSize = Number(target.batchSize) || meta.defaultBatchSize;
}

function toMachineChannelPayload(channel: MachineTranslateChannel): MachineTranslateChannel {
  return {
    id: String(channel.id || ''),
    name: String(channel.name || ''),
    provider: channel.provider,
    apiUrl: String(channel.apiUrl || ''),
    apiKey: String(channel.apiKey || ''),
    secretKey: String(channel.secretKey || ''),
    region: String(channel.region || ''),
    enabled: !!channel.enabled,
    builtin: !!channel.builtin,
    qps: Number(channel.qps) || undefined,
    maxConcurrent: Number(channel.maxConcurrent) || undefined,
    timeoutMs: Number(channel.timeoutMs) || undefined,
    batchSize: Number(channel.batchSize) || undefined,
  };
}

export function useMachineTranslate(store: SettingsStore) {
  const toast = useToast();
  const { machineChannels, mtDefaultChannelId, config } = store;

  const mtExpanded = reactive<boolean[]>([]);
  const mtTesting = reactive<boolean[]>([]);
  const mtShowApiKey = reactive<boolean[]>([]);
  const mtShowSecretKey = reactive<boolean[]>([]);
  const showAddMachineChannel = ref(false);
  const mtProviderOptions = computed(() => MACHINE_TRANSLATE_PROVIDER_OPTIONS.filter((provider) => {
    return provider.value !== 'google-free' && provider.value !== 'microsoft-free';
  }));
  const mtAddForm = reactive({
    provider: 'deeplx' as MachineTranslateProvider,
    name: '',
    apiUrl: '',
    apiKey: '',
    secretKey: '',
    region: '',
    qps: 4,
    maxConcurrent: 4,
    timeoutMs: 20000,
    batchSize: 5,
    enabled: true,
  });

  function syncMachineChannelUiState() {
    machineChannels.value.forEach((_, index) => {
      mtExpanded[index] = !!mtExpanded[index];
      mtTesting[index] = !!mtTesting[index];
      mtShowApiKey[index] = !!mtShowApiKey[index];
      mtShowSecretKey[index] = !!mtShowSecretKey[index];
    });
    mtExpanded.length = machineChannels.value.length;
    mtTesting.length = machineChannels.value.length;
    mtShowApiKey.length = machineChannels.value.length;
    mtShowSecretKey.length = machineChannels.value.length;
  }

  watch(() => machineChannels.value.length, () => syncMachineChannelUiState(), { immediate: true });

  function resetMachineAddForm() {
    mtAddForm.provider = 'deeplx';
    mtAddForm.name = '';
    mtAddForm.apiUrl = '';
    mtAddForm.apiKey = '';
    mtAddForm.secretKey = '';
    mtAddForm.region = '';
    mtAddForm.enabled = true;
    applyMachineProviderDefaults(mtAddForm);
  }

  function openAddMachineChannel() {
    resetMachineAddForm();
    showAddMachineChannel.value = true;
  }

  function closeAddMachineChannel() {
    showAddMachineChannel.value = false;
  }

  function handleMachineAddProviderChange(value: string) {
    mtAddForm.provider = value as MachineTranslateProvider;
    mtAddForm.name = '';
    mtAddForm.apiUrl = '';
    mtAddForm.apiKey = '';
    mtAddForm.secretKey = '';
    mtAddForm.region = '';
    applyMachineProviderDefaults(mtAddForm);
  }

  function handleMachineChannelProviderChange(channel: MachineTranslateChannel, value: string) {
    channel.provider = value as MachineTranslateProvider;
    const meta = getMachineTranslateProviderMeta(channel.provider);
    channel.apiUrl = meta.defaultApiUrl;
    channel.qps = meta.defaultQps;
    channel.maxConcurrent = meta.defaultMaxConcurrent;
    channel.timeoutMs = meta.defaultTimeoutMs;
    channel.batchSize = meta.defaultBatchSize;
    if (!machineProviderShowsApiKey(channel.provider)) channel.apiKey = undefined;
    if (!machineProviderNeedsSecretKey(channel.provider)) channel.secretKey = undefined;
    if (!machineProviderSupportsRegion(channel.provider)) channel.region = undefined;
    if (!channel.name) channel.name = meta.label;
  }

  async function saveMachineTranslateSettings(showToast = true) {
    try {
      const channels = normalizeMachineTranslateChannels(machineChannels.value);
      const defaultId = normalizeMachineTranslateDefaultChannelId(mtDefaultChannelId.value, channels);
      machineChannels.value = channels;
      mtDefaultChannelId.value = defaultId;
      (config.value as any).mtChannels = channels;
      (config.value as any).mtDefaultChannelId = defaultId;
      await saveConfig({ mtChannels: channels, mtDefaultChannelId: defaultId } as any);
      if (showToast) toast.success('机器翻译设置已保存');
    } catch (e: any) {
      toast.error(String(e?.message || e || '保存失败'));
    }
  }

  async function handleAddMachineChannel() {
    const channel = createMachineTranslateChannel(mtAddForm.provider);
    channel.name = (mtAddForm.name || '').trim() || machineProviderLabel(mtAddForm.provider);
    channel.apiUrl = (mtAddForm.apiUrl || '').trim() || getMachineTranslateProviderMeta(mtAddForm.provider).defaultApiUrl;
    channel.apiKey = (mtAddForm.apiKey || '').trim() || undefined;
    channel.secretKey = (mtAddForm.secretKey || '').trim() || undefined;
    channel.region = (mtAddForm.region || '').trim() || undefined;
    channel.enabled = !!mtAddForm.enabled;
    channel.qps = Number(mtAddForm.qps) || getMachineTranslateProviderMeta(mtAddForm.provider).defaultQps;
    channel.maxConcurrent = Number(mtAddForm.maxConcurrent) || getMachineTranslateProviderMeta(mtAddForm.provider).defaultMaxConcurrent;
    channel.timeoutMs = Number(mtAddForm.timeoutMs) || getMachineTranslateProviderMeta(mtAddForm.provider).defaultTimeoutMs;
    channel.batchSize = Number(mtAddForm.batchSize) || getMachineTranslateProviderMeta(mtAddForm.provider).defaultBatchSize;
    machineChannels.value = [...machineChannels.value, channel];
    await saveMachineTranslateSettings(false);
    closeAddMachineChannel();
    toast.success('机器翻译渠道已添加');
  }

  async function removeMachineChannel(idx: number) {
    const channel = machineChannels.value[idx];
    if (!channel) return;
    if (channel.builtin) {
      toast.error('内置免费渠道不可删除，可选择禁用');
      return;
    }
    machineChannels.value.splice(idx, 1);
    await saveMachineTranslateSettings(false);
    toast.success('机器翻译渠道已删除');
  }

  function testMachineChannel(idx: number) {
    const channel = machineChannels.value[idx];
    if (!channel) return;
    mtTesting[idx] = true;
    try {
      const payloadChannel = toMachineChannelPayload(channel);
      chrome.runtime.sendMessage({
        action: 'testMachineTranslateChannel',
        channel: payloadChannel,
        targetLang: config.value.translateTargetLang || 'zh-CN',
        sourceLang: 'en',
      }, (resp: any) => {
        mtTesting[idx] = false;
        const lastError = chrome.runtime.lastError?.message;
        if (lastError) {
          toast.error(`测试失败：${lastError}`);
          return;
        }
        if (!resp) {
          toast.error('测试失败：无响应，请重新加载扩展后重试');
          return;
        }
        if (resp.ok) toast.success(`测试成功：${String(resp.sample || '').slice(0, 40)}`);
        else toast.error(`测试失败：${resp.error || '未知错误'}`);
      });
    } catch {
      mtTesting[idx] = false;
      toast.error('测试调用失败');
    }
  }

  return {
    mtExpanded,
    mtTesting,
    mtShowApiKey,
    mtShowSecretKey,
    showAddMachineChannel,
    mtAddForm,
    mtProviderOptions,
    openAddMachineChannel,
    closeAddMachineChannel,
    handleMachineAddProviderChange,
    handleMachineChannelProviderChange,
    handleAddMachineChannel,
    removeMachineChannel,
    testMachineChannel,
    saveMachineTranslateSettings,
    machineProviderLabel,
    machineProviderDescription,
    machineProviderShowsApiKey,
    machineProviderNeedsApiKey,
    machineProviderNeedsSecretKey,
    machineProviderSupportsRegion,
    machineProviderExperimental,
    machineProviderModeLabel,
    getMachineTranslateProviderMeta,
  };
}
