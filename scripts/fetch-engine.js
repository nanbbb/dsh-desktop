'use strict';
// 从本机现有安装重建引擎：dsh 包 + web 插件（展开链接、剔除 pnpm 元数据）+ dsh-plus + profile 配置
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const engineDir = path.join(root, 'engine');
const dshPlusSrc = path.join(root, '..', 'dsh-plus');
const npmPrefix = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : path.join(os.homedir(), '.npm-global');
const dshSrc = path.join(npmPrefix, 'node_modules', '@deepseek-ai', 'dsh');
const legacyHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profileWeb = path.join(legacyHome, 'profiles', 'web');

function cp(src, dst) {
  if (!fs.existsSync(src)) throw new Error('源不存在: ' + src);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true, force: true, dereference: true });
}

// 1) dsh 包
cp(dshSrc, path.join(engineDir, 'node_modules', '@deepseek-ai', 'dsh'));

// 1.5) browse 目录选择器加盘符列表
require('./patch-browse-picker').patchBrowsePicker(engineDir);

// 2) 插件：展开链接 + 剔除 pnpm 元数据
cp(path.join(profileWeb, 'node_modules'), path.join(engineDir, 'plugins'));
for (const junk of ['.modules.yaml', '.pnpm', '.pnpm-workspace-state-v1.json', '.cache']) {
  fs.rmSync(path.join(engineDir, 'plugins', junk), { recursive: true, force: true });
}

// 3) 加入 dsh-plus + 依赖 js-yaml / argparse
cp(dshPlusSrc, path.join(engineDir, 'plugins', 'dsh-plus'));
const dshNm = path.join(engineDir, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules');
cp(path.join(dshNm, 'js-yaml'), path.join(engineDir, 'plugins', 'js-yaml'));
cp(path.join(dshNm, 'argparse'), path.join(engineDir, 'plugins', 'argparse'));

// 4) profile 配置
fs.mkdirSync(path.join(engineDir, 'profile'), { recursive: true });
for (const f of ['cordis.yml', 'cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
  const s = path.join(profileWeb, f);
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(engineDir, 'profile', f));
}

// 5) profile 的 package.json：dsh-plus 只进 bundles、不进 dependencies
const profilePkgPath = path.join(engineDir, 'profile', 'package.json');
if (fs.existsSync(profilePkgPath)) {
  const j = JSON.parse(fs.readFileSync(profilePkgPath, 'utf8'));
  j.dependencies = j.dependencies || {};
  delete j.dependencies['dsh-plus'];
  const bundles = (j.dsh && j.dsh.profile && j.dsh.profile.bundles) || [];
  if (!bundles.includes('dsh-plus')) bundles.push('dsh-plus');
  j.dsh = j.dsh || {};
  j.dsh.profile = j.dsh.profile || {};
  j.dsh.profile.bundles = bundles;
  fs.writeFileSync(profilePkgPath, JSON.stringify(j, null, 2) + '\n');
}

// 6) 引擎版本标记
const version = JSON.parse(fs.readFileSync(path.join(dshSrc, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(engineDir, 'package.json'), JSON.stringify({ name: 'dsh-engine', version, private: true }, null, 2) + '\n');

console.log('engine rebuilt (dsh ' + version + ')');
