<template>
  <div ref="rootEl"
    class="flex h-screen w-full flex-col bg-[#f3f3f3] bg-gradient-to-b from-[#f3f3f3] to-white text-foreground">
    <ScrollArea ref="messagesContainer" class="ifocal-scroll-style flex-1 px-4">
      <!-- 顶部工具栏 -->
      <header class="flex items-center gap-2 absolute top-0 left-0 right-0 p-3 z-10">
        <Button variant="ghost" size="icon" :class="['h-8 w-8 shrink-0 rounded-full', bgClass, blurClass]"
          @click="historyOpen = true">
          <Icon icon="ri:menu-line" class="h-5 w-5" />
        </Button>

        <!-- 模型选择 Dropdown -->
        <ModelSelect :current-model-name="currentModelName" :grouped-models="groupedModels"
          :selected-pair-key="selectedPairKey" :bg-class="bgClass" :blur-class="blurClass" @selectModel="selectModel" />

        <div class="flex-1"></div>

        <!-- 语言选择 Dropdown -->
        <LanguageSelect :current-lang-label="currentLangLabel" :current-target-lang="state.targetLang"
          :supported-languages="SUPPORTED_LANGUAGES" :bg-class="bgClass" :blur-class="blurClass"
          @selectLanguage="selectLanguage" />
      </header>

      <!-- 对话区域 -->
      <div class="mx-auto max-w-[50rem] space-y-6 ">
        <!-- 示例问题（仅在无对话时显示） -->
        <div v-if="!currentSession.messages.length && !isBusy" class="space-y-4 mx-auto w-[80%] pt-[38%]">
          <h2 class="text-center text-2xl font-medium text-muted-foreground">
            有什么可以帮忙的？
          </h2>
        </div>

        <!-- 对话历史 -->
        <template v-for="(message, idx) in currentSession.messages" :key="idx">
          <!-- 用户消息 -->
          <div v-if="message.role === 'user'" class="flex justify-end">
            <div class="group relative max-w-[80%]">
              <!-- 附件预览 -->
              <div v-if="message.attachments && message.attachments.length > 0"
                :class="['space-y-2', { 'mb-2': message.content }]">
                <div v-for="(att, attIdx) in message.attachments" :key="attIdx">
                  <!-- 图片附件 -->
                  <img v-if="att.type.startsWith('image/')" :src="att.data" :alt="att.name"
                    class="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    @click="viewAttachment(att)" />
                  <!-- 其他文件附件 -->
                  <div v-else
                    class="flex items-center gap-2 px-3 py-2 bg-white/60 rounded-lg border border-zinc-300 cursor-pointer hover:bg-white/80 transition-colors"
                    @click="downloadAttachment(att)">
                    <Icon :icon="getFileIcon(att.type)" class="h-5 w-5 text-muted-foreground shrink-0" />
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium truncate">{{ att.name }}</div>
                      <div class="text-xs text-muted-foreground">{{ formatFileSize(att.size) }}</div>
                    </div>
                    <Icon icon="ri:download-line" class="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
              <!-- 消息内容 -->
              <div v-if="message.content" v-html="renderMarkdownSafe(message.content)"
                class="rounded-xl !rounded-tr-none bg-zinc-200 px-4 py-3 text-foreground prose prose-sm max-w-none">
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
          <div v-else :ref="el => setAiMessageRef(el, idx)" class="w-full group">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">{{ message.modelName || 'Assistant' }}</span>
              <div class="flex items-center gap-1">
                <!-- 复制按钮 -->
                <Button variant="ghost" size="icon"
                  class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400"
                  @click="copyMessage(message.content)" title="复制">
                  <Icon icon="ri:file-copy-line" class="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div class="w-full">
              <div v-if="message.isError" class="text-red-600">{{ message.content }}</div>
              <div v-else-if="message.content">
                <!-- 解析思考过程和答案 -->
                <template v-if="getParsed(message, idx).reasoning">
                  <template v-if="message.isStreaming && enableReasoning && !getParsed(message, idx).answer">
                    <div class="flex items-center">
                      <Button variant="ghost" size="xs" class="h-6 p-0 text-xs gap-1">
                        <Icon icon="ri:lightbulb-line" class="h-4 w-4 text-muted-foreground" />
                        <span class="text-xs text-muted-foreground shimmer-text">
                          正在思考...
                        </span>
                      </Button>
                      <span class="ml-2 text-muted-foreground" v-if="getReasoningElapsedSeconds(message) > 0">
                        {{ getReasoningElapsedLabel(message) }}s
                      </span>
                    </div>
                  </template>
                  <template v-else>
                    <div class="flex items-center">
                      <Button variant="ghost" size="xs" class="group/inner h-6 p-0 text-xs gap-1"
                        @click="message.reasoningCollapsed = !message.reasoningCollapsed">
                        <div class="relative h-4 w-4">
                          <Icon icon="ri:lightbulb-line"
                            class="absolute left-0 top-0 opacity-100 group-hover/inner:opacity-0 h-4 w-4 text-muted-foreground transition-opacity" />
                          <Icon :icon="message.reasoningCollapsed ? 'ri:arrow-down-s-line' : 'ri:arrow-up-s-line'"
                            class="absolute left-0 top-0 opacity-0 group-hover/inner:opacity-100 h-4 w-4 transition-opacity" />
                        </div>
                        <span class="text-xs text-muted-foreground">
                          思考过程
                        </span>
                      </Button>
                      <span class="ml-2 text-muted-foreground" v-if="getReasoningElapsedSeconds(message) > 0">
                        {{ getReasoningElapsedLabel(message) }}s
                      </span>
                    </div>
                    <div v-if="!message.reasoningCollapsed"
                      class="p-3 bg-white rounded-md prose prose-sm max-w-none !text-muted-foreground text-xs"
                      v-html="renderMarkdown(getParsed(message, idx).reasoning)"></div>
                  </template>
                  <div v-if="getParsed(message, idx).answer" class="h-2"></div>
                  <div class="prose prose-sm max-w-none" v-html="renderMarkdown(getParsed(message, idx).answer)">
                  </div>
                </template>
                <!-- 普通消息（没有思考过程） -->
                <div v-else class="prose prose-sm max-w-none" v-html="renderMarkdown(message.content)"></div>
              </div>
              <div v-else>
                <template v-if="enableReasoning">
                  <Button variant="ghost" size="xs" class="h-6 p-0 text-xs gap-1">
                    <Icon icon="ri:lightbulb-line" class="h-4 w-4 text-muted-foreground" />
                    <span class="text-xs text-muted-foreground shimmer-text">
                      正在思考...
                    </span>
                  </Button>
                </template>
                <template v-else>
                  <div class="space-y-3">
                    <div class="h-3 w-2/3 rounded bg-muted-foreground/20 animate-pulse"></div>
                    <div class="h-3 w-full rounded bg-muted-foreground/20 animate-pulse"></div>
                    <div class="h-3 w-5/6 rounded bg-muted-foreground/20 animate-pulse"></div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>

        <!-- 加载状态（骨架屏/思考动画） -->
        <div v-if="sending" class="w-full">
          <div class="mb-2">
            <span class="text-xs font-medium text-muted-foreground">{{ currentModelName || 'Assistant' }}</span>
          </div>

          <div class="w-full">
            <template v-if="enableReasoning">
              <div class="text-sm text-muted-foreground shimmer-text">正在思考...</div>
            </template>
            <template v-else>
              <div class="space-y-3">
                <div class="h-3 w-2/3 rounded bg-muted-foreground/20 animate-pulse"></div>
                <div class="h-3 w-full rounded bg-muted-foreground/20 animate-pulse"></div>
                <div class="h-3 w-5/6 rounded bg-muted-foreground/20 animate-pulse"></div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 底部操作区 -->
      <footer ref="footerEl" class="p-3 absolute left-0 right-0 bottom-0">
        <ChatInput ref="chatInputRef" v-model="state.text" :sending="isBusy" :task="state.task"
          :enable-streaming="enableStreaming" :enable-reasoning="enableReasoning" :enable-context="enableContext"
          :enable-file-upload="enableFileUpload" :auto-paste-global-assistant="autoPasteGlobalAssistant"
          :bg-class="bgClass" :blur-class="blurClass" @send="handleSend()" @stop="stopGenerating"
          @changeTask="changeTask" @toggleStreaming="toggleStreaming" @toggleReasoning="toggleReasoning"
          @toggleContext="toggleContext" @toggleClipboardListening="toggleClipboardListening"
          @toggleFileUpload="toggleFileUpload" @newChat="() => startNewChat(false)" />
      </footer>
    </ScrollArea>

    <!-- 历史会话抽屉 -->
    <HistoryDrawer v-model:open="historyOpen" :sessions="sessions" :current-session-id="currentSessionId"
      :bg-class="bgClass" :blur-class="blurClass" @switchSession="switchSession" @deleteSession="deleteSession"
      @newChatFromDrawer="startNewChatFromDrawer" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick, type ComponentPublicInstance } from 'vue';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { SUPPORTED_LANGUAGES, SUPPORTED_TASKS, loadConfig, saveConfig, getTaskSettings, updateTaskSettings } from '@/shared/config';
