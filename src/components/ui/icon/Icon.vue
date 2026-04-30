<script setup lang="ts">
import { computed, type Component, useAttrs } from 'vue'
import {
  PhArrowClockwise,
  PhArrowDown,
  PhArrowsClockwise,
  PhBug,
  PhCaretDown,
  PhCaretUp,
  PhChatCenteredText,
  PhChatCircleDots,
  PhCheck,
  PhCircleNotch,
  PhCopy,
  PhDisc,
  PhDownloadSimple,
  PhEye,
  PhEyeSlash,
  PhFile,
  PhFileDoc,
  PhFilePdf,
  PhFilePpt,
  PhFileText,
  PhFileXls,
  PhFloppyDisk,
  PhGearSix,
  PhGoogleLogo,
  PhImage,
  PhInfo,
  PhKeyboard,
  PhLightbulb,
  PhLightning,
  PhListBullets,
  PhMagnifyingGlass,
  PhOpenAiLogo,
  PhPaperclip,
  PhPaperPlaneTilt,
  PhPencilSimple,
  PhPencilSimpleLine,
  PhPenNibStraight,
  PhPlus,
  PhPlusSquare,
  PhQuestion,
  PhSparkle,
  PhSquaresFour,
  PhStop,
  PhTrash,
  PhTranslate,
  PhWarning,
  PhX,
} from '@phosphor-icons/vue'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DotsHorizontalIcon,
  DownloadIcon,
  DragHandleVerticalIcon,
} from '@radix-icons/vue'

defineOptions({
  inheritAttrs: false,
})

type IconFamily = 'phosphor' | 'radix'
type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'

interface IconEntry {
  component: Component
  family: IconFamily
  weight?: IconWeight
}

const props = defineProps<{
  icon?: string
  width?: string | number
  height?: string | number
}>()

const attrs = useAttrs()

