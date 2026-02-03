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
              <Switch :model-value="autoPasteGlobalAssistant"
                @update:modelValue="$emit('toggleClipboardListening', $event)" />
            </div>
            <!-- 文件上传 -->
            <div class="py-1 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon icon="ri:attachment-2" class="h-4 w-4" />
                <span class="text-sm font-medium">文件上传</span>
              </div>
              <Switch :model-value="enableFileUpload" @update:modelValue="$emit('toggleFileUpload', $event)" />
            </div>
            <!-- 网络搜索（占位） -->
            <div class="py-1 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon icon="ri:search-ai-line" class="h-4 w-4" />
                <span class="text-sm font-medium">网络搜索</span>
              </div>
              <Switch disabled />
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
    <Textarea v-model="innerValue" v-autosize="8" :rows="2" placeholder="输入你想了解到内容"
      class="resize-none rounded-xl pb-11" @keydown.enter.exact.prevent="$emit('send')"
      @paste="handlePaste" />
      <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <!-- 输入框功能区 -->
        <div class="flex items-center pointer-events-auto">
          <!-- 附件预览区域 -->
          <div v-if="attachments.length > 0" class="flex flex-wrap gap-2">
            <div v-for="(file, idx) in attachments" :key="idx"
              class="relative group flex items-center gap-2 py-1 px-2 bg-white/60 rounded-full border border-zinc-200">
              <!-- 文件图标 -->
              <Icon :icon="getFileIcon(file.type)" class="h-4 w-4 text-muted-foreground shrink-0" />
              <!-- 文件名 -->
              <span class="text-xs text-foreground truncate max-w-[150px]">{{ file.name }}</span>
              <!-- 文件大小 -->
              <span class="text-xs text-muted-foreground">{{ formatFileSize(file.size) }}</span>
              <!-- 删除按钮 -->
              <Button variant="ghost" size="icon"
                class="h-4 w-4 absolute -top-1 -right-1 rounded-full !bg-red-500 !text-white opacity-0 group-hover:opacity-100 transition-opacity"
                @click="removeAttachment(idx)">
                <Icon icon="ri:close-line" class="h-3 w-3" />
              </Button>
            </div>
          </div>
          <!-- 上传文件按钮 -->
          <TooltipProvider v-else-if="enableFileUpload">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" class="h-7 w-7 rounded-full hover:bg-zinc-200/80 relative"
                  @click="triggerFileInput">
                  <Icon icon="ri:attachment-2" class="h-4 w-4 text-muted-foreground" />
                  <input ref="fileInputRef" type="file" :accept="acceptedFileTypes" class="hidden"
                    @change="handleFileSelect" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>添加图片和文件</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div class="flex-1"></div>

        <!-- 右侧：发送/停止按钮 -->
        <div class="flex gap-1 pointer-events-auto">
          <!-- 发送按钮 -->
          <Button variant="ghost" size="icon" class="h-7 w-7 rounded-full !bg-slate-800 !text-white"
            @click="$emit('send')" v-show="(innerValue || '').trim() && !sending">
            <Icon icon="ri:send-plane-2-fill" class="h-3 w-3" />
          </Button>
          <!-- 停止按钮 -->
          <Button variant="ghost" size="icon" class="h-7 w-7 rounded-full !bg-slate-800 !text-white"
            @click="$emit('stop')" v-show="sending">
            <Icon icon="ri:stop-fill" class="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, type Directive } from 'vue'
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

interface FileAttachment {
  name: string
  size: number
  type: string
  file: File
}

const props = defineProps<{
  modelValue: string
  sending: boolean
  task: 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat'
  enableStreaming: boolean
  enableReasoning: boolean
  enableContext: boolean
  autoPasteGlobalAssistant: boolean
  enableFileUpload: boolean
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
  (e: 'toggleFileUpload', checked: boolean): void
  (e: 'newChat'): void
  (e: 'attachmentsChange', files: FileAttachment[]): void
}>()

// 暴露方法给父组件
defineExpose({
  getAttachments: () => attachments.value,
  clearAttachments: () => {
    attachments.value = []
    emit('attachmentsChange', [])
  }
})

// 文件上传相关
const fileInputRef = ref<HTMLInputElement | null>(null)
const attachments = ref<FileAttachment[]>([])

// 支持的文件类型
const acceptedFileTypeList = [
  // 图片
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // 文档
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // 文本
  'text/plain',
  'text/csv',
  'text/markdown',
]
const acceptedFileTypes = acceptedFileTypeList.join(',')

// 最大文件大小（10MB）
const MAX_FILE_SIZE = 10 * 1024 * 1024

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  const file = files[0] // 只取第一个文件
  if (!addAttachmentFromFile(file)) {
    input.value = ''
    return
  }

  // 清空 input，允许重复选择同一文件
  input.value = ''

  // 通知父组件
  emit('attachmentsChange', attachments.value)
}

function handlePaste(event: ClipboardEvent) {
  if (!props.enableFileUpload) return
  const items = event.clipboardData?.items
  if (!items || items.length === 0) return

  let file: File | null = null
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      file = item.getAsFile()
      if (file) break
    }
  }
  if (!file) return

  if (!addAttachmentFromFile(file)) return
  event.preventDefault()
  emit('attachmentsChange', attachments.value)
}

function addAttachmentFromFile(file: File): boolean {
  // 验证文件大小
  if (file.size > MAX_FILE_SIZE) {
    alert(`文件 "${file.name}" 超过 10MB 限制`)
    return false
  }

  // 验证文件类型
  if (!acceptedFileTypeList.includes(file.type)) {
    alert(`不支持的文件类型: ${file.type}`)
    return false
  }

  // 只保留一个文件
  attachments.value = [{
    name: file.name,
    size: file.size,
    type: file.type,
    file: file
  }]
  return true
}

function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
  emit('attachmentsChange', attachments.value)
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return 'ri:image-line'
  if (type === 'application/pdf') return 'ri:file-pdf-line'
  if (type.includes('word')) return 'ri:file-word-line'
  if (type.includes('excel') || type.includes('spreadsheet')) return 'ri:file-excel-line'
  if (type.includes('powerpoint') || type.includes('presentation')) return 'ri:file-ppt-line'
  if (type.startsWith('text/')) return 'ri:file-text-line'
  return 'ri:file-line'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

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
      ; (el as any).__autosizeCleanup__ = () => textarea.removeEventListener('input', onInput)
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
