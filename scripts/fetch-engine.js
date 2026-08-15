'use strict';
// 从本机现有安装重建引擎：拷贝 dsh 包 + web 插件 + profile 配置到 engine/
// 用法：node scripts/fetch-engine.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const engineDir = path.join(root, 'engine');
const npmPrefix = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : path.join(os.homedir(), '.npm-global');
const dshSrc = path.join(npmPrefix, 'node_modules', '@deepseek-ai', 'dsh');
const legacyHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profileWeb = path.join(legacyHome, 'profiles', 'web');

function robocopy(src, dst) {
  if (!fs.existsSync(src)) throw new Error('源不存在: ' + src);
  try {
    execFileSync('robocopy', [src, dst, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS'], { stdio: 'ignore', windowsHide: true });
  } catch (e) {
    // robocopy exit < 8 视为成功
    if (e.status === undefined || e.status >= 8) throw e;
  }
}

robocopy(dshSrc, path.join(engineDir, 'node_modules', '@deepseek-ai', 'dsh'));
robocopy(path.join(profileWeb, 'node_modules'), path.join(engineDir, 'plugins'));

fs.mkdirSync(path.join(engineDir, 'profile'), { recursive: true });
for (const f of ['cordis.yml', 'cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
  const s = path.join(profileWeb, f);
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(engineDir, 'profile', f));
}
console.log('engine fetched from local install');
