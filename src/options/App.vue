<script setup lang="ts">
import { onMounted, ref, watch, computed, reactive } from 'vue';
import { Icon } from '@iconify/vue';
import { iconOfNav, iconOfChannelType, iconOfAction } from '@/shared/icons';
import { useChannels } from '@/options/composables/useChannels';
import { promptTemplates, defaultTemplates, initTemplates, saveTemplates as saveTpls, resetTemplates as resetTpls } from '@/options/composables/useTemplates';
import { useToast } from '@/options/composables/useToast';
import { SUPPORTED_LANGUAGES, SUPPORTED_TASKS, DEFAULT_CONFIG, loadConfig, saveConfig, CONFIG_KEYS } from '@/shared/config';

type ModelPair = { channel: string; model: string } | null;

// 左侧导航：默认显示“通用设置”
const nav = ref<'channels' | 'settings' | 'debug' | 'about'>('settings');

const { channels, modelPairs, addForm, addChannel, testModel, initTestModels, editForm, saveEdit, removeChannel, restoreChannelsSnapshot } = useChannels();
const toast = useToast();

const defaultModel = ref<ModelPair>(null);
const translateModel = ref<ModelPair>(null);
const activeModel = ref<ModelPair>(null);
// 使用全局配置
const config = ref({ ...DEFAULT_CONFIG });
// 样式选择/编辑
const styleSelection = ref<string>('ifocal-target-style-dotted');
const customCss = ref<string>('');
const activeStyleName = computed(() => styleSelection.value === '__custom__' ? (parseStyleNameFromCss(customCss.value) || 'ifocal-target-style-custom') : styleSelection.value);
const activePreviewCss = computed(() => {
  if (styleSelection.value === '__custom__') return (customCss.value || '').trim();
  const list = (config.value as any).targetStylePresets || [];
  const found = list.find((p: any) => p && p.name === styleSelection.value);
  return (found?.css || '').trim();
});
function parseStyleNameFromCss(css: string): string | '' {
  try {
    const m = css.match(/\.ifocal\-target\-style\-([a-zA-Z0-9_\-]+)/);
    return m ? `ifocal-target-style-${m[1]}` : '';
  } catch { return ''; }
}
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
    const defaults = (DEFAULT_CONFIG.targetStylePresets as any[]) || [];
    const incoming = Array.isArray(list) ? list : [];
    const byName = new Map<string, any>();
    defaults.forEach((p: any) => { if (p?.name) byName.set(String(p.name), p); });
    incoming.forEach((p: any) => { if (p?.name) byName.set(String(p.name), p); });
    const merged = Array.from(byName.values());
    const css = (merged || []).map((p: any) => String(p?.css || '')).join('\n');
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = css;
  } catch { }
}

const defaultModelValue = ref('');
const translateModelValue = ref('');
// 关于页版本号：优先 chrome.runtime.getManifest()，回退到读取 manifest.json
const version = ref('-');
// 渠道编辑：每项独立的显示/输入状态
const showApiKeyByIndex = reactive<boolean[]>([]);
const modelsTextByIndex = reactive<string[]>([]);
const originalNames = reactive<string[]>([]);
watch(defaultModel, (val) => { defaultModelValue.value = joinPair(val); }, { immediate: true });
watch(translateModel, (val) => { translateModelValue.value = joinPair(val); }, { immediate: true });

function joinPair(pair: ModelPair) { return pair && (pair as any).channel && (pair as any).model ? `${(pair as any).channel}|${(pair as any).model}` : ''; }
function parsePair(value: string): ModelPair { if (!value || value === '__unset__') return null; const [channel, model] = value.split('|'); if (!channel || !model) return null; return { channel, model }; }

