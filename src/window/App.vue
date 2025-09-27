<template>
  <div class="flex h-screen w-full flex-col bg-background text-foreground">
    <main class="h-screen flex-1 flex flex-col gap-2 p-2">
      <div class="flex items-center gap-2">
        <Select v-model="selectedPairKey" class="w-full" @update:modelValue="onModelChange">
          <SelectTrigger>
            <span class="truncate">{{ currentModelName || '选择模型' }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="p in modelPairs" :key="p.key" :value="p.key">
              <div class="flex flex-col">
                <span>{{ p.model }}</span>
                <span class="text-xs text-muted-foreground">{{ p.channel }}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Textarea
        v-model="state.text"
        rows="4"
        placeholder="在此输入要处理的文本...（空白将不会执行）"
        @keydown.enter.exact.prevent="run()"
      />
      <div class="flex items-center gap-2">
        <Select v-model="state.task" class="w-full">
          <SelectTrigger>
            <SelectValue placeholder="选择任务" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="task in SUPPORTED_TASKS" :key="task.value" :value="task.value">{{ task.label }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="state.targetLang" @update:modelValue="onLangChange">
          <SelectTrigger>
            <SelectValue placeholder="选择语言" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">{{ lang.label }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <section class="flex-1 rounded-xl border bg-popover/50 p-3 text-sm leading-relaxed overflow-y-auto prose prose-sm max-w-none">
        <template v-if="errorText">
          <div class="text-red-600">{{ errorText }}</div>
        </template>
        <template v-else-if="result">
          <div v-html="renderedResult"></div>
        </template>
        <!-- <template v-else>
          <div class="text-muted-foreground">结果将在此显示。按 Enter 运行，或切换下拉重新生成。</div>
        </template> -->
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { marked } from 'marked';
import { SUPPORTED_LANGUAGES, SUPPORTED_TASKS, loadConfig } from '@/shared/config';

type Pair = { channel: string; model: string };
type Channel = { name: string; type: string; apiKey?: string; apiUrl?: string; models?: string[] };

const modelPairs = ref<{ key: string; channel: string; model: string }[]>([]);
const selectedPairKey = ref<string>('');
const sending = ref(false);
const result = ref('');
const errorText = ref('');
let port: chrome.runtime.Port | null = null;

const state = reactive({
  text: '',
  task: 'translate' as 'translate' | 'summarize' | 'rewrite' | 'polish',
  targetLang: 'zh-CN'
});

const currentModelName = computed(() => {
  const cur = modelPairs.value.find(p => p.key === selectedPairKey.value);
  return cur ? cur.model : '';
});
const renderedResult = computed(() => marked(result.value));

function keyOf(pair: Pair) {
  return `${pair.channel}:${pair.model}`;
}

function parseKey(key: string): Pair | null {
  if (!key) return null;
  const [channel, model] = key.split(':');
  if (!channel || !model) return null;
  return { channel, model };
}

async function loadModels() {
  // 加载全局配置
  const globalConfig = await loadConfig();
  
  const cfg: any = await new Promise(resolve => chrome.storage.sync.get(['channels', 'defaultModel', 'activeModel'], resolve));
  const channels: Channel[] = Array.isArray(cfg.channels) ? cfg.channels : [];
  const pairs = channels.flatMap(ch => (ch.models || []).map(m => ({ key: keyOf({ channel: ch.name, model: m }), channel: ch.name, model: m })));
  modelPairs.value = pairs;
  state.targetLang = globalConfig.translateTargetLang;
  state.task = globalConfig.defaultTask;

  // prefer activeModel (object), then defaultModel (object), else first
  const prefer: Pair | null = cfg.activeModel || cfg.defaultModel || null;
  if (prefer) {
    const k = keyOf(prefer);
    if (pairs.some(p => p.key === k)) selectedPairKey.value = k;
  }
  if (!selectedPairKey.value && pairs.length) selectedPairKey.value = pairs[0].key;
}

function disconnectPort() {
  if (port) {
    try { port.disconnect(); } catch {}
  }
  port = null;
}

function run() {
  const text = state.text.trim();
  if (!text || sending.value) return;
  const pair = parseKey(selectedPairKey.value);
  result.value = '';
  errorText.value = '';
  sending.value = true;
  disconnectPort();
  const p = chrome.runtime.connect({ name: 'ai-stream' });
  port = p;
  p.onMessage.addListener((m: any) => {
    if (m?.type === 'delta') result.value += String(m.text || '');
    else if (m?.type === 'done') sending.value = false;
    else if (m?.type === 'error') { sending.value = false; errorText.value = `错误：${m.error}`; }
  });
  try { p.onDisconnect.addListener(() => { try { const err = chrome.runtime.lastError; if (err) { sending.value = false; result.value += `\n[错误] ${err.message}`; } } catch {} }); } catch {}
  const msg: any = { type: 'start', task: state.task, text, targetLang: state.targetLang };
  if (pair) { msg.channel = pair.channel; msg.model = pair.model; }
  p.postMessage(msg);
}

function onModelChange() {
  const pair = parseKey(selectedPairKey.value);
  chrome.storage.sync.set({ activeModel: pair || null });
  if (state.text.trim()) run();
}

async function onLangChange() {
  const lang = state.targetLang || 'zh-CN';
  try {
    const { saveConfig } = await import('@/shared/config');
    await saveConfig({ translateTargetLang: lang });
  } catch (error) {
    console.error('保存语言设置失败:', error);
    // 回退到直接使用 chrome.storage
    chrome.storage.sync.set({ translateTargetLang: lang });
  }
  if (state.text.trim()) run();
}

onMounted(async () => {
  await loadModels();
  // react to language change from settings: rerun if text exists
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.translateTargetLang) {
        state.targetLang = changes.translateTargetLang.newValue || 'zh-CN';
        if (state.text.trim()) run();
      }
    });
  } catch {}

  // auto paste clipboard and run if enabled
  try {
    const { autoPasteGlobalAssistant } = await new Promise<any>(resolve => chrome.storage.sync.get(['autoPasteGlobalAssistant'], resolve));
    if (autoPasteGlobalAssistant) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) { state.text = text; run(); }
      } catch (e) { console.warn('[FloatingCopilot] clipboard read failed', e); }
    }
  } catch {}
});

watch(() => state.task, () => { if (state.text.trim()) run(); });

</script>
