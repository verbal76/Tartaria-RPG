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

import { crestArt, crestFactionIds } from '../app/engine/factionCrests';
import { placeCrestField, landedFocus, visibleFraction } from '../app/ui/crestField';

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


/* ⚠⚠⚠ OTA-1756 — THESE CLAIMS ARE NOW ASKED OF THE PLACEMENT, NOT OF A
 * STYLESHEET. Everything below used to be read out of `dossierField` /
 * `dossierFieldCompact` as percentage insets, and converted with a constant
 * calibrated against "a 340dp card, ~58dp collapsed, ~200dp expanded" — three
 * numbers nobody had measured. The percentages are gone. The composition and a
 * MEASURED card box now go to `placeCrestField`, and these tests ask where the
 * emblem actually lands.
 * ⚠ The card boxes below are real: read out of the running app at 411dp and at
 * the 600dp tablet cap. Nothing here depends on their exact values — only on
 * the placement tracking whatever box it is handed. */
const MEASURED_TILE = { width: 375, height: 55 };
const MEASURED_RECORD = { width: 375, height: 143.5 };
const TABLET_TILE = { width: 564, height: 55 };
const TILE_COMP = { coverage: 0.42, focusAtX: 0.76, focusAtY: 0.5 };
const OPEN_COMP = { coverage: 0.62, focusAtX: 0.66, focusAtY: 0.5 };
const placeTile = (id: string, card = MEASURED_TILE) => placeCrestField(card, crestArt(id)!, TILE_COMP)!;
const placeRecord = (id: string, card = MEASURED_RECORD) => placeCrestField(card, crestArt(id)!, OPEN_COMP)!;
const EVERY_CREST = crestFactionIds();

describe('the owner\'s three corrections, as measurements', () => {
  test('⚠⚠⚠ it covers at least a THIRD of the tile — every crest, phone and tablet', () => {
    // Owner: *"the design should cover at least 1/3 of the tile."* Asked of the
    // placement on a MEASURED card, at both ends of the supported width range.
    for (const card of [MEASURED_TILE, TABLET_TILE, { width: 320 - 34, height: 45.1 }]) {
      for (const id of EVERY_CREST) {
        const p = placeTile(id, card);
        expect(p.width / card.width).toBeGreaterThanOrEqual(1 / 3);
        // full-bleed vertically, so the width fraction IS the area fraction
        expect(p.top).toBeLessThanOrEqual(0);
        expect(p.top + p.height).toBeGreaterThanOrEqual(card.height);
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

  test('⚠⚠⚠ SUPERSEDED — "a third of the EMBLEM shows" was an artifact of the assumed card', () => {
    /* ⚠⚠⚠ THIS TEST WAS TRUE ONLY OF A CARD THAT DOES NOT EXIST. It asserted
     * that a third of the emblem's own HEIGHT falls inside the tile, computed
     * against the assumed 340x58 card: 58 / (0.42 x 340 x 1.2) = 0.338. On the
     * REAL tile — 375 x 55, measured in the running app — the same arithmetic
     * gives 55 / 189 = 0.291 for the tall crests. The claim was never about the
     * design; it was about the wrong denominator.
     * ⚠ THE OWNER'S ACTUAL FLOOR IS ABOUT THE TILE, NOT THE EMBLEM ("cover at
     * least 1/3 of the tile"), and that is asserted above and holds at 42%.
     * What is pinned here instead is the thing the splinter test was really
     * for: the emblem must never collapse to a sliver again. */
    for (const id of EVERY_CREST) {
      const seen = visibleFraction(MEASURED_TILE, placeTile(id));
      expect(seen).toBeGreaterThan(0.25);   // the OTA-1747 splinter was 0.19
      expect(seen).toBeLessThan(0.6);       // and it is still a fragment, not a logo
    }
  });

  test('its whole WIDTH sits inside the tile, so none of it is lost off the edge', () => {
    for (const card of [MEASURED_TILE, TABLET_TILE]) {
      for (const id of EVERY_CREST) {
        const p = placeTile(id, card);
        expect(p.left).toBeGreaterThan(0);
        expect(p.left + p.width).toBeLessThanOrEqual(card.width);
      }
    }
  });

  test('it is still cropped by the tile, top and bottom', () => {
    for (const id of EVERY_CREST) {
      const p = placeTile(id);
      expect(p.top).toBeLessThan(0);
      expect(p.top + p.height).toBeGreaterThan(MEASURED_TILE.height);
    }
  });

  test('⚠⚠ RETIRED — there is no fit axis to stay on any more', () => {
    /* The emblem used to be sized by letting `contain` pick an axis inside a
     * box built from percentage insets, so "which axis wins" was a real
     * question with a real failure mode (at OTA-1747's box the tall crests fit
     * by height and the square ones by width, so the drawn size changed with
     * the faction). OTA-1756 gives the image an explicit pixel width and a
     * height derived from the SOURCE CANVAS, so there is nothing left to
     * choose. What that property was protecting — a deterministic drawn size —
     * is now true by construction, and this asserts it directly. */
    for (const id of EVERY_CREST) {
      const art = crestArt(id)!;
      const p = placeTile(id);
      expect(p.height / p.width).toBeCloseTo(art.srcH / art.srcW, 9);
      expect(p.width).toBeCloseTo(TILE_COMP.coverage * MEASURED_TILE.width, 9);
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

  test('the expanded card keeps the COMPOSITION the owner approved', () => {
    // Both states in one right-hand column with a 3% margin (OTA-1754).
    for (const id of EVERY_CREST) {
      const t = placeTile(id);
      const r = placeRecord(id);
      expect((t.left + t.width) / MEASURED_TILE.width).toBeCloseTo(0.97, 2);
      expect((r.left + r.width) / MEASURED_RECORD.width).toBeCloseTo(0.97, 2);
      expect(landedFocus(MEASURED_RECORD, crestArt(id)!, r).y).toBeCloseTo(0.5, 9);
    }
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1750-a-third-of-the-tile-not-a-splinter'");
  });
});
