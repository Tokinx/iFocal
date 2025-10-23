# iFocal

 iFocal 是一款面向 Chrome / Edge 的 AI 助手插件，采用 **Vue 3 + shadcn-vue** 架构。插件聚焦三项能力：划词翻译、悬浮翻译与全局助手窗口，支持多通道模型与可配置的 Prompt 模板。

## 🌟 核心功能

- 🖱️ **划词/悬浮翻译**：选中文本后在页面内以悬浮窗快速查看译文，或在原文附近插入译文（可选样式）。
- 🪟 **全局助手窗口**：点击扩展图标打开独立助手窗口，支持翻译/总结/改写/润色等任务。
- 🔌 **多渠道模型**：沿用原有渠道管理逻辑，可在设置页维护 OpenAI / Gemini / 自建兼容接口，并支持通道连通性测试。
- 🎨 **现代化UI**：基于 shadcn-vue 组件库，提供一致且美观的用户界面。

## 📁 项目结构

```
├─ package.json              工程依赖与脚本（Vite 构建）
├─ public/manifest.json      Vite 构建时复制到 dist 的 Manifest
├─ src/
│  ├─ background/            MV3 Service Worker（TypeScript）
│  ├─ content/               内容脚本（监听划词、响应页面请求）
│  ├─ sidebar/               共享 UI 注册与主题样式（供窗口与设置页复用）
│  │  ├─ plugins/ui.ts       注册通用 UI 组件
│  │  └─ styles.css          主题与工具类样式
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
   - 扩展安装完成后，点击工具栏中的 iFocal 图标即可打开全局助手窗口。

### 基本使用

1. **全局助手**：点击扩展图标打开窗口，输入文本执行翻译/总结/改写/润色。
2. **划词/悬浮翻译**：在网页中划词后点击浮动圆点，或按快捷键触发翻译结果。
3. **多模型切换**：在设置页面添加不同的 AI 渠道（OpenAI、Gemini 等），并在窗口/设置页切换。

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

- 如需本地迭代，可运行 `npm run dev` 并在扩展管理页重新加载（Service Worker / Content Script 需重新加载）。
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

## 📋 待完成功能

1. 根据实际 API Key 策略增加本地加密或安全提示。
2. 增加更多第三方模型适配（按 provider 类型扩展）。

## 🔧 技术栈

- **前端框架**：Vue 3 + TypeScript
- **UI 组件库**：shadcn-vue + Radix Vue
- **样式框架**：Tailwind CSS
- **构建工具**：Vite
- **图标库**：Iconify + Radix Icons
- **Markdown 渲染**：marked

## 🌐 兼容性

- Manifest V3
- Chrome / Edge 114+
- 需在浏览器中允许访问的站点：`<all_urls>`（用于抓取页面文本）

## 📄 许可证

本项目采用 [Apache License 2.0](LICENSE)。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进项目。

## 📞 联系方式

如有问题或建议，请通过 [GitHub Issues](../../issues) 联系我们。
