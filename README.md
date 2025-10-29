# iFocal

<p align="center">
  <strong>现代化 AI 助手浏览器扩展</strong>
</p>

<p align="center">
  基于 Vue 3 + shadcn-vue 的 Chrome/Edge 扩展，提供智能翻译与 AI 对话功能
</p>

---

iFocal 是一款面向 Chrome/Edge 的 AI 助手浏览器扩展（Manifest V3），采用 **Vue 3 + TypeScript + shadcn-vue** 架构。提供划词翻译、悬浮翻译、全局助手窗口等核心功能，支持多 AI 渠道（OpenAI/Gemini/兼容接口）与可配置 Prompt 模板。

## 核心功能

### 智能翻译
- **划词翻译**：选中文本后自动显示翻译圆点触发器，点击即可翻译
- **悬浮翻译**：按住快捷键（默认 Alt）触发悬浮窗翻译，支持拖拽和模型切换
- **样式自定义**：支持多种译文样式（点状下划线、高亮背景等），可自定义 CSS
- **智能排版**：自动识别块级/内联元素，智能添加换行和空格
- **全文翻译**（v0.4.0 计划）：支持网页全文翻译，可选机器翻译或 AI 翻译

### 全局助手窗口
- **多轮对话**：支持上下文连续对话（可配置历史消息数量）
- **历史记录**：自动保存会话历史，支持快速切换和管理（最多 50 个会话）
- **思考模式**：可视化 AI 推理过程，展示思考耗时和思考内容
- **流式响应**：支持实时显示 AI 回复内容，提升交互体验
- **剪切板集成**：支持自动粘贴剪切板内容到输入框

### 多渠道支持
- **AI 模型**：
  - OpenAI（GPT-3.5/GPT-4 等）
  - Google Gemini（Gemini Pro 系列）
  - 兼容接口（符合 OpenAI API 格式的自建服务）
- **机器翻译**（v0.4.0 计划）：
  - 微软翻译（Microsoft Translator）
  - Google 翻译（Google Translate）
  - DeepL 翻译
  - 高并发、速度快，适合网页全文翻译
- **渠道测试**：内置连通性测试功能，快速验证配置
- **智能限流**：支持 QPS/QPM/并发数三维控制，自动退避和降级

### 现代化设计
- **shadcn-vue**：基于 Reka UI 的高质量组件库
- **Tailwind CSS**：响应式设计，支持暗色模式
- **流畅动画**：骨架屏、思考动画等，提升用户体验
- **性能优化**：支持减弱视觉效果选项，适配低端设备

## 项目结构

```
iFocal/
├── manifest.json            # Chrome 扩展清单文件（Manifest V3）
├── package.json             # 项目依赖与脚本配置
├── vite.config.ts           # Vite 多入口构建配置
├── tailwind.config.cjs      # Tailwind + shadcn 设计系统
├── tsconfig.json            # TypeScript 配置
├── options.html             # 设置页入口
├── window.html              # 全局助手窗口入口
└── src/
    ├── background/          # Service Worker（MV3 后台脚本）
    │   └── index.ts         # AI 调用中控、窗口管理、流式响应
    ├── content/             # 内容脚本（注入网页）
    │   └── index.ts         # 划词/悬浮翻译 UI、Shadow DOM 隔离
    ├── window/              # 全局助手窗口（Vue 3）
    │   ├── App.vue          # 对话界面、思考模式、历史记录
    │   ├── main.ts          # 入口文件
    │   └── components/      # 窗口专用组件
    ├── options/             # 设置页面（Vue 3）
    │   ├── App.vue          # 设置主界面（多 tab 导航）
    │   ├── main.ts          # 入口文件
    │   └── composables/     # 可组合逻辑（useChannels、useTemplates）
    ├── sidebar/             # 共享 UI 注册与主题样式
    │   ├── plugins/ui.ts    # 注册通用 UI 组件
    │   └── styles.css       # 主题与工具类样式
    ├── shared/              # 跨模块共享代码
    │   ├── config.ts        # 全局配置（语言、任务、样式预设）
    │   ├── app-config.ts    # 应用级常量（限流默认值）
    │   ├── ai.ts            # Prompt 构造工具
    │   ├── types.ts         # TypeScript 类型定义
    │   ├── icons.ts         # 图标映射
    │   └── tx-dom.ts        # 译文 DOM 操作工具
    └── components/ui/       # shadcn-vue 通用组件库
```

