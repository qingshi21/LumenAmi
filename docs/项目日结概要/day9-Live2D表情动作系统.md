# Day 9 - Live2D 表情动作系统

**日期**: 2026-07-16  
**主要工作**: Live2D 底层参数控制、动态 motion 生成、交互打断优化

---

## 一、需求背景

用户希望实现 AI 回复时同时返回表情描述，前端根据描述自动驱动 Live2D 角色做出对应表情。需要：
1. 了解 Live2D 有哪些可控制的底层参数
2. 支持静态表情（参数直控）和动态表情（motion 动画）
3. 所有交互都能立即打断当前动画，响应灵敏

---

## 二、技术调研

### 2.1 Live2D 两层控制架构

#### Motion 层（预设动作组）
模型自带的 `.motion3.json` 文件，包含完整的关键帧动画数据。当前模型有 8 组：
- `Idle`: 3个待机动作 (m01/m02/m05)
- `Flick`: 1个
- `FlickDown`: 1个
- `FlickUp`: 1个
- `Tap`: 2个点击动作 (m07/m08)
- `Tap@Body`: 1个戳身体动作 (m09)
- `Flick@Body`: 1个 (m10)
- `Happy`: 1个开心动作（新增）

调用方式：`live2dModel.motion('Happy', 0, 'FORCE')`

#### 参数层（底层直控）
通过 `setParameterValueById()` 直接操控 50+ 个参数，分为以下分组：

| 分组 | 关键参数 | 说明 |
|------|----------|------|
| **脸部** | ParamAngleX/Y/Z, ParamCheek | 转头角度、泛红程度 |
| **眼睛** | ParamEyeLOpen/ROpen, ParamEyeLSmile/RSmile | 睁眼程度、笑眼弧度 |
| **眼珠** | ParamEyeBallX/Y | 眼球位置 |
| **眉毛** | ParamBrowLY/RY, ParamBrowLAngle/RAngle, ParamBrowLForm/RForm | 眉毛上下、角度、形状 |
| **嘴部** | ParamMouthForm, ParamMouthOpenY | 嘴型曲线、张开程度 |
| **身体** | ParamBodyAngleX/Y/Z, ParamBreath, ParamShoulder | 身体倾斜、呼吸、肩膀 |
| **手臂** | ParamArmLA/RA, ParamArmLB/RB, ParamHandL/R | 左右手臂 A/B 段、手部旋转 |
| **摇动** | ParamBustY, ParamHairAhoge/Front/Back, ParamSkirt, ParamRibbon | 胸部、呆毛、头发、裙子、丝带摆动 |

**使用场景**：
- 快速切换静态表情（如 AI 返回 "sad" → 设置眉眼下垂、嘴角向下）
- 微调 motion 播放中的细节
- 口型同步（ParamMouthOpenY 跟随音频振幅）

---

## 三、实现内容

### 3.1 表情预设表（静态表情）

创建了 `expressions.json`，定义了 18 种情绪标签到 Live2D 参数的映射：

```json
{
  "format": "lumenami-expression-presets",
  "version": 1,
  "defaults": { ... },
  "expressions": {
    "happy": {
      "description": "开心/高兴",
      "params": {
        "ParamEyeLSmile": 1,
        "ParamEyeRSmile": 1,
        "ParamMouthForm": 1,
        "ParamCheek": 0.6,
        "ParamBrowLY": 0.4
      }
    },
    "sad": { ... },
    "angry": { ... },
    // ... 共18种
  }
}
```

**设计思路**：
- AI 只负责输出情绪标签（如 `"emotion": "happy"`），不直接输出参数值
- 前端维护查表逻辑，将标签映射为具体的参数组合
- 每个预设只定义相对于 defaults 需要改变的参数，未列出的保持默认

**后续扩展方向**：
- 添加过渡动画（从当前状态平滑插值到目标状态）
- 支持混合多个表情（如 "happy + shy"）
- 根据对话上下文自动推断情绪

---

### 3.2 Happy 动态 Motion 生成

创建了 `hiyori_happy.motion3.json`，实现循环播放的开心动作。

#### Cubism 4 Motion3 格式规范