async function loadAll() {
  try {
    // 加载全局配置
    const globalConfig = await loadConfig();
    config.value = { ...globalConfig };
    styleSelection.value = (config.value as any).wrapperStyleName || 'ifocal-target-style-dotted';
    ensureOptionPresetStyles((config.value as any).targetStylePresets);
    // 若当前选择在预设中，预填其 CSS；否则给出自定义模板
    try {
      const list = (config.value as any).targetStylePresets || [];
      const found = list.find((p: any) => p && p.name === styleSelection.value);
      if (found?.css) customCss.value = String(found.css);
      else customCss.value = `.ifocal-target-inline-wrapper.${styleSelection.value} .ifocal-target-inner,
.ifocal-target-block-wrapper.${styleSelection.value} .ifocal-target-inner{ /* 自定义样式 */ }`;
    } catch { }

    // 加载其他设置
    await new Promise<void>((resolve) => {
      try {
        chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'promptTemplates', 'activeModel'], (items: any) => {
          channels.value = Array.isArray(items.channels) ? items.channels : [];
          // 初始化每项编辑辅助状态
          originalNames.length = 0; modelsTextByIndex.length = 0; showApiKeyByIndex.length = 0;
          channels.value.forEach((c, i) => {
            originalNames[i] = c.name;
            modelsTextByIndex[i] = (c.models || []).join('\n');
            showApiKeyByIndex[i] = false;
          });
          defaultModel.value = items.defaultModel || null;
          translateModel.value = items.translateModel || null;
          activeModel.value = items.activeModel || null;
          initTemplates(items.promptTemplates || {});
          initTestModels();
          resolve();
        });
      } catch { resolve(); }
    });
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

function saveModels() { const dm = parsePair(defaultModelValue.value); const tm = parsePair(translateModelValue.value); try { chrome.storage.sync.set({ defaultModel: dm, translateModel: tm }, () => toast.success('模型设置已保存')); } catch { toast.error('保存失败'); } }
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
    let presetsToSave = (config.value as any).targetStylePresets || [];
    if (styleSelection.value === '__custom__') {
      const name = parseStyleNameFromCss(customCss.value);
      if (!name) { toast.error('自定义 CSS 必须包含 ifocal-target-style-* 类名'); return; }
      wrapperStyleNameToSave = name;
      const next = { name, description: '自定义', css: (customCss.value || '').trim() };
      const idx = presetsToSave.findIndex((p: any) => p && p.name === name);
      if (idx >= 0) presetsToSave.splice(idx, 1, next); else presetsToSave = [...presetsToSave, next];
      (config.value as any).targetStylePresets = presetsToSave;
      (config.value as any).wrapperStyleName = wrapperStyleNameToSave;
    } else {
      (config.value as any).wrapperStyleName = wrapperStyleNameToSave;
    }

    await saveConfig({
      actionKey: k,
      hoverKey: k,
      selectKey: k,
      translateTargetLang: lang,
      displayMode: config.value.displayMode,
      wrapperStyleName: wrapperStyleNameToSave,
      targetStylePresets: presetsToSave,
      enableSelectionTranslation: config.value.enableSelectionTranslation,
      maxSessionsCount: config.value.maxSessionsCount || 50,
      enableContext: config.value.enableContext || false,
      contextMessagesCount: config.value.contextMessagesCount || 5
    });

    toast.success('基础设置已保存');
  } catch {
    toast.error('保存失败');
  }
}

