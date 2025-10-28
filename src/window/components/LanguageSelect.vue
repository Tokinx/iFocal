<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" :class="['rounded-2xl h-8 shrink-0 px-3', bgClass, blurClass]">
        <span class="truncate text-sm">{{ currentLangLabel }}</span>
        <Icon icon="ri:arrow-down-s-line" class="h-8 w-8 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" :class="['rounded-2xl border-none', bgClass, blurClass]">
      <DropdownMenuItem v-for="lang in supportedLanguages" :key="lang.value" @click="$emit('selectLanguage', lang.value)"
        class="rounded-xl cursor-pointer">
        {{ lang.label }}
        <Icon v-if="currentTargetLang === lang.value" icon="ri:check-line" class="ml-auto h-4 w-4" />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

defineProps<{
  currentLangLabel: string
  currentTargetLang: string
  supportedLanguages: Array<{ label: string; value: string }>
  bgClass?: string
  blurClass?: string
}>()

defineEmits<{
  (e: 'selectLanguage', value: string): void
}>()
</script>

