# iFocal

iFocal 是一款面向 Chrome / Edge 的 AI 助手插件，现已重构为 **Vue 3 + shadcn-vue** 架构，采用响应式布局与侧边栏聊天体验。插件可在当前网页内快速执行翻译、总结、改写等任务，并支持读取页面内容做进一步分析。

## 🌟 核心功能

- ⏱️ **侧边栏聊天面板**：点击插件图标立即唤起 Side Panel，消息流布局 + 底部输入框，支持快捷发送。
- 🎛️ **浮动控制区**：输入框上方提供模型、功能、目标语言快速切换，翻译模式自动显示目标语言选择。
- 🌐 **网页内容洞察**：后台可采集当前页面/选中文本，在"网页分析"模式中组合用户问题给出摘要或结论。
- 🔌 **多渠道模型**：沿用原有渠道管理逻辑，可在设置页维护 OpenAI / Gemini / 自建兼容接口，并支持通道连通性测试。
- ♻️ **兼容旧功能**：保留选中文本触发、快捷键打开全局窗口等能力，渐进迁移到全新的前端体系。
- 💬 **会话历史**：支持会话历史记录，可随时切换和恢复之前的对话。
- 🎨 **现代化UI**：基于 shadcn-vue 组件库，提供一致且美观的用户界面。

## 📁 项目结构

```
├─ package.json              工程依赖与脚本（Vite 构建）
├─ public/manifest.json      Vite 构建时复制到 dist 的 Manifest
├─ src/
│  ├─ background/            MV3 Service Worker（TypeScript）
│  ├─ content/               内容脚本（监听划词、响应页面请求）
│  ├─ sidebar/               Vue 3 + shadcn-vue 聊天面板
│  │  ├─ components/ui/      原子级 shadcn 风格组件（Button/Select/Textarea 等）
│  │  ├─ App.vue             侧边栏根组件（会话流、快捷控制区）
│  │  └─ plugins/ui.ts       注册通用 UI 组件
│  ├─ options/               设置页面（Vue 3 + shadcn-vue）
│  ├─ window/                全局助手窗口
│  ├─ shared/                共享配置和类型定义
│  └─ components/ui/         通用 UI 组件库
├─ tailwind.config.cjs       Tailwind + shadcn 设计体系
└─ vite.config.ts            多入口构建（sidebar / background / content）
```

## 🚀 安装与使用

### 安装扩展

1. 克隆项目到本地
   ```bash
   git clone [项目地址]
   cd ifocal-copilot
   ```

2. 安装依赖
   ```bash
   npm install
   ```

3. 构建产物
   ```bash
   npm run build
   ```
   生成的扩展文件位于 `dist/` 目录。

4. 加载扩展
   - 打开 `chrome://extensions`（Edge 同理）并开启"开发者模式"。
   - 选择"加载已解压的扩展程序"，指向 `dist/` 目录。
   - 扩展安装完成后，点击工具栏中的 iFocal 图标即可打开侧边栏。

### 基本使用

1. **侧边栏聊天**：点击扩展图标打开侧边栏，直接输入问题或选择功能进行交互。
2. **文本处理**：选中文本后右键选择"Use iFocal"，或使用快捷键 `Ctrl+Shift+O` 打开全局窗口。
3. **多模型切换**：在设置页面添加不同的 AI 渠道（OpenAI、Gemini 等），并在聊天界面快速切换。
4. **网页分析**：在侧边栏中输入问题，系统会自动结合当前页面内容提供回答。

## ⚙️ 配置说明

### 添加 AI 渠道

1. 打开扩展选项页面，进入"渠道"标签。
2. 点击"添加渠道"，填写以下信息：
   - **类型**：选择 OpenAI、Google Gemini 或 OpenAI 兼容
   - **名称**：为渠道起一个易于识别的名称
   - **API URL**：自定义 API 地址（可选）
   - **API KEY**：填写对应的 API 密钥
   - **Models**：列出支持的模型（每行一个）

### 基础设置

- **默认模型**：设置默认使用的 AI 模型
- **翻译模型**：专门用于翻译任务的模型
- **目标语言**：设置翻译的默认目标语言
- **显示方式**：选择结果显示方式（插入原文下方或覆盖原文）
- **快捷键**：自定义触发快捷键

### Prompt 模板

在设置页面可以自定义各种任务的 Prompt 模板，支持以下占位符：
- `{{targetLang}}`：目标语言
- `{{text}}`：待处理的文本

## 🛠️ 开发指南

### 开发环境

1. 安装依赖
   ```bash
   npm install
   ```

2. 启动开发服务器
   ```bash
   npm run dev
   ```

3. 构建生产版本
   ```bash
   npm run build
   ```

4. 预览构建结果
   ```bash
   npm run preview
   ```

### 开发提示

- 如需本地迭代，可运行 `npm run dev`，同时手动刷新扩展（Side Panel 页面支持热更新，但 Service Worker / Content Script 需要重新加载）。
- 侧边栏依赖 Side Panel API（Chrome 114+），若在不支持的浏览器上使用会自动降级为日志提示。
- 使用 `npm run ui:add` 可添加新的 shadcn-vue 组件。

### 添加新组件

```bash
# 添加基础组件
npm run ui:add:base

# 添加更多组件
npm run ui:add:more

# 添加特定组件
npm run ui:add [组件名]
```

## 🔄 迁移说明

- **后台逻辑**：已将原 `background.js` 迁移至 TypeScript，并保留 `performAiAction` / `testChannel` / SSE 流式实现，新的 `stream-message` 协议用于侧边栏聊天。
- **内容脚本**：新增 `selectionchange` 监听，向后台同步最新选中的文本，网页分析模式优先使用选区数据。
- **UI 组件**：`src/sidebar/components/ui` 下的组件遵循 shadcn-vue 风格，可按需扩展更多控件（Popover、Command 等）。

## 📋 待完成功能

1. 将旧 Options 页面迁移到 Vue 架构并整合到侧边栏内的设置视图。
2. 为聊天消息管道补充流式 UI 展示（当前后台已保留 SSE，前端仍以完整响应呈现）。
3. 根据实际 API Key 策略增加本地加密或安全提示。

## 🔧 技术栈

- **前端框架**：Vue 3 + TypeScript
- **UI 组件库**：shadcn-vue + Radix Vue
- **样式框架**：Tailwind CSS
- **构建工具**：Vite
- **图标库**：Iconify + Radix Icons
- **Markdown 渲染**：marked

## 🌐 兼容性

- Manifest V3
- Chrome / Edge 114+（Side Panel API）
- 需在浏览器中允许访问的站点：`<all_urls>`（用于抓取页面文本）

## 📄 许可证

本项目采用 [Apache License 2.0](LICENSE)。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进项目。

## 📞 联系方式

如有问题或建议，请通过 [GitHub Issues](../../issues) 联系我们。