import ModelSelect from './components/ModelSelect.vue';
import LanguageSelect from './components/LanguageSelect.vue';
import ChatInput from './components/ChatInput.vue';
import HistoryDrawer from './components/HistoryDrawer.vue';

type Pair = { channel: string; model: string };
type Channel = { name: string; type: string; apiKey?: string; apiUrl?: string; models?: string[] };

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  modelName?: string; // 生成该消息的模型名称（仅 assistant 消息）
  isStreaming?: boolean; // 标记是否正在流式显示
  reasoningStartedAt?: number; // 思考开始（检测到起始标签）
  reasoningEndedAt?: number;   // 思考结束（检测到闭合标签或完成）
  reasoningCollapsed?: boolean; // 思考过程是否折叠（仅 assistant 消息）
  attachments?: Array<{
    name: string;
    type: string;
    size: number;
    data: string; // base64 编码的数据
  }>; // 附件（仅 user 消息）
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
// 为每个任务类型独立存储模型选择
const selectedModelByTask = ref<Record<string, string>>({
  translate: '',
  chat: '',
  summarize: '',
});
const sending = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const messagesContainer = ref<HTMLElement | null>(null);
const historyOpen = ref(false);
const isInitialLoad = ref(true);
let clipboardWatcher: ReturnType<typeof setInterval> | null = null;
let latestClipboardSnapshot = '';
let lastAutoFilledClipboard = '';
const CLIPBOARD_POLL_INTERVAL = 1000; // ms
let clipboardPollPromise: Promise<void> | null = null;
let clipboardErrorLogged = false;
let windowFocusHandler: (() => void) | null = null;
let windowBlurHandler: (() => void) | null = null;
let saveSessionsTimer: ReturnType<typeof setTimeout> | null = null;
const aiMessageElements = ref<HTMLElement[]>([]);
const enableStreaming = ref(false);
const enableReasoning = ref(false); // 思考模式
const enableContext = ref(false); // 上下文
const enableFileUpload = ref(false); // 文件上传
const reduceVisualEffects = ref(false); // 减弱视觉效果配置
const autoPasteGlobalAssistant = ref(false); // 全局助手：是否自动粘贴剪贴板
const footerEl = ref<HTMLElement | null>(null);
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null);
let footerResizeObserver: ResizeObserver | null = null;
// 当前流式端口（用于停止）
let currentStreamingPort: chrome.runtime.Port | null = null;
// 当前非流式请求 ID（用于中断）
let inflightRequestId: string | null = null;
const abortedRequests = new Set<string>();

// 综合忙碌状态：发送中或存在流式输出中的 AI 消息
const isBusy = computed(() => {
  if (sending.value) return true;
  const session = currentSession.value;
  if (!session) return false;
  return (session.messages || []).some(m => m.role === 'assistant' && (m as any).isStreaming);
});

function isExtensionAlive(): boolean {
  try {
    // 当扩展上下文被失效（关闭/刷新）时，runtime 或 id 可能不可用
    return !!(typeof chrome !== 'undefined' && chrome?.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

function setBottomGap(px: number) {
  const el: any = messagesContainer.value as any;
  const host = el?.$el as HTMLElement | null;
  if (host) host.style.setProperty('--ifocal-bottom-gap', `${Math.max(0, Math.round(px))}px`);
}

function updateBottomGap() {
  const footer = footerEl.value;
  if (!footer) return;
  const extra = 16; // 额外留白
  const gap = footer.offsetHeight + extra;
  setBottomGap(gap);
}


// 在助手页内复制的抑制标记：在一定冷却时间内忽略剪贴板回填
let suppressClipboardUntil = 0;
let lastInAppCopiedText = '';

// 解析缓存，按 会话ID:消息索引 做键，避免模板中重复解析
type ParsedParts = { reasoning: string; answer: string };
const parsedCache: Record<string, { content: string; parsed: ParsedParts }> = {};

function cacheKey(idx: number) {
  return `${currentSessionId.value}:${idx}`;
}

function getParsed(message: Message, idx: number): ParsedParts {
  const key = cacheKey(idx);
  const cur = parsedCache[key];
  if (cur && cur.content === message.content) return cur.parsed;
  const parsed = parseMessageWithReasoning(message.content);
  parsedCache[key] = { content: message.content, parsed };
  return parsed;
}

const state = reactive({
  text: '',
  task: '' as 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat',
  targetLang: 'zh-CN',
  prevLang: 'en' // 上一次选择的语言
});

// 监听输入文本变化，异步刷新底部留白（适配自动增高）
watch(() => state.text, () => nextTick(() => updateBottomGap()));

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

// 设置 AI 消息元素 ref
function setAiMessageRef(el: Element | ComponentPublicInstance | null, idx: number) {
  if (el && el instanceof HTMLElement) {
    aiMessageElements.value[idx] = el;
  }
}

// 获取当前任务的选中模型
const selectedPairKey = computed(() => selectedModelByTask.value[state.task] || '');

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

// 切换会话时清空解析缓存
watch(currentSessionId, () => {
  for (const k in parsedCache) delete (parsedCache as any)[k];
});

// 动态类名：根据 reduceVisualEffects 决定是否应用 backdrop-blur 和背景透明
const blurClass = computed(() => reduceVisualEffects.value ? '' : 'backdrop-blur-md');
const blurClassSm = computed(() => reduceVisualEffects.value ? '' : 'backdrop-blur-sm');
const bgClass = computed(() => reduceVisualEffects.value ? 'bg-white' : 'bg-white/60');

// 获取可滚动元素
function getScrollableElement(): HTMLElement | null {
  if (!messagesContainer.value) return null;

  // ScrollArea 的可滚动元素是 ScrollAreaViewport
  // 尝试多种选择器以确保兼容性
  const el = messagesContainer.value as any;

  // 尝试 1: 通过 data-radix 属性查找
  let scrollableEl = el.$el?.querySelector('[data-radix-scroll-area-viewport]');

  // 尝试 2: 通过 class 查找
  if (!scrollableEl) {
    scrollableEl = el.$el?.querySelector('.scroll-area-viewport');
  }

  // 尝试 3: 查找所有 div，找到有 overflow 的
  if (!scrollableEl && el.$el) {
    const divs = el.$el.querySelectorAll('div');
    for (const div of divs) {
      const style = window.getComputedStyle(div);
      if (style.overflow === 'auto' || style.overflow === 'scroll' ||
        style.overflowY === 'auto' || style.overflowY === 'scroll') {
        scrollableEl = div;
        break;
      }
    }
  }

  return scrollableEl as HTMLElement | null;
}

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    const scrollableEl = getScrollableElement();
    if (scrollableEl) {
      scrollableEl.scrollTop = scrollableEl.scrollHeight;
    } else {
      console.warn('未找到可滚动元素');
    }
  });
}

