<template>
  <LanguageDropdown
    :model-value="currentTargetLang"
    :options="supportedLanguages"
    :fallback-label="currentLangLabel"
    :bg-class="bgClass"
    :blur-class="blurClass"
    button-class="max-w-44"
    aria-label="选择回复语言"
    @update:modelValue="$emit('selectLanguage', $event)"
  />
</template>

<script setup lang="ts">
import LanguageDropdown from '@/window/components/LanguageDropdown.vue'

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
