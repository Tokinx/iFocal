# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

iFocal 是一款面向 Chrome/Edge 的 AI 助手浏览器扩展（Manifest V3），采用 Vue 3 + shadcn-vue 架构。核心功能包括：

- **划词翻译**: 选中文本后自动显示翻译圆点触发器
- **悬浮翻译**: 通过快捷键（默认 Alt）触发悬浮窗翻译
- **全局助手窗口**: 独立的 AI 对话窗口，支持多轮会话、历史记录、思考模式
- **多 AI 渠道支持**: OpenAI、Gemini 及兼容接口，可配置多个渠道和模型
- **流式响应**: 支持流式（streaming）和非流式两种响应模式
- **思考模式**: 支持 AI 推理过程可视化（Reasoning）

**技术栈**: Vue 3 (Composition API) + TypeScript + Vite + shadcn-vue + Tailwind CSS

## 常用命令

```bash
# 开发环境（Vite 热更新）
npm run dev

# 构建生产版本（输出到 dist/）
npm run build

# 预览构建结果
npm run preview

# 添加 shadcn-vue 组件
npm run ui:add [组件名]
npm run ui:add:base  # 添加基础组件集
npm run ui:add:more  # 添加扩展组件集

# 编码规范检查（文件编码）
npm run check:encoding
npm run fix:encoding
```

**扩展加载**: 构建后在 `chrome://extensions` 开启开发者模式，加载 `dist/` 目录。修改后需重新加载 Service Worker 和内容脚本。

**注意**: 项目当前没有测试套件。如需添加测试，建议使用 Vitest（与 Vite 配套）。

## 核心架构

### 多入口构建（Vite）

项目使用 Vite 多入口构建，配置在 vite.config.ts:17-22：

- **options**: 设置页面（`options.html` → Vue 应用，src/options/App.vue）
- **window**: 全局助手窗口（`window.html` → Vue 应用，src/window/App.vue）
- **background**: Service Worker（`src/background/index.ts`，MV3 后台脚本）
- **content**: 内容脚本（`src/content/index.ts`，注入网页的脚本）

构建输出目录为 `dist/`，其中：
- background.js / content.js: 直接输出到 dist/ 根目录
- 其他资源（CSS、chunks）: 输出到 dist/assets/

### 目录结构与职责

```
src/
├── background/       # Service Worker（MV3）- AI 调用中控、窗口管理、流式响应
├── content/          # 内容脚本 - 划词/悬浮翻译 UI、Shadow DOM 隔离
├── window/           # 全局助手窗口 - 独立弹窗应用（Vue 3）
│   ├── App.vue       # 主应用（对话界面、思考模式、历史记录）
│   ├── main.ts       # 入口文件
│   └── components/   # 窗口专用组件（ModelSelect、LanguageSelect、ChatInput、HistoryDrawer）
├── options/          # 设置页面 - 渠道/模型/样式配置（Vue 3）
│   ├── App.vue       # 设置主界面（多 tab 导航）
│   ├── main.ts       # 入口文件
│   └── composables/  # 可组合逻辑（useChannels、useTemplates、useToast）
├── sidebar/          # 共享 UI 注册（plugins/ui.ts）与主题样式
├── shared/           # 跨模块共享代码
│   ├── config.ts     # 全局配置（语言、任务、默认值、存储读写、样式预设）
│   ├── app-config.ts # 应用级常量（限流默认值、不支持 system 角色的模型列表）
│   ├── ai.ts         # Prompt 构造工具（makePrompt/makeMessage）
│   ├── types.ts      # TypeScript 类型定义
│   ├── icons.ts      # Iconify 图标映射
│   └── tx-dom.ts     # 译文 DOM 操作工具（换行/样式逻辑）
└── components/ui/    # shadcn-vue 通用组件库（Button、Input、Dialog、Select 等）
```

### 关键交互流程

#### 1. 划词/悬浮翻译（内容脚本）

- **触发方式**:
  - 划词翻译: 用户选中文本后自动显示小圆点，点击后触发翻译（可通过 `enableSelectionTranslation` 配置开关）
  - 悬浮翻译: 按住 `actionKey`（默认 Alt）触发悬浮窗翻译
