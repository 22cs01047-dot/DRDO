/**
 * Electron main p      preload: path.join(__dirname, "preload.cjs"),  // resolves to electron-dist/preload.cjs at runtimeocess — wraps the PLCVS React app as a desktop application.
 */

import { app, BrowserWindow, Menu, ipcMain, dialog } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 720,
    title: "PLCVS — Pre-Launch Checklist Verification System",
    icon: path.join(__dirname, "../public/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    show: false,
    backgroundColor: "#f1f5f9",
  });

  // Load app
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Prevent navigation to external URLs (security)
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== "http://localhost:5173") {
      event.preventDefault();
    }
  });

  buildMenu();
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "PLCVS",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "toggleDevTools" },
        { type: "separator" },
        {
          label: "About PLCVS",
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "About PLCVS",
              message: "Pre-Launch Checklist Verification System",
              detail:
                "Version 1.0.0\nDeveloped for DRDO\nAll models run locally — fully offline capable.",
            });
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── App Lifecycle ───────────────────────────────────────

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Security: prevent new window creation
app.on("web-contents-created", (_, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
});
