<template>
  <header class="flex items-center justify-end gap-1.5" aria-label="翻译语言">
    <LanguageDropdown
      :model-value="sourceLang"
      :options="sourceLangOptions"
      fallback-label="自动检测"
      align="end"
      aria-label="选择原文语言"
      button-class="max-w-40"
      @update:modelValue="emit('update:sourceLang', $event)"
    />

    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-lg text-slate-600 hover:bg-slate-100"
          :disabled="sourceLang === 'auto'"
          title="切换原文和译文语言"
          aria-label="切换原文和译文语言"
          @click="emit('swapLanguages')"
        >
          <Icon icon="ri:arrow-left-right-line" class="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>切换语言</TooltipContent>
    </Tooltip>

    <LanguageDropdown
      :model-value="targetLang"
      :options="targetLangOptions"
      fallback-label="简体中文"
      align="end"
      aria-label="选择译文语言"
      button-class="max-w-40"
      @update:modelValue="emit('update:targetLang', $event)"
    />
  </header>
</template>

<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import LanguageDropdown from '@/window/components/LanguageDropdown.vue'
import type { TranslateLanguageOption } from '../useTranslatePage'

defineProps<{
  sourceLang: string
  targetLang: string
  sourceLangOptions: TranslateLanguageOption[]
  targetLangOptions: TranslateLanguageOption[]
}>()

const emit = defineEmits<{
  (e: 'update:sourceLang', value: string): void
  (e: 'update:targetLang', value: string): void
  (e: 'swapLanguages'): void
}>()
</script>