- **UI 隔离**: 使用 Shadow DOM（`ensureUiRoot`）防止页面样式污染，悬浮窗支持拖拽、模型/语言切换
- **译文展示模式**（`displayMode` 配置）:
  - `overlay`: 悬浮窗展示，不修改页面 DOM
  - `insert`: 直接在原文后插入译文，使用 `sharedCreateWrapper` 创建 `<font>` 包裹元素（content/index.ts:58-107）
- **样式预设系统**:
  - 通过 `targetStylePresets` 配置样式（如点状下划线、高亮背景）
  - CSS 动态注入到页面（`ensureTargetStylePresets` 函数）
  - 支持内联（`ifocal-target-inline-wrapper`）与块级（`ifocal-target-block-wrapper`）两种包裹模式
- **DOM 操作逻辑**:
  - 使用 `needsLineBreak` 判断是否需要换行（基于标签类型：p/div/section/article/li 等）
  - `shouldInsertBreakFromSource` 根据原文空格数量判断是否插入 `<br>` 元素

#### 2. AI 调用架构（后台 Service Worker）

- **消息处理**:
  - 非流式: `chrome.runtime.onMessage` 监听 `performAiAction` 消息（background/index.ts:67-78）
  - 流式: `chrome.runtime.onConnect` 监听 Port 连接（background/index.ts:81-110）
- **统一调用入口**: `invokeModel` 函数根据渠道类型分发到 `callOpenAI` 或 `callGemini`
- **限流机制**:
  - `SimpleRateLimiter` 类实现令牌桶算法（background/index.ts:225-288）
  - 支持 QPS/QPM/并发数三维控制
  - 配置从 `chrome.storage.sync` 读取（txQps/txQpm/txMaxConcurrent）
  - 默认限流: 2 QPS, 120 QPM, 1 并发（app-config.ts:2）
- **退避策略**（`withBackoff` 函数，background/index.ts:195-219）:
  - 429 错误: 触发 15s 退避 + 自动降级（QPS 减半，并发降为 1），30s 后恢复
  - 5xx/超时: 2s 退避后重试一次
  - 最多重试 1 次
- **模型选择优先级**（`pickModelFromConfig` 函数，background/index.ts:341-349）:
  1. 请求指定的 `channel:model`
  2. 任务专用模型（如 `translateModel`）
  3. `defaultModel` → `activeModel` → 首个可用模型
- **Prompt 构造**:
  - 使用 `makePrompt` 函数（shared/ai.ts:3-13）替换模板占位符
  - 使用 `makeMessage` 函数（shared/ai.ts:15-26）构造消息数组
  - 支持上下文（context）参数传递历史对话

#### 3. 配置存储体系（Chrome Storage）

- **全局配置**（`chrome.storage.sync`）:
  - `src/shared/config.ts` 定义 `DEFAULT_CONFIG` 与 `CONFIG_KEYS`
  - 包含语言、任务、快捷键、样式预设、会话管理、思考模式等
  - 提供 `loadConfig`/`saveConfig`/`resetConfig` 三个存储 API
- **渠道管理**:
  - 存储在 `channels` 数组，每项包含 `{ name, type, apiUrl, apiKey, models[] }`
  - 支持 OpenAI、Gemini、兼容接口（compatible）三种类型
- **模型配置**:
  - `defaultModel`: 默认模型（格式 `channel:model`）
  - `translateModel`: 翻译专用模型
  - `activeModel`: 当前激活模型（全局助手窗口使用）
- **Prompt 模板**:
  - 存储在 `promptTemplates` 对象，包含 translate/chat/summarize 三种任务模板
  - 初始化逻辑在 `options/composables/useTemplates.ts`
- **实时同步**:
  - 使用 `chrome.storage.onChanged` 监听配置变更
  - 内容脚本自动更新样式/快捷键
  - 后台脚本自动更新限流配置

#### 4. 全局助手窗口（window/App.vue）

- **窗口管理**:
  - 单例模式: 通过 `chrome.storage.local` 存储 `globalAssistantWindowId`
  - `openOrFocusGlobalWindow` 函数（background/index.ts）确保同时只有一个窗口实例
  - 快捷键: Ctrl+Shift+O（可在 manifest.json:30-36 配置）