// 智能滚动：将指定元素滚动到距离顶部指定偏移量的位置
function scrollToElement(element: HTMLElement, offsetTop = 60) {
  nextTick(() => {
    const scrollableEl = getScrollableElement();
    if (scrollableEl && element) {
      const elementTop = element.offsetTop;
      const targetScrollTop = elementTop - offsetTop;
      scrollableEl.scrollTop = targetScrollTop;
    } else {
      console.warn('未找到可滚动元素或目标元素');
    }
  });
}

// 监听消息变化，智能滚动
watch(
  () => currentSession.value.messages.length,
  (newLength, oldLength) => {
    // 每次数量变化清理解析缓存，避免索引错位与缓存污染
    for (const k in parsedCache) delete (parsedCache as any)[k];

    // 只在消息增加时触发滚动
    if (newLength > oldLength) {
      const lastMessage = currentSession.value.messages[newLength - 1];

      if (lastMessage?.role === 'user') {
        // 用户消息：滚动到底部
        scrollToBottom();
      } else if (lastMessage?.role === 'assistant') {
        // AI 消息：根据流式模式决定滚动方式

        if (enableStreaming.value) {
          // 流式模式：滚动到底部
          scrollToBottom();
        } else {
          // 非流式模式：滚动到 AI 消息距离顶部 60px 的位置
          // 使用延迟确保 DOM 已更新并且 ref 已绑定
          setTimeout(() => {
            // 找到最后一条 AI 消息的索引
            let lastAiIndex = -1;
            for (let i = currentSession.value.messages.length - 1; i >= 0; i--) {
              if (currentSession.value.messages[i].role === 'assistant') {
                lastAiIndex = i;
                break;
              }
            }

            const lastAiMessageEl = aiMessageElements.value[lastAiIndex];

            if (lastAiMessageEl) {
              scrollToElement(lastAiMessageEl, 60);
            } else {
              console.warn('lastAiMessageEl 为 null，回退到滚动底部');
              scrollToBottom();
            }
          }, 100); // 延迟 100ms 确保 DOM 和 ref 都已更新
        }
      }
    }
  }
);

// 监听会话变化，自动保存
watch(
  sessions,
  () => {
    // 使用 debounce 避免频繁保存
    if (saveSessionsTimer) clearTimeout(saveSessionsTimer);
    saveSessionsTimer = setTimeout(() => {
      saveSessions();
    }, 500);
  },
  { deep: true }
);

// 监听当前会话 ID 变化，自动保存
watch(currentSessionId, () => {
  saveSessions();
});

// 监听发送状态变化，自动滚动到底部
watch(sending, () => {
  scrollToBottom();
});

function renderMarkdown(content: string) {
  // 使用标准 Markdown 渲染（不启用 breaks）
  // 标准 Markdown 换行规则：行尾两个空格+\n 或 两个 \n（空行）才会换行
  return marked(content, {
    breaks: false, // 关闭 GFM 单换行支持，使用标准 Markdown 换行
    gfm: true      // 启用 GitHub Flavored Markdown 其他特性（表格、删除线等）
  });
}

function renderMarkdownSafe(content: string) {
  return marked(escapeUserHtml(content), {
    breaks: true,
    gfm: true
  });
}

// 新增：更严谨的用户输入转义（包含双引号/单引号）
function escapeUserHtml(text: string) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 解析消息中的思考过程和答案（兼容多种标签/字段，并支持流式未闭合标签）
function parseMessageWithReasoning(content: string): { reasoning: string; answer: string } {
  const text = String(content ?? '');

  // 1) JSON 结构兼容：提取 reasoning/answer 字段
  try {
    // 去除可能的代码块围栏
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    if (jsonStr.trim().startsWith('{')) {
      const obj = JSON.parse(jsonStr);
      if (obj && typeof obj === 'object') {
        const rKey = ['reasoning', 'thought', 'think', 'analysis'].find(k => typeof obj[k] === 'string' && obj[k].trim());
        const aKey = ['answer', 'final', 'output', 'content', 'response', 'message'].find(k => typeof obj[k] === 'string' && obj[k].trim());
        if (rKey || aKey) {
          return {
            reasoning: rKey ? String(obj[rKey]).trim() : '',
            answer: aKey ? String(obj[aKey]).trim() : ''
          };
        }
      }
    }
  } catch { /* 非 JSON 内容，忽略 */ }

  // 2) 标签对兼容：<thought>/<think>/<analysis>/<reasoning> 和 <answer>/<final>/<response>/<output>
  // 仅在内容开头提取思考标签，避免中间出现 <think> 等被误判为思考内容
  const reasoningTagRe = /^\s*<(thought|think|analysis|reasoning)[^>]*>([\s\S]*?)<\/\1>/i;
  const answerTagRe = /<(answer|final|response|output)[^>]*>([\s\S]*?)<\/\1>/i;
  const rPair = text.match(reasoningTagRe);
  const aPair = text.match(answerTagRe);

  if (rPair && aPair) {
    return { reasoning: rPair[2].trim(), answer: aPair[2].trim() };
  }
  if (rPair) {
    // 思考有闭合标签，但答案未使用标签：取闭合标签后的剩余文本作为答案
    const after = text.slice((rPair.index ?? 0) + rPair[0].length).trim();
    return { reasoning: rPair[2].trim(), answer: after };
  }
  if (aPair) {
    return { reasoning: '', answer: aPair[2].trim() };
  }

  // 3) 流式未闭合标签：仅当开头出现思考起始标签时，将后续文本作为 reasoning
  const reasoningOpenRe = /^\s*<(thought|think|analysis|reasoning)[^>]*>/i;
  const open = text.match(reasoningOpenRe);
  if (open) {
    const openIdx = open.index ?? -1;
    const openLen = open[0].length;
    // 若尚未出现对应闭合标签，则将起始标签之后的内容当作 reasoning，之前的当作（临时）answer
    const closeRe = new RegExp(`</${open[1]}>`, 'i');
    if (!closeRe.test(text)) {
      const before = text.slice(0, openIdx).trim();
      const after = text.slice(openIdx + openLen).trim();
      return { reasoning: after, answer: before };
    }
  }

  // 4) 无思考结构：原样作为答案
  return { reasoning: '', answer: text };
}

