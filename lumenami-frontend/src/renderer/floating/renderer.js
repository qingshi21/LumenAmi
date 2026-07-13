const { ipcRenderer } = require('electron');

const closeBtn = document.getElementById('closeBtn');
const pet = document.getElementById('pet');
const contextMenu = document.getElementById('contextMenu');
const menuBack = document.getElementById('menuBack');
const menuChat = document.getElementById('menuChat');
const menuQuit = document.getElementById('menuQuit');

// 当前激活的宠物信息
let currentPet = null;

// ===== 获取当前激活的宠物信息 =====
async function fetchActivePet() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) return;
        
        const response = await fetch('http://localhost:8080/api/pets', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
            }
        });
        const result = await response.json();
        if (result.code === 200 && result.data) {
            currentPet = result.data.find(p => p.isActive) || null;
        }
    } catch (err) {
        console.error('Failed to fetch active pet:', err);
    }
}

// 启动时获取宠物信息
fetchActivePet();

// ===== 关闭按钮 =====
if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        window.close();
    });
}

// ===== 桌宠点击 =====
if (pet) {
    pet.addEventListener('click', () => {
        // 点击时隐藏菜单
        hideMenu();
    });

    pet.addEventListener('mouseenter', () => {
        pet.play();
    });
}

// ===== 右键菜单 =====
function showMenu(x, y) {
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('show');
}

function hideMenu() {
    contextMenu.classList.remove('show');
}

// 右键宠物弹出菜单
document.body.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // 计算菜单位置，确保不超出窗口
    let x = e.clientX;
    let y = e.clientY;
    if (x + 150 > window.innerWidth) x = window.innerWidth - 155;
    if (y + 120 > window.innerHeight) y = window.innerHeight - 125;
    showMenu(x, y);
});

// 点击其他地方关闭菜单
document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        hideMenu();
    }
});

// 菜单项事件
if (menuBack) {
    menuBack.addEventListener('click', () => {
        hideMenu();
        ipcRenderer.send('open-launcher');
    });
}

if (menuChat) {
    menuChat.addEventListener('click', () => {
        hideMenu();
        // 打开聊天窗口，传递宠物信息
        ipcRenderer.send('open-chat', currentPet);
    });
}

if (menuQuit) {
    menuQuit.addEventListener('click', () => {
        hideMenu();
        window.close();
    });
}