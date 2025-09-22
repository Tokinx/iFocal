<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useChannels } from '@/options/composables/useChannels';
import { promptTemplates, defaultTemplates, initTemplates, saveTemplates as saveTpls, resetTemplates as resetTpls } from '@/options/composables/useTemplates';
import { useToast } from '@/options/composables/useToast';

type ModelPair = { channel: string; model: string } | null;

const nav = ref<'assistant' | 'channels' | 'models' | 'keys' | 'others' | 'about'>('channels');

const { channels, modelPairs, addForm, addChannel, testModel, initTestModels, editingName, editForm, openEdit, cancelEdit, saveEdit, removeChannel } = useChannels();
const toast = useToast();

const defaultModel = ref<ModelPair>(null);
const translateModel = ref<ModelPair>(null);
const activeModel = ref<ModelPair>(null);
const autoPasteGlobalAssistant = ref<boolean>(false);
const translateTargetLang = ref<string>('zh-CN');
const actionKey = ref<string>('Alt');
const displayMode = ref<'insert' | 'overlay'>('insert');
const wrapperStyle = ref<string>('');

const defaultModelValue = ref('');
const translateModelValue = ref('');
watch(defaultModel, (val) => { defaultModelValue.value = joinPair(val); }, { immediate: true });
watch(translateModel, (val) => { translateModelValue.value = joinPair(val); }, { immediate: true });

function joinPair(pair: ModelPair) { return pair && (pair as any).channel && (pair as any).model ? `${(pair as any).channel}|${(pair as any).model}` : ''; }
function parsePair(value: string): ModelPair { if (!value) return null; const [channel, model] = value.split('|'); if (!channel || !model) return null; return { channel, model }; }

async function loadAll() {
  await new Promise<void>((resolve) => {
    try {
      chrome.storage.sync.get(['channels','defaultModel','translateModel','autoPasteGlobalAssistant','translateTargetLang','actionKey','hoverKey','selectKey','displayMode','wrapperStyle','promptTemplates','activeModel'], (items:any) => {
        channels.value = Array.isArray(items.channels) ? items.channels : [];
        defaultModel.value = items.defaultModel || null;
        translateModel.value = items.translateModel || null;
        activeModel.value = items.activeModel || null;
        autoPasteGlobalAssistant.value = !!items.autoPasteGlobalAssistant;
        translateTargetLang.value = items.translateTargetLang || 'zh-CN';
        actionKey.value = items.actionKey || items.hoverKey || items.selectKey || 'Alt';
        displayMode.value = items.displayMode || 'insert';
        wrapperStyle.value = items.wrapperStyle || '';
        initTemplates(items.promptTemplates || {});
        initTestModels();
        resolve();
      });
    } catch { resolve(); }
  });
}

function saveModels() { const dm = parsePair(defaultModelValue.value); const tm = parsePair(translateModelValue.value); try { chrome.storage.sync.set({ defaultModel: dm, translateModel: tm }, () => toast.success('模型设置已保存')); } catch { toast.error('保存失败'); } }
function saveBasics() { try { const k = (actionKey.value || 'Alt').trim() || 'Alt'; const lang = (translateTargetLang.value || 'zh-CN').trim() || 'zh-CN'; if (!k) { toast.error('快捷键不能为空'); return; } chrome.storage.sync.set({ actionKey: k, hoverKey: k, selectKey: k, translateTargetLang: lang, displayMode: displayMode.value || 'insert', wrapperStyle: (wrapperStyle.value || '').trim() }, () => toast.success('基础设置已保存')); } catch { toast.error('保存失败'); } }