// 检测是否已出现思考起始/闭合标签（用于流式渲染状态）
function detectReasoningTagState(content: string): { opened: boolean; closed: boolean } {
  const text = String(content ?? '');
  // 仅识别开头的思考起始标签，避免中间的 <think> 被误识别
  const open = text.match(/^\s*<(thought|think|analysis|reasoning)[^>]*>/i);
  if (!open) return { opened: false, closed: false };
  const closeRe = new RegExp(`</${open[1]}>`, 'i');
  const closed = closeRe.test(text);
  return { opened: true, closed };
}

function updateReasoningTimingForMessage(message: Message) {
  const { opened, closed } = detectReasoningTagState(message.content);
  const now = Date.now();
  if (opened && !message.reasoningStartedAt) message.reasoningStartedAt = now;
  if (opened && closed && !message.reasoningEndedAt) message.reasoningEndedAt = now;
}

// 实时计时：在思考未结束时，使用当前时间参与计算
const nowTick = ref(Date.now());
let nowTickTimer: number | null = null;

function getReasoningElapsedSeconds(message: Message): number {
  const start = message.reasoningStartedAt;
  if (!start) return 0;
  const end = message.reasoningEndedAt || nowTick.value;
  const seconds = Math.max(0, (end - start) / 1000);
  // 统一两位小数
  return Number(seconds.toFixed(2));
}

function getReasoningElapsedLabel(message: Message): string {
  return getReasoningElapsedSeconds(message).toFixed(2);
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

  // 限制会话数量（默认最多 50 个）
  const maxCount = 50;
  if (sessions.value.length > maxCount) {
    sessions.value = sessions.value.slice(0, maxCount);
  }

  currentSessionId.value = newSession.id;
  state.text = '';
  lastAutoFilledClipboard = '';
  saveSessions();

  // 如果需要自动运行，读取剪贴板到输入框（不自动发送）
  if (autoRun) {
    readClipboardToInput();
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
  lastAutoFilledClipboard = '';

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
    if (!isExtensionAlive()) {
      // 页面卸载或扩展上下文失效时无需保存，避免抛错噪音
      return;
    }
    // 创建深拷贝以避免引用问题
    const sessionsToSave = JSON.parse(JSON.stringify(sessions.value));
    chrome.storage.local.set(
      {
        chatSessions: sessionsToSave,
        currentSessionId: currentSessionId.value,
      },
      () => {
        const err = chrome.runtime.lastError as any;
        if (err) {
          const msg = String(err?.message || err || '');
          // 常见在关闭页面/扩展重载时出现，属于无害错误，降级为 warn
          if (/context invalidated/i.test(msg) || /message port closed/i.test(msg)) {
            console.warn('保存会话被中断（上下文失效）');
          } else {
            console.error('保存会话失败:', err);
          }
        } else {
          console.log('会话保存成功，已保存', sessionsToSave.length, '个会话');
        }
      }
    );
  } catch (e) {
    const msg = String((e as any)?.message || e || '');
    if (/context invalidated/i.test(msg) || /message port closed/i.test(msg)) {
      console.warn('保存会话被中断（上下文失效）');
    } else {
      console.error('保存会话异常:', e);
    }
  }
}

async function loadSessions() {
  try {
    // 读取配置以决定是否启用自动粘贴
    const globalCfg = await loadConfig();
    const allowAutoPaste = !!globalCfg.autoPasteGlobalAssistant;
    const data = await new Promise<any>(resolve => {
      chrome.storage.local.get(['chatSessions', 'currentSessionId', 'lastSelectedTask'], resolve);
    });



    // 恢复会话列表
    if (data.chatSessions && Array.isArray(data.chatSessions) && data.chatSessions.length > 0) {
      // 深拷贝以避免引用问题
      sessions.value = JSON.parse(JSON.stringify(data.chatSessions));
    } else {
    }

    // 恢复上次选择的模式
    if (data.lastSelectedTask) {
      state.task = data.lastSelectedTask;
    }

    // 恢复当前会话
    if (data.currentSessionId && sessions.value.find(s => s.id === data.currentSessionId)) {
      currentSessionId.value = data.currentSessionId;
      const session = sessions.value.find(s => s.id === data.currentSessionId);
      if (session) {
        // 使用会话的 task，而不是全局的 lastSelectedTask
        state.task = session.task;
      }
    } else if (sessions.value.length > 0) {
      // 使用第一个会话
      currentSessionId.value = sessions.value[0].id;
      const session = sessions.value[0];
      state.task = session.task;

    } else {
      // 创建默认会话并读取剪贴板到输入框
      startNewChat(allowAutoPaste);
      return;
    }

    // 如果是初始加载，读取剪贴板到输入框（不自动发送）
    if (isInitialLoad.value) {
      isInitialLoad.value = false;
      if (allowAutoPaste) {
        readClipboardToInput();
      }
    }
  } catch (e) {
    console.error('加载会话失败:', e);
    // 兜底：创建默认会话，不自动读取剪贴板（除非配置允许）
    const globalCfgFallback = await loadConfig();
    startNewChat(!!globalCfgFallback.autoPasteGlobalAssistant);
  }
}

async function loadModels() {
  const globalConfig = await loadConfig();

  const cfg: any = await new Promise(resolve => chrome.storage.sync.get(['channels', 'defaultModel', 'activeModel'], resolve));
  const localData: any = await new Promise(resolve => chrome.storage.local.get(['selectedModelByTask'], resolve));

  const channels: Channel[] = Array.isArray(cfg.channels) ? cfg.channels : [];
  const pairs = channels.flatMap(ch => (ch.models || []).map(m => {
    // 支持 id#name 格式：id 用于 API 调用和 key 生成，name 用于显示
    const [modelId, displayName] = m.includes('#') ? m.split('#', 2) : [m, m];
    return {
      key: keyOf({ channel: ch.name, model: modelId.trim() }),
      channel: ch.name,
      model: displayName.trim() // 显示名称
    };
  }));
  modelPairs.value = pairs;
  state.targetLang = globalConfig.translateTargetLang;
  state.prevLang = globalConfig.prevLanguage || 'en';

  // 加载每个任务的模型选择
  if (localData.selectedModelByTask) {
    selectedModelByTask.value = { ...selectedModelByTask.value, ...localData.selectedModelByTask };
  }

  // 为所有任务类型预设默认模型（如果尚未设置）
  if (pairs.length > 0) {
    const prefer: Pair | null = cfg.activeModel || cfg.defaultModel || null;
    const defaultKey = prefer && pairs.some(p => p.key === keyOf(prefer)) ? keyOf(prefer) : pairs[0].key;

    // 为每个任务类型设置默认模型（如果该任务还没有选择模型）
    const allTasks: Array<'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat'> = ['translate', 'chat', 'summarize', 'rewrite', 'polish'];
    allTasks.forEach(task => {
      if (!selectedModelByTask.value[task]) {
        selectedModelByTask.value[task] = defaultKey;
      }
    });

    // 保存到 storage
    chrome.storage.local.set({
      selectedModelByTask: selectedModelByTask.value
    });
  }
}

async function fetchClipboardText(): Promise<string | null> {
  try {
    const text = await navigator.clipboard.readText();
    clipboardErrorLogged = false;
    return text ?? '';
  } catch (e) {
    if (!clipboardErrorLogged) {
      console.warn('clipboard read failed', e);
      clipboardErrorLogged = true;
    }
    return null;
  }
}

