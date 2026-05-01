<template>
  <AssistantWorkspace ref="workspaceRef" :ctx="ctx" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AssistantWorkspace from '../components/AssistantWorkspace.vue'
import type { AssistantPageExpose, AssistantWorkspaceContext, FileAttachment } from '../types'

defineProps<{
  ctx: AssistantWorkspaceContext
}>()

const workspaceRef = ref<AssistantPageExpose | null>(null)

defineExpose({
  getAttachments: (): FileAttachment[] => workspaceRef.value?.getAttachments() || [],
  clearAttachments: () => workspaceRef.value?.clearAttachments(),
  getMessagesContainer: () => workspaceRef.value?.getMessagesContainer() || null,
  getFooterEl: () => workspaceRef.value?.getFooterEl() || null,
})
</script>
