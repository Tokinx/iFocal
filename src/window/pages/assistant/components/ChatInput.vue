<template>
  <ComposerFrame
    :model-value="modelValue"
    :sending="sending"
    :can-send="Boolean(modelValue.trim()) || attachments.length > 0"
    :bg-class="bgClass"
    :blur-class="blurClass"
    :show-scroll-to-bottom-button="showScrollToBottomButton"
    placeholder="输入你想了解到内容"
    aria-label="输入你想了解的内容"
    @update:modelValue="$emit('update:modelValue', $event)"
    @send="$emit('send')"
    @stop="$emit('stop')"
    @scrollToBottom="$emit('scrollToBottom')"
    @paste="handlePaste"
  >
    <template #toolbar>
      <!-- 模型选择 Dropdown -->
      <ModelSelect
        :current-model-name="currentModelName"
        :grouped-models="groupedModels"
        :selected-pair-key="selectedPairKey"
        :pinned-model-keys="pinnedModelKeys"
        :bg-class="bgClass"
        :blur-class="blurClass"
        @selectModel="selectModel"
        @togglePin="(key) => $emit('togglePinnedModel', key)"
      />

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="icon"
            :class="['h-8 w-8 shrink-0 rounded-xl border border-slate-300/50 shadow-xs', bgClass, blurClass]"
          >
            <Icon icon="ri:apps-2-ai-line" class="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" :class="['w-56', bgClass, blurClass]">
          <ScrollArea class="h-60">
            <div class="space-y-3 p-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon icon="ri:dvd-ai-line" class="h-4 w-4" /><span class="text-sm font-medium">流式响应</span>
                </div>
                <Switch :model-value="enableStreaming" @update:modelValue="$emit('toggleStreaming', $event)" />
              </div>
              <div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Icon icon="ri:lightbulb-ai-line" class="h-4 w-4" />
                    <span class="text-sm font-medium">思考模式</span>
                  </div>
                  <Switch :model-value="enableReasoning" @update:modelValue="$emit('toggleReasoning', $event)" />
                </div>
                <div
                  :class="[
                    'overflow-hidden transition-all duration-200',
                    enableReasoning ? 'max-h-24 opacity-100 mt-1' : 'max-h-0 opacity-0 py-0',
                  ]"
                >
                  <div class="grid grid-cols-4" :class="[bgClass]">
                    <Button
                      v-for="item in reasoningEffortOptions"
                      :key="item.value"
                      variant="ghost"
                      size="sm"
                      @click="$emit('changeReasoningEffort', item.value)"
                      class="h-6 px-0 text-xs"
                      :class="[item.value === reasoningEffort ? '!bg-black !text-white' : '']"
                    >
                      {{ item.label }}
                    </Button>
                  </div>
                </div>
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon icon="ri:message-ai-3-line" class="h-4 w-4" />
                  <span class="text-sm font-medium">启用上下文</span>
                </div>
                <Switch :model-value="enableContext" @update:modelValue="$emit('toggleContext', $event)" />
              </div>
              <DropdownMenuSeparator class="my-2" />
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon icon="ri:file-ai-line" class="h-4 w-4" /><span class="text-sm font-medium">监听剪切板</span>
                </div>
                <Switch
                  :model-value="autoPasteGlobalAssistant"
                  @update:modelValue="$emit('toggleClipboardListening', $event)"
                />
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon icon="ri:attachment-2" class="h-4 w-4" /><span class="text-sm font-medium">文件上传</span>
                </div>
                <Switch :model-value="enableFileUpload" @update:modelValue="$emit('toggleFileUpload', $event)" />
              </div>
              <div v-if="mcpServers.length" class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Icon icon="ri:apps-2-ai-line" class="h-4 w-4" /><span class="text-sm font-medium">MCP 功能</span>
                  </div>
                  <Switch :model-value="enableMcpTools" @update:modelValue="$emit('toggleMcpTools', !!$event)" />
                </div>
                <div
                  :class="[
                    'overflow-hidden transition-all duration-200',
                    enableMcpTools ? 'max-h-56 opacity-100' : 'max-h-0 opacity-0',
                  ]"
                >
                  <div class="pl-6">
                    <div class="mb-1 text-xs text-muted-foreground">工具调用步数</div>
                    <div class="grid grid-cols-4 gap-1" :class="[bgClass]">
                      <Button
                        v-for="item in maxStepsOptions"
                        :key="item.value"
                        variant="ghost"
                        size="sm"
                        @click="$emit('changeMaxSteps', item.value)"
                        class="h-6 px-0 text-xs"
                        :class="[item.value === maxSteps ? '!bg-black !text-white' : '']"
                      >
                        {{ item.label }}
                      </Button>
                    </div>
                  </div>
                  <div class="mt-2 space-y-2 pl-6">
                    <div
                      v-for="server in mcpServers"
                      :key="server.name"
                      class="flex min-w-0 items-center justify-between gap-3"
                    >
                      <span
                        :class="[
                          'min-w-0 truncate text-xs',
                          mcpServerToggles[server.name] ? 'text-foreground' : 'text-muted-foreground',
                        ]"
                        :title="server.name"
                      >
                        {{ server.name }}
                      </span>
                      <Switch
                        :model-value="!!mcpServerToggles[server.name]"
                        size="sm"
                        @update:modelValue="$emit('toggleMcpServer', server.name, !!$event)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="outline"
              size="icon"
              :class="[
                'h-8 w-8 shrink-0 rounded-xl border border-slate-300/50 shadow-xs hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-600',
                bgClass,
                blurClass,
              ]"
              :disabled="sending"
              @click="$emit('clearMessages')"
            >
              <Icon icon="ri:eraser-line" class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>清空消息</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </template>

    <template #input-start>
      <div v-if="attachments.length > 0" class="flex flex-wrap gap-2">
        <div
          v-for="(file, idx) in attachments"
          :key="idx"
          class="group relative flex items-center gap-2 rounded-lg border border-slate-100 bg-white/60 py-1 pl-1 pr-2"
        >
          <Icon :icon="getFileIcon(file.type)" class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="max-w-[150px] truncate text-xs text-foreground">{{ file.name }}</span>
          <span class="text-xs text-muted-foreground">{{ formatFileSize(file.size) }}</span>
          <Button
            variant="outline"
            size="icon"
            class="absolute left-1 top-1 h-4 w-4 rounded-md !bg-red-500 !text-white opacity-0 transition-opacity group-hover:opacity-100"
            @click="removeAttachment(idx)"
          >
            <Icon icon="ri:close-line" class="h-3 w-3" />
          </Button>
        </div>
      </div>
      <TooltipProvider v-else-if="enableFileUpload">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="relative h-7 w-7 rounded-lg hover:bg-zinc-200/80"
              @click="triggerFileInput"
            >
              <Icon icon="ri:attachment-2" class="h-4 w-4 text-muted-foreground" />
              <input
                ref="fileInputRef"
                type="file"
                :accept="acceptedFileTypes"
                class="hidden"
                @change="handleFileSelect"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>添加图片和文件</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </template>
  </ComposerFrame>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import ComposerFrame from '@/window/components/ComposerFrame.vue'
