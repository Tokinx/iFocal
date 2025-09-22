
<template>
  <div class="flex h-screen w-full flex-col bg-background text-foreground">
    <header class="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div class="flex items-center gap-2">
        <Select v-model="state.selectedModel" class="w-48">
          <SelectTrigger>
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="model in models" :key="model" :value="model">{{ model }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="state.targetLang" class="w-36">
          <SelectTrigger>
            <SelectValue placeholder="Lang" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="lang in languages" :key="lang.value" :value="lang.value">{{ lang.label }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button class="bg-primary text-primary-foreground flex items-center gap-1" @click="handleRefresh" :disabled="loading">
        <Icon icon="proicons:bolt" width="16" />
        Refresh Page Context
      </Button>
    </header>

    <main ref="messagesRef" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <template v-if="messages.length">
<article
          v-for="message in messages"
          :key="message.id"
          :class="[
            'flex w-full flex-col gap-1 rounded-xl border p-3 text-sm',
            message.role === 'user' ? 'border-primary/40 bg-primary/5 self-end' : 'border-slate-200 bg-white shadow-sm',
            selectedId === message.id ? 'ring-2 ring-primary/40' : ''
          ]"
          class="group relative focus:outline-none"
          tabindex="0"
          @focus="selectedId = message.id"
          @click="selectedId = message.id"
          @keydown.stop.prevent="onMessageKeydown($event, message)"
        >
          <header class="flex items-center justify-between text-xs text-muted-foreground">
            <span class="inline-flex items-center gap-1">
              <Icon :icon="iconOfRole(message.role)" width="14" />
              {{ message.role === 'user' ? 'You' : 'Copilot' }}
            </span>
            <span>{{ formatTime(message.createdAt) }}</span>
          </header>
          <div class="text-sm whitespace-pre-wrap leading-relaxed">
            {{ message.content }}
          </div>

          <!-- hover tools -->
          <div class="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition pointer-events-auto">
            <div class="flex items-center gap-1 rounded-md border bg-white/95 px-1 py-0.5 shadow">
              <button class="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                      title="Copy" @click="copyMessage(message)">
                <Icon :icon="iconOfAction('copy')" width="14" />
              </button>
              <button v-if="message.role==='user'" class="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                      title="Resend" @click="resendMessage(message)">
                <Icon :icon="iconOfAction('resend')" width="14" />
              </button>
              <button class="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                      title="Delete" @click="deleteMessage(message, true)">
                <Icon :icon="iconOfAction('delete')" width="14" />
              </button>
            </div>
          </div>
        </article>
      </template>
      <p v-else class="mt-12 text-center text-sm text-muted-foreground">
        No conversation yet. Capture the current page or ask a question to get started.
      </p>
    </main>

    <section class="border-t px-4 py-3 space-y-3">
      <div class="flex flex-wrap gap-2">
        <Select v-model="state.selectedModel" class="w-40">
  <SelectTrigger>
    <SelectValue placeholder="Model" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem v-for="model in models" :key="model" :value="model">{{ model }}</SelectItem>
  </SelectContent>
</Select>
        <Select v-model="state.selectedFeature" class="w-40">
  <SelectTrigger>
    <SelectValue placeholder="Feature" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem v-for="feature in features" :key="feature.id" :value="feature.id">
      <span class="inline-flex items-center gap-2"><Icon :icon="iconOfFeature(feature.id)" width="14" /> {{ feature.label }}</span>
    </SelectItem>
  </SelectContent>
</Select>
        <Select v-if="isTranslate" v-model="state.targetLang" class="w-36">
  <SelectTrigger>
    <SelectValue placeholder="Language" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem v-for="lang in languages" :key="lang.value" :value="lang.value">{{ lang.label }}</SelectItem>
  </SelectContent>
</Select>
      </div>
      <Textarea
        v-model="state.draft"
        class="min-h-[120px]"
        placeholder="Type a prompt or leave it empty to analyse the current page"
        @keydown.enter.prevent="handleEnter"
      />
      <div class="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Model: {{ state.selectedModel }} 路 Feature: {{ currentFeature?.label }}
          <template v-if="isTranslate"> 路 Target language: {{ state.targetLang }}</template>
        </span>
        <Button class="bg-primary text-primary-foreground flex items-center gap-1" :disabled="sending || !state.draft.trim()" @click="sendMessage">
          <Icon icon="proicons:chat" width="16" />
          {{ sending ? 'Sending...' : 'Send' }}
        </Button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { iconOfFeature, iconOfRole, iconOfAction } from '@/shared/icons';
import { useToast } from '@/options/composables/useToast';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

const messages = reactive<ChatMessage[]>([]);
const messagesRef = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const sending = ref(false);
const selectedId = ref<string | null>(null);
const toast = useToast();

const models = ref<string[]>(['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku']);
const features = ref([
  { id: 'chat', label: 'Chat' },
  { id: 'translate', label: 'Translate' },
  { id: 'summarize', label: 'Summarize' },
  { id: 'analyze-page', label: 'Page insight' }
]);
const languages = ref([
  { value: 'zh-CN', label: 'Chinese (zh-CN)' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'fr', label: 'French' }
]);

const state = reactive({
  selectedModel: models.value[0],
  selectedFeature: features.value[0].id,
  targetLang: 'zh-CN',
  draft: ''
});

const isTranslate = computed(() => state.selectedFeature === 'translate');
const currentFeature = computed(() => features.value.find((f) => f.id === state.selectedFeature));

function pushMessage(payload: Omit<ChatMessage, 'id' | 'createdAt'>) {
  messages.push({ id: crypto.randomUUID(), createdAt: Date.now(), ...payload });
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
    }
  });
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString();
}

