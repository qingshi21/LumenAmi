// ===== Electron IPC =====
const { ipcRenderer } = require('electron');

// ===== 从悬浮窗返回时自动显示宠物列表 =====
ipcRenderer.on('auto-show-pet-list', () => {
    const userId = localStorage.getItem('userId');
    if (userId) {
        currentUserId = parseInt(userId);
        showPetList();
    }
});

// ===== 窗口控制 =====
const closeBtn = document.getElementById('closeBtn');
const minimizeBtn = document.getElementById('minimizeBtn');

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        window.close();
    });
}

if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('minimize-launcher');
    });
}

// ===== 消息提示管理（支持错误和成功两种颜色） =====
function showMessage(elementId, message, isSuccess = false) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (el._timeout) {
        clearTimeout(el._timeout);
        clearTimeout(el._fadeTimeout);
    }

    el.textContent = message;
    el.style.color = isSuccess ? '#2ecc71' : '#e74c3c';
    el.classList.remove('fade-out');
    el.style.opacity = '1';

    el._timeout = setTimeout(() => {
        el.classList.add('fade-out');

        el._fadeTimeout = setTimeout(() => {
            el.textContent = '';
            el.classList.remove('fade-out');
            el.style.opacity = '1';
        }, 500);
    }, 10000);
}

function clearError(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (el._timeout) {
        clearTimeout(el._timeout);
        clearTimeout(el._fadeTimeout);
    }
    el.textContent = '';
    el.classList.remove('fade-out');
    el.style.opacity = '1';
}

// ===== Tab 切换 =====
const tabs = document.querySelectorAll('.tab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (tab.dataset.tab === 'login') {
            loginForm.style.display = 'flex';
            registerForm.style.display = 'none';
            clearError('regError');
            document.getElementById('loginPassword').disabled = false;
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'flex';
            clearError('loginError');
            document.getElementById('regPassword').disabled = false;
        }
    });
});

// ===== 登录 =====
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showMessage('loginError', '请填写完整信息');
        return;
    }

    try {
        const response = await fetch('http://localhost:8080/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (result.code === 200) {
            currentUserId = result.data.userId;
            localStorage.setItem('userId', currentUserId);
            localStorage.setItem('username', result.data.username);
            localStorage.setItem('token', result.data.token);

            showMessage('loginError', '✅ 登录成功！', true);
            // 延迟一点切换到宠物列表
            setTimeout(() => {
                showPetList();
            }, 300);
        } else {
            showMessage('loginError', result.message || '登录失败');
        }
        
    } catch (err) {
        showMessage('loginError', '网络错误，请确认后端服务已启动');
        console.error(err);
    }
});

// ===== 注册 =====
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;

    if (!username || !password) {
        showMessage('regError', '请填写完整信息');
        return;
    }
    if (password.length < 6) {
        showMessage('regError', '密码至少6位');
        return;
    }

    try {
        const response = await fetch('http://localhost:8080/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (result.code === 200) {
            document.querySelector('.tab[data-tab="login"]').click();

            const usernameInput = document.getElementById('loginUsername');
            usernameInput.value = username;
            usernameInput.disabled = false;

            const pwdInput = document.getElementById('loginPassword');
            pwdInput.value = '';
            pwdInput.disabled = false;

            document.querySelector('#loginForm button').disabled = false;

            showMessage('loginError', '✅ 注册成功，请登录', true);
        } else {
            showMessage('regError', result.message || '注册失败');
        }
    } catch (err) {
        showMessage('regError', '网络错误，请确认后端服务已启动');
        console.error(err);
    }
});

// ===== 通用请求头 =====
function apiHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
    };
}

// ===== 宠物列表相关 =====
const petListContainer = document.getElementById('petListContainer');
const petListEl = document.getElementById('petList');
const createPetBtn = document.getElementById('createPetBtn');
const logoutBtn = document.getElementById('logoutBtn');

let currentUserId = null;
let pets = [];

// 宠物头像 emoji 池
const petEmojis = ['🐱', '🐶', '🐰', '🦊', '🐼', '🐨', '🦄', '🐲', '🐧', '🦋'];
function getPetEmoji(petId) {
    return petEmojis[petId % petEmojis.length];
}

