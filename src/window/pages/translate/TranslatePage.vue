<template>
  <TooltipProvider :delay-duration="200">
    <div class="relative h-full min-h-0 overflow-hidden rounded-xl bg-[#faf8f5]">
      <ScrollArea
        ref="scrollAreaRef"
        class="ifocal-scroll-style h-full rounded-xl border-4 border-[#faf8f5] bg-white px-4 shadow-none"
        :style="{ '--ifocal-bottom-gap': `${Math.max(footerHeight, 132) + 16}px` }"
      >
        <TranslateTopBar
          class="absolute right-4 top-4 z-20"
          :source-lang="store.sourceLang.value"
          :target-lang="store.targetLang.value"
          :source-lang-options="store.sourceLangOptions.value"
          :target-lang-options="store.targetLangOptions.value"
          @update:sourceLang="(value) => (store.sourceLang.value = value)"
          @update:targetLang="(value) => (store.targetLang.value = value)"
          @swapLanguages="store.swapLanguages"
        />

        <div class="mx-auto max-w-[50rem] space-y-6 px-1">
          <div v-if="showWelcome" class="mx-auto w-[min(620px,88%)] pt-[clamp(90px,24vh,220px)] text-center">
            <div
              class="mx-auto mb-3.5 grid size-10 place-items-center rounded-[14px] border border-stone-700/[.09] bg-white text-stone-600 shadow-[0_8px_28px_rgba(56,49,43,.08)]"
            >
              <Icon icon="proicons:sparkle-2" class="h-5 w-5" />
            </div>
            <p class="mb-1 text-xs text-stone-500">准备好翻译了吗？</p>
            <h2 class="m-0 text-[clamp(23px,2.2vw,31px)] font-medium tracking-[-.045em] text-stone-800">
              输入原文，开始翻译
            </h2>
            <p class="mt-2 text-[13px] text-stone-400 max-[760px]:hidden">支持同时调用多个渠道，对比不同译文结果。</p>
          </div>

          <div v-else-if="!hasResults" class="mx-auto max-w-[620px] pt-10 text-center text-xs text-stone-400">
            输入原文后点击发送，这里会显示不同渠道的译文。
          </div>

          <TranslateChannelList
            v-if="store.cards.value.length"
            :cards="store.cards.value"
            :titles="store.cardTitleMap.value"
            :subtitles="store.cardSubtitleMap.value"
            :ensure-runtime="store.ensureRuntime"
            @reorder="store.reorderCards"
            @refresh="store.refreshCard"
            @toggleCollapsed="store.toggleCardCollapsed"
            @remove="store.removeCard"
          />
        </div>

        <footer
          ref="footerEl"
          class="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-b from-transparent to-[#faf8f5] to-50% p-4"
        >
          <TranslateSourcePanel
            :model-value="store.sourceText.value"
            :machine-channels="store.machineChannels.value"
            :grouped-ai-models="store.groupedAiModels.value"
            :cards="store.cards.value"
            :titles="store.cardTitleMap.value"
            :watch-clipboard="store.watchClipboard.value"
            :auto-translate="store.autoTranslate.value"
            :show-scroll-to-bottom-button="showScrollToBottomButton"
            :send-disabled="!hasEnabledCard"
            @update:modelValue="(value) => (store.sourceText.value = value)"
            @update:watchClipboard="(value) => (store.watchClipboard.value = value)"
            @update:autoTranslate="(value) => (store.autoTranslate.value = value)"
            @translate="handleTranslate"
            @scrollToBottom="handleScrollToBottomClick"
            @addChannel="store.addCard"
            @removeChannel="store.removeCard"
          />
        </footer>
      </ScrollArea>
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TooltipProvider } from '@/components/ui/tooltip'
import TranslateTopBar from './components/TranslateTopBar.vue'
import TranslateSourcePanel from './components/TranslateSourcePanel.vue'
import TranslateChannelList from './components/TranslateChannelList.vue'
import {
  TRANSLATE_HISTORY_DELETE_EVENT,
  TRANSLATE_HISTORY_RESTORE_EVENT,
  useTranslatePage,
} from './useTranslatePage'

const store = useTranslatePage()
let loadPromise: Promise<void> | null = null

const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null)
const footerEl = ref<HTMLElement | null>(null)
const footerHeight = ref(0)
const showScrollToBottomButton = ref(false)
const userHasScrolled = ref(false)
let viewportEl: HTMLElement | null = null
let footerResizeObserver: ResizeObserver | null = null
let contentResizeObserver: ResizeObserver | null = null
let scrollFrame: number | null = null
let programmaticScrollReleaseFrame: number | null = null
let pendingForcedTop = false
let programmaticScroll = false

const hasResults = computed(() => {
  return Object.values(store.runtime).some((runtime) => runtime.loading || runtime.result || runtime.error)
})

const showWelcome = computed(() => {
  return !store.initializing.value && !hasResults.value && store.cards.value.length === 0
})

const hasEnabledCard = computed(() => store.cards.value.some((card) => !card.collapsed))

