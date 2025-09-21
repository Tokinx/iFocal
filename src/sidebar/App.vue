
<template>
  <div class="flex h-screen w-full flex-col bg-background text-foreground">
    <header class="flex items-center justify-between border-b px-4 py-3">
      <div>
        <h1 class="text-base font-semibold">FloatingCopilot</h1>
        <p class="text-xs text-muted-foreground">AI copilot sidebar · Vue + shadcn-vue</p>
      </div>
      <UiButton class="bg-primary text-primary-foreground" @click="handleRefresh" :disabled="loading">
        Refresh Page Context
      </UiButton>
    </header>

    <main ref="messagesRef" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <template v-if="messages.length">
        <article
          v-for="message in messages"
          :key="message.id"
          :class="[
            'flex w-full flex-col gap-1 rounded-xl border p-3 text-sm',
            message.role === 'user' ? 'border-primary/40 bg-primary/5 self-end' : 'border-slate-200 bg-white shadow-sm'
          ]"
        >
          <header class="flex items-center justify-between text-xs text-muted-foreground">
            <span>{{ message.role === 'user' ? 'You' : 'Copilot' }}</span>
            <span>{{ formatTime(message.createdAt) }}</span>
          </header>
          <div class="text-sm whitespace-pre-wrap leading-relaxed">
            {{ message.content }}
          </div>
        </article>
      </template>
      <p v-else class="mt-12 text-center text-sm text-muted-foreground">
        No conversation yet. Capture the current page or ask a question to get started.
      </p>
    </main>

    <section class="border-t px-4 py-3 space-y-3">
      <div class="flex flex-wrap gap-2">
        <UiSelect v-model="state.selectedModel" class="w-40">
          <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
        </UiSelect>
        <UiSelect v-model="state.selectedFeature" class="w-40">
          <option v-for="feature in features" :key="feature.id" :value="feature.id">{{ feature.label }}</option>
        </UiSelect>
        <UiSelect v-if="isTranslate" v-model="state.targetLang" class="w-36">
          <option v-for="lang in languages" :key="lang.value" :value="lang.value">{{ lang.label }}</option>
        </UiSelect>
      </div>
      <UiTextarea
        v-model="state.draft"
        class="min-h-[120px]"
        placeholder="Type a prompt or leave it empty to analyse the current page"
        @keydown.enter.prevent="handleEnter"
      />
      <div class="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Model: {{ state.selectedModel }} · Feature: {{ currentFeature?.label }}
          <template v-if="isTranslate"> · Target language: {{ state.targetLang }}</template>
        </span>
        <UiButton class="bg-primary text-primary-foreground" :disabled="sending || !state.draft.trim()" @click="sendMessage">
          {{ sending ? 'Sending…' : 'Send' }}
        </UiButton>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';

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
