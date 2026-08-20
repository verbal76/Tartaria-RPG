// ⚠⚠ Generates the downscaled art the corner mini-map renders.
//
// WHY THERE IS A SECOND COPY OF EVERY MAP. The full-size art is 1254×1254 and
// ~3.4MB on disk, which decodes to roughly 6.3MB of RGBA in memory. That is
// affordable for the Atlas screen, which is transient — you open it, you read
// it, you leave. The mini-map is the opposite: it lives in the exploration
// screen's corner, which is the screen the player never leaves, so whichever
// map it is showing would be resident for the entire session. On a device whose
// signature freeze (B9) was an out-of-memory kill, adding six permanent
// megabytes to the screen the player sits on is not a rounding error.
//
// ⚠ OTA-1365 — 512 → 768. Owner, on the shipped tile: *"it's a little grainy, we
// might need to bump the resolution up a little bit."* He is right, and the
// arithmetic says by how much: the box is ~130pt and the outpost view is drawn
// at 2.5×, so the tile occupies ~325pt — which on the Pixel's 2.4375× density
// is ~792 PHYSICAL pixels. 512 was being stretched half again beyond its own
// resolution, which is exactly the grain. 768 lands at native and no further:
// ~2.25MB decoded, still under half the ~6.0MB the real art would cost, and the
// next step up buys nothing a phone screen can resolve.
//
// ⚠ SIZED FOR THE VIEWPORT, NOT FOR THE WHOLE MAP. The corner tile is a WINDOW:
// the art is drawn LARGER than the box and translated so the player sits at the
// centre, so only the visible slice of it does any work. That is what sets the
// resolution. The right column is `flex: 1` — roughly a 130pt box — and at the
// zooms below the tile is drawn about 950 physical pixels across on a 2.44×
// density screen. 320 would be upscaled threefold and read soft exactly where
// you are trying to make out a room; 512 lands near native.
//
// Clipping saves no memory — the whole decoded bitmap is resident whatever
// fraction of it is on screen — so the resolution is purely a sharpness
// decision, and the memory saving comes entirely from downscaling the SOURCE.
// 512 costs ~1.0MB decoded against ~6.0MB for the real art: six times cheaper
// on the one screen the player never leaves. The Atlas screen still loads the
// full art; nothing about it changes.
//
// Deterministic box-average downscale (no resampling library): every output
// pixel is the mean of the exact input block it covers, alpha-weighted so the
// transparent margins on the marker art do not bleed dark edges. Re-running
// this on unchanged input produces byte-identical output.
//
//   node scripts/make-minimap-assets.mjs
//
// Run it whenever an outpost PNG or the world atlas is redrawn, and commit the
// regenerated tiles alongside the art.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'minimap');
/** Longest edge of a tile. The short edge follows the source's aspect — the
 *  world atlas is 1619×971, and squashing it to a square would put the player
 *  marker in the wrong place, because every position in this game is stored as
 *  a FRACTION of the art and the fraction assumes the original proportions. */
const MAX_EDGE = 768;

/** Every source that can appear in the corner, and the tile it becomes. */
const SOURCES = [
  ['assets/world-atlas.png', 'world.png'],
  ['assets/outposts/reclaimers_guild.png', 'reclaimers_guild.png'],
  ['assets/outposts/mud_monarchs.png', 'mud_monarchs.png'],
  ['assets/outposts/forgotten_order.png', 'forgotten_order.png'],
  ['assets/outposts/true_tartarians.png', 'true_tartarians.png'],
  ['assets/outposts/eternal_dynasty.png', 'eternal_dynasty.png'],
  ['assets/outposts/conspiracy_architects.png', 'conspiracy_architects.png'],
  ['assets/outposts/servants_of_giants.png', 'servants_of_giants.png'],
  ['assets/outposts/stone_builders.png', 'stone_builders.png'],
  ['assets/outposts/tartarian_revivalists.png', 'tartarian_revivalists.png'],
];

/** Box-average `src` down to `w`×`h`. Alpha-weighted so transparent pixels
 *  contribute no colour — averaging RGB through a transparent margin is what
 *  produces the grey halo you see on naive downscales. */
function boxDownscale(src, w, h) {
  const out = new PNG({ width: w, height: h });
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * sh) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * sw) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / w));
      let r = 0, g = 0, b = 0, a = 0, wsum = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sw + sx) << 2;
          const al = src.data[i + 3];
          r += src.data[i] * al;
          g += src.data[i + 1] * al;
          b += src.data[i + 2] * al;
          a += al;
          wsum += al;
          n++;
        }
      }
      const o = (y * w + x) << 2;
      if (wsum === 0) {
        out.data[o] = 0; out.data[o + 1] = 0; out.data[o + 2] = 0; out.data[o + 3] = 0;
      } else {
        out.data[o] = Math.round(r / wsum);
        out.data[o + 1] = Math.round(g / wsum);
        out.data[o + 2] = Math.round(b / wsum);
        out.data[o + 3] = Math.round(a / n);
      }
    }
  }
  return out;
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

let totalIn = 0;
let totalOut = 0;
let maxPx = 0;
for (const [rel, name] of SOURCES) {
  const srcPath = join(ROOT, rel);
  if (!existsSync(srcPath)) {
    console.error(`[minimap] MISSING SOURCE ${rel} — tile not written`);
    process.exitCode = 1;
    continue;
  }
  const raw = readFileSync(srcPath);
  const src = PNG.sync.read(raw);
  const scale = MAX_EDGE / Math.max(src.width, src.height);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const tile = boxDownscale(src, w, h);
  // deflate level 9 so the committed tiles are as small as they can be; the
  // decode cost is unchanged either way.
  const buf = PNG.sync.write(tile, { deflateLevel: 9 });
  writeFileSync(join(OUT_DIR, name), buf);
  totalIn += raw.length;
  totalOut += buf.length;
  maxPx = Math.max(maxPx, w * h);
  console.log(`[minimap] ${rel} ${src.width}×${src.height} `
    + `${(raw.length / 1024 / 1024).toFixed(2)}MB  ->  minimap/${name} `
    + `${w}×${h} ${(buf.length / 1024).toFixed(0)}KB`);
}
console.log(`[minimap] ${SOURCES.length} tiles — `
  + `${(totalIn / 1024 / 1024).toFixed(1)}MB of source becomes `
  + `${(totalOut / 1024).toFixed(0)}KB on disk, `
  + `at most ~${((maxPx * 4) / 1024 / 1024).toFixed(2)}MB decoded `
  + `(vs ~${((1254 * 1254 * 4) / 1024 / 1024).toFixed(2)}MB for the full art).`);
