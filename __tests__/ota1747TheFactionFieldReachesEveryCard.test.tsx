/**
 * OTA-1747 — THE FACTION FIELD REACHES EVERY CARD.
 *
 * OTA-1746 printed a Tartarian's faction art into the EXPANDED record's ground.
 * The owner confirmed that card on the device and asked for the same treatment
 * on EVERY card, each wearing ITS OWN faction's emblem — explicitly NOT one
 * shared watermark, and explicitly NOT the emblem shrunk into a centred
 * background logo.
 *
 * ⚠⚠ SO THE TWO THINGS THIS SUITE ACTUALLY HAS TO PROVE ARE:
 *   1. IDENTITY — every card, in BOTH states, draws THAT character's faction and
 *      no other. Two Tartarians of different factions in one roster must not
 *      share a watermark.
 *   2. GEOMETRY — the collapsed card still gets an OVERSIZED, CROPPED fragment
 *      rather than a small complete logo. That is not a matter of taste: it is
 *      an inequality between the box's aspect and the artwork's, computed here
 *      from the SHIPPED styles and the REAL PNG headers, on a phone and at the
 *      tablet width cap.
 *
 * ⚠ AND THAT THE REFERENCE DID NOT MOVE. The expanded card is the thing being
 * extended; if this pass restyled it, it destroyed what it was asked to copy.
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
import { factionCrest, crestArt, crestFactionIds } from '../app/engine/factionCrests';
import { placeCrestField } from '../app/ui/crestField';
import { FACTION_PLATE_TEST_ID } from '../app/ui/tartariaKit';
import type { SlotSummary } from '../app/engine/saveSystem';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; toJSON(): unknown; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

jest.setTimeout(240000);
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');

/* ⚠⚠⚠ HOST NODES ONLY. RN's `View` is a composite that forwards its props to a
 * host `View`, so a naive `findAll` returns every element TWICE and any count
 * taken off it is double the truth. Every count below goes through `hosts()`. */
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

/** Style block lookup that tries the SINGLE-LINE form first — several of these
 *  styles are one-liners, and a `[\s\S]*?\n  \},` pattern would match one by
 *  running on into the next multi-line block and grading the wrong style. */
