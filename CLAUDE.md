# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

iFocal 是一个 Chrome/Edge Manifest V3 浏览器扩展，核心是“网页内翻译 + 独立 AI 助手窗口”双形态交互。

技术栈：Vue 3 + TypeScript + Vite + shadcn-vue + Tailwind CSS。

当前代码主要围绕三个核心运行面展开：
- `src/content/index.ts`：内容脚本，负责划词翻译、悬浮翻译、Shadow DOM UI、页面内插入译文
- `src/background/index.ts`：MV3 Service Worker，负责模型调用、流式传输、限流/退避、全局窗口单例管理
- `src/window/`：全局助手窗口，负责多轮对话、历史记录、流式输出、思考模式、文件附件以及完整设置中心；所有设置 UI 都集中在这里。

共享逻辑集中在 `src/shared/`，尤其是：
- `config.ts`：默认配置、任务设置、Chrome storage 读写与兼容迁移
- `ai.ts`：Prompt 片段与消息构造
- `mcp.ts`：MCP Server 默认配置、名称与传输类型归一化
- `model-utils.ts`：模型 ID / 展示名解析约定
- `app-config.ts`：限流默认值、system role 兼容规则
- 其他文件按职责拆分：`assistants.ts`（助手定义）、`machine-translation.ts`（机器翻译渠道）、`style-presets.ts`（译文样式预设）、`prompt-templates.ts`、`settings-import-export.ts`、`glossary.ts`、`tx-dom.ts`、`types.ts`、`icons.ts`

辅助目录：
- `src/sidebar/`：shadcn-vue 组件全局注册与共享样式（`plugins/ui.ts`、`styles.css`），被窗口页复用，并非独立的 sidebar 页面。
- `src/lib/utils.ts`：shadcn 标配的 `cn` 工具，不要在新代码里另写一份。

## 常用命令

```bash
npm install
npm run dev
npm run build
npm run build:watch
npm run preview
npm run check:encoding
npm run fix:encoding
npm run ui:add <component>
npm run ui:add:base
npm run ui:add:more
```

补充说明：
- Node 版本要求：`^20.19.0` 或 `>=22.12.0`（Vite 8 / `@vitejs/plugin-vue` 限制）。
- 项目当前没有 lint 脚本。
- 项目当前没有测试脚本，也没有单测框架配置；因此不存在“运行单个测试”的命令。
- 构建产物输出到 `dist/`，但 `manifest.json` 位于项目根目录。**在 `chrome://extensions` 中加载扩展时选择项目根目录，不是 `dist/`**。
- 修改 background / content 后必须重新构建并在扩展页重新加载；`npm run build:watch` 比 `npm run dev` 更适合扩展调试，因为 `dev` 不会重建 background/content。

## 构建与入口结构

Vite 当前使用三个构建入口，定义在 `vite.config.ts`：
- `window.html` → 全局助手窗口
- `src/background/index.ts` → background service worker
- `src/content/index.ts` → content script

构建后端是 rolldown，`vite.config.ts` 中使用的是 `rolldownOptions` 而非 `rollupOptions`；改构建配置时不要照搬 Rollup 文档。

`manifest.json` 直接引用构建后的 `dist/background.js` 和 `dist/content.js`。这意味着：
- `npm run dev` 主要帮助 Vue 页面开发
- background/content 的改动仍然依赖浏览器扩展重新加载机制

## 高层架构

### 1. AI 请求统一经过 background

无论请求来自内容脚本、设置页还是全局助手窗口，实际模型调用都收敛到 `src/background/index.ts`。

background 负责：
- 根据任务和配置挑选模型
- 按渠道类型分发到 OpenAI / Gemini / OpenAI-compatible 适配层
- 按助手级 MCP 开关注入 OpenAI-compatible `tools`，并执行单轮 MCP `tool_calls`
- 应用限流、并发控制和退避重试
- 统一处理流式与非流式响应

模型选择优先级是：
1. 请求中显式指定的 `channel + model`
2. 任务相关模型配置
3. `defaultModel` / `activeModel`
4. 渠道中的首个可用模型

### 2. 两条消息链路并存

- 非流式链路：`chrome.runtime.sendMessage({ action: 'performAiAction', ... })`
  - 主要用于内容脚本翻译，也用于助手窗口设置中心中的部分诊断/测试逻辑
- 流式链路：`chrome.runtime.connect({ name: 'streaming' })`
  - 主要用于全局助手窗口的实时输出

修改 AI 请求结构时，通常需要同时检查：
- `src/background/index.ts`
- `src/window/App.vue`
- `src/window/components/WindowSettingsCenter.vue`
- `src/content/index.ts`

### 3. 配置与运行态分层存储

- `chrome.storage.sync`：用户配置
  - 渠道、模型、任务设置、Prompt 模板、样式预设、快捷键等都在这里
- `chrome.storage.local`：本地运行态
  - 全局助手窗口 ID、会话历史等本地状态在这里

这套分层影响很大：
- 改设置结构时，要先检查 `src/shared/config.ts` 的默认值、读取逻辑和迁移逻辑
- 改窗口管理时，要同步检查 background 与 window 侧对 local storage 的使用

### 4. 内容脚本与设置中心共享“样式预设”协议

