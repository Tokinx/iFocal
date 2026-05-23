<template>
  <aside class="shrink-0 p-2">
    <div class="flex h-full min-h-0 flex-col gap-2">
      <Button variant="outline"
        class="rounded-1xl justify-center h-9 w-9 gap-2 bg-white hover:bg-white/60 shadow-xs hover:text-blue-600 hover:shadow-blue-100"
        :class="activeRouteName === 'assistant' ? '!bg-blue-600 shadow-blue-100 border-blue-700 !text-white' : ''"
        title="助手"
        @click="$emit('navigate', 'assistant')">
        <Icon icon="proicons:sparkle-2" class="h-4 w-4" />
      </Button>
      <Button variant="outline"
        class="rounded-1xl justify-center h-9 w-9 gap-2 bg-white hover:bg-white/60 shadow-xs hover:text-blue-600"
        :class="activeRouteName === 'translate' ? '!bg-blue-600 shadow-blue-100 border-blue-700 !text-white' : ''"
        title="翻译"
        @click="$emit('navigate', 'translate')">
        <Icon icon="ri:translate-2" class="h-4 w-4" />
      </Button>
      <Button variant="outline"
        class="rounded-1xl justify-center h-9 w-9 gap-2 bg-white hover:bg-white/60 shadow-xs hover:text-blue-600"
        :class="activeRouteName === 'settings' ? '!bg-blue-600 shadow-blue-100 border-blue-700 !text-white' : ''"
        title="设置"
        @click="$emit('navigate', 'settings')">
        <Icon icon="ri:settings-4-line" class="h-4 w-4" />
      </Button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import type { WindowRouteName } from '../router'

defineProps<{
  activeRouteName: WindowRouteName
}>()

defineEmits<{
  (e: 'navigate', route: WindowRouteName): void
}>()
</script>
