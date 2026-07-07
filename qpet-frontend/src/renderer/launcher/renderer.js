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

// ===== 错误提示管理 =====
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (!el) return;

    // 清除之前的定时器
    if (el._timeout) {
        clearTimeout(el._timeout);
        clearTimeout(el._fadeTimeout);
    }

    // 显示错误信息
    el.textContent = message;
    el.classList.remove('fade-out');
    el.style.opacity = '1';

    // 5秒后开始淡出
    el._timeout = setTimeout(() => {
        el.classList.add('fade-out');

        // 淡出动画完成后清空文字
        el._fadeTimeout = setTimeout(() => {
            el.textContent = '';
            el.classList.remove('fade-out');
            el.style.opacity = '1';
        }, 500);
    }, 5000);
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
            clearError('regError');   // ← 清空注册错误
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'flex';
            clearError('loginError');  // ← 清空登录错误
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
            // 登录成功
            console.log('登录成功', result.data);
            alert('登录成功！欢迎回来 🎉');
        } else {
            showError('loginError', result.message || '登录失败');
        }
    } catch (err) {
        errorEl.textContent = '网络错误，请确认后端服务已启动';
        console.error(err);
    }
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
            alert('注册成功，请登录');
            document.querySelector('.tab[data-tab="login"]').click();
            document.getElementById('loginUsername').value = username;
        } else {
            showError('regError', result.message || '注册失败');
        }
    } catch (err) {
        errorEl.textContent = '网络错误，请确认后端服务已启动';
        console.error(err);
    }
});