// 获取宠物列表
async function fetchPets() {
    try {
        const response = await fetch('http://localhost:8080/api/pets', {
            headers: apiHeaders()
        });
        const result = await response.json();
        if (result.code === 200) {
            pets = result.data || [];
            renderPetList();
        } else {
            showMessage('loginError', '获取宠物列表失败');
        }
    } catch (err) {
        showMessage('loginError', '网络错误');
        console.error(err);
    }
}

// 渲染宠物列表
function renderPetList() {
    if (!petListEl) return;
    if (pets.length === 0) {
        petListEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">+</div>
                <div>还没有桌宠，点击右上角创建吧</div>
            </div>`;
        return;
    }
    petListEl.innerHTML = pets.map(pet => `
        <div class="pet-card ${pet.isActive ? 'active' : ''}" data-pet-id="${pet.petId}">
            <div class="pet-avatar-icon">${getPetEmoji(pet.petId)}</div>
            <div class="info">
                <span class="name">${pet.name}</span>
                <span class="role">${pet.roleName || '未设定角色'}</span>
            </div>
            <div class="card-actions">
                ${pet.isActive ? '<span class="status">使用中</span>' : ''}
                <button class="btn-delete" data-pet-id="${pet.petId}" title="删除">✕</button>
            </div>
        </div>
    `).join('');

    // 绑定点击事件：选择宠物
    document.querySelectorAll('.pet-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // 点击删除按钮不触发选择
            if (e.target.classList.contains('btn-delete')) return;
            const petId = parseInt(card.dataset.petId);
            selectPet(petId);
        });
    });

    // 绑定删除按钮
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const petId = parseInt(btn.dataset.petId);
            const pet = pets.find(p => p.petId === petId);
            if (pet && confirm(`确定要删除「${pet.name}」吗？`)) {
                deletePet(petId);
            }
        });
    });
}

// 选择宠物（切换激活）
async function selectPet(petId) {
    try {
        const response = await fetch(`http://localhost:8080/api/pets/${petId}/activate`, {
            method: 'PATCH',
            headers: apiHeaders()
        });
        const result = await response.json();
        if (result.code === 200) {
            showMessage('loginError', '✅ 已切换到 ' + result.data.name, true);
            await fetchPets();
            // 通知主进程关闭启动器、打开悬浮窗
            ipcRenderer.send('open-floating');
            ipcRenderer.send('close-launcher');
        } else {
            showMessage('loginError', result.message || '切换失败');
        }
    } catch (err) {
        showMessage('loginError', '网络错误');
        console.error(err);
    }
}

// 删除宠物
async function deletePet(petId) {
    try {
        const response = await fetch(`http://localhost:8080/api/pets/${petId}`, {
            method: 'DELETE',
            headers: apiHeaders()
        });
        const result = await response.json();
        if (result.code === 200) {
            showMessage('loginError', '已删除', true);
            await fetchPets();
        } else {
            showMessage('loginError', result.message || '删除失败');
        }
    } catch (err) {
        showMessage('loginError', '网络错误');
        console.error(err);
    }
}

// 显示宠物列表（隐藏登录/注册表单）
function showPetList() {
    const authPanel = document.querySelector('.auth-panel');
    const petDisplay = document.querySelector('.pet-display');

    if (authPanel) authPanel.style.display = 'none';
    if (petDisplay) petDisplay.style.display = 'none';
    if (petListContainer) {
        petListContainer.style.display = '';
        petListContainer.classList.add('visible');
        fetchPets();
    }
}

// 显示登录/注册表单（隐藏宠物列表）
function showAuthPanel() {
    const authPanel = document.querySelector('.auth-panel');
    const petDisplay = document.querySelector('.pet-display');
    if (authPanel) authPanel.style.display = '';
    if (petDisplay) petDisplay.style.display = '';
    petListContainer.classList.remove('visible');
    petListContainer.style.display = 'none';
    
    // 重置表单状态，确保输入框可用
    resetFormStates();
}

// 重置表单状态
function resetFormStates() {
    // 启用登录表单输入框
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginButton = document.querySelector('#loginForm button');
    if (loginUsername) loginUsername.disabled = false;
    if (loginPassword) loginPassword.disabled = false;
    if (loginButton) loginButton.disabled = false;
    
    // 启用注册表单输入框
    const regUsername = document.getElementById('regUsername');
    const regPassword = document.getElementById('regPassword');
    const regButton = document.querySelector('#registerForm button');
    if (regUsername) regUsername.disabled = false;
    if (regPassword) regPassword.disabled = false;
    if (regButton) regButton.disabled = false;
    
    // 清空错误提示
    clearError('loginError');
    clearError('regError');
}