function resolveViewport(): HTMLElement | null {
  const root = (scrollAreaRef.value as unknown as { $el?: HTMLElement } | null)?.$el
  return root?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
}

function distanceToBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight
}

function syncScrollState() {
  if (!viewportEl) return
  const nearBottom = distanceToBottom(viewportEl) <= 48
  showScrollToBottomButton.value = !nearBottom
}

function onViewportScroll() {
  if (viewportEl && !programmaticScroll) {
    userHasScrolled.value = viewportEl.scrollTop > 1
  }
  syncScrollState()
}

function setViewportScrollTop(top: number, behavior: ScrollBehavior = 'auto') {
  if (!viewportEl) return
  programmaticScroll = true
  viewportEl.scrollTo({ top, behavior })
  if (programmaticScrollReleaseFrame !== null) cancelAnimationFrame(programmaticScrollReleaseFrame)
  programmaticScrollReleaseFrame = requestAnimationFrame(() => {
    programmaticScrollReleaseFrame = null
    programmaticScroll = false
    syncScrollState()
  })
}

function scrollToTop(force = false) {
  if (!viewportEl) return
  if (!force && userHasScrolled.value) return
  if (force) userHasScrolled.value = false
  setViewportScrollTop(0)
}

function scrollToBottom() {
  if (!viewportEl) return
  userHasScrolled.value = true
  setViewportScrollTop(viewportEl.scrollHeight, 'smooth')
  showScrollToBottomButton.value = false
}

async function scheduleScrollToTop(force = false) {
  pendingForcedTop ||= force
  await nextTick()
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null
    const shouldForce = pendingForcedTop
    pendingForcedTop = false
    scrollToTop(shouldForce)
    syncScrollState()
  })
}

function handleScrollToBottomClick() {
  scrollToBottom()
}

function startNewTranslation() {
  store.startNewTranslation()
  void scheduleScrollToTop(true)
}

function handleTranslate() {
  if (!store.sourceText.value.trim() || !hasEnabledCard.value) return
  store.translateAll()
  void scheduleScrollToTop(true)
}

async function handleSidebarHistoryRestore(event: Event) {
  const recordId = String((event as CustomEvent<{ recordId?: string }>).detail?.recordId || '')
  if (!recordId) return
  await loadPromise
  store.restoreHistory(recordId)
  void scheduleScrollToTop(true)
}

async function handleSidebarHistoryDelete(event: Event) {
  const recordId = String((event as CustomEvent<{ recordId?: string }>).detail?.recordId || '')
  if (!recordId) return
  await loadPromise
  const deletingActiveRecord = store.activeHistoryId.value === recordId
  if (!store.deleteHistory(recordId)) return
  if (deletingActiveRecord) void scheduleScrollToTop(true)
}

function bindViewport() {
  viewportEl = resolveViewport()
  if (!viewportEl) return
  viewportEl.addEventListener('scroll', onViewportScroll, { passive: true })
  syncScrollState()
  if (typeof ResizeObserver === 'undefined') return
  contentResizeObserver = new ResizeObserver(() => {
    if (!userHasScrolled.value) scrollToTop()
    else syncScrollState()
  })
  contentResizeObserver.observe(viewportEl)
  if (viewportEl.firstElementChild) contentResizeObserver.observe(viewportEl.firstElementChild)
}

defineExpose({ startNewTranslation })

onMounted(() => {
  window.addEventListener(TRANSLATE_HISTORY_RESTORE_EVENT, handleSidebarHistoryRestore)
  window.addEventListener(TRANSLATE_HISTORY_DELETE_EVENT, handleSidebarHistoryDelete)
  loadPromise = store.loadAll()
  void nextTick(() => {
    bindViewport()
    if (footerEl.value && typeof ResizeObserver !== 'undefined') {
      footerResizeObserver = new ResizeObserver(([entry]) => {
        footerHeight.value = Math.ceil(footerEl.value?.offsetHeight || entry?.contentRect.height || 0)
      })
      footerResizeObserver.observe(footerEl.value)
    }
  })
})

watch(
  () => [store.cards.value, store.runtime],
  () => {
    void scheduleScrollToTop(false)
  },
  { deep: true },
)

watch(
  () => store.initializing.value,
  (initializing) => {
    if (!initializing) void scheduleScrollToTop(true)
  },
)

onBeforeUnmount(() => {
  window.removeEventListener(TRANSLATE_HISTORY_RESTORE_EVENT, handleSidebarHistoryRestore)
  window.removeEventListener(TRANSLATE_HISTORY_DELETE_EVENT, handleSidebarHistoryDelete)
  viewportEl?.removeEventListener('scroll', onViewportScroll)
  footerResizeObserver?.disconnect()
  contentResizeObserver?.disconnect()
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
  if (programmaticScrollReleaseFrame !== null) cancelAnimationFrame(programmaticScrollReleaseFrame)
  footerResizeObserver = null
  contentResizeObserver = null
  scrollFrame = null
  programmaticScrollReleaseFrame = null
  pendingForcedTop = false
  programmaticScroll = false
  viewportEl = null
})
</script>