## 快速开始

### 前置要求

- Node.js 16+
- npm 或 pnpm
- Chrome/Edge 浏览器

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/yourusername/iFocal.git
   cd iFocal
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **构建扩展**
   ```bash
   npm run build
   ```
   构建产物位于 `dist/` 目录。

4. **加载到浏览器**
   - 打开 Chrome/Edge，访问 `chrome://extensions`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目的 `dist/` 目录
   - 扩展安装完成！

### 基本使用

#### 1️⃣ 配置 AI 渠道

首次使用需要配置 AI 渠道：

1. 右键点击扩展图标 → 选项
2. 进入"渠道管理"标签
3. 点击"添加渠道"，填写信息：
   - **类型**：选择 OpenAI / Google Gemini / OpenAI 兼容
   - **名称**：自定义渠道名称（如 "My GPT-4"）
   - **API URL**：API 端点地址（可选，使用默认地址）
   - **API Key**：你的 API 密钥
   - **Models**：支持的模型列表（每行一个，如 `gpt-4`）
4. 点击"测试"按钮验证连通性
5. 保存配置

#### 2️⃣ 使用翻译功能

**划词翻译**：
- 在任何网页选中文本
- 自动显示翻译圆点
- 点击圆点查看翻译结果

**悬浮翻译**：
- 选中文本后按住 `Alt` 键（可在设置中修改）
- 弹出悬浮窗显示翻译
- 支持拖拽和切换模型

#### 3️⃣ 使用全局助手

- 点击扩展图标或按 `Ctrl+Shift+O`
- 在输入框输入问题或文本
- 选择任务类型（翻译/聊天/总结）
- 点击发送或按 `Ctrl+Enter`
- 查看历史记录：点击左上角菜单图标

## 配置说明

### 通用设置

在设置页面可以配置以下选项：

#### 语言与任务
- **目标语言**：翻译的默认目标语言（中文、英语、日语等）
- **默认任务**：全局助手的默认任务类型（翻译/聊天/总结）

#### 显示与交互
- **显示模式**：
  - `overlay`：悬浮窗显示译文
  - `insert`：在原文后插入译文
- **快捷键**：触发悬浮翻译的按键（默认 Alt）
- **划词翻译开关**：是否启用选中文本后的翻译圆点

#### 会话管理
- **启用上下文**：是否在对话中保留历史消息
- **上下文消息数量**：保留的历史消息条数（默认 5）
- **最大会话数量**：历史记录保存的最大会话数（默认 50）
- **启用流式响应**：是否实时显示 AI 回复（推荐开启）

#### 思考模式
- **启用思考模式**：开启后可查看 AI 的推理过程
- 支持展开/折叠思考内容
- 显示思考耗时统计

#### 性能优化
- **减弱视觉效果**：关闭 backdrop-blur 等效果，适配低端设备
- **限流配置**：调整 QPS/QPM/并发数，避免触发 API 限流

### 样式预设

自定义译文显示样式：

1. 进入"样式预设"标签
2. 选择预设样式或创建自定义样式
3. 编辑 CSS 代码（支持实时预览）
4. 保存应用

**CSS 命名规范**：
```css
/* 内联样式 */
.ifocal-target-inline-wrapper.your-style-name .ifocal-target-inner {
  /* 自定义样式 */
}

/* 块级样式 */
.ifocal-target-block-wrapper.your-style-name .ifocal-target-inner {
  /* 自定义样式 */
}
```

### Prompt 模板

自定义 AI 任务提示词：

**支持的占位符**：
- `{{targetLang}}`：目标语言（如 zh-CN）
- `{{text}}`：待处理的文本内容

**默认模板示例**：
```
翻译任务：
Translate the following content to {{targetLang}}. Return the translation only.

{{text}}

聊天任务：
Reply in {{targetLang}}:

{{text}}

总结任务：
Summarize the following content in {{targetLang}} with concise bullet points.

{{text}}
```

## 开发指南

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器（支持热更新）
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview

