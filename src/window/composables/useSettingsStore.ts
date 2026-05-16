import { inject, ref, watch, type InjectionKey } from 'vue';
import { DEFAULT_CONFIG, loadConfig } from '@/shared/config';
import {
  ASSISTANT_CONFIGS_STORAGE_KEY,
  DEFAULT_ASSISTANT_ID,
  DEFAULT_ASSISTANT_ID_STORAGE_KEY,
  normalizeAssistantConfigs,
  resolveAssistantId,
  type AssistantConfig,
} from '@/shared/assistants';
import {
  normalizeMachineTranslateChannels,
  normalizeMachineTranslateDefaultChannelId,
  type MachineTranslateChannel,
} from '@/shared/machine-translation';
import { mcpServersToEntries, type McpServerEntry } from '@/shared/mcp';
import { mergeTargetStylePresets } from '@/shared/style-presets';
import { modelIdFromSpec, parseModelSpec } from '@/shared/model-utils';
import { useChannels } from './useChannels';

export type ModelPair = { channel: string; model: string } | null;

const ALLOWED_CONTEXT_MESSAGE_COUNTS: readonly number[] = [2, 6, 10];

function normalizeContextMessagesCount(value: unknown): number {
  const num = Number(value);
  return ALLOWED_CONTEXT_MESSAGE_COUNTS.includes(num) ? num : 2;
}

function joinPair(pair: ModelPair) {
  if (!pair || !(pair as any).channel || !(pair as any).model) return '';
  const modelId = modelIdFromSpec((pair as any).model);
  if (!modelId) return '';
  return `${(pair as any).channel}|${modelId}`;
}

function parsePair(value: string): ModelPair {
  if (!value || value === '__unset__') return null;
  const [channel, model] = value.split('|');
  if (!channel || !model) return null;
  return { channel, model };
}

function modelOptionsOf(models: string[] | undefined) {
  return (models || []).map((m) => {
    const { modelId, displayName } = parseModelSpec(m);
    return { modelId, displayName: displayName || modelId };
  }).filter((m) => !!m.modelId);
}

export function createSettingsStore() {
  const channelsApi = useChannels();

  const config = ref({ ...DEFAULT_CONFIG });
  const machineChannels = ref<MachineTranslateChannel[]>(normalizeMachineTranslateChannels(DEFAULT_CONFIG.mtChannels));
  const mtDefaultChannelId = ref<string>(DEFAULT_CONFIG.mtDefaultChannelId);
  const mcpServers = ref<McpServerEntry[]>(mcpServersToEntries(DEFAULT_CONFIG.mcpServers));
  const defaultModel = ref<ModelPair>(null);
  const activeModel = ref<ModelPair>(null);
  const assistantConfigs = ref<AssistantConfig[]>([]);
  const defaultAssistantId = ref<string>(DEFAULT_ASSISTANT_ID);
  const defaultModelValue = ref<string>('');

  watch(defaultModel, (val) => { defaultModelValue.value = joinPair(val); }, { immediate: true });

  async function loadAssistantDefaults() {
    const data = await new Promise<any>((resolve) => {
      try {
        chrome.storage.local.get([ASSISTANT_CONFIGS_STORAGE_KEY, DEFAULT_ASSISTANT_ID_STORAGE_KEY], resolve);
      } catch {
        resolve({});
      }
    });
    const rawConfigs = data?.[ASSISTANT_CONFIGS_STORAGE_KEY];
    const configs = normalizeAssistantConfigs(rawConfigs, {
      defaultModelKey: channelsApi.modelPairs.value[0]?.value || '',
    });
    assistantConfigs.value = configs;
    defaultAssistantId.value = resolveAssistantId(data?.[DEFAULT_ASSISTANT_ID_STORAGE_KEY], configs);
    if (!Array.isArray(rawConfigs)) {
      try {
        chrome.storage.local.set({
          [ASSISTANT_CONFIGS_STORAGE_KEY]: JSON.parse(JSON.stringify(configs)),
          [DEFAULT_ASSISTANT_ID_STORAGE_KEY]: defaultAssistantId.value,
        });
      } catch { }
    }
  }

  async function load() {
    const globalConfig = await loadConfig();
    config.value = { ...globalConfig };
    config.value.contextMessagesCount = normalizeContextMessagesCount(config.value.contextMessagesCount);
    machineChannels.value = normalizeMachineTranslateChannels((globalConfig as any).mtChannels);
    mtDefaultChannelId.value = normalizeMachineTranslateDefaultChannelId((globalConfig as any).mtDefaultChannelId, machineChannels.value);
    mcpServers.value = mcpServersToEntries((globalConfig as any).mcpServers);
    (config.value as any).targetStylePresets = mergeTargetStylePresets((config.value as any).targetStylePresets);

    await new Promise<void>((resolve) => {
      try {
        chrome.storage.sync.get(['channels', 'defaultModel', 'activeModel'], (items: any) => {
          channelsApi.channels.value = Array.isArray(items.channels) ? items.channels : [];
          defaultModel.value = parsePair(joinPair(items.defaultModel)) || null;
          activeModel.value = parsePair(joinPair(items.activeModel)) || null;
          channelsApi.initTestModels();
          resolve();
        });
      } catch { resolve(); }
    });

    await loadAssistantDefaults();
  }

  return {
    ...channelsApi,
    config,
    machineChannels,
    mtDefaultChannelId,
    mcpServers,
    defaultModel,
    activeModel,
    assistantConfigs,
    defaultAssistantId,
    defaultModelValue,
    load,
    loadAssistantDefaults,
    joinPair,
    parsePair,
    modelOptionsOf,
    normalizeContextMessagesCount,
    ALLOWED_CONTEXT_MESSAGE_COUNTS,
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;

export const SETTINGS_STORE_KEY: InjectionKey<SettingsStore> = Symbol('SettingsStore');

export function useSettingsStore(): SettingsStore {
  const store = inject(SETTINGS_STORE_KEY);
  if (!store) {
    throw new Error('useSettingsStore() must be called inside a component that provides SETTINGS_STORE_KEY');
  }
  return store;
}

export { ALLOWED_CONTEXT_MESSAGE_COUNTS };
