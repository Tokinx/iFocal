
<template>
  <div class="flex h-screen w-full flex-col bg-background text-foreground">
    <header class="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div class="text-sm font-medium">iFocal</div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="icon" class="flex items-center gap-1" @click="startNewSession" :disabled="sending" title="新会话">
          <Icon icon="material-symbols:add-circle-outline-rounded" width="16" />
        </Button>
        <Button variant="outline" size="icon" class="flex items-center gap-1" @click="toggleHistory" :disabled="sending" title="历史消息">
          <Icon icon="material-symbols:history" width="16" />
        </Button>
      </div>
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
          class="group relative focus:outline-none"
          tabindex="0"
          @focus="selectedId = message.id"
          @click="selectedId = message.id"
          @keydown.stop.prevent="onMessageKeydown($event, message)"
        >
          <header class="flex items-center justify-between text-xs text-muted-foreground">
            <span class="inline-flex items-center gap-1">
              <Icon :icon="iconOfRole(message.role)" width="14" />
              <template v-if="message.role === 'user'">You</template>
              <template v-else>{{ message.model || modelNameOf(state.selectedModel) }}</template>
            </span>
            <span>{{ formatTime(message.createdAt) }}</span>
          </header>
          <div class="text-sm leading-relaxed prose prose-sm max-w-none">
            <div v-if="message.role === 'user'">{{ message.content }}</div>
            <div v-else>
              <div v-if="sending && message.content === ''" class="flex items-center gap-1">
                <div class="animate-pulse flex space-x-1">
                  <div class="h-2 w-2 bg-primary rounded-full"></div>
                  <div class="h-2 w-2 bg-primary rounded-full animation-delay-200"></div>
                  <div class="h-2 w-2 bg-primary rounded-full animation-delay-400"></div>
                </div>
                <span class="text-muted-foreground text-xs">Thinking...</span>
              </div>
              <div v-else class="ai-message" v-html="renderMarkdown(message.content)"></div>
            </div>
          </div>

          <!-- hover tools -->
          <div class="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition pointer-events-auto">
            <div class="flex items-center gap-1 rounded-full border bg-white/95 p-1 shadow">
              <Button variant="outline" size="icon" class="inline-flex items-center w-6 h-6 gap-1 text-xs text-slate-600 hover:bg-slate-100 rounded-full"
                      title="Copy" @click="copyMessage(message)">
                <Icon :icon="iconOfAction('copy')" />
              </Button>
              <Button variant="outline" size="icon" class="inline-flex items-center w-6 h-6 gap-1 text-xs text-slate-600 hover:bg-slate-100 rounded-full"
                      title="Retry" @click="resendMessage(message)">
                <Icon :icon="iconOfAction('resend')" />
              </Button>
              <Button variant="outline" size="icon" class="inline-flex items-center w-6 h-6 gap-1 text-xs text-red-600 hover:bg-red-50 rounded-full"
                      title="Delete" @click="deleteMessage(message, true)">
                <Icon :icon="iconOfAction('delete')" />
              </Button>
            </div>
          </div>
        </article>
      </template>
      <p v-else class="mt-12 text-center text-sm text-muted-foreground">
        Feel free to ask me if you have any questions.
      </p>
    </main>

    <section class="border-t px-4 py-3 space-y-3">
      <div class="flex gap-2">
        <Select v-model="state.selectedFeature" class="w-full">
          <SelectTrigger>
            <SelectValue placeholder="Feature" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="feature in features" :key="feature.value" :value="feature.value">
              <span class="inline-flex items-center gap-2"><Icon :icon="iconOfFeature(feature.value)" width="14" /> {{ feature.label }}</span>
            </SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="state.targetLang" class="w-full">
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
      <div class="flex items-center justify-between">
        <div>
          <Select v-model="state.selectedModel" class="w-44">
            <SelectTrigger>
              <span class="truncate">{{ modelNameOf(state.selectedModel) || 'Model' }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="model in models" :key="model" :value="model">
                <div class="flex flex-col">
                  <span>{{ modelNameOf(model) }}</span>
                  <span class="text-xs text-muted-foreground">{{ channelNameOf(model) }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button class="bg-primary text-primary-foreground flex items-center gap-1" :disabled="sending || !state.draft.trim()" @click="sendMessage()">
          <Icon icon="proicons:chat" width="16" />
          Send
        </Button>
      </div>
    </section>
    <!-- 历史消息弹窗 -->
    <Dialog :open="showHistory" @update:open="(v:boolean)=>showHistory=v">
      <DialogScrollContent class="max-h-[70vh] w-[520px]">
        <div class="space-y-3">
          <div class="text-sm font-medium">历史会话（最多 {{ historyLimit }} 条）</div>
          <div class="grid gap-2">
            <div v-if="!sessions.length" class="text-xs text-muted-foreground">暂无历史会话</div>
            <div v-for="s in sessions" :key="s.id" class="flex items-center justify-between rounded border bg-white px-2 py-2">
              <div class="min-w-0">
                <div class="truncate text-sm">{{ s.title || '会话' }}</div>
                <div class="text-xs text-muted-foreground">{{ formatTime(s.updatedAt) }} · {{ (s.messages?.length||0) }} 条消息</div>
              </div>
              <div class="shrink-0 flex items-center gap-2">
                <Button size="sm" class="h-7 px-2 text-xs" @click="loadSession(s)">载入</Button>
                <Button size="sm" variant="ghost" class="h-7 px-2 text-xs text-red-600" @click="removeSession(s.id)">删除</Button>
              </div>
            </div>
          </div>
        </div>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { marked } from 'marked';
import { iconOfFeature, iconOfRole, iconOfAction } from '@/shared/icons';
import { useToast } from '@/options/composables/useToast';
import { SUPPORTED_LANGUAGES, SUPPORTED_TASKS, loadConfig } from '@/shared/config';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  model?: string;
}

const messages = reactive<ChatMessage[]>([]);
const messagesRef = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const sending = ref(false);
const selectedId = ref<string | null>(null);
const toast = useToast();

const models = ref<string[]>(['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku']);
const features = ref([
  { value: 'chat', label: 'Chat' },
  ...SUPPORTED_TASKS
]);
const languages = ref(SUPPORTED_LANGUAGES);

const state = reactive({
  selectedModel: models.value[0],
  selectedFeature: features.value[0].id,
  targetLang: 'zh-CN',
  draft: ''
});

// 历史会话
type Session = { id: string; title: string; updatedAt: number; messages: ChatMessage[] };
const sessions = reactive<Session[]>([]);
const showHistory = ref(false);
const historyLimit = ref<number>(10);
const currentSessionId = ref<string>('');
let streamPort: chrome.runtime.Port | null = null;

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

function renderMarkdown(content: string) {
  return marked(content);
}

async function handleRefresh() {
  try {
    loading.value = true;
    const summary = await requestSidebarAction<{ preview?: string }>({ type: 'capture-page' });
    if (summary?.preview) {
      pushMessage({ role: 'assistant', content: summary.preview });
    }
  } catch (error) {
    console.error('[iFocal] capture page failed', error);
  } finally {
    loading.value = false;
  }
}

// 会话控制
function startNewSession() {
  messages.splice(0, messages.length);
  currentSessionId.value = crypto.randomUUID();
  persistSessions();
}
function toggleHistory() { showHistory.value = !showHistory.value; }
function loadSession(s: Session) {
  messages.splice(0, messages.length, ...((s?.messages || []).map(m => ({ ...m }))));
  currentSessionId.value = s.id;
  showHistory.value = false;
}
function removeSession(id: string) {
  const idx = sessions.findIndex(s => s.id === id);
  if (idx >= 0) {
    const removed = sessions.splice(idx, 1);
    try { chrome.storage.local.set({ sidebarSessions: sessions }); } catch {}
    if (removed[0]?.id === currentSessionId.value) startNewSession();
  }
}

function handleEnter(event: KeyboardEvent) {
  if (event.shiftKey) return;
  event.preventDefault();
  sendMessage();
}

// 上下文拼接（仅 chat 模式）
function buildChatText(input: string, uptoMessageId?: string): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (uptoMessageId && m.id === uptoMessageId) break;
    lines.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
  }
  lines.push(`User: ${input}`);
  return lines.join('\n');
}

