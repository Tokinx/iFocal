<template>
  <div ref="rootEl" class="flex h-screen w-full flex-col bg-[#f3f3f3] text-foreground">
    <!-- 顶部工具栏 -->
    <header class="flex items-center gap-2 absolute left-0 right-0 p-3 z-10">
      <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0 rounded-full bg-white/60 backdrop-blur-md"
        @click="historyOpen = true">
        <Icon icon="ri:menu-line" class="h-5 w-5" />
      </Button>

      <!-- 模型选择 Dropdown -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" class="rounded-2xl justify-start truncate h-8 px-3 bg-white/60 backdrop-blur-md">
            <span class="truncate text-sm">{{ currentModelName || 'GPT-5' }}</span>
            <Icon icon="ri:arrow-down-s-line" class="h-8 w-8 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-56 rounded-2xl bg-white/60 backdrop-blur-md">
          <template v-for="(group, channelName, groupIndex) in groupedModels" :key="channelName">
            <DropdownMenuSeparator v-if="groupIndex" />
            <DropdownMenuLabel>{{ channelName }}</DropdownMenuLabel>
            <DropdownMenuItem v-for="model in group" :key="model.key" @click="selectModel(model.key)"
              class="rounded-xl cursor-pointer">
              <span class="truncate">{{ model.model }}</span>
              <Icon v-if="selectedPairKey === model.key" icon="ri:check-line" class="ml-auto h-4 w-4" />
            </DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>

      <div class="flex-1"></div>

      <!-- 语言选择 Dropdown -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" class="rounded-2xl h-8 shrink-0 px-3 bg-white/60 backdrop-blur-md">
            <span class="truncate text-sm">{{ currentLangLabel }}</span>
            <Icon icon="ri:arrow-down-s-line" class="h-8 w-8 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="rounded-2xl bg-white/60 backdrop-blur-md">
          <DropdownMenuItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" @click="selectLanguage(lang.value)"
            class="rounded-xl cursor-pointer">
            {{ lang.label }}
            <Icon v-if="state.targetLang === lang.value" icon="ri:check-line" class="ml-auto h-4 w-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>

    <!-- 对话区域 -->
    <main ref="messagesContainer" class="flex-1 overflow-y-auto px-4 pt-[60px] pb-[150px]">
      <div class="mx-auto max-w-[50rem] space-y-6 ">
        <!-- 示例问题（仅在无对话时显示） -->
        <div v-if="!currentSession.messages.length && !sending" class="space-y-4 mx-auto w-[80%] pt-[38%]">
          <h2 class="text-center text-2xl font-medium text-muted-foreground">
            有什么可以帮忙的？
          </h2>
          <!-- <div class="grid gap-2">
            <button v-for="example in exampleQuestions" :key="example" @click="useExample(example)"
              class="rounded-full border bg-card p-3 text-left text-sm hover:bg-accent transition-colors">
              {{ example }}
            </button>
          </div> -->
        </div>

        <!-- 对话历史 -->
        <template v-for="(message, idx) in currentSession.messages" :key="idx">
          <!-- 用户消息 -->
          <div v-if="message.role === 'user'" class="flex justify-end">
            <div class="group relative max-w-[80%]">
              <div class="rounded-xl !rounded-tr-none bg-slate-800/80 px-4 py-3 text-primary-foreground">
                {{ message.content }}
              </div>
              <!-- 重试按钮 - 左下角 -->
              <Button variant="ghost" size="icon"
                class="absolute -left-7 bottom-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400"
                @click="retryMessage(idx)" title="重试">
                <Icon icon="ri:restart-line" class="h-3 w-3" />
              </Button>
            </div>
          </div>

          <!-- AI 回复 -->
          <div v-else class="w-full group">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">{{ currentModelName || 'Assistant' }}</span>
              <!-- 复制按钮 -->
              <Button variant="ghost" size="icon"
                class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400"
                @click="copyMessage(message.content)" title="复制">
                <Icon icon="ri:file-copy-line" class="h-3 w-3" />
              </Button>
            </div>

            <div class="w-full">
              <div v-if="message.isError" class="text-red-600">{{ message.content }}</div>
              <div v-else class="prose prose-sm max-w-none" v-html="renderMarkdown(message.content)"></div>
            </div>
          </div>
        </template>

        <!-- 加载状态 -->
        <div v-if="sending" class="w-full">
          <div class="mb-2">
            <span class="text-xs font-medium text-muted-foreground">{{ currentModelName || 'AI' }}</span>
          </div>

          <div class="w-full">
            <div class="space-y-3">
              <div class="h-3 w-2/3 rounded bg-muted-foreground/20 animate-pulse"></div>
              <div class="h-3 w-full rounded bg-muted-foreground/20 animate-pulse"></div>
              <div class="h-3 w-5/6 rounded bg-muted-foreground/20 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 底部操作区 -->
    <footer class="p-3 absolute left-0 right-0 bottom-0">
      <div class="mx-auto max-w-3xl space-y-2">
        <!-- 快捷操作按钮 -->
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="sm" class="gap-1"
            :class="['bg-white/60 backdrop-blur-sm rounded-2xl', { '!bg-slate-800/80 !text-white': state.task === 'translate' }]"
            @click="changeTask('translate')">
            <Icon icon="ri:translate" class="h-4 w-4" />
            翻译
          </Button>
          <Button variant="ghost" size="sm" class="gap-1"
            :class="['bg-white/60 backdrop-blur-sm rounded-2xl', { '!bg-slate-800/80 !text-white': state.task === 'chat' }]"
            @click="changeTask('chat')">
            <Icon icon="ri:chat-ai-line" class="h-4 w-4" />
            聊天
          </Button>
          <Button variant="ghost" size="sm" class="gap-1"
            :class="['bg-white/60 backdrop-blur-sm rounded-2xl', { '!bg-slate-800/80 !text-white': state.task === 'summarize' }]"
            @click="changeTask('summarize')">
            <Icon icon="ri:quill-pen-ai-line" class="h-4 w-4" />
            总结
          </Button>

          <div class="flex-1"></div>

          <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0 rounded-full bg-white/60 backdrop-blur-md"
            @click="() => startNewChat(false)">
            <Icon icon="ri:pencil-ai-2-line" class="h-5 w-5" />
          </Button>
        </div>

        <!-- 输入框 -->
        <div class="relative bg-white/60 backdrop-blur-md rounded-xl">
          <Textarea v-model="state.text" :rows="3" placeholder="输入你想了解到内容" class="resize-none rounded-xl"
            @keydown.enter.exact.prevent="handleSend()" />
          <Button variant="ghost" size="icon"
            class="absolute bottom-2 right-2 h-7 w-7 bg-slate/60 backdrop-blur-md rounded-xl !bg-slate-800 !text-white" @click="handleSend()"
            v-show="state.text.trim() && !sending">
            <Icon icon="ri:send-plane-2-fill" class="h-3 w-3" />
          </Button>
        </div>
      </div>
    </footer>

    <!-- 历史会话抽屉 -->
    <Sheet v-model:open="historyOpen">
      <SheetContent side="left" class="w-80">
        <SheetHeader>
          <SheetTitle>历史会话</SheetTitle>
          <SheetDescription>
            查看和管理您的对话历史
          </SheetDescription>
        </SheetHeader>

        <div class="mt-6 space-y-2">
          <!-- 新建对话按钮 -->
          <Button variant="outline" class="w-full justify-start gap-2" @click="startNewChatFromDrawer">
            <Icon icon="ri:add-line" class="h-4 w-4" />
            新建对话
          </Button>

          <!-- 会话列表 -->
          <div class="space-y-1">
            <button v-for="(session, idx) in sessions" :key="session.id" @click="switchSession(session.id)"
              class="w-full rounded-lg p-3 text-left transition-colors hover:bg-accent"
              :class="{ 'bg-accent': currentSessionId === session.id }">
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <div class="truncate text-sm font-medium">
                    {{ session.title || '新对话' }}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {{ formatDate(session.updatedAt) }}
                  </div>
                </div>
                <Button variant="ghost" size="icon" class="h-6 w-6 shrink-0" @click.stop="deleteSession(session.id)">
                  <Icon icon="ri:delete-bin-line" class="h-4 w-4" />
                </Button>
              </div>
            </button>
          </div>

          <!-- 空状态 -->
          <div v-if="sessions.length === 0" class="py-8 text-center text-sm text-muted-foreground">
            暂无历史会话
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue';
import { marked } from 'marked';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SUPPORTED_LANGUAGES, SUPPORTED_TASKS, loadConfig, saveConfig } from '@/shared/config';

