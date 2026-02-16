const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 980,
        minHeight: 680,
        backgroundColor: "#0a0a12",
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // In production, load built files; in dev, load from Vite dev server
    const distIndex = path.join(__dirname, "..", "dist", "index.html");
    if (fs.existsSync(distIndex)) {
        win.loadFile(distIndex);
    } else {
        win.loadURL("http://localhost:5173");
    }
}

app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
