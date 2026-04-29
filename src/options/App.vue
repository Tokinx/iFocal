<template>
  <div class="min-h-screen bg-background text-foreground">
    <main class="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <div class="w-full border bg-card p-8 shadow-sm">
        <div class="space-y-3">
          <h1 class="text-2xl font-semibold">设置已迁移到助手窗口</h1>
          <p class="text-sm text-muted-foreground">
            iFocal 的完整设置中心现在统一放在助手窗口中，包括通用设置、渠道管理、术语库、Prompt 模板、样式预设和导入导出。
          </p>
          <p class="text-sm text-muted-foreground">
            点击下方按钮会打开助手窗口，并直接进入设置中心。
          </p>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <Button class="bg-primary text-primary-foreground" :disabled="opening" @click="openSettingsCenter">
            <Icon v-if="!opening" icon="ri:settings-4-line" class="mr-2 h-4 w-4" />
            <Icon v-else icon="line-md:loading-twotone-loop" class="mr-2 h-4 w-4 animate-spin" />
            {{ opening ? '打开中...' : '打开助手窗口设置中心' }}
          </Button>
          <span class="text-xs text-muted-foreground">旧设置页后续会移除，请改用助手窗口完成配置。</span>
        </div>

        <p v-if="errorMessage" class="mt-4 text-sm text-red-600">{{ errorMessage }}</p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '@/components/ui/button'

const opening = ref(false)
const errorMessage = ref('')

async function openSettingsCenter() {
  if (opening.value) return
  opening.value = true
  errorMessage.value = ''
  try {
    const response = await chrome.runtime.sendMessage({ action: 'openSettingsCenter' })
    if (!response?.ok) {
      throw new Error(String(response?.error || '打开失败'))
    }
  } catch (error: any) {
    errorMessage.value = String(error?.message || error || '打开失败')
  } finally {
    opening.value = false
  }
}
</script>