- **核心功能**:
  - 多轮对话: 支持上下文（enableContext 配置，最多保存 contextMessagesCount 条消息）
  - 历史记录: 通过 HistoryDrawer 组件管理会话（最大数量 maxSessionsCount，默认 50）
  - 流式响应: 通过 Port 长连接接收 chunk（enableStreaming 配置）
  - 思考模式: 支持 AI 推理过程可视化（enableReasoning 配置）
- **思考模式实现**:
  - 解析 `<thinking>...</thinking>` 和 `<answer>...</answer>` 标签
  - 思考过程可折叠/展开，显示耗时统计
  - 骨架屏/思考动画提升用户体验
- **消息重试**: 点击重试按钮可重新发送用户消息
- **剪切板自动粘贴**: 支持 `autoPasteGlobalAssistant` 配置（需 `clipboardRead` 权限）

#### 5. 设置页面（options/App.vue）

- **多 Tab 导航**:
  - 通用设置: 语言、任务、快捷键、显示模式、会话管理、思考模式等
  - 渠道管理: 添加/编辑/测试/删除 AI 渠道
  - Prompt 模板: 自定义 translate/chat/summarize 三种任务模板
  - 样式预设: 选择/编辑译文样式，实时预览
- **渠道测试**: 每个渠道支持"测试"按钮，发送样本请求验证连通性（handleTestChannel 函数）
- **Composables 架构**:
  - `useChannels`: 渠道管理逻辑（增删改查、测试）
  - `useTemplates`: Prompt 模板管理
  - `useToast`: Toast 通知组件

### 技术栈特性

- **Vue 3 Composition API**: 所有组件使用 `<script setup>`，状态管理通过 Composables（见 `options/composables/`）
- **shadcn-vue**: UI 组件基于 Reka UI（原 Radix Vue），支持通过 `npm run ui:add` 按需添加
- **Tailwind CSS**:
  - 设计系统配置在 `tailwind.config.cjs`
  - 使用 `@tailwindcss/typography` 渲染 Markdown
  - 使用 `tailwindcss-animate` 提供动画效果
- **Markdown 渲染**: 使用 `marked` 库（v16.3.0）
- **图标系统**:
  - `@iconify/vue`: 按需加载图标
  - `@radix-icons/vue`: Radix 图标集
  - `lucide-vue-next`: Lucide 图标集
  - 映射逻辑在 `shared/icons.ts`
- **VueUse**: `@vueuse/core` 提供常用组合式函数
- **类型安全**: TypeScript 5.5+ 全面覆盖，配置在 `tsconfig.json` 和 `tsconfig.base.json`

## 开发注意事项

### 编辑内容脚本时的特殊要求

- **避免 ESM import**:
  - 内容脚本（`src/content/index.ts`）不使用顶层 `import` 语句
  - 原因: 避免在某些网页环境（如使用 AMD/RequireJS 的页面）报错
  - 见文件头注释（content/index.ts:1）
- **DOM 操作工具**:
  - 复制共享的 DOM 工具函数到内容脚本内部（如 `needsLineBreak`、`sharedCreateWrapper`）
  - 不引用 `tx-dom.ts`，避免打包问题
- **全局样式注入**:
  - `DOC_STYLE` 常量定义页面级样式（content/index.ts:3-13）
  - 包含动画关键帧（`ifocal-spin`、`ifocal-shimmer`）
  - 包含骨架屏样式（`ifocal-skeleton-line`、`ifocal-skeleton-inline`）

### 样式预设系统

- **预设定义**（config.ts:56-79）:
  - `targetStylePresets` 数组存储所有样式预设
  - 每项包含 `{ name, description, css }` 三个字段
  - 默认预设: 点状下划线（`ifocal-target-style-dotted`）、高亮背景（`ifocal-target-style-highlight`）
- **CSS 命名规范**:
  - 必须包含 `.ifocal-target-style-*` 类名
  - 支持两种包裹模式:
    - 内联: `.ifocal-target-inline-wrapper.ifocal-target-style-* .ifocal-target-inner`
    - 块级: `.ifocal-target-block-wrapper.ifocal-target-style-* .ifocal-target-inner`
