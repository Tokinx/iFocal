import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { AssistantConfig } from '@/shared/assistants';
import type { SettingsStore, ModelPair } from './useSettingsStore';

export function useAssistantDebug(store: SettingsStore) {
  const { modelPairs, defaultModelValue, assistantConfigs, mcpServers, config, activeModel, parsePair } = store;

  const assistantDraft = ref('');
  const assistantModelValue = ref('');
  const assistantTask = ref<string>('');
  const assistantResult = ref('');
  const assistantLoading = ref(false);
  let assistantPort: chrome.runtime.Port | null = null;

  const debugModelPairs = computed(() => {
    return modelPairs.value.map((pair) => {
      const parsed = parsePair(pair.value);
      return {
        key: pair.value,
        model: pair.label,
        channel: parsed?.channel || '未分组',
      };
    });
  });

  const debugGroupedModels = computed(() => {
    const groups: Record<string, Array<{ key: string; model: string; channel: string }>> = {};
    debugModelPairs.value.forEach((pair) => {
      if (!groups[pair.channel]) groups[pair.channel] = [];
      groups[pair.channel].push(pair);
    });
    return groups;
  });

  const debugCurrentModelName = computed(() => {
    return debugModelPairs.value.find((pair) => pair.key === assistantModelValue.value)?.model || '';
  });

  watch([defaultModelValue, debugModelPairs], ([defaultValue, pairs]) => {
    if (!pairs.length) {
      assistantModelValue.value = '';
      return;
    }
    const prefer = defaultValue && pairs.some((pair) => pair.key === defaultValue)
      ? defaultValue
      : pairs[0].key;
    assistantModelValue.value = prefer;
  }, { immediate: true });

  watch(assistantConfigs, (list) => {
    if (!assistantTask.value || !list.some((item) => item.id === assistantTask.value)) {
      assistantTask.value = list[0]?.id || '';
    }
  }, { immediate: true, deep: true });

  watch(assistantModelValue, (val) => {
    const pair = parsePair(val);
    try { chrome.storage.sync.set({ activeModel: pair || null }); } catch { }
    if (pair) activeModel.value = pair;
  });

  function handleDebugModelSelect(key: string) {
    assistantModelValue.value = key;
  }

  function disconnectAssistantPort(port: chrome.runtime.Port | null = assistantPort) {
    if (!port) return;
    if (assistantPort === port) assistantPort = null;
    try { port.disconnect(); } catch { }
  }

  function getEnabledAssistantMcpServers(assistant: AssistantConfig): string[] {
    if (assistant.settings.enableMcpTools === false) return [];
    const toggles = assistant.settings.mcpServerToggles || {};
    return mcpServers.value
      .filter((server) => (
        Object.prototype.hasOwnProperty.call(toggles, server.name)
          ? !!toggles[server.name]
          : server.enabled !== false
      ))
      .map((server) => server.name);
  }

  function buildAssistantPayload(selectedAssistant: AssistantConfig, text: string, pair: ModelPair) {
    const payload: any = {
      action: 'performAiAction',
      task: selectedAssistant.preset,
      assistantPrompt: selectedAssistant.prompt,
      text,
      targetLang: selectedAssistant.settings.targetLang || (config.value as any).translateTargetLang || 'zh-CN',
      prevLang: selectedAssistant.settings.prevLang || (config.value as any).prevLanguage || 'en',
      enableStreaming: !!selectedAssistant.settings.enableStreaming,
      enableReasoning: !!selectedAssistant.settings.enableReasoning,
      reasoningEffort: selectedAssistant.settings.reasoningEffort,
      maxSteps: selectedAssistant.settings.maxSteps,
      enabledMcpServers: getEnabledAssistantMcpServers(selectedAssistant),
    };
    if (pair) {
      payload.channel = pair.channel;
      payload.model = pair.model;
    }
    return payload;
  }

  function startAssistantStreamingRequest(payload: any) {
    let settled = false;
    try {
      const port = chrome.runtime.connect({ name: 'streaming' });
      assistantPort = port;

      port.onMessage.addListener((response: any) => {
        if (response?.type === 'start') return;

        if (response?.type === 'chunk') {
          assistantResult.value += String(response.content || '');
          return;
        }

        if (response?.type === 'done') {
          settled = true;
          assistantLoading.value = false;
          disconnectAssistantPort(port);
          return;
        }

        if (response?.type === 'error') {
          settled = true;
          assistantLoading.value = false;
          const errorText = `【错误】${response.error || '未知错误'}`;
          assistantResult.value = assistantResult.value
            ? `${assistantResult.value}\n\n${errorText}`
            : errorText;
          disconnectAssistantPort(port);
        }
      });

      port.onDisconnect.addListener(() => {
        if (assistantPort === port) assistantPort = null;
        if (settled) return;

        assistantLoading.value = false;
        assistantResult.value = assistantResult.value
          ? `${assistantResult.value}\n\n【错误】连接中断`
          : '【错误】连接中断';
      });

      port.postMessage(payload);
    } catch (e: any) {
      assistantLoading.value = false;
      assistantResult.value = `【错误】${String(e?.message || e || '调用失败')}`;
      disconnectAssistantPort();
    }
  }

  function startAssistantStream() {
    const text = assistantDraft.value.trim();
    if (!text) return;
    disconnectAssistantPort();
    assistantResult.value = '';
    assistantLoading.value = true;
    const selectedAssistant = assistantConfigs.value.find((item) => item.id === assistantTask.value) || null;
    if (!selectedAssistant) {
      assistantLoading.value = false;
      assistantResult.value = '【错误】未找到助手配置';
      return;
    }
    const pair = parsePair(assistantModelValue.value);
    const payload = buildAssistantPayload(selectedAssistant, text, pair);

    if (selectedAssistant.settings.enableStreaming) {
      startAssistantStreamingRequest(payload);
      return;
    }

    try {
      chrome.runtime.sendMessage(payload, (resp: any) => {
        assistantLoading.value = false;
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          assistantResult.value = `【错误】${runtimeError}`;
          return;
        }
        if (!resp) {
          assistantResult.value = '[错误] 无响应';
          return;
        }
        if (resp.ok) assistantResult.value = String(resp.result || '');
        else assistantResult.value = `【错误】${resp.error || '未知错误'}`;
      });
    } catch (e: any) {
      assistantLoading.value = false;
      assistantResult.value = `【错误】${String(e?.message || e || '调用失败')}`;
    }
  }

  function restreamIfDraft() {
    if (assistantDraft.value.trim()) startAssistantStream();
  }

  onBeforeUnmount(() => {
    disconnectAssistantPort();
  });

  return {
    assistantDraft,
    assistantModelValue,
    assistantTask,
    assistantResult,
    assistantLoading,
    debugModelPairs,
    debugGroupedModels,
    debugCurrentModelName,
    handleDebugModelSelect,
    startAssistantStream,
    restreamIfDraft,
  };
}