const ICON_MAP: Record<string, IconEntry> = {
  // Remix 风格
  'ri:add-line': { component: PhPlus, family: 'phosphor' },
  'ri:apps-2-ai-line': { component: PhSquaresFour, family: 'phosphor' },
  'ri:arrow-down-line': { component: PhArrowDown, family: 'phosphor' },
  'ri:arrow-down-s-line': { component: PhCaretDown, family: 'phosphor' },
  'ri:arrow-up-s-line': { component: PhCaretUp, family: 'phosphor' },
  'ri:attachment-2': { component: PhPaperclip, family: 'phosphor' },
  'ri:chat-ai-line': { component: PhChatCircleDots, family: 'phosphor' },
  'ri:check-line': { component: PhCheck, family: 'phosphor' },
  'ri:close-line': { component: PhX, family: 'phosphor' },
  'ri:delete-bin-line': { component: PhTrash, family: 'phosphor' },
  'ri:download-line': { component: PhDownloadSimple, family: 'phosphor' },
  'ri:dvd-ai-line': { component: PhDisc, family: 'phosphor' },
  'ri:edit-2-line': { component: PhPencilSimple, family: 'phosphor' },
  'ri:file-ai-line': { component: PhFileText, family: 'phosphor' },
  'ri:file-copy-line': { component: PhCopy, family: 'phosphor' },
  'ri:file-excel-line': { component: PhFileXls, family: 'phosphor' },
  'ri:file-line': { component: PhFile, family: 'phosphor' },
  'ri:file-pdf-line': { component: PhFilePdf, family: 'phosphor' },
  'ri:file-ppt-line': { component: PhFilePpt, family: 'phosphor' },
  'ri:file-text-line': { component: PhFileText, family: 'phosphor' },
  'ri:file-word-line': { component: PhFileDoc, family: 'phosphor' },
  'ri:image-line': { component: PhImage, family: 'phosphor' },
  'ri:lightbulb-ai-line': { component: PhLightbulb, family: 'phosphor' },
  'ri:message-ai-3-line': { component: PhChatCenteredText, family: 'phosphor' },
  'ri:more-2-fill': { component: DotsHorizontalIcon, family: 'radix' },
  'ri:pencil-ai-line': { component: PhPencilSimpleLine, family: 'phosphor' },
  'ri:quill-pen-ai-line': { component: PhPenNibStraight, family: 'phosphor' },
  'ri:restart-line': { component: PhArrowsClockwise, family: 'phosphor' },
  'ri:search-ai-line': { component: PhMagnifyingGlass, family: 'phosphor' },
  'ri:send-plane-2-fill': { component: PhPaperPlaneTilt, family: 'phosphor', weight: 'fill' },
  'ri:settings-4-line': { component: PhGearSix, family: 'phosphor' },
  'ri:sparkling-2-line': { component: PhSparkle, family: 'phosphor' },
  'ri:stop-fill': { component: PhStop, family: 'phosphor', weight: 'fill' },
  'ri:translate-ai': { component: PhTranslate, family: 'phosphor' },

  // 其他集合（旧）
  'line-md:loading-twotone-loop': { component: PhCircleNotch, family: 'phosphor' },
  'logos:openai-icon': { component: PhOpenAiLogo, family: 'phosphor' },
  'logos:google-gemini': { component: PhGoogleLogo, family: 'phosphor' },
  'material-symbols:visibility-outline': { component: PhEye, family: 'phosphor' },
  'material-symbols:visibility-off-outline': { component: PhEyeSlash, family: 'phosphor' },

  // Proicons 风格
  'proicons:alert-triangle': { component: PhWarning, family: 'phosphor' },
  'proicons:arrow-clockwise': { component: PhArrowClockwise, family: 'phosphor' },
  'proicons:bolt': { component: PhLightning, family: 'phosphor' },
  'proicons:box-add': { component: PhPlusSquare, family: 'phosphor' },
  'proicons:bug': { component: PhBug, family: 'phosphor' },
  'proicons:bullet-list-square': { component: PhListBullets, family: 'phosphor' },
  'proicons:chat': { component: PhChatCircleDots, family: 'phosphor' },
  'proicons:copy': { component: PhCopy, family: 'phosphor' },
  'proicons:delete': { component: PhTrash, family: 'phosphor' },
  'proicons:info': { component: PhInfo, family: 'phosphor' },
  'proicons:keyboard': { component: PhKeyboard, family: 'phosphor' },
  'proicons:pencil': { component: PhPencilSimple, family: 'phosphor' },
  'proicons:pencil-sparkle': { component: PhSparkle, family: 'phosphor' },
  'proicons:save': { component: PhFloppyDisk, family: 'phosphor' },
  'proicons:sparkle-2': { component: PhSparkle, family: 'phosphor' },

  // Lucide 风格
  'lucide:chevron-down': { component: ChevronDownIcon, family: 'radix' },
  'lucide:chevron-right': { component: ChevronRightIcon, family: 'radix' },
  'lucide:download': { component: DownloadIcon, family: 'radix' },
  'lucide:grip-vertical': { component: DragHandleVerticalIcon, family: 'radix' },
}

const fallbackIcon: IconEntry = {
  component: PhQuestion,
  family: 'phosphor',
}

const resolved = computed(() => {
  const key = String(props.icon || '').trim()
  return ICON_MAP[key] || fallbackIcon
})

const hasExplicitSize = computed(() => props.width != null || props.height != null)

const sizeValue = computed(() => {
  if (props.width != null) return props.width
  if (props.height != null) return props.height
  return undefined
})

const resolvedAttrs = computed<Record<string, unknown>>(() => {
  const base: Record<string, unknown> = {
    'aria-hidden': 'true',
    ...attrs,
  }

  if (resolved.value.family === 'phosphor') {
    if (sizeValue.value != null) {
      base.size = sizeValue.value
    }
    if (resolved.value.weight) {
      base.weight = resolved.value.weight
    }
    return base
  }

  if (hasExplicitSize.value) {
    base.width = props.width ?? sizeValue.value
    base.height = props.height ?? sizeValue.value
  }
  return base
})
</script>

<template>
  <component :is="resolved.component" v-bind="resolvedAttrs" />
</template>
