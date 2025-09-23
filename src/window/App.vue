<template>
  <div class="flex h-screen w-full flex-col bg-background text-foreground">
    <main class="flex-1 grid grid-rows-[1fr_auto_1.25fr] gap-3 px-4 py-3">
      <Textarea
        v-model="state.text"
        class="min-h-[120px]"
        placeholder="在此输入要处理的文本...（空白将不会执行）"
        @keydown.enter.exact.prevent="run()"
      />

      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="selectedPairKey" class="w-56" @update:modelValue="onModelChange">
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

        <Select v-model="state.task" class="w-36">
          <SelectTrigger>
            <SelectValue placeholder="选择任务" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="translate">翻译</SelectItem>
            <SelectItem value="summarize">总结</SelectItem>
            <SelectItem value="rewrite">改写</SelectItem>
            <SelectItem value="polish">润色</SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="state.targetLang" class="w-40" @update:modelValue="onLangChange">
          <SelectTrigger>
            <SelectValue placeholder="选择语言" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="lang in languages" :key="lang.value" :value="lang.value">{{ lang.label }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <section class="rounded-xl border bg-popover/50 p-3 text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto">
        <template v-if="errorText">
          <div class="text-red-600">{{ errorText }}</div>
        </template>
        <template v-else-if="result">
          {{ result }}
        </template>
        <template v-else>
          <div class="text-muted-foreground">结果将在此显示。按 Enter 运行，或切换下拉重新生成。</div>
        </template>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

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

const canRun = computed(() => !!state.text.trim());
const currentModelName = computed(() => {
  const cur = modelPairs.value.find(p => p.key === selectedPairKey.value);
  return cur ? cur.model : '';
});

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
  const cfg: any = await new Promise(resolve => chrome.storage.sync.get(['channels', 'defaultModel', 'activeModel', 'translateTargetLang'], resolve));
  const channels: Channel[] = Array.isArray(cfg.channels) ? cfg.channels : [];
  const pairs = channels.flatMap(ch => (ch.models || []).map(m => ({ key: keyOf({ channel: ch.name, model: m }), channel: ch.name, model: m })));
  modelPairs.value = pairs;
  state.targetLang = cfg.translateTargetLang || 'zh-CN';

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

function onLangChange() {
  const lang = state.targetLang || 'zh-CN';
  chrome.storage.sync.set({ translateTargetLang: lang });
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

const languages = [
  { value: 'zh-CN', label: 'Chinese (zh-CN)' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' }
];
</script>