const styleBlock = (name: string) => {
  const one = new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(TITLE);
  if (one) return one[0];
  return new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`).exec(TITLE)?.[0] ?? '';
};
const num = (block: string, prop: string) => {
  const m = new RegExp(`${prop}:\\s*'?(-?\\d+(?:\\.\\d+)?)%?'?`).exec(block);
  return m ? Number(m[1]) : NaN;
};

/* ⚠⚠ THE ARTWORK'S REAL SHAPE, READ FROM THE FILES. The crests are not square
 * (assets/crests/README.md: 1145x1374 to 1254x1254, no margin, artwork touching
 * the frame), and the geometry below depends on HOW not-square they are. Reading
 * the PNG IHDR rather than hard-coding the numbers means replacing a piece of
 * art re-grades the layout instead of silently invalidating it. */
function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(join(ROOT, 'assets', 'crests', file));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const CREST_FILES = readdirSync(join(ROOT, 'assets', 'crests')).filter((f) => f.endsWith('.png'));
const ASPECTS = CREST_FILES.map((f) => { const { w, h } = pngSize(f); return h / w; });
/** The tallest-relative-to-wide crest — the worst case for the fit inequality. */
const WORST_ASPECT = Math.max(...ASPECTS);

const mounted: Array<{ unmount(): void }> = [];
afterEach(async () => {
  while (mounted.length) {
    const t = mounted.pop()!;
    // eslint-disable-next-line no-await-in-loop
    await renderer.act(async () => { try { t.unmount(); } catch { /* already gone */ } });
  }
});

const slot = (over: Partial<SlotSummary> = {}): SlotSummary => ({
  slotId: 'slot-a',
  playerName: 'Cheddar Bob',
  raceId: getRaces()[0]!.id,
  locationId: 'ashen_hollow',
  hp: 22,
  hpMax: 30,
  savedAt: Date.now() - 60_000,
  createdAt: Date.now() - 600_000,
  factionId: getFactions()[0]!.id,
  resurrectionGems: 0,
  ...over,
} as SlotSummary);


/* ⚠⚠⚠ OTA-1756 — THE FIELD DOES NOT EXIST UNTIL THE CARD IS MEASURED.
 * Placement now comes from the clip's own `onLayout` instead of percentage
 * insets calibrated against an assumed 340x58 card, so a test that mounts and
 * looks straight away finds a mounted-but-empty clip. Feeding the clips a box
 * is the test's job now, exactly as the layout engine does on a device.
 * ⚠ The numbers are the REAL card, read out of the running app at 411dp:
 * 375x55 collapsed, 375x143.5 expanded. They are measurements, not the kind of
 * assumption this OTA exists to delete — and nothing here depends on their
 * exact values, only on the placement tracking whatever it is told. */
const COLLAPSED_CARD = { width: 375, height: 55 };
const EXPANDED_CARD = { width: 375, height: 143.5 };
async function measureCards(
  tree: ReturnType<typeof renderer.create>,
  box: { width: number; height: number } = COLLAPSED_CARD,
) {
  const clips = tree.root.findAll((n) => typeof n.type === 'string'
    && typeof n.props.onLayout === 'function' && n.props.pointerEvents === 'none');
  await renderer.act(async () => {
    for (const c of clips) {
      (c.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 0, ...box } } });
    }
  });
  await flush();
}

async function mountTitle(slots: SlotSummary[]) {
  // The boot gate (OTA-405) holds load/create until the OTA check resolves; the
  // screen re-reads the roster on appear (OTA-1294). Open it and put ours back.
  useGameStore.setState({ slots, crashedSlotIds: [], otaBootResolved: true, cognitiveStatus: 'ready' } as never);
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<TitleScreen />); });
  await flush();
  useGameStore.setState({ slots, otaBootResolved: true, cognitiveStatus: 'ready' } as never);
  await flush();
  mounted.push(tree);
  await measureCards(tree);
  return tree;
}
async function expandRow(tree: ReturnType<typeof renderer.create>, name: string) {
  const row = tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(name))[0];
  expect(row).toBeDefined();
  await renderer.act(async () => { (row!.props.onPress as () => void)(); });
  await flush();
  await measureCards(tree, EXPANDED_CARD);
}
/** Every faded field image currently on screen, with its source. */
/* ⚠⚠ A DETECTOR, NOT AN ASSERTION — SO IT IS DELIBERATELY LOOSE. This finds the
 * faded field among the card's images; it must match whatever alpha the design
 * currently uses, not the one it used the day it was written. At 0.2 it stopped
 * matching the moment OTA-1751 raised the field to 0.22, and three suites failed
 * for a tuning change rather than a defect. A predicate that has to be re-tuned
 * alongside the value it looks for is not finding anything — it is restating it.
 * 0.5 is far below any alpha this treatment could take and far above any it
 * would. The BOUNDS on the alpha are asserted where they belong (ota1750/1751). */
const fieldsOf = (tree: ReturnType<typeof renderer.create>) =>
  hosts(tree, (n) => n.props.source !== undefined && Number(flat(n.props.style).opacity ?? 1) < 0.5);

// ═══ 1. IDENTITY — EACH CARD WEARS ITS OWN FACTION ═══════════════════════════
describe('every card is manufactured for its own Tartarian\'s faction', () => {
  test('all nine factions render their OWN emblem when collapsed', async () => {
    for (const id of crestFactionIds()) {
      // eslint-disable-next-line no-await-in-loop
      const tree = await mountTitle([slot({ factionId: id } as Partial<SlotSummary>)]);
      const fields = fieldsOf(tree);
      expect(fields).toHaveLength(1);
      expect(fields[0]!.props.source).toBe(factionCrest(id));
      // eslint-disable-next-line no-await-in-loop
      await renderer.act(async () => { mounted.pop()!.unmount(); });
    }
  });

  test('all nine factions render their OWN emblem when expanded', async () => {
    for (const id of crestFactionIds()) {
      // eslint-disable-next-line no-await-in-loop
      const tree = await mountTitle([slot({ factionId: id } as Partial<SlotSummary>)]);
      // eslint-disable-next-line no-await-in-loop
      await expandRow(tree, 'Cheddar Bob');
      const fields = fieldsOf(tree);
      expect(fields).toHaveLength(1);
      expect(fields[0]!.props.source).toBe(factionCrest(id));
      // eslint-disable-next-line no-await-in-loop
      await renderer.act(async () => { mounted.pop()!.unmount(); });
    }
  });

  test('⚠⚠⚠ a mixed roster does NOT share one watermark', async () => {
    // The brief's own words: "Do not use one generic watermark for every card."
    // Three Tartarians, three factions, one screen, all collapsed.
    const ids = crestFactionIds().slice(0, 3);
    expect(ids).toHaveLength(3);
    const tree = await mountTitle(ids.map((id, i) => slot({
      slotId: `slot-${i}`, playerName: `Tartarian ${i}`, factionId: id,
    } as Partial<SlotSummary>)));
    const sources = fieldsOf(tree).map((n) => n.props.source);
    expect(sources).toHaveLength(3);
    expect(new Set(sources).size).toBe(3);
    expect(sources).toEqual(ids.map((id) => factionCrest(id)));
  });

  test('expanding one card leaves the others wearing their own factions', async () => {
    const ids = crestFactionIds().slice(0, 3);
    const tree = await mountTitle(ids.map((id, i) => slot({
      slotId: `slot-${i}`, playerName: `Tartarian ${i}`, factionId: id,
    } as Partial<SlotSummary>)));
    await expandRow(tree, 'Tartarian 1');
    // still three fields — two collapsed, one expanded — still three factions
    const sources = fieldsOf(tree).map((n) => n.props.source);
    expect(sources).toHaveLength(3);
    expect(new Set(sources).size).toBe(3);
    // and the expanded one additionally carries its riveted seal plate
    expect(hosts(tree, (n) => n.props.testID === FACTION_PLATE_TEST_ID)).toHaveLength(1);
  });

  test('a faction the game ships no art for renders NOTHING — in either state', async () => {
    const tree = await mountTitle([slot({ factionId: 'no_such_faction' } as Partial<SlotSummary>)]);
    expect(fieldsOf(tree)).toHaveLength(0);
    await expandRow(tree, 'Cheddar Bob');
    expect(fieldsOf(tree)).toHaveLength(0);
    expect(hosts(tree, (n) => n.props.testID === FACTION_PLATE_TEST_ID)).toHaveLength(0);
    // ⚠ and no half-drawn Image with an undefined source
    expect(hosts(tree, (n) => n.props.source === undefined && n.props.resizeMode === 'contain')).toHaveLength(0);
  });
});

// ═══ 2. GEOMETRY — OVERSIZED AND CROPPED, NOT A CENTRED LOGO ═════════════════
describe('the collapsed card gets a cropped fragment, not a shrunken logo', () => {
  /* `contain` scales the emblem until the FIRST axis runs out. The crests are
   * taller than they are wide, so the treatment only reads as an oversized
   * fragment when the box runs out of WIDTH first:
   *     box_h / box_w  >=  art_h / art_w
   * If that flips, `contain` fits by height instead and drops a small COMPLETE
   * logo in the middle of the card — the exact outcome the brief rules out. */
  const fitsByWidth = (block: string, cardW: number, cardH: number) => {
    const boxW = (1 + (-num(block, 'right')) / 100 - num(block, 'left') / 100) * cardW;
    const boxH = (1 + (-num(block, 'top')) / 100 + (-num(block, 'bottom')) / 100) * cardH;
    return { boxW, boxH, ok: boxH / boxW >= WORST_ASPECT };
  };

  /** The collapsed card's height, computed from the shipped styles rather than
   *  guessed: two text rows inside dossierBody's padding, plus the rim. */
  const collapsedCardHeight = () => {
    const line = (fs: number) => Math.round(fs * 1.25); // RN's default leading
    const body = styleBlock('dossierBody');
    const pad = num(body, 'paddingVertical') * 2;
    const nameRow = line(num(styleBlock('slotName'), 'fontSize'));
    const second = line(num(styleBlock('slotObjective'), 'fontSize')) + num(styleBlock('slotObjective'), 'marginTop');
    return pad + nameRow + second + 2; // +2 = the rim's own border
  };

  test('the compact emblem is OVERSIZED against the tile — a fragment, not a logo', () => {
    /* ⚠⚠⚠ OTA-1756 — "FITS BY WIDTH" WAS A PROPERTY OF THE OLD MECHANISM, AND
     * THE MECHANISM IS GONE. The emblem used to be sized by letting `contain`
     * choose an axis inside a box defined with percentage insets, so which axis
     * won was a real question with a real failure mode. The image is now given
     * an explicit pixel width and a height derived from the SOURCE CANVAS, so
     * the fit axis is not a question any more — it is arithmetic.
     * What survives is the claim that mattered: the emblem is far taller than
     * the card, so what shows is a cropped fragment. Measured against the REAL
     * card, not the assumed 340x58 this test used to pass in. */
    const card = { width: 375, height: 55 };
    for (const id of crestFactionIds()) {
      const art = crestArt(id)!;
      const p = placeCrestField(card, art, { coverage: 0.42, focusAtX: 0.76, focusAtY: 0.5 })!;
      expect(p.height / p.width).toBeCloseTo(art.srcH / art.srcW, 9);
      expect(p.height).toBeGreaterThan(card.height * 2.5);
    }
    expect(WORST_ASPECT).toBeGreaterThan(1); // the art really is taller than wide
  });
  test('...and at the 600dp tablet cap, where the card is wider and the emblem taller still', () => {
    // CONTENT_MAX_WIDTH is 600 on native; the card is that minus the chrome.
    // The measured card at that cap is 564 wide (read out of the running app).
    const card = { width: 564, height: 55 };
    for (const id of crestFactionIds()) {
      const p = placeCrestField(card, crestArt(id)!, { coverage: 0.42, focusAtX: 0.76, focusAtY: 0.5 })!;
      expect(p.height).toBeGreaterThan(card.height * 4);
      expect(p.left + p.width).toBeLessThanOrEqual(card.width);
    }
  });
  test('the EXPANDED emblem is oversized too — the reference behaves the same way', () => {
    const card = { width: 375, height: 143.5 };
    for (const id of crestFactionIds()) {
      const p = placeCrestField(card, crestArt(id)!, { coverage: 0.62, focusAtX: 0.66, focusAtY: 0.5 })!;
      expect(p.height).toBeGreaterThan(card.height * 1.5);
      expect(p.top).toBeLessThan(0);
    }
  });
  test('⚠ the naive reuse WOULD have failed — which is why `compact` exists', () => {
    // Proof that the second style is load-bearing rather than decoration: the
    // expanded percentages, applied to a collapsed card, fit by HEIGHT and
    // produce the centred mini-logo the brief rules out.
    const { ok } = fitsByWidth(styleBlock('dossierField'), 340, collapsedCardHeight());
    expect(ok).toBe(false);
  });

});

// ═══ 3. THE REFERENCE DID NOT MOVE ═══════════════════════════════════════════
describe('the Cheddar Bob card is the reference, so it is byte-identical', () => {
  test('the expanded field keeps the COMPOSITION the owner approved', () => {
    /* ⚠⚠⚠ THIS TEST HAS BEEN REWRITTEN THREE TIMES TO CHASE THE
     * IMPLEMENTATION, AND THAT IS THE FINDING. It pinned four percentage
     * numbers (VIS-3), then a "framing" of two of them (OTA-1753), then a
     * shared right edge (OTA-1754) — each time because the numbers it pinned
     * were an artifact of a mechanism rather than a statement about the
     * picture. It now asks the only durable question: WHERE DOES THE EMBLEM
     * LAND ON A MEASURED CARD?
     * The approved composition is OTA-1754's: both states in a right-hand
     * column with a 3% margin, the tile spanning 0.55-0.97 of the card and the
     * record 0.35-0.97, both vertically centred on the artwork's own focus. */
    const W = 375;
    const band = (h: number, comp: { coverage: number; focusAtX: number; focusAtY: number }): [number, number] => {
      const p = placeCrestField({ width: W, height: h }, crestArt('mud_monarchs')!, comp)!;
      return [p.left / W, (p.left + p.width) / W];
    };
    const tile = band(55, { coverage: 0.42, focusAtX: 0.76, focusAtY: 0.5 });
    const rec = band(143.5, { coverage: 0.62, focusAtX: 0.66, focusAtY: 0.5 });
    expect(tile[0]).toBeCloseTo(0.55, 2);
    expect(rec[0]).toBeCloseTo(0.35, 2);
    // ⚠ THE SHARED THING IS THE RIGHT EDGE, not the width. `coverage` sets the
    // emblem's size, so 42% makes a fragment on a 55dp tile and would make a
    // near-complete logo on a 143dp record; the record takes the wider column
    // to stay a fragment. Anchored to one edge they read as one column.
    expect(tile[1]).toBeCloseTo(rec[1], 2);
    expect(tile[1]).toBeCloseTo(0.97, 2);
  });

  test('the expanded card still carries BOTH the seal plate and the field, one decode', async () => {
    const tree = await mountTitle([slot()]);
    await expandRow(tree, 'Cheddar Bob');
    const crest = factionCrest(getFactions()[0]!.id);
    const drawn = hosts(tree, (n) => n.props.source === crest);
    expect(drawn).toHaveLength(2);            // riveted plate + field
    expect(new Set(drawn.map((n) => n.props.source)).size).toBe(1); // one cache entry
  });

  test('nothing else about either card changed', () => {
    // Dimensions, typography, borders, spacing and hierarchy are all out of
    // scope for this pass; these are the values a "while I'm in here" edit
    // would have moved.
    expect(styleBlock('dossierBody')).toContain('paddingVertical: 9, paddingLeft: 14, paddingRight: 12');
    expect(styleBlock('slotName')).toContain("color: '#e6d8b3', fontSize: 16, fontWeight: '700'");
    expect(styleBlock('dossierFace')).toContain('borderRadius: 3');
    expect(styleBlock('dossierSeal')).toContain('marginLeft: 10, marginTop: -13, marginRight: -13');
    expect(TITLE).toContain('<TFactionPlate source={crest} size={96} />');
  });
});

// ═══ 4. ONE IMPLEMENTATION, AND IT STAYS BEHIND THE CONTENT ══════════════════
describe('one generalised treatment, not a second unrelated effect', () => {
  test('both states go through the SAME component', () => {
    expect(TITLE).toContain('function DossierField(');
    expect((TITLE.match(/<DossierField/g) ?? []).length).toBe(2);   // collapsed + expanded
    expect((TITLE.match(/styles\.dossierFieldClip/g) ?? []).length).toBe(1);
    /* the faction lookup happens ONCE per row, above the branch.
     * ⚠ WHICH FIELD it reads is not this suite's business — OTA-1749 changed it
     * from the summary's optional `factionId` to a helper that also recovers the
     * id from `characterSeed`, because older saves have no faction recorded at
     * all. The claim here is only that there is exactly ONE lookup serving both
     * card states, which is what makes this one treatment rather than two. */
    expect((TITLE.match(/const crest = factionCrest\(/g) ?? []).length).toBe(1);
  });

  test('it sits behind everything the card draws', async () => {
    // Source order: the field is the first child of the face in BOTH branches,
    // ahead of the spine, the registration corners and the body.
    // ⚠ Anchored on the component, not on its full prop list — OTA-1753 added
    // `factionId` and an exact-string anchor would have failed for that alone.
    for (const anchor of ['<DossierField crest={crest} factionId=']) {
      const at = TITLE.indexOf(anchor);
      expect(at).toBeGreaterThan(-1);
      const spineAt = TITLE.indexOf('styles.spine', at);
      const bodyAt = TITLE.indexOf('styles.dossierBody', at);
      expect(spineAt).toBeGreaterThan(at);
      expect(bodyAt).toBeGreaterThan(at);
    }
    // and it is inert to touch, so it cannot eat the tap or the swipe
    const tree = await mountTitle([slot()]);
    // ⚠ This test is about LAYERING. It used to re-assert the alpha here too,
    // with a bound pinned just above the day's value — so tuning the design
    // failed a test about z-order. The alpha's bounds live with the contrast
    // arithmetic that justifies them (ota1750/1751); what belongs here is that
    // the field is present, faded, and cannot take a touch.
    expect(fieldsOf(tree).length).toBeGreaterThan(0);
    // ⚠ OTA-1756 added `onLayout` to this element; the anchor allows for it
    // rather than pinning the exact prop list, which is how the previous
    // version of this line broke when `factionId` was added.
    expect(TITLE).toMatch(/<View style=\{styles\.dossierFieldClip\} pointerEvents="none"/);
  });

  test('the artwork itself is untouched, and never stretched', () => {
    // assets/crests/README.md: none of the nine are square, so every consumer
    // must let the aspect fall out of the file.
    expect(TITLE).toContain('resizeMode="contain"');
    expect(TITLE).not.toContain('resizeMode="stretch"');
    expect(TITLE).not.toContain('resizeMode="cover"');
    expect(CREST_FILES).toHaveLength(9);
    expect(crestFactionIds().length).toBe(9);
  });

  test('⚠⚠⚠ it costs ONE measurement and one piece of state — and nothing else', () => {
    /* ⚠⚠⚠ SUPERSEDED BY OTA-1756, AND THE OLD CLAIM WAS THE PROBLEM.
     * This used to assert `not.toMatch(/useState|onLayout|.../)` — "it costs no
     * measurement" — and it passed for four OTAs while the watermark was placed
     * from a constant calibrated against a card nobody had ever measured. The
     * cheapness this defended was exactly what made the geometry wrong, and
     * "measuring is a layout pass per row, for a decoration" was the argument I
     * used to avoid fixing it. The owner overruled it, correctly.
     * So the claim is inverted, and BOUNDED: one useState, one onLayout, and
     * still no timer, no animation, no ref and no subscription. The roster is a
     * handful of rows and the state only changes when the box genuinely
     * changes, so OTA-1739's quiet FlatList is intact — that is asserted by
     * ota1756's "re-reporting the SAME box does not re-render the row". */
    const at = TITLE.indexOf('function DossierField(');
    expect(at).toBeGreaterThan(-1);
    const fn = TITLE.slice(at, TITLE.indexOf('\nexport function TitleScreen', at));
    expect((fn.match(/useState/g) ?? []).length).toBe(1);
    expect((fn.match(/useCallback/g) ?? []).length).toBe(1);
    // ⚠ the handler is WIRED, asked as a fact rather than as an occurrence
    // count — counting `onLayout` mentions grades a variable name.
    expect(fn).toMatch(/onLayout=\{onLayout\}/);
    expect(fn).not.toMatch(/useEffect|useRef|setInterval|setTimeout|Animated|subscribe/);
    expect((fn.match(/<Image/g) ?? []).length).toBe(1);
  });});

// ═══ 5. THE CARD STILL WORKS ═════════════════════════════════════════════════
describe('the two-stage tap contract survives', () => {
  test('collapsed shows the summary; the first tap opens the full record', async () => {
    const tree = await mountTitle([slot()]);
    const all = () => tree.root.findAll(() => true).map(textOf).join('\n');
    expect(all()).toContain('Cheddar Bob');
    expect(all()).not.toContain('ENTER TARTARIA');
    await expandRow(tree, 'Cheddar Bob');
    expect(all()).toContain('ENTER TARTARIA');
  });

  test('a dead Tartarian still gets the field and still gets the resurrection door', async () => {
    const tree = await mountTitle([slot({ dead: true } as Partial<SlotSummary>)]);
    expect(fieldsOf(tree)).toHaveLength(1);
    await expandRow(tree, 'Cheddar Bob');
    const all = tree.root.findAll(() => true).map(textOf).join('\n');
    expect(all).toContain('RESURRECT THIS TARTARIAN');
    expect(all).not.toContain('ENTER TARTARIA');
    expect(fieldsOf(tree)).toHaveLength(1);
  });

  test('this pass has a stamp of its own, live or superseded', () => {
    /* ⚠ DURABLE CLAIM, NOT A ONE-RELEASE PIN — and I made this exact mistake
     * twice. Asserting OTA_BUILD_ID *equals* this pass's stamp is true for
     * exactly one release; OTA-1748 superseded it hours later and the suite went
     * red for no defect at all. The house rule is one OTA, one stamp, with the
     * previous preserved on a `// SUPERSEDED:` line — so what is worth holding
     * is that this pass's stamp EXISTS in the ledger, live or superseded. */
    const BUILD = read('app', 'buildInfo.ts');
    expect(BUILD).toContain("'2026-09-08-1747-the-faction-field-reaches-every-card'");
  });
});
