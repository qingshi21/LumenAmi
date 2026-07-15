const { ipcRenderer } = require('electron');
const { Application, Ticker } = require('pixi.js');
// 使用 cubism4 模块，支持 .model3.json 格式
const { Live2DModel } = require('pixi-live2d-display/cubism4');

// ===== DOM 元素 =====
const closeBtn = document.getElementById('closeBtn');
const contextMenu = document.getElementById('contextMenu');
const menuBack = document.getElementById('menuBack');
const menuChat = document.getElementById('menuChat');
const menuQuit = document.getElementById('menuQuit');

// 当前激活的宠物信息
let currentPet = null;
let live2dModel = null;
let app = null;

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

// ===== 关闭按钮 =====
if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        window.close();
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

document.body.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    let x = e.clientX;
    let y = e.clientY;
    if (x + 150 > window.innerWidth) x = window.innerWidth - 155;
    if (y + 120 > window.innerHeight) y = window.innerHeight - 125;
    showMenu(x, y);
});

document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        hideMenu();
    }
});

// ===== 菜单项事件 =====
if (menuBack) {
    menuBack.addEventListener('click', () => {
        hideMenu();
        ipcRenderer.send('open-launcher');
    });
}

if (menuChat) {
    menuChat.addEventListener('click', () => {
        hideMenu();
        ipcRenderer.send('open-chat', currentPet);
    });
}

if (menuQuit) {
    menuQuit.addEventListener('click', () => {
        hideMenu();
        window.close();
    });
}

// ===== Live2D 初始化 =====
async function initLive2D() {
    try {
        // 获取 canvas 元素
        const canvas = document.getElementById('live2d-canvas');
        if (!canvas) {
            console.error('live2d-canvas not found');
            return;
        }

        // 创建 PixiJS 应用
        app = new Application({
            view: canvas,
            transparent: true,
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundAlpha: 0,
            resolution: window.devicePixelRatio || 1,
            autoStart: false,  // 手动控制渲染循环
            eventMode: 'none',  // 禁用事件系统，避免 isInteractive 错误
        });

        // 注册 Ticker 给 Live2DModel
        Live2DModel.registerTicker(Ticker);

        // 窗口大小变化时自适应
        window.addEventListener('resize', () => {
            if (app && app.renderer) {
                app.renderer.resize(window.innerWidth, window.innerHeight);
            }
        });

        // 加载 Live2D 模型
        const modelPath = './live2d/hiyori_pro/hiyori_pro_t11.model3.json';
        live2dModel = await Live2DModel.from(modelPath, {
            autoInteract: false,  // 禁用自动交互，避免 PixiJS v7 API 不兼容问题
        });

        // 调整模型位置和大小（居中显示）
        live2dModel.anchor.set(0.5, 0.5);  // 设置锚点为中心
        live2dModel.position.set(window.innerWidth / 2, window.innerHeight / 2);
        
        // 根据模型原始尺寸计算合适的缩放比例
        const modelWidth = live2dModel.width;
        const modelHeight = live2dModel.height;
        const scaleX = (window.innerWidth * 0.8) / modelWidth;  // 占窗口宽度的 80%
        const scaleY = (window.innerHeight * 0.8) / modelHeight;  // 占窗口高度的 80%
        const scale = Math.min(scaleX, scaleY);  // 取较小的缩放比例保持比例
        live2dModel.scale.set(scale);
        app.stage.addChild(live2dModel);

        // 启动渲染循环
        app.start();

        // 自动更新物理和表情
        live2dModel.autoUpdate = true;

        console.log('Live2D model loaded successfully');
    } catch (err) {
        console.error('Live2D 模型加载失败:', err);
    }
}

// ===== 启动 =====
// 1. 获取宠物信息
fetchActivePet();

// 2. 初始化 Live2D
initLive2D();