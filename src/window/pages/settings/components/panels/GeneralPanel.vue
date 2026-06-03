<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Icon from '@/components/ui/icon/Icon.vue';
import { iconOfAction } from '@/shared/icons';
import { SUPPORTED_LANGUAGES, saveConfig } from '@/shared/config';
import {
  buildStylePresetsCss,
  CUSTOM_STYLE_SELECTION,
  DEFAULT_WRAPPER_STYLE_NAME,
  mergeTargetStylePresets,
  parseStyleNameFromCss,
  resolveSelectedStylePresetCss,
  upsertCustomStylePreset,
} from '@/shared/style-presets';
import { normalizeMachineTranslateDefaultChannelId } from '@/shared/machine-translation';
import { PINNED_MODELS_GROUP_NAME } from '@/shared/model-catalog';
import ModelSelect from '@/window/components/ModelSelect.vue';
import { useSettingsStore } from '@/window/pages/settings/composables/useSettingsStore';
import { useToast } from '@/window/composables/useToast';

const store = useSettingsStore();
const {
  config,
  machineChannels,
  mtDefaultChannelId,
  modelPairs,
  defaultModel,
  defaultModelValue,
  pinnedModelKeys,
  togglePinnedModel,
  parsePair,
  normalizeContextMessagesCount,
  ALLOWED_CONTEXT_MESSAGE_COUNTS,
} = store;
const toast = useToast();

const styleSelection = ref<string>(DEFAULT_WRAPPER_STYLE_NAME);
const customCss = ref<string>('');
const activeStyleName = computed(() => styleSelection.value === CUSTOM_STYLE_SELECTION
  ? (parseStyleNameFromCss(customCss.value) || 'ifocal-target-style-custom')
  : styleSelection.value);

const settingsModelPairs = computed(() => {
  return modelPairs.value.map((pair) => {
    const parsed = parsePair(pair.value);
    return {
      key: pair.value,
      model: pair.label,
      channel: parsed?.channel || '未分组',
    };
  });
});

const settingsGroupedModels = computed(() => {
  const groups: Record<string, Array<{ key: string; model: string; channel: string }>> = {};
  const pinnedSet = new Set(pinnedModelKeys.value || []);
  const pinned = settingsModelPairs.value.filter((pair) => pinnedSet.has(pair.key));
  if (pinned.length) groups[PINNED_MODELS_GROUP_NAME] = pinned;
  settingsModelPairs.value.forEach((pair) => {
    if (pinnedSet.has(pair.key)) return;
    if (!groups[pair.channel]) groups[pair.channel] = [];
    groups[pair.channel].push(pair);
  });
  return groups;
});

const defaultModelCurrentName = computed(() => {
  return settingsModelPairs.value.find((pair) => pair.key === defaultModelValue.value)?.model || '';
});

