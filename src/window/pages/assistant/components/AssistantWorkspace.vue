<template>
  <div class="relative h-full min-h-0 flex-1" @click="ctx.handleWorkspaceClick">
    <ScrollArea
      ref="messagesContainer"
      class="ifocal-scroll-style h-full flex-1 rounded-xl border-4 border-[#faf8f5] bg-white px-4 shadow-none [&>div>div]:scroll-smooth">
      <header class="flex items-center justify-end absolute top-0 left-0 right-0 p-4 z-10">
        <LanguageSelect :current-lang-label="ctx.currentLangLabel" :current-target-lang="ctx.targetLang"
          :supported-languages="ctx.supportedLanguages" :bg-class="ctx.bgClass" :blur-class="ctx.blurClass"
          @selectLanguage="ctx.selectLanguage" />
      </header>

      <div class="mx-auto max-w-[50rem] space-y-6">
        <div v-if="!ctx.messages.length && !ctx.isBusy" class="mx-auto w-[min(620px,88%)] pt-[clamp(90px,24vh,220px)] text-center">
          <div class="mx-auto mb-3.5 grid size-10 place-items-center rounded-[14px] border border-stone-700/[.09] bg-white text-stone-600 shadow-[0_8px_28px_rgba(56,49,43,.08)]"><Icon icon="proicons:sparkle-2" class="h-5 w-5" /></div>
          <p class="mb-1 text-xs text-stone-500">今天想从哪里开始？</p>
          <h2 class="m-0 text-[clamp(23px,2.2vw,31px)] font-medium tracking-[-.045em] text-stone-800">你好，我能为你做些什么？</h2>
          <p class="mt-2 text-[13px] text-stone-400 max-[760px]:hidden">对话、翻译、整理与创作，都可以从一句话开始。</p>
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
                class="rounded-lg rounded-tr-none bg-slate-100 px-4 py-3 !text-slate-700 prose prose-sm max-w-none" />

              <Button variant="ghost" size="icon"
                class="absolute -left-7 bottom-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400"
                title="重试" @click="ctx.retryMessage(idx)">
                <Icon icon="ri:restart-line" class="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div
            v-else
            :ref="el => ctx.setAiMessageRef(el, idx)"
            :class="['w-full group', { 'stream-reveal is-revealing': message.isRevealing }]"
          >
            <div class="flex items-center justify-between">
              <div class="min-w-0">
                <span class="text-xs font-medium !text-slate-600">{{ message.modelName || 'Assistant' }}</span>
                <div v-if="message.toolStatuses?.length" class="my-1 space-y-1 text-xs text-slate-500">
                  <div v-for="status in message.toolStatuses" :key="status.id"
                    class="flex min-w-0 items-center gap-1.5">
                    <span v-if="status.phase === 'preparing' || status.phase === 'running'"
                      class="ifocal-loading shrink-0 text-slate-400"
                      style="--ifocal-loading-size: 12px; --ifocal-loading-stroke: 2px; --ifocal-loading-color: currentColor;" />
                    <Icon v-else-if="status.phase === 'error'" icon="ri:close-circle-line"
                      class="h-3 w-3 shrink-0 text-red-400" />
                    <Icon v-else icon="ri:check-line" class="h-3 w-3 shrink-0 text-slate-500" />
                    <span class="min-w-0 truncate"
                      :class="status.phase === 'preparing' || status.phase === 'running' ? 'shimmer-text' : ''">
                      {{ status.message }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <Button variant="ghost" size="icon"
                  class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" title="复制"
                  @click="ctx.copyMessage(ctx.getDisplayContent(message))">
                  <Icon icon="ri:file-copy-line" class="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div class="w-full">
              <div v-if="message.isError" class="text-red-600">{{ message.content }}</div>
              <div v-else-if="ctx.getDisplayContent(message)">
                <template v-if="ctx.getParsed(message, idx).reasoning">
                  <template v-if="message.isStreaming && ctx.enableReasoning && !ctx.getParsed(message, idx).answer">
                    <div class="flex items-center gap-2">
                      <Button variant="ghost" size="xs" class="h-6 p-0 text-xs gap-1 hover:bg-transparent">
                        <span class="text-xs text-slate-400 shimmer-text">
                          正在思考...
                        </span>
                      </Button>
                      <span class="text-slate-400" v-if="ctx.getReasoningElapsedSeconds(message) > 0">
                        {{ ctx.getReasoningElapsedLabel(message) }}s
                      </span>
                    </div>
                  </template>
                  <template v-else>
                    <div class="flex items-center gap-2">
                      <Button variant="ghost" size="xs" class="h-6 p-0 hover:bg-transparent"
                        @click="message.reasoningCollapsed = !message.reasoningCollapsed">
                        <span class="text-xs text-slate-400">
                          思考过程
                        </span>
                        <div class="relative h-4 w-4 text-slate-400">
                          <Icon :icon="message.reasoningCollapsed ? 'ri:arrow-down-s-line' : 'ri:arrow-up-s-line'"
                            class="absolute left-0 top-0 !h-4 !w-4 transition-opacity" />
                        </div>
                      </Button>
                      <span class="text-slate-400" v-if="ctx.getReasoningElapsedSeconds(message) > 0">
                        {{ ctx.getReasoningElapsedLabel(message) }}s
                      </span>
                    </div>
                    <div v-if="!message.reasoningCollapsed"
                      class="p-3 bg-slate-50 prose prose-sm max-w-none !text-slate-500 text-xs"
                      v-html="ctx.renderMarkdown(ctx.getParsed(message, idx).reasoning)" />
                  </template>
                  <div v-if="ctx.getParsed(message, idx).answer" class="h-2" />
                  <div class="prose prose-sm max-w-none !text-slate-800"
                    v-html="ctx.renderMarkdown(ctx.getParsed(message, idx).answer)" />
                </template>
                <div v-else class="prose prose-sm max-w-none !text-slate-800"
                  v-html="ctx.renderMarkdown(ctx.getDisplayContent(message))" />
              </div>
              <div v-else-if="message.toolStatuses?.length" />
              <div v-else>
                <template v-if="ctx.enableReasoning">
                  <Button variant="ghost" size="xs" class="h-6 p-0 text-xs gap-1">
                    <span class="text-xs text-slate-400 shimmer-text">
                      正在思考...
                    </span>
                  </Button>
                </template>
                <template v-else>
                  <div class="space-y-3">
                    <div class="rounded-xs h-3 w-2/3 bg-slate-200 animate-pulse" />
                    <div class="rounded-xs h-3 w-full bg-slate-200 animate-pulse" />
                    <div class="rounded-xs h-3 w-5/6 bg-slate-200 animate-pulse" />
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
                <div class="rounded-xs h-3 w-2/3 bg-slate-200 animate-pulse" />
                <div class="rounded-xs h-3 w-full bg-slate-200 animate-pulse" />
                <div class="rounded-xs h-3 w-5/6 bg-slate-200 animate-pulse" />
              </div>
            </template>
          </div>
        </div>
      </div>

      <footer ref="footerEl" class="absolute left-0 right-0 p-4"
        :class="!ctx.messages.length && !ctx.isBusy
          ? 'top-[clamp(300px,52vh,510px)] max-[760px]:top-[48vh]'
          : 'bottom-0 bg-gradient-to-b from-transparent to-[#faf8f5] to-50%'">
        <ChatInput ref="chatInputRef" :model-value="ctx.text" :sending="ctx.isBusy"
          :enable-streaming="ctx.enableStreaming" :enable-reasoning="ctx.enableReasoning"
          :reasoning-effort="ctx.reasoningEffort" :max-steps="ctx.maxSteps" :enable-context="ctx.enableContext"
          :enable-file-upload="ctx.enableFileUpload" :enable-mcp-tools="ctx.enableMcpTools" :mcp-servers="ctx.mcpServers"
          :mcp-server-toggles="ctx.mcpServerToggles" :auto-paste-global-assistant="ctx.autoPasteGlobalAssistant"
          :bg-class="ctx.bgClass" :blur-class="ctx.blurClass" :current-model-name="ctx.currentModelName"
          :grouped-models="ctx.groupedModels" :selected-pair-key="ctx.selectedPairKey"
          :pinned-model-keys="ctx.pinnedModelKeys"
          :show-scroll-to-bottom-button="ctx.showScrollToBottomButton"
          @update:modelValue="ctx.updateText" @selectModel="ctx.selectModel" @send="ctx.handleSend"
          @togglePinnedModel="ctx.togglePinnedModel"
          @stop="ctx.stopGenerating" @toggleStreaming="ctx.toggleStreaming" @toggleReasoning="ctx.toggleReasoning"
          @changeReasoningEffort="ctx.changeReasoningEffort" @changeMaxSteps="ctx.changeMaxSteps" @toggleContext="ctx.toggleContext"
          @toggleClipboardListening="ctx.toggleClipboardListening" @toggleFileUpload="ctx.toggleFileUpload"
          @toggleMcpTools="ctx.toggleMcpTools" @toggleMcpServer="ctx.toggleMcpServer" @openSettings="ctx.openSettings"
          @scrollToBottom="ctx.handleScrollToBottomClick" @clearMessages="ctx.clearMessages" />
        <div v-if="!ctx.messages.length && !ctx.isBusy" class="mx-auto mt-3 flex max-w-[760px] flex-wrap justify-center gap-[7px] px-3" aria-label="快捷提示">
          <button v-for="prompt in quickPrompts" :key="prompt"
            class="min-h-8 rounded-[10px] border border-stone-700/10 bg-white/50 px-[13px] text-[11px] text-stone-500 hover:bg-white hover:text-stone-800 hover:shadow-sm"
            @click="ctx.updateText(prompt)">{{ prompt }}</button>
        </div>
      </footer>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type ChatInputComponent from './ChatInput.vue'
import type { AssistantWorkspaceContext, FileAttachment } from '../../../types'

const LanguageSelect = defineAsyncComponent(() => import('./LanguageSelect.vue'))
const ChatInput = defineAsyncComponent(() => import('./ChatInput.vue'))

defineProps<{
  ctx: AssistantWorkspaceContext
}>()

const messagesContainer = ref<unknown>(null)
const footerEl = ref<HTMLElement | null>(null)
const chatInputRef = ref<InstanceType<typeof ChatInputComponent> | null>(null)
const quickPrompts = ['起草回复', '整理思路', '总结内容', '翻译文本', '制定计划']

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
