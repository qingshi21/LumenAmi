# Day 8 — Live2D 悬浮窗集成与 AI 角色理解接口重构

## 一、今日完成概览

完成了 Live2D 模型在悬浮窗中的渲染集成，以及 AI 角色理解接口的全面重构（联网搜索 + 防幻觉优化）。

| 任务 | 内容 | 状态 |
|------|------|------|
| T1 | Live2D 悬浮窗渲染集成（PixiJS + pixi-live2d-display） | ✅ |
| T2 | 悬浮窗拖拽与右键菜单交互修复 | ✅ |
| T3 | AI 角色理解接口重构（联网搜索 + 分级参考） | ✅ |
| T4 | Prompt 防幻觉优化（禁止捏造作品来源） | ✅ |
| T5 | ChatServiceImpl 对话上下文与行为约束优化 | ✅ |
| T6 | UI 增强（删除确认弹窗、AI 理解警告弹窗） | ✅ |
| Bug Fix | PixiJS v8 不兼容 / Cubism Core 缺失 / isInteractive 报错 / 拖拽卡顿 | ✅ |

---

## 二、各任务详细记录

### T1：Live2D 悬浮窗渲染集成

**目标：** 将悬浮窗从 MP4 视频模式升级为 Live2D 模型渲染。

**技术栈：**
- `pixi.js@7.4.3`（从 v8 降级，因 pixi-live2d-display 不兼容 v8）
- `pixi-live2d-display@0.4.0`（使用 `/cubism4` 子模块支持 `.model3.json` 格式）
- `live2dcubismcore.min.js`（Cubism 4 运行时，官方下载）

**关键实现：**
```javascript
// renderer.js
const { Application, Ticker } = require('pixi.js');
const { Live2DModel } = require('pixi-live2d-display/cubism4');

Live2DModel.registerTicker(Ticker);
app = new Application({
    view: canvas,
    transparent: true,
    backgroundAlpha: 0,
    resolution: window.devicePixelRatio || 1,
    autoStart: false,
    eventMode: 'none',  // 禁用 PixiJS 事件系统，避免 isInteractive 报错
});
app.start();
```

**依赖变更（package.json）：**
- `"pixi.js": "^7.4.3"`（从 `^8.0.0` 降级）
- `"pixi-live2d-display": "^0.4.0"`（新增）

### T2：悬浮窗拖拽与右键菜单交互修复

**问题与解决过程：**

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 右键菜单无法弹出 | `body` 的 `-webkit-app-region: drag` 拦截所有鼠标事件 | 移除 body 的 drag 属性，改为顶部/两侧独立拖拽区域 |
| JS 自定义拖拽卡顿闪烁 | `ipcRenderer.invoke` 频繁跨进程通信 | 改回 Electron 原生 `-webkit-app-region: drag` |
| `isInteractive` 报错 | PixiJS v7 移除了该 API，但 pixi-live2d-display 内部仍在调用 | 设置 `eventMode: 'none'` 禁用 PixiJS 事件系统 |
| 模型加载后窗口仍透明 | 未启动渲染循环 | 添加 `app.start()` 手动启动 |

**最终拖拽方案：**
```html
<!-- 只在顶部和两侧设置拖拽区域，中间留给右键菜单 -->
<div class="drag-area top"></div>    <!-- 20px 高 -->
<div class="drag-area left"></div>   <!-- 15px 宽 -->
<div class="drag-area right"></div>  <!-- 15px 宽 -->
```

**右键菜单事件：**
- 绑定在 `document.body` 上（非 canvas），确保整个窗口可响应
- 模型设置 `interactive: false`，不拦截鼠标事件

### T3：AI 角色理解接口重构

**目标：** 改为基于用户信息 → 联网搜索 → AI 知识的分级参考逻辑，防止 AI 瞎编。

**新增文件：**
- `WebSearchService.java` — 网络搜索服务接口
- `WebSearchServiceImpl.java` — 使用 DuckDuckGo Instant Answer API（免费，无需 API Key）

**重构后的流程：**
```
用户输入信息
    ↓
判断信息是否充足（角色名 + >20字描述）
    ↓ 不充足
联网搜索（DuckDuckGo API）
    ↓
搜索结果？
  ├─ 有 → 作为"参考资料"传给 Qwen（标注"可能不准确，仅供参考"）
  └─ 无 → 标记 searchFailed，返回时添加 [WARNING] 前缀
    ↓
构建 Prompt（强调用户信息优先、禁止捏造）
    ↓
Qwen 生成角色理解
    ↓
前端检测 [WARNING] → 弹出自定义警告弹窗
```

**Prompt 优先级设计：**
```
用户提供的信息（最高优先级） > AI 已有知识 > 联网搜索结果（可能不准确）
```

### T4：Prompt 防幻觉优化

**问题：** AI 会捏造角色出自某部作品（如"出自《xxx》"），产生幻觉。

**根因分析：**
1. 原 Prompt 写的是"参考角色在公开作品/游戏/动漫中的真实性格设定"——反而鼓励 AI 去编造具体作品名
2. 联网搜索结果被标记为"公开资料，请优先使用"，导致 Qwen 把可能错误的搜索结果当真相

**修复措施：**

| 修改前 | 修改后 |
|--------|--------|
| "必须尽可能参考角色在公开作品/游戏/动漫中的真实性格设定" | "不要编造角色出自哪部作品，不要编造你没有把握的信息" |
| "必须优先基于【公开资料】和【用户提供的信息】" | "优先基于【用户提供的描述】来理解角色，用户说的算" |
| "联网搜索到的公开资料（重要参考，请优先使用这些信息）" | "联网搜索到的参考资料（可能不准确，仅供参考，请结合自己的知识判断）" |
| 无禁止捏造作品的规则 | 新增规则："绝对禁止捏造角色出自某部作品（如'出自《xxx》'），除非你100%确定" |