# 编码规范检查
npm run check:encoding
npm run fix:encoding
```

### 添加 UI 组件

项目使用 shadcn-vue 组件库，支持按需添加：

```bash
# 添加单个组件
npm run ui:add button

# 添加基础组件集
npm run ui:add:base
# 包含：button, input, label, textarea, select, dialog,
#       dropdown-menu, popover, scroll-area, command, checkbox

# 添加扩展组件集
npm run ui:add:more
# 包含：tooltip, badge, tabs, separator, avatar, breadcrumb,
#       card, progress, skeleton, switch, toggle
```

### 开发技巧

#### 1. 热更新限制
- **Vue 组件**（options/window）：支持 Vite 热更新（`npm run dev`）
- **后台脚本**（background/index.ts）：需要在 `chrome://extensions` 重新加载扩展
- **内容脚本**（content/index.ts）：需要刷新目标网页

#### 2. 调试方法
- **Service Worker 日志**：在 `chrome://extensions` 点击"Service Worker"查看控制台
- **内容脚本调试**：在网页 F12 控制台查看 `[iFocal]` 前缀日志
- **Shadow DOM 调试**：在 Elements 面板展开 `#shadow-root` 节点
- **配置查看**：
  ```javascript
  // 查看所有配置
  chrome.storage.sync.get(null, console.log)

  // 查看本地存储（会话历史、窗口 ID）
  chrome.storage.local.get(null, console.log)
  ```

#### 3. 内容脚本特殊要求
- **避免 ESM import**：内容脚本不使用顶层 `import`，避免在某些网页环境报错
- **DOM 工具复制**：将共享 DOM 工具函数复制到内容脚本内部，不引用 `tx-dom.ts`
- **样式隔离**：使用 Shadow DOM 防止页面样式污染

#### 4. 代码规范
- 所有 Vue 组件使用 `<script setup>` 语法
- 使用 TypeScript 进行类型检查
- 遵循 Tailwind CSS 命名规范
- 使用 Composables 管理可复用逻辑

### 项目架构说明

详细的架构文档请参考 [CLAUDE.md](./CLAUDE.md)，包含：
- 多入口构建配置
- 核心交互流程（划词翻译、AI 调用、配置存储）
- 技术栈特性
- 开发注意事项
- 性能优化建议

## 技术栈

| 分类 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **前端框架** | Vue 3 | ^3.4.27 | Composition API + `<script setup>` |
| **类型支持** | TypeScript | ^5.5.4 | 全面类型覆盖 |
| **构建工具** | Vite | ^5.4.0 | 多入口构建 + 热更新 |
| **UI 组件** | shadcn-vue | ^2.2.0 | 基于 Reka UI |
| | Reka UI | ^2.6.0 | 高质量 Vue 组件 |
| **样式框架** | Tailwind CSS | ^3.4.9 | 原子化 CSS |
| | @tailwindcss/typography | ^0.5.19 | Markdown 排版 |
| | tailwindcss-animate | ^1.0.7 | 动画支持 |
| **图标库** | @iconify/vue | ^4.1.1 | 按需加载图标 |
| | @radix-icons/vue | ^1.0.0 | Radix 图标集 |
| | lucide-vue-next | ^0.445.0 | Lucide 图标集 |
| **工具库** | @vueuse/core | ^14.0.0 | Vue 组合式函数 |
| | marked | ^16.3.0 | Markdown 渲染 |
| | eventsource-parser | ^3.0.6 | SSE 流式解析 |
| **扩展 API** | @types/chrome | ^0.0.258 | Chrome 扩展类型定义 |

## 兼容性

- **浏览器**：Chrome/Edge 114+
- **Manifest**：Manifest V3
- **权限**：
  - `storage`：配置存储（sync + local）
  - `clipboardRead`：自动粘贴剪切板内容
  - `<all_urls>`：在所有网页注入内容脚本

## 功能特性对比

