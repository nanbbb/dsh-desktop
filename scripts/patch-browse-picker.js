'use strict';
// 给 browse 目录选择器加盘符列表（否则默认 C 盘、换盘要手动输路径）。幂等：已打补丁则跳过。
const fs = require('fs');
const path = require('path');

function patchBrowsePicker(engineDir) {
  const f = path.join(engineDir, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-browse', 'lib', 'index.js');
  if (!fs.existsSync(f)) { console.log('  (browse picker 不存在，跳过盘符补丁)'); return; }
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('listWindowsDrives')) { console.log('  (browse picker 盘符补丁已存在，跳过)'); return; }

  s = s.replace(
    'import { mkdir, opendir, stat } from "node:fs/promises";',
    'import { existsSync } from "node:fs";\nimport { mkdir, opendir, stat } from "node:fs/promises";'
  );

  const helper = 'function listWindowsDrives() {\n\tconst drives = [];\n\tfor (let code = 65; code <= 90; code++) {\n\t\tconst letter = String.fromCharCode(code);\n\t\tconst root = letter + ":\\\\";\n\t\ttry { if (existsSync(root)) drives.push({ name: letter + ":", path: root, hidden: false }); } catch {}\n\t}\n\treturn drives;\n}\n';
  s = s.replace(
    '/** The `ctx.directoryPicker` browse implementation (stable capability object per service life). */',
    helper + '/** The `ctx.directoryPicker` browse implementation (stable capability object per service life). */'
  );

  s = s.replace(
    '\tasync list(path, signal) {\n\t\tconst home = homedir();\n\t\tif (path !== void 0 && !fullyQualified(path))',
    '\tasync list(path, signal) {\n\t\tconst home = homedir();\n\t\tif (path === void 0 && process.platform === "win32") {\n\t\t\treturn { path: "", home, crumbs: [], entries: listWindowsDrives(), truncated: false };\n\t\t}\n\t\tif (path !== void 0 && !fullyQualified(path))'
  );

  s = s.replace(
    '\t\treturn {\n\t\t\tpath: target,',
    '\t\tif (process.platform === "win32" && /^[A-Za-z]:\\\\$/.test(target)) {\n\t\t\tconst seen = new Set(entries.map((entry) => entry.path.toLowerCase()));\n\t\t\tfor (const drive of listWindowsDrives()) {\n\t\t\t\tif (drive.path.toLowerCase() !== target.toLowerCase() && !seen.has(drive.path.toLowerCase())) entries.unshift(drive);\n\t\t\t}\n\t\t}\n\t\treturn {\n\t\t\tpath: target,'
  );

  fs.writeFileSync(f, s);
  console.log('  (browse picker 盘符补丁已应用)');
}

module.exports = { patchBrowsePicker };
