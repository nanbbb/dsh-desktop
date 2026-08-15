'use strict';
// 把 engine 目录内容打成 dsh-engine-<版本>.zip（供发布与引擎更新通道）
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const engineDir = path.join(__dirname, '..', 'engine');
const version = JSON.parse(fs.readFileSync(path.join(engineDir, 'package.json'), 'utf8')).version;
const distDir = path.join(__dirname, '..', 'dist');
fs.mkdirSync(distDir, { recursive: true });
const out = path.join(distDir, 'dsh-engine-' + version + '.zip');

for (const junk of ['test-home', '.old', 'node_modules/.cache']) {
  const p = path.join(engineDir, junk);
  if (fs.existsSync(p)) { console.log('清理 ' + junk); fs.rmSync(p, { recursive: true, force: true }); }
}

const output = fs.createWriteStream(out);
const archive = archiver('zip', { zlib: { level: 9 } });
output.on('close', function () { console.log('engine zip: ' + out + ' (' + (archive.pointer() / 1048576).toFixed(1) + ' MB)'); });
archive.on('error', function (e) { throw e; });
archive.pipe(output);
archive.directory(engineDir, false);
archive.finalize();
