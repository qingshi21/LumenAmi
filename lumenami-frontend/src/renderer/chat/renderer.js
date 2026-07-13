const { ipcRenderer } = require('electron');

// ===== DOM 元素 =====
const chatArea = document.getElementById('chatArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const welcomeMsg = document.getElementById('welcomeMsg');
const petNameEl = document.getElementById('petName');
const petAvatarEl = document.getElementById('petAvatar');
const closeBtn = document.getElementById('closeBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const connectionStatus = document.getElementById('connectionStatus');

// 记忆相关 DOM
const memoryBtn = document.getElementById('memoryBtn');
const memorySidebar = document.getElementById('memorySidebar');
const closeMemorySidebar = document.getElementById('closeMemorySidebar');
const memoryList = document.getElementById('memoryList');
const addMemoryBtn = document.getElementById('addMemoryBtn');
const addMemoryModal = document.getElementById('addMemoryModal');
const closeAddMemoryModal = document.getElementById('closeAddMemoryModal');
const cancelAddMemory = document.getElementById('cancelAddMemory');
const confirmAddMemory = document.getElementById('confirmAddMemory');
const editMemoryModal = document.getElementById('editMemoryModal');
const closeEditMemoryModal = document.getElementById('closeEditMemoryModal');
const cancelEditMemory = document.getElementById('cancelEditMemory');
const confirmEditMemory = document.getElementById('confirmEditMemory');
const memoryHistoryModal = document.getElementById('memoryHistoryModal');
const closeHistoryModal = document.getElementById('closeHistoryModal');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyList = document.getElementById('historyList');

// ===== 状态 =====
let conversationHistory = [];
let currentPet = null;
let isWaitingResponse = false;
let editingMemoryId = null; // 当前正在编辑的记忆ID
let lastMessageDate = null; // 用于日期分组

// ===== Toast 通知 =====
function showToast(message, type = 'error') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'toast toast-' + type;
    // 触发重绘后显示
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// ===== WebSocket 相关 =====
let ws = null;
let wsConnected = false;
let heartbeatInterval = null;
let reconnectAttempts = 0;
let currentConnectionId = 0; // 连接 ID，用于区分新旧连接
const MAX_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL = 30000; // 30秒心跳间隔
const RECONNECT_DELAY = 3000; // 重连延迟 3秒

// ===== 宠物头像映射 =====
const petEmojis = ['🐱', '🐶', '🐰', '🦊', '🐼', '🐨', '🦄', '🐲', '🐧', '🦋'];
function getPetEmoji(petId) {
    return petEmojis[petId % petEmojis.length];
}

// ===== WebSocket 连接管理 =====
function connectWebSocket() {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        console.error('无法建立 WebSocket 连接：缺少 userId');
        updateConnectionStatus('disconnected');
        return;
    }

    // 如果已有连接，先关闭
    if (ws) {
        ws.close();
    }

    // 递增连接 ID，旧连接的 onclose 会检测到 ID 不匹配而跳过重连
    const myConnectionId = ++currentConnectionId;
    
    const wsUrl = `ws://localhost:8080/ws/chat?userId=${userId}&token=${localStorage.getItem('token') || ''}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        // 如果已经有更新的连接，忽略这个
        if (myConnectionId !== currentConnectionId) {
            ws.close();
            return;
        }
        console.log('WebSocket 连接已建立');
        wsConnected = true;
        reconnectAttempts = 0;
        updateConnectionStatus('connected');
        startHeartbeat();
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        } catch (err) {
            console.error('WebSocket 消息解析失败:', err);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        updateConnectionStatus('error');
    };

    ws.onclose = () => {
        // 如果已经有更新的连接，不触发重连（防止旧连接干扰新连接）
        if (myConnectionId !== currentConnectionId) {
            console.log('旧连接关闭，忽略（已有新连接）');
            return;
        }
        
        console.log('WebSocket 连接已关闭');
        wsConnected = false;
        stopHeartbeat();
        updateConnectionStatus('disconnected');
        
        // 重置等待状态，防止 typing 指示器卡住
        if (isWaitingResponse) {
            removeTypingIndicator();
            appendMessage('ai', '网络连接已断开，请等待重连后重试');
            isWaitingResponse = false;
            sendBtn.disabled = !messageInput.value.trim();
        }
        
        // 尝试重连
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`尝试重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            updateConnectionStatus('reconnecting');
            setTimeout(connectWebSocket, RECONNECT_DELAY);
        } else {
            console.error('达到最大重连次数，停止重连');
            updateConnectionStatus('failed');
        }
    };
}