function applyClipboardText(raw: string | null, force: boolean) {
  if (typeof raw !== 'string') return;
  const trimmed = raw.trim();
  const now = Date.now();
  // 若为助手页面内刚触发的复制（按钮或快捷键），在冷却时间内忽略回填
  if (now < suppressClipboardUntil) {
    return;
  }
  // 永久忽略：如果当前剪贴板内容等于助手页内最近复制的文本，则不回填
  if (trimmed && trimmed === lastInAppCopiedText) {
    return;
  }
  const inputHasValue = !!state.text.trim();
  const showingAutoFilled = state.text === lastAutoFilledClipboard;
  const alreadyApplied = state.text === trimmed;
  // Always refresh snapshot for future comparisons
  const prevSnapshot = latestClipboardSnapshot;
  latestClipboardSnapshot = trimmed;

  // Empty clipboard: only clear when input is already empty
  if (!trimmed) {
    if (!inputHasValue) {
      state.text = '';
      lastAutoFilledClipboard = '';
    }
    return;
  }

  // If user has typed something (value exists and not the auto-filled value), never overwrite
  if (inputHasValue && !showingAutoFilled) {
    return;
  }

  // When input is empty, avoid refilling with the same content we just auto-filled previously
  if (!inputHasValue && trimmed === lastAutoFilledClipboard) {
    return;
  }

  // If the same text is already present, just refresh sentinel
  if (alreadyApplied) {
    lastAutoFilledClipboard = trimmed;
    return;
  }

  // Safe to apply: either input is empty or currently showing auto-filled text
  state.text = trimmed;
  lastAutoFilledClipboard = trimmed;
}

function pollClipboardOnce(force = false): Promise<void> {
  if (clipboardPollPromise && !force) {
    return clipboardPollPromise;
  }
  if (clipboardPollPromise && force) {
    return clipboardPollPromise.then(() => pollClipboardOnce(false));
  }
  clipboardPollPromise = fetchClipboardText()
    .then(result => applyClipboardText(result, force))
    .finally(() => {
      clipboardPollPromise = null;
    });
  return clipboardPollPromise;
}

function startClipboardMonitoring(force = false) {
  if (force) {
    void pollClipboardOnce(true);
  } else {
    void pollClipboardOnce(false);
  }
  if (clipboardWatcher) {
    return;
  }
  clipboardWatcher = window.setInterval(() => {
    void pollClipboardOnce(false);
  }, CLIPBOARD_POLL_INTERVAL);
}

function stopClipboardMonitoring() {
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher);
    clipboardWatcher = null;
  }
  clipboardPollPromise = null;
}

async function readClipboardToInput() {
  await pollClipboardOnce(true);
}

// 文件转 base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function handleSend() {
  const text = state.text.trim();
  const attachmentFiles = chatInputRef.value?.getAttachments() || [];
  const hasAttachments = attachmentFiles.length > 0;
  if ((!text && !hasAttachments) || isBusy.value) return;
  const requestStartAt = Date.now();
  const requestId = `${requestStartAt}-${Math.random().toString(36).slice(2)}`;

  const pair = parseKey(selectedPairKey.value);

  // 获取附件并转换为 base64
  console.log('发送消息，附件数量:', attachmentFiles.length);

  const attachments: Message['attachments'] = [];
  for (const att of attachmentFiles) {
    try {
      const base64Data = await fileToBase64(att.file);
      attachments.push({
        name: att.name,
        type: att.type,
        size: att.size,
        data: base64Data
      });
    } catch (error) {
      console.error('文件转换失败:', error);
      alert(`文件 "${att.name}" 转换失败`);
      return;
    }
  }

  // 加载配置
  const globalConfig = await loadConfig();
  const enableContext = globalConfig.enableContext || false;
  const contextCount = globalConfig.contextMessagesCount || 5;
  const enableReasoning = globalConfig.enableReasoning || false;

  // 添加用户消息到当前会话
  const userMessage: Message = {
    role: 'user',
    content: text,
    attachments: attachments.length > 0 ? attachments : undefined
  };

  const session = sessions.value.find(s => s.id === currentSessionId.value);
  if (session) {
    session.messages.push(userMessage);

    // 如果是第一条消息，更新会话标题
    if (session.messages.length === 1) {
      const titleBase = text || attachmentFiles[0]?.name || '图片消息';
      session.title = generateSessionTitle(titleBase);
    }

    session.updatedAt = Date.now();
    session.task = state.task;

    // 立即触发响应式更新，让用户消息显示出来并滚动到底部
    sessions.value = [...sessions.value];
  }

  state.text = '';
  // 清空附件
  chatInputRef.value?.clearAttachments();

  // 防止发送后因当前剪贴板未变化导致被再次回填
  // 将"最后一次自动填充"的标记设置为当前已知的剪贴板值
  // 这样在剪贴板未发生变化的情况下，轮询不会再次写回输入框
  lastAutoFilledClipboard = latestClipboardSnapshot;
  sending.value = true;

  // 确保骨架屏在可视区域内（在用户消息滚动后再次滚动）
  await nextTick();
  scrollToBottom();

  // 保存当前选中的模型名称，避免回调时已切换模型
  const currentModelNameSnapshot = currentModelName.value;

  // 如果启用流式，使用流式调用
  if (enableStreaming.value) {
    await handleStreamingSend(text, pair, session, currentModelNameSnapshot, enableContext, contextCount, enableReasoning, requestStartAt, requestId, attachments);
  } else {
    inflightRequestId = requestId;
    await handleNonStreamingSend(text, pair, session, currentModelNameSnapshot, enableContext, contextCount, enableReasoning, requestStartAt, requestId, attachments);
  }
}

// 非流式发送
async function handleNonStreamingSend(
  text: string,
  pair: Pair | null,
  session: Session | undefined,
  currentModelNameSnapshot: string,
  enableContext: boolean,
  contextCount: number,
  enableReasoning: boolean,
  requestStartAt: number,
  requestId: string,
  attachments?: Message['attachments']
) {
  const msg: any = { action: 'performAiAction', task: state.task, text, targetLang: state.targetLang, prevLang: state.prevLang, enableReasoning, requestId };
  if (pair) { msg.channel = pair.channel; msg.model = pair.model; }

  // 添加附件
  if (attachments && attachments.length > 0) {
    msg.attachments = attachments;
  }

  // 如果启用上下文，添加历史消息
  if (enableContext && session && session.messages.length > 1) {
    // 获取最近的消息（不包括刚添加的用户消息）
    const historyMessages = session.messages.slice(0, -1);
    // 取最后 N 条消息作为上下文
    const contextMessages = historyMessages.slice(-contextCount);
    msg.context = contextMessages.map(m => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments
    }));
  }

  try {
    chrome.runtime.sendMessage(msg, (resp: any) => {
      try { void chrome.runtime.lastError; } catch { }
      const aborted = requestId && abortedRequests.has(requestId);
      inflightRequestId = null;
      sending.value = false;

      if (aborted) {
        // 已被用户取消：不追加 AI 消息
        abortedRequests.delete(requestId);
        return;
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        isError: false,
        modelName: currentModelNameSnapshot,
        reasoningCollapsed: true
      };

      if (!resp) {
        assistantMessage.content = '错误：无响应';
        assistantMessage.isError = true;
      } else if (resp.ok) {
        assistantMessage.content = String(resp.result || '');
        if (enableReasoning) {
          const parsed = parseMessageWithReasoning(assistantMessage.content);
          if (parsed.reasoning) {
            assistantMessage.reasoningStartedAt = requestStartAt;
            assistantMessage.reasoningEndedAt = Date.now();
          }
        }
      } else {
        assistantMessage.content = `错误：${resp.error || '未知错误'}`;
        assistantMessage.isError = true;
      }

      if (session) {
        session.messages.push(assistantMessage);
        session.updatedAt = Date.now();

        // 立即保存会话
        saveSessions();

        // 触发响应式更新
        sessions.value = [...sessions.value];
      }
    });
  } catch (e: any) {
    inflightRequestId = null;
    sending.value = false;

    const errorMessage: Message = {
      role: 'assistant',
      content: `错误：${String(e?.message || e || '调用失败')}`,
      isError: true,
      modelName: currentModelNameSnapshot,
      reasoningCollapsed: true
    };

    if (session) {
      session.messages.push(errorMessage);
      session.updatedAt = Date.now();

      // 立即保存会话
      saveSessions();

      // 触发响应式更新
      sessions.value = [...sessions.value];
    }
  }
}