// 助手（流式输出）
const assistantDraft = ref('');
const assistantModelValue = ref('');
const assistantTask = ref<'translate'|'summarize'|'rewrite'|'polish'>('translate');
const assistantResult = ref('');
let assistantPort: chrome.runtime.Port | null = null;
watch(channels, () => { const prefer = joinPair(activeModel.value) || joinPair(defaultModel.value) || modelPairs.value[0]?.value || ''; if (prefer) assistantModelValue.value = prefer; }, { immediate: true, deep: true });
function startAssistantStream() { const text = assistantDraft.value.trim(); if (!text) return; if (assistantPort) { try { assistantPort.disconnect(); } catch {} assistantPort = null; } assistantResult.value = ''; const pair = parsePair(assistantModelValue.value); const msg:any = { type: 'start', task: assistantTask.value, text }; if (pair) { msg.channel = pair.channel; msg.model = pair.model; } try { const port = chrome.runtime.connect({ name: 'ai-stream' }); assistantPort = port; port.onMessage.addListener((m:any) => { if (m?.type === 'delta') assistantResult.value += String(m.text || ''); else if (m?.type === 'error') assistantResult.value += `\n[错误] ${m.error}`; }); try { port.onDisconnect.addListener(() => { try { const err = chrome.runtime.lastError; if (err) assistantResult.value += `\n[错误] ${err.message}`; } catch {} }); } catch {} port.postMessage(msg); } catch {} }
function onLangChange() { try { chrome.storage.sync.set({ translateTargetLang: translateTargetLang.value }); } catch {} if (assistantDraft.value.trim()) startAssistantStream(); }
watch(assistantModelValue, (val) => { const pair = parsePair(val); try { chrome.storage.sync.set({ activeModel: pair || null }); } catch {} });

// 切换自动粘贴开关时持久化
watch(autoPasteGlobalAssistant, (val) => { try { chrome.storage.sync.set({ autoPasteGlobalAssistant: !!val }); } catch {} });

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
</script>

