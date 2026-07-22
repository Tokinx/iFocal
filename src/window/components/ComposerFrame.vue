<template>
  <div class="mx-auto w-full max-w-[52rem] space-y-2">
    <div class="relative flex min-h-8 items-center gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-2 pr-10">
        <slot name="toolbar" />
      </div>

      <Button
        variant="outline"
        size="icon"
        :class="[
          'absolute right-0 top-0 h-8 w-8 shrink-0 rounded-xl border border-slate-300/50 shadow-xs transition-opacity duration-150',
          bgClass,
          blurClass,
          showScrollToBottomButton ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        ]"
        title="滚动到底部"
        aria-label="滚动到底部"
        @click="emit('scrollToBottom')"
      >
        <Icon icon="ri:arrow-down-line" class="h-4 w-4" />
      </Button>
    </div>

    <div class="relative rounded-2xl border border-slate-700/8 p-1 backdrop-blur">
      <Textarea
        v-model="innerValue"
        v-autosize="maxLines"
        :rows="2"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        class="resize-none rounded-xl border-0 bg-white pb-11"
        @keydown.enter.exact.prevent="trySend"
        @paste="emit('paste', $event)"
      />

      <div class="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <div class="pointer-events-auto flex items-center">
          <slot name="input-start" />
        </div>

        <div class="flex-1" />

        <div class="pointer-events-auto flex gap-1">
          <slot name="send-actions" />
          <Button
            v-show="canSend && !sending"
            variant="ghost"
            size="icon"
            class="h-7 w-7 rounded-lg !bg-stone-800 !text-white hover:!bg-stone-900"
            title="发送"
            aria-label="发送"
            :disabled="sendDisabled"
            @click="trySend"
          >
            <Icon icon="ri:send-plane-2-fill" class="h-3 w-3" />
          </Button>
          <Button
            v-show="sending && showStopButton"
            variant="ghost"
            size="icon"
            class="group h-7 w-7 rounded-lg !bg-stone-800 !text-white hover:!bg-stone-900"
            title="停止生成"
            aria-label="停止生成"
            @click="emit('stop')"
          >
            <span class="relative flex h-3.5 w-3.5 items-center justify-center">
              <span
                class="ifocal-loading absolute opacity-100 duration-800 group-hover:opacity-0"
                style="--ifocal-loading-size: 14px; --ifocal-loading-stroke: 2px; --ifocal-loading-color: currentColor"
              />
              <Icon icon="ri:stop-fill" class="absolute h-3 w-3 opacity-0 duration-150 group-hover:opacity-100" />
            </span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, type Directive } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const props = withDefaults(
  defineProps<{
    modelValue: string
    sending?: boolean
    sendDisabled?: boolean
    showStopButton?: boolean
    showScrollToBottomButton?: boolean
    placeholder?: string
    ariaLabel?: string
    maxLines?: number
    bgClass?: string
    blurClass?: string
    canSend?: boolean
  }>(),
  {
    sending: false,
    sendDisabled: false,
    showStopButton: true,
    showScrollToBottomButton: false,
    placeholder: '输入你想了解的内容',
    ariaLabel: '输入内容',
    maxLines: 8,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'stop'): void
  (e: 'scrollToBottom'): void
  (e: 'paste', event: ClipboardEvent): void
}>()

const innerValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

const canSend = computed(() => {
  if (typeof props.canSend === 'boolean') return props.canSend
  return Boolean(innerValue.value.trim())
})

function trySend() {
  if (props.sending || props.sendDisabled || !canSend.value) return
  emit('send')
}

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
    cleanup?.()
  },
}

function resolveTextarea(el: HTMLElement): HTMLTextAreaElement | null {
  if (el.tagName === 'TEXTAREA') return el as HTMLTextAreaElement
  return el.querySelector('textarea') as HTMLTextAreaElement | null
}

function parsePx(value: string | null): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getLineHeightPx(el: HTMLElement): number {
  const styles = getComputedStyle(el)
  if (styles.lineHeight && styles.lineHeight !== 'normal') return parsePx(styles.lineHeight)
  return Math.round((parsePx(styles.fontSize) || 14) * 1.4)
}

function adjustTextareaHeight(textarea: HTMLTextAreaElement, maxLines?: number) {
  const styles = getComputedStyle(textarea)
  const padding = parsePx(styles.paddingTop) + parsePx(styles.paddingBottom)
  const border = parsePx(styles.borderTopWidth) + parsePx(styles.borderBottomWidth)
  const lineHeight = getLineHeightPx(textarea)
  const maxHeight = lineHeight * Math.max(1, Number(maxLines || 8)) + padding + border

  textarea.style.height = 'auto'
  textarea.style.maxHeight = `${Math.ceil(maxHeight)}px`
  textarea.style.height = `${Math.min(textarea.scrollHeight, Math.ceil(maxHeight))}px`
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
}
</script>
