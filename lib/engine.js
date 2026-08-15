'use strict';
// DSH 引擎管理：home 目录准备、数据迁移、插件拷贝、启动/停止
const { spawn, spawnSync, execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
  if (app.isPackaged) return path.join(process.resourcesPath, 'engine');
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

function copyTree(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (process.platform === 'win32') {
    try {
      const r = spawnSync('robocopy', [src, dst, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS'], { stdio: 'ignore', windowsHide: true });
      if (r.status !== null && r.status < 8) return;
    } catch (e) { /* fall through to cpSync */ }
  }
  fs.cpSync(src, dst, { recursive: true, force: true });
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
  ensureHome: ensureHome,
  startEngine: startEngine,
  killEngine: killEngine,
};
