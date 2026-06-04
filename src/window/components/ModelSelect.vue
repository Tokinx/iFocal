<template>
  <DropdownMenu v-model:open="open">
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
          <div v-for="model in group" :key="model.key"
            :class="['group flex items-center gap-1 rounded-xl px-1.5 py-1 text-sm hover:bg-blue-700/10 hover:text-blue-700', model.key === selectedPairKey ? '!bg-blue-700 !text-white' : '']">
            <button type="button" @click="selectModel(model.key)"
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-left">
              <span class="min-w-0 flex-1 truncate">{{ model.model }}</span>
            </button>
            <button type="button"
              class="hidden group-hover:flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white/80 hover:bg-white"
              :title="pinnedSet.has(model.key) ? '取消置顶' : '置顶模型'" @click.stop.prevent="togglePin(model.key)">
              <Icon :icon="pinnedSet.has(model.key) ? 'ri:pushpin-fill' : 'ri:pushpin-line'"
                :class="['h-3.5 w-3.5', pinnedSet.has(model.key) ? 'rotate-45 text-blue-700' : 'text-slate-400']" />
            </button>
          </div>
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

const open = ref(false)
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

function selectModel(key: string) {
  emit('selectModel', key)
  open.value = false
}
</script>
