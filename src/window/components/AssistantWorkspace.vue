<template>
  <div class="relative h-full min-h-0 flex-1">
    <ScrollArea ref="messagesContainer"
      class="ifocal-scroll-style h-full flex-1 px-4 bg-white border border-olive-300/60 shadow-xs">
      <header class="flex items-center justify-end absolute top-0 left-0 right-0 p-4 z-10">
        <LanguageSelect :current-lang-label="ctx.currentLangLabel" :current-target-lang="ctx.targetLang"
          :supported-languages="ctx.supportedLanguages" :bg-class="ctx.bgClass" :blur-class="ctx.blurClass"
          @selectLanguage="ctx.selectLanguage" />
      </header>

      <div class="mx-auto max-w-[50rem] space-y-6">
        <div v-if="!ctx.messages.length && !ctx.isBusy" class="space-y-4 mx-auto w-[80%] pt-[38%]">
          <h2 class="text-center text-2xl font-medium text-muted-foreground">
            有什么可以帮忙的？
          </h2>
        </div>

        <template v-for="(message, idx) in ctx.messages" :key="idx">
          <div v-if="message.role === 'user'" class="flex justify-end">
            <div class="group relative max-w-[80%]">
              <div v-if="message.attachments && message.attachments.length > 0"
                :class="['space-y-2', { 'mb-2': message.content }]">
                <div v-for="(att, attIdx) in message.attachments" :key="attIdx">
                  <img v-if="att.type.startsWith('image/')" :src="att.data" :alt="att.name"
                    class="max-w-full cursor-pointer hover:opacity-90 transition-opacity"
                    @click="ctx.viewAttachment(att)" />
                  <div v-else
                    class="flex items-center gap-2 px-3 py-2 bg-white/60 border border-zinc-300 cursor-pointer hover:bg-white/80 transition-colors"
                    @click="ctx.downloadAttachment(att)">
                    <Icon :icon="ctx.getFileIcon(att.type)" class="h-5 w-5 text-muted-foreground shrink-0" />
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium truncate">{{ att.name }}</div>
                      <div class="text-xs text-muted-foreground">{{ ctx.formatFileSize(att.size) }}</div>
                    </div>
                    <Icon icon="ri:download-line" class="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>

              <div v-if="message.content" v-html="ctx.renderMarkdownSafe(message.content)"
                class="bg-olive-100 px-4 py-3 !text-olive-700 prose prose-sm max-w-none" />

              <Button variant="ghost" size="icon"
                class="absolute -left-7 bottom-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400"
                title="重试" @click="ctx.retryMessage(idx)">
                <Icon icon="ri:restart-line" class="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div v-else :ref="el => ctx.setAiMessageRef(el, idx)" class="w-full group">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium !text-olive-600">{{ message.modelName || 'Assistant' }}</span>
              <div class="flex items-center gap-1">
                <Button variant="ghost" size="icon"
                  class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-olive-400" title="复制"
                  @click="ctx.copyMessage(message.content)">
                  <Icon icon="ri:file-copy-line" class="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div class="w-full">
              <div v-if="message.isError" class="text-red-600">{{ message.content }}</div>
              <div v-else-if="message.content">
                <template v-if="ctx.getParsed(message, idx).reasoning">
                  <template v-if="message.isStreaming && ctx.enableReasoning && !ctx.getParsed(message, idx).answer">
                    <div class="flex items-center gap-2">
                      <Button variant="ghost" size="xs" class="h-6 p-0 text-xs gap-1 hover:bg-transparent">
                        <span class="text-xs !text-olive-400 shimmer-text">
                          正在思考...
                        </span>
                      </Button>
                      <span class="text-olive-400" v-if="ctx.getReasoningElapsedSeconds(message) > 0">
                        {{ ctx.getReasoningElapsedLabel(message) }}s
                      </span>
                    </div>
                  </template>
                  <template v-else>
                    <div class="flex items-center gap-2">
                      <Button variant="ghost" size="xs" class="h-6 p-0 hover:bg-transparent"
                        @click="message.reasoningCollapsed = !message.reasoningCollapsed">
                        <span class="text-olive-400">
                          思考过程
                        </span>
                        <div class="relative h-4 w-4 text-olive-400">
                          <Icon :icon="message.reasoningCollapsed ? 'ri:arrow-down-s-line' : 'ri:arrow-up-s-line'"
                            class="absolute left-0 top-0 !h-4 !w-4 transition-opacity" />
                        </div>
                      </Button>
                      <span class="text-olive-400" v-if="ctx.getReasoningElapsedSeconds(message) > 0">
                        {{ ctx.getReasoningElapsedLabel(message) }}s
                      </span>
                    </div>
                    <div v-if="!message.reasoningCollapsed"
                      class="p-3 bg-olive-50 prose prose-sm max-w-none !text-olive-500 text-xs"
                      v-html="ctx.renderMarkdown(ctx.getParsed(message, idx).reasoning)" />
                  </template>
                  <div v-if="ctx.getParsed(message, idx).answer" class="h-2" />
                  <div class="prose prose-sm max-w-none !text-olive-800"
                    v-html="ctx.renderMarkdown(ctx.getParsed(message, idx).answer)" />
                </template>
                <div v-else class="prose prose-sm max-w-none !text-olive-800"
                  v-html="ctx.renderMarkdown(message.content)" />
              </div>
              <div v-else>
                <template v-if="ctx.enableReasoning">
                  <Button variant="ghost" size="xs" class="h-6 p-0 text-xs gap-1">
                    <span class="text-xs text-olive-400 shimmer-text">
                      正在思考...
                    </span>
                  </Button>
                </template>
                <template v-else>
                  <div class="space-y-3">
                    <div class="h-3 w-2/3 bg-olive-100 animate-pulse" />
                    <div class="h-3 w-full bg-olive-100 animate-pulse" />
                    <div class="h-3 w-5/6 bg-olive-100 animate-pulse" />
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>

        <div v-if="ctx.sending" class="w-full">
          <div class="mb-2">
            <span class="text-xs font-medium text-muted-foreground">{{ ctx.currentModelName || 'Assistant' }}</span>
          </div>

          <div class="w-full">
            <template v-if="ctx.enableReasoning">
              <div class="text-sm text-muted-foreground shimmer-text">正在思考...</div>
            </template>
            <template v-else>
              <div class="space-y-3">
                <div class="h-3 w-2/3 bg-olive-100 animate-pulse" />
                <div class="h-3 w-full bg-olive-100 animate-pulse" />
                <div class="h-3 w-5/6 bg-olive-100 animate-pulse" />
              </div>
            </template>
          </div>
        </div>
      </div>

      <footer ref="footerEl" class="absolute left-0 right-0 bottom-0 p-4">
        <ChatInput ref="chatInputRef" :model-value="ctx.text" :sending="ctx.isBusy"
          :enable-streaming="ctx.enableStreaming" :enable-reasoning="ctx.enableReasoning"
          :reasoning-effort="ctx.reasoningEffort" :enable-context="ctx.enableContext"
          :enable-file-upload="ctx.enableFileUpload" :mcp-servers="ctx.mcpServers"
          :mcp-server-toggles="ctx.mcpServerToggles"
          :auto-paste-global-assistant="ctx.autoPasteGlobalAssistant"
          :bg-class="ctx.bgClass" :blur-class="ctx.blurClass" :current-model-name="ctx.currentModelName"
          :grouped-models="ctx.groupedModels" :selected-pair-key="ctx.selectedPairKey"
          @update:modelValue="ctx.updateText" @selectModel="ctx.selectModel" @send="ctx.handleSend"
          @stop="ctx.stopGenerating" @toggleStreaming="ctx.toggleStreaming" @toggleReasoning="ctx.toggleReasoning"
          @changeReasoningEffort="ctx.changeReasoningEffort" @toggleContext="ctx.toggleContext"
          @toggleClipboardListening="ctx.toggleClipboardListening" @toggleFileUpload="ctx.toggleFileUpload"
          @toggleMcpServer="ctx.toggleMcpServer"
          @openSettings="ctx.openSettings" />
      </footer>
    </ScrollArea>

    <Button v-if="ctx.showScrollToBottomButton" variant="outline" size="icon"
      :class="['absolute left-[50%] translate-x-[-50%] z-20 h-8 w-8 shadow-md border-none', ctx.bgClass, ctx.blurClass]"
      :style="{ bottom: 'var(--ifocal-bottom-gap, 150px)' }" title="滚动到底部" @click="ctx.handleScrollToBottomClick">
      <Icon icon="ri:arrow-down-line" class="h-4 w-4" />
    </Button>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type ChatInputComponent from './ChatInput.vue'
import type { AssistantWorkspaceContext, FileAttachment } from '../types'

const LanguageSelect = defineAsyncComponent(() => import('./LanguageSelect.vue'))
const ChatInput = defineAsyncComponent(() => import('./ChatInput.vue'))

defineProps<{
  ctx: AssistantWorkspaceContext
}>()

const messagesContainer = ref<unknown>(null)
const footerEl = ref<HTMLElement | null>(null)
const chatInputRef = ref<InstanceType<typeof ChatInputComponent> | null>(null)

function getAttachments(): FileAttachment[] {
  return chatInputRef.value?.getAttachments() || []
}

function clearAttachments() {
  chatInputRef.value?.clearAttachments()
}

defineExpose({
  getAttachments,
  clearAttachments,
  getMessagesContainer: () => messagesContainer.value,
  getFooterEl: () => footerEl.value,
})
</script>