// 流式发送（真实流式，使用 Port 长连接）
async function handleStreamingSend(
  text: string,
  pair: Pair | null,
  session: Session | undefined,
  currentModelNameSnapshot: string,
  enableContext: boolean,
  contextCount: number,
  enableReasoning: boolean,
  requestStartAt: number,
  requestId: string,
  attachments?: Message['attachments']
) {
  const msg: any = { action: 'performAiAction', task: state.task, text, targetLang: state.targetLang, prevLang: state.prevLang, enableReasoning };
  if (pair) { msg.channel = pair.channel; msg.model = pair.model; }

  // 添加附件
  if (attachments && attachments.length > 0) {
    msg.attachments = attachments;
  }

  // 如果启用上下文,添加历史消息
  if (enableContext && session && session.messages.length > 1) {
    const historyMessages = session.messages.slice(0, -1);
    const contextMessages = historyMessages.slice(-contextCount);
    msg.context = contextMessages.map(m => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments
    }));
  }

  try {
    // 建立 Port 长连接
    const port = chrome.runtime.connect({ name: 'streaming' });
    currentStreamingPort = port;

    let messageIndex = -1; // 延迟创建消息，等收到 start 或第一个 chunk 时再创建

    // 监听 Port 消息
    port.onMessage.addListener((response: any) => {
      if (!session) return;

      if (response.type === 'start') {

        // 此时才创建空的 AI 消息并关闭骨架屏
        const assistantMessage: Message = {
          role: 'assistant',
          content: '',
          isError: false,
          modelName: currentModelNameSnapshot,
          isStreaming: true,
          reasoningCollapsed: true
        };

        session.messages.push(assistantMessage);
        messageIndex = session.messages.length - 1;
        session.updatedAt = Date.now();
        sessions.value = [...sessions.value]; // 触发响应式更新

        // 立即关闭骨架屏loading动画
        sending.value = false;
      } else if (response.type === 'chunk') {
        // 真实流式：追加内容
        if (messageIndex === -1) {
          // 如果没有收到 start 消息，在第一个 chunk 时创建消息
          const assistantMessage: Message = {
            role: 'assistant',
            content: response.content,
            isError: false,
            modelName: currentModelNameSnapshot,
            isStreaming: true,
            reasoningCollapsed: true
          };
          session.messages.push(assistantMessage);
          messageIndex = session.messages.length - 1;
          session.updatedAt = Date.now();
          sending.value = false;
        } else {
          const message = session.messages[messageIndex];
          if (message) {
            message.content += response.content;
            // 更新思考计时
            updateReasoningTimingForMessage(message);
          }
        }
        sessions.value = [...sessions.value]; // 触发响应式更新
        scrollToBottom();
      } else if (response.type === 'done') {
        if (messageIndex >= 0) {
          const message = session.messages[messageIndex];
          if (message) {
            message.isStreaming = false;
            if (enableReasoning) {
              const state = detectReasoningTagState(message.content);
              if (state.opened && !message.reasoningStartedAt) {
                message.reasoningStartedAt = requestStartAt;
              }
              if (state.opened && !message.reasoningEndedAt) {
                message.reasoningEndedAt = Date.now();
              }
            }
          }
        }
        sending.value = false; // 确保关闭骨架屏
        saveSessions();
        sessions.value = [...sessions.value];
        try { port.disconnect(); } catch { }
        if (currentStreamingPort === port) currentStreamingPort = null;
      } else if (response.type === 'error') {
        console.error('流式响应错误:', response.error);

        if (messageIndex === -1) {
          // 如果还没创建消息，创建一个错误消息
          const errorMessage: Message = {
            role: 'assistant',
            content: `错误：${response.error}`,
            isError: true,
            modelName: currentModelNameSnapshot,
            reasoningCollapsed: true
          };
          session.messages.push(errorMessage);
          session.updatedAt = Date.now();
        } else {
          const message = session.messages[messageIndex];
          if (message) {
            message.content = `错误：${response.error}`;
            message.isError = true;
            message.isStreaming = false;
          }
        }

        sending.value = false;
        saveSessions();
        sessions.value = [...sessions.value];
        try { port.disconnect(); } catch { }
        if (currentStreamingPort === port) currentStreamingPort = null;
      }
    });

    // 监听 Port 断开
    port.onDisconnect.addListener(() => {
      if (currentStreamingPort === port) currentStreamingPort = null;
      // 无论是否仍处于“发送中”骨架阶段，都要关闭流式标记
      if (session && messageIndex >= 0) {
        const message = session.messages[messageIndex];
        if (message && message.isStreaming) {
          message.isStreaming = false;
          if (!message.content) {
            message.content = '错误：连接中断';
            message.isError = true;
          }
          saveSessions();
          sessions.value = [...sessions.value];
        }
      }
      if (sending.value) sending.value = false;
    });

    // 发送请求
    try {
      port.postMessage(msg);
    } catch (e) {
      console.error('发送流式请求失败:', e);
      if (session) {
        session.messages.push({
          role: 'assistant',
          content: `错误：${String((e as any)?.message || e || '发送失败')}`,
          isError: true,
          modelName: currentModelNameSnapshot,
          reasoningCollapsed: true,
        });
        sessions.value = [...sessions.value];
      }
      sending.value = false;
      try { port.disconnect(); } catch { }
      if (currentStreamingPort === port) currentStreamingPort = null;
    }
  } catch (e: any) {
    sending.value = false;

    const errorMessage: Message = {
      role: 'assistant',
      content: `错误：${String(e?.message || e || '调用失败')}`,
      isError: true,
      modelName: currentModelNameSnapshot,
      reasoningCollapsed: true
    };

    if (session) {
      session.messages.push(errorMessage);
      session.updatedAt = Date.now();
      saveSessions();
      sessions.value = [...sessions.value];
    }
  }
}

