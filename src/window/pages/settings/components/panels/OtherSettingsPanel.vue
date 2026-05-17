<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue';
import { iconOfAction } from '@/shared/icons';
import { SUPPORTED_LANGUAGES, saveConfig } from '@/shared/config';
import ModelSelect from '@/window/components/ModelSelect.vue';
import { useSettingsStore } from '@/window/pages/settings/composables/useSettingsStore';
import { useAssistantDebug } from '@/window/pages/settings/composables/useAssistantDebug';
import { useGlossary } from '@/window/pages/settings/composables/useGlossary';

const store = useSettingsStore();
const { config, assistantConfigs } = store;
const {
  assistantDraft,
  assistantModelValue,
  assistantTask,
  assistantResult,
  assistantLoading,
  debugGroupedModels,
  debugCurrentModelName,
  handleDebugModelSelect,
  startAssistantStream,
  restreamIfDraft,
} = useAssistantDebug(store);

const {
  glossaryAllText,
  saveGlossary,
} = useGlossary();

async function onLangChange() {
  try {
    await saveConfig({ translateTargetLang: config.value.translateTargetLang });
  } catch { }
  restreamIfDraft();
}
</script>

<template>
  <div class="space-y-4">
    <section :id="'opt-debug'" class="space-y-4">
      <header class="flex items-center h-10 text-base font-semibold">其它设置</header>
      <div class="space-y-3">
        <div class="flex flex-wrap gap-3">
          <div class="w-56 space-y-1">
            <Label class="block">模型</Label>
            <ModelSelect :current-model-name="debugCurrentModelName" :grouped-models="debugGroupedModels"
              :selected-pair-key="assistantModelValue" buttonClass="w-full h-9 justify-between"
              @selectModel="handleDebugModelSelect" />
          </div>
          <div class="w-40 space-y-1">
            <Label class="block">任务</Label>
            <Select v-model="assistantTask">
              <SelectTrigger class="w-full rounded-xl">
                <SelectValue placeholder="助手" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="assistant in assistantConfigs" :key="assistant.id" :value="assistant.id">
                  {{ assistant.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="w-36 space-y-1">
            <Label class="block">语言</Label>
            <Select v-model="config.translateTargetLang" @update:modelValue="onLangChange">
              <SelectTrigger class="w-full rounded-xl">
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
        <div class="flex space-x-3">
          <Textarea v-model="assistantDraft" class="min-h-28 w-[50%] rounded-xl" placeholder="在此粘贴需要处理的文本..." />
          <div class="w-[50%] border bg-secondary/40 p-3 text-sm whitespace-pre-wrap min-h-12 relative rounded-xl">
            <div v-if="assistantLoading && !assistantResult"
              class="absolute inset-0 flex items-center justify-center bg-white/60">
              <Icon icon="line-md:loading-twotone-loop" width="20" class="animate-spin" />
            </div>
            <div v-else-if="assistantLoading" class="absolute right-2 top-2 text-muted-foreground">
              <Icon icon="line-md:loading-twotone-loop" width="16" class="animate-spin" />
            </div>
            <div class="pr-6">{{ assistantResult }}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button class="bg-primary text-primary-foreground flex items-center gap-1 rounded-xl"
            :disabled="assistantLoading" @click="startAssistantStream">
            <Icon v-if="!assistantLoading" icon="proicons:bolt" width="16" />
            <Icon v-else icon="line-md:loading-twotone-loop" width="16" class="animate-spin" />
            执行
          </Button>
        </div>
      </div>
    </section>

    <section :id="'opt-glossary'" class="space-y-4">
      <header class="flex items-center h-10 text-base font-semibold">术语库</header>
      <div class="space-y-3 text-sm">
        <p class="text-xs text-muted-foreground">支持混合输入：不译词（单行）与术语映射（key=value）。可用 # 开头写注释。</p>
        <Textarea v-model="glossaryAllText" class="min-h-40 rounded-xl"
          placeholder="# 不译词&#10;GPU&#10;iPhone&#10;# 术语映射&#10;Sign in=登录&#10;Settings=设置" />
        <div>
          <Button class="bg-primary text-primary-foreground flex items-center gap-1 rounded-xl"
            @click="saveGlossary">
            <Icon :icon="iconOfAction('save')" width="16" /> 保存术语库
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>
