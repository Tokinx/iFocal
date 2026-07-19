<template>
  <aside class="flex w-60 min-w-0 shrink-0 flex-col" aria-label="主导航">
    <!-- <div class="flex min-h-[54px] items-center gap-2.5 px-[7px] pb-[9px] pt-0.5">
      <div class="min-w-0">
        <strong
          class="block truncate text-[15px] font-semibold tracking-[-.025em] text-stone-800 max-[560px]:text-[13px]">iFocal</strong>
        <p class="m-0 text-[9px] font-semibold uppercase tracking-[.1em] text-stone-400">智能工作台</p>
      </div>
    </div> -->

    <nav class="flex shrink-0 flex-col gap-[3px]" aria-label="功能导航">
      <div :class="['rounded-xl', activeRouteName === 'assistant' && 'bg-white font-semibold !text-stone-800']">
        <div class="flex h-10 w-full items-center text-md text-stone-500 hover:bg-stone-500/6 hover:text-stone-800"
          :class="[activeRouteName === 'assistant' ? 'rounded-t-xl' : 'rounded-xl']">
          <button class="flex h-full min-w-0 flex-1 items-center gap-[9px] pl-2.5 text-left"
            @click="$emit('navigate', 'assistant')">
            <Icon icon="ri:chat-smile-2-line" class="h-[17px] w-[17px]" />
            <span>助手</span>
          </button>
          <button
            class="mr-[5px] grid size-[30px] shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-white/70 hover:text-stone-800"
            title="添加助手" @click.stop="openEditor(null)">
            <Icon icon="ri:add-line" class="h-4 w-4" />
          </button>
        </div>
        <div v-if="activeRouteName === 'assistant'" class="flex flex-col gap-1 p-1 border-t border-stone-700/5">
          <div v-for="item in tasks" :key="item.id"
            class="group flex min-h-8 items-center rounded-lg text-stone-500 hover:bg-stone-500/6 hover:text-stone-800"
            :class="activeAssistantId === item.id ? 'text-stone-800 bg-stone-500/6' : ''">
            <button class="flex h-[34px] min-w-0 flex-1 items-center gap-2 pl-[9px] text-left"
              @click="$emit('selectAssistant', item.id)">
              <Icon :icon="item.icon" class="h-4 w-4" />
              <span class="truncate text-xs">{{ item.label }}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button
                  class="mr-1 grid size-[26px] shrink-0 place-items-center rounded-[7px] text-stone-400 opacity-0 hover:bg-white/70 hover:text-stone-700 group-hover:opacity-100"
                  title="助手操作" @click.stop>
                  <Icon icon="ri:more-2-fill" class="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="min-w-30 w-30">
                <DropdownMenuItem @click="openEditor(item.id)">
                  <Icon icon="ri:edit-2-line" />编辑
                </DropdownMenuItem>
                <DropdownMenuItem v-if="item.deletable" class="text-destructive"
                  @click="$emit('deleteAssistant', item.id)">
                  <Icon icon="ri:delete-bin-line" />删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <button
        class="flex h-[39px] w-full items-center gap-[9px] rounded-[10px] px-2.5 text-left text-[13px] text-stone-500 hover:bg-stone-500/6 hover:text-stone-800"
        :class="activeRouteName === 'translate' ? 'text-stone-500 bg-stone-500/6' : ''"
        @click="$emit('navigate', 'translate')">
        <Icon icon="ri:translate-2" class="h-[17px] w-[17px]" /><span>翻译</span>
      </button>

      <div :class="['rounded-xl', activeRouteName === 'settings' && 'bg-white font-semibold !text-stone-800']">
        <button
          class="flex h-10 w-full items-center gap-2 px-2.5 text-left text-[13px] text-stone-500 hover:bg-stone-500/6 hover:text-stone-800"
          :class="[activeRouteName === 'settings' ? 'rounded-t-xl' : 'rounded-xl']"
          @click="$emit('navigate', 'settings')">
          <Icon icon="ri:settings-4-line" class="h-[17px] w-[17px]" /><span>设置</span>
        </button>
        <div v-if="activeRouteName === 'settings'" class="flex flex-col gap-1 p-1 border-t border-stone-700/5">
          <button v-for="item in settingsItems" :key="item.id"
            class="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-xs text-stone-500 hover:bg-stone-500/6 hover:text-stone-800"
            :class="settingsSection === item.id ? 'text-stone-800 bg-stone-500/6' : ''"
            @click="$emit('update:settingsSection', item.id)">
            <Icon :icon="iconOfNav(item.id)" class="h-4 w-4" /><span>{{ item.label }}</span>
          </button>
        </div>
      </div>
    </nav>

    <template v-if="activeRouteName !== 'settings'">
      <div class="mx-2 my-2.5 h-px bg-stone-700/10" />
      <section class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          class="flex h-[30px] shrink-0 items-center justify-between px-2 pb-[5px] text-xs font-semibold text-stone-400">
          <div class="flex items-center">
            历史记录
          </div>
          <button v-if="activeRouteName === 'assistant'"
            class="grid size-[25px] place-items-center rounded-lg hover:bg-stone-500/[.06] hover:text-stone-700"
            title="新会话" @click="$emit('newSession')">
            <Icon icon="ri:add-line" class="h-4 w-4" />
          </button>
          <span v-else>{{ translateHistory.length }}</span>
        </div>

        <ScrollArea v-if="activeRouteName === 'assistant' || activeRouteName === 'translate'" class="min-h-0 flex-1">
          <template v-if="activeRouteName === 'assistant'">
            <button v-for="session in sessions" :key="session.id"
              class="group mb-1 flex min-h-8 w-full items-center gap-1 rounded-xl p-1 pl-2.5 text-left text-stone-500 hover:bg-stone-500/6 hover:text-stone-800"
              :class="currentSessionId === session.id ? 'text-stone-800 bg-stone-500/6' : ''"
              @click="$emit('switchSession', session.id)">
              <span class="min-w-0 flex-1">
                <strong class="block truncate text-sm font-medium">{{ session.title || '新对话' }}</strong>
              </span>
              <span
                class="grid size-[25px] shrink-0 place-items-center rounded-lg text-stone-400 opacity-0 hover:bg-red-700/[.08] hover:text-red-700 group-hover:opacity-100"
                title="删除会话" @click.stop="$emit('deleteSession', session.id)">
                <Icon icon="ri:delete-bin-line" class="h-3.5 w-3.5" />
              </span>
            </button>
            <div v-if="!sessions.length" class="flex min-h-[110px] items-center justify-center text-sm text-stone-400">暂无聊天历史</div>
          </template>

          <template v-if="activeRouteName === 'translate'">
            <button v-for="record in translateHistory" :key="record.id"
              class="mb-1 block min-h-8 w-full rounded-xl p-1 px-2.5 text-left text-stone-500 hover:bg-stone-500/6 hover:text-stone-800"
              :class="activeTranslateHistoryId === record.id ? 'text-stone-800 bg-stone-500/6' : ''"
              @click="restoreTranslateHistory(record.id)">
              <!-- <span class="flex items-center justify-between gap-1.5 text-[9px] text-stone-400">
                <span>{{ formatHistoryTime(record.createdAt) }}</span>
                <span>{{ record.sourceLang }} → {{ record.targetLang }}</span>
              </span> -->
              <strong class="block truncate text-xs font-medium leading-[1.45]"
                :title="record.sourceText">{{
                  record.sourceText }}</strong>
            </button>
            <div v-if="!translateHistory.length" class="flex min-h-[110px] items-center justify-center text-sm text-stone-400">暂无翻译历史</div>
          </template>
        </ScrollArea>
      </section>
    </template>

    <AssistantEditorDialog v-if="editorOpen" :open="editorOpen" :assistant="editingAssistant" :model-pairs="modelPairs"
      :pinned-model-keys="pinnedModelKeys" @update:open="handleEditorOpenChange"
      @togglePinnedModel="(key) => $emit('togglePinnedModel', key)" @save="saveAssistant"
      @delete="deleteAssistantFromDialog" />
  </aside>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { iconOfNav } from '@/shared/icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { AssistantConfig } from '@/shared/assistants'
