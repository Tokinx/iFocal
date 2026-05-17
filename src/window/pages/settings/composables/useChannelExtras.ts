import { reactive, ref, watch } from 'vue';
import { modelIdFromSpec } from '@/shared/model-utils';
import { useToast } from '@/window/composables/useToast';
import type { SettingsStore } from './useSettingsStore';

async function fetchModelsFromApi(type: string, apiUrl: string, apiKey: string): Promise<string[]> {
  const url = apiUrl || (type === 'openai' ? 'https://api.openai.com/v1' : type === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : '');

  if (!url) {
    throw new Error('API URL 未配置');
  }

  if (!apiKey) {
    throw new Error('API KEY 未配置');
  }

  let models: string[] = [];

  if (type === 'openai' || type === 'openai-compatible') {
    const response = await fetch(`${url}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    models = (data.data || []).map((m: any) => m.id).filter(Boolean);
  } else if (type === 'gemini') {
    const response = await fetch(`${url}/models?key=${apiKey}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    models = (data.models || []).map((m: any) => {
      const name = m.name || '';
      return name.startsWith('models/') ? name.substring(7) : name;
    }).filter(Boolean);
  }

  if (models.length === 0) {
    throw new Error('未获取到模型列表');
  }

  return models;
}

export function useChannelExtras(store: SettingsStore) {
  const toast = useToast();
  const {
    channels, addForm, addChannel, testModel, initTestModels, editForm, saveEdit,
    removeChannel, restoreChannelsSnapshot,
  } = store;

  const showApiKeyByIndex = reactive<boolean[]>([]);
  const modelsTextByIndex = reactive<string[]>([]);
  const channelExpanded = reactive<boolean[]>([]);
  const draggedIndex = ref<number | null>(null);
  const dragOverIndex = ref<number | null>(null);
  const isDraggable = ref<boolean[]>([]);
  const fetchingModels = reactive<boolean[]>([]);
  const fetchingAddFormModels = ref(false);
  const showAddChannel = ref(false);
  const editStatus = ref('');

  function syncChannelUiState() {
    modelsTextByIndex.length = 0;
    showApiKeyByIndex.length = 0;
    channelExpanded.length = 0;
    fetchingModels.length = 0;
    isDraggable.value.length = 0;
    channels.value.forEach((c, i) => {
      modelsTextByIndex[i] = (c.models || []).join('\n');
      showApiKeyByIndex[i] = false;
      channelExpanded[i] = false;
      fetchingModels[i] = false;
      isDraggable.value[i] = false;
    });
  }

  watch(() => channels.value.length, () => syncChannelUiState(), { immediate: true });

  function openAddChannel() { showAddChannel.value = true; }
  function closeAddChannel() { showAddChannel.value = false; }

  function handleAddChannel() {
    try {
      addChannel(() => {
        const newIdx = channels.value.length - 1;
        if (newIdx >= 0) {
          const newChannel = channels.value[newIdx];
          modelsTextByIndex[newIdx] = (newChannel.models || []).join('\n');
          showApiKeyByIndex[newIdx] = false;
          channelExpanded[newIdx] = false;
          fetchingModels[newIdx] = false;
          isDraggable.value[newIdx] = false;
          initTestModels();
        }
      });
      toast.success('已添加渠道');
    } catch (e: any) {
      toast.error(String(e?.message || e || '保存失败'));
    }
  }

  function handleAddChannelDialog() {
    try { handleAddChannel(); closeAddChannel(); } catch { /* 内部已 toast */ }
  }

  function handleSaveChannelInline(idx: number) {
    try {
      const ch = channels.value[idx];
      if (!ch) return;
      editForm.type = ch.type as any;
      editForm.name = ch.name || '';
      editForm.apiUrl = ch.apiUrl || '';
      editForm.apiKey = ch.apiKey || '';
      editForm.modelsText = modelsTextByIndex[idx] || (Array.isArray(ch.models) ? ch.models.join('\n') : '');
      editForm.systemPromptCompatMode = !!(ch as any).systemPromptCompatMode;
      saveEdit(idx, () => {
        initTestModels();
        toast.success('渠道已保存');
      });
    } catch (e: any) {
      toast.error(String(e?.message || e || '保存失败'));
    }
  }

  function handleTestChannel(idx: number) {
    const ch = channels.value[idx];
    if (!ch) return;
    const model = modelIdFromSpec(testModel[idx]) || undefined;
    try {
      chrome.runtime.sendMessage({ action: 'testChannel', channel: ch.name, model }, (resp: any) => {
        if (!resp) { toast.error('测试失败：无响应'); return; }
        if (resp.ok) toast.success('测试成功');
        else toast.error(`测试失败：${resp.error || '未知错误'}`);
      });
    } catch { toast.error('测试调用失败'); }
  }

  function confirmRemoveChannel(idx: number) {
    const ch = channels.value[idx];
    if (!ch) return;
    const name = ch.name || '未命名';
    toast.action(`确认删除渠道 ${name} ?`, {
      label: '删除',
      type: 'error',
      onClick: () => {
        try {
          removeChannel(idx, (snapshot) => {
            toast.action(`已删除渠道 ${name}`, {
              label: '撤回',
              onClick: () => restoreChannelsSnapshot(snapshot)
            });
          });
        } catch { toast.error('删除失败'); }
      }
    });
  }

  function enableDrag(idx: number) { isDraggable.value[idx] = true; }
  function disableDrag(idx: number) { isDraggable.value[idx] = false; }
  function handleDragStart(idx: number) { draggedIndex.value = idx; }
  function handleDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    dragOverIndex.value = idx;
  }
  function handleDragLeave() { dragOverIndex.value = null; }

  function handleDragEnd() {
    if (draggedIndex.value !== null && dragOverIndex.value !== null && draggedIndex.value !== dragOverIndex.value) {
      const from = draggedIndex.value;
      const to = dragOverIndex.value;

      const updatedChannels = channels.value.map((ch, i) => ({
        ...ch,
        models: modelsTextByIndex[i] ? modelsTextByIndex[i].split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean) : ch.models
      }));

      const newChannels = [...updatedChannels];
      const [movedItem] = newChannels.splice(from, 1);
      newChannels.splice(to, 0, movedItem);

      const newModelsText = [...modelsTextByIndex];
      const newShowApiKey = [...showApiKeyByIndex];
      const newExpanded = [...channelExpanded];
      const newIsDraggable = [...isDraggable.value];
      const newTestModels = [...testModel];

      const [movedModelsText] = newModelsText.splice(from, 1);
      const [movedShowApiKey] = newShowApiKey.splice(from, 1);
      const [movedExpanded] = newExpanded.splice(from, 1);
      const [movedDraggable] = newIsDraggable.splice(from, 1);
      const [movedTestModel] = newTestModels.splice(from, 1);

      newModelsText.splice(to, 0, movedModelsText);
      newShowApiKey.splice(to, 0, movedShowApiKey);
      newExpanded.splice(to, 0, movedExpanded);
      newIsDraggable.splice(to, 0, movedDraggable);
      newTestModels.splice(to, 0, movedTestModel);

      chrome.storage.sync.set({ channels: newChannels }, () => {
        channels.value = newChannels;
        modelsTextByIndex.length = 0;
        showApiKeyByIndex.length = 0;
        channelExpanded.length = 0;
        isDraggable.value.length = 0;
        testModel.length = 0;
        newModelsText.forEach((v, i) => modelsTextByIndex[i] = v);
        newShowApiKey.forEach((v, i) => showApiKeyByIndex[i] = v);
        newExpanded.forEach((v, i) => channelExpanded[i] = v);
        newIsDraggable.forEach((v, i) => isDraggable.value[i] = v);
        newTestModels.forEach((v, i) => testModel[i] = v);
        toast.success('渠道顺序已更新');
      });
    }
    draggedIndex.value = null;
    dragOverIndex.value = null;
    isDraggable.value.forEach((_, i) => isDraggable.value[i] = false);
  }

  async function fetchModels(idx: number) {
    const ch = channels.value[idx];
    if (!ch) return;

    fetchingModels[idx] = true;
    try {
      const models = await fetchModelsFromApi(ch.type, ch.apiUrl || '', ch.apiKey || '');
      modelsTextByIndex[idx] = models.join('\n');
      toast.success(`成功获取 ${models.length} 个模型`);
    } catch (error: any) {
      toast.error(`获取失败：${error.message || '未知错误'}`);
    } finally {
      fetchingModels[idx] = false;
    }
  }

  async function fetchAddFormModels() {
    fetchingAddFormModels.value = true;
    try {
      const models = await fetchModelsFromApi(addForm.type, addForm.apiUrl, addForm.apiKey);
      addForm.modelsText = models.join('\n');
      toast.success(`成功获取 ${models.length} 个模型`);
    } catch (error: any) {
      toast.error(`获取失败：${error.message || '未知错误'}`);
    } finally {
      fetchingAddFormModels.value = false;
    }
  }

  return {
    showApiKeyByIndex,
    modelsTextByIndex,
    channelExpanded,
    draggedIndex,
    dragOverIndex,
    isDraggable,
    fetchingModels,
    fetchingAddFormModels,
    showAddChannel,
    editStatus,
    syncChannelUiState,
    openAddChannel,
    closeAddChannel,
    handleAddChannel,
    handleAddChannelDialog,
    handleSaveChannelInline,
    handleTestChannel,
    confirmRemoveChannel,
    enableDrag,
    disableDrag,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    fetchModels,
    fetchAddFormModels,
  };
}
