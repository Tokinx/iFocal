<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" class="rounded-full justify-start truncate h-8 font-normal gap-1 px-3">
        <span class="truncate text-sm">{{ currentModelName || 'GPT-5' }}</span>
        <Icon icon="ri:arrow-down-s-line" class="h-7 w-7 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" :class="['w-56 rounded-2xl', bgClass, blurClass]">
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

