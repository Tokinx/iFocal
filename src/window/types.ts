import type { ComponentPublicInstance } from 'vue'
import type { ReasoningEffort } from '@/shared/config'

export type AssistantTask = 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat'

export interface WindowMessage {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  modelName?: string
  isStreaming?: boolean
  reasoningStartedAt?: number
  reasoningEndedAt?: number
  reasoningCollapsed?: boolean
  attachments?: Array<{
    name: string
    type: string
    size: number
    data: string
  }>
}

export interface WindowSession {
  id: string
  title: string
  task: AssistantTask
  messages: WindowMessage[]
  createdAt: number
  updatedAt: number
}

export interface ModelOption {
  key: string
  channel: string
  model: string
}

export interface SidebarTask {
  key: AssistantTask
  label: string
  icon: string
}

export interface FileAttachment {
  name: string
  size: number
  type: string
  file: File
}

export interface ParsedParts {
  reasoning: string
  answer: string
}

export interface AssistantWorkspaceContext {
  text: string
  messages: WindowMessage[]
  sending: boolean
  isBusy: boolean
  enableStreaming: boolean
  enableReasoning: boolean
  reasoningEffort: ReasoningEffort
  enableContext: boolean
  enableFileUpload: boolean
  autoPasteGlobalAssistant: boolean
  currentModelName: string
  groupedModels: Record<string, ModelOption[]>
  selectedPairKey: string
  currentLangLabel: string
  targetLang: string
  supportedLanguages: Array<{ value: string; label: string }>
  bgClass: string
  blurClass: string
  showScrollToBottomButton: boolean
  updateText: (value: string) => void
  selectLanguage: (lang: string) => void
  selectModel: (key: string) => void
  handleSend: () => void
  stopGenerating: () => void
  toggleStreaming: (checked: boolean) => void
  toggleReasoning: (checked: boolean) => void
  changeReasoningEffort: (effort: ReasoningEffort) => void
  toggleContext: (checked: boolean) => void
  toggleClipboardListening: (checked: boolean) => void
  toggleFileUpload: (checked: boolean) => void
  openSettings: () => void
  handleScrollToBottomClick: () => void
  retryMessage: (messageIndex: number) => void
  copyMessage: (content: string) => void
  viewAttachment: (attachment: unknown) => void
  downloadAttachment: (attachment: unknown) => void
  getFileIcon: (type: string) => string
  formatFileSize: (bytes: number) => string
  renderMarkdown: (content: string) => unknown
  renderMarkdownSafe: (content: string) => unknown
  getParsed: (message: WindowMessage, index: number) => ParsedParts
  getReasoningElapsedSeconds: (message: WindowMessage) => number
  getReasoningElapsedLabel: (message: WindowMessage) => string
  setAiMessageRef: (el: Element | ComponentPublicInstance | null, index: number) => void
}

export interface AssistantPageExpose {
  getAttachments: () => FileAttachment[]
  clearAttachments: () => void
  getMessagesContainer: () => unknown
  getFooterEl: () => HTMLElement | null
}
