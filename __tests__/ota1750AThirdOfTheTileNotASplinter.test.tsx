/**
 * OTA-1750 — A THIRD OF THE TILE, NOT A SPLINTER.
 *
 * Owner, on the device, once OTA-1747/1749 finally had every card wearing its
 * own faction: *"the designs are a little fainter than I would like and since
 * some designs are smaller than others they should be shifted to the left so we
 * can see some of the emblem in each one, the design should cover at least 1/3
 * of the tile."*
 *
 * ⚠⚠⚠ HE WAS RIGHT ON ALL THREE, AND OTA-1747 PASSED EVERY ONE OF ITS OWN TESTS
 * WHILE FAILING THEM. That suite only ever asked ONE question — "is the emblem
 * cropped rather than shrunk into a centred logo?" — and a thin invisible
 * splinter answers that question exactly as well as a good composition does. The
 * test was true and the screen was wrong, which is the most useful kind of
 * failure to write down.
 *
 * ⚠⚠ THE ERROR RAN OPPOSITE TO THE INTUITION. The box was 76% of the tile's
 * WIDTH, and `contain` turns that into an emblem 5.3× THE TILE'S HEIGHT — so
 * under a fifth of it ever fell inside the card, and most of its width ran off
 * the right edge. Making the box SMALLER makes the emblem SHORTER and therefore
 * shows MORE of it. Nothing about "bigger" was the answer.
 *
 * So this suite asks the questions that would have caught it, and they are all
 * fractions of the tile rather than properties of the box: how much of the TILE
 * the emblem covers, how much of the EMBLEM is on show, whether its whole width
 * is inside the card, and whether it is still cropped rather than a logo.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
// ⚠ Same reason as OTA-1742: reduce-motion is a real shipped path AND it stops
// RN Animated graphs outliving Jest teardown. The motion paths have their own
// source pins below.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');

/** Style lookup that tries the SINGLE-LINE form first — both fields are
 *  one-liners, and a multi-line pattern would run on into the next block. */
