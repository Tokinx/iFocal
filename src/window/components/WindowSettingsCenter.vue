<script setup lang="ts">
import { onMounted, ref, watch, computed, reactive } from 'vue';
import Icon from '@/components/ui/icon/Icon.vue';
import { iconOfNav, iconOfChannelType, iconOfAction } from '@/shared/icons';
import { useChannels } from '@/options/composables/useChannels';
import { useToast } from '@/options/composables/useToast';
import { SUPPORTED_LANGUAGES, SUPPORTED_TASKS, DEFAULT_CONFIG, loadConfig, saveConfig, getTaskSettings, updateTaskSettings, type ReasoningEffort } from '@/shared/config';
import {
  ASSISTANT_CONFIGS_STORAGE_KEY,
  DEFAULT_ASSISTANT_ID,
  DEFAULT_ASSISTANT_ID_STORAGE_KEY,
  normalizeAssistantConfigs,
  resolveAssistantId,
  type AssistantConfig,
} from '@/shared/assistants';
import { loadGlossary, parseGlossaryMixedText, parseGlossaryTermsText, serializeGlossaryTerms, stringifyGlossaryMixedText, saveGlossary as persistGlossary } from '@/shared/glossary';
import { loadSettingsSnapshot, downloadSettingsSnapshot, parseSettingsImportFile, saveSettingsSnapshot } from '@/shared/settings-import-export';
import { buildStylePresetsCss, CUSTOM_STYLE_SELECTION, DEFAULT_WRAPPER_STYLE_NAME, mergeTargetStylePresets, parseStyleNameFromCss, resolveSelectedStylePresetCss, upsertCustomStylePreset } from '@/shared/style-presets';
import { modelIdFromSpec, parseModelSpec } from '@/shared/model-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import ModelSelect from './ModelSelect.vue';

withDefaults(defineProps<{
  embedded?: boolean
}>(), {
  embedded: false
})

type ModelPair = { channel: string; model: string } | null;

// 左侧导航：默认显示"通用设置"
const nav = ref<'channels' | 'settings' | 'debug' | 'about'>('settings');

const { channels, modelPairs, addForm, addChannel, testModel, initTestModels, editForm, saveEdit, removeChannel, restoreChannelsSnapshot } = useChannels();
const toast = useToast();

const defaultModel = ref<ModelPair>(null);
const activeModel = ref<ModelPair>(null);
const assistantConfigs = ref<AssistantConfig[]>([]);
const defaultAssistantId = ref(DEFAULT_ASSISTANT_ID);
// 使用全局配置
const config = ref({ ...DEFAULT_CONFIG });
// 样式选择/编辑
const styleSelection = ref<string>(DEFAULT_WRAPPER_STYLE_NAME);
const customCss = ref<string>('');
const activeStyleName = computed(() => styleSelection.value === CUSTOM_STYLE_SELECTION ? (parseStyleNameFromCss(customCss.value) || 'ifocal-target-style-custom') : styleSelection.value);
const stylePresetOptions = computed(() => mergeTargetStylePresets((config.value as any).targetStylePresets));
const ALLOWED_CONTEXT_MESSAGE_COUNTS: readonly number[] = [2, 6, 10];
const reasoningEffortOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '超高' },
];

function normalizeContextMessagesCount(value: unknown): number {
  const num = Number(value);
  return ALLOWED_CONTEXT_MESSAGE_COUNTS.includes(num) ? num : 2;
}

function taskSettingsOf(task: string) {
  return getTaskSettings(config.value, task);
}

async function saveTaskConfig(task: string, patch: Partial<ReturnType<typeof getTaskSettings>>) {
  try {
    await updateTaskSettings(task, patch);
    config.value = { ...(await loadConfig()) };
    toast.success('任务设置已保存');
  } catch {
    toast.error('保存失败');
  }
}

async function saveDefaultTask(value: string) {
  try {
    config.value.defaultTask = value;
    await saveConfig({ defaultTask: value });
    toast.success('默认任务已保存');
  } catch {
    toast.error('保存失败');
  }
}

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
    defaultModelKey: modelPairs.value[0]?.value || '',
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

async function saveDefaultAssistant(value: string) {
  const nextId = resolveAssistantId(value, assistantConfigs.value);
  defaultAssistantId.value = nextId;
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [DEFAULT_ASSISTANT_ID_STORAGE_KEY]: nextId }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
    toast.success('默认助手已保存');
  } catch {
    toast.error('保存失败');
  }
}

function saveTaskReasoningEffort(task: string, value: string) {
  return saveTaskConfig(task, { reasoningEffort: value as ReasoningEffort });
}

const activePreviewCss = computed(() => {
  if (styleSelection.value === CUSTOM_STYLE_SELECTION) return (customCss.value || '').trim();
  return resolveSelectedStylePresetCss(styleSelection.value, (config.value as any).targetStylePresets);
});
function ensurePreviewStyle(cssText: string) {
  try {
    const id = 'ifocal-style-preview';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = cssText || '';
  } catch { }
}
watch(activePreviewCss, (css) => ensurePreviewStyle(css), { immediate: true });

function ensureOptionPresetStyles(list?: Array<{ name: string; css: string }>) {
  try {
    const id = 'ifocal-option-style-presets';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = buildStylePresetsCss(list);
  } catch { }
}

