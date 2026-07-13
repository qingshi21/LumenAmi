# Day 6 - 安全认证与 WebSocket 稳定性修复

**日期**：2026-07-13
**状态**：已完成

---

## 一、今日完成

### 1. JWT + BCrypt 安全认证体系

**改造前的问题**：
- 身份验证靠 `X-User-Id` 请求头，任何人都能伪造
- 密码明文存储在数据库，泄露即暴露

**改造内容**：

| 模块 | 文件 | 说明 |
|------|------|------|
| JWT 工具类 | `JwtUtil.java` | token 生成、解析、验证，返回 Claims 避免重复解析 |
| 认证拦截器 | `JwtAuthInterceptor.java` | 拦截 `/api/**`，排除登录注册健康检查 |
| MVC 配置 | `WebMvcConfig.java` | 注册拦截器 + CORS 配置 |
| 用户服务 | `UserServiceImpl.java` | BCrypt 加密 + JWT 登录 + 明文密码自动迁移 |
| 登录响应 | `LoginResponse.java` | 新增 `token` 字段 |
| WebSocket | `ChatWebSocketHandler.java` | 支持 JWT token 验证（向后兼容 userId） |
| 前端三窗口 | launcher/chat/floating `renderer.js` | 全部改用 `Authorization: Bearer` |

**关键设计**：
- BCrypt 密码加密，单向不可逆，自带盐值
- JWT 24h 有效期，HMAC-SHA256 签名防篡改
- 旧用户首次登录自动将明文密码升级为 BCrypt（通过 `$2` 前缀检测格式）
- WebSocket 优先验证 token，无 token 时降级到 userId（仅开发环境）

### 2. 安全审计与 Bug 修复

| 问题 | 严重度 | 修复方式 |
|------|--------|----------|
| 前端登录错误不显示 | 中 | 添加 `else` 分支显示后端返回的错误信息 |
| WebSocket 安全漏洞 | **高** | 有 token 时优先验证，不再因 userId 存在就跳过 token |
| 拦截器重复解析 token | 低 | `validateToken()` 返回 Claims，一次解析传给 `getUserIdFromToken()` |
| JwtUtil 冗余过期检查 | 低 | 删除手动过期检查，jjwt 解析时已自动校验 |
| JWT 密钥偏短（59字符） | 中 | 扩展到 71 字符，满足 HS256 最低 64 字符建议 |

### 3. WebSocket 竞态条件修复

**问题现象**：切换宠物时 WebSocket 无限循环连接/断开（每 2-4 秒一次）

**根因分析**：

```
时序问题（旧方案）：
1. intentionalClose = true → ws.close()    // 标记主动关闭
2. connectWebSocket() → intentionalClose = false  // 新连接重置标志
3. 旧 ws.onclose 异步触发 → 检查标志 → false！→ 触发重连！
4. 无限循环...
```

**修复方案**：

| 修复点 | 文件 | 说明 |
|--------|------|------|
| 连接 ID 机制 | `renderer.js` | `currentConnectionId` 递增，每个连接记住自己的 ID，`onclose` 时对比 ID 决定是否重连 |
| 窗口复用 | `main.js` | `createChatWindow` 复用已有窗口，只发 `set-pet-info`，不销毁重建 |
| closed 竞态保护 | `main.js` | `if (chatWindow === this)` 防止旧窗口异步事件清空新窗口引用 |
| 打开宠物列表时关闭聊天 | `main.js` | `open-launcher` 同时关闭聊天窗口，防止旧 WebSocket 残留 |
| 断连状态重置 | `renderer.js` | `onclose` 时重置 `isWaitingResponse`，移除 typing 指示器 |
| 切换宠物状态清理 | `renderer.js` | `set-pet-info` 清空 `conversationHistory`、DOM、关闭旧 WebSocket |

**修复后的时序保证**：
```
1. set-pet-info → ws.close() + ws = null
2. connectWebSocket() → myConnectionId = ++currentConnectionId（旧 ID 失效）
3. 旧 ws.onclose 异步触发 → myConnectionId !== currentConnectionId → 忽略 ✓
4. 新 WebSocket 连接成功 → onopen 检查 ID 匹配 → 正常工作 ✓
```

---

## 二、遇到的问题与解决

### 问题 1：旧用户无法登录
- **现象**：已有用户密码是明文，BCrypt 验证失败
- **解决**：登录时检测密码格式（`$2` 前缀），明文匹配后自动升级为 BCrypt 存回数据库

### 问题 2：WebSocket 无限重连循环
- **现象**：后端日志显示连接每 2-4 秒断开重连
- **根因**：全局标志 `intentionalClose` 被新连接重置，旧连接的 `onclose` 异步触发时看到错误状态
- **解决**：改用连接 ID 机制，每个连接实例有自己的标识，彻底消除竞态

### 问题 3：切换宠物时聊天记录拼接
- **现象**：宠物 B 的聊天窗口能翻到宠物 A 的记录
- **解决**：`set-pet-info` 触发时清空 `conversationHistory`、DOM、关闭旧 WebSocket

---

## 三、技术收获

1. **竞态条件的本质**：当异步操作的执行顺序不可控时，用"标识符"代替"全局标志"是更安全的模式
2. **JWT 最佳实践**：密钥 ≥ 64 字符（HS256）、一次解析多处使用、claims 传递避免重复解析
3. **密码迁移策略**：通过格式检测实现无感升级，不需要用户重新设置密码
4. **Electron 窗口生命周期**：`closed` 事件是异步的，多窗口场景需要竞态保护

---

## 四、明日计划

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | AI 记忆优化 | 解决 prompt 膨胀、无衰减机制问题 |
| P1 | 宠物动态形象系统 | 按设计文档实现对话驱动的姿态切换 |
| P1 | Prompt 角色扮演优化 | 平衡角色一致性与安全限制 |
| P2 | Token 刷新机制 | 避免每 24h 强制重新登录 |
| P2 | 服务端登出 | 当前仅客户端清除 token，服务端无法主动失效 |
