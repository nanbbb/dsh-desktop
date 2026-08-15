'use strict';
// 双通道更新：引擎(zip 替换) + 壳(electron-updater/NSIS)
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const semver = require('semver');
const extract = require('extract-zip');
const { app, dialog } = require('electron');
const engine = require('./engine');

const REPO_OWNER = 'nanbbb';
const REPO_NAME = 'dsh-desktop';
const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'dsh-desktop';

function httpGetJson(url) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/vnd.github+json' },
    }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        } else reject(new Error('HTTP ' + res.statusCode));
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, function () { req.destroy(new Error('timeout')); });
  });
}

function download(url, dest, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 5) { reject(new Error('重定向过多')); return; }
    const u = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(download(res.headers.location, dest, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', function () { ws.close(function () { resolve(dest); }); });
      ws.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, function () { req.destroy(new Error('下载超时')); });
  });
}

function latestRelease() {
  return httpGetJson(GITHUB_API + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/releases/latest');
}

function engineAsset(release) {
  const assets = (release && release.assets) || [];
  for (const a of assets) {
    const m = /^dsh-engine-(.+)\.zip$/.exec(a.name);
    if (m) return { version: m[1], url: a.browser_download_url };
  }
  return null;
}

async function checkEngineUpdate() {
  const current = engine.engineVersion(app);
  let release;
  try { release = await latestRelease(); } catch (e) {
    console.error('[updater] 获取最新版本失败:', e.message);
    return { updated: false, reason: 'fetch-failed' };
  }
  const target = engineAsset(release);
  if (!target) { console.log('[updater] release 无 dsh-engine-*.zip 资产'); return { updated: false }; }
  if (!semver.valid(target.version)) { console.log('[updater] 引擎版本非法:', target.version); return { updated: false }; }
  if (!semver.gt(target.version, current)) {
    console.log('[updater] 引擎已是最新 (' + current + ' >= ' + target.version + ')');
    return { updated: false };
  }

  const root = engine.engineRoot(app);
  const tmpZip = path.join(os.tmpdir(), 'dsh-engine-' + target.version + '.zip');
  const tmpDir = path.join(os.tmpdir(), 'dsh-engine-' + target.version);
  console.log('[updater] 下载引擎 ' + target.version + ' ...');
  await download(target.url, tmpZip);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await extract(tmpZip, { dir: tmpDir });
  const bin = path.join(tmpDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (!fs.existsSync(bin)) { fs.rmSync(tmpDir, { recursive: true, force: true }); fs.rmSync(tmpZip, { force: true }); throw new Error('引擎包校验失败：缺少 bin.js'); }

  const backup = root + '.old';
  fs.rmSync(backup, { recursive: true, force: true });
  fs.renameSync(root, backup);
  fs.renameSync(tmpDir, root);
  fs.rmSync(backup, { recursive: true, force: true });
  fs.rmSync(tmpZip, { force: true });
  console.log('[updater] 引擎已更新到 ' + target.version);
  return { updated: true, version: target.version };
}

function checkShellUpdate(manual, ui) {
  if (!app.isPackaged) { console.log('[updater] 开发模式，跳过壳更新检查'); return; }
  let autoUpdater;
  try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) {
    console.error('[updater] 无法加载 electron-updater:', e.message);
    if (manual) dialog.showMessageBox({ type: 'error', title: 'DSH Desktop', message: '无法加载更新组件', detail: e.message, buttons: ['好的'] });
    return;
  }

  const win = ui && ui.mainWindow;
  const trayRef = ui && ui.tray;
  function setTitle(text) {
    if (win && !win.isDestroyed()) win.setTitle(text);
    if (trayRef) trayRef.setToolTip('DSH Desktop - ' + text);
  }
  function resetTitle() {
    if (win && !win.isDestroyed()) win.setTitle('DSH Desktop');
    if (trayRef) trayRef.setToolTip('DSH Desktop');
  }
  function info(message, detail) {
    if (manual) dialog.showMessageBox({ type: 'info', title: 'DSH Desktop', message: message, detail: detail || '', buttons: ['好的'] });
  }

  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  if (manual) setTitle('正在检查更新…');

  autoUpdater.on('update-available', function (info) {
    if (manual) {
      setTitle('发现新版本 v' + info.version + '，下载中…');
      info('发现新版本 v' + info.version, '正在后台下载，完成后会提示。');
    }
  });
  autoUpdater.on('update-not-available', function () {
    if (manual) { resetTitle(); info('已是最新版本', '当前已是最新，无需更新。'); }
  });
  autoUpdater.on('download-progress', function (p) {
    if (manual && p && typeof p.percent === 'number') setTitle('下载更新 ' + Math.round(p.percent) + '%');
  });
  autoUpdater.on('update-downloaded', function (info) {
    if (manual) { resetTitle(); info('新版本 v' + info.version + ' 已就绪', '退出应用后将自动安装。'); }
  });
  autoUpdater.on('error', function (e) {
    if (manual) { resetTitle(); info('检查更新失败', e.message); }
  });

  autoUpdater.checkForUpdates().catch(function (e) {
    if (manual) { resetTitle(); info('检查更新失败', e.message); }
  });
}

module.exports = {
  checkEngineUpdate: checkEngineUpdate,
  checkShellUpdate: checkShellUpdate,
};
