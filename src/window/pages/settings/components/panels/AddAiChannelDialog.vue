<script setup lang="ts">
import { ref } from 'vue';
import Icon from '@/components/ui/icon/Icon.vue';
import { Dialog, DialogScrollContent } from '@/components/ui/dialog';
import { useSettingsStore } from '@/window/pages/settings/composables/useSettingsStore';
import { useToast } from '@/window/composables/useToast';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const store = useSettingsStore();
const { addForm } = store;
const toast = useToast();
const fetchingAddFormModels = ref(false);

async function fetchAddFormModels() {
  const type = addForm.type;
  const url = (addForm.apiUrl || '').trim() || (type === 'openai' ? 'https://api.openai.com/v1' : type === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : '');
  const apiKey = addForm.apiKey || '';
  if (!url) { toast.error('获取失败：API URL 未配置'); return; }
  if (!apiKey) { toast.error('获取失败：API KEY 未配置'); return; }

  fetchingAddFormModels.value = true;
  try {
    let models: string[] = [];
    if (type === 'openai' || type === 'openai-compatible') {
      const response = await fetch(`${url}/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      models = (data.data || []).map((m: any) => m.id).filter(Boolean);
    } else if (type === 'gemini') {
      const response = await fetch(`${url}/models?key=${apiKey}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      models = (data.models || []).map((m: any) => {
        const name = m.name || '';
        return name.startsWith('models/') ? name.substring(7) : name;
      }).filter(Boolean);
    }
    if (!models.length) throw new Error('未获取到模型列表');
    addForm.modelsText = models.join('\n');
    toast.success(`成功获取 ${models.length} 个模型`);
  } catch (error: any) {
    toast.error(`获取失败：${error?.message || '未知错误'}`);
  } finally {
    fetchingAddFormModels.value = false;
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogScrollContent class="max-h-[80vh] max-w-[800px]">
      <div class="space-y-4">
        <div class="flex items-center h-10 text-base font-semibold">添加渠道</div>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">类型</label>
              <p class="text-xs text-muted-foreground">渠道提供方</p>
            </div>
            <div class="w-64">
              <Select v-model="addForm.type">
                <SelectTrigger class="w-full rounded-xl">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="openai-compatible">OpenAI 兼容</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">名称</label>
              <p class="text-xs text-muted-foreground">用于区分不同渠道</p>
            </div>
            <div class="w-64">
              <Input v-model="addForm.name" placeholder="如 my-openai" class="rounded-xl" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">API URL</label>
              <p class="text-xs text-muted-foreground">可留空以使用默认地址</p>
            </div>
            <div class="w-[32rem]">
              <Input v-model="addForm.apiUrl" placeholder="留空使用默认" class="rounded-xl" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">API KEY</label>
              <p class="text-xs text-muted-foreground">可留空</p>
            </div>
            <div class="w-[32rem]">
              <Input v-model="addForm.apiKey" placeholder="可留空" class="rounded-xl" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">兼容模式</label>
              <p class="text-xs text-muted-foreground">开启后将 SystemPrompt 与 UserPrompt 合并，以 User 角色发送</p>
            </div>
            <div>
              <Switch v-model="addForm.systemPromptCompatMode" />
            </div>
          </div>
        </div>
        <div class="flex items-start justify-between gap-4">
          <div>
            <label class="text-sm font-medium leading-none block mb-1">Models</label>
            <p class="text-xs text-muted-foreground">每行一个，支持 id#name 格式自定义显示名称</p>
          </div>
          <div class="w-[32rem] space-y-2 shrink-0">
            <Textarea v-model="addForm.modelsText" class="h-40 rounded-xl"
              placeholder="gpt-4o&#10;gpt-4o-mini#GPT-4o Mini" />
            <Button variant="outline" size="sm" class="flex items-center gap-1 rounded-xl"
              @click="fetchAddFormModels" :disabled="fetchingAddFormModels">
              <Icon v-if="!fetchingAddFormModels" icon="lucide:download" width="14" />
              <Icon v-else icon="line-md:loading-twotone-loop" width="14" class="animate-spin" />
              {{ fetchingAddFormModels ? '获取中...' : '获取模型列表' }}
            </Button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-full"></div>
          <Button class="bg-primary text-primary-foreground rounded-xl" @click="emit('confirm')">添加</Button>
          <Button variant="outline" class="rounded-xl" @click="emit('cancel')">取消</Button>
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