译文样式预设由 `wrapperStyleName` 和 `targetStylePresets` 驱动：
- 助手窗口中的设置中心负责编辑和保存
- 内容脚本负责把 CSS 注入页面并应用到插入译文节点

预设 CSS 必须遵守 `.ifocal-target-style-*` 命名，并同时考虑：
- `.ifocal-target-inline-wrapper`
- `.ifocal-target-block-wrapper`

如果只改一侧，另一侧通常会出现“预览正常、网页注入异常”或反过来的问题。

### 5. 模型字符串不是单纯的 modelId

模型列表支持 `modelId#displayName` 形式，解析逻辑在 `src/shared/model-utils.ts`。

约定如下：
- `modelId` 用于真实请求
- `displayName` 用于 UI 展示
- 选中的模型通常以 `{ channel, model }` 形式持久化，其中 `model` 保存的是 `modelId`

不要轻易改模型字符串格式或 pair 序列化方式；设置页和窗口页存在历史兼容逻辑，随意调整容易造成模型丢失或无法回显。

### 6. 全文翻译走机器翻译路径，与划词 / 悬浮翻译不同

全文翻译由右键菜单或 `Ctrl+Shift+Y` 快捷键触发，由内容脚本按可视区域和队列分批调用机器翻译渠道（Microsoft / Google / Azure / DeepL / DeepLX / 百度等），不走 AI 模型流式链路。

划词翻译、悬浮翻译可以配置 AI 翻译或机器翻译；只有全文翻译是机器翻译专属路径。修改“翻译”相关代码时要先确认目标场景是哪一条路径，不要把全文翻译的批处理逻辑套到划词上，反之亦然。

## 关键实现约束

### 内容脚本禁止使用顶层 import

`src/content/index.ts` 顶部已经明确说明：这里故意不使用 import，以避免某些网页环境中的 ESM/注入兼容问题。

因此：
- 不要把内容脚本中的 DOM 工具函数随手抽回 `src/shared/`
- 如果修改内容脚本，优先保持它的“自包含”结构

这是本仓库最重要的硬约束之一。

### 修改 background / content 后不要只依赖 Vite 热更新

调试时通常需要：
- 改 `src/background/index.ts` 后去 `chrome://extensions` 重新加载扩展
- 改 `src/content/index.ts` 后重新加载扩展，并刷新目标网页
- 改 `src/window/` 时可优先使用 `npm run dev`

### system prompt 兼容是跨文件行为

并不是所有模型都支持独立的 system role。

相关逻辑分散在：
- `src/shared/app-config.ts`
- `src/shared/ai.ts`
- `src/background/index.ts`
- 渠道配置中的 `systemPromptCompatMode`

如果修改消息构造、system prompt、渠道协议适配，必须连带检查这几处，否则很容易在兼容模型上出现 silent failure。

### 渠道数据当前保存在 chrome.storage.sync

渠道配置包含 API Key，当前由设置页直接写入 `chrome.storage.sync`。

这不是文档建议，而是当前实现事实。涉及渠道结构、迁移、安全策略或存储位置的修改时，要同时检查：
- `src/window/composables/useChannels.ts`
- `src/window/composables/useSettingsStore.ts`
- `src/background/index.ts`
- `src/shared/config.ts`

## 调试入口

最常用的调试位置：
- `chrome://extensions` → 重新加载扩展
- `chrome://extensions` → 打开 Service Worker 控制台，看 background 日志
- 目标网页 DevTools → 看内容脚本与 Shadow DOM 注入效果

manifest 提供两个内置快捷键，调试功能时一般直接使用：
- `Ctrl+Shift+O`：打开全局助手窗口（单例）。
- `Ctrl+Shift+Y`：对当前页触发全文翻译。

如果页面内翻译 UI 有问题，优先检查：
- 内容脚本是否已重新注入
- Shadow DOM 是否创建成功
- 样式预设是否被同步到页面
- background 是否实际拿到了可用模型与渠道配置

## 当前仓库状态中值得记住的事实

- 当前没有测试体系；做改动后最可靠的验证方式是 `npm run build` 加浏览器内手动验证。
- 设置页与全局助手窗口是 Vue 应用；内容脚本和 background 不是。
- 仓库里已经有一套较完整的任务级配置体系（context / streaming / reasoning / file upload / reasoning effort），不要在局部页面重复发明同类配置。
- MCP 目前已有设置入口和按 Server 名称保存的助手级开关，默认 duckduckgo/time 服务在 `src/shared/mcp.ts`；OpenAI-compatible 链路已在 background 注入 `tools` 并执行单轮工具调用，Gemini 链路暂未接入。
- 代码中仍保留少量兼容旧配置/旧格式的逻辑；改配置结构时应优先做兼容迁移，而不是只改单点读写。

## 延伸阅读

仓库内还有更细的开发文档，作为参考使用（部分内容可能滞后于代码，最终以代码为准）：
- [开发指南.md](./开发指南.md)：环境要求、加载步骤、技术栈版本表、权限说明。
- [README.md](./README.md)：能力清单与路线图。
- [.docs/](./.docs/)：早期设计稿（`MCP_INTEGRATION_GUIDE.md`、`MCP_USER_GUIDE.md`、`HISTORY_FEATURE.md`、`UI_REDESIGN.md`、`roadmap_v0.4.md` 等）。