<template>
  <div class="min-h-screen flex bg-background text-foreground">
    <!-- 左侧导航 -->
    <aside class="w-60 shrink-0 border-r bg-white">
      <div class="p-4 text-lg font-semibold">设置</div>
      <nav class="px-2 pb-4 space-y-1">
        <button
          v-for="item in [
            { id:'assistant', label:'助手' },
            { id:'channels', label:'通道' },
            { id:'models', label:'模型' },
            { id:'keys', label:'快捷键' },
            { id:'others', label:'其他' },
            { id:'about', label:'关于' }
          ]"
          :key="item.id"
          class="w-full text-left rounded-md px-3 py-2 text-sm hover:bg-secondary"
          :class="nav === (item.id as any) ? 'bg-secondary' : ''"
          @click="nav = item.id as any"
        >{{ item.label }}</button>
      </nav>
    </aside>

    <!-- 右侧内容 -->
    <main class="flex-1 p-6 space-y-6">
      <!-- 助手 -->
      <section v-if="nav==='assistant'" class="space-y-4">
        <header class="text-base font-semibold">快速助手</header>
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
              <Label class="mb-1 block">翻译目标</Label>
              <Select v-model="translateTargetLang" @update:modelValue="onLangChange">
                <SelectTrigger><SelectValue placeholder="语言" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">zh-CN</SelectItem>
                  <SelectItem value="en">en</SelectItem>
                  <SelectItem value="ja">ja</SelectItem>
                  <SelectItem value="ko">ko</SelectItem>
                  <SelectItem value="fr">fr</SelectItem>
                  <SelectItem value="es">es</SelectItem>
                  <SelectItem value="de">de</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea v-model="assistantDraft" class="min-h-28" placeholder="在此粘贴需要处理的文本..." />
          <div class="flex items-center gap-2">
            <Button class="bg-primary text-primary-foreground" @click="startAssistantStream">执行</Button>
          </div>
          <div class="rounded-md border bg-secondary/40 p-3 text-sm whitespace-pre-wrap min-h-12">{{ assistantResult }}</div>
        </div>
      </section>

      <!-- 通道 -->
      <section v-else-if="nav==='channels'" class="space-y-4">
        <header class="text-base font-semibold">管理通道</header>
        <div class="rounded-xl border bg-white p-4 space-y-3">
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
              <Input v-model="addForm.apiKey" placeholder="可留空（不更新）" />
            </div>
          </div>
          <div>
            <Label class="mb-1 block">Models（每行一个）</Label>
            <Textarea v-model="addForm.modelsText" class="min-h-28" placeholder="例如：&#10;gpt-4o-mini&#10;gpt-4o" />
          </div>
          <div class="flex gap-2">
            <Button class="bg-primary text-primary-foreground" @click="handleAddChannel">添加通道</Button>
          </div>
        </div>

        <div class="rounded-xl border bg-white p-4">
          <div v-if="!channels.length" class="text-sm text-muted-foreground">暂无通道，请先添加。</div>
          <div v-else class="space-y-2">
            <div v-for="ch in channels" :key="ch.name" class="rounded-lg border p-3 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm">
                  <div class="font-medium">{{ ch.name }}</div>
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
                  <Button variant="ghost" @click="handleTestChannel(ch.name)">测试</Button>
                  <Button variant="ghost" @click="openEdit(ch)">编辑</Button>
                  <Button variant="ghost" class="text-red-600" @click="removeChannel(ch.name)">删除</Button>
                </div>
              </div>

              <div v-if="editingName===ch.name" class="rounded-md border bg-secondary/30 p-3 space-y-3">
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
                  <Button class="bg-primary text-primary-foreground" @click="handleSaveEdit(ch.name)">保存</Button>
                  <Button variant="ghost" @click="cancelEdit">取消</Button>
                  <span class="text-xs text-muted-foreground">{{ editStatus }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 模型 -->
      <section v-else-if="nav==='models'" class="space-y-4">
        <header class="text-base font-semibold">默认与翻译模型</header>
        <div class="rounded-xl border bg-white p-4 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label class="mb-1 block">默认模型</Label>
              <Select v-model="defaultModelValue">
                <SelectTrigger><SelectValue placeholder="未设置" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">（未设置）</SelectItem>
                  <SelectItem v-for="p in modelPairs" :key="p.value" :value="p.value">{{ p.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label class="mb-1 block">翻译模型</Label>
              <Select v-model="translateModelValue">
                <SelectTrigger><SelectValue placeholder="未设置" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">（未设置）</SelectItem>
                  <SelectItem v-for="p in modelPairs" :key="p.value" :value="p.value">{{ p.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Button class="bg-primary text-primary-foreground" @click="saveModels">保存</Button>
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

      <!-- 快捷键 -->
      <section v-else-if="nav==='keys'" class="space-y-4">
        <header class="text-base font-semibold">页面快捷键</header>
        <div class="rounded-xl border bg-white p-4 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label class="mb-1 block">触发键（如 Alt）</Label>
              <Input v-model="actionKey" placeholder="如 Alt" />
            </div>
          </div>
          <div>
            <Button class="bg-primary text-primary-foreground" @click="saveBasics">保存</Button>
            <p class="mt-2 text-xs text-muted-foreground">全局快捷键需在 chrome://extensions/shortcuts 配置。</p>
          </div>
        </div>
      </section>

      <!-- 其他 -->
      <section v-else-if="nav==='others'" class="space-y-4">
        <header class="text-base font-semibold">其他</header>
        <div class="rounded-xl border bg-white p-4 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label class="mb-1 block">翻译目标语言</Label>
              <Select v-model="translateTargetLang">
                <SelectTrigger><SelectValue placeholder="语言" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">zh-CN</SelectItem>
                  <SelectItem value="en">en</SelectItem>
                  <SelectItem value="ja">ja</SelectItem>
                  <SelectItem value="ko">ko</SelectItem>
                  <SelectItem value="fr">fr</SelectItem>
                  <SelectItem value="es">es</SelectItem>
                  <SelectItem value="de">de</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label class="mb-1 block">结果显示方式</Label>
              <Select v-model="displayMode">
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
            <Textarea v-model="wrapperStyle" class="min-h-28" placeholder="background-image: linear-gradient(to right, rgba(71,71,71,.5) 30%, rgba(255,255,255,0) 0%);&#10;background-position: bottom;" />
          </div>
          <div>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" v-model="autoPasteGlobalAssistant" class="h-4 w-4" />
              全局助手：自动粘贴剪贴板
            </label>
            <p class="mt-2 text-xs text-muted-foreground">勾选/取消即自动保存。</p>
          </div>
          <div>
            <Button class="bg-primary text-primary-foreground" @click="saveBasics">保存其他设置</Button>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section v-else-if="nav==='about'" class="space-y-4">
        <header class="text-base font-semibold">关于</header>
        <div class="rounded-xl border bg-white p-4 space-y-3 text-sm">
          <div>版本：{{ (chrome?.runtime?.getManifest?.() as any)?.version || '-' }}</div>
          <div class="flex items-center gap-2">
            <Button class="bg-primary text-primary-foreground" @click="onExport">导出设置</Button>
            <Button variant="ghost" @click="triggerImport">导入设置</Button>
            <input ref="importerRef" type="file" accept="application/json" class="hidden" @change="onImportChange" />
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
