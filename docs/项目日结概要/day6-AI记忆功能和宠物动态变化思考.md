# LumenAmi 项目思考记录 - 2026-07-13

## 一、AI 记忆系统

### 1.1 当前问题

每次调用 Qwen API 时，全量加载 `pet_memories` 表所有记忆 + 最近 N 条对话，拼进 Prompt。导致：

- Token 消耗持续增长
- 回复越来越慢
- 无关信息干扰 AI 判断
- 没有遗忘机制，记忆只增不减

### 1.2 改进方向：存储层三层架构

| 层级 | 存储内容 | 取用方式 |
|---|---|---|
| **L1 固定层** | system_prompt + 核心画像（姓名、职业、核心偏好） | 每次必带 |
| **L2 检索层** | pet_memories 表（可更新的长期记忆） | 按需检索，只取 Top 3-5 条 |
| **L3 上下文层** | chat_messages 表（当前会话对话记录） | 只带最近 N 条 |

### 1.3 调用层四层架构

| 阶段 | 做的事情 | Token 贡献 |
|---|---|---|
| **L0 固定层** | 取 system_prompt + 用户画像 | 恒定 ~500 token |
| **L1 检索层** | 用户消息 → 向量检索 → 取 Top 3-5 条记忆 | 可变 ~300 token |
| **L2 上下文层** | 取最近 5 条对话 | 可变 ~1000 token |
| **L3 当前层** | 用户当前问题 | 最小 ~50 token |

### 1.4 下一步实现

1. 接入 Qwen Embedding API，将用户消息和记忆值向量化
2. pet_memories 表增加 embedding 字段或单独建立向量索引
3. 改造 ChatService：每次请求先做向量检索，只取 Top 3-5 条相关记忆
4. 记忆淘汰策略：按 importance + last_accessed_at 自动清理低价值记忆

### 1.5 跨会话记忆的本质

**记忆不是模型的属性，而是应用层对上下文窗口的管理策略。**

- 上下文窗口：模型一次能"看到"的最大文本范围（工作台）
- 长期记忆：在窗口之外建一个仓库（磁盘/数据库），需要时把最相关的内容精准放回窗口
- RAG：从仓库里精准取货并摆上工作台的技术


## 二、宠物数据模型与动态变化

### 2.1 核心设计理念

**用户自定义形象 + 对话驱动姿态变化 + 缓存复用**

核心思路是跳过传统的"设计动作库"路线，改用"实时生成姿态图"：

- 用户输入角色名 → AI 生成候选形象 → 用户选择
- 对话中 AI 返回动作标签（如 `celebrating`）→ 触发姿态切换
- 姿态图生成后缓存，下次秒用

### 2.2 数据表设计

#### pets 表（已有，新增字段）

```sql
ALTER TABLE pets ADD COLUMN default_image_url VARCHAR(255);
ALTER TABLE pets ADD COLUMN style_prompt VARCHAR(500);
ALTER TABLE pets ADD COLUMN reference_image_url VARCHAR(255);
```

#### pet_actions 表（新增）

```sql
CREATE TABLE pet_actions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    pet_id INT NOT NULL,
    action_key VARCHAR(50) NOT NULL,     -- celebrating / thinking / nodding 等
    image_url VARCHAR(255) NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    use_count INT DEFAULT 0,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
    UNIQUE KEY uk_pet_action (pet_id, action_key)
);
```

### 2.3 动作标签定义

| action_key | 中文描述 | 触发场景 |
|---|---|---|
| idle | 待机 | 默认状态 |
| happy | 开心 | 用户分享好消息 |
| thinking | 思考 | 用户提问复杂问题 |
| nodding | 点头 | 表示赞同 |
| celebrating | 庆祝 | 用户达成目标 |
| sad | 难过 | 用户表达负面情绪 |
| questioning | 疑惑 | 用户表达困惑 |
| drinking | 举杯 | 庆祝、放松场景 |

### 2.4 图片生成 + 缓存机制

```
AI 返回回复 + action
    ↓
查询本地缓存（pet_id + action_key）
    ↓
命中 → 直接使用
未命中 → 触发生成 + 启动 1 秒计时器
    ↓
1 秒内完成 → 展示新姿态 + 存入缓存
超时 → 使用默认姿态 + 后台继续生成 + 完成后存入缓存
```

### 2.5 画风一致性控制

- 用户选定形象时，保存参考图和 AI 生成的画风描述
- 每次生成新姿态时，以参考图 + 画风描述 + 动作描述作为输入
- 备选技术方案：豆包 Seedream（天然支持角色一致性）、InstantCharacter（需自部署）