// 处理 WebSocket 消息
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'connected':
            console.log('WebSocket 连接确认');
            break;
        
        case 'typing':
            // 显示正在输入指示器
            showTypingIndicator();
            break;
        
        case 'chat_reply':
            // 移除打字指示器并显示 AI 回复
            removeTypingIndicator();
            if (message.reply) {
                appendMessage('ai', message.reply, true, message.timestamp);
                conversationHistory.push({ role: 'assistant', content: message.reply });
            }
            isWaitingResponse = false;
            sendBtn.disabled = !messageInput.value.trim();
            break;
        
        case 'pong':
            // 心跳响应
            console.debug('心跳响应');
            break;
        
        case 'error':
            // 错误处理
            removeTypingIndicator();
            appendMessage('ai', `错误: ${message.errorMessage || '未知错误'}`);
            isWaitingResponse = false;
            sendBtn.disabled = !messageInput.value.trim();
            break;
        
        default:
            console.warn('未知的消息类型:', message.type);
    }
}

// 发送 WebSocket 消息
function sendWebSocketMessage(type, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket 未连接');
        return false;
    }
    
    const message = { type, ...data, timestamp: Date.now() };
    ws.send(JSON.stringify(message));
    return true;
}

// 开始心跳
function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendWebSocketMessage('ping', {});
        }
    }, HEARTBEAT_INTERVAL);
}

// 停止心跳
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// 更新连接状态显示
function updateConnectionStatus(status) {
    if (!connectionStatus) return;
    
    const statusMap = {
        'connected': { text: '已连接', class: 'status-connected' },
        'disconnected': { text: '未连接', class: 'status-disconnected' },
        'reconnecting': { text: '重连中...', class: 'status-reconnecting' },
        'error': { text: '连接错误', class: 'status-error' },
        'failed': { text: '连接失败', class: 'status-failed' }
    };
    
    const statusInfo = statusMap[status] || statusMap['disconnected'];
    connectionStatus.textContent = statusInfo.text;
    connectionStatus.className = 'connection-status ' + statusInfo.class;
}

// ===== 窗口控制 =====
if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        window.close();
    });
}

if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('minimize-chat');
    });
}

// ===== 接收宠物信息 =====
ipcRenderer.on('set-pet-info', (event, petInfo) => {
    // 重置状态，防止切换宠物时残留旧聊天记录
    conversationHistory = [];
    lastMessageDate = null;
    isWaitingResponse = false;
    
    // 关闭旧的 WebSocket 连接（递增连接 ID 使旧连接自动失效）
    if (ws) {
        ws.close();
        ws = null;
    }
    
    // 清空聊天区域 DOM
    if (chatArea) {
        chatArea.innerHTML = '';
    }
    
    // 显示欢迎消息，隐藏加载状态
    if (welcomeMsg) {
        welcomeMsg.style.display = '';
    }
    
    currentPet = petInfo;
    if (petNameEl) {
        petNameEl.textContent = petInfo.name || 'LumenAmi';
    }
    if (petAvatarEl) {
        petAvatarEl.textContent = getPetEmoji(petInfo.petId);
    }
    // 建立 WebSocket 连接
    connectWebSocket();
    // 加载历史消息
    loadHistory();
});