**关键发现**：Segments 数组的格式非常严格：
- **第 1 个 segment**：起始点，只包含 `[时间, 值]`（2个元素）
- **后续 segments**：带类型的段
  - 线性段（类型1）：`[1, 时间1, 值1, 时间2, 值2]`（5个元素）
  - 贝塞尔段（类型2）：`[2, 时间1, 值1, cp1x, cp1y, cp2x, cp2y, 时间2, 值2]`（9个元素）

**常见错误**：
```json
// ❌ 错误：第一个 segment 也带了类型标识
"Segments": [
  0, 0,           // 应该是 [0, 0]
  1, 0.3, 0.6, 1, 1,  // 贝塞尔参数数量也不对
  ...
]

// ✅ 正确
"Segments": [
  0, 0,           // 起始点：时间0, 值0
  1, 0.5, 1,      // 线性段：0.5秒时到达值1
  1, 2.5, 1,      // 线性段：保持到2.5秒
  1, 3.0, 0       // 线性段：3秒时回到0
]
```

#### Happy Motion 动画设计

**时长**: 3秒，循环播放  
**节奏**: 0.5秒渐入 → 保持2秒 → 0.5秒渐出

**参数变化**：
| 参数 | 初始值 | 峰值 | 说明 |
|------|--------|------|------|
| ParamEyeLSmile/RSmile | 0 → 1 → 0 | 眯眼微笑 |
| ParamEyeLOpen/ROpen | 1 → 0.85 → 1 | 轻微闭眼配合笑容 |
| ParamMouthForm | 0 → 1 → 0 | 嘴角上扬 |
| ParamMouthOpenY | 0 → 0.35 → 0 | 微微张嘴 |
| ParamCheek | 0 → 0.6 → 0 | 脸红 |
| ParamBrowLY/RY | 0 → 0.5 → 0 | 眉毛上扬 |
| ParamAngleX | 0 → ±2 → 0 | 左右晃动头部 |
| ParamAngleY | 0 → 1 → 0 | 抬头 |
| ParamBodyAngleX | 0 → ±1 → 0 | 身体摇摆 |

**注册到 model3.json**：
```json
"Motions": {
  ...
  "Happy": [
    {
      "File": "motion/hiyori_happy.motion3.json"
    }
  ]
}
```

---

### 3.3 点击头部触发 Happy

修改了 `renderer.js` 的点击事件处理逻辑：

```javascript
canvas.addEventListener('click', (e) => {
    if (!live2dModel) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hitAreas = live2dModel.hitTest(x, y);

    if (hitAreas.includes('Body')) {
        // 判断点击位置在模型上半部分（头部）还是下半部分（身体）
        const modelTop = live2dModel.y - live2dModel.height / 2;
        const headThreshold = modelTop + live2dModel.height * 0.4; // 上40%视为头部区域

        if (y < headThreshold) {
            // 戳到头 → Happy
            playMotion('Happy', 0, 'FORCE');
        } else {
            // 戳到身体 → Tap@Body
            playMotion('Tap@Body', 0, 'FORCE');
        }
    } else if (hitAreas.length > 0) {
        // 戳到其他命中区域 → Tap
        playMotion('Tap', undefined, 'FORCE');
    }
});
```

**坐标计算逻辑**：
- `modelTop = live2dModel.y - live2dModel.height / 2` — 模型顶部 Y 坐标
- `headThreshold = modelTop + height * 0.4` — 头部区域阈值（上 40%）
- 点击 Y < threshold → 头部，否则 → 身体

---

### 3.4 交互打断优化

#### 问题
之前每次播放动作后会锁定 4 秒冷却期（`isPlayingInteraction = true`），期间所有点击都被忽略，导致响应迟钝。

#### 解决方案
1. **移除 `isPlayingInteraction` 锁** — 不再有任何冷却机制
2. **所有交互使用 FORCE 优先级** — 可直接打断正在播放的动画
3. **默认优先级改为 FORCE** — 即使漏传参数也能打断

```javascript
function playMotion(group, index, priority) {
    if (!live2dModel) return Promise.resolve(false);

    clearIdleTimer();

    const priorityMap = { 'NONE': 0, 'IDLE': 1, 'NORMAL': 2, 'FORCE': 3 };
    const p = priorityMap[priority] ?? 3; // 默认 FORCE，确保能打断

    return live2dModel.motion(group, index, p).then((success) => {
        scheduleIdleMotion();
        return success;
    }).catch(() => {
        scheduleIdleMotion();
    });
}
```