async function handleRefresh() {
  try {
    loading.value = true;
    const summary = await requestSidebarAction<{ preview?: string }>({ type: 'capture-page' });
    if (summary?.preview) {
      pushMessage({ role: 'assistant', content: summary.preview });
    }
  } catch (error) {
    console.error('[FloatingCopilot] capture page failed', error);
  } finally {
    loading.value = false;
  }
}

function handleEnter(event: KeyboardEvent) {
  if (event.shiftKey) return;
  event.preventDefault();
  sendMessage();
}

async function sendMessage() {
  const text = state.draft.trim();
  if (!text || sending.value) return;
  pushMessage({ role: 'user', content: text });
  sending.value = true;
  try {
    const payload = await requestSidebarAction<{ response?: string }>({
      type: 'stream-message',
      feature: state.selectedFeature,
      model: state.selectedModel,
      targetLang: state.targetLang,
      text
    });
    if (payload?.response) {
      pushMessage({ role: 'assistant', content: payload.response });
    }
  } catch (error) {
    console.error('[FloatingCopilot] send message failed', error);
  } finally {
    sending.value = false;
    state.draft = '';
  }
}

function requestSidebarAction<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ source: 'floating-copilot', ...payload }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(err);
          return;
        }
        resolve(response as T);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function copyMessage(m: ChatMessage) {
  try {
    await navigator.clipboard.writeText(m.content || '');
  } catch (e) {
    console.warn('copy failed', e);
  }
}

function deleteMessage(target: ChatMessage | string, confirmFirst = false) {
  const msg = typeof target === 'string' ? messages.find(m => m.id === target) : target;
  if (!msg) return;
  const runDelete = () => {
    const idx = messages.findIndex(m => m.id === msg.id);
    if (idx < 0) return;
    const backup = { idx, msg: { ...msg } };
    messages.splice(idx, 1);
    if (selectedId.value === msg.id) selectedId.value = null;
    toast.action('已删除一条消息', {
      label: '撤回',
      onClick: () => {
        const insertAt = Math.min(backup.idx, messages.length);
        messages.splice(insertAt, 0, backup.msg);
      }
    });
  };
  if (confirmFirst) {
    toast.action('确认删除该消息？', { label: '删除', type: 'error', onClick: runDelete });
  } else {
    runDelete();
  }
}

function onMessageKeydown(e: KeyboardEvent, m: ChatMessage) {
  const key = e.key.toLowerCase();
  if (key === 'c') {
    copyMessage(m);
    return;
  }
  if (key === 'r' && m.role === 'user') {
    resendMessage(m);
    return;
  }
  if (key === 'delete' || key === 'backspace') {
    deleteMessage(m, true);
    return;
  }
}

function resendMessage(m: ChatMessage) {
  state.draft = m.content || '';
  sendMessage();
}

onMounted(async () => {
  try {
    const bootstrap = await requestSidebarAction<{ models: string[]; defaultFeature: string; targetLang: string }>({ type: 'bootstrap' });
    if (bootstrap?.models?.length) {
      models.value = bootstrap.models;
      state.selectedModel = bootstrap.models[0];
    }
    if (bootstrap?.defaultFeature) {
      state.selectedFeature = bootstrap.defaultFeature;
    }
    if (bootstrap?.targetLang) {
      state.targetLang = bootstrap.targetLang;
    }
  } catch (error) {
    console.warn('[FloatingCopilot] failed to bootstrap sidebar state', error);
  }
});
</script>