const defaultModelValue = ref('');
// 关于页版本号：优先 chrome.runtime.getManifest()，回退到读取 manifest.json
const version = ref('-');
// 渠道编辑：每项独立的显示/输入状态
const showApiKeyByIndex = reactive<boolean[]>([]);
const modelsTextByIndex = reactive<string[]>([]);
// 渠道展开/收起状态
const channelExpanded = reactive<boolean[]>([]);
// 拖拽状态
const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const isDraggable = ref<boolean[]>([]); // 控制是否可拖拽
watch(defaultModel, (val) => { defaultModelValue.value = joinPair(val); }, { immediate: true });

function joinPair(pair: ModelPair) {
  if (!pair || !(pair as any).channel || !(pair as any).model) return '';
  const modelId = modelIdFromSpec((pair as any).model);
  if (!modelId) return '';
  return `${(pair as any).channel}|${modelId}`;
}
function parsePair(value: string): ModelPair { if (!value || value === '__unset__') return null; const [channel, model] = value.split('|'); if (!channel || !model) return null; return { channel, model }; }
function modelOptionsOf(models: string[] | undefined) {
  return (models || []).map((m) => {
    const { modelId, displayName } = parseModelSpec(m);
    return { modelId, displayName: displayName || modelId };
  }).filter((m) => !!m.modelId);
}