import type { SidebarTask, WindowSession } from '@/window/types'
import type { SettingsNavId } from '@/window/pages/settings/components/SettingsNav.vue'
import {
  TRANSLATE_HISTORY_RESTORE_EVENT,
  TRANSLATE_HISTORY_STORAGE_KEY,
  TRANSLATE_HISTORY_UPDATED_EVENT,
  type TranslateHistoryRecord,
} from '@/window/pages/translate/useTranslatePage'
import type { WindowRouteName } from '../router'

const AssistantEditorDialog = defineAsyncComponent(() => import('@/window/pages/assistant/components/AssistantEditorDialog.vue'))

const settingsItems: Array<{ id: SettingsNavId; label: string }> = [
  { id: 'settings', label: '通用设置' },
  { id: 'machine', label: '机器翻译' },
  { id: 'channels', label: '渠道管理' },
  { id: 'mcp', label: 'MCP 功能' },
  { id: 'debug', label: '其它设置' },
  { id: 'about', label: '关于插件' },
]

const translateHistory = ref<TranslateHistoryRecord[]>([])
const activeTranslateHistoryId = ref('')
const editorOpen = ref(false)
const editingAssistantId = ref<string | null>(null)
const editingAssistant = computed(() => {
  if (!editingAssistantId.value) return null
  return props.assistantConfigs.find((assistant) => assistant.id === editingAssistantId.value) || null
})

