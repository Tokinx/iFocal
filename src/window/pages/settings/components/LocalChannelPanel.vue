<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '@/components/ui/icon/Icon.vue';
import type { Channel } from '@/window/pages/settings/composables/useChannels';
import {
  LOCAL_DEFAULT_CHANNEL_NAME,
  LOCAL_DEFAULT_MODEL_SPEC,
  PORT_NAME_LOCAL_LLM_DOWNLOAD,
  type LocalLlmDownloadOutbound,
  type LocalLlmDownloadProgress,
  type LocalLlmProbeResult,
} from '@/shared/local-llm-types';

const props = defineProps<{ channel: Channel; index: number; enabled: boolean }>();
const emit = defineEmits<{
  (e: 'save'): void;
  (e: 'update:enabled', value: boolean): void;
}>();

const checking = ref(false);
const probeResult = ref<LocalLlmProbeResult | null>(null);
const errorText = ref('');

const DEFAULT_PARAMS = { temperature: 0.8, topK: 3 } as const;

const advancedOpen = ref(false);
const temperature = ref<number>(typeof props.channel.params?.temperature === 'number' ? props.channel.params.temperature : DEFAULT_PARAMS.temperature);
const topK = ref<number>(typeof props.channel.params?.topK === 'number' ? props.channel.params.topK : DEFAULT_PARAMS.topK);
const defaultTemperatureLabel = computed(() => DEFAULT_PARAMS.temperature.toFixed(1));
const defaultTopKLabel = computed(() => String(DEFAULT_PARAMS.topK));

// 保证本地渠道字段始终固定：name / providerId / models 不可由用户改动
watch(() => props.channel, (ch: Channel) => {
  if (ch.name !== LOCAL_DEFAULT_CHANNEL_NAME) ch.name = LOCAL_DEFAULT_CHANNEL_NAME;
  if ((ch as any).providerId !== 'gemini-nano') (ch as any).providerId = 'gemini-nano';
  if (!Array.isArray(ch.models) || ch.models.length !== 1 || ch.models[0] !== LOCAL_DEFAULT_MODEL_SPEC) {
    ch.models = [LOCAL_DEFAULT_MODEL_SPEC];
  }
}, { immediate: true });

watch([temperature, topK, advancedOpen], () => {
  if (!props.channel.params) (props.channel as any).params = {};
  if (advancedOpen.value) {
    props.channel.params!.temperature = Number(temperature.value);
    props.channel.params!.topK = Math.max(1, Math.floor(Number(topK.value)));
  } else {
    delete props.channel.params!.temperature;
    delete props.channel.params!.topK;
  }
});

watch(() => props.channel.params, (p) => {
  temperature.value = typeof p?.temperature === 'number' ? p.temperature : DEFAULT_PARAMS.temperature;
  topK.value = typeof p?.topK === 'number' ? p.topK : DEFAULT_PARAMS.topK;
  advancedOpen.value = typeof p?.temperature === 'number' && typeof p?.topK === 'number';
}, { deep: true, immediate: true });

async function probe() {
  if (checking.value) return;
  checking.value = true;
  errorText.value = '';
  try {
    const res = await chrome.runtime.sendMessage({ action: 'probeLocalLlm', providerId: 'gemini-nano' });
    probeResult.value = res as LocalLlmProbeResult;
  } catch (e: any) {
    errorText.value = String(e?.message || e);
    probeResult.value = { providerId: 'gemini-nano', availability: 'probe-failed', reason: errorText.value };
  } finally {
    checking.value = false;
  }
}

onMounted(() => {
  void probe();
});

onBeforeUnmount(() => {
  cancelDownload();
});

const availabilityLabel = computed(() => {
  if (downloading.value) return '下载中…';
  const v = probeResult.value?.availability;
  if (!v) return '检测中…';
  if (v === 'available') return '可用';
  if (v === 'downloadable') return '可下载';
  if (v === 'downloading') return '下载中…';
  if (v === 'unavailable') return '不可用';
  if (v === 'no-language-model') return '不可用：Chrome 未启用 Prompt API';
  if (v === 'no-offscreen-api') return '不可用：chrome.offscreen 不可用';
  if (v === 'probe-failed') return '检测失败';
  return v;
});

const availabilityColor = computed(() => {
  if (downloading.value) return 'text-stone-700';
  const v = probeResult.value?.availability;
  if (v === 'available') return 'text-emerald-600';
  if (v === 'downloadable' || v === 'downloading') return 'text-stone-700';
  if (v === 'unavailable' || v === 'no-language-model' || v === 'no-offscreen-api') return 'text-red-600';
  if (v === 'probe-failed') return 'text-red-600';
  return 'text-muted-foreground';
});

const canDownload = computed(() => {
  const v = probeResult.value?.availability;
  return v === 'downloadable' || v === 'downloading';
});

// ===== 下载流程 =====
const downloading = ref(false);
const downloadProgress = ref<LocalLlmDownloadProgress | null>(null);
let downloadPort: chrome.runtime.Port | null = null;