// ===== 退出登录 =====
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.clear();
        currentUserId = null;
        pets = [];
        showAuthPanel();
        showMessage('loginError', '已退出登录');
    });
}

// ===== 创建宠物模态框 =====
const createPetModal = document.getElementById('createPetModal');
const createPetForm = document.getElementById('createPetForm');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const understandRoleBtn = document.getElementById('understandRoleBtn');
const understandLoading = document.getElementById('understandLoading');

function openCreateModal() {
    createPetForm.reset();
    clearError('createPetError');
    
    // 重置勾选框状态
    const descChoiceGroup = document.getElementById('descriptionChoiceGroup');
    if (descChoiceGroup) {
        descChoiceGroup.style.display = 'none';
    }
    const useUserDescCheckbox = document.getElementById('useUserDescCheckbox');
    if (useUserDescCheckbox) {
        useUserDescCheckbox.checked = true;
    }
    const useAiDescCheckbox = document.getElementById('useAiDescCheckbox');
    if (useAiDescCheckbox) {
        useAiDescCheckbox.checked = true;
    }
    storedAiUnderstanding = '';
    storedUserDescription = '';
    
    // 确保模态框输入框可用
    const petNameInput = document.getElementById('petNameInput');
    const petRoleInput = document.getElementById('petRoleInput');
    const petPromptInput = document.getElementById('petPromptInput');
    if (petNameInput) petNameInput.disabled = false;
    if (petRoleInput) petRoleInput.disabled = false;
    if (petPromptInput) petPromptInput.disabled = false;
    
    createPetModal.style.display = 'flex';
    // 触发 reflow 后再加 show class，让过渡动画生效
    requestAnimationFrame(() => {
        createPetModal.classList.add('show');
    });
}

function closeCreateModal() {
    createPetModal.classList.remove('show');
    setTimeout(() => {
        createPetModal.style.display = 'none';
    }, 250);
}

if (createPetBtn) {
    createPetBtn.addEventListener('click', openCreateModal);
}
if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeCreateModal);
}
if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeCreateModal);
}
// 点击遮罩关闭
if (createPetModal) {
    createPetModal.addEventListener('click', (e) => {
        if (e.target === createPetModal) closeCreateModal();
    });
}

// ===== AI 理解角色 =====
const editUnderstandingModal = document.getElementById('editUnderstandingModal');
const closeEditUnderstandingBtn = document.getElementById('closeEditUnderstandingBtn');
const cancelEditUnderstandingBtn = document.getElementById('cancelEditUnderstandingBtn');
const confirmEditUnderstandingBtn = document.getElementById('confirmEditUnderstandingBtn');
const aiUnderstandingTextarea = document.getElementById('aiUnderstandingTextarea');
const viewAiUnderstandingBtn = document.getElementById('viewAiUnderstandingBtn');

// 前端存储 AI 理解结果（不存数据库）
let storedAiUnderstanding = '';
// 存储用户原始描述（用于勾选框显示）
let storedUserDescription = '';

if (understandRoleBtn) {
    understandRoleBtn.addEventListener('click', async () => {
        const name = document.getElementById('petNameInput').value.trim();
        const roleName = document.getElementById('petRoleInput').value.trim();
        const description = document.getElementById('petPromptInput').value.trim();
        
        if (!name) {
            showMessage('createPetError', '请先填写宠物名称');
            return;
        }
        if (!roleName && !description) {
            showMessage('createPetError', '请先填写角色名称或性格描述');
            return;
        }
        
        // 显示加载状态
        understandRoleBtn.disabled = true;
        understandRoleBtn.textContent = '分析中...';
        understandLoading.style.display = 'block';
        
        try {
            // 直接调用接口，不需要 petId
            const response = await fetch('http://localhost:8080/api/pets/understand-role', {
                method: 'POST',
                headers: apiHeaders(),
                body: JSON.stringify({ name, roleName, description })
            });
            const result = await response.json();
            
            if (result.code === 200) {
                // 保存用户原始描述
                storedUserDescription = description;
                
                // 将 AI 理解结果填入编辑框
                aiUnderstandingTextarea.value = result.data;
                
                // 显示编辑模态框
                editUnderstandingModal.classList.add('show');
            } else {
                showMessage('createPetError', result.message || '角色理解失败');
            }
        } catch (err) {
            showMessage('createPetError', '网络错误');
            console.error(err);
        } finally {
            understandRoleBtn.disabled = false;
            understandRoleBtn.textContent = 'AI 理解角色';
            understandLoading.style.display = 'none';
        }
    });
}

