import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "public", "icons");

const BG_TOP = [11, 61, 145]; // #0b3d91
const BG_BOTTOM = [24, 87, 196]; // #1857c4
const CHEVRON = [255, 255, 255];
const SUN = [255, 138, 61]; // #ff8a3d

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function roundedRectAlpha(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dist = Math.hypot(x - cx, y - cy);
  return dist <= radius ? 1 : 0;
}

function generateIcon(size, { maskable = false } = {}) {
  const png = new PNG({ width: size, height: size });
  const scale = maskable ? 0.72 : 1; // shrink content into the safe zone for maskable icons
  const cx = size / 2;
  const cy = size / 2;

  const apexX = cx;
  const apexY = lerp(cy, size * 0.74, 1) * scale + cy * (1 - scale);
  const leftTopX = cx - size * 0.28 * scale;
  const leftTopY = size * 0.28 * scale + cy * (1 - scale);
  const rightTopX = cx + size * 0.28 * scale;
  const rightTopY = leftTopY;
  const strokeWidth = size * 0.16 * scale;

  const sunCx = cx + size * 0.28 * scale;
  const sunCy = cy - size * 0.26 * scale;
  const sunR = size * 0.07 * scale;

  const cornerRadius = size * 0.18;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const t = y / size;
      const bg = [
        Math.round(lerp(BG_TOP[0], BG_BOTTOM[0], t)),
        Math.round(lerp(BG_TOP[1], BG_BOTTOM[1], t)),
        Math.round(lerp(BG_TOP[2], BG_BOTTOM[2], t)),
      ];

      const alpha = maskable ? 1 : roundedRectAlpha(x, y, size, cornerRadius);
      let r = bg[0];
      let g = bg[1];
      let b = bg[2];

      const distToChevron = Math.min(
        distanceToSegment(x, y, leftTopX, leftTopY, apexX, apexY),
        distanceToSegment(x, y, apexX, apexY, rightTopX, rightTopY),
      );
      if (distToChevron <= strokeWidth / 2) {
        [r, g, b] = CHEVRON;
      }

      if (Math.hypot(x - sunCx, y - sunCy) <= sunR) {
        [r, g, b] = SUN;
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = Math.round(255 * alpha);
    }
  }

  return png;
}

function writeIcon(name, size, options) {
  const png = generateIcon(size, options);
  const buffer = PNG.sync.write(png);
  writeFileSync(path.join(outDir, name), buffer);
  console.log(`wrote ${name}`);
}

writeIcon("icon-192.png", 192);
writeIcon("icon-512.png", 512);
writeIcon("maskable-icon-192.png", 192, { maskable: true });
writeIcon("maskable-icon-512.png", 512, { maskable: true });
writeIcon("apple-touch-icon.png", 180, { maskable: true });
