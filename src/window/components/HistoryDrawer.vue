<template>
  <Sheet v-model:open="innerOpen">
    <SheetContent side="left" :class="['w-80 flex flex-col rounded-md left-2 top-2 bottom-2 border !h-auto !p-3', bgClass, blurClass]">
      <SheetHeader>
        <SheetTitle class="text-lg font-medium">历史会话 ({{ sessions.length }})</SheetTitle>
      </SheetHeader>

      <ScrollArea class="flex-1">
        <div class="space-y-1">
          <!-- 会话列表 -->
          <button v-for="(session, idx) in sessions" :key="session.id" @click="$emit('switchSession', session.id)"
            class="w-full rounded-lg p-3 text-left transition-colors hover:bg-white/60"
            :class="{ 'bg-white/80': currentSessionId === session.id }">
            <div class="flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="truncate text-sm font-medium text-foreground">
                  {{ session.title || '新对话' }}
                </div>
                <div class="text-xs text-muted-foreground mt-0.5">
                  {{ formatDate(session.updatedAt) }}
                </div>
              </div>
              <Button variant="ghost" size="icon" class="h-6 w-6 shrink-0 hover:bg-zinc-200/80" @click.stop="$emit('deleteSession', session.id)">
                <Icon icon="ri:delete-bin-line" class="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </button>

          <!-- 空状态 -->
          <div v-if="sessions.length === 0" class="py-8 text-center text-sm text-muted-foreground">
            暂无历史会话
          </div>
        </div>
      </ScrollArea>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Session {
  id: string
  title: string
  task: 'translate' | 'summarize' | 'rewrite' | 'polish' | 'chat'
  messages: any[]
  createdAt: number
  updatedAt: number
}

const props = defineProps<{
  open: boolean
  sessions: Session[]
  currentSessionId: string
  bgClass: string
  blurClass: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'switchSession', id: string): void
  (e: 'deleteSession', id: string): void
  (e: 'newChatFromDrawer'): void
}>()

const innerOpen = computed({
  get: () => props.open,
  set: v => emit('update:open', v)
})

function formatDate(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

