'use strict';
// DSH Desktop 主进程：窗口 / 托盘 / 生命周期，引擎由 lib/engine.js 管理
const { app, BrowserWindow, Tray, Menu, dialog, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const engine = require('./lib/engine');
const updater = require('./lib/updater');

const APP_NAME = 'DSH Desktop';

let mainWindow = null;
let tray = null;
let serverProc = null;
let spawnedByUs = false;
let isQuitting = false;
let logStream = null;

function createWindow() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    icon: icon,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d12',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  mainWindow.once('ready-to-show', function () { mainWindow.show(); });
  mainWindow.webContents.setWindowOpenHandler(function (details) {
    if (details.url.indexOf('http') === 0) shell.openExternal(details.url);
    return { action: 'deny' };
  });
  mainWindow.on('close', function (e) {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', function () { mainWindow = null; });
  return mainWindow;
}

function createTray() {
  const raw = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  const icon = raw.isEmpty() ? nativeImage.createEmpty() : raw.resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  const menu = Menu.buildFromTemplate([
    { label: '显示 DSH', click: function () { showWindow(); } },
    { type: 'separator' },
    { label: '检查更新', click: function () { checkUpdates(true); } },
    { type: 'separator' },
    { label: '退出', click: function () { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', function () {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
    else showWindow();
  });
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    if (spawnedByUs || serverProc) navigateToServer();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function navigateToServer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(engine.serverUrl());
  }
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve) {
    const timer = setTimeout(function () { resolve({ timedOut: true }); }, ms);
    promise.then(
      function (value) { clearTimeout(timer); resolve({ value: value }); },
      function (error) { clearTimeout(timer); resolve({ error: error }); }
    );
  });
}

async function boot() {
  // 首次运行：解压捆绑引擎
  try {
    await engine.ensureEngine(app);
  } catch (err) {
    dialog.showErrorBox(APP_NAME, '引擎初始化失败：\n' + (err && err.message ? err.message : String(err)));
    isQuitting = true;
    app.quit();
    return;
  }

  // 引擎更新：在启动引擎前检查并替换（超时/失败不阻塞启动）
  const upd = await withTimeout(updater.checkEngineUpdate(), 12000);
  if (upd.timedOut) console.log('[dsh-desktop] 引擎更新检查超时，跳过');
  else if (upd.error) console.error('[dsh-desktop] 引擎更新检查失败:', upd.error.message);

  let home;
  try {
    home = engine.ensureHome(app);
  } catch (err) {
    dialog.showErrorBox(APP_NAME, '初始化失败：\n' + (err && err.message ? err.message : String(err)));
    isQuitting = true;
    app.quit();
    return;
  }

  const logPath = path.join(app.getPath('userData'), 'dsh-web.log');
  try { logStream = fs.createWriteStream(logPath, { flags: 'a' }); } catch (e) { logStream = null; }

  const cfg = engine.getConfig();
  console.log('[dsh-desktop] DSH_HOME=' + home);
  if (await engine.isServerUp(cfg.host, cfg.port, 1200)) {
    spawnedByUs = false;
    console.log('[dsh-desktop] 复用已有服务 ' + engine.serverUrl());
  } else {
    serverProc = engine.startEngine(app, { host: cfg.host, port: cfg.port, logStream: logStream });
    spawnedByUs = true;
    serverProc.on('exit', function (code, signal) {
      console.log('[dsh-desktop] 引擎退出 code=' + code + ' signal=' + signal);
      serverProc = null;
      spawnedByUs = false;
    });
    const ok = await engine.waitForServer(cfg.host, cfg.port, 45000);
    if (!ok) {
      dialog.showErrorBox(APP_NAME, '无法启动 DSH 服务（' + engine.serverUrl() + '）。\n\n日志：' + logPath);
      isQuitting = true;
      app.quit();
      return;
    }
    console.log('[dsh-desktop] 服务就绪 ' + engine.serverUrl());
  }

  navigateToServer();
  checkUpdates(false);

  // 测试钩子：DSH_DESKTOP_AUTOQUIT_MS 毫秒后优雅退出（验证 will-quit/killEngine）
  if (process.env.DSH_DESKTOP_AUTOQUIT_MS) {
    const ms = parseInt(process.env.DSH_DESKTOP_AUTOQUIT_MS, 10);
    if (ms > 0) setTimeout(function () { isQuitting = true; app.quit(); }, ms);
  }
}

function checkUpdates(manual) {
  updater.checkShellUpdate(manual);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  if (process.platform === 'win32') app.setAppUserModelId('com.deepseek.harness.desktop');

  app.on('second-instance', function () { showWindow(); });

  app.whenReady().then(function () {
    createWindow();
    createTray();
    boot();
  });

  app.on('activate', function () { showWindow(); });
  app.on('window-all-closed', function () {});

  app.on('before-quit', function () { isQuitting = true; });
  app.on('will-quit', function () {
    if (serverProc && spawnedByUs) engine.killEngine(serverProc);
    if (logStream) { try { logStream.end(); } catch (e) {} }
  });
}