- **实时预览**:
  - 设置页: `ensurePreviewStyle` 动态注入 `<style>` 标签（options/App.vue:39-46）
  - 内容脚本: `ensureTargetStylePresets` 同步样式到页面
- **应用逻辑**:
  - 通过 `wrapperStyleName` 配置选择当前样式
  - 译文包裹元素（`<font>`）添加对应类名
  - 支持自定义 CSS（在设置页直接编辑）

### Prompt 模板占位符

在设置页的 Prompt 模板中支持以下占位符（shared/ai.ts:3-13）：
- `{{targetLang}}`: 目标语言（如 `zh-CN`）
- `{{text}}`: 待处理文本

**默认模板**:
- translate: `Translate the following content to {{targetLang}}. Return the translation only.\n\n{{text}}`
- chat: `Reply in {{targetLang}}:\n\n{{text}}`
- summarize: `Summarize the following content in {{targetLang}} with concise bullet points.\n\n{{text}}`

构造逻辑见 `makePrompt` 函数（shared/ai.ts:3-13）。

### 窗口管理单例模式

全局助手窗口通过 `chrome.storage.local` 存储 `globalAssistantWindowId`，确保同时只有一个实例。

**实现逻辑**（background/index.ts）:
- **重入保护**: `isOpeningGlobalWindow` 标志防止重复创建
- **窗口关闭监听**: `chrome.windows.onRemoved` 监听窗口关闭事件，自动清理存储的 ID
- **打开流程** (`openOrFocusGlobalWindow` 函数):
  1. 尝试聚焦已存储的窗口 ID
  2. 查询所有匹配 URL 的标签页，关闭重复页面
  3. 计算居中位置（基于最后聚焦的浏览器窗口）
  4. 创建新窗口并存储 ID
- **触发方式**:
  - 点击扩展图标（`chrome.action.onClicked`）
  - 快捷键 Ctrl+Shift+O（`chrome.commands.onCommand`）

### 流式与非流式响应

项目同时支持流式（streaming）和非流式两种响应模式：

**非流式模式**:
- 通过 `chrome.runtime.sendMessage` 一次性返回完整结果
- 适用于划词翻译、悬浮翻译等场景
- 处理函数: `handleLegacyAction`（background/index.ts:116-134）

**流式模式**:
- 通过 `chrome.runtime.onConnect` 建立 Port 长连接
- 使用 `port.postMessage` 发送 chunk（background/index.ts:100-102）
- 事件类型: `start` / `chunk` / `done` / `error`
- 适用于全局助手窗口的对话场景
- 前端通过 `enableStreaming` 配置开关控制

**流式解析**:
- 使用 `eventsource-parser` 库（v3.0.6）解析 SSE 流
- 支持 OpenAI 和 Gemini 两种流式格式

## 文件路径约定

- **别名配置**: `@` 指向 `src/` 目录（vite.config.ts:10）
- **扩展资源**: 通过 `chrome.runtime.getURL()` 获取
- **Manifest**: 根目录的 `manifest.json` 在构建时复制到 `dist/`（manifest.json:11 指定 Service Worker 路径为 `dist/background.js`）
- **构建输出**:
  - `dist/options.html` / `dist/window.html`: HTML 入口
  - `dist/background.js` / `dist/content.js`: 脚本入口
  - `dist/assets/`: CSS、chunks 等资源

## 调试技巧

- **Service Worker 日志**:
  - 在 `chrome://extensions` 点击扩展的"Service Worker"链接查看控制台
  - 可查看 AI 调用日志、限流状态、错误信息
- **内容脚本调试**:
  - 在网页上右键 → 检查，控制台会显示 `[iFocal]` 前缀的日志
  - Shadow DOM 元素需在 Elements 面板中展开 `#shadow-root` 查看
- **渠道测试**:
  - 设置页的每个渠道支持"测试"按钮
  - 会发送样本请求验证连通性（handleTestChannel 函数，background/index.ts:136-147）
  - 测试 Prompt: `Connection test. Respond with OK.`
- **样式预览**:
  - 设置页底部实时预览当前选择的译文样式
  - 修改 CSS 后立即生效（通过 `ensurePreviewStyle` 动态注入）
- **配置查看**:
  - 在控制台执行 `chrome.storage.sync.get(null, console.log)` 查看所有配置
  - 使用 `chrome.storage.local.get(null, console.log)` 查看本地存储（如窗口 ID、会话历史）