function openEditor(assistantId: string | null) {
  editingAssistantId.value = assistantId
  editorOpen.value = true
}

function handleEditorOpenChange(open: boolean) {
  editorOpen.value = open
  if (!open) editingAssistantId.value = null
}

function saveAssistant(assistant: AssistantConfig) {
  emit('saveAssistant', assistant)
  handleEditorOpenChange(false)
}

function deleteAssistantFromDialog(assistantId: string) {
  emit('deleteAssistant', assistantId)
  handleEditorOpenChange(false)
}

function normalizeTranslateHistory(value: unknown): TranslateHistoryRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is TranslateHistoryRecord => {
    return !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.sourceText === 'string'
  }).slice(0, 30)
}

function readTranslateHistory() {
  try {
    const raw = window.localStorage.getItem(TRANSLATE_HISTORY_STORAGE_KEY)
    if (raw) {
      translateHistory.value = normalizeTranslateHistory(JSON.parse(raw))
      return
    }
  } catch { /* localStorage may be unavailable */ }
  try {
    chrome.storage.local.get([TRANSLATE_HISTORY_STORAGE_KEY], (data) => {
      translateHistory.value = normalizeTranslateHistory(data?.[TRANSLATE_HISTORY_STORAGE_KEY])
    })
  } catch { /* extension storage may be unavailable in preview */ }
}

function handleHistoryUpdated(event: Event) {
  translateHistory.value = normalizeTranslateHistory((event as CustomEvent).detail)
}

function restoreTranslateHistory(recordId: string) {
  activeTranslateHistoryId.value = recordId
  window.dispatchEvent(new CustomEvent(TRANSLATE_HISTORY_RESTORE_EVENT, { detail: { recordId } }))
}

function formatHistoryTime(timestamp: number): string {
  const date = new Date(timestamp)
  const diff = Date.now() - date.getTime()
  if (diff >= 0 && diff < 60000) return '刚刚'
  if (diff >= 0 && diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff >= 0 && diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

onMounted(() => {
  readTranslateHistory()
  window.addEventListener(TRANSLATE_HISTORY_UPDATED_EVENT, handleHistoryUpdated)
})

onBeforeUnmount(() => window.removeEventListener(TRANSLATE_HISTORY_UPDATED_EVENT, handleHistoryUpdated))

const props = defineProps<{
  activeRouteName: WindowRouteName
  settingsSection: SettingsNavId
  tasks: SidebarTask[]
  sessions: WindowSession[]
  currentSessionId: string
  activeAssistantId: string
  assistantConfigs: AssistantConfig[]
  modelPairs: Array<{ key: string; channel: string; model: string }>
  pinnedModelKeys: string[]
  formatDate: (timestamp: number) => string
}>()

const emit = defineEmits<{
  (e: 'navigate', route: WindowRouteName): void
  (e: 'update:settingsSection', section: SettingsNavId): void
  (e: 'selectAssistant', assistantId: string): void
  (e: 'deleteAssistant', assistantId: string): void
  (e: 'switchSession', sessionId: string): void
  (e: 'deleteSession', sessionId: string): void
  (e: 'newSession'): void
  (e: 'togglePinnedModel', key: string): void
  (e: 'saveAssistant', assistant: AssistantConfig): void
}>()
</script>
