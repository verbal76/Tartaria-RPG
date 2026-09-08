/**
 * OTA-1756 — THE CARD IS MEASURED, NOT ASSUMED.
 *
 * Owner, after four passes that each moved the watermark and each landed wrong:
 * *"explain to me in great detail exactly how you calculated where to place
 * them? they look nothing like your mock-ups."*
 *
 * ⚠⚠⚠ THE ANSWER WAS THAT NOTHING HAD EVER BEEN MEASURED. Placement ran through
 *     K = 100 x (cardWidth / cardHeight) x boxWidthFraction
 * evaluated on "a 340dp card, ~58dp collapsed, ~200dp expanded" — three numbers
 * typed from memory. The real card is 375 x 55 collapsed and 375 x 143.5
 * expanded on a 411dp phone; both figures below are read out of the running
 * app. And when OTA-1754 changed the box width from 76% to 62%, the constant
 * DERIVED from that width was left at its old value, still carrying a comment
 * describing the geometry that had just been deleted.
 *
 * ⚠⚠⚠ AND THE MOCK-UPS COULD NOT HAVE CAUGHT IT. They were drawn at 595x101.5
 * and 595x350 — exactly 340/58 and 340/200, the same assumed ratios the code
 * used. Two artifacts sharing one unverified input cannot disagree. That is the
 * failure this suite exists to make impossible to repeat: EVERY number here is
 * either measured from a source asset or derived from a card box supplied at
 * test time, and none of them is a device.
 *
 * ⚠⚠ WHAT IS ASSERTED IS THE PROPERTY, NOT THE ARITHMETIC. "The artwork's focus
 * lands on the composition's target" is checked by re-deriving where the focus
 * ended up from the returned box — never by recomputing the formula and
 * comparing it with itself. A test that restates the implementation passes for
 * exactly as long as the implementation is self-consistent, which the last four
 * passes proved is no time at all.
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
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));


import React from 'react';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { TitleScreen } from '../app/screens/TitleScreen';
import { crestArt, crestAspect, crestFactionIds, type CrestArt } from '../app/engine/factionCrests';
import {
  placeCrestField, landedFocus, visibleFraction,
  type CardBox, type FieldComposition,
} from '../app/ui/crestField';
import type { SlotSummary } from '../app/engine/saveSystem';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

jest.setTimeout(240000);
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');
const FIELD = read('app', 'ui', 'crestField.ts');

/* ⚠⚠ HOST NODES ONLY — RN's `View` is a composite that forwards props to a host
 * `View`, so a naive findAll returns everything twice. */
const hosts = (t: { root: { findAll(p: (n: TestNode) => boolean): TestNode[] } }, p: (n: TestNode) => boolean) =>
  t.root.findAll((n) => typeof n.type === 'string' && p(n));
