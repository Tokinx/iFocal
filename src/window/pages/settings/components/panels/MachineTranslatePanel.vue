<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue';
import { iconOfAction } from '@/shared/icons';
import { useSettingsStore } from '@/window/pages/settings/composables/useSettingsStore';
import { useMachineTranslate } from '@/window/pages/settings/composables/useMachineTranslate';

const store = useSettingsStore();
const { machineChannels } = store;
const {
  mtExpanded,
  mtTesting,
  mtShowApiKey,
  mtShowSecretKey,
  showAddMachineChannel,
  mtAddForm,
  mtProviderOptions,
  openAddMachineChannel,
  closeAddMachineChannel,
  handleMachineAddProviderChange,
  handleMachineChannelProviderChange,
  handleAddMachineChannel,
  removeMachineChannel,
  testMachineChannel,
  saveMachineTranslateSettings,
  machineProviderLabel,
  machineProviderDescription,
  machineProviderShowsApiKey,
  machineProviderNeedsApiKey,
  machineProviderNeedsSecretKey,
  machineProviderSupportsRegion,
  machineProviderExperimental,
  machineProviderModeLabel,
  getMachineTranslateProviderMeta,
} = useMachineTranslate(store);
</script>

<template>
  <section :id="'opt-machine'" class="space-y-4">
    <header class="flex items-center h-10 text-base font-semibold">
      <div class="shrink-0">机器翻译</div>
      <div class="w-full"></div>
      <Button size="sm" @click="openAddMachineChannel" class="rounded-xl">
        <Icon icon="proicons:box-add" width="16" />
        添加渠道
      </Button>
    </header>

    <div class="border border-stone-200 bg-stone-100/80 p-3 text-xs text-stone-700 rounded-xl">
      内置 Google 与 Microsoft 翻译为非官方实验接口，免密但可能受网络、限流或上游策略影响，生产稳定性要求高时建议添加官方自备密钥渠道。
    </div>

    <div v-if="showAddMachineChannel" class="border p-4 space-y-3 rounded-2xl">
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">新增机器翻译渠道</label>
          <p class="text-xs text-muted-foreground">官方渠道可先保存空密钥，调用或测试时会提示补齐</p>
        </div>
        <div class="flex items-center gap-2">
          <Button class="bg-primary text-primary-foreground rounded-xl" @click="handleAddMachineChannel">添加</Button>
          <Button variant="outline" @click="closeAddMachineChannel" class="rounded-xl">取消</Button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <Label class="block">类型</Label>
          <Select :model-value="mtAddForm.provider"
            @update:modelValue="handleMachineAddProviderChange(String($event))">
            <SelectTrigger class="w-full rounded-xl">
              <SelectValue placeholder="选择类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="provider in mtProviderOptions" :key="provider.value" :value="provider.value">
                {{ provider.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-1">
          <Label class="block">名称</Label>
          <Input v-model="mtAddForm.name" :placeholder="machineProviderLabel(mtAddForm.provider)" class="rounded-xl" />
        </div>
        <div class="space-y-1">
          <Label class="block">API URL</Label>
          <Input v-model="mtAddForm.apiUrl"
            :placeholder="getMachineTranslateProviderMeta(mtAddForm.provider).defaultApiUrl" class="rounded-xl" />
        </div>
        <div v-if="machineProviderShowsApiKey(mtAddForm.provider)" class="space-y-1">
          <Label class="block">API Key / Token</Label>
          <Input v-model="mtAddForm.apiKey"
            :placeholder="machineProviderNeedsApiKey(mtAddForm.provider) ? '该渠道调用时必填' : '可留空'"
            class="rounded-xl" />
        </div>
        <div v-if="machineProviderNeedsSecretKey(mtAddForm.provider)" class="space-y-1">
          <Label class="block">Secret Key</Label>
          <Input v-model="mtAddForm.secretKey" placeholder="百度等渠道需要" class="rounded-xl" />
        </div>
        <div v-if="machineProviderSupportsRegion(mtAddForm.provider)" class="space-y-1">
          <Label class="block">Region</Label>
          <Input v-model="mtAddForm.region" placeholder="Microsoft 官方渠道可选" class="rounded-xl" />
        </div>
        <div class="grid grid-cols-4 gap-2 col-span-2">
          <div class="space-y-1">
            <Label class="block">QPS</Label>
            <Input v-model="mtAddForm.qps" class="rounded-xl" />
          </div>
          <div class="space-y-1">
            <Label class="block">最大并发</Label>
            <Input v-model="mtAddForm.maxConcurrent" class="rounded-xl" />
          </div>
          <div class="space-y-1">
            <Label class="block">超时(ms)</Label>
            <Input v-model="mtAddForm.timeoutMs" class="rounded-xl" />
          </div>
          <div class="space-y-1">
            <Label class="block">并发段落</Label>
            <Input v-model="mtAddForm.batchSize" class="rounded-xl" />
          </div>
        </div>
      </div>
      <p class="text-xs text-muted-foreground">{{ machineProviderDescription(mtAddForm.provider) }}</p>
    </div>

    <div class="space-y-3">
      <div v-for="(ch, idx) in machineChannels" :key="ch.id" class="border p-4 space-y-3 rounded-2xl">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0 rounded-xl"
              @click="mtExpanded[idx] = !mtExpanded[idx]" :title="mtExpanded[idx] ? '收起' : '展开'">
              <Icon :icon="mtExpanded[idx] ? 'lucide:chevron-down' : 'lucide:chevron-right'" />
            </Button>
            <Switch v-model="ch.enabled" />
            <div class="flex-1 w-0 truncate">
              <div class="font-medium inline-flex items-center gap-2">
                <span>{{ ch.name || machineProviderLabel(ch.provider) }}</span>
                <span v-if="machineProviderModeLabel(ch.provider)"
                  class="px-1.5 py-0.5 text-[11px] text-emerald-600 bg-emerald-100">
                  {{ machineProviderModeLabel(ch.provider) }}
                </span>
                <span v-if="machineProviderExperimental(ch.provider)"
                  class="rounded-md px-1.5 py-0.5 text-[11px] text-stone-600 bg-stone-200">实验</span>
              </div>
              <div class="text-xs text-muted-foreground truncate max-w-[80%]" :title="ch.apiUrl">
                {{ machineProviderLabel(ch.provider) }} · {{ ch.apiUrl }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" class="flex items-center gap-1 rounded-xl"
              :disabled="mtTesting[idx]" @click="testMachineChannel(idx)">
              <Icon v-if="!mtTesting[idx]" icon="proicons:bug" width="14" />
              <Icon v-else icon="line-md:loading-twotone-loop" width="14" class="animate-spin" />
              {{ mtTesting[idx] ? '测试中' : '测试' }}
            </Button>
          </div>
        </div>

        <div v-if="mtExpanded[idx]" class="space-y-3">
          <div v-if="!ch.builtin" class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">类型</label>
              <p class="text-xs text-muted-foreground">{{ machineProviderDescription(ch.provider) }}</p>
            </div>
            <div class="w-100">
              <Select :model-value="ch.provider" :disabled="!!ch.builtin"
                @update:modelValue="handleMachineChannelProviderChange(ch, String($event))">
                <SelectTrigger class="w-full rounded-xl">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="provider in mtProviderOptions" :key="provider.value" :value="provider.value">
                    {{ provider.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">名称</label>
              <p class="text-xs text-muted-foreground">用于区分不同机器翻译渠道</p>
            </div>
            <div class="w-100">
              <Input v-model="ch.name" class="rounded-xl" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">API URL</label>
              <p class="text-xs text-muted-foreground">可使用预设，也可指向自建代理</p>
            </div>
            <div class="w-100">
              <Input v-model="ch.apiUrl"
                :placeholder="getMachineTranslateProviderMeta(ch.provider).defaultApiUrl" class="rounded-xl" />
            </div>
          </div>
          <div v-if="machineProviderShowsApiKey(ch.provider)" class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">API Key / Token</label>
              <p class="text-xs text-muted-foreground">
                {{ machineProviderNeedsApiKey(ch.provider) ? '官方渠道调用时必填' : '可选；免费或 DeepLX 渠道通常可留空' }}
              </p>
            </div>
            <div class="w-100 relative">
              <Input :type="mtShowApiKey[idx] ? 'text' : 'password'" v-model="ch.apiKey" placeholder="可留空"
                class="pr-10 rounded-xl" />
              <Button variant="ghost" size="icon" class="absolute right-1 top-1 h-7 w-7 rounded-xl"
                @click="mtShowApiKey[idx] = !mtShowApiKey[idx]">
                <Icon
                  :icon="mtShowApiKey[idx] ? 'material-symbols:visibility-off-outline' : 'material-symbols:visibility-outline'"
                  width="16" />
              </Button>
            </div>
          </div>
          <div v-if="machineProviderNeedsSecretKey(ch.provider)" class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">Secret Key</label>
              <p class="text-xs text-muted-foreground">百度智能云 OAuth 需要</p>
            </div>
            <div class="w-100 relative">
              <Input :type="mtShowSecretKey[idx] ? 'text' : 'password'" v-model="ch.secretKey"
                placeholder="Secret Key" class="pr-10 rounded-xl" />
              <Button variant="ghost" size="icon" class="absolute right-1 top-1 h-7 w-7 rounded-xl"
                @click="mtShowSecretKey[idx] = !mtShowSecretKey[idx]">
                <Icon
                  :icon="mtShowSecretKey[idx] ? 'material-symbols:visibility-off-outline' : 'material-symbols:visibility-outline'"
                  width="16" />
              </Button>
            </div>
          </div>
          <div v-if="machineProviderSupportsRegion(ch.provider)" class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">Region</label>
              <p class="text-xs text-muted-foreground">Azure Translator 区域资源需要填写</p>
            </div>
            <div class="w-72">
              <Input v-model="ch.region" placeholder="如 eastasia" class="rounded-xl" />
            </div>
          </div>
          <div class="grid grid-cols-4 gap-3">
            <div class="space-y-1">
              <Label class="block">QPS</Label>
              <Input v-model="ch.qps" class="rounded-xl" />
            </div>
            <div class="space-y-1">
              <Label class="block">最大并发</Label>
              <Input v-model="ch.maxConcurrent" class="rounded-xl" />
            </div>
            <div class="space-y-1">
              <Label class="block">超时(ms)</Label>
              <Input v-model="ch.timeoutMs" class="rounded-xl" />
            </div>
            <div class="space-y-1">
              <Label class="block">并发段落</Label>
              <Input v-model="ch.batchSize" class="rounded-xl" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" class="flex items-center gap-1 text-red-600 rounded-xl"
              :disabled="!!ch.builtin" @click="removeMachineChannel(idx)">
              <Icon :icon="iconOfAction('delete')" width="16" /> 删除
            </Button>
            <div class="w-full"></div>
            <Button class="bg-primary text-primary-foreground flex items-center gap-1 rounded-xl"
              @click="saveMachineTranslateSettings()">
              <Icon :icon="iconOfAction('save')" width="16" /> 保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
