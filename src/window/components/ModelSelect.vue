<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" :class="['justify-start truncate h-8 font-normal gap-1 px-3', bgClass, blurClass]">
        <span class="truncate text-sm">{{ currentModelName || 'GPT-5' }}</span>
        <Icon icon="ri:arrow-down-s-line" class="h-7 w-7 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" :class="['w-56', bgClass, blurClass]">
      <ScrollArea class="h-60">
        <template v-for="(group, channelName, groupIndex) in filteredGroupedModels" :key="channelName">
          <DropdownMenuSeparator v-if="groupIndex" />
          <DropdownMenuLabel>{{ channelName }}</DropdownMenuLabel>
          <DropdownMenuItem v-for="model in group" :key="model.key" @click="$emit('selectModel', model.key)"
            class=" cursor-pointer">
            <span class="truncate">{{ model.model }}</span>
            <Icon v-if="selectedPairKey === model.key" icon="ri:check-line" class="ml-auto h-4 w-4" />
          </DropdownMenuItem>
        </template>
      </ScrollArea>
      <Input v-model="keyword" placeholder="搜索模型" class="h-8 mt-1" />
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const props = defineProps<{
  currentModelName: string
  groupedModels: Record<string, Array<{ key: string; model: string; channel: string }>>
  selectedPairKey: string
  bgClass?: string
  blurClass?: string
}>()

const keyword = ref('')
const filteredGroupedModels = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return props.groupedModels
  const result: Record<string, Array<{ key: string; model: string; channel: string }>> = {}
  for (const [channelName, group] of Object.entries(props.groupedModels)) {
    const filtered = group.filter((model) => {
      return model.model.toLowerCase().includes(q) || model.key.toLowerCase().includes(q)
    })
    if (filtered.length) result[channelName] = filtered
  }
  return result
})

defineEmits<{
  (e: 'selectModel', key: string): void
}>()
</script>