async function saveStyleOnly() {
  try {
    let wrapperStyleNameToSave = activeStyleName.value;
    let presetsToSave = (config.value as any).targetStylePresets || [];
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
function confirmRemoveChannel(ch: any) {
  const name = ch?.name || '';
  toast.action(`确认删除渠道 ${name} ?`, {
    label: '删除',
    type: 'error',
    onClick: () => {
      try {
        removeChannel(name, (snapshot) => {
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
    const original = originalNames[idx] || ch.name;
    editForm.type = ch.type as any;
    editForm.name = ch.name || '';
    editForm.apiUrl = ch.apiUrl || '';
    editForm.apiKey = ch.apiKey || '';
    editForm.modelsText = modelsTextByIndex[idx] || (Array.isArray(ch.models) ? ch.models.join('\n') : '');
    saveEdit(original, () => {
      // 更新原始名称映射，处理重命名
      originalNames[idx] = editForm.name;
      toast.success('渠道已保存');
    });
  } catch (e: any) {
    toast.error(String(e?.message || e || '保存失败'));
  }
}

// 助手（非流式输出）
const assistantDraft = ref('');
const assistantModelValue = ref('');
const assistantTask = ref<'translate' | 'summarize' | 'rewrite' | 'polish'>('translate');
const assistantResult = ref('');
const assistantLoading = ref(false);
let assistantPort: chrome.runtime.Port | null = null;
watch(channels, () => { const prefer = joinPair(activeModel.value) || joinPair(defaultModel.value) || modelPairs.value[0]?.value || ''; if (prefer) assistantModelValue.value = prefer; }, { immediate: true, deep: true });
// 已移除侧边栏相关设置
function startAssistantStream() {
  const text = assistantDraft.value.trim();
  if (!text) return;
  // 非流式：一次性返回完整结果
  if (assistantPort) { try { assistantPort.disconnect(); } catch { } assistantPort = null; }
  assistantResult.value = '';
  assistantLoading.value = true;
  const pair = parsePair(assistantModelValue.value);
  const payload: any = { action: 'performAiAction', task: assistantTask.value, text };
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
const STORAGE_KEYS = ['channels', 'defaultModel', 'translateModel', 'activeModel', 'actionKey', 'hoverKey', 'selectKey', 'translateTargetLang', 'displayMode', 'promptTemplates', 'autoPasteGlobalAssistant'];
function onExport() { try { chrome.storage.sync.get(STORAGE_KEYS, (items: any) => { try { const payload = JSON.stringify(items, null, 2); const blob = new Blob([payload], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'ifocal-settings.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast.success('已导出设置'); } catch { } }); } catch { } }
function triggerImport() { importerRef.value?.click(); }
function onImportChange(e: Event) { const input = e.target as HTMLInputElement; const file = input && input.files && input.files[0]; if (!file) return; try { const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(String(reader.result || '{}')); const toSet: any = {}; STORAGE_KEYS.forEach(k => { if (k in (data || {})) toSet[k] = (data as any)[k]; }); chrome.storage.sync.set(toSet, () => { toast.success('导入成功，正在刷新'); window.location.reload(); }); } catch { toast.error('导入失败：JSON 解析错误'); } }; reader.readAsText(file); } catch { } }

// 表单交互包装：校验 + Toast
function handleAddChannel() { try { addChannel(); toast.success('已添加渠道'); } catch (e: any) { toast.error(String(e?.message || e || '保存失败')); } }
const editStatus = ref('');
function handleSaveEdit(original: string) { editStatus.value = ''; try { saveEdit(original, () => toast.success('渠道已保存')); } catch (e: any) { editStatus.value = String(e?.message || e || '保存失败'); toast.error(editStatus.value); } }
function handleTestChannel(name: string) { const model = testModel[name] || undefined; try { chrome.runtime.sendMessage({ action: 'testChannel', channel: name, model }, (resp: any) => { if (!resp) { toast.error('测试失败：无响应'); return; } if (resp.ok) toast.success('测试成功'); else toast.error(`测试失败：${resp.error || '未知错误'}`); }); } catch { toast.error('测试调用失败'); } }

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
// 术语库：合并视图（支持#注释；含=认为是映射，否则是不译词）
const glossaryAllText = computed({
  get() {
    const nots = (notTranslateText.value || '').trim();
    const terms = (termsText.value || '').trim();
    const parts: string[] = [];
    if (nots) parts.push('# 不译词: 一行一个', nots);
    if (terms) parts.push('# 术语映射: 每行 key=value', terms);
    return parts.join('\n');
  },
  set(v: string) {
    const lines = String(v || '').split(/\r?\n/);
    const nots: string[] = [];
    const terms: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0) {
        const k = t.slice(0, i).trim();
        const val = t.slice(i + 1).trim();
        if (k) terms.push(`${k}=${val}`);
      } else {
        nots.push(t);
      }
    }
    notTranslateText.value = nots.join('\n');
    termsText.value = terms.join('\n');
  }
});
async function loadGlossary() {
  try {
    await new Promise<void>((resolve) => {
      chrome.storage.sync.get(['glossaryNotTranslate', 'glossaryTerms'], (items: any) => {
        const list = Array.isArray(items?.glossaryNotTranslate) ? items.glossaryNotTranslate : [];
        notTranslateText.value = (list as string[]).join('\n');
        const terms = (items?.glossaryTerms && typeof items.glossaryTerms === 'object') ? items.glossaryTerms : {};
        const lines = Object.keys(terms).map((k) => `${k}=${terms[k]}`);
        termsText.value = lines.join('\n');
        resolve();
      });
    });
  } catch { }
}
async function saveGlossary() {
  try {
    const nots = notTranslateText.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const terms: Record<string, string> = {};
    for (const line of termsText.value.split(/\r?\n/)) {
      const t = line.trim(); if (!t) continue; const i = t.indexOf('='); if (i <= 0) continue; const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim(); if (k) terms[k] = v;
    }
    chrome.storage.sync.set({ glossaryNotTranslate: nots, glossaryTerms: terms }, () => toast.success('词汇表已保存'));
  } catch { toast.error('保存失败'); }
}
onMounted(loadGlossary);
</script>

<template>
  <div class="min-h-screen flex bg-background text-foreground mx-auto max-w-6xl">
    <!-- 左侧导航（sticky） -->
    <aside class="min-h-screen w-60 shrink-0 bg-white sticky top-0 self-start border-r border-color-muted/50 pr-6 mr-6">
      <nav class="my-6 space-y-1">
        <Button v-for="item in [
          { id: 'settings', label: '通用设置' },
          { id: 'channels', label: '渠道管理' },
          { id: 'debug', label: '其它设置' },
          { id: 'about', label: '关于插件' }
        ] as Array<{ id: 'channels' | 'settings' | 'debug' | 'about'; label: string }>" :key="item.id" variant="ghost"
          size="lg" class="w-full justify-start rounded-md px-3 py-2 text-sm flex items-center gap-2"
          :class="nav === (item.id as any) ? 'bg-secondary' : ''" @click="nav = item.id as any">
          <Icon :icon="iconOfNav(item.id)" width="16" class="opacity-80" />
          <span>{{ item.label }}</span>
        </Button>
      </nav>
    </aside>

    <!-- 右侧内容 -->
    <main class="flex-1 py-6 space-y-6">
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
          <div v-for="(ch, idx) in channels" :key="ch.name" class="space-y-3">
            <!-- 顶部：名称/类型/测试模型 -->
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm">
                <div class="font-medium inline-flex items-center gap-2">
                  <Icon :icon="iconOfChannelType(ch.type)" width="16" />
                  {{ ch.name || '未命名' }}
                </div>
                <div class="text-muted-foreground">{{ ch.type }} · {{ ch.apiUrl || '-' }}</div>
              </div>
              <div class="flex items-center gap-2 w-64">
                <div class="w-full">
                  <Select v-model="testModel[ch.name]">
                    <SelectTrigger>
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="m in (ch.models || [])" :key="m" :value="m">{{ m }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="icon" class="flex items-center gap-1 shrink-0"
                  @click="handleTestChannel(ch.name)" title="测试">
                  <Icon icon="proicons:bug" width="16" />
                </Button>
              </div>
            </div>

            <!-- 表单：统一左右布局 -->
            <div class="space-y-3">
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
                  <Input :type="showApiKeyByIndex[idx] ? 'text' : 'password'" v-model="ch.apiKey" placeholder="留空表示不修改"
                    class="pr-10" />
                  <Button variant="ghost" size="icon" class="absolute right-1 top-1 h-7 w-7"
                    :title="showApiKeyByIndex[idx] ? '隐藏' : '显示'"
                    @click="showApiKeyByIndex[idx] = !showApiKeyByIndex[idx]">
                    <Icon
                      :icon="showApiKeyByIndex[idx] ? 'material-symbols:visibility-off-outline-rounded' : 'material-symbols:visibility-outline-rounded'"
                      width="16" />
                  </Button>
                </div>
              </div>
              <div class="flex items-start justify-between gap-4">
                <div>
                  <label class="text-sm font-medium leading-none block mb-1">Models</label>
                  <p class="text-xs text-muted-foreground">每行一个</p>
                </div>
                <div class="w-[32rem]">
                  <Textarea v-model="modelsTextByIndex[idx]" class="min-h-28" />
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Button variant="outline" class="flex items-center gap-1 text-red-600" @click="confirmRemoveChannel(ch)">
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
            <!-- 翻译模型 -->
            <div class="flex items-center justify-between gap-4">
              <div>
                <label class="text-sm font-medium leading-none block mb-1">翻译模型</label>
                <p class="text-xs text-muted-foreground">用于翻译任务优先使用</p>
              </div>
              <div class="w-64">
                <Select v-model="translateModelValue">
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
                    <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">{{ lang.label
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
                <label class="text-sm font-medium leading-none block mb-1">全局助手</label>
                <p class="text-xs text-muted-foreground">自动粘贴剪贴板到助手输入框</p>
              </div>
              <div>
                <Switch v-model="config.autoPasteGlobalAssistant" />
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
                    <SelectItem v-for="n in [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]" :key="n" :value="n">
                      {{ n }} 个
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="flex items-center justify-between gap-4">
              <div>
                <label class="text-sm font-medium leading-none block mb-1">启用上下文</label>
                <p class="text-xs text-muted-foreground">发送消息时包含最近的对话历史</p>
              </div>
              <div>
                <Switch v-model="config.enableContext" />
              </div>
            </div>
          </div>
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
                      <span class="inline-flex items-center gap-2">{{ p.description || p.name }}</span>
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
            <div class="rounded-lg border p-3">
              <div class="text-base">
                <font class="notranslate ifocal-target-wrapper">
                  <font :class="`notranslate ifocal-target-inline-wrapper ${activeStyleName}`">
                    <font class="notranslate ifocal-target-inner">翻译结果</font>
                  </font>
                </font>
              </div>
            </div>
          </div>
          <div class="space-y-4">
            
          </div>
          <div>
            <Button class="bg-primary text-primary-foreground flex items-center gap-1"
              @click="() => { saveModels(); saveBasics(); }">
              <Icon :icon="iconOfAction('save')" width="16" /> 保存设置
            </Button>
          </div>
        </div>
        <!-- Prompt 模板已移动至“其它设置” -->
      </section>

      <!-- 其它设置（原 调试 + 全文翻译） -->
      <section v-if="nav === 'debug'" :id="'opt-debug'" class="space-y-4">
        <header class="flex items-center h-10 text-base font-semibold">其它设置</header>
        <div class="space-y-3">
          <div class="flex flex-wrap gap-2">
            <div class="w-56">
              <Label class="mb-1 block">模型</Label>
              <Select v-model="assistantModelValue">
                <SelectTrigger>
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="p in modelPairs" :key="p.value" :value="p.value">{{ p.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="w-40">
              <Label class="mb-1 block">任务</Label>
              <Select v-model="assistantTask">
                <SelectTrigger>
                  <SelectValue placeholder="任务" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="translate">翻译</SelectItem>
                  <SelectItem value="summarize">总结</SelectItem>
                  <SelectItem value="rewrite">改写</SelectItem>
                  <SelectItem value="polish">润色</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="w-36">
              <Label class="mb-1 block">语言</Label>
              <Select v-model="config.translateTargetLang" @update:modelValue="onLangChange">
                <SelectTrigger>
                  <SelectValue placeholder="语言" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">{{ lang.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="flex space-x-4">
            <Textarea v-model="assistantDraft" class="min-h-28 w-[50%]" placeholder="在此粘贴需要处理的文本..." />
            <div class="w-[50%] rounded-md border bg-secondary/40 p-3 text-sm whitespace-pre-wrap min-h-12 relative">
              <div v-if="assistantLoading" class="absolute inset-0 flex items-center justify-center bg-white/60">
                <Icon icon="line-md:loading-twotone-loop" width="20" class="animate-spin" />
              </div>
              {{ assistantResult }}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button class="bg-primary text-primary-foreground flex items-center gap-1" :disabled="assistantLoading" @click="startAssistantStream">
              <Icon v-if="!assistantLoading" icon="proicons:bolt" width="16" />
              <Icon v-else icon="line-md:loading-twotone-loop" width="16" class="animate-spin" />
              执行
            </Button>
          </div>
        </div>
      </section>
      <!-- 已移除：全文翻译（调优项） -->

      <!-- 术语库（与 Prompt 模板同级） -->
      <section v-if="nav==='debug'" :id="'opt-glossary'" class="space-y-4">
        <header class="flex items-center h-10 text-base font-semibold">术语库</header>
        <div class="space-y-3 text-sm">
          <p class="text-xs text-muted-foreground">支持混合输入：不译词（单行）与术语映射（key=value）。可用 # 开头写注释。</p>
          <Textarea
            v-model="glossaryAllText"
            class="min-h-40"
            placeholder="# 不译词&#10;GPU&#10;iPhone&#10;# 术语映射&#10;Sign in=登录&#10;Settings=设置"
          />
          <div>
            <Button class="bg-primary text-primary-foreground flex items-center gap-1" @click="saveGlossary">
              <Icon :icon="iconOfAction('save')" width="16" /> 保存术语库
            </Button>
          </div>
        </div>
      </section>

      <!-- Prompt 模板（移动至其它设置） -->
      <section v-if="nav === 'debug'" :id="'opt-prompts'" class="space-y-4">
        <header class="flex items-center h-10 text-base font-semibold">Prompt 模板</header>
        <div class="space-y-3">
          <p class="text-xs text-muted-foreground">可使用占位符 <code v-pre>{{targetLang}}</code> 与 <code
              v-pre>{{text}}</code>。</p>
          <div class="space-y-4">
            <div>
              <Label class="mb-1 block">翻译模板</Label>
              <Textarea v-model="promptTemplates.translate" class="min-h-28"
                :placeholder="defaultTemplates.translate" />
            </div>
            <div>
              <Label class="mb-1 block">总结模板</Label>
              <Textarea v-model="promptTemplates.summarize" class="min-h-28"
                :placeholder="defaultTemplates.summarize" />
            </div>
            <div>
              <Label class="mb-1 block">改写模板</Label>
              <Textarea v-model="promptTemplates.rewrite" class="min-h-28" :placeholder="defaultTemplates.rewrite" />
            </div>
            <div>
              <Label class="mb-1 block">润色模板</Label>
              <Textarea v-model="promptTemplates.polish" class="min-h-28" :placeholder="defaultTemplates.polish" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button class="bg-primary text-primary-foreground" @click="() => { saveTpls(); toast.success('模板已保存'); }">
              <Icon :icon="iconOfAction('save')" width="16" /> 保存模板
            </Button>
            <Button variant="ghost" @click="() => { resetTpls(); toast.info('已恢复默认模板'); }">重置模板</Button>
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
        </div>
        <div class="flex items-start justify-between gap-4">
          <div>
            <label class="text-sm font-medium leading-none block mb-1">Models</label>
            <p class="text-xs text-muted-foreground">每行一个</p>
          </div>
          <div class="w-[32rem]">
            <Textarea v-model="addForm.modelsText" class="min-h-28" placeholder="gpt-5-mini&#10;gpt-4o" />
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
