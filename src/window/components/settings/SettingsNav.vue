<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue';
import { iconOfNav } from '@/shared/icons';

export type SettingsNavId = 'channels' | 'machine' | 'mcp' | 'settings' | 'debug' | 'about';

defineProps<{
  modelValue: SettingsNavId;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: SettingsNavId): void;
}>();

const navItems: Array<{ id: SettingsNavId; label: string }> = [
  { id: 'settings', label: '通用设置' },
  { id: 'machine', label: '机器翻译' },
  { id: 'channels', label: '渠道管理' },
  { id: 'mcp', label: 'MCP功能' },
  { id: 'debug', label: '其它设置' },
  { id: 'about', label: '关于插件' },
];
</script>

<template>
  <aside class="w-30 shrink-0 border-r pr-2">
    <div class="flex h-full min-h-0 flex-col gap-4">
      <nav class="space-y-1" :class="embedded ? 'pt-0' : 'pt-12'">
        <Button v-for="item in navItems" :key="item.id" variant="ghost"
          class="w-full rounded-lg justify-start gap-2 text-olive-500 hover:bg-olive-100 hover:text-amber-800/80"
          :class="modelValue === item.id ? 'bg-olive-100 !text-amber-800' : ''"
          @click="emit('update:modelValue', item.id)">
          <Icon :icon="iconOfNav(item.id)" width="16" class="opacity-80" />
          <span>{{ item.label }}</span>
        </Button>
      </nav>
    </div>
  </aside>
</template>
