<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline"
        :class="['justify-start truncate h-8 font-normal gap-1 px-3 rounded-xl border border-slate-300/50 shadow-xs', bgClass, blurClass, buttonClass]">
        <span class="truncate text-sm">{{ currentModelName || 'GPT-5' }}</span>
        <Icon icon="ri:arrow-down-s-line" class="h-7 w-7 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" :class="['min-w-55', bgClass, blurClass]">
      <Input v-model="keyword" placeholder="搜索模型" class="h-9 mb-1 rounded-xl" />
      <ScrollArea class="h-50">
        <template v-for="(group, channelName, groupIndex) in filteredGroupedModels" :key="channelName">
          <DropdownMenuSeparator v-if="groupIndex" />
          <DropdownMenuLabel>{{ channelName }}</DropdownMenuLabel>
          <DropdownMenuItem v-for="model in group" :key="model.key" @click="emit('selectModel', model.key)"
            class="cursor-pointer gap-2">
            <span class="min-w-0 flex-1 truncate">{{ model.model }}</span>
            <Button as="span" variant="ghost" size="icon"
              class="h-6 w-6 shrink-0 cursor-pointer rounded-lg text-slate-500 hover:bg-slate-100"
              :title="pinnedSet.has(model.key) ? '取消置顶' : '置顶模型'"
              role="button" tabindex="-1"
              @pointerdown.stop.prevent
              @mousedown.stop.prevent
              @click.stop.prevent="togglePin(model.key)">
              <Icon icon="lucide:pin"
                :class="['h-3.5 w-3.5', pinnedSet.has(model.key) ? 'rotate-45 text-blue-700' : 'text-slate-400']" />
            </Button>
            <Icon v-if="selectedPairKey === model.key" icon="ri:check-line" class="h-4 w-4 shrink-0" />
          </DropdownMenuItem>
        </template>
      </ScrollArea>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/ui/icon/Icon.vue';
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
  pinnedModelKeys?: string[]
  bgClass?: string
  blurClass?: string,
  buttonClass?: string
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

const pinnedSet = computed(() => new Set(props.pinnedModelKeys || []))

const emit = defineEmits<{
  (e: 'selectModel', key: string): void
  (e: 'togglePin', key: string): void
}>()

function togglePin(key: string) {
  emit('togglePin', key)
}
</script>