// ===== 加载历史消息 =====
async function loadHistory() {
    if (!currentPet || !currentPet.petId) return;
    
    try {
        const userId = localStorage.getItem('userId');
        const response = await fetch(`http://localhost:8080/api/chat/history/${currentPet.petId}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
            }
        });
        const result = await response.json();
        
        if (result.code === 200 && result.data && result.data.length > 0) {
            // 隐藏欢迎消息
            if (welcomeMsg) {
                welcomeMsg.style.display = 'none';
            }
            
            // 重置日期分组
            lastMessageDate = null;
            
            // 渲染历史消息
            for (const msg of result.data) {
                const type = msg.role === 'user' ? 'user' : 'ai';
                appendMessage(type, msg.content, false, msg.createdAt); // 传入时间戳
                conversationHistory.push({ role: msg.role, content: msg.content });
            }
        }
    } catch (err) {
        console.error('Failed to load chat history:', err);
    }
}

// ===== 消息输入 =====
messageInput.addEventListener('input', () => {
    // 自动调整高度
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 80) + 'px';
    
    // 更新发送按钮状态
    sendBtn.disabled = !messageInput.value.trim() || isWaitingResponse;
});

// Enter 发送，Shift+Enter 换行
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
            sendMessage();
        }
    }
});

sendBtn.addEventListener('click', () => {
    if (!sendBtn.disabled) {
        sendMessage();
    }
});

// ===== 发送消息 =====
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isWaitingResponse) return;

    // 隐藏欢迎消息
    if (welcomeMsg) {
        welcomeMsg.style.display = 'none';
    }

    // 添加用户消息到界面
    appendMessage('user', text);
    
    // 添加到对话历史
    conversationHistory.push({ role: 'user', content: text });

    // 清空输入框
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;
    isWaitingResponse = true;

    // 检查 WebSocket 是否连接
    if (!wsConnected) {
        appendMessage('ai', '网络连接已断开，正在尝试重连...');
        isWaitingResponse = false;
        sendBtn.disabled = !messageInput.value.trim();
        return;
    }

    // 通过 WebSocket 发送消息（后端会先推送 typing 消息，再推送 chat_reply）
    const success = sendWebSocketMessage('chat', {
        petId: currentPet?.petId,
        message: text
    });

    if (!success) {
        removeTypingIndicator();
        appendMessage('ai', '消息发送失败，请重试');
        isWaitingResponse = false;
        sendBtn.disabled = !messageInput.value.trim();
    }
}

// ===== 消息渲染 =====
function appendMessage(type, text, animate = true, timestamp = null) {
    // 检查是否需要插入日期分隔符
    const msgDate = timestamp ? new Date(timestamp) : new Date();
    const dateStr = formatDate(msgDate);
    if (lastMessageDate !== dateStr) {
        insertDateSeparator(dateStr);
        lastMessageDate = dateStr;
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    
    if (!animate) {
        msgDiv.style.animation = 'none';
    }

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    
    if (type === 'ai') {
        avatar.textContent = currentPet ? getPetEmoji(currentPet.petId) : '🐱';
    } else {
        avatar.textContent = '🧑';
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    // 时间戳
    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = formatTime(msgDate);

    msgDiv.appendChild(avatar);
    
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = 'bubble-wrapper';
    bubbleWrapper.appendChild(bubble);
    bubbleWrapper.appendChild(timeEl);
    
    msgDiv.appendChild(bubbleWrapper);
    chatArea.appendChild(msgDiv);

    // 滚动到底部
    scrollToBottom();
}

// 插入日期分隔符
function insertDateSeparator(dateStr) {
    const separator = document.createElement('div');
    separator.className = 'date-separator';
    separator.textContent = dateStr;
    chatArea.appendChild(separator);
}

// 格式化日期为友好显示
function formatDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return '昨天';
    } else {
        return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
}

// 格式化时间为 HH:mm
function formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function showTypingIndicator() {
    // 去重：如果已经存在则不再重复创建
    if (document.getElementById('typingIndicator')) return;

    const indicator = document.createElement('div');
    indicator.className = 'message ai';
    indicator.id = 'typingIndicator';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = currentPet ? getPetEmoji(currentPet.petId) : '🐱';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    indicator.appendChild(avatar);
    indicator.appendChild(bubble);
    chatArea.appendChild(indicator);

    scrollToBottom();
}

function removeTypingIndicator() {
    // 移除所有 typing 指示器（防止重复创建导致残留）
    const indicators = chatArea.querySelectorAll('#typingIndicator');
    indicators.forEach(el => el.remove());
}

function scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
}

// ===== 初始化聚焦 =====
messageInput.focus();

// ===== 记忆管理 =====

// 记忆键名到友好标签的映射
const memoryLabelMap = {
    'user_name': '名字',
    'user_nickname': '昵称',
    'user_age': '年龄',
    'user_gender': '性别',
    'user_occupation': '职业',
    'user_location': '所在地',
    'user_birthday': '生日',
    'user_personality': '性格特点',
    'user_hobby': '兴趣爱好',
    'user_interest': '关注领域',
    'user_pet': '宠物信息',
    'user_family': '家庭成员',
    'current_project': '当前项目',
    'project_tech': '技术栈',
    'project_deadline': '项目截止日期',
    'project_description': '项目描述',
    'work_status': '工作状态',
    'communication_style': '沟通风格',
    'reply_length': '回复长度偏好',
    'topic_preference': '话题偏好',
    'language_preference': '语言偏好',
    'mood': '当前心情',
    'daily_routine': '日常作息',
};

// 类型标签映射
const memoryTypeLabels = {
    'PROFILE': '用户画像',
    'PROJECT': '项目信息',
    'PREFERENCE': '偏好设置'
};

// 获取友好标签
function getMemoryLabel(key) {
    return memoryLabelMap[key] || key;
}

// 侧边栏切换
if (memoryBtn) {
    memoryBtn.addEventListener('click', () => {
        memorySidebar.classList.toggle('visible');
        if (memorySidebar.classList.contains('visible')) {
            loadMemories();
        }
    });
}

if (closeMemorySidebar) {
    closeMemorySidebar.addEventListener('click', () => {
        memorySidebar.classList.remove('visible');
    });
}

// 加载记忆列表
async function loadMemories() {
    if (!currentPet || !currentPet.petId) return;
    
    try {
        const userId = localStorage.getItem('userId');
        const response = await fetch(`http://localhost:8080/api/memories/pet/${currentPet.petId}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
            }
        });
        const result = await response.json();
        
        if (result.code === 200) {
            renderMemories(result.data || []);
        } else {
            console.error('Failed to load memories:', result.message);
        }
    } catch (err) {
        console.error('Failed to load memories:', err);
        memoryList.innerHTML = '<div class="memory-empty"><div class="memory-empty-icon" style="font-size:28px;opacity:0.4;color:#5A5766;">!</div><div class="memory-empty-text">加载失败</div></div>';
    }
}

