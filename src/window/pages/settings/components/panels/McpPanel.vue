<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue';
import { iconOfAction } from '@/shared/icons';
import { useSettingsStore } from '@/window/pages/settings/composables/useSettingsStore';
import { useMcpServers } from '@/window/pages/settings/composables/useMcpServers';

const store = useSettingsStore();
const { mcpServers } = store;
const {
  mcpExpanded,
  mcpTesting,
  mcpShowAuthSecret,
  showAddMcpServer,
  mcpAddForm,
  mcpAuthTypeOptions,
  openAddMcpServer,
  closeAddMcpServer,
  handleAddMcpServer,
  removeMcpServer,
  handleTestMcpServer,
  saveMcpSettings,
} = useMcpServers(store);
</script>

<template>
  <section :id="'opt-mcp'" class="space-y-4">
    <header class="flex items-center h-10 text-base font-semibold">
      <div class="shrink-0">MCP 功能</div>
      <div class="w-full"></div>
      <Button size="sm" @click="openAddMcpServer" class="rounded-xl">
        <Icon icon="proicons:box-add" width="16" />
        添加 MCP
      </Button>
    </header>

    <div class="border border-stone-200 bg-stone-100/80 p-3 text-xs text-stone-700 rounded-xl">
      这里管理 MCP Server 名称、类型、地址和鉴权方式；每个助手是否启用某个 MCP 由输入框功能菜单分别控制。
    </div>

    <div v-if="showAddMcpServer" class="border p-4 space-y-3 rounded-2xl">
      <div class="flex items-center justify-between gap-4">
        <div>
          <label class="text-sm font-medium leading-none block mb-1">新增 MCP Server</label>
          <p class="text-xs text-muted-foreground">名称会作为 mcpServers 的 key，需保持唯一</p>
        </div>
        <div class="flex items-center gap-2">
          <Button class="bg-primary text-primary-foreground rounded-xl" @click="handleAddMcpServer">添加</Button>
          <Button variant="outline" class="rounded-xl" @click="closeAddMcpServer">取消</Button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <Label class="block">名称</Label>
          <Input v-model="mcpAddForm.name" placeholder="如 my-search" class="rounded-xl" />
        </div>
        <div class="space-y-1">
          <Label class="block">类型</Label>
          <Select v-model="mcpAddForm.type">
            <SelectTrigger class="w-full rounded-xl">
              <SelectValue placeholder="选择类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sse">SSE</SelectItem>
              <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-1 col-span-2">
          <Label class="block">URL</Label>
          <Input v-model="mcpAddForm.url" placeholder="https://example.com/mcp" class="rounded-xl" />
        </div>
        <div class="space-y-1">
          <Label class="block">鉴权方式</Label>
          <Select v-model="mcpAddForm.authType">
            <SelectTrigger class="w-full rounded-xl">
              <SelectValue placeholder="选择鉴权方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in mcpAuthTypeOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div v-if="mcpAddForm.authType === 'bearer'" class="space-y-1">
          <Label class="block">Bearer Token</Label>
          <Input v-model="mcpAddForm.authToken" type="password" placeholder="输入 Token" class="rounded-xl" />
        </div>
        <div v-if="mcpAddForm.authType === 'basic'" class="space-y-1">
          <Label class="block">用户名</Label>
          <Input v-model="mcpAddForm.username" placeholder="输入用户名" class="rounded-xl" />
        </div>
        <div v-if="mcpAddForm.authType === 'basic'" class="space-y-1">
          <Label class="block">密码</Label>
          <Input v-model="mcpAddForm.password" type="password" placeholder="输入密码" class="rounded-xl" />
        </div>
        <div v-if="mcpAddForm.authType === 'header'" class="space-y-1">
          <Label class="block">Header 名称</Label>
          <Input v-model="mcpAddForm.headerName" placeholder="如 X-API-Key" class="rounded-xl" />
        </div>
        <div v-if="mcpAddForm.authType === 'header'" class="space-y-1">
          <Label class="block">Header 值</Label>
          <Input v-model="mcpAddForm.headerValue" type="password" placeholder="输入 Header 值" class="rounded-xl" />
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <div v-for="(server, idx) in mcpServers" :key="server.name" class="border p-4 space-y-3 rounded-2xl">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0 rounded-xl"
              @click="mcpExpanded[idx] = !mcpExpanded[idx]" :title="mcpExpanded[idx] ? '收起' : '展开'">
              <Icon :icon="mcpExpanded[idx] ? 'lucide:chevron-down' : 'lucide:chevron-right'" />
            </Button>
            <div class="flex-1 w-0 truncate">
              <div class="font-medium inline-flex items-center gap-2">
                <span>{{ server.name }}</span>
              </div>
              <div class="text-xs text-muted-foreground truncate max-w-[80%]" :title="server.url">
                {{ server.type }} · {{ server.url }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" class="flex items-center gap-1 rounded-xl"
              :disabled="!!mcpTesting[idx]" @click.stop="handleTestMcpServer(idx)">
              <Icon :icon="mcpTesting[idx] ? 'ri:loader-4-line' : iconOfAction('test')" width="16"
                :class="mcpTesting[idx] ? 'animate-spin' : ''" />
              {{ mcpTesting[idx] ? '测试中' : '测试' }}
            </Button>
          </div>
        </div>

        <div v-if="mcpExpanded[idx]" class="space-y-3">
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">名称</label>
              <p class="text-xs text-muted-foreground">名称需唯一，会作为助手启用开关的标识</p>
            </div>
            <div class="w-72">
              <Input v-model="server.name" class="rounded-xl" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">类型</label>
              <p class="text-xs text-muted-foreground">支持 SSE 与 Streamable HTTP</p>
            </div>
            <div class="w-72">
              <Select v-model="server.type">
                <SelectTrigger class="w-full rounded-xl">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">URL</label>
              <p class="text-xs text-muted-foreground">远程 MCP Server 地址</p>
            </div>
            <div class="w-[32rem]">
              <Input v-model="server.url" placeholder="https://example.com/mcp" class="rounded-xl" />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">鉴权方式</label>
              <p class="text-xs text-muted-foreground">按 MCP 服务端要求配置请求鉴权</p>
            </div>
            <div class="w-72">
              <Select v-model="server.authType">
                <SelectTrigger class="w-full rounded-xl">
                  <SelectValue placeholder="选择鉴权方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="item in mcpAuthTypeOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div v-if="server.authType === 'bearer'" class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">Bearer Token</label>
              <p class="text-xs text-muted-foreground">会以 Authorization: Bearer 方式发送</p>
            </div>
            <div class="w-[32rem] relative">
              <Input :type="mcpShowAuthSecret[idx] ? 'text' : 'password'" v-model="server.authToken"
                placeholder="输入 Token" class="pr-10 rounded-xl" />
              <Button variant="ghost" size="icon" class="absolute right-1 top-1 h-7 w-7 rounded-xl"
                @click="mcpShowAuthSecret[idx] = !mcpShowAuthSecret[idx]">
                <Icon
                  :icon="mcpShowAuthSecret[idx] ? 'material-symbols:visibility-off-outline' : 'material-symbols:visibility-outline'"
                  width="16" />
              </Button>
            </div>
          </div>
          <div v-if="server.authType === 'basic'" class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">用户名</label>
              <p class="text-xs text-muted-foreground">会与密码一起组成 Basic Authorization</p>
            </div>
            <div class="w-[32rem]">
              <Input v-model="server.username" placeholder="输入用户名" class="rounded-xl" />
            </div>
          </div>
          <div v-if="server.authType === 'basic'" class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">密码</label>
              <p class="text-xs text-muted-foreground">会与用户名一起组成 Basic Authorization</p>
            </div>
            <div class="w-[32rem] relative">
              <Input :type="mcpShowAuthSecret[idx] ? 'text' : 'password'" v-model="server.password"
                placeholder="输入密码" class="pr-10 rounded-xl" />
              <Button variant="ghost" size="icon" class="absolute right-1 top-1 h-7 w-7 rounded-xl"
                @click="mcpShowAuthSecret[idx] = !mcpShowAuthSecret[idx]">
                <Icon
                  :icon="mcpShowAuthSecret[idx] ? 'material-symbols:visibility-off-outline' : 'material-symbols:visibility-outline'"
                  width="16" />
              </Button>
            </div>
          </div>
          <div v-if="server.authType === 'header'" class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">Header 名称</label>
              <p class="text-xs text-muted-foreground">例如 X-API-Key</p>
            </div>
            <div class="w-[32rem]">
              <Input v-model="server.headerName" placeholder="如 X-API-Key" class="rounded-xl" />
            </div>
          </div>
          <div v-if="server.authType === 'header'" class="flex items-center justify-between gap-4">
            <div>
              <label class="text-sm font-medium leading-none block mb-1">Header 值</label>
              <p class="text-xs text-muted-foreground">会按自定义请求头发送</p>
            </div>
            <div class="w-[32rem] relative">
              <Input :type="mcpShowAuthSecret[idx] ? 'text' : 'password'" v-model="server.headerValue"
                placeholder="输入 Header 值" class="pr-10 rounded-xl" />
              <Button variant="ghost" size="icon" class="absolute right-1 top-1 h-7 w-7 rounded-xl"
                @click="mcpShowAuthSecret[idx] = !mcpShowAuthSecret[idx]">
                <Icon
                  :icon="mcpShowAuthSecret[idx] ? 'material-symbols:visibility-off-outline' : 'material-symbols:visibility-outline'"
                  width="16" />
              </Button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" class="flex items-center gap-1 text-red-600 rounded-xl"
              @click="removeMcpServer(idx)">
              <Icon :icon="iconOfAction('delete')" width="16" /> 删除
            </Button>
            <div class="w-full"></div>
            <Button class="bg-primary text-primary-foreground flex items-center gap-1 rounded-xl"
              @click="saveMcpSettings()">
              <Icon :icon="iconOfAction('save')" width="16" /> 保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
