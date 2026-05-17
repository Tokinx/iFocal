<template>
  <div class="flex h-full min-h-0 gap-2">
    <AssistantNav class="w-56 shrink-0"
      :tasks="tasks"
      :sessions="sessions"
      :current-session-id="currentSessionId"
      :active-assistant-id="activeAssistantId"
      :assistant-configs="assistantConfigs"
      :model-pairs="modelPairs"
      :format-date="formatDate"
      @selectAssistant="(id) => $emit('selectAssistant', id)"
      @deleteAssistant="(id) => $emit('deleteAssistant', id)"
      @switchSession="(id) => $emit('switchSession', id)"
      @deleteSession="(id) => $emit('deleteSession', id)"
      @newSession="$emit('newSession')"
      @save="(assistant) => $emit('saveAssistant', assistant)" />
    <AssistantWorkspace ref="workspaceRef" :ctx="ctx" class="min-w-0" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AssistantWorkspace from './components/AssistantWorkspace.vue'
import AssistantNav from './components/AssistantNav.vue'
import type { AssistantConfig } from '@/shared/assistants'
import type {
  AssistantPageExpose,
  AssistantWorkspaceContext,
  FileAttachment,
  SidebarTask,
  WindowSession,
} from '../../types'

defineProps<{
  ctx: AssistantWorkspaceContext
  tasks: SidebarTask[]
  sessions: WindowSession[]
  currentSessionId: string
  activeAssistantId: string
  assistantConfigs: AssistantConfig[]
  modelPairs: Array<{ key: string; channel: string; model: string }>
  formatDate: (timestamp: number) => string
}>()

defineEmits<{
  (e: 'selectAssistant', assistantId: string): void
  (e: 'deleteAssistant', assistantId: string): void
  (e: 'switchSession', sessionId: string): void
  (e: 'deleteSession', sessionId: string): void
  (e: 'newSession'): void
  (e: 'saveAssistant', assistant: AssistantConfig): void
}>()

const workspaceRef = ref<AssistantPageExpose | null>(null)

defineExpose({
  getAttachments: (): FileAttachment[] => workspaceRef.value?.getAttachments() || [],
  clearAttachments: () => workspaceRef.value?.clearAttachments(),
  getMessagesContainer: () => workspaceRef.value?.getMessagesContainer() || null,
  getFooterEl: () => workspaceRef.value?.getFooterEl() || null,
})
</script>