type Pair = { channel: string; model: string };
type Channel = { name: string; type: string; apiKey?: string; apiUrl?: string; models?: string[] };

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

interface Session {
  id: string;
  title: string;
  task: 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat';
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const modelPairs = ref<{ key: string; channel: string; model: string }[]>([]);
const selectedPairKey = ref<string>('');
const sending = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const messagesContainer = ref<HTMLElement | null>(null);
const historyOpen = ref(false);
const isInitialLoad = ref(true);

const state = reactive({
  text: '',
  task: 'translate' as 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat',
  targetLang: 'zh-CN'
});

// 会话管理
const sessions = ref<Session[]>([]);
const currentSessionId = ref<string>('');

const currentSession = computed(() => {
  return sessions.value.find(s => s.id === currentSessionId.value) || {
    id: '',
    title: '',
    task: state.task,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
});

const exampleQuestions = [
  '帮我翻译这段文字',
  '总结这篇文章的要点',
  '用更专业的语言改写',
];

const currentModelName = computed(() => {
  const cur = modelPairs.value.find(p => p.key === selectedPairKey.value);
  return cur ? cur.model : '';
});

const currentLangLabel = computed(() => {
  const lang = SUPPORTED_LANGUAGES.find(l => l.value === state.targetLang);
  return lang ? lang.label : '中文';
});

// 按渠道分组模型
const groupedModels = computed(() => {
  const groups: Record<string, typeof modelPairs.value> = {};
  modelPairs.value.forEach(pair => {
    if (!groups[pair.channel]) {
      groups[pair.channel] = [];
    }
    groups[pair.channel].push(pair);
  });
  return groups;
});

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

// 监听消息变化，自动滚动到底部
watch(
  () => currentSession.value.messages.length,
  () => {
    scrollToBottom();
  }
);

// 监听发送状态变化，自动滚动到底部
watch(sending, () => {
  scrollToBottom();
});

function renderMarkdown(content: string) {
  return marked(content);
}

function keyOf(pair: Pair) {
  return `${pair.channel}:${pair.model}`;
}

function parseKey(key: string): Pair | null {
  if (!key) return null;
  const [channel, model] = key.split(':');
  if (!channel || !model) return null;
  return { channel, model };
}

function useExample(example: string) {
  state.text = example;
  handleSend();
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function generateSessionTitle(firstMessage: string): string {
  return firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '');
}

function startNewChat(autoRun = false) {
  const newSession: Session = {
    id: Date.now().toString(),
    title: '新对话',
    task: state.task,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  sessions.value.unshift(newSession);
  currentSessionId.value = newSession.id;
  state.text = '';
  saveSessions();

  // 如果需要自动运行，读取剪贴板并发送
  if (autoRun) {
    readClipboardAndRun();
  }
}

function startNewChatFromDrawer() {
  startNewChat(false);
  historyOpen.value = false;
}

function switchSession(sessionId: string) {
  currentSessionId.value = sessionId;
  const session = sessions.value.find(s => s.id === sessionId);
  if (session) {
    state.task = session.task;
  }
  historyOpen.value = false;
  state.text = '';

  // 切换会话后滚动到底部
  scrollToBottom();
}

function deleteSession(sessionId: string) {
  const index = sessions.value.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    sessions.value.splice(index, 1);

    // 如果删除的是当前会话，切换到第一个会话或创建新会话
    if (currentSessionId.value === sessionId) {
      if (sessions.value.length > 0) {
        currentSessionId.value = sessions.value[0].id;
        const session = sessions.value[0];
        state.task = session.task;
      } else {
        startNewChat(false);
      }
    }

    saveSessions();
  }
}

function saveSessions() {
  try {
    // 加载配置获取最大会话数量限制
    loadConfig().then(config => {
      const maxCount = config.maxSessionsCount || 50;

      // 如果超出限制，删除最旧的会话
      if (sessions.value.length > maxCount) {
        sessions.value = sessions.value.slice(0, maxCount);
      }

      chrome.storage.local.set({
        chatSessions: sessions.value,
        currentSessionId: currentSessionId.value
      });
    }).catch(e => {
      console.error('加载配置失败:', e);
      // 使用默认值
      const maxCount = 50;
      if (sessions.value.length > maxCount) {
        sessions.value = sessions.value.slice(0, maxCount);
      }

      chrome.storage.local.set({
        chatSessions: sessions.value,
        currentSessionId: currentSessionId.value
      });
    });
  } catch (e) {
    console.error('保存会话失败:', e);
  }
}

async function loadSessions() {
  try {
    const data = await new Promise<any>(resolve => {
      chrome.storage.local.get(['chatSessions', 'currentSessionId'], resolve);
    });

    if (data.chatSessions && Array.isArray(data.chatSessions)) {
      sessions.value = data.chatSessions;
    }

    if (data.currentSessionId && sessions.value.find(s => s.id === data.currentSessionId)) {
      currentSessionId.value = data.currentSessionId;
      const session = sessions.value.find(s => s.id === data.currentSessionId);
      if (session) {
        state.task = session.task;
      }
    } else if (sessions.value.length > 0) {
      currentSessionId.value = sessions.value[0].id;
      const session = sessions.value[0];
      state.task = session.task;
    } else {
      // 创建默认会话并自动运行
      startNewChat(true);
      return;
    }

    // 如果是初始加载，自动读取剪贴板并运行
    if (isInitialLoad.value) {
      isInitialLoad.value = false;
      readClipboardAndRun();
    }
  } catch (e) {
    console.error('加载会话失败:', e);
    startNewChat(true);
  }
}

async function loadModels() {
  const globalConfig = await loadConfig();

  const cfg: any = await new Promise(resolve => chrome.storage.sync.get(['channels', 'defaultModel', 'activeModel'], resolve));
  const channels: Channel[] = Array.isArray(cfg.channels) ? cfg.channels : [];
  const pairs = channels.flatMap(ch => (ch.models || []).map(m => ({ key: keyOf({ channel: ch.name, model: m }), channel: ch.name, model: m })));
  modelPairs.value = pairs;
  state.targetLang = globalConfig.translateTargetLang;

  // 不要从配置中读取 defaultTask，保持当前 task
  // state.task = globalConfig.defaultTask as any;

  const prefer: Pair | null = cfg.activeModel || cfg.defaultModel || null;
  if (prefer) {
    const k = keyOf(prefer);
    if (pairs.some(p => p.key === k)) selectedPairKey.value = k;
  }
  if (!selectedPairKey.value && pairs.length) selectedPairKey.value = pairs[0].key;
}

async function readClipboardAndRun() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      state.text = text.trim();
      handleSend();
    }
  } catch (e) {
    console.warn('[iFocal] clipboard read failed', e);
  }
}

