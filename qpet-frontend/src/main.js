const { app, BrowserWindow } = require('electron');
const path = require('path');

function createLauncher() {
    const win = new BrowserWindow({
        width: 420,
        height: 580,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('./src/renderer/launcher/index.html');
}

app.whenReady().then(() => {
    createLauncher();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});