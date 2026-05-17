<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue';
import { iconOfAction } from '@/shared/icons';
import { useSettingsStore } from '@/window/pages/settings/composables/useSettingsStore';
import { useChannelExtras } from '@/window/pages/settings/composables/useChannelExtras';

const store = useSettingsStore();
const { channels, addForm, testModel, modelOptionsOf } = store;
const {
  showApiKeyByIndex,
  modelsTextByIndex,
  channelExpanded,
  draggedIndex,
  dragOverIndex,
  isDraggable,
  fetchingModels,
  fetchingAddFormModels,
  showAddChannel,
  editStatus,
  openAddChannel,
  closeAddChannel,
  handleAddChannelDialog,
  handleSaveChannelInline,
  handleTestChannel,
  confirmRemoveChannel,
  enableDrag,
  disableDrag,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  handleDragLeave,
  fetchModels,
  fetchAddFormModels,
} = useChannelExtras(store);
</script>

<template>
  <section :id="'opt-channels'" class="space-y-4">
    <header class="flex items-center h-10 text-base font-semibold">
      <div class="shrink-0">渠道管理</div>
      <div class="w-full"></div>
      <Button size="sm" @click="openAddChannel" class="rounded-xl" :disabled="showAddChannel">
        <Icon icon="proicons:box-add" width="16" />
        添加渠道
      </Button>
    </header>

    <div v-if="showAddChannel" class="border p-4 space-y-3 rounded-2xl">
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">新增 AI 渠道</label>
          <p class="text-xs text-muted-foreground">填写后点击添加即可保存</p>
        </div>
        <div class="flex items-center gap-2">
          <Button class="bg-primary text-primary-foreground rounded-xl" @click="handleAddChannelDialog">添加</Button>
          <Button variant="outline" @click="closeAddChannel" class="rounded-xl">取消</Button>
        </div>
      </div>
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
      </div>
    </div>

    <div v-if="!channels.length && !showAddChannel" class="text-sm text-muted-foreground">暂无渠道，请先添加。</div>
    <div v-else-if="channels.length" class="space-y-3">
      <div v-for="(ch, idx) in channels" :key="idx" class="border p-4 space-y-3 transition-all rounded-2xl"
        :class="{ 'opacity-50': draggedIndex === idx, 'border-primary border-2': dragOverIndex === idx }"
        :draggable="isDraggable[idx]" @dragstart="handleDragStart(idx)" @dragover="handleDragOver($event, idx)"
        @dragend="handleDragEnd" @dragleave="handleDragLeave">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm flex items-center gap-2 flex-1">
            <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0 rounded-xl"
              @mousedown="enableDrag(idx)" @mouseup="disableDrag(idx)" @mouseleave="disableDrag(idx)"
              @click="channelExpanded[idx] = !channelExpanded[idx]"
              :title="channelExpanded[idx] ? '收起' : '展开'">
              <Icon :icon="channelExpanded[idx] ? 'lucide:chevron-down' : 'lucide:chevron-right'" />
            </Button>
            <div class="flex-1 w-0">
              <div class="font-medium inline-flex items-center gap-2">
                {{ ch.name || '未命名' }}
              </div>
              <div class="text-muted-foreground truncate" :title="ch.apiUrl">{{ ch.type }} · {{ ch.apiUrl }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 w-64">
            <div class="flex-1 w-0">
              <Select v-model="testModel[idx]">
                <SelectTrigger class="w-full rounded-xl">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in modelOptionsOf(ch.models || [])" :key="m.modelId" :value="m.modelId">{{
                    m.displayName }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" class="flex items-center gap-1 shrink-0 rounded-xl"
              @click="handleTestChannel(idx)" title="测试">
              <Icon icon="proicons:bug" width="16" />
            </Button>
          </div>
        </div>

        <div v-if="channelExpanded[idx]" class="space-y-3">
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">类型</label>
              <p class="text-xs text-muted-foreground">渠道提供方</p>
            </div>
            <div class="w-64">
              <Select v-model="ch.type">
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
              <Input v-model="ch.name" placeholder="如 my-openai" class="rounded-xl" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">API URL</label>
              <p class="text-xs text-muted-foreground">可留空以使用默认地址</p>
            </div>
            <div class="w-[32rem]">
              <Input v-model="ch.apiUrl" placeholder="留空使用默认" class="rounded-xl" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">API KEY</label>
              <p class="text-xs text-muted-foreground">为空表示不修改现有密钥</p>
            </div>
            <div class="w-[32rem] relative">
              <Input :type="showApiKeyByIndex[idx] ? 'text' : 'password'" v-model="ch.apiKey"
                placeholder="留空表示不修改" class="pr-10 rounded-xl" />
              <Button variant="ghost" size="icon" class="absolute right-1 top-1 h-7 w-7 rounded-xl"
                :title="showApiKeyByIndex[idx] ? '隐藏' : '显示'"
                @click="showApiKeyByIndex[idx] = !showApiKeyByIndex[idx]">
                <Icon
                  :icon="showApiKeyByIndex[idx] ? 'material-symbols:visibility-off-outline' : 'material-symbols:visibility-outline'"
                  width="16" />
              </Button>
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">兼容模式</label>
              <p class="text-xs text-muted-foreground">开启后将 SystemPrompt 与 UserPrompt 合并，以 User 角色发送</p>
            </div>
            <div>
              <Switch v-model="ch.systemPromptCompatMode" />
            </div>
          </div>
          <div class="flex items-start justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">Models</label>
              <p class="text-xs text-muted-foreground">每行一个，支持 id#name 格式自定义显示名称</p>
            </div>
            <div class="w-[32rem] space-y-2 shrink-0">
              <Textarea v-model="modelsTextByIndex[idx]" class="h-36 rounded-xl"
                placeholder="gpt-4o&#10;gpt-4o-mini#GPT-4o Mini" />
              <Button variant="outline" size="sm" class="flex items-center gap-1 rounded-xl"
                @click="fetchModels(idx)" :disabled="fetchingModels[idx]">
                <Icon v-if="!fetchingModels[idx]" icon="lucide:download" width="14" />
                <Icon v-else icon="line-md:loading-twotone-loop" width="14" class="animate-spin" />
                {{ fetchingModels[idx] ? '获取中...' : '获取模型列表' }}
              </Button>
            </div>
          </div>
        </div>

        <div v-if="channelExpanded[idx]" class="flex items-center gap-2">
          <Button variant="outline" class="flex items-center gap-1 text-red-600 rounded-xl"
            @click="confirmRemoveChannel(idx)">
            <Icon :icon="iconOfAction('delete')" width="16" /> 删除
          </Button>
          <div class="w-full"></div>
          <Button class="bg-primary text-primary-foreground flex items-center gap-1 rounded-xl"
            @click="handleSaveChannelInline(idx)">
            <Icon :icon="iconOfAction('save')" width="16" /> 保存
          </Button>
          <span class="text-xs text-muted-foreground">{{ editStatus }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