async function handleSend() {
  const text = state.text.trim();
  if (!text || sending.value) return;

  const pair = parseKey(selectedPairKey.value);

  // 加载配置检查是否启用上下文
  const globalConfig = await loadConfig();
  const enableContext = globalConfig.enableContext || false;
  const contextCount = globalConfig.contextMessagesCount || 5;

  // 添加用户消息到当前会话
  const userMessage: Message = {
    role: 'user',
    content: text
  };

  const session = sessions.value.find(s => s.id === currentSessionId.value);
  if (session) {
    session.messages.push(userMessage);

    // 如果是第一条消息，更新会话标题
    if (session.messages.length === 1) {
      session.title = generateSessionTitle(text);
    }

    session.updatedAt = Date.now();
    session.task = state.task;
  }

  state.text = '';
  sending.value = true;

  const msg: any = { action: 'performAiAction', task: state.task, text, targetLang: state.targetLang };
  if (pair) { msg.channel = pair.channel; msg.model = pair.model; }

  // 如果启用上下文，添加历史消息
  if (enableContext && session && session.messages.length > 1) {
    // 获取最近的消息（不包括刚添加的用户消息）
    const historyMessages = session.messages.slice(0, -1);
    // 取最后 N 条消息作为上下文
    const contextMessages = historyMessages.slice(-contextCount);
    msg.context = contextMessages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  try {
    chrome.runtime.sendMessage(msg, (resp: any) => {
      try { void chrome.runtime.lastError; } catch { }
      sending.value = false;

      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        isError: false
      };

      if (!resp) {
        assistantMessage.content = '错误：无响应';
        assistantMessage.isError = true;
      } else if (resp.ok) {
        assistantMessage.content = String(resp.result || '');
      } else {
        assistantMessage.content = `错误：${resp.error || '未知错误'}`;
        assistantMessage.isError = true;
      }

      if (session) {
        session.messages.push(assistantMessage);
        session.updatedAt = Date.now();
        saveSessions();
      }
    });
  } catch (e: any) {
    sending.value = false;

    const errorMessage: Message = {
      role: 'assistant',
      content: `错误：${String(e?.message || e || '调用失败')}`,
      isError: true
    };

    if (session) {
      session.messages.push(errorMessage);
      session.updatedAt = Date.now();
      saveSessions();
    }
  }
}

