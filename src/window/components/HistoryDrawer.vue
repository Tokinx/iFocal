<template>
  <Sheet v-model:open="innerOpen">
    <SheetContent side="left" class="w-80 flex flex-col">
      <SheetHeader>
        <SheetTitle>历史会话 ({{ sessions.length }})</SheetTitle>
        <SheetDescription>
          查看和管理您的对话历史
        </SheetDescription>
      </SheetHeader>

      <div class="mt-6 space-y-2 flex-1 overflow-y-auto">
        <!-- 新建对话按钮 -->
        <Button variant="outline" class="w-full justify-start gap-2" @click="$emit('newChatFromDrawer')">
          <Icon icon="ri:add-line" class="h-4 w-4" />
          新建对话
        </Button>

        <!-- 会话列表 -->
        <div class="space-y-1">
          <button v-for="(session, idx) in sessions" :key="session.id" @click="$emit('switchSession', session.id)"
            class="w-full rounded-lg p-3 text-left transition-colors hover:bg-accent"
            :class="{ 'bg-accent': currentSessionId === session.id }">
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="truncate text-sm font-medium">
                  {{ session.title || '新对话' }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ formatDate(session.updatedAt) }}
                </div>
              </div>
              <Button variant="ghost" size="icon" class="h-6 w-6 shrink-0" @click.stop="$emit('deleteSession', session.id)">
                <Icon icon="ri:delete-bin-line" class="h-4 w-4" />
              </Button>
            </div>
          </button>
        </div>

        <!-- 空状态 -->
        <div v-if="sessions.length === 0" class="py-8 text中心 text-sm text-muted-foreground">
          暂无历史会话
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

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

