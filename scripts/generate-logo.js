const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const sizes = [16, 32, 48, 128];
const outputDir = path.join(__dirname, "..", "icons");

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = crcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function setPixel(data, size, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  const rowStride = size * 4 + 1;
  const index = y * rowStride + 1 + x * 4;
  data[index] = r;
  data[index + 1] = g;
  data[index + 2] = b;
  data[index + 3] = a;
}

function blendPixel(data, size, x, y, rgba) {
  setPixel(data, size, x, y, rgba);
}

function fillRoundedRect(data, size, x, y, width, height, radius, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const dx = Math.min(px - x, x + width - 1 - px);
      const dy = Math.min(py - y, y + height - 1 - py);
      const insideCorner = dx >= radius || dy >= radius;
      const cx = dx - radius;
      const cy = dy - radius;
      if (insideCorner || cx * cx + cy * cy <= radius * radius) {
        blendPixel(data, size, px, py, color);
      }
    }
  }
}

function drawLine(data, size, x0, y0, x1, y1, thickness, color) {
  const half = thickness / 2;
  const minX = Math.floor(Math.min(x0, x1) - thickness);
  const maxX = Math.ceil(Math.max(x0, x1) + thickness);
  const minY = Math.floor(Math.min(y0, y1) - thickness);
  const maxY = Math.ceil(Math.max(y0, y1) + thickness);

  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      let t = 0;
      if (lengthSquared !== 0) {
        t = ((x - x0) * dx + (y - y0) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));
      }
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const distance = Math.hypot(x - px, y - py);
      if (distance <= half) {
        blendPixel(data, size, x, y, color);
      }
    }
  }
}

function addGlow(data, size, color) {
  const centerX = size * 0.34;
  const centerY = size * 0.16;
  const radius = size * 0.55;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      const strength = Math.max(0, 1 - distance / radius);
      if (strength <= 0) {
        continue;
      }
      const alpha = Math.round(color[3] * strength * 0.9);
      blendPixel(data, size, x, y, [color[0], color[1], color[2], alpha]);
    }
  }
}

function createImageData(size) {
  const rowStride = size * 4 + 1;
  const data = Buffer.alloc(rowStride * size);
  for (let y = 0; y < size; y += 1) {
    data[y * rowStride] = 0;
  }

  fillRoundedRect(data, size, 0, 0, size, size, Math.max(3, Math.floor(size * 0.22)), [7, 7, 9, 255]);
  addGlow(data, size, [139, 156, 255, 68]);
  fillRoundedRect(
    data,
    size,
    Math.floor(size * 0.09),
    Math.floor(size * 0.09),
    Math.ceil(size * 0.82),
    Math.ceil(size * 0.82),
    Math.max(2, Math.floor(size * 0.18)),
    [255, 255, 255, 14]
  );

  drawLine(data, size, size * 0.29, size * 0.68, size * 0.49, size * 0.25, Math.max(2, size * 0.1), [255, 255, 255, 255]);
  drawLine(data, size, size * 0.49, size * 0.25, size * 0.59, size * 0.46, Math.max(2, size * 0.1), [255, 255, 255, 255]);
  drawLine(data, size, size * 0.59, size * 0.46, size * 0.71, size * 0.68, Math.max(2, size * 0.1), [255, 255, 255, 255]);
  drawLine(data, size, size * 0.38, size * 0.68, size * 0.62, size * 0.68, Math.max(2, size * 0.09), [139, 156, 255, 255]);

  return data;
}

function makePng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const rawData = createImageData(size);
  const compressed = zlib.deflateSync(rawData);

  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

fs.mkdirSync(outputDir, { recursive: true });

sizes.forEach((size) => {
  const filePath = path.join(outputDir, `icon${size}.png`);
  fs.writeFileSync(filePath, makePng(size));
});

const svg = `
<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="30" fill="#070709"/>
  <rect x="12" y="12" width="104" height="104" rx="24" fill="rgba(255,255,255,0.06)"/>
  <path d="M37 83.5L62 32L73.5 56.1L89 83.5" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M47 83.5H79" stroke="#8B9CFF" stroke-width="10" stroke-linecap="round"/>
</svg>
`.trim();

fs.writeFileSync(path.join(outputDir, "logo.svg"), svg);

console.log(`Generated icons in ${outputDir}`);