// 停止当前生成（优先断开流式端口）
function stopGenerating() {
  try {
    // 立即关闭本地“忙碌/骨架屏”，避免 UI 残留
    if (sending.value) sending.value = false;
    // 主动清理可能残留的 isStreaming 标记，避免 isBusy 计算为真
    const session = currentSession.value;
    if (session && Array.isArray(session.messages)) {
      let touched = false;
      for (const m of session.messages) {
        if (m.role === 'assistant' && (m as any).isStreaming) {
          (m as any).isStreaming = false;
          // 强制覆盖为“已中断”，不保留任何既有片段
          m.content = '已中断';
          m.isError = false;
          m.reasoningCollapsed = true;
          // 清理计时
          delete (m as any).reasoningStartedAt;
          delete (m as any).reasoningEndedAt;
          touched = true;
        }
      }
      if (touched) {
        try { saveSessions(); } catch { }
        sessions.value = [...sessions.value];
      }
    }

    if (currentStreamingPort) {
      try { currentStreamingPort.disconnect(); } catch { }
      currentStreamingPort = null;
      return;
    }
    // 非流式：发送 abort 给后台，并忽略该请求的回调
    if (inflightRequestId) {
      abortedRequests.add(inflightRequestId);
      try {
        chrome.runtime.sendMessage({ action: 'abortRequest', requestId: inflightRequestId }, () => {
          try { void chrome.runtime.lastError; } catch { }
        });
      } catch { }
      inflightRequestId = null;
      if (sending.value) sending.value = false;
      // 在当前会话尾部追加一条“已中断”AI 消息
      if (session) {
        session.messages.push({
          role: 'assistant',
          content: '已中断',
          isError: false,
          modelName: currentModelName.value,
          reasoningCollapsed: true
        });
        session.updatedAt = Date.now();
        try { saveSessions(); } catch { }
        sessions.value = [...sessions.value];
      }
    }
  } catch { }
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

async function changeTask(newTask: 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat') {
  if (state.task === newTask) return;

  state.task = newTask;

  // 如果切换后的任务没有选择模型，自动选择第一个可用模型
  if (!selectedModelByTask.value[newTask] && modelPairs.value.length > 0) {
    selectedModelByTask.value[newTask] = modelPairs.value[0].key;

    // 保存到 storage
    chrome.storage.local.set({
      selectedModelByTask: selectedModelByTask.value
    });
  }

  // 加载新任务的功能开关
  try {
    const globalConfig = await loadConfig();
    const taskSettings = getTaskSettings(globalConfig, newTask);
    enableStreaming.value = taskSettings.enableStreaming;
    enableReasoning.value = taskSettings.enableReasoning;
    enableContext.value = taskSettings.enableContext;
    enableFileUpload.value = taskSettings.enableFileUpload;
    console.log(`切换到任务 ${newTask}，功能开关已更新:`, taskSettings);
  } catch (e) {
    console.error('加载任务设置失败:', e);
  }

  // 保存当前选择的任务到配置（记忆功能）
  saveConfig({ defaultTask: newTask }).catch(e => {
    console.error('保存任务类型失败:', e);
  });

  // 同时保存到 local storage（用于快速恢复）
  chrome.storage.local.set({ lastSelectedTask: newTask }).catch(e => {
    console.error('保存最后选择的任务失败:', e);
  });

  // 不创建新会话，不自动运行
}

function selectModel(key: string) {
  // 为当前任务保存模型选择
  selectedModelByTask.value[state.task] = key;

  // 保存到 storage
  chrome.storage.local.set({
    selectedModelByTask: selectedModelByTask.value
  });
}

function selectLanguage(lang: string) {
  // 智能语言切换逻辑：
  // 当用户切换语言时，将当前的 targetLang 保存为 prevLang
  // 然后将新选择的语言设置为 targetLang
  const oldTargetLang = state.targetLang;
  state.prevLang = oldTargetLang;
  state.targetLang = lang;

  saveConfig({
    translateTargetLang: lang,
    prevLanguage: oldTargetLang
  }).catch(error => {
    console.error('保存语言设置失败:', error);
    chrome.storage.sync.set({
      translateTargetLang: lang,
      prevLanguage: oldTargetLang
    });
  });
}

async function copyMessage(content: string) {
  try {
    await navigator.clipboard.writeText(content);
    // 可以添加一个toast提示，这里简单处理
    console.log('消息已复制到剪贴板');
    // 标记为页面内复制，短时间内忽略回填
    lastInAppCopiedText = String(content ?? '').trim();
    suppressClipboardUntil = Date.now() + 1500; // 1.5s 冷却
  } catch (e) {
    console.error('复制失败:', e);
  }
}

// 查看附件（图片）
function viewAttachment(att: any) {
  // 在新窗口打开图片
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(`
      <html>
        <head><title>${att.name}</title></head>
        <body style="margin:0;display:flex;align-items:center;justify-content:center;background:#000;">
          <img src="${att.data}" style="max-width:100%;max-height:100vh;" />
        </body>
      </html>
    `);
  }
}

// 下载附件
function downloadAttachment(att: any) {
  const link = document.createElement('a');
  link.href = att.data;
  link.download = att.name;
  link.click();
}

// 获取文件图标
function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return 'ri:image-line';
  if (type === 'application/pdf') return 'ri:file-pdf-line';
  if (type.includes('word')) return 'ri:file-word-line';
  if (type.includes('excel') || type.includes('spreadsheet')) return 'ri:file-excel-line';
  if (type.includes('powerpoint') || type.includes('presentation')) return 'ri:file-ppt-line';
  if (type.startsWith('text/')) return 'ri:file-text-line';
  return 'ri:file-line';
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function toggleStreaming(checked: boolean) {
  enableStreaming.value = checked;
  try {
    await updateTaskSettings(state.task, { enableStreaming: checked });
    console.log(`任务 ${state.task} 的流式响应设置已保存:`, checked);
  } catch (e) {
    console.error('保存流式响应设置失败:', e);
  }
}

async function toggleReasoning(checked: boolean) {
  enableReasoning.value = checked;
  try {
    await updateTaskSettings(state.task, { enableReasoning: checked });
    console.log(`任务 ${state.task} 的思考模式设置已保存:`, checked);
  } catch (e) {
    console.error('保存思考模式设置失败:', e);
  }
}


async function toggleContext(checked: boolean) {
  enableContext.value = checked;
  try {
    await updateTaskSettings(state.task, { enableContext: checked });
    console.log(`任务 ${state.task} 的上下文设置已保存:`, checked);
  } catch (e) {
    console.error('保存上下文设置失败:', e);
  }
}

async function toggleFileUpload(checked: boolean) {
  enableFileUpload.value = checked;
  try {
    await updateTaskSettings(state.task, { enableFileUpload: checked });
    console.log(`任务 ${state.task} 的文件上传设置已保存:`, checked);
  } catch (e) {
    console.error('保存文件上传设置失败:', e);
  }
}

async function toggleClipboardListening(checked: boolean) {
  autoPasteGlobalAssistant.value = checked;
  try {
    await saveConfig({ autoPasteGlobalAssistant: checked });
    console.log('监听剪切板设置已保存:', checked);
  } catch (e) {
    console.error('保存监听剪切板设置失败:', e);
  }

  // 立即启停监听器
  if (checked && document.hasFocus()) {
    startClipboardMonitoring(true);
  } else {
    stopClipboardMonitoring();
  }
}

