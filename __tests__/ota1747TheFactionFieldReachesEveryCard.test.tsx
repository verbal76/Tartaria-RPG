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
import { factionCrest, crestFactionIds } from '../app/engine/factionCrests';
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
  return tree;
}
async function expandRow(tree: ReturnType<typeof renderer.create>, name: string) {
  const row = tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(name))[0];
  expect(row).toBeDefined();
  await renderer.act(async () => { (row!.props.onPress as () => void)(); });
  await flush();
}
/** Every faded field image currently on screen, with its source. */
const fieldsOf = (tree: ReturnType<typeof renderer.create>) =>
  hosts(tree, (n) => n.props.source !== undefined && Number(flat(n.props.style).opacity ?? 1) < 0.2);

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

  test('the compact field fits by WIDTH on a phone — so it is cropped, not centred', () => {
    const { ok, boxW, boxH } = fitsByWidth(styleBlock('dossierFieldCompact'), 340, collapsedCardHeight());
    expect(WORST_ASPECT).toBeGreaterThan(1); // the art really is taller than wide
    expect(ok).toBe(true);
    // and the emblem is genuinely OVERSIZED relative to the card it sits in
    expect(boxH).toBeGreaterThan(collapsedCardHeight() * 4);
    expect(boxW).toBeGreaterThan(0);
  });

  test('...and at the 600dp tablet cap, where the box is wider and needs to be taller still', () => {
    // CONTENT_MAX_WIDTH is 600 on native; the card is that minus the list padding.
    const { ok } = fitsByWidth(styleBlock('dossierFieldCompact'), 570, collapsedCardHeight());
    expect(ok).toBe(true);
  });

  test('the EXPANDED field fits by width too — the reference behaves the same way', () => {
    // an expanded card is roughly four times the collapsed height
    const { ok } = fitsByWidth(styleBlock('dossierField'), 340, collapsedCardHeight() * 4);
    expect(ok).toBe(true);
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
  test('the expanded field keeps the GEOMETRY the owner approved', () => {
    /* ⚠ The composition is the reference and has never moved: same box, same
     * anchor, same bleed off the right. OTA-1750 raised only the opacity, on the
     * owner's note that the designs read fainter than he wanted — so this pins
     * the four numbers that make the composition and lets the alpha be tuned. */
    const a = styleBlock('dossierField');
    expect(num(a, 'top')).toBe(-18);
    expect(num(a, 'bottom')).toBe(-18);
    expect(num(a, 'right')).toBe(-8);
    expect(num(a, 'left')).toBe(32);
    expect(a).toContain("position: 'absolute'");
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
    for (const anchor of ['<DossierField crest={crest} compact />', '<DossierField crest={crest} />']) {
      const at = TITLE.indexOf(anchor);
      expect(at).toBeGreaterThan(-1);
      const spineAt = TITLE.indexOf('styles.spine', at);
      const bodyAt = TITLE.indexOf('styles.dossierBody', at);
      expect(spineAt).toBeGreaterThan(at);
      expect(bodyAt).toBeGreaterThan(at);
    }
    // and it is inert to touch, so it cannot eat the tap or the swipe
    const tree = await mountTitle([slot()]);
    for (const n of fieldsOf(tree)) expect(flat(n.props.style).opacity).toBeLessThan(0.2);
    expect(TITLE).toMatch(/<View style=\{styles\.dossierFieldClip\} pointerEvents="none">/);
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

  test('it costs no state, no timer, no measurement and no subscription', () => {
    const fn = /function DossierField\([\s\S]*?\n\}/.exec(TITLE)?.[0] ?? '';
    expect(fn).not.toMatch(/useState|useEffect|useRef|setInterval|setTimeout|onLayout|Animated/);
    // one Image on a collapsed card; the expanded card's second is the seal
    // plate that has been there since VIS-1.
    expect((fn.match(/<Image/g) ?? []).length).toBe(1);
  });
});

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
