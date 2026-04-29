<template>
  <Sheet v-model:open="innerOpen">
    <SheetContent side="right"
      :class="['w-80 flex flex-col right-2 top-2 bottom-2 border !h-auto !p-3', bgClass, blurClass]">
      <SheetHeader>
        <SheetTitle class="text-lg font-medium">插件设置</SheetTitle>
        <SheetDescription>这是保留给助手窗口的轻量设置面板，完整配置统一在设置中心中维护。</SheetDescription>
      </SheetHeader>

      <ScrollArea class="flex-1 pr-1">
        <div class="space-y-6 py-3">
          <section class="space-y-3">
            <div class="text-xs font-medium text-muted-foreground">通用设置</div>

            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-sm font-medium">默认目标语言</div>
                <p class="text-xs text-muted-foreground">用于翻译结果的语言</p>
              </div>
              <div class="w-36 shrink-0">
                <Select :model-value="targetLang" @update:modelValue="$emit('update:targetLang', String($event))">
                  <SelectTrigger>
                    <SelectValue placeholder="语言" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">
                      {{ lang.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-sm font-medium">会话保存数量</div>
                <p class="text-xs text-muted-foreground">助手窗口最多保留的历史会话数</p>
              </div>
              <div class="w-28 shrink-0">
                <Select :model-value="maxSessionsCount"
                  @update:modelValue="$emit('update:maxSessionsCount', Number($event))">
                  <SelectTrigger>
                    <SelectValue placeholder="数量" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="count in sessionCountOptions" :key="count" :value="count">
                      {{ count }} 个
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-sm font-medium">上下文消息数量</div>
                <p class="text-xs text-muted-foreground">开启上下文时携带最近 N 条消息</p>
              </div>
              <div class="w-28 shrink-0">
                <Select :model-value="contextMessagesCount"
                  @update:modelValue="$emit('update:contextMessagesCount', Number($event))">
                  <SelectTrigger>
                    <SelectValue placeholder="数量" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="count in contextMessageCountOptions" :key="count" :value="count">
                      {{ count }} 条
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-sm font-medium">减弱视觉效果</div>
                <p class="text-xs text-muted-foreground">关闭毛玻璃效果以提升性能</p>
              </div>
              <Switch :model-value="reduceVisualEffects"
                @update:modelValue="$emit('update:reduceVisualEffects', !!$event)" />
            </div>

            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-sm font-medium">监听剪贴板</div>
                <p class="text-xs text-muted-foreground">窗口聚焦时自动读取剪贴板内容</p>
              </div>
              <Switch :model-value="autoPasteGlobalAssistant"
                @update:modelValue="$emit('update:autoPasteGlobalAssistant', !!$event)" />
            </div>
          </section>
        </div>
      </ScrollArea>

      <div class="mt-4 flex justify-end">
        <Button variant="outline" @click="$emit('openFullSettings')">打开设置中心</Button>
      </div>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { SUPPORTED_LANGUAGES } from '@/shared/config'

const sessionCountOptions = [10, 25, 50] as const
const contextMessageCountOptions = [2, 6, 10] as const

const props = defineProps<{
  open: boolean
  targetLang: string
  maxSessionsCount: number
  contextMessagesCount: number
  reduceVisualEffects: boolean
  autoPasteGlobalAssistant: boolean
  bgClass: string
  blurClass: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update:targetLang', value: string): void
  (e: 'update:maxSessionsCount', value: number): void
  (e: 'update:contextMessagesCount', value: number): void
  (e: 'update:reduceVisualEffects', value: boolean): void
  (e: 'update:autoPasteGlobalAssistant', value: boolean): void
  (e: 'openFullSettings'): void
}>()

const innerOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})
</script>
