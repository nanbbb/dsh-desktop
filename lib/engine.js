'use strict';
// DSH 引擎管理：home 目录准备、数据迁移、插件拷贝、启动/停止
const { spawn, spawnSync, execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const extract = require('extract-zip');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3080;

function getConfig() {
  return {
    host: process.env.DSH_WEB_HOST || DEFAULT_HOST,
    port: parseInt(process.env.DSH_WEB_PORT, 10) || DEFAULT_PORT,
  };
}

function serverUrl() {
  const c = getConfig();
  return 'http://' + c.host + ':' + c.port + '/';
}

function isServerUp(host, port, timeoutMs) {
  timeoutMs = timeoutMs || 800;
  return new Promise(function (resolve) {
    const req = http.get({ host: host, port: port, path: '/', timeout: timeoutMs }, function (res) {
      res.resume();
      resolve(true);
    });
    req.on('error', function () { resolve(false); });
    req.on('timeout', function () { req.destroy(); resolve(false); });
  });
}

async function waitForServer(host, port, timeoutMs) {
  timeoutMs = timeoutMs || 30000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerUp(host, port, 500)) return true;
    await new Promise(function (r) { setTimeout(r, 400); });
  }
  return false;
}

function engineRoot(app) {
  if (app.isPackaged) return path.join(app.getPath('userData'), 'engine');
  return path.join(__dirname, '..', 'engine');
}

function homeDir(app) {
  return path.join(app.getPath('userData'), 'home');
}

function engineVersion(app) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(engineRoot(app), 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

// 首次运行：把捆绑的 dsh-engine.zip 解压到可写的引擎目录
async function ensureEngine(app) {
  if (!app.isPackaged) return;
  const root = engineRoot(app);
  if (fs.existsSync(path.join(root, 'package.json'))) return;
  const bundled = path.join(process.resourcesPath, 'dsh-engine.zip');
  if (!fs.existsSync(bundled)) throw new Error('未找到捆绑的引擎包 dsh-engine.zip');
  const tmp = root + '.extract';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  await extract(bundled, { dir: tmp });
  const bin = path.join(tmp, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (!fs.existsSync(bin)) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error('捆绑引擎校验失败：缺少 bin.js'); }
  fs.renameSync(tmp, root);
  console.log('[engine] 已解压捆绑引擎到 ' + root);
}

function copyTree(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  // dereference: 展开符号链接/junction，拷贝真实内容（避免保留指向 ~/.dsh 的绝对链接）
  fs.cpSync(src, dst, { recursive: true, force: true, dereference: true });
}

function copyIfMissing(src, dst) {
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dst)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) copyTree(src, dst);
  else fs.copyFileSync(src, dst);
}

function legacyHomeCandidates() {
  const out = [];
  if (process.env.DSH_HOME) out.push(process.env.DSH_HOME);
  out.push(path.join(os.homedir(), '.dsh'));
  return out;
}

function pickLegacyHome() {
  for (const c of legacyHomeCandidates()) {
    if (c && fs.existsSync(c) && fs.existsSync(path.join(c, 'settings.yaml'))) return c;
  }
  for (const c of legacyHomeCandidates()) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function ensureHome(app) {
  const root = engineRoot(app);
  const home = homeDir(app);
  const profileTemplate = path.join(root, 'profile');
  const pluginsSrc = path.join(root, 'plugins');
  const homeProfile = path.join(home, 'profiles', 'web');
  const pluginsDst = path.join(homeProfile, 'node_modules');
  const version = engineVersion(app);
  const versionMark = path.join(home, '.engine-version');

  // 1) profile 配置（cordis.yml / package.json / cordis.patch.yml 等）
  fs.mkdirSync(homeProfile, { recursive: true });
  for (const f of ['cordis.yml', 'cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
    copyIfMissing(path.join(profileTemplate, f), path.join(homeProfile, f));
  }

  // 2) 插件：作为实体文件放进 profile 的 node_modules（首次运行或引擎版本变化时拷贝）
  let needPlugins = false;
  try { needPlugins = fs.readFileSync(versionMark, 'utf8').trim() !== version; } catch (e) { needPlugins = true; }
  if (needPlugins && fs.existsSync(pluginsSrc)) {
    if (fs.existsSync(pluginsDst)) fs.rmSync(pluginsDst, { recursive: true, force: true });
    copyTree(pluginsSrc, pluginsDst);
    fs.writeFileSync(versionMark, version);
  }

  // 3) 首次运行：从旧 ~/.dsh 迁移用户数据
  const migrated = path.join(home, '.migrated');
  if (!fs.existsSync(migrated)) {
    const legacy = pickLegacyHome();
    if (legacy) {
      for (const f of ['settings.yaml', '.credentials.yaml', '.anonymous-user-id', 'pet.json']) {
        copyIfMissing(path.join(legacy, f), path.join(home, f));
      }
      for (const d of ['sessions', 'memory', 'attachments', 'storages', '.agent-presets']) {
        copyIfMissing(path.join(legacy, d), path.join(home, d));
      }
      const legacyPatch = path.join(legacy, 'profiles', 'web', 'cordis.patch.yml');
      if (fs.existsSync(legacyPatch)) {
        fs.copyFileSync(legacyPatch, path.join(homeProfile, 'cordis.patch.yml'));
      }
    }
    fs.writeFileSync(migrated, new Date().toISOString());
  }

  return home;
}

function startEngine(app, opts) {
  const root = engineRoot(app);
  const home = homeDir(app);
  const dshBin = path.join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  const args = [dshBin, '--profile', 'web', '--host', opts.host, '--port', String(opts.port)];
  const env = Object.assign({}, process.env, {
    ELECTRON_RUN_AS_NODE: '1',
    DSH_HOME: home,
  });
  const child = spawn(process.execPath, args, {
    env: env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (opts.logStream) {
    child.stdout.pipe(opts.logStream, { end: false });
    child.stderr.pipe(opts.logStream, { end: false });
  }
  child.on('error', function (err) { console.error('[engine] spawn error:', err.message); });
  return child;
}

function killEngine(child) {
  if (!child) return;
  const pid = child.pid;
  if (process.platform === 'win32' && pid) {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], function () {});
  } else {
    try { child.kill(); } catch (e) {}
  }
}

module.exports = {
  DEFAULT_HOST: DEFAULT_HOST,
  DEFAULT_PORT: DEFAULT_PORT,
  getConfig: getConfig,
  serverUrl: serverUrl,
  isServerUp: isServerUp,
  waitForServer: waitForServer,
  engineRoot: engineRoot,
  homeDir: homeDir,
  engineVersion: engineVersion,
  ensureEngine: ensureEngine,
  ensureHome: ensureHome,
  startEngine: startEngine,
  killEngine: killEngine,
};
