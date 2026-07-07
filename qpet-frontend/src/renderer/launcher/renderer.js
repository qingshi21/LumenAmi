// ===== 窗口控制 =====
const closeBtn = document.getElementById('closeBtn');
const minimizeBtn = document.getElementById('minimizeBtn');

// 使用 Electron 的 IPC 通信关闭窗口
// 注意：这需要在主进程中监听，但目前我们先简单用 window.close()
if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        window.close();
    });
}

if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
        // Electron 没有直接的最小化 API，需要通过 IPC
        // 暂时留空，后续实现
        alert('最小化功能开发中...');
    });
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
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'flex';
        }
    });
});

// ===== 登录 =====
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (!username || !password) {
        errorEl.textContent = '请填写完整信息';
        return;
    }

    // 后续对接后端 API
    errorEl.textContent = '登录功能开发中...';
    console.log('登录:', username, password);
});

// ===== 注册 =====
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const errorEl = document.getElementById('regError');

    if (!username || !password) {
        errorEl.textContent = '请填写完整信息';
        return;
    }
    if (password.length < 6) {
        errorEl.textContent = '密码至少6位';
        return;
    }

    // 后续对接后端 API
    errorEl.textContent = '注册功能开发中...';
    console.log('注册:', username, password);
});