function parseSelectedPair(val: string): { channel?: string; model?: string } {
  if (!val) return {} as any;
  if (val.includes(':')) { const [channel, model] = val.split(':'); return { channel, model } as any; }
  return { model: val } as any;
}
function modelNameOf(val: string): string { if (!val) return ''; if (val.includes(':')) return val.split(':')[1] || val; return val; }
function channelNameOf(val: string): string { if (!val) return ''; if (val.includes(':')) return val.split(':')[0] || ''; return ''; }

async function sendMessage(textOverride?: string, uptoMessageId?: string) {
  if (sending.value) return;
  const original = textOverride ?? state.draft.trim();
  if (!original) return;
  // 立即清空输入框
  state.draft = '';
  const text = state.selectedFeature === 'chat' ? buildChatText(original, uptoMessageId) : original;
  pushMessage({ role: 'user', content: original });
  sending.value = true;
  // AI 占位消息
  const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', createdAt: Date.now(), model: modelNameOf(state.selectedModel) };
  messages.push(aiMsg);
  nextTick(() => { if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight; });
  try {
    if (streamPort) { try { streamPort.disconnect(); } catch {} streamPort = null; }
    const pair = parseSelectedPair(state.selectedModel);
    const msg: any = { type: 'start', task: state.selectedFeature, text, targetLang: state.targetLang };
    if ((pair as any).channel && (pair as any).model) { msg.channel = (pair as any).channel; msg.model = (pair as any).model; }
    const port = chrome.runtime.connect({ name: 'ai-stream' });
    streamPort = port;
    port.onMessage.addListener((m: any) => {
      if (m?.type === 'delta') {
        aiMsg.content += String(m.text || '');
        nextTick(() => { if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight; });
      
      } else if (m?.type === 'meta') {
        aiMsg.model = String(m?.model || aiMsg.model || '');
} else if (m?.type === 'done') {
        sending.value = false;
        persistSessions();
      } else if (m?.type === 'error') {
        sending.value = false;
        aiMsg.content += `\n[错误] ${m.error}`;
      }
    });
    try {
      port.onDisconnect.addListener(() => {
        try { const err = chrome.runtime.lastError; if (err) { aiMsg.content += `\n[错误] ${err.message}`; sending.value = false; } } catch {}
      });
    } catch {}
    port.postMessage(msg);
  } catch (error) {
    console.error('[iFocal] stream start failed', error);
    sending.value = false;
  }
}

