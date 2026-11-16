// Reads a PNG from art/ (8-bit RGBA, as the generator writes them) far
// enough to say where its visible pixels are, so a test can ask whether what
// is drawn of a picture, not its transparent margin, stays inside the scene.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { ART } from "./world.mjs";

const cache = new Map();

// { w, h, top, bottom, left, right }: the picture's size and the first and
// last rows and columns with any pixel not fully transparent (in its own px).
export function opaqueBounds(file) {
  if (cache.has(file)) return cache.get(file);
  const d = readFileSync(join(ART, file));
  let i = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  const idat = [];
  while (i < d.length) {
    const n = d.readUInt32BE(i);
    const t = d.toString("ascii", i + 4, i + 8);
    const c = d.subarray(i + 8, i + 8 + n);
    if (t === "IHDR") [w, h, type] = [c.readUInt32BE(0), c.readUInt32BE(4), c[9]];
    if (t === "IDAT") idat.push(c);
    i += 12 + n;
  }
  if (type !== 6) throw new Error(`${file}: not RGBA`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  let prev = new Uint8Array(stride);
  const b = { w, h, top: -1, bottom: -1, left: w, right: -1 };
  for (let y = 0, o = 0; y < h; y++) {
    const f = raw[o++];
    const line = new Uint8Array(raw.subarray(o, o + stride));
    o += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0;
      const up = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + up) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + up) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(up - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + up - 2 * c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255;
      }
    }
    for (let x = 0; x < w; x++)
      if (line[x * 4 + 3]) {
        if (b.top < 0) b.top = y;
        b.bottom = y;
        b.left = Math.min(b.left, x);
        b.right = Math.max(b.right, x);
      }
    prev = line;
  }
  cache.set(file, b);
  return b;
}
