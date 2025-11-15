<template>
  <div class="mx-auto max-w-3xl space-y-2">
    <!-- 快捷操作按钮 -->
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="sm" class="gap-1"
        :class="[bgClass, 'rounded-2xl', blurClassSm, { '!bg-slate-800/80 !text-white': task === 'translate' }]"
        @click="$emit('changeTask', 'translate')">
        <Icon icon="ri:translate-ai" class="h-4 w-4" />
        翻译
      </Button>
      <Button variant="ghost" size="sm" class="gap-1"
        :class="[bgClass, 'rounded-2xl', blurClassSm, { '!bg-slate-800/80 !text-white': task === 'chat' }]"
        @click="$emit('changeTask', 'chat')">
        <Icon icon="ri:chat-ai-line" class="h-4 w-4" />
        聊天
      </Button>
      <Button variant="ghost" size="sm" class="gap-1"
        :class="[bgClass, 'rounded-2xl', blurClassSm, { '!bg-slate-800/80 !text-white': task === 'summarize' }]"
        @click="$emit('changeTask', 'summarize')">
        <Icon icon="ri:quill-pen-ai-line" class="h-4 w-4" />
        总结
      </Button>

      <div class="flex-1"></div>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" :class="['h-8 w-8 shrink-0 rounded-full', bgClass, blurClass]">
            <Icon icon="ri:apps-2-ai-line" class="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" :class="['w-56 rounded-2xl border-none', bgClass, blurClass]">
          <ScrollArea class="h-60 py-1 px-3">
            <!-- 流式开关 -->
            <div class="py-1 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon icon="ri:dvd-ai-line" class="h-4 w-4" />
                <span class="text-sm font-medium">流式响应</span>
              </div>
              <Switch :model-value="enableStreaming" @update:modelValue="$emit('toggleStreaming', $event)" />
            </div>
            <!-- 思考模式 -->
            <div class="py-1 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon icon="ri:lightbulb-ai-line" class="h-4 w-4" />
                <span class="text-sm font-medium">思考模式</span>
              </div>
              <Switch :model-value="enableReasoning" @update:modelValue="$emit('toggleReasoning', $event)" />
            </div>

            <!-- 启用上下文 -->
            <div class="py-1 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon icon="ri:message-ai-3-line" class="h-4 w-4" />
                <span class="text-sm font-medium">启用上下文</span>
              </div>
              <Switch :model-value="enableContext" @update:modelValue="$emit('toggleContext', $event)" />
            </div>
            <!-- 监听剪切板 -->
            <div class="py-1 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon icon="ri:file-ai-line" class="h-4 w-4" />
                <span class="text-sm font-medium">监听剪切板</span>
              </div>
              <Switch :model-value="autoPasteGlobalAssistant" @update:modelValue="$emit('toggleClipboardListening', $event)" />
            </div>
            <!-- 网络搜索（占位） -->
            <div class="py-1 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon icon="ri:search-ai-line" class="h-4 w-4" />
                <span class="text-sm font-medium">网络搜索</span>
              </div>
              <Switch disabled />
            </div>
            <DropdownMenuSeparator />
            <!-- 添加图片和文件（占位） -->
            <div class="py-2 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon icon="ri:attachment-2" class="h-4 w-4" />
                <span class="text-sm font-medium">添加图片和文件</span>
              </div>
            </div>
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" :class="['h-8 w-8 shrink-0 rounded-full', bgClass, blurClass]"
              @click="$emit('newChat')">
              <Icon icon="ri:pencil-ai-2-line" class="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>新会话</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- 输入框容器 -->
    <div :class="['relative rounded-xl', bgClass, blurClass]">
      <Textarea
        v-model="innerValue"
        v-autosize="8"
        :rows="3"
        placeholder="输入你想了解到内容"
        class="resize-none rounded-xl border-none"
        @keydown.enter.exact.prevent="$emit('send')"
      />
      <!-- 发送按钮（右下角） -->
      <Button variant="ghost" size="icon"
        class="absolute bottom-2 right-2 h-7 w-7 rounded-xl !bg-slate-800 !text-white"
        @click="$emit('send')"
        v-show="(innerValue || '').trim() && !sending">
        <Icon icon="ri:send-plane-2-fill" class="h-3 w-3" />
      </Button>
      <!-- 停止按钮（发送后到 AI 响应结束期间显示） -->
      <Button
        variant="ghost"
        size="icon"
        class="absolute bottom-2 right-2 h-7 w-7 rounded-xl !bg-slate-800 !text-white"
        @click="$emit('stop')"
        v-show="sending"
      >
        <Icon icon="ri:stop-line" class="h-3 w-3" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, type Directive } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const props = defineProps<{
  modelValue: string
  sending: boolean
  task: 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat'
  enableStreaming: boolean
  enableReasoning: boolean
  enableContext: boolean
  autoPasteGlobalAssistant: boolean
  bgClass?: string
  blurClass?: string
  blurClassSm?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'send'): void
  (e: 'stop'): void
  (e: 'changeTask', task: 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat'): void
  (e: 'toggleStreaming', checked: boolean): void
  (e: 'toggleReasoning', checked: boolean): void
  (e: 'toggleContext', checked: boolean): void
  (e: 'toggleClipboardListening', checked: boolean): void
  (e: 'newChat'): void
}>()

const blurClassSm = computed(() => props.blurClass ? 'backdrop-blur-sm' : '')
const innerValue = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

// 本地 v-autosize 指令
const vAutosize: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    const textarea = resolveTextarea(el)
    if (!textarea) return
    const onInput = () => adjustTextareaHeight(textarea, binding.value)
    textarea.style.overflowY = 'hidden'
    textarea.addEventListener('input', onInput)
    void nextTick(() => adjustTextareaHeight(textarea, binding.value))
    ;(el as any).__autosizeCleanup__ = () => textarea.removeEventListener('input', onInput)
  },
  updated(el, binding) {
    const textarea = resolveTextarea(el)
    if (!textarea) return
    adjustTextareaHeight(textarea, binding.value)
  },
  beforeUnmount(el) {
    const cleanup = (el as any).__autosizeCleanup__ as (() => void) | undefined
    if (cleanup) cleanup()
  }
}

function resolveTextarea(el: HTMLElement): HTMLTextAreaElement | null {
  if (el.tagName === 'TEXTAREA') return el as HTMLTextAreaElement
  const inner = el.querySelector('textarea')
  return inner as HTMLTextAreaElement | null
}

function parsePx(v: string | null): number {
  if (!v) return 0
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function getLineHeightPx(el: HTMLElement): number {
  const cs = getComputedStyle(el)
  const lh = cs.lineHeight
  if (lh && lh !== 'normal') return parsePx(lh)
  const fs = parsePx(cs.fontSize) || 14
  return Math.round(fs * 1.4)
}

function adjustTextareaHeight(textarea: HTMLTextAreaElement, maxLines?: number) {
  const cs = getComputedStyle(textarea)
  const padding = parsePx(cs.paddingTop) + parsePx(cs.paddingBottom)
  const border = parsePx(cs.borderTopWidth) + parsePx(cs.borderBottomWidth)
  const lineHeight = getLineHeightPx(textarea)
  const maxRows = Math.max(1, Number(maxLines || 8))
  const maxHeight = lineHeight * maxRows + padding + border
  textarea.style.height = 'auto'
  const newHeight = Math.min(textarea.scrollHeight, Math.ceil(maxHeight))
  textarea.style.maxHeight = `${Math.ceil(maxHeight)}px`
  textarea.style.height = `${newHeight}px`
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
}
</script>