function handleDefaultModelSelect(key: string) {
  defaultModelValue.value = key;
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

function ensureOptionPresetStyles(list?: Array<{ name: string; css: string }>) {
  try {
    const id = 'ifocal-option-style-presets';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = buildStylePresetsCss(list);
  } catch { }
}

watch(activePreviewCss, (css) => ensurePreviewStyle(css), { immediate: true });

onMounted(() => {
  styleSelection.value = String((config.value as any).wrapperStyleName || DEFAULT_WRAPPER_STYLE_NAME).trim() || DEFAULT_WRAPPER_STYLE_NAME;
  ensureOptionPresetStyles((config.value as any).targetStylePresets);
  try {
    const foundCss = resolveSelectedStylePresetCss(styleSelection.value, (config.value as any).targetStylePresets);
    if (foundCss) customCss.value = foundCss;
    else customCss.value = `.ifocal-target-inline-wrapper.${styleSelection.value} .ifocal-target-inner,
.ifocal-target-block-wrapper.${styleSelection.value} .ifocal-target-inner{ /* 自定义样式 */ }`;
  } catch { }
});

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
    const selectionTranslationMode = config.value.selectionTranslationMode === 'machine' ? 'machine' : 'ai';
    const hoverTranslationMode = config.value.hoverTranslationMode === 'machine' ? 'machine' : selectionTranslationMode;
    const hoverDisplayMode = config.value.hoverDisplayMode === 'overlay'
      ? 'overlay'
      : (config.value.hoverDisplayMode === 'replace' ? 'replace' : 'insert');
    const fullPageDisplayMode = config.value.fullPageDisplayMode === 'replace' ? 'replace' : 'insert';
    const fullPageScopeMode = config.value.fullPageScopeMode === 'page' ? 'page' : 'smart';
    const mtDefaultId = normalizeMachineTranslateDefaultChannelId(mtDefaultChannelId.value, machineChannels.value);
    if (!k) {
      toast.error('快捷键不能为空');
      return;
    }

    config.value.actionKey = k;
    config.value.translateTargetLang = lang;
    config.value.hoverDisplayMode = hoverDisplayMode;
    config.value.fullPageDisplayMode = fullPageDisplayMode;
    config.value.fullPageScopeMode = fullPageScopeMode;
    if (typeof config.value.enableSelectionTranslation !== 'boolean') config.value.enableSelectionTranslation = true;
    config.value.selectionTranslationMode = selectionTranslationMode;
    config.value.hoverTranslationMode = hoverTranslationMode;
    mtDefaultChannelId.value = mtDefaultId;
    (config.value as any).mtDefaultChannelId = mtDefaultId;

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
      translateTargetLang: lang,
      hoverDisplayMode,
      fullPageDisplayMode,
      fullPageScopeMode,
      wrapperStyleName: wrapperStyleNameToSave,
      targetStylePresets: presetsToSave,
      enableSelectionTranslation: config.value.enableSelectionTranslation,
      selectionTranslationMode,
      hoverTranslationMode,
      mtDefaultChannelId: mtDefaultId,
      maxSessionsCount: config.value.maxSessionsCount || 10,
      contextMessagesCount: normalizeContextMessagesCount(config.value.contextMessagesCount),
      reduceVisualEffects: config.value.reduceVisualEffects || false,
    } as any);

    toast.success('基础设置已保存');
  } catch {
    toast.error('保存失败');
  }
}