**效果**：
- 戳头、戳身体、点其他区域都能立即打断当前动画
- Idle 动作保持 IDLE 优先级，不会打断用户交互
- 响应速度从 4 秒延迟 → 即时响应

---

## 四、调试过程

### 4.1 Motion 加载失败排查

**现象**：控制台报错 `TypeError: Cannot set properties of undefined (setting 'basePointIndex')`

**原因**：Cubism 4 解析 Segments 时，期望第一个 segment 是起始点（2个元素），但生成的格式第一个也带了类型标识，导致解析器访问 `undefined.basePointIndex` 时报错。

**修复步骤**：
1. 阅读 `cubism4.js` 源码第 1915-1919 行，确认解析逻辑
2. 修正 Segments 格式：第一个 segment 改为 `[时间, 值]`
3. 更新 Meta 统计：TotalSegmentCount 和 TotalPointCount

**经验教训**：
- Cubism 4 motion3.json 格式非常严格，必须严格按照官方规范
- 手动编写 motion 文件容易出错，建议用 Cubism Editor 导出作为参考
- 遇到解析错误时，优先检查文件格式是否符合规范

### 4.2 添加调试日志

为了排查点击逻辑是否正确，添加了详细的 console.log：

```javascript
console.log('[click] x:', x.toFixed(0), 'y:', y.toFixed(0), 'hits:', hitAreas);
console.log('[click] modelTop:', modelTop.toFixed(0), 'threshold:', headThreshold.toFixed(0), 'isHead:', y < headThreshold);
console.log('[click] → Happy!');
```

**用途**：
- 确认命中检测是否生效（`hits` 是否为 `['Body']`）
- 验证头部判断逻辑是否正确（`isHead` 是否为 true）
- 追踪是否有报错信息

---

## 五、待办事项

### 短期
1. **测试 Happy motion 效果** — 重启悬浮窗后戳头看是否播放正常
2. **调整参数值** — 如果觉得动作不够自然，可以在 Cubism Editor 里微调后重新导出
3. **生成更多表情 motion** — 如 sad、angry、surprised 等常用表情

### 中期
1. **AI 情绪识别集成** — 在后端 Qwen API 调用时，让 AI 额外返回 emotion 字段
2. **前端表情调度器** — 接收 emotion 标签后，查表驱动对应的 motion 或参数
3. **表情混合系统** — 支持同时应用多个表情（如 "happy + shy"）

### 长期
1. **动态生成 motion** — 根据 AI 返回的表情描述，自动生成对应的 motion 文件（需要更复杂的算法）
2. **情绪记忆** — 记录用户互动时的表情偏好，个性化调整
3. **语音驱动表情** — 结合 TTS 音频振幅，实时驱动嘴部和表情参数

---

## 六、相关文件

| 文件 | 说明 |
|------|------|
| `src/renderer/floating/live2d/hiyori_pro/hiyori_pro_t11.cdi3.json` | 模型参数清单（50+ 参数定义） |
| `src/renderer/floating/live2d/hiyori_pro/hiyori_pro_t11.model3.json` | 模型配置（motion 组、HitAreas） |
| `src/renderer/floating/live2d/hiyori_pro/motion/hiyori_happy.motion3.json` | 新增 Happy 动作文件 |
| `src/renderer/floating/expressions.json` | 表情预设表（18 种情绪） |
| `src/renderer/floating/renderer.js` | 悬浮窗主逻辑（点击事件、playMotion） |

---

## 七、关键技术点总结

1. **Live2D 参数直控**：`setParameterValueById(paramId, value)` 适合快速切换静态表情
2. **Motion 动画**：`.motion3.json` 文件包含完整关键帧数据，适合复杂动态表情
3. **Cubism 4 Segments 格式**：第一个 segment 必须是起始点 `[时间, 值]`，后续才是带类型的段
4. **交互打断**：使用 FORCE 优先级 + 移除冷却锁，实现即时响应
5. **坐标计算**：通过 `model.y - height/2` 获取模型顶部，再按比例划分头部/身体区域