// 关闭 AI 理解编辑模态框
if (closeEditUnderstandingBtn) {
    closeEditUnderstandingBtn.addEventListener('click', () => {
        editUnderstandingModal.classList.remove('show');
    });
}

if (cancelEditUnderstandingBtn) {
    cancelEditUnderstandingBtn.addEventListener('click', () => {
        editUnderstandingModal.classList.remove('show');
    });
}

// 点击模态框背景关闭
if (editUnderstandingModal) {
    editUnderstandingModal.addEventListener('click', (e) => {
        if (e.target === editUnderstandingModal) {
            editUnderstandingModal.classList.remove('show');
        }
    });
}

// 确认保存 AI 理解结果（只存到前端变量，不存数据库）
if (confirmEditUnderstandingBtn) {
    confirmEditUnderstandingBtn.addEventListener('click', () => {
        const aiDescription = aiUnderstandingTextarea.value.trim();
        
        if (!aiDescription) {
            showMessage('editUnderstandingError', 'AI 描述不能为空');
            return;
        }
        
        // 存储到前端变量
        storedAiUnderstanding = aiDescription;
        
        // 关闭编辑模态框
        editUnderstandingModal.classList.remove('show');
        
        // 显示勾选框组
        document.getElementById('descriptionChoiceGroup').style.display = 'block';
        
        // 默认两个都勾选
        document.getElementById('useUserDescCheckbox').checked = true;
        document.getElementById('useAiDescCheckbox').checked = true;
        
        showMessage('createPetError', '✅ AI 理解已保存！请勾选你要使用的描述', true);
    });
}

// 查看 AI 理解结果（只读弹窗）
if (viewAiUnderstandingBtn) {
    viewAiUnderstandingBtn.addEventListener('click', () => {
        if (!storedAiUnderstanding) {
            showMessage('createPetError', '还没有 AI 理解结果');
            return;
        }
        // 填入 textarea 并显示模态框
        aiUnderstandingTextarea.value = storedAiUnderstanding;
        editUnderstandingModal.classList.add('show');
    });
}

// 提交创建宠物表单
if (createPetForm) {
    createPetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('petNameInput').value.trim();
        const roleName = document.getElementById('petRoleInput').value.trim();
        const userDesc = document.getElementById('petPromptInput').value.trim();
        
        if (!name) {
            showMessage('createPetError', '请输入宠物名称');
            return;
        }
        
        // 获取勾选状态
        const useUserDesc = document.getElementById('useUserDescCheckbox')?.checked || false;
        const useAiDesc = document.getElementById('useAiDescCheckbox')?.checked || false;
        
        // 如果没有使用 AI 理解，至少需要用户描述
        if (!useUserDesc && !useAiDesc) {
            showMessage('createPetError', '请至少勾选一个描述来源');
            return;
        }
        
        // 根据勾选构建 systemPrompt
        let systemPrompt = '';
        if (useUserDesc && useAiDesc) {
            // 两个都勾选：拼接
            systemPrompt = '【用户描述】\n' + userDesc + '\n\n【AI 角色理解】\n' + storedAiUnderstanding;
        } else if (useAiDesc) {
            // 只用 AI 理解
            systemPrompt = storedAiUnderstanding;
        } else {
            // 只用用户描述
            systemPrompt = userDesc;
        }
        
        if (!systemPrompt.trim()) {
            showMessage('createPetError', '描述内容不能为空');
            return;
        }

        try {
            const response = await fetch('http://localhost:8080/api/pets', {
                method: 'POST',
                headers: apiHeaders(),
                body: JSON.stringify({ name, roleName, systemPrompt })
            });
            const result = await response.json();
            if (result.code === 200) {
                showMessage('loginError', '✅ 桌宠创建成功！', true);
                closeCreateModal();
                // 重置 AI 理解相关状态
                storedAiUnderstanding = '';
                storedUserDescription = '';
                await fetchPets();
            } else {
                showMessage('createPetError', result.message || '创建失败');
            }
        } catch (err) {
            showMessage('createPetError', '网络错误');
            console.error(err);
        }
    });
}