// 渲染记忆列表
function renderMemories(memories) {
    if (!memories || memories.length === 0) {
        memoryList.innerHTML = '<div class="memory-empty"><div class="memory-empty-icon" style="font-size:28px;opacity:0.4;color:#5A5766;">M</div><div class="memory-empty-text">还没有记忆哦<br>和TA多聊聊天吧！</div></div>';
        return;
    }
    
    // 只保留每个key的最新版本
    const latestMap = {};
    for (const mem of memories) {
        const key = mem.memoryKey;
        if (!latestMap[key] || mem.version > latestMap[key].version) {
            latestMap[key] = mem;
        }
    }
    const latestMemories = Object.values(latestMap);
    
    // 按类型分组
    const groups = { PROFILE: [], PROJECT: [], PREFERENCE: [] };
    for (const mem of latestMemories) {
        const type = mem.type || 'PROFILE';
        if (groups[type]) {
            groups[type].push(mem);
        }
    }
    
    let html = '';
    for (const [type, label] of Object.entries(memoryTypeLabels)) {
        const items = groups[type];
        if (!items || items.length === 0) continue;
        
        html += `<div class="memory-group-title">${label}</div>`;
        for (const mem of items) {
            const permanentClass = mem.isPermanent ? ' permanent' : '';
            const typeClass = type.toLowerCase();
            const stars = '★'.repeat(Math.min(mem.importance || 5, 10));
            const permanentBadge = mem.isPermanent ? ' [locked]' : '';
            
            html += `
                <div class="memory-card${permanentClass}" data-id="${mem.id}" data-key="${mem.memoryKey}">
                    <span class="memory-type-badge ${typeClass}">${getMemoryLabel(mem.memoryKey)}${permanentBadge}</span>
                    <div class="memory-value">${escapeHtml(mem.memoryValue)}</div>
                    <div class="memory-meta">
                        <span class="memory-importance" title="重要性 ${mem.importance}/10">${stars}</span>
                        <span>v${mem.version}</span>
                    </div>
                    <div class="memory-actions-card">
                        <button class="btn-memory-action" onclick="editMemory(${mem.id}, '${escapeAttr(mem.memoryKey)}', '${escapeAttr(mem.memoryValue)}', ${mem.importance || 5})">edit</button>
                        <button class="btn-memory-action" onclick="viewHistory('${escapeAttr(mem.memoryKey)}')">hist</button>
                        <button class="btn-memory-action delete" onclick="deleteMemory(${mem.id}, '${escapeAttr(getMemoryLabel(mem.memoryKey))}')">del</button>
                    </div>
                </div>
            `;
        }
    }
    
    memoryList.innerHTML = html;
}