const flat = (s: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const walk = (x: unknown) => {
    if (!x) return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') Object.assign(out, x as Record<string, unknown>);
  };
  walk(s);
  return out;
};
const textOf = (n: TestNode): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestNode | null)?.children ? walk((x as TestNode).children) : '');
  return walk(n.children);
};
const flush = async () => { await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

/** The compositions the screen ships, read out of the source so a change to the
 *  approved treatment fails here rather than drifting silently. */
function shippedComposition(name: 'TILE_FIELD' | 'OPEN_FIELD'): FieldComposition {
  const m = new RegExp(`const ${name}: FieldComposition = \\{([^}]*)\\}`).exec(TITLE);
  expect(m).not.toBeNull();
  const num = (k: string) => {
    const v = new RegExp(`${k}:\\s*([0-9.]+)`).exec(m![1]!);
    expect(v).not.toBeNull();
    return Number(v![1]);
  };
  return { coverage: num('coverage'), focusAtX: num('focusAtX'), focusAtY: num('focusAtY') };
}
const TILE = shippedComposition('TILE_FIELD');
const OPEN = shippedComposition('OPEN_FIELD');

/** Card boxes to sweep. Deliberately NOT one device: the whole defect was a
 *  single assumed shape. The extremes are the real ones — 320dp is the
 *  narrowest supported phone, 600 is CONTENT_MAX_WIDTH, and the heights span a
 *  measured collapsed tile (55) up to the tallest dead card (200+). */
const WIDTHS = [320, 360, 393, 411, 428, 600];
const HEIGHTS = [40, 45.1, 55, 88, 143.5, 200.2, 300];
const ART_IDS = crestFactionIds();
const artOf = (id: string): CrestArt => {
  const a = crestArt(id);
  expect(a).toBeDefined();
  return a!;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ═══ 1. THE MEASURED BOX DRIVES EVERYTHING ═══════════════════════════════════
describe('placement is a function of the MEASURED card and nothing else', () => {
  test('⚠⚠⚠ the artwork\'s focus lands on the composition\'s target — every faction, both states, every size', () => {
    for (const id of ART_IDS) {
      const art = artOf(id);
      for (const comp of [TILE, OPEN]) {
        for (const width of WIDTHS) {
          for (const height of HEIGHTS) {
            const card: CardBox = { width, height };
            const p = placeCrestField(card, art, comp)!;
            expect(p).not.toBeNull();
            const got = landedFocus(card, art, p);
            // ⚠ Re-derived from the RETURNED box, not recomputed from the
            // formula — otherwise this only proves the code equals itself.
            expect(near(got.x, comp.focusAtX)).toBe(true);
            expect(near(got.y, comp.focusAtY)).toBe(true);
          }
        }
      }
    }
  });

  test('nothing is placed until the card has been measured', () => {
    const art = artOf('mud_monarchs');
    expect(placeCrestField({ width: 0, height: 0 }, art, TILE)).toBeNull();
    expect(placeCrestField({ width: 375, height: 0 }, art, TILE)).toBeNull();
    expect(placeCrestField({ width: 0, height: 55 }, art, TILE)).toBeNull();
    // ⚠ A guessed position that corrects itself one frame later is exactly the
    // flash this design refuses; `null` means the Image is not rendered at all.
  });

  test('a different measured box gives a proportionally different placement', () => {
    const art = artOf('true_tartarians');
    const a = placeCrestField({ width: 300, height: 50 }, art, TILE)!;
    const b = placeCrestField({ width: 600, height: 100 }, art, TILE)!;
    for (const k of ['left', 'top', 'width', 'height'] as const) {
      expect(near(b[k], a[k] * 2, 1e-9)).toBe(true);
    }
  });

  test('the rendered box always carries the SOURCE canvas aspect, never a stored one', () => {
    for (const id of ART_IDS) {
      const art = artOf(id);
      const p = placeCrestField({ width: 411, height: 143.5 }, art, OPEN)!;
      expect(near(p.height / p.width, art.srcH / art.srcW, 1e-9)).toBe(true);
      expect(near(crestAspect(art), art.srcH / art.srcW, 1e-12)).toBe(true);
    }
  });
});

// ═══ 2. THE VISIBLE ARTWORK, NOT THE IMAGE ELEMENT ═══════════════════════════
describe('the emblem occupies the intended part of the card', () => {
  test('it is a right-hand column that never touches either rim, on every width', () => {
    for (const id of ART_IDS) {
      const art = artOf(id);
      for (const [comp, band] of [[TILE, 'tile'], [OPEN, 'record']] as const) {
        for (const width of WIDTHS) {
          // A card short enough that the bleed floor is inert — the normal case.
          const card = { width, height: comp === TILE ? 55 : 143.5 };
          const p = placeCrestField(card, art, comp)!;
          expect(p.left).toBeGreaterThan(0);                       // starts on the card
          expect(p.left + p.width).toBeLessThanOrEqual(card.width); // ends on the card
          // and it really is on the RIGHT — its centre is past the middle.
          expect((p.left + p.width / 2) / card.width).toBeGreaterThan(0.55);
          expect(band.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('⚠ it always BLEEDS off the top and the bottom — a watermark, never a placed logo', () => {
    /* This is the failure the owner would have seen next: on the tallest card
     * the roster can build (dead + dog + golem + crash warning, measured at
     * 290x200 in the running app) the requested 62% left a 15dp bare strip and
     * the emblem's top edge became a visible seam. Coverage is a MINIMUM. */
    for (const id of ART_IDS) {
      const art = artOf(id);
      for (const comp of [TILE, OPEN]) {
        for (const width of WIDTHS) {
          for (const height of HEIGHTS) {
            const p = placeCrestField({ width, height }, art, comp)!;
            expect(p.top).toBeLessThanOrEqual(1e-9);
            expect(p.top + p.height).toBeGreaterThanOrEqual(height - 1e-9);
          }
        }
      }
    }
  });

  test('the bleed floor is INERT on every card a live character can make', () => {
    // If it were engaging routinely it would be silently overriding the
    // approved coverage instead of rescuing an edge case.
    for (const id of ART_IDS) {
      const art = artOf(id);
      const tile = placeCrestField({ width: 375, height: 55 }, art, TILE)!;
      expect(near(tile.width, TILE.coverage * 375, 1e-9)).toBe(true);
      const rec = placeCrestField({ width: 375, height: 143.5 }, art, OPEN)!;
      expect(near(rec.width, OPEN.coverage * 375, 1e-9)).toBe(true);
    }
  });

  test('and where it DOES engage, the enlargement stays modest', () => {
    // Bounded so that art with a pathological focus fails CI rather than
    // producing an emblem many times the card.
    let worst = 1;
    for (const id of ART_IDS) {
      const art = artOf(id);
      for (const comp of [TILE, OPEN]) {
        for (const width of WIDTHS) {
          for (const height of HEIGHTS) {
            const p = placeCrestField({ width, height }, art, comp)!;
            worst = Math.max(worst, p.width / (comp.coverage * width));
          }
        }
      }
    }
    expect(worst).toBeGreaterThan(1);      // it does engage somewhere in the sweep
    expect(worst).toBeLessThan(3);
  });

  test('the collapsed tile clears the owner\'s one-third floor at every width', () => {
    // Owner: *"the design should cover at least 1/3 of the tile."*
    for (const width of WIDTHS) {
      const card = { width, height: 55 };
      for (const id of ART_IDS) {
        const p = placeCrestField(card, artOf(id), TILE)!;
        expect(p.width / card.width).toBeGreaterThanOrEqual(1 / 3);
        // and the column is full-bleed vertically, so it covers >= 1/3 of the
        // tile's AREA as well as its width.
        expect(visibleFraction(card, p)).toBeGreaterThan(0);
      }
    }
  });
});

// ═══ 3. EXTREME AND DEGENERATE ART ═══════════════════════════════════════════
describe('extreme focus values stay finite and stay covered', () => {
  const synth = (focusX: number, focusY: number, srcW = 1000, srcH = 1200): CrestArt =>
    ({ srcW, srcH, focusX, focusY });

  test('⚠ artwork focused hard at the top or the bottom still covers the card', () => {
    for (const fy of [0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98]) {
      for (const comp of [TILE, OPEN]) {
        const card = { width: 375, height: 143.5 };
        const p = placeCrestField(card, synth(0.5, fy), comp)!;
        expect(Number.isFinite(p.top)).toBe(true);
        expect(Number.isFinite(p.height)).toBe(true);
        expect(p.top).toBeLessThanOrEqual(1e-9);
        expect(p.top + p.height).toBeGreaterThanOrEqual(card.height - 1e-9);
        expect(near(landedFocus(card, synth(0.5, fy), p).y, comp.focusAtY)).toBe(true);
      }
    }
  });

  test('a focus at the very edge of the file cannot produce NaN or Infinity', () => {
    for (const fy of [0, 1, -0.5, 1.5]) {
      const p = placeCrestField({ width: 375, height: 143.5 }, synth(0.5, fy), OPEN)!;
      for (const v of [p.left, p.top, p.width, p.height]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  test('an off-centre focusX moves the column, and by exactly the offset', () => {
    // No crest ships off-centre (all nine measure 0.497-0.505), but the
    // arithmetic must be right for one that does rather than needing a case.
    const card = { width: 375, height: 55 };
    const centred = placeCrestField(card, synth(0.5, 0.45), TILE)!;
    const offset = placeCrestField(card, synth(0.7, 0.45), TILE)!;
    expect(near(offset.left, centred.left - 0.2 * centred.width, 1e-9)).toBe(true);
    expect(near(landedFocus(card, synth(0.7, 0.45), offset).x, TILE.focusAtX)).toBe(true);
  });

  test('art with no measured canvas is refused rather than guessed', () => {
    expect(placeCrestField({ width: 375, height: 55 }, synth(0.5, 0.45, 0, 1200), TILE)).toBeNull();
    expect(placeCrestField({ width: 375, height: 55 }, synth(0.5, 0.45, 1000, 0), TILE)).toBeNull();
    expect(crestArt('no_such_faction')).toBeUndefined();
    expect(crestArt(undefined)).toBeUndefined();
  });
});

// ═══ 4. THE TABLE IS THE ASSETS ══════════════════════════════════════════════
function pngSize(file: string) {
  const b = readFileSync(join(ROOT, 'assets', 'crests', file));
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('the measured art facts match the files they describe', () => {
  test('⚠⚠ every recorded canvas is the REAL PNG header, exactly', () => {
    for (const id of ART_IDS) {
      const art = artOf(id);
      const { w, h } = pngSize(`${id}.png`);
      expect([art.srcW, art.srcH]).toEqual([w, h]);
    }
  });

  test('every crest has art, and no stranger does', () => {
    const files = readdirSync(join(ROOT, 'assets', 'crests'))
      .filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();
    expect(ART_IDS.slice().sort()).toEqual(files);
  });

  test('focus values are interior fractions, never a placeholder', () => {
    for (const id of ART_IDS) {
      const { focusX, focusY } = artOf(id);
      for (const v of [focusX, focusY]) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
      }
      // exactly 0.5 on both axes would mean nobody measured anything
      expect(focusX === 0.5 && focusY === 0.5).toBe(false);
    }
  });

  test('⚠⚠⚠ the finding that survived re-measurement: every emblem sits ABOVE centre', () => {
    for (const id of ART_IDS) expect(artOf(id).focusY).toBeLessThan(0.5);
  });

  test('⚠⚠ and the finding that ENDED the per-faction horizontal guesswork', () => {
    // All nine are horizontally symmetric. This is why no crest needs a
    // hand-tuned x offset — and it is worth pinning, because the previous pass
    // spent three OTAs moving the column sideways looking for one.
    for (const id of ART_IDS) {
      expect(Math.abs(artOf(id).focusX - 0.5)).toBeLessThan(0.02);
    }
  });

  test('the harness that produced the table ships with it', () => {
    /* ⚠ A measurement whose harness lives in an untracked scratchpad cannot be
     * redone, which makes the table unmaintainable the first time art changes.
     * ⚠ The first cut of this test asserted the harness NAMED each faction —
     * demanding it hard-code the very list it is supposed to discover. It reads
     * the crest directory instead, which is why that assertion is gone. */
    const h = read('scripts', 'measure-crest-art.py');
    expect(h).toContain('assets');
    expect(h).toContain('crests');
    expect(h).toMatch(/def measure\(/);
    expect(h.toLowerCase()).toContain('alpha');
    // ⚠ and it must not reintroduce the luminance threshold that biased the
    // OTA-1753 table upward by as much as 0.061 on true_tartarians.
    /* ⚠⚠⚠ GRADE THE CODE, NOT THE PROSE. This assertion first read
     * `expect(h).not.toMatch(/luminance - 0.18/)` against the WHOLE FILE — and
     * failed, because the harness's docstring quotes the old formula in order
     * to explain why it was abandoned. That is the third time in this file's
     * history that an assertion on bare text has graded the comment describing
     * the fix. Slice to the executable body first, every time. */
    const body = h.slice(h.indexOf('def measure('), h.indexOf('def main('));
    expect(body).not.toMatch(/0\.18/);
    expect(body).not.toMatch(/GROUND/);
    expect(body).toMatch(/a\s*\/\s*255/);      // weighted by alpha
    expect(body).toMatch(/299|0\.2126/);       // ...times luminance
    // it emits the table in the shape the engine declares
    expect(h).toContain('srcW');
    expect(h).toContain('focusX');
  });
});

// ═══ 5. THE SCREEN ACTUALLY MEASURES ═════════════════════════════════════════
const mounted: Array<{ unmount(): void }> = [];
afterEach(async () => {
  while (mounted.length) {
    const t = mounted.pop()!;
    // eslint-disable-next-line no-await-in-loop
    await renderer.act(async () => { try { t.unmount(); } catch { /* gone */ } });
  }
});

const slot = (over: Partial<SlotSummary> = {}): SlotSummary => ({
  slotId: 'slot-a', playerName: 'Cheddar Bob', raceId: getRaces()[0]!.id,
  locationId: 'ashen_hollow', hp: 22, hpMax: 30,
  savedAt: Date.now() - 60_000, createdAt: Date.now() - 600_000,
  factionId: getFactions()[0]!.id, ...over,
} as SlotSummary);

async function mountTitle(slots: SlotSummary[]) {
  useGameStore.setState({ slots, crashedSlotIds: [], otaBootResolved: true, cognitiveStatus: 'ready' } as never);
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<TitleScreen />); });
  await flush();
  useGameStore.setState({ slots, otaBootResolved: true, cognitiveStatus: 'ready' } as never);
  await flush();
  mounted.push(tree);
  return tree;
}
async function expandRow(tree: ReturnType<typeof renderer.create>, name: string) {
  const row = tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(name))[0];
  expect(row).toBeDefined();
  await renderer.act(async () => { (row!.props.onPress as () => void)(); });
  await flush();
}
/** The clips that report their own size — the whole mechanism, in one query. */
const clipsOf = (tree: ReturnType<typeof renderer.create>) =>
  hosts(tree, (n) => typeof n.props.onLayout === 'function' && n.props.pointerEvents === 'none');
/** Tell the screen how big its cards are, the way the layout engine would. */
async function measureAll(tree: ReturnType<typeof renderer.create>, box: CardBox) {
  const clips = clipsOf(tree);
  await renderer.act(async () => {
    for (const c of clips) {
      (c.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 0, ...box } } });
    }
  });
  await flush();
}
const fieldsOf = (tree: ReturnType<typeof renderer.create>) =>
  hosts(tree, (n) => n.props.source !== undefined && Number(flat(n.props.style).opacity ?? 1) < 0.5);

describe('the screen measures its own cards and places from that', () => {
  test('⚠⚠⚠ no measurement, no emblem', async () => {
    const tree = await mountTitle([slot({ factionId: 'mud_monarchs' } as Partial<SlotSummary>)]);
    expect(clipsOf(tree).length).toBeGreaterThan(0);   // the clip is mounted...
    expect(fieldsOf(tree)).toHaveLength(0);            // ...and empty until measured
  });

  test('a measured card produces a placed emblem, in real pixels', async () => {
    const tree = await mountTitle([slot({ factionId: 'stone_builders' } as Partial<SlotSummary>)]);
    await measureAll(tree, { width: 375, height: 55 });
    const fields = fieldsOf(tree);
    expect(fields.length).toBeGreaterThan(0);
    const s = flat(fields[0]!.props.style);
    for (const k of ['left', 'top', 'width', 'height']) {
      expect(typeof s[k]).toBe('number');               // ⚠ never a percentage string
    }
    const art = artOf('stone_builders');
    const card = { width: 375, height: 55 };
    const place = { left: s.left as number, top: s.top as number, width: s.width as number, height: s.height as number };
    expect(near(landedFocus(card, art, place).x, TILE.focusAtX, 1e-6)).toBe(true);
    expect(near(landedFocus(card, art, place).y, TILE.focusAtY, 1e-6)).toBe(true);
  });

  test('the SAME card measured differently moves the emblem — both states', async () => {
    for (const [name, expand] of [['collapsed', false], ['expanded', true]] as const) {
      // eslint-disable-next-line no-await-in-loop
      const tree = await mountTitle([slot({ playerName: 'Great Scott', factionId: 'tartarian_revivalists' } as Partial<SlotSummary>)]);
      // eslint-disable-next-line no-await-in-loop
      if (expand) await expandRow(tree, 'Great Scott');
      const comp = expand ? OPEN : TILE;
      const seen: number[] = [];
      for (const width of [320, 411, 600]) {
        const card = { width, height: expand ? 143.5 : 55 };
        // eslint-disable-next-line no-await-in-loop
        await measureAll(tree, card);
        const s = flat(fieldsOf(tree)[0]!.props.style);
        expect(s.width).toBeCloseTo(comp.coverage * width, 6);
        const place = { left: s.left as number, top: s.top as number, width: s.width as number, height: s.height as number };
        expect(landedFocus(card, artOf('tartarian_revivalists'), place).x).toBeCloseTo(comp.focusAtX, 6);
        seen.push(s.width as number);
      }
      expect(new Set(seen).size).toBe(3);   // it genuinely tracked the box
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test('re-reporting the SAME box does not re-render the row', async () => {
    // OTA-1739 fought to keep this FlatList quiet; measurement must cost one
    // render on mount and nothing on any scroll or recycle afterwards.
    const tree = await mountTitle([slot({ factionId: 'forgotten_order' } as Partial<SlotSummary>)]);
    await measureAll(tree, { width: 375, height: 55 });
    const before = flat(fieldsOf(tree)[0]!.props.style);
    await measureAll(tree, { width: 375, height: 55 });
    const after = flat(fieldsOf(tree)[0]!.props.style);
    expect(after).toEqual(before);
  });
});

// ═══ 6. THE OLD SYSTEM IS GONE, AND THE TREATMENT IS NOT ═════════════════════
describe('the assumed-ratio machinery is deleted, and only that', () => {
  test('⚠⚠⚠ every constant the owner named is gone from the screen', () => {
    /* ⚠ ASSERT THE DECLARATION, NOT THE BARE NAME. The first cut of this test
     * used `not.toContain('TILE_NUDGE_K')` and failed — because the comment
     * that explains the deletion NAMES what it deleted. Grading a bare
     * identifier grades the prose about the fix, which is the exact mistake
     * this file's neighbours have made twice before. */
    for (const gone of ['TILE_NUDGE_K', 'OPEN_NUDGE_K', 'TILE_SPREAD', 'OPEN_SPREAD']) {
      expect(TITLE).not.toMatch(new RegExp(`const\\s+${gone}\\s*=`));
    }
    expect(TITLE).not.toMatch(/function\s+fieldNudge/);
    expect(TITLE).not.toMatch(/\bFIELD_STYLES\s*[[=]/);
    // and nothing still CALLS the deleted machinery
    expect(TITLE).not.toMatch(/fieldNudge\s*\(/);
  });

  test('⚠⚠ and so are the three numbers they were derived from', () => {
    // The comment that carried them read "42% of a 340dp card, over a ~58dp
    // collapsed tile". No reference device may survive anywhere in the
    // placement path — not in the screen, not in the module.
    const placement = TITLE.slice(TITLE.indexOf('TILE_FIELD'), TITLE.indexOf('export function TitleScreen'));
    expect(placement).not.toMatch(/\b340dp\b/);
    expect(placement).not.toMatch(/\b58dp\b/);
    expect(placement).not.toMatch(/\b200dp\b/);
    expect(FIELD).not.toMatch(/const\s+\w*(WIDTH|HEIGHT|CARD|DEVICE|PIXEL)\w*\s*=\s*\d/i);
  });

  test('no percentage insets remain on either field style', () => {
    for (const name of ['dossierField', 'dossierFieldCompact']) {
      const m = new RegExp(`\\n  ${name}: \\{[^}]*\\}`).exec(TITLE);
      expect(m).not.toBeNull();
      expect(m![0]).not.toMatch(/'-?\d+%'/);
    }
  });

  test('⚠ THE APPROVED TREATMENT IS UNTOUCHED — this pass was geometry only', () => {
    // Owner: *"Do NOT change opacity, saturation, darkness, artwork, card
    // styling, typography, borders, or general visual treatment."*
    expect(TITLE).toMatch(/dossierField: \{ position: 'absolute', opacity: 0\.2 \}/);
    expect(TITLE).toMatch(/dossierFieldCompact: \{ position: 'absolute', opacity: 0\.22 \}/);
    expect(TITLE).toContain('resizeMode="contain"');
    expect(TITLE).toContain('pointerEvents="none"');
  });

  test('⚠ and the approved COLUMN is the same band it shipped as', () => {
    // OTA-1754's right-hand column with a 3% margin, expressed as composition
    // instead of as percentage insets: the tile spans 0.55-0.97 of the card,
    // the record 0.35-0.97. Same picture, arrived at honestly.
    const span = (c: FieldComposition) => [c.focusAtX - c.coverage / 2, c.focusAtX + c.coverage / 2];
    expect(span(TILE)[0]).toBeCloseTo(0.55, 6);
    expect(span(TILE)[1]).toBeCloseTo(0.97, 6);
    expect(span(OPEN)[0]).toBeCloseTo(0.35, 6);
    expect(span(OPEN)[1]).toBeCloseTo(0.97, 6);
    expect(TILE.focusAtY).toBe(0.5);
    expect(OPEN.focusAtY).toBe(0.5);
  });
});
