<template>
  <aside class="w-60 shrink-0">
    <div class="flex h-full min-h-0 flex-col gap-2">
      <Button
        variant="outline"
        class="w-full justify-center gap-2 bg-white hover:bg-white/60 border-olive-300/60 shadow-xs"
        @click="$emit('newChat')"
      >
        <Icon icon="ri:pencil-ai-line" class="h-4 w-4" />
        新会话
      </Button>

      <div class="p-1 space-y-1 bg-white border border-olive-300/60 shadow-xs">
        <div
          v-for="item in tasks"
          :key="item.id"
          role="button"
          tabindex="0"
          class="group flex min-h-9 w-full cursor-pointer items-center gap-2 px-3 text-sm transition-colors hover:bg-amber-800/80 hover:text-olive-100"
          :class="activeRouteName !== 'settings' && activeAssistantId === item.id ? 'bg-amber-800/90 text-olive-100' : 'text-foreground'"
          @click="$emit('selectAssistant', item.id)"
          @keydown.enter.prevent="$emit('selectAssistant', item.id)"
          @keydown.space.prevent="$emit('selectAssistant', item.id)"
        >
          <Icon :icon="item.icon" class="h-4 w-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate text-left">{{ item.label }}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            class="h-6 w-6 shrink-0 opacity-0 transition-opacity hover:bg-white/20 group-hover:opacity-100"
            title="编辑助手"
            @click.stop="$emit('editAssistant', item.id)"
          >
            <Icon icon="ri:edit-2-line" class="h-3 w-3" />
          </Button>
          <Button
            v-if="item.deletable"
            variant="ghost"
            size="icon-xs"
            class="h-6 w-6 shrink-0 opacity-0 transition-opacity hover:bg-white/20 group-hover:opacity-100"
            title="删除助手"
            @click.stop="$emit('deleteAssistant', item.id)"
          >
            <Icon icon="ri:delete-bin-line" class="h-3 w-3" />
          </Button>
        </div>

        <Button
          variant="ghost"
          class="w-full justify-center gap-2 border-none text-olive-500 hover:!bg-olive-100 hover:text-amber-800"
          title="添加助手"
          @click="$emit('addAssistant')"
        >
          <Icon icon="ri:add-line" class="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea class="min-h-30 flex-1">
        <div
          v-for="session in sessions"
          :key="session.id"
          role="button"
          tabindex="0"
          class="group flex cursor-pointer items-start gap-1 px-2 py-1.5 hover:text-amber-800/60"
          :class="currentSessionId === session.id ? '!text-amber-800 bg-olive-200' : 'text-olive-500'"
          @click="$emit('switchSession', session.id)"
          @keydown.enter.prevent="$emit('switchSession', session.id)"
          @keydown.space.prevent="$emit('switchSession', session.id)"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">
              {{ session.title || '新对话' }}
            </div>
            <div class="text-[11px] text-olive-400">
              {{ formatDate(session.updatedAt) }}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            @click.stop="$emit('deleteSession', session.id)"
          >
            <Icon icon="ri:delete-bin-line" class="!h-3 !w-3 text-muted-foreground" />
          </Button>
        </div>

        <div v-if="sessions.length === 0" class="px-2 py-8 text-center text-sm text-muted-foreground">
          暂无历史会话
        </div>
      </ScrollArea>

      <div class="space-y-2">
        <Button
          variant="outline"
          class="w-full justify-center gap-2 bg-white hover:bg-white/60 border-olive-300/60 shadow-xs"
          :class="activeRouteName === 'settings' ? '!bg-amber-800/90 !text-olive-100' : ''"
          @click="$emit('navigate', 'settings')"
        >
          <Icon icon="ri:settings-4-line" class="h-4 w-4" />
          设置中心
        </Button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SidebarTask, WindowSession } from '../types'
import type { WindowRouteName } from '../router'

defineProps<{
  tasks: SidebarTask[]
  sessions: WindowSession[]
  currentSessionId: string
  activeAssistantId: string
  activeRouteName: WindowRouteName
  formatDate: (timestamp: number) => string
}>()

defineEmits<{
  (e: 'navigate', route: WindowRouteName): void
  (e: 'newChat'): void
  (e: 'selectAssistant', assistantId: string): void
  (e: 'addAssistant'): void
  (e: 'editAssistant', assistantId: string): void
  (e: 'deleteAssistant', assistantId: string): void
  (e: 'switchSession', sessionId: string): void
  (e: 'deleteSession', sessionId: string): void
}>()
</script>