// HTML 转义
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// 添加记忆模态框
if (addMemoryBtn) {
    addMemoryBtn.addEventListener('click', () => {
        addMemoryModal.classList.add('visible');
    });
}

if (closeAddMemoryModal) {
    closeAddMemoryModal.addEventListener('click', () => {
        addMemoryModal.classList.remove('visible');
    });
}

if (cancelAddMemory) {
    cancelAddMemory.addEventListener('click', () => {
        addMemoryModal.classList.remove('visible');
    });
}

if (confirmAddMemory) {
    confirmAddMemory.addEventListener('click', async () => {
        const type = document.getElementById('memoryType').value;
        const key = document.getElementById('memoryKey').value.trim();
        const value = document.getElementById('memoryValue').value.trim();
        const importance = parseInt(document.getElementById('memoryImportance').value) || 5;
        
        if (!key || !value) {
            showToast('请填写记忆键名和值');
            return;
        }
        
        try {
            const userId = localStorage.getItem('userId');
            const response = await fetch('http://localhost:8080/api/memories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
                },
                body: JSON.stringify({
                    petId: currentPet.petId,
                    key: key,
                    value: value,
                    type: type,
                    importance: importance
                })
            });
            const result = await response.json();
            
            if (result.code === 200) {
                addMemoryModal.classList.remove('visible');
                // 清空表单
                document.getElementById('memoryKey').value = '';
                document.getElementById('memoryValue').value = '';
                document.getElementById('memoryImportance').value = '5';
                // 刷新列表
                loadMemories();
                // 确保输入框可用
                isWaitingResponse = false;
                sendBtn.disabled = !messageInput.value.trim();
            } else {
                showToast('添加失败：' + result.message);
                // 错误时也要重置状态
                isWaitingResponse = false;
                sendBtn.disabled = !messageInput.value.trim();
            }
        } catch (err) {
            showToast('网络错误，请重试');
            // 异常时也要重置状态
            isWaitingResponse = false;
            sendBtn.disabled = !messageInput.value.trim();
        }
    });
}

// 编辑记忆
window.editMemory = async function(id, key, value, importance) {
    editingMemoryId = id;
    document.getElementById('editMemoryLabel').value = getMemoryLabel(key);
    document.getElementById('editMemoryValue').value = value;
    document.getElementById('editMemoryImportance').value = importance;
    editMemoryModal.classList.add('visible');
};

if (closeEditMemoryModal) {
    closeEditMemoryModal.addEventListener('click', () => {
        editMemoryModal.classList.remove('visible');
        editingMemoryId = null;
    });
}

if (cancelEditMemory) {
    cancelEditMemory.addEventListener('click', () => {
        editMemoryModal.classList.remove('visible');
        editingMemoryId = null;
    });
}

