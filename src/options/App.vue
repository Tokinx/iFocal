<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { iconOfNav, iconOfChannelType, iconOfAction } from '@/shared/icons';
import { useChannels } from '@/options/composables/useChannels';
import { promptTemplates, defaultTemplates, initTemplates, saveTemplates as saveTpls, resetTemplates as resetTpls } from '@/options/composables/useTemplates';
import { useToast } from '@/options/composables/useToast';
import { SUPPORTED_LANGUAGES, SUPPORTED_TASKS, DEFAULT_CONFIG, loadConfig, saveConfig, CONFIG_KEYS } from '@/shared/config';

type ModelPair = { channel: string; model: string } | null;

const nav = ref<'channels' | 'settings' | 'debug' | 'keys' | 'about'>('channels');

const { channels, modelPairs, addForm, addChannel, testModel, initTestModels, editingName, editForm, openEdit, cancelEdit, saveEdit, removeChannel, restoreChannelsSnapshot } = useChannels();
const toast = useToast();

const defaultModel = ref<ModelPair>(null);
const translateModel = ref<ModelPair>(null);
const activeModel = ref<ModelPair>(null);
// 使用全局配置
const config = ref({ ...DEFAULT_CONFIG });

const defaultModelValue = ref('');
const translateModelValue = ref('');
// 关于页版本号：优先 chrome.runtime.getManifest()，回退到读取 manifest.json
const version = ref('-');
watch(defaultModel, (val) => { defaultModelValue.value = joinPair(val); }, { immediate: true });
watch(translateModel, (val) => { translateModelValue.value = joinPair(val); }, { immediate: true });

function joinPair(pair: ModelPair) { return pair && (pair as any).channel && (pair as any).model ? `${(pair as any).channel}|${(pair as any).model}` : ''; }
function parsePair(value: string): ModelPair { if (!value || value === '__unset__') return null; const [channel, model] = value.split('|'); if (!channel || !model) return null; return { channel, model }; }