function requestSidebarAction<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ source: 'ifocal', ...payload }, (response) => {
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
    toast.action('Message deleted', {
      label: 'Undo',
      onClick: () => {
        const insertAt = Math.min(backup.idx, messages.length);
        messages.splice(insertAt, 0, backup.msg);
      }
    });
  };
  if (confirmFirst) {
    toast.action('Delete this message?', { label: 'Delete', type: 'error', onClick: runDelete });
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
  if (key === 'r') { resendMessage(m); return; }
  if (key === 'delete' || key === 'backspace') {
    deleteMessage(m, true);
    return;
  }
}

function findPrevUserMessageIndex(fromIndex: number): number { for (let i = fromIndex; i >= 0; i--) if (messages[i]?.role === 'user') return i; return -1; }
function resendMessage(m: ChatMessage) {
  if (!m) return;
  if (m.role === 'user') {
    sendMessage(m.content || '', m.id);
  } else {
    const idx = messages.findIndex(x => x.id === m.id);
    const prevUserIdx = idx >= 0 ? findPrevUserMessageIndex(idx - 1) : -1;
    const target = prevUserIdx >= 0 ? messages[prevUserIdx] : null;
    const text = target?.content || '';
    if (!text) return;
    sendMessage(text, target!.id);
  }
}

// 会话持久化
function persistSessions() {
  const id = currentSessionId.value || (currentSessionId.value = crypto.randomUUID());
  const title = (messages.find(m => m.role === 'user')?.content || '').slice(0, 20) || '会话';
  const snapshot: Session = { id, title, updatedAt: Date.now(), messages: messages.map(m => ({ ...m })) };
  const exists = sessions.findIndex(s => s.id === id);
  if (exists >= 0) sessions.splice(exists, 1, snapshot); else sessions.unshift(snapshot);
  while (sessions.length > historyLimit.value) sessions.pop();
  try { chrome.storage.local.set({ sidebarSessions: sessions, sidebarCurrentSessionId: id }); } catch {}
}

onMounted(async () => {
  try {
    // 加载全局配置
    const globalConfig = await loadConfig();
    
    const bootstrap = await requestSidebarAction<{ models: string[]; defaultFeature: string; targetLang: string }>({ type: 'bootstrap' });
    if (bootstrap?.models?.length) {
      models.value = bootstrap.models;
      state.selectedModel = bootstrap.models[0];
    }
    if (bootstrap?.defaultFeature) {
      state.selectedFeature = bootstrap.defaultFeature;
    } else {
      // 使用全局配置中的默认任务
      state.selectedFeature = globalConfig.defaultTask;
    }
    if (bootstrap?.targetLang) {
      state.targetLang = bootstrap.targetLang;
    } else {
      // 使用全局配置中的目标语言
      state.targetLang = globalConfig.translateTargetLang;
    }
    
    // 加载历史设置与会话
    try {
      historyLimit.value = globalConfig.sidebarHistoryLimit;
      chrome.storage.local.get(['sidebarSessions','sidebarCurrentSessionId'], (items:any) => {
        const list = Array.isArray(items?.sidebarSessions) ? items.sidebarSessions : [];
        sessions.splice(0, sessions.length, ...(list as any));
        currentSessionId.value = items?.sidebarCurrentSessionId || crypto.randomUUID();
      });
    } catch {}
  } catch (error) {
    console.warn('[iFocal] failed to bootstrap sidebar state', error);
  }
});
</script>








