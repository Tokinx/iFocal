import { inject, ref, watch, type InjectionKey } from 'vue';
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '@/shared/config';
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
import { ensureLocalChannelInjected } from '@/shared/local-llm-types';
import { LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY } from '@/shared/model-catalog';
import { probeLocalGeminiNanoVisible } from '@/window/composables/useModelCatalog';
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
  const localGeminiNanoVisible = ref<boolean>(false);
  const localGeminiNanoEnabled = ref<boolean>(true);
  let storageListenerInstalled = false;

  watch(defaultModel, (val) => { defaultModelValue.value = joinPair(val); }, { immediate: true });
  watch([localGeminiNanoVisible, localGeminiNanoEnabled], () => {
    channelsApi.includeLocalModels.value = localGeminiNanoVisible.value && localGeminiNanoEnabled.value;
  }, { immediate: true });
  watch(channelsApi.modelPairs, () => {
    if (!defaultModelValue.value) return;
    if (channelsApi.modelPairs.value.some((pair) => pair.value === defaultModelValue.value)) return;
    defaultModelValue.value = channelsApi.modelPairs.value[0]?.value || '';
    defaultModel.value = parsePair(defaultModelValue.value);
    try { chrome.storage.sync.set({ defaultModel: defaultModel.value }); } catch { /* ignore */ }
  }, { deep: true });

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
    const [globalConfig, localVisible] = await Promise.all([
      loadConfig(),
      probeLocalGeminiNanoVisible(),
    ]);
    config.value = { ...globalConfig };
    localGeminiNanoVisible.value = !!localVisible;
    localGeminiNanoEnabled.value = (globalConfig as any)[LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY] !== false;
    config.value.contextMessagesCount = normalizeContextMessagesCount(config.value.contextMessagesCount);
    machineChannels.value = normalizeMachineTranslateChannels((globalConfig as any).mtChannels);
    mtDefaultChannelId.value = normalizeMachineTranslateDefaultChannelId((globalConfig as any).mtDefaultChannelId, machineChannels.value);
    mcpServers.value = mcpServersToEntries((globalConfig as any).mcpServers);
    (config.value as any).targetStylePresets = mergeTargetStylePresets((config.value as any).targetStylePresets);

    await new Promise<void>((resolve) => {
      try {
        chrome.storage.sync.get(['channels', 'defaultModel', 'activeModel'], (items: any) => {
          const rawList = Array.isArray(items.channels) ? items.channels : [];
          const { list: ensured, injected, renames } = ensureLocalChannelInjected(rawList);
          channelsApi.channels.value = ensured as any;

          // 把 defaultModel/activeModel 中引用的旧本地渠道名映射到新名（"本地模型" → "Gemini-Nano"）
          const renameMap = new Map(renames.map((r) => [r.from, r.to]));
          const remapPair = (pair: any): any => {
            if (!pair || typeof pair !== 'object') return pair;
            const next = renameMap.get(pair.channel);
            return next ? { ...pair, channel: next } : pair;
          };
          const remappedDefault = remapPair(items.defaultModel);
          const remappedActive = remapPair(items.activeModel);
          const defaultChanged = remappedDefault !== items.defaultModel;
          const activeChanged = remappedActive !== items.activeModel;

          defaultModel.value = parsePair(joinPair(remappedDefault)) || null;
          activeModel.value = parsePair(joinPair(remappedActive)) || null;
          channelsApi.initTestModels();
          if (injected || defaultChanged || activeChanged) {
            const patch: any = {};
            if (injected) patch.channels = ensured;
            if (defaultChanged) patch.defaultModel = remappedDefault;
            if (activeChanged) patch.activeModel = remappedActive;
            try { chrome.storage.sync.set(patch); } catch { /* ignore */ }
          }
          resolve();
        });
      } catch { resolve(); }
    });

    await loadAssistantDefaults();
    installStorageListener();
  }

  async function setLocalGeminiNanoEnabled(checked: boolean) {
    localGeminiNanoEnabled.value = !!checked;
    (config.value as any)[LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY] = localGeminiNanoEnabled.value;
    await saveConfig({ [LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY]: localGeminiNanoEnabled.value } as any);
  }

  function installStorageListener() {
    if (storageListenerInstalled) return;
    storageListenerInstalled = true;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        if (changes[LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY]) {
          localGeminiNanoEnabled.value = changes[LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY].newValue !== false;
          (config.value as any)[LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY] = localGeminiNanoEnabled.value;
        }
        if (changes.channels) {
          channelsApi.channels.value = Array.isArray(changes.channels.newValue) ? changes.channels.newValue : [];
          channelsApi.initTestModels();
        }
      });
    } catch { /* ignore */ }
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
    localGeminiNanoVisible,
    localGeminiNanoEnabled,
    load,
    loadAssistantDefaults,
    setLocalGeminiNanoEnabled,
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