async function loadAll() {
  try {
    // 加载全局配置
    const globalConfig = await loadConfig();
    config.value = { ...globalConfig };
    
    // 加载其他设置
    await new Promise<void>((resolve) => {
      try {
        chrome.storage.sync.get(['channels','defaultModel','translateModel','promptTemplates','activeModel'], (items:any) => {
          channels.value = Array.isArray(items.channels) ? items.channels : [];
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
    config.value.wrapperStyle = (config.value.wrapperStyle || '').trim();
    
    // 保存配置
    await saveConfig({
      actionKey: k,
      hoverKey: k,
      selectKey: k,
      translateTargetLang: lang,
      displayMode: config.value.displayMode,
      wrapperStyle: config.value.wrapperStyle
    });
    
    toast.success('基础设置已保存');
  } catch {
    toast.error('保存失败');
  }
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

// 助手（流式输出）
const assistantDraft = ref('');
const assistantModelValue = ref('');
const assistantTask = ref<'translate'|'summarize'|'rewrite'|'polish'>('translate');
const assistantResult = ref('');
let assistantPort: chrome.runtime.Port | null = null;
watch(channels, () => { const prefer = joinPair(activeModel.value) || joinPair(defaultModel.value) || modelPairs.value[0]?.value || ''; if (prefer) assistantModelValue.value = prefer; }, { immediate: true, deep: true });
// 保存侧边栏历史会话保存数量
watch(() => config.value.sidebarHistoryLimit, async (v) => {
  try {
    config.value.sidebarHistoryLimit = Number(v || 10) || 10;
    await saveConfig({ sidebarHistoryLimit: config.value.sidebarHistoryLimit });
  } catch {}
});
function startAssistantStream() { const text = assistantDraft.value.trim(); if (!text) return; if (assistantPort) { try { assistantPort.disconnect(); } catch {} assistantPort = null; } assistantResult.value = ''; const pair = parsePair(assistantModelValue.value); const msg:any = { type: 'start', task: assistantTask.value, text }; if (pair) { msg.channel = pair.channel; msg.model = pair.model; } try { const port = chrome.runtime.connect({ name: 'ai-stream' }); assistantPort = port; port.onMessage.addListener((m:any) => { if (m?.type === 'delta') assistantResult.value += String(m.text || ''); else if (m?.type === 'error') assistantResult.value += `\n[错误] ${m.error}`; }); try { port.onDisconnect.addListener(() => { try { const err = chrome.runtime.lastError; if (err) assistantResult.value += `\n[错误] ${err.message}`; } catch {} }); } catch {} port.postMessage(msg); } catch {} }
async function onLangChange() {
  try {
    await saveConfig({ translateTargetLang: config.value.translateTargetLang });
  } catch {}
  if (assistantDraft.value.trim()) startAssistantStream();
}
watch(assistantModelValue, (val) => { const pair = parsePair(val); try { chrome.storage.sync.set({ activeModel: pair || null }); } catch {} });

// 切换自动粘贴开关时持久化
watch(() => config.value.autoPasteGlobalAssistant, async (val) => {
  try {
    config.value.autoPasteGlobalAssistant = !!val;
    await saveConfig({ autoPasteGlobalAssistant: config.value.autoPasteGlobalAssistant });
  } catch {}
});

// 导入导出
const importerRef = ref<HTMLInputElement|null>(null);
const STORAGE_KEYS = ['channels','defaultModel','translateModel','activeModel','actionKey','hoverKey','selectKey','translateTargetLang','displayMode','wrapperStyle','promptTemplates','autoPasteGlobalAssistant'];
function onExport() { try { chrome.storage.sync.get(STORAGE_KEYS, (items:any) => { try { const payload = JSON.stringify(items, null, 2); const blob = new Blob([payload], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'floatingcopilot-settings.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast.success('已导出设置'); } catch {} }); } catch {} }
function triggerImport() { importerRef.value?.click(); }
function onImportChange(e: Event) { const input = e.target as HTMLInputElement; const file = input && input.files && input.files[0]; if (!file) return; try { const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(String(reader.result || '{}')); const toSet:any = {}; STORAGE_KEYS.forEach(k => { if (k in (data || {})) toSet[k] = (data as any)[k]; }); chrome.storage.sync.set(toSet, () => { toast.success('导入成功，正在刷新'); window.location.reload(); }); } catch { toast.error('导入失败：JSON 解析错误'); } }; reader.readAsText(file); } catch {} }

// 表单交互包装：校验 + Toast
function handleAddChannel() { try { addChannel(); toast.success('已添加渠道'); } catch (e:any) { toast.error(String(e?.message || e || '保存失败')); } }
const editStatus = ref('');
function handleSaveEdit(original: string) { editStatus.value = ''; try { saveEdit(original, () => toast.success('渠道已保存')); } catch (e:any) { editStatus.value = String(e?.message || e || '保存失败'); toast.error(editStatus.value); } }
function handleTestChannel(name: string) { const model = testModel[name] || undefined; try { chrome.runtime.sendMessage({ action:'testChannel', channel:name, model }, (resp:any) => { if (!resp) { toast.error('测试失败：无响应'); return; } if (resp.ok) toast.success('测试成功'); else toast.error(`测试失败：${resp.error || '未知错误'}`); }); } catch { toast.error('测试调用失败'); } }

onMounted(loadAll);

onMounted(async () => {
  try {
    const v = (chrome as any)?.runtime?.getManifest?.()?.version;
    if (v) { version.value = v; return; }
  } catch {}
  try {
    const url = (chrome as any)?.runtime?.getURL?.('manifest.json');
    if (url) {
      const res = await fetch(url);
      if (res.ok) { const m = await res.json(); version.value = String(m?.version || '-'); }
    }
  } catch {}
});

// 统一从 shared/icons 获取图标

// 单页滚动定位
function scrollToSection(id: 'channels'|'settings'|'debug'|'keys'|'about') {
  try {
    const el = document.getElementById(`opt-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch {}
}

// 添加渠道使用 Dialog
const showAddChannel = ref(false);
function openAddChannel() { showAddChannel.value = true; }
function closeAddChannel() { showAddChannel.value = false; }
function handleAddChannelDialog() {
  try { handleAddChannel(); closeAddChannel(); } catch (e:any) { /* 内部已 toast */ }
}
</script>

<template>
  <div class="min-h-screen flex bg-background text-foreground mx-auto" style="max-width: 80rem;">
    <!-- 左侧导航 -->
    <aside class="w-60 shrink-0 border-r bg-white">
      <div class="p-4 text-lg font-semibold">设置</div>
      <nav class="px-2 pb-4 space-y-1">
        <button
          v-for="item in [
            { id:'channels', label:'渠道' },
            { id:'settings', label:'设置' },
            { id:'debug', label:'调试' },
            { id:'keys', label:'快捷键' },
            { id:'about', label:'关于' }
          ] as Array<{id:'channels'|'settings'|'debug'|'keys'|'about';label:string}>"
          :key="item.id"
          class="w-full text-left rounded-md px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2"
          :class="nav === (item.id as any) ? 'bg-secondary' : ''"
          @click="nav = item.id as any; scrollToSection(item.id)"
        >
          <Icon :icon="iconOfNav(item.id)" width="16" class="opacity-80" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <!-- 右侧内容 -->
    <main class="flex-1 p-6 space-y-6">
      <!-- 渠道 -->
      <section :id="'opt-channels'" class="space-y-4">
        <header class="flex items-center text-base font-semibold">
          <div class="shrink-0">管理渠道</div>
          <div class="w-full"></div>
          <Button @click="openAddChannel">
            <Icon icon="proicons:box-add" width="16" />
            添加渠道
          </Button>
        </header>


          <div v-if="!channels.length" class="text-sm text-muted-foreground">暂无渠道，请先添加。</div>
          <div v-else class="space-y-2">
            <div v-for="ch in channels" :key="ch.name" class="rounded-lg border p-3 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm">
                  <div class="font-medium inline-flex items-center gap-2">
                    <Icon :icon="iconOfChannelType(ch.type)" width="16" />
                    {{ ch.name }}
                  </div>
                  <div class="text-muted-foreground">{{ ch.type }} · {{ ch.apiUrl || '-' }}</div>
                  <div class="text-muted-foreground">{{ (ch.models || []).join(', ') }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-48">
                    <Select v-model="testModel[ch.name]">
                      <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="m in (ch.models || [])" :key="m" :value="m">{{ m }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="outline" class="flex items-center gap-1" @click="handleTestChannel(ch.name)" title="测试">
                    <Icon icon="proicons:bug" width="16" />
                  </Button>
                  <Button variant="ghost" size="outline" class="flex items-center gap-1" @click="openEdit(ch)" title="编辑">
                    <Icon icon="proicons:pencil" width="16" />
                  </Button>
                  <Button variant="ghost" size="outline" class="flex items-center gap-1 text-red-600" @click="confirmRemoveChannel(ch)" title="删除">
                    <Icon :icon="iconOfAction('delete')" width="16" />
                  </Button>
                </div>
              </div>

              <div v-if="editingName===ch.name" class="space-y-3">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label class="mb-1 block">类型</Label>
                    <Select v-model="editForm.type">
                      <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                        <SelectItem value="openai-compatible">OpenAI 兼容</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label class="mb-1 block">名称</Label>
                    <Input v-model="editForm.name" placeholder="如 my-openai" />
                  </div>
                  <div>
                    <Label class="mb-1 block">API URL</Label>
                    <Input v-model="editForm.apiUrl" placeholder="留空使用默认" />
                  </div>
                  <div>
                    <Label class="mb-1 block">API KEY</Label>
                    <Input v-model="editForm.apiKey" placeholder="留空表示不修改" />
                  </div>
                </div>
                <div>
                  <Label class="mb-1 block">Models（每行一个）</Label>
                  <Textarea v-model="editForm.modelsText" class="min-h-28" />
                </div>
                <div class="flex items-center gap-2">
                  <Button class="bg-primary text-primary-foreground flex items-center gap-1" @click="handleSaveEdit(ch.name)">
                    <Icon :icon="iconOfAction('save')" width="16" /> 保存
                  </Button>
                  <Button variant="ghost" @click="cancelEdit">取消</Button>
                  <span class="text-xs text-muted-foreground">{{ editStatus }}</span>
                </div>
              </div>
            </div>
          </div>
      </section>

      <!-- 设置（包含：默认/翻译模型、Prompt 模板、通用设置、历史会话上限） -->
      <section :id="'opt-settings'" class="space-y-4">
        <header class="text-base font-semibold">设置</header>
        <div class="rounded-xl border bg-white p-4 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label class="mb-1 block">默认模型</Label>
              <Select v-model="defaultModelValue">
                <SelectTrigger><SelectValue placeholder="未设置" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">（未设置）</SelectItem>
                  <SelectItem v-for="p in modelPairs" :key="p.value" :value="p.value">
                    <span class="inline-flex items-center gap-2">
                      <Icon :icon="iconOfChannelType(parsePair(p.value)?.channel ? (channels.find(c=>c.name===parsePair(p.value)?.channel)?.type||'') : '')" width="14" />
                      {{ p.label }}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label class="mb-1 block">翻译模型</Label>
              <Select v-model="translateModelValue">
                <SelectTrigger><SelectValue placeholder="未设置" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">（未设置）</SelectItem>
                  <SelectItem v-for="p in modelPairs" :key="p.value" :value="p.value">
                    <span class="inline-flex items-center gap-2">
                      <Icon :icon="iconOfChannelType(parsePair(p.value)?.channel ? (channels.find(c=>c.name===parsePair(p.value)?.channel)?.type||'') : '')" width="14" />
                      {{ p.label }}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label class="mb-1 block">侧边栏历史会话保存数量</Label>
              <Input type="number" v-model.number="config.sidebarHistoryLimit" min="1" max="100" placeholder="10" />
            </div>
            <div>
              <Label class="mb-1 block">默认目标语言</Label>
              <Select v-model="config.translateTargetLang">
                <SelectTrigger><SelectValue placeholder="语言" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">{{ lang.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label class="mb-1 block">结果显示方式</Label>
              <Select v-model="config.displayMode">
                <SelectTrigger><SelectValue placeholder="显示方式" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="insert">插入原文下方</SelectItem>
                  <SelectItem value="overlay">覆盖原文</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label class="mb-1 block">包裹样式（floating-copilot-target-wrapper）</Label>
            <Textarea v-model="config.wrapperStyle" class="min-h-28" placeholder="background-image: linear-gradient(to right, rgba(71,71,71,.5) 30%, rgba(255,255,255,0) 0%);&#10;background-position: bottom;" />
          </div>
          <div>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" v-model="config.autoPasteGlobalAssistant" class="h-4 w-4" />
              全局助手：自动粘贴剪贴板
            </label>
            <p class="mt-2 text-xs text-muted-foreground">勾选/取消即自动保存。</p>
          </div>
          <div>
            <Button class="bg-primary text-primary-foreground flex items-center gap-1" @click="() => { saveModels(); saveBasics(); }">
              <Icon :icon="iconOfAction('save')" width="16" /> 保存设置
            </Button>
          </div>
        </div>

        <header class="text-base font-semibold">Prompt 模板</header>
        <div class="rounded-xl border bg-white p-4 space-y-4">
          <p class="text-xs text-muted-foreground">可使用占位符 <code v-pre>{{targetLang}}</code> 与 <code v-pre>{{text}}</code>。</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label class="mb-1 block">翻译模板</Label>
              <Textarea v-model="promptTemplates.translate" class="min-h-28" :placeholder="defaultTemplates.translate" />
            </div>
            <div>
              <Label class="mb-1 block">总结模板</Label>
              <Textarea v-model="promptTemplates.summarize" class="min-h-28" :placeholder="defaultTemplates.summarize" />
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
            <Button class="bg-primary text-primary-foreground" @click="() => { saveTpls(); toast.success('模板已保存'); }">保存模板</Button>
            <Button variant="ghost" @click="() => { resetTpls(); toast.info('已恢复默认模板'); }">重置默认</Button>
          </div>
        </div>
      </section>

      <!-- 调试（原助手） -->
      <section :id="'opt-debug'" class="space-y-4">
        <header class="text-base font-semibold">调试</header>
        <div class="rounded-xl border bg-white p-4 space-y-3">
          <div class="flex flex-wrap gap-2">
            <div class="w-56">
              <Label class="mb-1 block">模型</Label>
              <Select v-model="assistantModelValue">
                <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="p in modelPairs" :key="p.value" :value="p.value">{{ p.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="w-40">
              <Label class="mb-1 block">任务</Label>
              <Select v-model="assistantTask">
                <SelectTrigger><SelectValue placeholder="任务" /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder="语言" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">{{ lang.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea v-model="assistantDraft" class="min-h-28" placeholder="在此粘贴需要处理的文本..." />
          <div class="flex items-center gap-2">
            <Button class="bg-primary text-primary-foreground flex items-center gap-1" @click="startAssistantStream">
              <Icon icon="proicons:bolt" width="16" />
              执行
            </Button>
          </div>
          <div class="rounded-md border bg-secondary/40 p-3 text-sm whitespace-pre-wrap min-h-12">{{ assistantResult }}</div>
        </div>
      </section>
      <!-- 快捷键 -->
      <section :id="'opt-keys'" class="space-y-4">
        <header class="text-base font-semibold">页面快捷键</header>
        <div class="rounded-xl border bg-white p-4 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label class="mb-1 block">触发键（如 Alt）</Label>
              <Input v-model="config.actionKey" placeholder="如 Alt" />
            </div>
          </div>
          <div>
            <Button class="bg-primary text-primary-foreground flex items-center gap-1" @click="saveBasics">
              <Icon :icon="iconOfAction('save')" width="16" /> 保存
            </Button>
            <p class="mt-2 text-xs text-muted-foreground">全局快捷键需在 chrome://extensions/shortcuts 配置。</p>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section :id="'opt-about'" class="space-y-4">
        <header class="text-base font-semibold">关于</header>
        <div class="rounded-xl border bg-white p-4 space-y-3 text-sm">
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
  <Dialog :open="showAddChannel" @update:open="(v:boolean)=>showAddChannel=v">
    <DialogScrollContent class="max-h-[80vh] w-[560px]">
      <div class="space-y-4">
        <div class="text-base font-semibold">添加渠道</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label class="mb-1 block">类型</Label>
            <Select v-model="addForm.type">
              <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="openai-compatible">OpenAI 兼容</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label class="mb-1 block">名称</Label>
            <Input v-model="addForm.name" placeholder="如 my-openai" />
          </div>
          <div>
            <Label class="mb-1 block">API URL</Label>
            <Input v-model="addForm.apiUrl" placeholder="留空使用默认" />
          </div>
          <div>
            <Label class="mb-1 block">API KEY</Label>
            <Input v-model="addForm.apiKey" placeholder="可留空" />
          </div>
        </div>
        <div>
          <Label class="mb-1 block">Models（每行一个）</Label>
          <Textarea v-model="addForm.modelsText" class="min-h-28" placeholder="例如：&#10;gpt-4o-mini&#10;gpt-4o" />
        </div>
        <div class="flex items-center gap-2">
          <Button class="bg-primary text-primary-foreground" @click="handleAddChannelDialog">添加</Button>
          <Button variant="ghost" @click="closeAddChannel">取消</Button>
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
