const { app, BrowserWindow } = require('electron');
const path = require('path');

// ========== 启动器窗口 ==========
let launcherWindow = null;

function createLauncher(autoShowPetList = false) {
    if (launcherWindow) {
        launcherWindow.show();
        if (autoShowPetList) {
            launcherWindow.webContents.send('auto-show-pet-list');
        }
        return launcherWindow;
    }

    launcherWindow = new BrowserWindow({
        width: 480,
        height: 680,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    launcherWindow.loadFile('./src/renderer/launcher/index.html');

    // 如果是从悬浮窗返回，自动跳到宠物列表
    if (autoShowPetList) {
        launcherWindow.webContents.on('did-finish-load', () => {
            launcherWindow.webContents.send('auto-show-pet-list');
        });
    }

    launcherWindow.on('closed', () => {
        launcherWindow = null;
    });

    return launcherWindow;
}

// ========== 悬浮窗 ==========
let floatingWindow = null;

function createFloating() {
    if (floatingWindow) {
        floatingWindow.show();
        return floatingWindow;
    }

    floatingWindow = new BrowserWindow({
        width: 200,
        height: 200,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    floatingWindow.loadFile('./src/renderer/floating/index.html');

    floatingWindow.on('closed', () => {
        floatingWindow = null;
    });

    return floatingWindow;
}

// ========== 聊天窗口 ==========
let chatWindow = null;

function createChatWindow(petInfo) {
    if (chatWindow && !chatWindow.isDestroyed()) {
        // 复用已有窗口，只发送新宠物信息（不销毁重建，避免 WebSocket 断连）
        chatWindow.show();
        chatWindow.focus();
        chatWindow.webContents.send('set-pet-info', petInfo);
        return chatWindow;
    }

    chatWindow = new BrowserWindow({
        width: 450,
        height: 600,
        minWidth: 450,
        minHeight: 500,
        frame: false,
        transparent: true,
        resizable: true,
        minimizable: true,
        skipTaskbar: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    chatWindow.loadFile('./src/renderer/chat/index.html');

    // 传递宠物信息到聊天窗口
    chatWindow.webContents.on('did-finish-load', () => {
        if (petInfo) {
            chatWindow.webContents.send('set-pet-info', petInfo);
        }
    });

    chatWindow.on('closed', () => {
        // 防止旧窗口的 closed 事件清空新窗口引用（竞态保护）
        if (chatWindow === this) {
            chatWindow = null;
        }
    });

    return chatWindow;
}

// ========== 暴露方法给渲染进程 ==========
const { ipcMain } = require('electron');

ipcMain.on('close-launcher', () => {
    if (launcherWindow) {
        launcherWindow.close();
        launcherWindow = null;
    }
});

ipcMain.on('minimize-launcher', () => {
    if (launcherWindow) {
        launcherWindow.minimize();
    }
});

ipcMain.on('open-floating', () => {
    createFloating();
});

ipcMain.on('open-launcher', () => {
    // 关闭悬浮窗，重新打开启动器并自动显示宠物列表
    if (floatingWindow) {
        floatingWindow.close();
        floatingWindow = null;
    }
    // 同时关闭聊天窗口，防止旧 WebSocket 连接残留
    if (chatWindow) {
        chatWindow.close();
        chatWindow = null;
    }
    createLauncher(true);
});

ipcMain.on('open-chat', (event, petInfo) => {
    createChatWindow(petInfo);
});

ipcMain.on('minimize-chat', () => {
    if (chatWindow) {
        chatWindow.minimize();
    }
});

// ========== 应用生命周期 ==========
app.whenReady().then(() => {
    createLauncher();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});