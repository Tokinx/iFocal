import { computed, reactive, ref } from 'vue';

export type Channel = {
  name: string;
  type: 'openai' | 'gemini' | 'openai-compatible' | string;
  apiUrl?: string;
  apiKey?: string;
  models: string[];
};

function withDefaultApiUrl(type: string, url?: string) {
  const t = (url || '').trim();
  if (t) return t;
  if (type === 'openai') return 'https://api.openai.com/v1';
  if (type === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta';
  return '';
}

export function useChannels() {
  const channels = ref<Channel[]>([]);
  const modelPairs = computed(() => {
    const pairs: { value: string; label: string }[] = [];
    channels.value.forEach(ch => (ch.models || []).forEach(m => pairs.push({ value: `${ch.name}|${m}`, label: `${m} (${ch.name})` })));
    return pairs;
  });

  // 通道新增
  const addForm = reactive({ type: 'openai', name: '', apiUrl: '', apiKey: '', modelsText: '' });
  function splitModels(input: string) { return (input || '').split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean); }
  function addChannel() {
    const name = (addForm.name || '').trim();
    const type = addForm.type;
    const apiUrl = withDefaultApiUrl(type, addForm.apiUrl);
    const apiKey = (addForm.apiKey || '').trim();
    const models = splitModels(addForm.modelsText);
    if (!name) throw new Error('名称不能为空');
    if (!models.length) throw new Error('至少填写一个模型');
    if (type === 'openai-compatible' && !apiUrl) throw new Error('兼容渠道需要 API URL');
    chrome.storage.sync.get(['channels'], (items) => {
      const list: Channel[] = Array.isArray((items as any).channels) ? (items as any).channels : [];
      if (list.some(c => c.name === name)) throw new Error('渠道名称已存在');
      const next = [...list, { name, type, apiUrl, apiKey, models }];
      chrome.storage.sync.set({ channels: next }, () => {
        addForm.name = ''; addForm.apiUrl = ''; addForm.apiKey = ''; addForm.modelsText = '';
        channels.value = next;
      });
    });
  }

  // 测试模型选择
  const testModel: Record<string, string> = reactive({});
  function initTestModels() {
    for (const ch of channels.value) {
      const first = (ch.models && ch.models[0]) || '';
      if (!(ch.name in testModel)) testModel[ch.name] = first;
    }
  }

  function testChannel(name: string) {
    const model = testModel[name] || undefined;
    chrome.runtime.sendMessage({ action: 'testChannel', channel: name, model }, () => {});
  }

  // 编辑
  const editingName = ref<string|null>(null);
  const editForm = reactive({ type: 'openai', name: '', apiUrl: '', apiKey: '', modelsText: '' });
  function openEdit(ch: Channel) {
    editingName.value = ch.name;
    editForm.type = ch.type as any;
    editForm.name = ch.name;
    editForm.apiUrl = ch.apiUrl || '';
    // 编辑时显示已保存的 API KEY（与设置页的显示/隐藏切换配合，默认密码态）
    editForm.apiKey = ch.apiKey || '';
    editForm.modelsText = (ch.models || []).join('\n');
  }
  function cancelEdit() { editingName.value = null; }
  function saveEdit(original: string, onSaved?: () => void) {
    const type = editForm.type;
    const name = (editForm.name || '').trim();
    const apiUrl = withDefaultApiUrl(type, editForm.apiUrl);
    const apiKeyMaybe = (editForm.apiKey || '').trim();
    const models = splitModels(editForm.modelsText);
    if (!name) throw new Error('名称不能为空');
    if (!models.length) throw new Error('请至少填写一个模型');
    if (type === 'openai-compatible' && !apiUrl) throw new Error('兼容渠道需要 API URL');

    chrome.storage.sync.get(['channels','defaultModel','translateModel','activeModel'], (items) => {
      const list: Channel[] = Array.isArray((items as any).channels) ? (items as any).channels : [];
      const idx = list.findIndex(c => c.name === original);
      if (idx < 0) throw new Error('原渠道不存在');
      if (name !== original && list.some(c => c.name === name)) throw new Error('同名渠道已存在');
      const updated: Channel = { ...list[idx], type, name, apiUrl, models } as any;
      if (apiKeyMaybe) (updated as any).apiKey = apiKeyMaybe;
      const nextList = list.slice();
      nextList[idx] = updated;
      const next: any = { channels: nextList };
      ['defaultModel','translateModel','activeModel'].forEach(k => {
        const pair = (items as any)[k];
        if (pair && pair.channel === original) next[k] = { channel: name, model: pair.model };
      });
      chrome.storage.sync.set(next, () => { channels.value = nextList; editingName.value = null; onSaved && onSaved(); });
    });
  }

  type ChannelsSnapshot = { list: Channel[]; defaultModel: any; translateModel: any; activeModel: any };

  function removeChannel(name: string, onRemoved?: (snapshot: ChannelsSnapshot) => void) {
    chrome.storage.sync.get(['channels','defaultModel','translateModel','activeModel'], (items) => {
      const list: Channel[] = Array.isArray((items as any).channels) ? (items as any).channels : [];
      const snapshot: ChannelsSnapshot = {
        list,
        defaultModel: (items as any).defaultModel ?? null,
        translateModel: (items as any).translateModel ?? null,
        activeModel: (items as any).activeModel ?? null
      };
      const filtered = list.filter(c => c.name !== name);
      const next: any = { channels: filtered };
      if ((items as any).defaultModel?.channel === name) next.defaultModel = null;
      if ((items as any).translateModel?.channel === name) next.translateModel = null;
      if ((items as any).activeModel?.channel === name) next.activeModel = null;
      chrome.storage.sync.set(next, () => { channels.value = filtered; onRemoved && onRemoved(snapshot); });
    });
  }

  function restoreChannelsSnapshot(snapshot: ChannelsSnapshot, onRestored?: () => void) {
    const next: any = {
      channels: snapshot.list,
      defaultModel: snapshot.defaultModel ?? null,
      translateModel: snapshot.translateModel ?? null,
      activeModel: snapshot.activeModel ?? null
    };
    chrome.storage.sync.set(next, () => { channels.value = snapshot.list; onRestored && onRestored(); });
  }

  return {
    channels,
    modelPairs,
    addForm,
    addChannel,
    testModel,
    initTestModels,
    testChannel,
    editingName,
    editForm,
    openEdit,
    cancelEdit,
    saveEdit,
    removeChannel,
    restoreChannelsSnapshot
  };
}