onMounted(async () => {
  await loadModels();
  await loadSessions();

  // 清理历史会话中可能遗留的 isStreaming 标记，避免误判忙碌态
  try {
    let touched = false;
    for (const s of sessions.value) {
      for (const m of s.messages) {
        if (m.role === 'assistant' && (m as any).isStreaming) {
          (m as any).isStreaming = false;
          touched = true;
        }
      }
    }
    if (touched) {
      saveSessions();
      sessions.value = [...sessions.value];
    }
  } catch { }

  // 加载全局配置
  const globalConfig = await loadConfig();

  // 根据当前任务加载对应的功能开关
  const taskSettings = getTaskSettings(globalConfig, state.task);
  enableStreaming.value = taskSettings.enableStreaming;
  enableReasoning.value = taskSettings.enableReasoning;
  enableContext.value = taskSettings.enableContext;
  enableFileUpload.value = taskSettings.enableFileUpload;

  reduceVisualEffects.value = globalConfig.reduceVisualEffects || false;
  autoPasteGlobalAssistant.value = !!globalConfig.autoPasteGlobalAssistant;

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.translateTargetLang) {
        state.targetLang = changes.translateTargetLang.newValue || 'zh-CN';
      }
      // 监听任务设置变化，更新当前任务的功能开关
      if (area === 'sync' && changes.taskSettings) {
        const newTaskSettings = changes.taskSettings.newValue;
        if (newTaskSettings && newTaskSettings[state.task]) {
          const currentTaskSettings = newTaskSettings[state.task];
          enableStreaming.value = currentTaskSettings.enableStreaming ?? false;
          enableReasoning.value = currentTaskSettings.enableReasoning ?? false;
          enableContext.value = currentTaskSettings.enableContext ?? false;
          enableFileUpload.value = currentTaskSettings.enableFileUpload ?? false;
          console.log(`检测到任务 ${state.task} 的设置变化，已更新功能开关`);
        }
      }
      if (area === 'sync' && changes.reduceVisualEffects) {
        reduceVisualEffects.value = changes.reduceVisualEffects.newValue || false;
      }
      if (area === 'sync' && changes.autoPasteGlobalAssistant) {
        autoPasteGlobalAssistant.value = !!changes.autoPasteGlobalAssistant.newValue;
        if (autoPasteGlobalAssistant.value && document.hasFocus()) {
          startClipboardMonitoring(true);
        } else {
          stopClipboardMonitoring();
        }
      }
    });
  } catch { }

  windowFocusHandler = () => {
    if (autoPasteGlobalAssistant.value) {
      startClipboardMonitoring(true);
    }
  };
  windowBlurHandler = () => {
    stopClipboardMonitoring();
  };

  window.addEventListener('focus', windowFocusHandler);
  window.addEventListener('blur', windowBlurHandler);
  // 监听在助手页内的复制事件，抑制剪贴板回填
  const onInAppCopy = (e: ClipboardEvent) => {
    try {
      lastInAppCopiedText = String(window.getSelection()?.toString() ?? '').trim();
    } catch { lastInAppCopiedText = ''; }
    suppressClipboardUntil = Date.now() + 1500; // 1.5s 冷却
  };
  document.addEventListener('copy', onInAppCopy);
  if (document.hasFocus() && autoPasteGlobalAssistant.value) {
    startClipboardMonitoring(true);
  }

  // 监听窗口关闭事件，确保保存会话
  window.addEventListener('beforeunload', () => {
    // 清理定时器
    if (saveSessionsTimer) {
      clearTimeout(saveSessionsTimer);
      saveSessionsTimer = null;
    }
    stopClipboardMonitoring();
    // 立即同步保存会话
    saveSessions();
  });

  // 初始加载后滚动到底部
  setTimeout(() => {
    scrollToBottom();
  }, 150);

  // 启动“思考用时”心跳，实时刷新
  try {
    if (nowTickTimer) clearInterval(nowTickTimer);
    nowTickTimer = window.setInterval(() => { nowTick.value = Date.now(); }, 100);
  } catch { }

  // 监听 footer 尺寸变化以动态设置内容底部留白
  try {
    footerResizeObserver = new ResizeObserver(() => updateBottomGap());
    if (footerEl.value) footerResizeObserver.observe(footerEl.value);
  } catch { }
  window.addEventListener('resize', updateBottomGap);
  await nextTick();
  updateBottomGap();
});

onBeforeUnmount(() => {
  if (windowFocusHandler) {
    window.removeEventListener('focus', windowFocusHandler);
    windowFocusHandler = null;
  }
  if (windowBlurHandler) {
    window.removeEventListener('blur', windowBlurHandler);
    windowBlurHandler = null;
  }
  stopClipboardMonitoring();
  // 清理定时器
  if (saveSessionsTimer) {
    clearTimeout(saveSessionsTimer);
    saveSessionsTimer = null;
  }
  // 组件卸载前保存会话
  saveSessions();
  // 移除 copy 监听
  try { document.removeEventListener('copy', onInAppCopy as any); } catch { }
  if (footerResizeObserver) footerResizeObserver.disconnect();
  window.removeEventListener('resize', updateBottomGap);
  // 停止“思考用时”心跳
  try { if (nowTickTimer) clearInterval(nowTickTimer); } catch { }
});
</script>

<style>
.prose {
  color: inherit;
}

.prose> :first-child {
  margin-top: 0;
}

.prose> :last-child {
  margin-bottom: 0;
}

/* 减少段落间距，避免过多换行 */
.prose p {
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  white-space: break-spaces;
}

/* 确保第一个段落没有上边距 */
.prose p:first-child {
  margin-top: 0;
}

/* 确保最后一个段落没有下边距 */
.prose p:last-child {
  margin-bottom: 0;
}

/* 统一链接样式：在浅底/深底下都保证可读性 */
.prose a {
  color: #2563eb;
  /* 蓝色链接 */
  text-decoration: underline;
  text-underline-offset: 2px;
}

.prose a:hover {
  color: #1d4ed8;
}

/* 行内代码样式（更大字号、更清晰的背景与圆角） */
.prose code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.93rem;
  background-color: rgba(2, 6, 23, 0.06);
  /* slate-950 @ ~6% */
  padding: 0.15em 0.35em;
  border-radius: 0.375rem;
  /* rounded-md */
}

/* 代码块：增加字号、行高、内边距与边框，保证可读性 */
.prose pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.93rem;
  line-height: 1.55;
  background-color: #f6f8fa;
  /* 与 GitHub 接近的浅灰 */
  border: 1px solid #e5e7eb;
  /* zinc-200 边框 */
  border-radius: 0.5rem;
  padding: 0.85rem 1rem;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

/* 避免代码块内再叠加行内 code 的背景与内边距 */
.prose pre code {
  background: transparent;
  padding: 0;
  font-size: 0.93rem;
}

/* 用户消息（深色背景）的 prose-invert 样式优化 */
.prose-invert {
  color: inherit;
}

/* 深底部场景下（若未来启用）仍然可读 */
.prose-invert a {
  color: #93c5fd;
}

.prose-invert code {
  color: inherit;
  background-color: rgba(255, 255, 255, 0.12);
}

.shimmer-text {
  position: relative;
  display: inline-block;
  background: linear-gradient(90deg, rgba(150, 150, 150, 0.5), rgba(80, 80, 80, 1), rgba(150, 150, 150, 0.5));
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: shimmer 2s linear infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}

.prose hr {
  margin: 1em 0 !important;
}

.ifocal-scroll-style>div>:not([class]) {
  padding-top: 60px;
  padding-bottom: var(--ifocal-bottom-gap, 150px);
}
</style>