| 功能 | iFocal | 传统翻译扩展 |
|------|--------|--------------|
| 划词翻译 | ✅ | ✅ |
| 悬浮翻译 | ✅ | ❌ |
| 网页全文翻译 | 🚧 v0.4.0 计划 | ✅ |
| 机器翻译（速度快） | 🚧 v0.4.0 计划 | ✅ |
| AI 翻译（质量高） | ✅ | ❌ |
| 全局助手窗口 | ✅ | ❌ |
| 多轮对话 | ✅ | ❌ |
| 思考模式可视化 | ✅ | ❌ |
| 流式响应 | ✅ | ❌ |
| 自定义样式 | ✅ | 部分 |
| 多 AI 渠道 | ✅ | ❌ |
| Prompt 模板 | ✅ | ❌ |
| 智能限流 | ✅ | ❌ |
| Shadow DOM 隔离 | ✅ | 部分 |

**iFocal 定位**：结合传统机器翻译的速度优势和 AI 翻译的质量优势，提供灵活的翻译解决方案。
- **机器翻译**：适合网页全文翻译、大量文本快速翻译
- **AI 翻译**：适合专业术语、上下文理解、高质量翻译需求

## 路线图

### v0.4.0（计划中）
- [ ] **机器翻译集成**：接入微软翻译、Google 翻译、DeepL 翻译等服务
  - 支持网页全文翻译功能
  - 高并发、速度快，适合批量翻译场景
  - 与 AI 翻译形成互补（机器翻译速度快，AI 翻译质量高）
- [ ] MCP (Model Context Protocol) 集成
- [ ] 更多 AI 模型支持（Claude、通义千问等）
- [ ] 离线翻译缓存
- [ ] 翻译历史记录

### v0.5.0（计划中）
- [ ] API Key 本地加密存储
- [ ] 团队协作功能（共享配置）
- [ ] 自定义快捷键
- [ ] 更多语言支持
- [ ] 性能监控面板

## 安全性说明

- **API Key 存储**：使用 Chrome Storage Sync，加密存储在浏览器本地
- **数据隐私**：所有 AI 请求直接发送到配置的 API 端点，不经过第三方服务器
- **权限最小化**：仅申请必要的浏览器权限
- **Shadow DOM**：使用 Shadow DOM 隔离内容脚本，防止样式污染和 XSS 攻击

## 许可证

本项目采用 [Apache License 2.0](LICENSE) 开源协议。

## 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 贡献方式

1. **报告 Bug**：在 [GitHub Issues](../../issues) 提交问题
2. **功能建议**：在 Issues 中描述你的想法
3. **提交代码**：
   - Fork 本仓库
   - 创建功能分支（`git checkout -b feature/AmazingFeature`）
   - 提交更改（`git commit -m 'Add some AmazingFeature'`）
   - 推送到分支（`git push origin feature/AmazingFeature`）
   - 提交 Pull Request

### 代码规范

- 遵循 TypeScript 和 Vue 3 最佳实践
- 使用有意义的提交信息
- 添加必要的注释和文档
- 确保代码通过 `npm run build` 构建

## 常见问题

### 1. 扩展无法加载？
- 确保开启了"开发者模式"
- 检查是否选择了正确的 `dist/` 目录
- 查看控制台是否有错误信息

### 2. 翻译功能不工作？
- 检查是否已配置 AI 渠道
- 验证 API Key 是否正确
- 点击"测试"按钮检查连通性
- 查看 Service Worker 控制台的错误日志

### 3. 如何更换 API 端点？
- 在设置页面编辑渠道的 API URL
- OpenAI 兼容接口只需修改 baseURL 即可

### 4. 流式响应不生效？
- 在通用设置中开启"启用流式响应"
- 确保 AI 模型支持流式输出
- 检查网络是否稳定

### 5. 思考模式如何使用？
- 在通用设置中开启"启用思考模式"
- AI 回复会包含 `<thinking>` 和 `<answer>` 标签
- 点击思考按钮可展开/折叠推理过程

## 联系方式

- **GitHub Issues**：[提交问题](../../issues)
- **Pull Requests**：[贡献代码](../../pulls)
- **讨论区**：[参与讨论](../../discussions)

## 鸣谢

感谢以下开源项目：

- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [shadcn-vue](https://www.shadcn-vue.com/) - 高质量 Vue 组件库
- [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS 框架
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
- [Iconify](https://iconify.design/) - 统一的图标框架

---

<p align="center">Made with ❤️ by iFocal Team</p>

<p align="center">
  <a href="../../stargazers">Star</a> •
  <a href="../../issues">Report Bug</a> •
  <a href="../../issues">Request Feature</a>
</p>