- **热更新限制**:
  - 修改后台脚本（background/index.ts）需要在 `chrome://extensions` 点击"重新加载"
  - 修改内容脚本（content/index.ts）需要刷新目标网页
  - 修改 Vue 组件（options/window）可以使用 Vite 热更新（npm run dev）

## 重要配置说明

### 支持的语言列表（config.ts:4-12）

- 中文（zh-CN）、英语（en）、日语（ja）、韩语（ko）
- 法语（fr）、西班牙语（es）、德语（de）

### 支持的任务类型（config.ts:15-19）

- `translate`: 翻译任务
- `chat`: 聊天任务
- `summarize`: 总结任务

### 配置存储键（CONFIG_KEYS）

完整列表见 config.ts:83-98：
- 基础配置: `translateTargetLang`、`defaultTask`、`displayMode`
- 功能开关: `enableSelectionTranslation`、`enableContext`、`enableStreaming`、`enableReasoning`
- 快捷键: `actionKey`
- 会话管理: `maxSessionsCount`、`contextMessagesCount`
- 性能优化: `reduceVisualEffects`（关闭 backdrop-blur）
- 样式预设: `wrapperStyleName`、`targetStylePresets`

### 不支持 system 角色的模型（app-config.ts:5-10）

以下模型将 system 消息合并到 user 消息中：
- `translate`、`translate-*`
- `gemma-*`
- `qwen-mt-*`

## 性能优化建议

- **减弱视觉效果**: 启用 `reduceVisualEffects` 配置可关闭 `backdrop-blur`，提升低端设备性能
- **限流配置**: 根据 API 限制调整 `txQps`/`txQpm`/`txMaxConcurrent`，避免触发 429 错误
- **会话管理**: 合理设置 `maxSessionsCount`（默认 10），避免存储空间占用过大
- **上下文控制**: `contextMessagesCount` 默认 1 条，过多会增加 token 消耗
- **流式响应**: 长对话建议启用 `enableStreaming`，提升用户体验

## 扩展权限说明（manifest.json:6-9）

- `storage`: 配置存储（sync）和本地数据（local）
- `clipboardRead`: 全局助手窗口自动粘贴功能（需 `autoPasteGlobalAssistant` 配置）
- `<all_urls>`: 内容脚本需要在所有网页上运行

## Git 工作流

### 分支策略
- **main**: 主分支，保持稳定可发布状态
- 功能开发建议创建 feature 分支，完成后合并到 main

### 提交规范
项目使用语义化提交信息（参考最近的提交历史）：
- `feat(scope)`: 新功能（如 `feat(background): 添加模型思考参数支持`）
- `fix(scope)`: Bug 修复（如 `fix(security): 强化用户输入XSS防护`）
- `refactor(scope)`: 代码重构（如 `refactor(ui): 提取组件优化主应用结构`）
- `docs(scope)`: 文档更新（如 `docs(readme): 更新 README`）
- `style(scope)`: 代码格式调整（不影响功能）
- `perf(scope)`: 性能优化
- `test(scope)`: 测试相关

**scope 常用值**: background, content, window, options, ui, security, readme

### 常见 Git 操作
```bash
# 查看当前状态
git status

# 暂存修改
git add .

# 提交（遵循提交规范）
git commit -m "feat(window): 添加新功能"

# 推送到远程
git push origin main

# 创建功能分支
git checkout -b feature/your-feature-name
```

## MCP 集成说明

项目已安装 `@modelcontextprotocol/sdk` (v1.20.2)，为未来的 MCP (Model Context Protocol) 集成做准备。

**计划用途**（v0.4.0）:
- 通过 MCP 协议连接本地或远程 AI 服务
- 支持更灵活的模型上下文管理
- 可能用于扩展 AI 能力（如工具调用、函数调用等）

**当前状态**: SDK 已安装但尚未在代码中使用。如需实现 MCP 集成，建议：
1. 在 [background/index.ts](src/background/index.ts) 中引入 MCP 客户端
2. 扩展 [shared/types.ts](src/shared/types.ts) 添加 MCP 相关类型定义
3. 在设置页面添加 MCP 服务器配置选项
