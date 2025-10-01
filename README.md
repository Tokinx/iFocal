# iFocal

iFocal 是一款面向 Chrome / Edge 的 AI 助手插件，现已重构为 **Vue 3 + shadcn-vue** 架构，采用响应式布局与侧边栏聊天体验。插件可在当前网页内快速执行翻译、总结、改写等任务，并支持读取页面内容做进一步分析。

## 核心体验
- ⏱️ **侧边栏聊天面板**：点击插件图标立即唤起 Side Panel，消息流布局 + 底部输入框，支持快捷发送。
- 🎛️ **浮动控制区**：输入框上方提供模型、功能、目标语言快速切换，翻译模式自动显示目标语言选择。
- 🌐 **网页内容洞察**：后台可采集当前页面/选中文本，在“网页分析”模式中组合用户问题给出摘要或结论。
- 🔌 **多渠道模型**：沿用原有渠道管理逻辑，可在设置页维护 OpenAI / Gemini / 自建兼容接口，并支持通道连通性测试。
- ♻️ **兼容旧功能**：保留选中文本触发、快捷键打开全局窗口等能力，渐进迁移到全新的前端体系。

## 代码结构
```
├─ package.json              工程依赖与脚本（Vite 构建）
├─ public/manifest.json      Vite 构建时复制到 dist 的 Manifest
├─ src/
│  ├─ background/            MV3 Service Worker（TypeScript）
│  ├─ content/               内容脚本（监听划词、响应页面请求）
│  └─ sidebar/               Vue 3 + shadcn-vue 聊天面板
│     ├─ components/ui/      原子级 shadcn 风格组件（Button/Select/Textarea 等）
│     ├─ App.vue             侧边栏根组件（会话流、快捷控制区）
│     └─ plugins/ui.ts       注册通用 UI 组件
├─ tailwind.config.cjs       Tailwind + shadcn 设计体系
└─ vite.config.ts            多入口构建（sidebar / background / content）
```

## 构建与调试
1. 安装依赖
   ```bash
   npm install
   ```
2. 构建产物
   ```bash
   npm run build
   ```
   生成的扩展文件位于 `dist/`，其中包括 `sidebar.html`、`background.js`、`content.js` 及静态资源。
3. 加载扩展
   - 打开 `chrome://extensions`（Edge 同理）并开启“开发者模式”。
   - 选择“加载已解压的扩展程序”，指向 `dist/` 目录。
   - 如需继续使用旧的设置页，可通过扩展详情中的“扩展选项”进入 `options/options.html`。

### 开发提示
- 如需本地迭代，可运行 `npm run dev`，同时手动刷新扩展（Side Panel 页面支持热更新，但 Service Worker / Content Script 需要重新加载）。
- 侧边栏依赖 Side Panel API（Chrome 114+），若在不支持的浏览器上使用会自动降级为日志提示。

## 迁移说明
- **后台逻辑**：已将原 `background.js` 迁移至 TypeScript，并保留 `performAiAction` / `testChannel` / SSE 流式实现，新的 `stream-message` 协议用于侧边栏聊天。
- **内容脚本**：新增 `selectionchange` 监听，向后台同步最新选中的文本，网页分析模式优先使用选区数据。
- **UI 组件**：`src/sidebar/components/ui` 下的组件遵循 shadcn-vue 风格，可按需扩展更多控件（Popover、Command 等）。
- **待完成**：
  1. 将旧 Options 页面迁移到 Vue 架构并整合到侧边栏内的设置视图。
  2. 为聊天消息管道补充流式 UI 展示（当前后台已保留 SSE，前端仍以完整响应呈现）。
  3. 根据实际 API Key 策略增加本地加密或安全提示。

## 兼容性
- Manifest V3
- Chrome / Edge 114+（Side Panel API）
- 需在浏览器中允许访问的站点：`<all_urls>`（用于抓取页面文本）

欢迎根据业务需求扩展更多 shadcn 组件或任务预设，构建自己的 iFocal。
## 验证清单
1. 运行 `npm install` 安装依赖。
2. 执行 `npm run build`，确认在 `dist/` 目录生成 `sidebar.html`、`background.js`、`content.js` 等产物。
3. 在 `chrome://extensions` 中加载 `dist/`，点击扩展图标打开侧边栏并测试模型/功能切换。
4. 在任意网页选中一段文本，按下配置的触发键（默认 Alt）确认悬浮/插入翻译仍可使用。
5. 切换至 “网页分析” 功能，使用“刷新页面数据”按钮验证能够抓取当前页面要点。
