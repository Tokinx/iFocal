<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogScrollContent class="max-h-[88vh] max-w-[760px]">
      <div class="space-y-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <DialogTitle class="text-base font-semibold">{{ assistant ? '编辑助手' : '添加助手' }}</DialogTitle>
            <DialogDescription class="mt-1 text-xs text-muted-foreground">
              配置助手名称、模型和提示词。
            </DialogDescription>
          </div>
        </div>

        <div class="grid grid-cols-2 items-center gap-4">
          <div class="space-y-1">
            <Label class="text-sm font-medium">助手名称</Label>
            <div class="flex items-center gap-2">
              <DropdownMenu v-model:open="iconPickerOpen">
                <DropdownMenuTrigger as-child>
                  <Button variant="outline" class="h-9 w-9 shrink-0 px-0" :title="currentIconTitle">
                    <Icon :icon="draft.icon" class="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="p-2 grid grid-cols-4 gap-2 w-42 min-w-none">
                  <Button v-for="iconOption in ASSISTANT_ICON_OPTIONS" :key="iconOption.value" variant="outline"
                    class="h-8 w-8 p-0"
                    :class="draft.icon === iconOption.value ? '!bg-amber-800/90 !text-olive-100 border-amber-800/90' : ''"
                    :title="iconOption.label" @click="updateIcon(iconOption.value)">
                    <Icon :icon="iconOption.value" class="h-4 w-4" />
                  </Button>
                </DropdownMenuContent>
              </DropdownMenu>
              <Input v-model="draft.name" placeholder="例如：论文润色助手" />
            </div>
          </div>
          <div class="space-y-1">
            <Label class="text-sm font-medium">默认模型</Label>
            <ModelSelect :current-model-name="currentModelName" :grouped-models="groupedModels"
              :selected-pair-key="draft.modelKey" @selectModel="updateModelKey"
              buttonClass="w-full h-9 justify-between" />
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-end justify-between gap-4">
            <div>
              <Label class="text-sm font-medium">提示词</Label>
              <p class="text-xs text-muted-foreground">
                可使用 <code v-pre>{{targetLang}}</code>、<code v-pre>{{prevLang}}</code>、<code v-pre>{{text}}</code>。
              </p>
            </div>
            <span class="text-xs text-muted-foreground">{{ draft.prompt.length }} 字</span>
          </div>
          <Textarea v-model="draft.prompt" class="resize-none h-40" placeholder="输入助手提示词" />
          <div class="flex">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" size="sm" class="gap-1">
                  <Icon icon="ri:sparkling-2-line" class="h-4 w-4" />
                  预设提示词
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-52">
                <DropdownMenuItem v-for="preset in ASSISTANT_PRESET_OPTIONS" :key="preset.value" class="cursor-pointer"
                  @click="applyPresetPrompt(preset.value)">
                  <Icon :icon="preset.icon" class="mr-2 h-4 w-4" />
                  <span>{{ preset.label }}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <DialogFooter class="items-center justify-between gap-2">
          <Button v-if="assistant?.deletable" variant="destructive" class="mr-auto"
            @click="emit('delete', assistant.id)">
            <Icon icon="ri:delete-bin-line" class="h-4 w-4" />
            删除助手
          </Button>
          <Button variant="outline" @click="emit('update:open', false)">取消</Button>
          <Button class="bg-primary text-primary-foreground" @click="submit">保存</Button>
        </DialogFooter>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Icon from '@/components/ui/icon/Icon.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ModelSelect from './ModelSelect.vue';
import {
  ASSISTANT_ICON_OPTIONS,
  ASSISTANT_PRESET_OPTIONS,
  assistantIconForPreset,
  defaultAssistantNameForPreset,
  defaultPromptForPreset,
  defaultSettingsForPreset,
  type AssistantConfig,
  type AssistantPreset,
} from '@/shared/assistants';

const props = defineProps<{
  open: boolean
  assistant: AssistantConfig | null
  modelPairs: Array<{ key: string; channel: string; model: string }>
}>();

const emit = defineEmits<{
  (e: 'update:open', open: boolean): void
  (e: 'save', assistant: AssistantConfig): void
  (e: 'delete', assistantId: string): void
}>();

const error = ref('');
const iconPickerOpen = ref(false);
const draft = reactive<AssistantConfig>({
  id: '',
  name: '',
  icon: 'ri:chat-ai-line',
  preset: 'chat',
  prompt: '',
  modelKey: '',
  settings: defaultSettingsForPreset('chat'),
  deletable: true,
  createdAt: 0,
  updatedAt: 0,
});

const groupedModels = computed<Record<string, Array<{ key: string; model: string; channel: string }>>>(() => {
  const groups: Record<string, Array<{ key: string; model: string; channel: string }>> = {};
  for (const pair of props.modelPairs) {
    if (!groups[pair.channel]) groups[pair.channel] = [];
    groups[pair.channel].push(pair);
  }
  return groups;
});

const currentModelName = computed(() => {
  return props.modelPairs.find((item) => item.key === draft.modelKey)?.model || '';
});

const currentIconTitle = computed(() => {
  return ASSISTANT_ICON_OPTIONS.find((item) => item.value === draft.icon)?.label || '助手图标';
});

watch(
  () => [props.open, props.assistant, props.modelPairs] as const,
  () => resetDraft(),
  { immediate: true }
);

function resetDraft() {
  error.value = '';
  const source = props.assistant;
  const preset = source?.preset || 'chat';
  draft.id = source?.id || '';
  draft.name = source?.name || defaultAssistantNameForPreset(preset);
  draft.icon = source?.icon || assistantIconForPreset(preset);
  draft.preset = preset;
  draft.prompt = source?.prompt || defaultPromptForPreset(preset);
  draft.modelKey = source?.modelKey || props.modelPairs[0]?.key || '';
  draft.settings = { ...(source?.settings || defaultSettingsForPreset(preset)) };
  draft.deletable = source?.deletable ?? true;
  draft.createdAt = source?.createdAt || 0;
  draft.updatedAt = source?.updatedAt || 0;
}

function applyPresetPrompt(preset: AssistantPreset) {
  const shouldRename = !props.assistant && (!draft.name || ASSISTANT_PRESET_OPTIONS.some((item) => draft.name === defaultAssistantNameForPreset(item.value)));
  const prevDefaultIcon = assistantIconForPreset(draft.preset);
  draft.preset = preset;
  draft.prompt = defaultPromptForPreset(preset);
  draft.settings = { ...defaultSettingsForPreset(preset) };
  if (!draft.icon || draft.icon === prevDefaultIcon) draft.icon = assistantIconForPreset(preset);
  if (shouldRename) draft.name = defaultAssistantNameForPreset(preset);
}

function updateModelKey(value: unknown) {
  draft.modelKey = String(value || '').trim();
}

function updateIcon(value: unknown) {
  draft.icon = String(value || '').trim();
  iconPickerOpen.value = false;
}

function submit() {
  const name = draft.name.trim();
  const prompt = draft.prompt.trim();
  if (!name) {
    error.value = '请填写助手名称';
    return;
  }
  if (!prompt) {
    error.value = '请填写提示词';
    return;
  }
  emit('save', {
    ...draft,
    name,
    prompt,
    settings: { ...draft.settings },
  });
}
</script>