const styleBlock = (name: string) => {
  const one = new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(TITLE);
  if (one) return one[0];
  return new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`).exec(TITLE)?.[0] ?? '';
};
const num = (block: string, prop: string) => {
  const m = new RegExp(`${prop}:\\s*'?(-?\\d+(?:\\.\\d+)?)%?'?`).exec(block);
  return m ? Number(m[1]) : NaN;
};

/* ⚠ THE ARTWORK'S REAL SHAPE, READ FROM THE FILES — the nine crests run 1.00 to
 * 1.20 tall-over-wide (assets/crests/README.md), and "some designs are smaller
 * than others" is exactly that spread. Reading the PNG header rather than
 * hard-coding means replacing a piece of art re-grades the layout. */
function pngSize(f: string) {
  const b = readFileSync(join(ROOT, 'assets', 'crests', f));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const CREST_FILES = readdirSync(join(ROOT, 'assets', 'crests')).filter((f) => f.endsWith('.png'));
const ASPECTS = CREST_FILES.map((f) => { const { w, h } = pngSize(f); return h / w; });

const hexRgb = (h: string): [number, number, number] => {
  const t = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(t.slice(i, i + 2), 16)) as [number, number, number];
};
const lum = (rgb: [number, number, number]) => {
  const f = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * f[0]! + 0.7152 * f[1]! + 0.0722 * f[2]!;
};
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const l1 = lum(a); const l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

/** The collapsed tile's height, computed from the shipped styles: two text rows
 *  inside dossierBody's padding, plus the rim. */
const tileH = () => {
  const line = (fs: number) => Math.round(fs * 1.25);
  const body = styleBlock('dossierBody');
  return num(body, 'paddingVertical') * 2
    + line(num(styleBlock('slotName'), 'fontSize'))
    + line(num(styleBlock('slotObjective'), 'fontSize'))
    + num(styleBlock('slotObjective'), 'marginTop')
    + 2;
};

/** What `contain` actually produces, given the shipped insets and a real crest. */
function rendered(block: string, tileW: number, aspect: number) {
  const boxW = (1 - num(block, 'left') / 100 - num(block, 'right') / 100) * tileW;
  const boxH = (1 + Math.abs(num(block, 'top')) / 100 + Math.abs(num(block, 'bottom')) / 100) * tileH();
  const byWidth = boxH / boxW >= aspect;
  const w = byWidth ? boxW : boxH / aspect;
  return { w, h: w * aspect, byWidth };
}

// The Pixel the owner plays on, and the 600dp tablet cap.
const WIDTHS = [340, 570];

describe('the owner\'s three corrections, as measurements', () => {
  test('⚠⚠⚠ it covers at least a THIRD of the tile — every crest, phone and tablet', () => {
    const block = styleBlock('dossierFieldCompact');
    for (const tileW of WIDTHS) {
      for (const aspect of ASPECTS) {
        expect(rendered(block, tileW, aspect).w / tileW).toBeGreaterThanOrEqual(1 / 3);
      }
    }
  });

  test('⚠⚠ ...and it is the SAME fraction for every crest, which was the other half of the ask', () => {
    /* "since some designs are smaller than others" — fitting by WIDTH makes each
     * emblem exactly as wide as the next whatever its own aspect, so no faction
     * gets a visibly smaller mark than its neighbour. Only the share of its own
     * HEIGHT on show varies, which is the artwork's business, not the layout's. */
    const block = styleBlock('dossierFieldCompact');
    for (const tileW of WIDTHS) {
      const widths = new Set(ASPECTS.map((a) => rendered(block, tileW, a).w));
      expect(widths.size).toBe(1);
    }
  });

  test('⚠⚠⚠ a THIRD of the EMBLEM shows — the splinter, pinned so it cannot return', () => {
    /* THE ACTUAL REGRESSION. OTA-1747's box was 76% of the tile wide, which made
     * the emblem 5.3× the tile's height: 19% of it visible, as a diagonal
     * sliver. Smaller box → shorter emblem → more of it on screen. */
    const block = styleBlock('dossierFieldCompact');
    const h = tileH();
    for (const aspect of ASPECTS) {
      const img = rendered(block, 340, aspect);
      expect(h / img.h).toBeGreaterThanOrEqual(0.30);
      // ...and still genuinely cropped, or it becomes the centred logo the
      // original brief ruled out
      expect(img.h / h).toBeGreaterThan(2);
    }
  });

  test('its whole WIDTH sits inside the tile, so none of it is lost off the edge', () => {
    // OTA-1747 ran the emblem 8% past the right edge on top of everything else,
    // which is why "shifted to the left" was part of the ask.
    const block = styleBlock('dossierFieldCompact');
    expect(num(block, 'right')).toBeGreaterThanOrEqual(0);
    expect(num(block, 'left')).toBeGreaterThan(0);
    /* ⚠ OTA-1751 RETIRED THE "CLEAR OF THE NAME COLUMN" HALF OF THIS. It was my
     * caution rather than a measured limit, and the owner asked for the emblem
     * centred on the row — which puts it behind the name. Contrast is now
     * MEASURED at the shipped alpha instead of avoided by layout (see the
     * legibility test below and ota1751). What survives here is the claim that
     * actually protects the composition: it is inset from BOTH edges, so its
     * whole width is on the tile. */
    expect(num(block, 'left') + num(block, 'right')).toBeLessThan(65); // ...but still ≥1/3 wide
  });

  test('it is still cropped by the tile, top and bottom', () => {
    const block = styleBlock('dossierFieldCompact');
    expect(num(block, 'top')).toBeLessThan(0);
    expect(num(block, 'bottom')).toBeLessThan(0);
    expect(styleBlock('dossierFieldClip')).toContain("overflow: 'hidden'");
  });

  test('⚠⚠ the fit stays on the WIDTH axis, which is what makes placement exact', () => {
    // Fitting by width means image width === box width, so there is no centring
    // slack and the emblem lands exactly where the insets say — on any screen.
    const block = styleBlock('dossierFieldCompact');
    for (const tileW of WIDTHS) {
      for (const aspect of ASPECTS) expect(rendered(block, tileW, aspect).byWidth).toBe(true);
    }
  });
});

describe('stronger, and still readable', () => {
  test('both fields were raised on the owner\'s word, and both stay ghosts', () => {
    const a = styleBlock('dossierField');
    const b = styleBlock('dossierFieldCompact');
    expect(num(a, 'opacity')).toBeGreaterThan(0.09);   // was 0.09; "fainter than I would like"
    expect(num(b, 'opacity')).toBeGreaterThan(0.13);
    // bounded, because a roster tile's first job is to be read
    expect(num(a, 'opacity')).toBeLessThanOrEqual(0.28);
    expect(num(b, 'opacity')).toBeLessThanOrEqual(0.22);
  });

  test('⚠⚠ the name still clears 4.5:1 over the brightest part of the artwork', () => {
    /* The tile face composites to roughly (20,19,13) on the owner's green; the
     * crest art runs to about (150,130,90) at its brightest, so this is the
     * worst case the text ever sits on — not the average. */
    const face: [number, number, number] = [20, 19, 13];
    const art: [number, number, number] = [150, 130, 90];
    const op = num(styleBlock('dossierFieldCompact'), 'opacity');
    const lit = [0, 1, 2].map((i) => art[i]! * op + face[i]! * (1 - op)) as [number, number, number];
    expect(contrast(hexRgb('#e6d8b3'), lit)).toBeGreaterThanOrEqual(4.5); // slotName
    expect(contrast(hexRgb('#c9a86a'), lit)).toBeGreaterThanOrEqual(3);   // slotObjective
    expect(contrast(hexRgb('#a2977b'), lit)).toBeGreaterThanOrEqual(3);   // slotTime
  });

  test('the expanded card keeps the GEOMETRY the owner approved', () => {
    // The composition he liked has never moved: same box, same anchor, same
    // bleed off the right. Only the alpha was tuned.
    /* ⚠⚠⚠ WHAT THE OWNER APPROVED WAS THE FRAMING, NOT THE MECHANISM — and
     * pinning all four numbers confused the two. He approved a composition:
     * anchored at 32%, bleeding 8% off the right edge. The vertical spread is
     * not composition, it is the lever that decides WHICH AXIS `contain` fits
     * by, and OTA-1753 had to move it (-18% → -80%) so every crest fits by
     * WIDTH — at -18% the tall crests fit by height and the square ones by
     * width, so the emblem's size changed with the faction and the per-faction
     * focus nudge had nothing stable to nudge.
     * So this pins the framing, which is the promise, and leaves the spread to
     * the pass that owns the fit. */
    /* ⚠⚠⚠ SUPERSEDED BY OTA-1754 — THE TWO CARDS NOW SHARE ONE COLUMN.
     * This pinned the expanded card's framing at left 32% / right −8%, which was
     * VIS-3's composition and correct until the owner asked for the emblem to be
     * a column on the FAR RIGHT of both card states. The record's emblem no
     * longer bleeds past the right border — that detail is gone, deliberately,
     * because it was the reason the tile and the record never looked like the
     * same object. What is pinned now is the thing that replaced it: BOTH cards
     * use the same band, so a character wears its emblem in one place whichever
     * state its card is in. */
    const a = styleBlock('dossierField');
    const c = styleBlock('dossierFieldCompact');
    /* ⚠ THE SHARED THING IS THE EDGE, NOT THE WIDTH — and that is arithmetic,
     * not a compromise. `contain` fits by width, so a box's width IS the
     * emblem's size: 42% of the card makes a fragment on a 58dp tile and a
     * complete logo on a 200dp record. The record takes a wider box to stay a
     * fragment. Anchored to one right edge they read as one column; forced to
     * one width they would not. */
    expect(num(a, 'right')).toBe(num(c, 'right'));
    expect(num(a, 'right')).toBeGreaterThan(0);      // contained, not bleeding
    expect(num(a, 'left')).toBeGreaterThan(0);
    expect(num(a, 'top')).toBe(num(a, 'bottom'));    // still vertically centred
    expect(num(a, 'top')).toBeLessThan(0);           // still cropped by the card

  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1750-a-third-of-the-tile-not-a-splinter'");
  });
});