if (confirmEditMemory) {
    confirmEditMemory.addEventListener('click', async () => {
        if (!editingMemoryId) return;
        
        const value = document.getElementById('editMemoryValue').value.trim();
        const importance = parseInt(document.getElementById('editMemoryImportance').value) || 5;
        
        if (!value) {
            showToast('记忆值不能为空');
            return;
        }
        
        try {
            const userId = localStorage.getItem('userId');
            const response = await fetch(`http://localhost:8080/api/memories/${editingMemoryId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
                },
                body: JSON.stringify({ value, importance })
            });
            const result = await response.json();
            
            if (result.code === 200) {
                editMemoryModal.classList.remove('visible');
                editingMemoryId = null;
                loadMemories();
                // 确保输入框可用
                isWaitingResponse = false;
                sendBtn.disabled = !messageInput.value.trim();
            } else {
                showToast('修改失败：' + result.message);
                // 错误时也要重置状态
                isWaitingResponse = false;
                sendBtn.disabled = !messageInput.value.trim();
            }
        } catch (err) {
            showToast('网络错误，请重试');
            // 异常时也要重置状态
            isWaitingResponse = false;
            sendBtn.disabled = !messageInput.value.trim();
        }
    });
}

// 删除记忆
window.deleteMemory = async function(id, label) {
    if (!confirm(`确定要删除「${label}」这条记忆吗？`)) return;
    
    try {
        const userId = localStorage.getItem('userId');
        const response = await fetch(`http://localhost:8080/api/memories/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
            }
        });
        const result = await response.json();
        
        if (result.code === 200) {
            loadMemories();
            // 确保输入框可用（防止因之前操作遗留的禁用状态）
            isWaitingResponse = false;
            sendBtn.disabled = !messageInput.value.trim();
        } else {
            showToast('删除失败：' + result.message);
            // 错误时也要重置状态
            isWaitingResponse = false;
            sendBtn.disabled = !messageInput.value.trim();
        }
    } catch (err) {
        showToast('网络错误，请重试');
        // 异常时也要重置状态
        isWaitingResponse = false;
        sendBtn.disabled = !messageInput.value.trim();
    }
};

// 查看记忆历史
window.viewHistory = async function(key) {
    if (!currentPet || !currentPet.petId) return;
    
    try {
        const userId = localStorage.getItem('userId');
        const response = await fetch(`http://localhost:8080/api/memories/pet/${currentPet.petId}/history/${key}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
            }
        });
        const result = await response.json();
        
        if (result.code === 200) {
            renderHistory(result.data || [], key);
            memoryHistoryModal.classList.add('visible');
        } else {
            showToast('加载历史失败');
        }
    } catch (err) {
        showToast('网络错误，请重试');
    }
};

function renderHistory(memories, key) {
    if (!memories || memories.length === 0) {
        historyList.innerHTML = '<div class="memory-empty"><div class="memory-empty-text">暂无历史记录</div></div>';
        return;
    }
    
    let html = '';
    memories.forEach((mem, index) => {
        const isCurrent = index === 0 ? ' current' : '';
        const versionLabel = index === 0 ? '当前版本' : `v${mem.version}`;
        const time = mem.createdAt ? new Date(mem.createdAt).toLocaleString('zh-CN') : '';
        
        html += `
            <div class="history-item${isCurrent}">
                <div class="history-version">${versionLabel}</div>
                <div class="history-value">${escapeHtml(mem.memoryValue)}</div>
                <div class="history-time">${time}</div>
                ${mem.previousValue ? `<div class="history-time">旧值：${escapeHtml(mem.previousValue)}</div>` : ''}
            </div>
        `;
    });
    
    historyList.innerHTML = html;
}

if (closeHistoryModal) {
    closeHistoryModal.addEventListener('click', () => {
        memoryHistoryModal.classList.remove('visible');
    });
}

if (closeHistoryBtn) {
    closeHistoryBtn.addEventListener('click', () => {
        memoryHistoryModal.classList.remove('visible');
    });
}