function formatBytes(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const progressLabel = computed(() => {
  const p = downloadProgress.value;
  if (!p) return downloading.value ? '准备中…' : '';
  const loaded = formatBytes(p.loaded);
  const total = typeof p.total === 'number' ? formatBytes(p.total) : '?';
  const percent = typeof p.percent === 'number' ? `${Math.min(100, Math.max(0, p.percent))}%` : '';
  return `${loaded} / ${total}${percent ? ` (${percent})` : ''}`;
});

const progressPercent = computed(() => {
  const p = downloadProgress.value?.percent;
  if (typeof p !== 'number') return 0;
  return Math.min(100, Math.max(0, p));
});

function startDownload() {
  if (downloading.value) return;
  downloading.value = true;
  downloadProgress.value = null;
  errorText.value = '';
  try {
    downloadPort = chrome.runtime.connect({ name: PORT_NAME_LOCAL_LLM_DOWNLOAD });
    downloadPort.onMessage.addListener((msg: LocalLlmDownloadOutbound) => {
      if (!msg) return;
      if (msg.kind === 'progress') {
        downloadProgress.value = msg.progress;
        return;
      }
      if (msg.kind === 'done') {
        finishDownload(true);
        return;
      }
      if (msg.kind === 'error') {
        errorText.value = msg.error || '下载失败';
        finishDownload(false);
        return;
      }
    });
    downloadPort.onDisconnect.addListener(() => {
      if (downloading.value) finishDownload(false);
    });
    downloadPort.postMessage({ kind: 'start', providerId: 'gemini-nano' });
  } catch (e: any) {
    errorText.value = String(e?.message || e);
    finishDownload(false);
  }
}

function cancelDownload() {
  if (!downloadPort) {
    downloading.value = false;
    return;
  }
  try { downloadPort.disconnect(); } catch { /* ignore */ }
  downloadPort = null;
  downloading.value = false;
}

function finishDownload(ok: boolean) {
  try { downloadPort?.disconnect(); } catch { /* ignore */ }
  downloadPort = null;
  downloading.value = false;
  if (ok) {
    void probe();
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="rounded-2xl bg-muted/40 p-3 text-xs text-muted-foreground">
      当前仅支持 Chrome 138+ 并在
      <code class="rounded bg-background px-1">chrome://flags/#prompt-api-for-gemini-nano</code>
      中启用 Gemini-Nano
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <label class="text-sm font-medium leading-none block mb-1">启用 Gemini-Nano</label>
        <p class="text-xs text-muted-foreground">关闭后不会出现在聊天、翻译和默认模型选择器中</p>
      </div>
      <div>
        <Switch :model-value="enabled" @update:modelValue="emit('update:enabled', !!$event)" />
      </div>
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <label class="text-sm font-medium leading-none block mb-1">状态</label>
        <p class="text-xs text-muted-foreground">检测当前浏览器是否可调用该模型</p>
      </div>
      <div class="w-64 flex justify-end">
        <span :class="['text-sm cursor-pointer', availabilityColor]" @click="probe">{{ availabilityLabel }}</span>
      </div>
    </div>

    <div v-if="downloading || downloadProgress" class="rounded-2xl bg-muted/40 p-3 space-y-2">
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="text-muted-foreground">{{ progressLabel || '准备中…' }}</span>
        <span class="font-medium tabular-nums">{{ progressPercent }}%</span>
      </div>
      <div class="w-full h-2 rounded-full bg-background overflow-hidden">
        <div class="h-full bg-primary transition-all duration-200" :style="{ width: `${progressPercent}%` }"></div>
      </div>
      <div class="flex items-center justify-between gap-2 pt-1">
        <p class="text-[11px] text-muted-foreground">
          支持断点续传：取消或重试后会从已下载位置继续。
        </p>
        <Button variant="outline" size="sm" class="rounded-xl flex items-center gap-1 text-red-600 shrink-0"
          @click="cancelDownload">
          <Icon icon="ri:close-line" width="14" />
          取消
        </Button>
      </div>
    </div>

    <div v-if="!downloading && canDownload"
      class="rounded-xl bg-stone-100 border border-stone-200 p-3 text-xs text-stone-700 flex items-center justify-between gap-3">
      <span class="leading-relaxed">点击「下载模型」由 Chrome 通过组件更新器拉取 Gemini-Nano（数 GB，需较长时间）。</span>
      <Button variant="outline" size="sm" class="rounded-xl flex items-center gap-1 shrink-0 bg-white"
        @click="startDownload">
        <Icon icon="ri:download-line" width="14" />
        下载模型
      </Button>
    </div>

    <div v-if="errorText" class="text-xs text-red-600">{{ errorText }}</div>
    <div v-else-if="probeResult?.reason && !downloading && !canDownload"
      class="rounded-xl border border-stone-200 bg-stone-100 p-3 text-xs text-stone-700 leading-relaxed">
      <div class="font-medium mb-1">检测详情</div>
      {{ probeResult.reason }}
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <label class="text-sm font-medium leading-none block mb-1">高级参数</label>
        <p class="text-xs text-muted-foreground">未开启时使用模型默认值，适合大多数场景</p>
      </div>
      <div>
        <Switch v-model="advancedOpen" />
      </div>
    </div>

    <div v-if="advancedOpen" class="space-y-3 rounded-2xl bg-muted/40 p-3">
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">Temperature</label>
          <p class="text-xs text-muted-foreground leading-relaxed">
            范围 0–2 / 默认 {{ defaultTemperatureLabel }} / 值越小越保守确定，越大越发散创造。
          </p>
        </div>
        <div class="w-64">
          <Input v-model.number="temperature" type="number" min="0" max="2" step="0.1" class="rounded-xl" />
        </div>
      </div>
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">Top-K</label>
          <p class="text-xs text-muted-foreground leading-relaxed">
            范围 1-8 / 默认 {{ defaultTopKLabel }} / 值越小模型输出的词汇越简单，越大越复杂多样。
          </p>
        </div>
        <div class="w-64">
          <Input v-model.number="topK" type="number" min="1" max="8" step="1" class="rounded-xl" />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <div class="w-full"></div>
      <Button class="bg-primary text-primary-foreground flex items-center gap-1 rounded-xl" @click="emit('save')">
        <Icon icon="proicons:save" width="16" /> 保存
      </Button>
    </div>
  </div>
</template>
