import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import {
  LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY,
  buildModelCatalogPairs,
  groupModelPairs,
  normalizePinnedModelKeys,
  orderModelPairsByPins,
  PINNED_MODEL_KEYS_STORAGE_KEY,
  toPinnedKeyArray,
  type ModelCatalogChannel,
  type ModelCatalogPair,
} from '@/shared/model-catalog';
import type { LocalLlmProbeResult } from '@/shared/local-llm-types';

export function isLocalGeminiNanoProbeVisible(result: LocalLlmProbeResult | undefined): boolean {
  const availability = result?.availability;
  return availability === 'available' || availability === 'downloadable' || availability === 'downloading';
}

export async function probeLocalGeminiNanoVisible(): Promise<boolean> {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'probeLocalLlm', providerId: 'gemini-nano' }) as LocalLlmProbeResult | undefined;
    return isLocalGeminiNanoProbeVisible(result);
  } catch {
    return false;
  }
}

function syncGet<T = any>(keys: string[]): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(keys, (data) => resolve(data as T));
    } catch {
      resolve({} as T);
    }
  });
}

function localGet<T = any>(keys: string[]): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (data) => resolve(data as T));
    } catch {
      resolve({} as T);
    }
  });
}

function localSet(payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(payload, () => resolve());
    } catch {
      resolve();
    }
  });
}

export function useModelCatalog() {
  const channels = ref<ModelCatalogChannel[]>([]);
  const localGeminiNanoVisible = ref(false);
  const localGeminiNanoEnabled = ref(true);
  const pinnedModelKeys = ref<string[]>([]);

  const includeLocalGeminiNano = computed(() => localGeminiNanoVisible.value && localGeminiNanoEnabled.value);
  const availablePairs = computed(() => buildModelCatalogPairs(channels.value, {
    includeLocalGeminiNano: includeLocalGeminiNano.value,
  }));
  const normalizedPinnedModelKeys = computed(() => normalizePinnedModelKeys(pinnedModelKeys.value, availablePairs.value));
  const modelPairs = computed(() => orderModelPairsByPins(availablePairs.value, normalizedPinnedModelKeys.value));
  const groupedModels = computed(() => groupModelPairs(modelPairs.value, normalizedPinnedModelKeys.value));

  async function loadStorage() {
    const [syncData, localData] = await Promise.all([
      syncGet<{ channels?: ModelCatalogChannel[]; localGeminiNanoEnabled?: boolean }>(['channels', LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY]),
      localGet<{ pinnedModelKeys?: string[] }>([PINNED_MODEL_KEYS_STORAGE_KEY]),
    ]);
    channels.value = Array.isArray(syncData.channels) ? syncData.channels : [];
    localGeminiNanoEnabled.value = syncData.localGeminiNanoEnabled !== false;
    pinnedModelKeys.value = toPinnedKeyArray(localData.pinnedModelKeys);
  }

  async function refreshLocalAvailability() {
    localGeminiNanoVisible.value = await probeLocalGeminiNanoVisible();
  }

  async function refresh() {
    await Promise.all([loadStorage(), refreshLocalAvailability()]);
    await prunePinnedModels();
  }

  async function prunePinnedModels() {
    const normalized = normalizedPinnedModelKeys.value;
    if (normalized.length === pinnedModelKeys.value.length && normalized.every((key, index) => key === pinnedModelKeys.value[index])) return;
    pinnedModelKeys.value = normalized;
    await localSet({ [PINNED_MODEL_KEYS_STORAGE_KEY]: normalized });
  }

  async function setPinnedModelKeys(keys: string[]) {
    const result = normalizePinnedModelKeys(keys, availablePairs.value);
    pinnedModelKeys.value = result;
    // 写入纯数组：chrome.storage 会把 Vue 响应式 Proxy 克隆成 {"0":..} 类数组对象
    await localSet({ [PINNED_MODEL_KEYS_STORAGE_KEY]: result });
  }

  async function togglePinnedModel(key: string) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const current = normalizedPinnedModelKeys.value;
    const next = current.includes(normalizedKey)
      ? current.filter((item) => item !== normalizedKey)
      : [normalizedKey, ...current];
    await setPinnedModelKeys(next);
  }

  const onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync') {
      if (changes.channels) channels.value = Array.isArray(changes.channels.newValue) ? changes.channels.newValue : [];
      if (changes[LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY]) {
        localGeminiNanoEnabled.value = changes[LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY].newValue !== false;
      }
      if (changes.channels || changes[LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY]) {
        void prunePinnedModels();
      }
    }
    if (area === 'local' && changes[PINNED_MODEL_KEYS_STORAGE_KEY]) {
      // 兼容历史写入的类数组对象格式（见 toPinnedKeyArray），不能用 Array.isArray 直接判空，否则会误清空置顶
      pinnedModelKeys.value = toPinnedKeyArray(changes[PINNED_MODEL_KEYS_STORAGE_KEY].newValue);
      void prunePinnedModels();
    }
  };

  onMounted(() => {
    try { chrome.storage.onChanged.addListener(onStorageChanged); } catch { /* ignore */ }
  });

  onBeforeUnmount(() => {
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch { /* ignore */ }
  });

  return {
    channels,
    localGeminiNanoVisible,
    localGeminiNanoEnabled,
    includeLocalGeminiNano,
    pinnedModelKeys,
    normalizedPinnedModelKeys,
    availablePairs: availablePairs as Ref<ModelCatalogPair[]>,
    modelPairs,
    groupedModels,
    refresh,
    refreshLocalAvailability,
    loadStorage,
    setPinnedModelKeys,
    togglePinnedModel,
    prunePinnedModels,
  };
}
