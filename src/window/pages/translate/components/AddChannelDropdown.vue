<template>
  <DropdownMenu v-model:open="open">
    <DropdownMenuTrigger as-child>
      <Button variant="outline" class="w-full h-9 rounded-lg border-dashed border-olive-300 text-olive-500 hover:bg-olive-50">
        <Icon icon="ri:add-line" class="h-4 w-4 mr-1" />
        添加翻译渠道
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-72 p-1">
      <Input v-model="keyword" placeholder="搜索渠道/模型" class="h-9 mb-1 rounded-xl" @keydown.stop />
      <ScrollArea class="h-72">
        <template v-if="machineList.length">
          <DropdownMenuLabel class="text-olive-500 text-xs">机器翻译</DropdownMenuLabel>
          <DropdownMenuItem v-for="channel in machineList" :key="channel.id"
            :disabled="usedMachineRefs.has(channel.id)"
            :class="['cursor-pointer', usedMachineRefs.has(channel.id) ? 'opacity-50' : '']"
            @click="!usedMachineRefs.has(channel.id) && handleAdd('machine', channel.id)">
            <Icon icon="ri:translate-2" class="h-4 w-4 text-emerald-600" />
            <span class="truncate">{{ channel.name }}</span>
            <Icon v-if="usedMachineRefs.has(channel.id)" icon="ri:check-line" class="ml-auto h-4 w-4" />
          </DropdownMenuItem>
        </template>

        <template v-for="(group, channelName, groupIndex) in filteredGroupedAiModels" :key="channelName">
          <DropdownMenuSeparator v-if="groupIndex || machineList.length" />
          <DropdownMenuLabel class="text-olive-500 text-xs">{{ channelName }}</DropdownMenuLabel>
          <DropdownMenuItem v-for="model in group" :key="model.key"
            :disabled="usedAiRefs.has(model.key)"
            :class="['cursor-pointer', usedAiRefs.has(model.key) ? 'opacity-50' : '']"
            @click="!usedAiRefs.has(model.key) && handleAdd('ai', model.key)">
            <Icon icon="proicons:sparkle-2" class="h-4 w-4 text-amber-700" />
            <span class="truncate">{{ model.model }}</span>
            <Icon v-if="usedAiRefs.has(model.key)" icon="ri:check-line" class="ml-auto h-4 w-4" />
          </DropdownMenuItem>
        </template>

        <div v-if="!machineList.length && aiResultCount === 0" class="px-3 py-6 text-center text-xs text-olive-400">
          没有匹配的渠道
        </div>
      </ScrollArea>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { MachineTranslateChannel } from '@/shared/machine-translation'
import type { TranslateCardItem, TranslateCardKind } from '../useTranslatePage'

const props = defineProps<{
  machineChannels: MachineTranslateChannel[]
  groupedAiModels: Record<string, Array<{ key: string; channel: string; model: string }>>
  cards: TranslateCardItem[]
}>()

const emit = defineEmits<{
  (e: 'add', kind: TranslateCardKind, ref: string): void
}>()

const open = ref(false)
const keyword = ref('')

watch(open, (val) => {
  if (!val) keyword.value = ''
})

const usedMachineRefs = computed(() => {
  return new Set(props.cards.filter((c) => c.kind === 'machine').map((c) => c.ref))
})

const usedAiRefs = computed(() => {
  return new Set(props.cards.filter((c) => c.kind === 'ai').map((c) => c.ref))
})

const machineList = computed<MachineTranslateChannel[]>(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return props.machineChannels
  return props.machineChannels.filter((c) => {
    return (
      c.name.toLowerCase().includes(q)
      || String(c.provider || '').toLowerCase().includes(q)
    )
  })
})

const filteredGroupedAiModels = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return props.groupedAiModels
  const result: Record<string, Array<{ key: string; channel: string; model: string }>> = {}
  for (const [channelName, group] of Object.entries(props.groupedAiModels)) {
    const channelMatch = channelName.toLowerCase().includes(q)
    const filtered = channelMatch
      ? group
      : group.filter((model) => {
        return model.model.toLowerCase().includes(q) || model.key.toLowerCase().includes(q)
      })
    if (filtered.length) result[channelName] = filtered
  }
  return result
})

const aiResultCount = computed(() => {
  let n = 0
  for (const group of Object.values(filteredGroupedAiModels.value)) n += group.length
  return n
})

function handleAdd(kind: TranslateCardKind, ref: string) {
  emit('add', kind, ref)
  open.value = false
}
</script>