async function saveStyleOnly() {
  try {
    let wrapperStyleNameToSave = activeStyleName.value;
    let presetsToSave = Array.isArray((config.value as any).targetStylePresets) ? (config.value as any).targetStylePresets : [];
    if (styleSelection.value === CUSTOM_STYLE_SELECTION) {
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
</script>

<template>
  <section :id="'opt-settings'" class="space-y-4">
    <header class="flex items-center h-10 text-base font-semibold">通用设置</header>
    <div class="space-y-3">
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <label class="text-sm font-medium leading-none block mb-1">智能模型</label>
            <p class="text-xs text-muted-foreground">更智能，默认用于划词翻译等低并发场景</p>
          </div>
          <div class="w-60">
            <ModelSelect :current-model-name="defaultModelCurrentName" :grouped-models="settingsGroupedModels"
              :selected-pair-key="defaultModelValue" :pinned-model-keys="pinnedModelKeys"
              buttonClass="w-full h-9 justify-between rounded-xl" @selectModel="handleDefaultModelSelect"
              @togglePin="togglePinnedModel" />
          </div>
        </div>
        <div class="flex items-center justify-between gap-4">
          <div>
            <label class="text-sm font-medium leading-none block mb-1">机器翻译</label>
            <p class="text-xs text-muted-foreground">更快速，默认用于网页全文翻译等到并发场景</p>
          </div>
          <div class="w-60">
            <Select v-model="mtDefaultChannelId">
              <SelectTrigger class="w-full rounded-xl">
                <SelectValue placeholder="选择机器翻译渠道" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="ch in machineChannels.filter((item) => item.enabled)" :key="ch.id"
                  :value="ch.id">
                  {{ ch.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div class="flex items-center justify-between gap-4">
          <div>
            <label class="text-sm font-medium leading-none block mb-1">目标语言</label>
            <p class="text-xs text-muted-foreground">用于调整输出和翻译结果的语言</p>
          </div>
          <div class="w-60">
            <Select v-model="config.translateTargetLang">
              <SelectTrigger class="w-full rounded-xl">
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
        <div class="flex items-center justify-between gap-4">
          <div>
            <label class="text-sm font-medium leading-none block mb-1">会话保存数量</label>
            <p class="text-xs text-muted-foreground">全局助手最多保存的历史会话数量</p>
          </div>
          <div class="w-60">
            <Select v-model="config.maxSessionsCount">
              <SelectTrigger class="w-full rounded-xl">
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
          <div class="w-60">
            <Select v-model="config.contextMessagesCount">
              <SelectTrigger class="w-full rounded-xl">
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

      <div class="border-t"></div>

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
          <label class="text-sm font-medium leading-none block mb-1">划词翻译方法</label>
          <p class="text-xs text-muted-foreground">智能翻译效果更好，传统翻译速度更快</p>
        </div>
        <div class="w-60">
          <Select v-model="config.selectionTranslationMode">
            <SelectTrigger class="w-full rounded-xl">
              <SelectValue placeholder="选择翻译方法" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ai">智能模型</SelectItem>
              <SelectItem value="machine">机器翻译</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">悬浮翻译</label>
          <p class="text-xs text-muted-foreground">设置触发键（如 Alt）</p>
        </div>
        <div class="w-60">
          <Input v-model="config.actionKey" placeholder="如 Alt" class="rounded-xl" />
        </div>
      </div>
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">悬浮翻译方法</label>
          <p class="text-xs text-muted-foreground">智能翻译效果更好，传统翻译速度更快</p>
        </div>
        <div class="w-60">
          <Select v-model="config.hoverTranslationMode">
            <SelectTrigger class="w-full rounded-xl">
              <SelectValue placeholder="选择翻译方法" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ai">智能模型</SelectItem>
              <SelectItem value="machine">机器翻译</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">悬浮翻译结果显示方式</label>
          <p class="text-xs text-muted-foreground">插入原文下方、覆盖原文，或使用悬浮面板展示</p>
        </div>
        <div class="w-60">
          <Select v-model="config.hoverDisplayMode">
            <SelectTrigger class="w-full rounded-xl">
              <SelectValue placeholder="显示方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="insert">插入原文下方</SelectItem>
              <SelectItem value="replace">覆盖原文</SelectItem>
              <SelectItem value="overlay">悬浮面板</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">全文翻译结果显示方式</label>
          <p class="text-xs text-muted-foreground">插入原文下方，或覆盖原文进行原地阅读</p>
        </div>
        <div class="w-60">
          <Select v-model="config.fullPageDisplayMode">
            <SelectTrigger class="w-full rounded-xl">
              <SelectValue placeholder="显示方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="insert">插入原文下方</SelectItem>
              <SelectItem value="replace">覆盖原文</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">全文翻译范围</label>
          <p class="text-xs text-muted-foreground">默认优先识别正文、详情、文档主体，识别不准时再切回整页</p>
        </div>
        <div class="w-60">
          <Select v-model="config.fullPageScopeMode">
            <SelectTrigger class="w-full rounded-xl">
              <SelectValue placeholder="翻译范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="smart">智能主内容</SelectItem>
              <SelectItem value="page">整页扫描</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div>
            <label class="text-sm font-medium leading-none block mb-1">译文样式</label>
            <p class="text-xs text-muted-foreground">用于页面注入译文的外观</p>
          </div>
          <div class="w-60">
            <Select v-model="styleSelection">
              <SelectTrigger class="w-full rounded-xl">
                <SelectValue placeholder="选择样式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in (config as any).targetStylePresets || []" :key="p.name" :value="p.name">
                  <span class="inline-flex items-center gap-2">
                    {{ p.description || p.name }}
                  </span>
                </SelectItem>
                <SelectItem value="__custom__">自定义（编辑 CSS）</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div v-if="styleSelection === '__custom__'" class="space-y-2">
          <Textarea v-model="customCss" class="min-h-36 rounded-xl"
            placeholder=".ifocal-target-inline-wrapper.ifocal-target-style-custom .ifocal-target-inner,&#10;.ifocal-target-block-wrapper.ifocal-target-style-custom .ifocal-target-inner{ /* 自定义样式 */ }" />
          <div class="flex items-center gap-2">
            <Button class="bg-primary text-primary-foreground flex items-center gap-1 rounded-xl"
              @click="saveStyleOnly">保存样式</Button>
          </div>
        </div>
        <div class="border p-3 rounded-xl">
          <div class="text-base">
            <div>I wasted time, and now doth time waste me.</div>
            <div>
              <font class="notranslate ifocal-target-wrapper">
                <font :class="`notranslate ifocal-target-inline-wrapper ${activeStyleName}`">
                  <font class="notranslate ifocal-target-inner">我荒废了时间，时间便把我荒废。</font>
                </font>
              </font>
            </div>
          </div>
        </div>
      </div>
      <div class="space-y-4"></div>
      <div>
        <Button class="bg-primary text-primary-foreground flex items-center gap-1 rounded-xl"
          @click="() => { saveModels(); saveBasics(); }">
          <Icon :icon="iconOfAction('save')" width="16" /> 保存设置
        </Button>
      </div>
    </div>
  </section>
</template>