### T5：ChatServiceImpl 对话上下文与行为约束优化

**变更内容：**

1. **兜底逻辑修复：** `isFallbackNeeded()` 改为 L2 为空时必须触发兜底（永久记忆不包含对话细节，无法替代）
2. **上下文补全：** 将当前用户消息显式添加到 messages 列表末尾（之前依赖 WebSocket 层注入，不够可靠）
3. **System Prompt 重构：** 将核心行为约束提到最前面（最高优先级），身份设定后移

**新增行为约束规则（放在 System Prompt 最前面）：**
- 严禁使用 `*动作描写*` 格式
- 严禁使用过于文艺、诗意、华丽的辞藻
- 严禁使用"亲爱的""宝贝"等过于亲密的称呼
- 严禁写小说式、话剧式的台词
- 严禁过度热情、肉麻、煽情
- 感叹号最多用一个

### T6：UI 增强

**新增组件：**

1. **删除确认弹窗**（`deleteConfirmModal`）：
   - 复用 `.modal-overlay` + `.modal-small` 样式
   - 红色危险按钮 `.btn-danger`

2. **AI 理解警告弹窗**（`aiWarningModal`）：
   - 当联网搜索失败时，前端弹出自定义弹窗（非原生 `confirm()`，避免阻塞 UI 导致输入框异常）
   - 使用 Promise 实现 `await` 等待用户选择
   - 点"继续查看"才填入 AI 结果，点"取消"则放弃

---

## 三、Bug 修复

### Bug 1（严重）：PixiJS v8 与 pixi-live2d-display 不兼容

**问题：** `new Application()` 报错 "The Application constructor has been refactored in PixiJS v8"。

**修复：** `npm install pixi.js@^7.4.3` 降级到 v7。

### Bug 2（严重）：Cubism Core 运行时缺失

**问题：** "Could not find Cubism 2 runtime. This plugin requires live2d.min.js to be loaded."

**修复：** 下载 `live2dcubismcore.min.js` 放入 `floating/live2d/` 目录，在 `index.html` 中通过 `<script>` 标签引入。

### Bug 3（性能）：鼠标移动时大量 `isInteractive is not a function` 报错

**问题：** pixi-live2d-display 内部调用 PixiJS v6 的 `isInteractive()` 方法，v7 已移除。

**修复：** 设置 `eventMode: 'none'` 禁用 PixiJS 的事件系统（不需要模型交互，拖拽和右键都用原生 DOM 事件）。

### Bug 4（交互）：`-webkit-app-region: drag` 导致右键菜单无法弹出

**问题：** body 设置 `drag` 属性后，所有鼠标事件被 Electron 拦截用于拖拽。

**修复：** 移除 body 的 drag 属性，改为只在顶部（20px）和两侧（15px）设置独立的拖拽区域。

### Bug 5（体验）：JS 自定义拖拽卡顿闪烁

**问题：** 通过 `ipcRenderer.invoke('get-window-position')` + `ipcRenderer.send('move-window')` 实现拖拽，频繁跨进程通信导致虚影和卡顿。

**修复：** 改回 Electron 原生 `-webkit-app-region: drag`，性能更好。

### Bug 6（体验）：原生 `confirm()` 导致输入框禁用

**问题：** AI 理解结果的警告弹窗使用原生 `confirm()`，阻塞 UI 线程导致输入框状态异常。

**修复：** 改用自定义 CSS 弹窗 + Promise 异步等待。

---

## 四、新增/修改文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `floating/live2d/live2dcubismcore.min.js` | **新增** | Cubism 4 运行时 |
| `floating/renderer.js` | 重写 | Live2D 初始化 + 拖拽区域 + 右键菜单 |
| `floating/style.css` | 重写 | 拖拽区域布局 + 交互样式 |
| `floating/index.html` | 修改 | 添加 Cubism Core script + 拖拽区域 DOM |
| `package.json` | 修改 | pixi.js 降级 + pixi-live2d-display 新增 |
| `WebSearchService.java` | **新增** | 网络搜索服务接口 |
| `WebSearchServiceImpl.java` | **新增** | DuckDuckGo 免费 API 实现 |
| `PetServiceImpl.java` | 修改 | 角色理解逻辑重构 + Prompt 防幻觉 |
| `ChatServiceImpl.java` | 修改 | 兜底逻辑修复 + 行为约束前置 |
| `launcher/index.html` | 修改 | 新增删除确认弹窗 + AI 理解警告弹窗 |
| `launcher/renderer.js` | 修改 | 自定义警告弹窗逻辑（Promise 异步等待） |
| `launcher/style.css` | 修改 | 新增 `.btn-danger`、`.modal-small` 样式 |

---

## 五、关键技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Live2D 渲染库 | pixi.js v7 + pixi-live2d-display | v8 不兼容，v7 稳定可用 |
| Cubism 运行时 | 官方 live2dcubismcore.min.js | 必须手动引入，npm 无法自动解决 |
| 网络搜索 API | DuckDuckGo Instant Answer API | 免费无需 API Key，适合个人项目 |
| 拖拽方案 | Electron 原生 `-webkit-app-region: drag` | JS 拖拽有性能问题（IPC 频繁通信） |
| 警告弹窗方案 | 自定义 CSS + Promise | 原生 `confirm()` 会阻塞 UI 导致输入框异常 |
| Prompt 防幻觉 | 明确禁止捏造作品来源 + 分级参考优先级 | AI 会"自信地"编造信息来源 |
| 事件系统 | `eventMode: 'none'` 禁用 PixiJS 事件 | 避免 isInteractive 报错，交互用原生 DOM |
