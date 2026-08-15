// 生成图标：icon.png(256×256) + icon.ico（PNG 内嵌，供快捷方式用）
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 256;
const R = 56; // 圆角半径
const TOP = [91, 124, 250];    // #5b7cfa
const BOTTOM = [47, 79, 216];  // #2f4fd8

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function inRoundedRect(x, y) {
  const x0 = 0, y0 = 0, x1 = SIZE - 1, y1 = SIZE - 1;
  if (x >= x0 + R && x <= x1 - R) return true; // 中间竖条
  if (y >= y0 + R && y <= y1 - R) return true; // 中间横条
  const corners = [[x0 + R, y0 + R], [x1 - R, y0 + R], [x0 + R, y1 - R], [x1 - R, y1 - R]];
  for (const [cx, cy] of corners) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= R * R) return true;
  }
  return false;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// ">_" 提示符字形：一个尖括号 + 下划线光标
const SEGMENTS = [
  // chevron ">"
  { ax: 78, ay: 76, bx: 152, by: 128, th: 26 },
  { ax: 152, ay: 128, bx: 78, by: 180, th: 26 },
  // underscore "_"
  { ax: 102, ay: 188, bx: 174, by: 188, th: 14 },
];

function onGlyph(x, y) {
  for (const s of SEGMENTS) {
    if (distToSegment(x, y, s.ax, s.ay, s.bx, s.by) <= s.th / 2) return true;
  }
  return false;
}

const rgba = Buffer.alloc(SIZE * SIZE * 4, 0);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    if (!inRoundedRect(x, y)) continue;
    const t = y / (SIZE - 1);
    rgba[i] = lerp(TOP[0], BOTTOM[0], t);
    rgba[i + 1] = lerp(TOP[1], BOTTOM[1], t);
    rgba[i + 2] = lerp(TOP[2], BOTTOM[2], t);
    rgba[i + 3] = 255;
    if (onGlyph(x, y)) {
      rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255;
    }
  }
}

// ---- PNG 编码 ----
let crcTable = null;
function makeCrcTable() {
  crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
}
function crc32(buf) {
  if (!crcTable) makeCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const png = encodePNG(SIZE, SIZE, rgba);
fs.writeFileSync(path.join(__dirname, '..', 'icon.png'), png);

// ---- ICO（PNG 内嵌，256 单张）----
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0;        // width 256 => 0
entry[1] = 0;        // height 256 => 0
entry[2] = 0;        // palette
entry[3] = 0;        // reserved
entry.writeUInt16LE(1, 4);   // planes
entry.writeUInt16LE(32, 6);  // bpp
entry.writeUInt32LE(png.length, 8);  // size
entry.writeUInt32LE(22, 12);         // offset
fs.writeFileSync(path.join(__dirname, '..', 'icon.ico'), Buffer.concat([header, entry, png]));

console.log('generated icon.png (' + png.length + ' bytes) and icon.ico');
