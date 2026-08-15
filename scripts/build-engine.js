'use strict';
// 把 engine 目录内容打成 zip：release/dsh-engine-<版本>.zip（发布用）+ release/dsh-engine.zip（打包进安装器）
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const engineDir = path.join(__dirname, '..', 'engine');
const version = JSON.parse(fs.readFileSync(path.join(engineDir, 'package.json'), 'utf8')).version;
const releaseDir = path.join(__dirname, '..', 'release');
fs.mkdirSync(releaseDir, { recursive: true });
const out = path.join(releaseDir, 'dsh-engine-' + version + '.zip');

for (const junk of ['test-home', '.old', 'node_modules/.cache']) {
  const p = path.join(engineDir, junk);
  if (fs.existsSync(p)) { console.log('清理 ' + junk); fs.rmSync(p, { recursive: true, force: true }); }
}

const output = fs.createWriteStream(out);
const archive = archiver('zip', { zlib: { level: 9 } });
output.on('close', function () {
  const bundled = path.join(releaseDir, 'dsh-engine.zip');
  fs.copyFileSync(out, bundled);
  console.log('engine zip: ' + out + ' (' + (archive.pointer() / 1048576).toFixed(1) + ' MB)');
  console.log('bundled copy: ' + bundled);
});
archive.on('error', function (e) { throw e; });
archive.pipe(output);
archive.directory(engineDir, false);
archive.finalize();