import type { ReasoningEffort } from '@/shared/config'
import type { McpServerEntry } from '@/shared/mcp'
import ModelSelect from '@/window/components/ModelSelect.vue'
import {
  DropdownMenu,
  DropdownMenuContent,
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
  enableStreaming: boolean
  enableReasoning: boolean
  reasoningEffort: ReasoningEffort
  maxSteps: number
  enableContext: boolean
  autoPasteGlobalAssistant: boolean
  enableFileUpload: boolean
  enableMcpTools: boolean
  mcpServers: McpServerEntry[]
  mcpServerToggles: Record<string, boolean>
  currentModelName: string
  groupedModels: Record<string, Array<{ key: string; model: string; channel: string }>>
  selectedPairKey: string
  pinnedModelKeys: string[]
  showScrollToBottomButton: boolean
  bgClass?: string
  blurClass?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'send'): void
  (e: 'stop'): void
  (e: 'toggleStreaming', checked: boolean): void
  (e: 'toggleReasoning', checked: boolean): void
  (e: 'changeReasoningEffort', effort: ReasoningEffort): void
  (e: 'changeMaxSteps', steps: number): void
  (e: 'toggleContext', checked: boolean): void
  (e: 'toggleClipboardListening', checked: boolean): void
  (e: 'toggleFileUpload', checked: boolean): void
  (e: 'toggleMcpTools', checked: boolean): void
  (e: 'toggleMcpServer', name: string, checked: boolean): void
  (e: 'selectModel', key: string): void
  (e: 'togglePinnedModel', key: string): void
  (e: 'scrollToBottom'): void
  (e: 'clearMessages'): void
  (e: 'attachmentsChange', files: FileAttachment[]): void
}>()

// 暴露方法给父组件
defineExpose({
  getAttachments: () => attachments.value,
  clearAttachments: () => {
    attachments.value = []
    emit('attachmentsChange', [])
  },
})

// 文件上传相关
const fileInputRef = ref<HTMLInputElement | null>(null)
const attachments = ref<FileAttachment[]>([])
const reasoningEffortOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '超高' },
]
const maxStepsOptions: Array<{ value: number; label: string }> = [
  { value: 1, label: '1' },
  { value: 3, label: '3' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
]

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
  attachments.value = [
    {
      name: file.name,
      size: file.size,
      type: file.type,
      file: file,
    },
  ]
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

function selectModel(key: string) {
  emit('selectModel', key)
}
</script>
