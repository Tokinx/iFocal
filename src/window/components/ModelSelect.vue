<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" :class="['rounded-2xl justify-start truncate h-8 px-3', bgClass, blurClass]">
        <span class="truncate text-sm">{{ currentModelName || 'GPT-5' }}</span>
        <Icon icon="ri:arrow-down-s-line" class="h-8 w-8 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" :class="['w-56 rounded-2xl border-none', bgClass, blurClass]">
      <ScrollArea class="h-80">
        <template v-for="(group, channelName, groupIndex) in groupedModels" :key="channelName">
          <DropdownMenuSeparator v-if="groupIndex" />
          <DropdownMenuLabel>{{ channelName }}</DropdownMenuLabel>
          <DropdownMenuItem v-for="model in group" :key="model.key" @click="$emit('selectModel', model.key)"
            class="rounded-xl cursor-pointer">
            <span class="truncate">{{ model.model }}</span>
            <Icon v-if="selectedPairKey === model.key" icon="ri:check-line" class="ml-auto h-4 w-4" />
          </DropdownMenuItem>
        </template>
      </ScrollArea>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

defineProps<{
  currentModelName: string
  groupedModels: Record<string, Array<{ key: string; model: string; channel: string }>>
  selectedPairKey: string
  bgClass?: string
  blurClass?: string
}>()

defineEmits<{
  (e: 'selectModel', key: string): void
}>()
</script>