function retryMessage(messageIndex: number) {
  const session = sessions.value.find(s => s.id === currentSessionId.value);
  if (!session) return;

  const userMessage = session.messages[messageIndex];
  if (!userMessage || userMessage.role !== 'user') return;

  // 删除该消息及之后的所有消息
  session.messages.splice(messageIndex);

  // 重新发送
  state.text = userMessage.content;
  handleSend();
}

function changeTask(newTask: 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat') {
  if (state.task === newTask) return;

  state.task = newTask;

  // 保存当前选择的任务到配置
  saveConfig({ defaultTask: newTask }).catch(e => {
    console.error('保存任务类型失败:', e);
  });

  // 不创建新会话，不自动运行
}

function selectModel(key: string) {
  selectedPairKey.value = key;
  const pair = parseKey(key);
  chrome.storage.sync.set({ activeModel: pair || null });
}

function selectLanguage(lang: string) {
  state.targetLang = lang;
  saveConfig({ translateTargetLang: lang }).catch(error => {
    console.error('保存语言设置失败:', error);
    chrome.storage.sync.set({ translateTargetLang: lang });
  });
}

async function copyMessage(content: string) {
  try {
    await navigator.clipboard.writeText(content);
    // 可以添加一个toast提示，这里简单处理
    console.log('消息已复制到剪贴板');
  } catch (e) {
    console.error('复制失败:', e);
  }
}

onMounted(async () => {
  await loadModels();
  await loadSessions();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.translateTargetLang) {
        state.targetLang = changes.translateTargetLang.newValue || 'zh-CN';
      }
    });
  } catch { }

  // 监听窗口聚焦事件（快捷键唤起）
  window.addEventListener('focus', () => {
    if (!isInitialLoad.value) {
      readClipboardAndRun();
    }
  });

  // 初始加载后滚动到底部
  scrollToBottom();
});
</script>

<style scoped>
.prose {
  color: inherit;
}

.prose> :first-child {
  margin-top: 0;
}

.prose> :last-child {
  margin-bottom: 0;
}
</style>