async function loadAll() {
  try {
    // 加载全局配置
    const globalConfig = await loadConfig();
    config.value = { ...globalConfig };
    config.value.contextMessagesCount = normalizeContextMessagesCount(config.value.contextMessagesCount);
    (config.value as any).targetStylePresets = mergeTargetStylePresets((config.value as any).targetStylePresets);
    styleSelection.value = String((config.value as any).wrapperStyleName || DEFAULT_WRAPPER_STYLE_NAME).trim() || DEFAULT_WRAPPER_STYLE_NAME;
    ensureOptionPresetStyles((config.value as any).targetStylePresets);
    // 若当前选择在预设中，预填其 CSS；否则给出自定义模板
    try {
      const foundCss = resolveSelectedStylePresetCss(styleSelection.value, (config.value as any).targetStylePresets);
      if (foundCss) customCss.value = foundCss;
      else customCss.value = `.ifocal-target-inline-wrapper.${styleSelection.value} .ifocal-target-inner,
.ifocal-target-block-wrapper.${styleSelection.value} .ifocal-target-inner{ /* 自定义样式 */ }`;
    } catch { }

    // 加载其他设置
    await new Promise<void>((resolve) => {
      try {
        chrome.storage.sync.get(['channels', 'defaultModel', 'activeModel'], (items: any) => {
          channels.value = Array.isArray(items.channels) ? items.channels : [];
          // 初始化每项编辑辅助状态
          modelsTextByIndex.length = 0; showApiKeyByIndex.length = 0; channelExpanded.length = 0; fetchingModels.length = 0; isDraggable.value.length = 0;
          channels.value.forEach((c, i) => {
            modelsTextByIndex[i] = (c.models || []).join('\n');
            showApiKeyByIndex[i] = false;
            channelExpanded[i] = false;
            fetchingModels[i] = false;
            isDraggable.value[i] = false;
          });
          defaultModel.value = parsePair(joinPair(items.defaultModel)) || null;
          activeModel.value = parsePair(joinPair(items.activeModel)) || null;
          initTestModels();
          resolve();
        });
      } catch { resolve(); }
    });
    await loadAssistantDefaults();
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

function saveModels() {
  const dm = parsePair(defaultModelValue.value);
  try {
    chrome.storage.sync.set({ defaultModel: dm }, () => {
      defaultModel.value = dm;
      try { chrome.storage.sync.remove(['translateModel']); } catch { }
      toast.success('模型设置已保存');
    });
  } catch {
    toast.error('保存失败');
  }
}
async function saveBasics() {
  try {
    const k = (config.value.actionKey || 'Alt').trim() || 'Alt';
    const lang = (config.value.translateTargetLang || 'zh-CN').trim() || 'zh-CN';
    if (!k) {
      toast.error('快捷键不能为空');
      return;
    }

    // 更新配置
    config.value.actionKey = k;
    config.value.translateTargetLang = lang;
    config.value.displayMode = config.value.displayMode || 'insert';
    if (typeof config.value.enableSelectionTranslation !== 'boolean') config.value.enableSelectionTranslation = true;

    // 保存配置
    // 样式保存：选择预设或自定义
    let wrapperStyleNameToSave = activeStyleName.value;
    let presetsToSave = mergeTargetStylePresets((config.value as any).targetStylePresets);
    if (styleSelection.value === CUSTOM_STYLE_SELECTION) {
      const next = upsertCustomStylePreset(presetsToSave, customCss.value);
      wrapperStyleNameToSave = next.wrapperStyleName;
      presetsToSave = next.presets;
    }
    (config.value as any).targetStylePresets = presetsToSave;
    (config.value as any).wrapperStyleName = wrapperStyleNameToSave;

    await saveConfig({
      actionKey: k,
      hoverKey: k,
      selectKey: k,
      translateTargetLang: lang,
      displayMode: config.value.displayMode,
      wrapperStyleName: wrapperStyleNameToSave,
      targetStylePresets: presetsToSave,
      enableSelectionTranslation: config.value.enableSelectionTranslation,
      maxSessionsCount: config.value.maxSessionsCount || 10,
      contextMessagesCount: normalizeContextMessagesCount(config.value.contextMessagesCount),
      reduceVisualEffects: config.value.reduceVisualEffects || false
    });

    toast.success('基础设置已保存');
  } catch {
    toast.error('保存失败');
  }
}

async function saveStyleOnly() {
  try {
    let wrapperStyleNameToSave = activeStyleName.value;
    let presetsToSave = Array.isArray((config.value as any).targetStylePresets) ? (config.value as any).targetStylePresets : [];
    if (styleSelection.value === '__custom__') {
      const name = parseStyleNameFromCss(customCss.value);
      if (!name) { toast.error('自定义 CSS 必须包含 ifocal-target-style-* 类名'); return; }
      wrapperStyleNameToSave = name;
      const next = { name, description: '自定义', css: (customCss.value || '').trim() };
      const idx = presetsToSave.findIndex((p: any) => p && p.name === name);
      if (idx >= 0) presetsToSave.splice(idx, 1, next); else presetsToSave = [...presetsToSave, next];
    }
    await saveConfig({ wrapperStyleName: wrapperStyleNameToSave, targetStylePresets: presetsToSave });
    (config.value as any).wrapperStyleName = wrapperStyleNameToSave;
    (config.value as any).targetStylePresets = presetsToSave;
    ensureOptionPresetStyles(presetsToSave);
    toast.success('样式设置已保存');
  } catch { toast.error('保存失败'); }
}

// 删除渠道：二次确认 + 撤回
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

// 内联保存：将当前行的输入同步到 editForm 并调用既有 saveEdit
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

// 助手（非流式输出）
const assistantDraft = ref('');
const assistantModelValue = ref('');
const assistantTask = ref<string>('');
const assistantResult = ref('');
const assistantLoading = ref(false);
let assistantPort: chrome.runtime.Port | null = null;
const debugModelPairs = computed(() => {
  return channels.value.flatMap((ch) => (ch.models || []).map((m) => {
    const { modelId, displayName } = parseModelSpec(m);
    if (!modelId) return null;
    return {
      key: `${ch.name}|${modelId}`,
      model: displayName || modelId,
      channel: ch.name,
    };
  }).filter((p): p is { key: string; model: string; channel: string } => !!p));
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
watch(channels, () => {
  const prefer = joinPair(activeModel.value) || joinPair(defaultModel.value) || debugModelPairs.value[0]?.key || '';
  if (prefer && !assistantModelValue.value) assistantModelValue.value = prefer;
}, { immediate: true, deep: true });
watch(debugModelPairs, (pairs) => {
  if (!pairs.length) {
    assistantModelValue.value = '';
    return;
  }
  if (!pairs.some((pair) => pair.key === assistantModelValue.value)) {
    assistantModelValue.value = pairs[0].key;
  }
}, { immediate: true });
watch(assistantConfigs, (list) => {
  if (!assistantTask.value || !list.some((item) => item.id === assistantTask.value)) {
    assistantTask.value = list[0]?.id || '';
  }
}, { immediate: true, deep: true });
watch(assistantTask, (assistantId) => {
  const assistant = assistantConfigs.value.find((item) => item.id === assistantId);
  if (!assistant) return;
  if (assistant.modelKey) assistantModelValue.value = assistant.modelKey;
});

function handleDebugModelSelect(key: string) {
  assistantModelValue.value = key;
}
// 已移除侧边栏相关设置
function startAssistantStream() {
  const text = assistantDraft.value.trim();
  if (!text) return;
  // 非流式：一次性返回完整结果
  if (assistantPort) { try { assistantPort.disconnect(); } catch { } assistantPort = null; }
  assistantResult.value = '';
  assistantLoading.value = true;
  const selectedAssistant = assistantConfigs.value.find((item) => item.id === assistantTask.value) || null;
  if (!selectedAssistant) {
    assistantLoading.value = false;
    assistantResult.value = '【错误】未找到助手配置';
    return;
  }
  const pair = parsePair(assistantModelValue.value);
  const payload: any = {
    action: 'performAiAction',
    task: selectedAssistant.preset,
    assistantPrompt: selectedAssistant.prompt,
    text
  };
  if (pair) { payload.channel = pair.channel; payload.model = pair.model; }
  // 目标语言统一取当前设置
  try { payload.targetLang = (config.value as any).translateTargetLang || 'zh-CN'; } catch { }
  try {
    chrome.runtime.sendMessage(payload, (resp: any) => {
      try { void chrome.runtime.lastError; } catch { }
      assistantLoading.value = false;
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
async function onLangChange() {
  try {
    await saveConfig({ translateTargetLang: config.value.translateTargetLang });
  } catch { }
  if (assistantDraft.value.trim()) startAssistantStream();
}
watch(assistantModelValue, (val) => { const pair = parsePair(val); try { chrome.storage.sync.set({ activeModel: pair || null }); } catch { } });

// 切换自动粘贴开关时持久化
watch(() => config.value.autoPasteGlobalAssistant, async (val) => {
  try {
    config.value.autoPasteGlobalAssistant = !!val;
    await saveConfig({ autoPasteGlobalAssistant: config.value.autoPasteGlobalAssistant });
  } catch { }
});

// 导入导出
const importerRef = ref<HTMLInputElement | null>(null);
async function onExport() {
  try {
    const snapshot = await loadSettingsSnapshot();
    downloadSettingsSnapshot(snapshot);
    toast.success('已导出设置');
  } catch {
    toast.error('导出失败');
  }
}
function triggerImport() { importerRef.value?.click(); }
async function onImportChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const snapshot = await parseSettingsImportFile(file);
    await saveSettingsSnapshot(snapshot);
    toast.success('导入成功，正在刷新');
    window.location.reload();
  } catch {
    toast.error('导入失败：JSON 解析错误');
  }
}

// 表单交互包装：校验 + Toast
function handleAddChannel() {
  try {
    addChannel(() => {
      // 添加成功后，重新初始化辅助数组
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
const editStatus = ref('');
function handleSaveEdit(idx: number) { editStatus.value = ''; try { saveEdit(idx, () => toast.success('渠道已保存')); } catch (e: any) { editStatus.value = String(e?.message || e || '保存失败'); toast.error(editStatus.value); } }
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

onMounted(loadAll);

onMounted(async () => {
  try {
    const v = (chrome as any)?.runtime?.getManifest?.()?.version;
    if (v) { version.value = v; return; }
  } catch { }
  try {
    const url = (chrome as any)?.runtime?.getURL?.('manifest.json');
    if (url) {
      const res = await fetch(url);
      if (res.ok) { const m = await res.json(); version.value = String(m?.version || '-'); }
    }
  } catch { }
});

// 统一从 shared/icons 获取图标

// 单页滚动定位
function scrollToSection(id: 'channels' | 'settings' | 'debug' | 'keys' | 'about') {
  try {
    const el = document.getElementById(`opt-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch { }
}

// 添加渠道使用 Dialog
const showAddChannel = ref(false);
function openAddChannel() { showAddChannel.value = true; }
function closeAddChannel() { showAddChannel.value = false; }
function handleAddChannelDialog() {
  try { handleAddChannel(); closeAddChannel(); } catch (e: any) { /* 内部已 toast */ }
}

// 取消编辑折叠，全部改为内联编辑布局

// 词汇表（不译词与术语映射）
const notTranslateText = ref('');
const termsText = ref('');
const glossaryAllText = computed({
  get() {
    return stringifyGlossaryMixedText({
      notTranslate: notTranslateText.value.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean),
      terms: parseGlossaryTermsText(termsText.value),
    });
  },
  set(v: string) {
    const parsed = parseGlossaryMixedText(v);
    notTranslateText.value = parsed.notTranslate.join('\n');
    termsText.value = serializeGlossaryTerms(parsed.terms);
  }
});
async function syncGlossaryFromStorage() {
  try {
    const glossary = await loadGlossary();
    notTranslateText.value = glossary.notTranslate.join('\n');
    termsText.value = serializeGlossaryTerms(glossary.terms);
  } catch { }
}
async function saveGlossary() {
  try {
    await persistGlossary({
      notTranslate: notTranslateText.value.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean),
      terms: parseGlossaryTermsText(termsText.value),
    });
    toast.success('词汇表已保存');
  } catch { toast.error('保存失败'); }
}
onMounted(syncGlossaryFromStorage);

// 拖拽排序函数
function enableDrag(idx: number) {
  isDraggable.value[idx] = true;
}
function disableDrag(idx: number) {
  isDraggable.value[idx] = false;
}
function handleDragStart(idx: number) {
  draggedIndex.value = idx;
}
function handleDragOver(e: DragEvent, idx: number) {
  e.preventDefault();
  dragOverIndex.value = idx;
}
function handleDragEnd() {
  if (draggedIndex.value !== null && dragOverIndex.value !== null && draggedIndex.value !== dragOverIndex.value) {
    const from = draggedIndex.value;
    const to = dragOverIndex.value;

    // 先从 modelsTextByIndex 同步最新的模型列表到 channels
    const updatedChannels = channels.value.map((ch, i) => ({
      ...ch,
      models: modelsTextByIndex[i] ? modelsTextByIndex[i].split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean) : ch.models
    }));

    const newChannels = [...updatedChannels];
    const [movedItem] = newChannels.splice(from, 1);
    newChannels.splice(to, 0, movedItem);

    // 同步更新辅助数组
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

    // 保存到存储
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
  // 拖拽结束后重置所有可拖拽状态
  isDraggable.value.forEach((_, i) => isDraggable.value[i] = false);
}
function handleDragLeave() {
  dragOverIndex.value = null;
}

// 获取模型列表
const fetchingModels = reactive<boolean[]>([]);
const fetchingAddFormModels = ref(false);

// 通用获取模型函数
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
    // OpenAI 格式：GET /v1/models
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
    // Gemini 格式：GET /v1beta/models
    const response = await fetch(`${url}/models?key=${apiKey}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    models = (data.models || []).map((m: any) => {
      // Gemini 返回的是 models/gemini-pro 格式，需要提取模型名
      const name = m.name || '';
      return name.startsWith('models/') ? name.substring(7) : name;
    }).filter(Boolean);
  }

  if (models.length === 0) {
    throw new Error('未获取到模型列表');
  }

  return models;
}

// 为已有渠道获取模型
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

// 为添加表单获取模型
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
</script>

<template>
  <div class="flex h-full min-h-0 w-full text-foreground">
    <!-- 左侧导航 -->
    <aside class="w-30 shrink-0 border-r p-1">
      <div class="flex h-full min-h-0 flex-col gap-4">
        <nav class="space-y-1" :class="embedded ? 'pt-0' : 'pt-12'">
          <Button v-for="item in [
            { id: 'settings', label: '通用设置' },
            { id: 'channels', label: '渠道管理' },
            { id: 'debug', label: '其它设置' },
            { id: 'about', label: '关于插件' }
          ] as Array<{ id: 'channels' | 'settings' | 'debug' | 'about'; label: string }>" :key="item.id"
            variant="ghost" class="w-full justify-center gap-1 text-olive-500 hover:bg-olive-100 hover:text-amber-800/80"
            :class="nav === (item.id as any) ? 'bg-olive-100 !text-amber-800' : ''" @click="nav = item.id as any">
            <Icon :icon="iconOfNav(item.id)" width="16" class="opacity-80" />
            <span>{{ item.label }}</span>
          </Button>
        </nav>
      </div>
    </aside>

    <!-- 右侧内容 -->
    <ScrollArea class="flex-1 min-h-0">
      <main class="space-y-6 p-6">
        <!-- 渠道管理 -->
        <section v-if="nav === 'channels'" :id="'opt-channels'" class="space-y-4">
          <header class="flex items-center h-10 text-base font-semibold">
            <div class="shrink-0">渠道管理</div>
            <div class="w-full"></div>
            <Button size="sm" @click="openAddChannel">
              <Icon icon="proicons:box-add" width="16" />
              添加渠道
            </Button>
          </header>


          <div v-if="!channels.length" class="text-sm text-muted-foreground">暂无渠道，请先添加。</div>
          <div v-else class="space-y-3">
            <div v-for="(ch, idx) in channels" :key="idx" class="border p-4 space-y-3 transition-all"
              :class="{ 'opacity-50': draggedIndex === idx, 'border-primary border-2': dragOverIndex === idx }"
              :draggable="isDraggable[idx]" @dragstart="handleDragStart(idx)" @dragover="handleDragOver($event, idx)"
              @dragend="handleDragEnd" @dragleave="handleDragLeave">
              <!-- 顶部：名称/类型/测试模型 + 展开/收起按钮 -->
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm flex items-center gap-2 flex-1">
                  <!-- 拖拽手柄 -->
                  <Button variant="ghost" size="icon" class="h-6 w-6 shrink-0 cursor-grab active:cursor-grabbing"
                    @mousedown="enableDrag(idx)" @mouseup="disableDrag(idx)" @mouseleave="disableDrag(idx)"
                    title="拖拽排序">
                    <Icon icon="lucide:grip-vertical" width="16" class="text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-6 w-6 shrink-0"
                    @click="channelExpanded[idx] = !channelExpanded[idx]" :title="channelExpanded[idx] ? '收起' : '展开'">
                    <Icon :icon="channelExpanded[idx] ? 'lucide:chevron-down' : 'lucide:chevron-right'" width="16" />
                  </Button>
                  <div class="flex-1">
                    <div class="font-medium inline-flex items-center gap-2">
                      <!-- <Icon :icon="iconOfChannelType(ch.type)" width="16" /> -->
                      {{ ch.name || '未命名' }}
                    </div>
                    <div class="text-muted-foreground">{{ ch.type }} · {{ ch.apiUrl || '-' }}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 w-64">
                  <div class="w-full">
                    <Select v-model="testModel[idx]">
                      <SelectTrigger>
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="m in modelOptionsOf(ch.models || [])" :key="m.modelId" :value="m.modelId">{{
                          m.displayName }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="icon" class="flex items-center gap-1 shrink-0"
                    @click="handleTestChannel(idx)" title="测试">
                    <Icon icon="proicons:bug" width="16" />
                  </Button>
                </div>
              </div>

              <!-- 表单：统一左右布局（展开时显示） -->
              <div v-if="channelExpanded[idx]" class="space-y-3">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <label class="text-sm font-medium leading-none block mb-1">类型</label>
                    <p class="text-xs text-muted-foreground">渠道提供方</p>
                  </div>
                  <div class="w-64">
                    <Select v-model="ch.type">
                      <SelectTrigger>
                        <SelectValue placeholder="选择类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                        <SelectItem value="openai-compatible">OpenAI 兼容</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <label class="text-sm font-medium leading-none block mb-1">名称</label>
                    <p class="text-xs text-muted-foreground">用于区分不同渠道</p>
                  </div>
                  <div class="w-64">
                    <Input v-model="ch.name" placeholder="如 my-openai" />
                  </div>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <label class="text-sm font-medium leading-none block mb-1">API URL</label>
                    <p class="text-xs text-muted-foreground">可留空以使用默认地址</p>
                  </div>
                  <div class="w-[32rem]">
                    <Input v-model="ch.apiUrl" placeholder="留空使用默认" />
                  </div>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <label class="text-sm font-medium leading-none block mb-1">API KEY</label>
                    <p class="text-xs text-muted-foreground">为空表示不修改现有密钥</p>
                  </div>
                  <div class="w-[32rem] relative">
                    <Input :type="showApiKeyByIndex[idx] ? 'text' : 'password'" v-model="ch.apiKey"
                      placeholder="留空表示不修改" class="pr-10" />
                    <Button variant="ghost" size="icon" class="absolute right-1 top-1 h-7 w-7"
                      :title="showApiKeyByIndex[idx] ? '隐藏' : '显示'"
                      @click="showApiKeyByIndex[idx] = !showApiKeyByIndex[idx]">
                      <Icon
                        :icon="showApiKeyByIndex[idx] ? 'material-symbols:visibility-off-outline' : 'material-symbols:visibility-outline'"
                        width="16" />
                    </Button>
                  </div>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <label class="text-sm font-medium leading-none block mb-1">兼容模式</label>
                    <p class="text-xs text-muted-foreground">开启后将 SystemPrompt 与 UserPrompt 合并，以
                      User 角色发送</p>
                  </div>
                  <div>
                    <Switch v-model="ch.systemPromptCompatMode" />
                  </div>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <label class="text-sm font-medium leading-none block mb-1">Models</label>
                    <p class="text-xs text-muted-foreground">每行一个，支持 id#name 格式自定义显示名称</p>
                  </div>
                  <div class="w-[32rem] space-y-2 shrink-0">
                    <Textarea v-model="modelsTextByIndex[idx]" class="min-h-28"
                      placeholder="gpt-4o&#10;gpt-4o-mini#GPT-4o Mini" />
                    <Button variant="outline" size="sm" class="flex items-center gap-1" @click="fetchModels(idx)"
                      :disabled="fetchingModels[idx]">
                      <Icon v-if="!fetchingModels[idx]" icon="lucide:download" width="14" />
                      <Icon v-else icon="line-md:loading-twotone-loop" width="14" class="animate-spin" />
                      {{ fetchingModels[idx] ? '获取中...' : '获取模型列表' }}
                    </Button>
                  </div>
                </div>
              </div>

              <div v-if="channelExpanded[idx]" class="flex items-center gap-2">
                <Button variant="outline" class="flex items-center gap-1 text-red-600"
                  @click="confirmRemoveChannel(idx)">
                  <Icon :icon="iconOfAction('delete')" width="16" /> 删除
                </Button>
                <div class="w-full"></div>
                <Button class="bg-primary text-primary-foreground flex items-center gap-1"
                  @click="handleSaveChannelInline(idx)">
                  <Icon :icon="iconOfAction('save')" width="16" /> 保存
                </Button>
                <span class="text-xs text-muted-foreground">{{ editStatus }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 通用设置（默认显示，仅该分组可见时显示其设置项） -->
        <section v-if="nav === 'settings'" :id="'opt-settings'" class="space-y-4">
          <header class="flex items-center h-10 text-base font-semibold">通用设置</header>
          <div class="space-y-3">
            <div class="space-y-4">
              <!-- 默认模型 -->
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">默认模型</label>
                  <p class="text-xs text-muted-foreground">用于默认调用与助手输出</p>
                </div>
                <div class="w-64">
                  <Select v-model="defaultModelValue">
                    <SelectTrigger>
                      <SelectValue placeholder="未设置" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">（未设置）</SelectItem>
                      <SelectItem v-for="p in modelPairs" :key="p.value" :value="p.value">
                        <span class="inline-flex items-center gap-2">
                          <Icon
                            :icon="iconOfChannelType(parsePair(p.value)?.channel ? (channels.find(c => c.name === parsePair(p.value)?.channel)?.type || '') : '')"
                            width="14" />
                          {{ p.label }}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <!-- 默认助手 -->
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">默认助手</label>
                  <p class="text-xs text-muted-foreground">打开助手窗口时默认进入的助手</p>
                </div>
                <div class="w-64">
                  <Select :model-value="defaultAssistantId" @update:modelValue="saveDefaultAssistant(String($event))">
                    <SelectTrigger>
                      <SelectValue placeholder="选择助手" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="assistant in assistantConfigs" :key="assistant.id" :value="assistant.id">{{ assistant.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <!-- 默认目标语言 -->
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">默认目标语言</label>
                  <p class="text-xs text-muted-foreground">用于翻译结果的语言</p>
                </div>
                <div class="w-64">
                  <Select v-model="config.translateTargetLang">
                    <SelectTrigger>
                      <SelectValue placeholder="语言" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">{{
                        lang.label
                      }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <!-- 结果显示方式 -->
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">结果显示方式</label>
                  <p class="text-xs text-muted-foreground">插入原文下方或覆盖原文</p>
                </div>
                <div class="w-64">
                  <Select v-model="config.displayMode">
                    <SelectTrigger>
                      <SelectValue placeholder="显示方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="insert">插入原文下方</SelectItem>
                      <SelectItem value="overlay">覆盖原文</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">划词翻译</label>
                  <p class="text-xs text-muted-foreground">选中文本后显示小圆点触发翻译</p>
                </div>
                <div>
                  <Switch v-model="config.enableSelectionTranslation" />
                </div>
              </div>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">悬浮翻译</label>
                  <p class="text-xs text-muted-foreground">设置触发键（如 Alt）</p>
                </div>
                <div class="w-36">
                  <Input v-model="config.actionKey" placeholder="如 Alt" />
                </div>
              </div>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">会话保存数量</label>
                  <p class="text-xs text-muted-foreground">全局助手最多保存的历史会话数量</p>
                </div>
                <div class="w-36">
                  <Select v-model="config.maxSessionsCount">
                    <SelectTrigger>
                      <SelectValue placeholder="选择数量" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="n in [10, 25, 50]" :key="n" :value="n">
                        {{ n }} 个
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">上下文消息数量</label>
                  <p class="text-xs text-muted-foreground">开启上下文时，携带最近 N 条历史消息</p>
                </div>
                <div class="w-36">
                  <Select v-model="config.contextMessagesCount">
                    <SelectTrigger>
                      <SelectValue placeholder="选择数量" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="n in ALLOWED_CONTEXT_MESSAGE_COUNTS" :key="n" :value="n">
                        {{ n }} 条
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <!-- 减弱视觉效果 -->
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">减弱视觉效果</label>
                  <p class="text-xs text-muted-foreground">关闭毛玻璃效果以提升性能</p>
                </div>
                <div>
                  <Switch v-model="config.reduceVisualEffects" />
                </div>
              </div>
            </div>

            <!-- 暂时隐藏任务级设置，后续根据需要再调整展示方式 -->
            <!-- <div class="space-y-4 border p-4">
 <div>
 <div class="text-sm font-medium leading-none mb-1">任务级设置</div>
 <p class="text-xs text-muted-foreground">按任务分别配置上下文、流式、思考和文件上传能力。</p>
 </div>
 <div v-for="task in SUPPORTED_TASKS" :key="task.value" class="space-y-3 border p-3">
 <div class="font-medium text-sm">{{ task.label }}</div>
 <div class="flex items-center justify-between gap-4">
 <div>
 <label class="text-sm font-medium leading-none block mb-1">启用上下文</label>
 <p class="text-xs text-muted-foreground">发送时附带最近历史消息</p>
 </div>
 <Switch :model-value="taskSettingsOf(task.value).enableContext"
 @update:modelValue="saveTaskConfig(task.value, { enableContext: !!$event })" />
 </div>
 <div class="flex items-center justify-between gap-4">
 <div>
 <label class="text-sm font-medium leading-none block mb-1">流式响应</label>
 <p class="text-xs text-muted-foreground">边生成边展示回复内容</p>
 </div>
 <Switch :model-value="taskSettingsOf(task.value).enableStreaming"
 @update:modelValue="saveTaskConfig(task.value, { enableStreaming: !!$event })" />
 </div>
 <div class="flex items-center justify-between gap-4">
 <div>
 <label class="text-sm font-medium leading-none block mb-1">思考模式</label>
 <p class="text-xs text-muted-foreground">允许模型输出 reasoning 内容</p>
 </div>
 <Switch :model-value="taskSettingsOf(task.value).enableReasoning"
 @update:modelValue="saveTaskConfig(task.value, { enableReasoning: !!$event })" />
 </div>
 <div class="flex items-center justify-between gap-4">
 <div>
 <label class="text-sm font-medium leading-none block mb-1">文件上传</label>
 <p class="text-xs text-muted-foreground">允许在该任务中附加图片和文件</p>
 </div>
 <Switch :model-value="taskSettingsOf(task.value).enableFileUpload"
 @update:modelValue="saveTaskConfig(task.value, { enableFileUpload: !!$event })" />
 </div>
 <div class="flex items-center justify-between gap-4">
 <div>
 <label class="text-sm font-medium leading-none block mb-1">思考等级</label>
 <p class="text-xs text-muted-foreground">仅在开启思考模式时生效</p>
 </div>
 <div class="w-36">
 <Select :model-value="taskSettingsOf(task.value).reasoningEffort"
 @update:modelValue="saveTaskReasoningEffort(task.value, String($event))">
 <SelectTrigger>
 <SelectValue placeholder="选择等级" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem v-for="item in reasoningEffortOptions" :key="item.value" :value="item.value">
 {{ item.label }}
 </SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 </div>
 </div> -->
            <!-- 译文样式：左label右select，预览独占一行 -->
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">译文样式</label>
                  <p class="text-xs text-muted-foreground">用于页面注入译文的外观</p>
                </div>
                <div class="w-64">
                  <Select v-model="styleSelection">
                    <SelectTrigger>
                      <SelectValue placeholder="选择样式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="p in (config as any).targetStylePresets || []" :key="p.name" :value="p.name">
                        <span class="inline-flex items-center gap-2">{{ p.description || p.name
                        }}</span>
                      </SelectItem>
                      <SelectItem value="__custom__">自定义（编辑 CSS）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div v-if="styleSelection === '__custom__'" class="space-y-2">
                <Textarea v-model="customCss" class="min-h-36"
                  placeholder=".ifocal-target-inline-wrapper.ifocal-target-style-custom .ifocal-target-inner,&#10;.ifocal-target-block-wrapper.ifocal-target-style-custom .ifocal-target-inner{ /* 自定义样式 */ }" />
                <div class="flex items-center gap-2">
                  <Button class="bg-primary text-primary-foreground flex items-center gap-1"
                    @click="saveStyleOnly">保存样式</Button>
                </div>
              </div>
              <div class=" border p-3">
                <div class="text-base">
                  <font class="notranslate ifocal-target-wrapper">
                    <font :class="`notranslate ifocal-target-inline-wrapper ${activeStyleName}`">
                      <font class="notranslate ifocal-target-inner">翻译结果</font>
                    </font>
                  </font>
                </div>
              </div>
            </div>
            <div class="space-y-4"></div>
            <div>
              <Button class="bg-primary text-primary-foreground flex items-center gap-1"
                @click="() => { saveModels(); saveBasics(); }">
                <Icon :icon="iconOfAction('save')" width="16" /> 保存设置
              </Button>
            </div>
          </div>
          <!-- Prompt 模板已移动至"其它设置" -->
        </section>

        <!-- 其它设置（原 调试 + 全文翻译） -->
        <section v-if="nav === 'debug'" :id="'opt-debug'" class="space-y-4">
          <header class="flex items-center h-10 text-base font-semibold">其它设置</header>
          <div class="space-y-3">
            <div class="flex flex-wrap gap-3">
              <div class="w-56 space-y-1">
                <Label class="block">模型</Label>
                <ModelSelect
                  :current-model-name="debugCurrentModelName"
                  :grouped-models="debugGroupedModels"
                  :selected-pair-key="assistantModelValue"
                  buttonClass="w-full h-9 justify-between"
                  @selectModel="handleDebugModelSelect"
                />
              </div>
              <div class="w-40 space-y-1">
                <Label class="block">任务</Label>
                <Select v-model="assistantTask">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="助手" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="assistant in assistantConfigs" :key="assistant.id" :value="assistant.id">
                      {{ assistant.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="w-36 space-y-1">
                <Label class="block">语言</Label>
                <Select v-model="config.translateTargetLang" @update:modelValue="onLangChange">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="语言" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">{{ lang.label
                      }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="flex space-x-3">
              <Textarea v-model="assistantDraft" class="min-h-28 w-[50%]" placeholder="在此粘贴需要处理的文本..." />
              <div class="w-[50%] border bg-secondary/40 p-3 text-sm whitespace-pre-wrap min-h-12 relative">
                <div v-if="assistantLoading" class="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Icon icon="line-md:loading-twotone-loop" width="20" class="animate-spin" />
                </div>{{ assistantResult }}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Button class="bg-primary text-primary-foreground flex items-center gap-1" :disabled="assistantLoading"
                @click="startAssistantStream">
                <Icon v-if="!assistantLoading" icon="proicons:bolt" width="16" />
                <Icon v-else icon="line-md:loading-twotone-loop" width="16" class="animate-spin" />
                执行
              </Button>
            </div>
          </div>
        </section>
        <!-- 已移除：全文翻译（调优项） -->

        <!-- 术语库（与 Prompt 模板同级） -->
        <section v-if="nav === 'debug'" :id="'opt-glossary'" class="space-y-4">
          <header class="flex items-center h-10 text-base font-semibold">术语库</header>
          <div class="space-y-3 text-sm">
            <p class="text-xs text-muted-foreground">支持混合输入：不译词（单行）与术语映射（key=value）。可用 # 开头写注释。</p>
            <Textarea v-model="glossaryAllText" class="min-h-40"
              placeholder="# 不译词&#10;GPU&#10;iPhone&#10;# 术语映射&#10;Sign in=登录&#10;Settings=设置" />
            <div>
              <Button class="bg-primary text-primary-foreground flex items-center gap-1" @click="saveGlossary">
                <Icon :icon="iconOfAction('save')" width="16" /> 保存术语库
              </Button>
            </div>
          </div>
        </section>

        <!-- 快捷键菜单已移除，触发键移至通用设置“悬浮翻译”项 -->

        <!-- 关于 -->
        <section v-if="nav === 'about'" :id="'opt-about'" class="space-y-4">
          <header class="flex items-center h-10 text-base font-semibold">关于插件</header>
          <div class="space-y-3 text-sm">
            <div>版本：{{ version }}</div>
            <div class="flex items-center gap-2">
              <Button class="bg-primary text-primary-foreground" @click="onExport">导出设置</Button>
              <Button variant="ghost" @click="triggerImport">导入设置</Button>
              <input ref="importerRef" type="file" accept="application/json" class="hidden" @change="onImportChange" />
            </div>
          </div>
        </section>
      </main>
    </ScrollArea>
  </div>

  <!-- 添加渠道 Dialog -->
  <Dialog :open="showAddChannel" @update:open="(v: boolean) => showAddChannel = v">
    <DialogScrollContent class="max-h-[80vh] max-w-[800px]">
      <div class="space-y-4">
        <div class="flex items-center h-10 text-base font-semibold">添加渠道</div>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">类型</label>
              <p class="text-xs text-muted-foreground">渠道提供方</p>
            </div>
            <div class="w-64">
              <Select v-model="addForm.type">
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="openai-compatible">OpenAI 兼容</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">名称</label>
              <p class="text-xs text-muted-foreground">用于区分不同渠道</p>
            </div>
            <div class="w-64">
              <Input v-model="addForm.name" placeholder="如 my-openai" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">API URL</label>
              <p class="text-xs text-muted-foreground">可留空以使用默认地址</p>
            </div>
            <div class="w-[32rem]">
              <Input v-model="addForm.apiUrl" placeholder="留空使用默认" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">API KEY</label>
              <p class="text-xs text-muted-foreground">可留空</p>
            </div>
            <div class="w-[32rem]">
              <Input v-model="addForm.apiKey" placeholder="可留空" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">兼容模式</label>
              <p class="text-xs text-muted-foreground">开启后将 SystemPrompt 与 UserPrompt 合并，以 User 角色发送</p>
            </div>
            <div>
              <Switch v-model="addForm.systemPromptCompatMode" />
            </div>
          </div>
        </div>
        <div class="flex items-start justify-between gap-4">
          <div>
            <label class="text-sm font-medium leading-none block mb-1">Models</label>
            <p class="text-xs text-muted-foreground">每行一个，支持 id#name 格式自定义显示名称</p>
          </div>
          <div class="w-[32rem] space-y-2 shrink-0">
            <Textarea v-model="addForm.modelsText" class="min-h-28" placeholder="gpt-4o&#10;gpt-4o-mini#GPT-4o Mini" />
            <Button variant="outline" size="sm" class="flex items-center gap-1" @click="fetchAddFormModels"
              :disabled="fetchingAddFormModels">
              <Icon v-if="!fetchingAddFormModels" icon="lucide:download" width="14" />
              <Icon v-else icon="line-md:loading-twotone-loop" width="14" class="animate-spin" />
              {{ fetchingAddFormModels ? '获取中...' : '获取模型列表' }}
            </Button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-full"></div>
          <Button class="bg-primary text-primary-foreground" @click="handleAddChannelDialog">添加</Button>
          <!-- 取消保留为关闭 Dialog 操作 -->
          <Button variant="outline" @click="closeAddChannel">取消</Button>
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
