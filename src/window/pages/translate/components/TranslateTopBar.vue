<template>
  <header class="flex items-center justify-between gap-2 p-3 border-b border-olive-200">
    <div class="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="h-8 rounded-xl px-3 bg-white hover:bg-olive-50">
            <span class="truncate text-sm">{{ sourceLangLabel }}</span>
            <Icon icon="ri:arrow-down-s-line" class="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="min-w-36 max-h-80 overflow-auto">
          <DropdownMenuItem v-for="lang in sourceLangOptions" :key="lang.value"
            class="cursor-pointer"
            @click="$emit('update:sourceLang', lang.value)">
            <span class="truncate">{{ lang.label }}</span>
            <Icon v-if="sourceLang === lang.value" icon="ri:check-line" class="ml-auto h-4 w-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="h-8 w-8 rounded-xl text-olive-600 hover:bg-olive-100"
            :disabled="sourceLang === 'auto'"
            @click="$emit('swapLanguages')">
            <Icon icon="ri:arrow-left-right-line" class="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>互换语言</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="h-8 rounded-xl px-3 bg-white hover:bg-olive-50">
            <span class="truncate text-sm">{{ targetLangLabel }}</span>
            <Icon icon="ri:arrow-down-s-line" class="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="min-w-36 max-h-80 overflow-auto">
          <DropdownMenuItem v-for="lang in targetLangOptions" :key="lang.value"
            class="cursor-pointer"
            @click="$emit('update:targetLang', lang.value)">
            <span class="truncate">{{ lang.label }}</span>
            <Icon v-if="targetLang === lang.value" icon="ri:check-line" class="ml-auto h-4 w-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <Button class="h-8 rounded-xl px-4 bg-amber-700 text-white hover:bg-amber-800"
      :disabled="disabled"
      @click="$emit('translate')">
      <Icon icon="ri:translate-2" class="h-4 w-4 mr-1" />
      翻译
    </Button>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TranslateLanguageOption } from '../useTranslatePage'

const props = defineProps<{
  sourceLang: string
  targetLang: string
  sourceLangOptions: TranslateLanguageOption[]
  targetLangOptions: TranslateLanguageOption[]
  disabled?: boolean
}>()

defineEmits<{
  (e: 'update:sourceLang', value: string): void
  (e: 'update:targetLang', value: string): void
  (e: 'swapLanguages'): void
  (e: 'translate'): void
}>()

const sourceLangLabel = computed(() => {
  return props.sourceLangOptions.find((l) => l.value === props.sourceLang)?.label || '自动检测'
})

const targetLangLabel = computed(() => {
  return props.targetLangOptions.find((l) => l.value === props.targetLang)?.label || props.targetLang
})
</script>
