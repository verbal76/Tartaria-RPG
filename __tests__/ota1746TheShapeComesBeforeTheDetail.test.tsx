/**
 * OTA-1746 — THE SHAPE COMES BEFORE THE DETAIL (task VIS-3-COMMERCIAL-POLISH-5E82).
 *
 * The commercial-finish pass, and the brief was explicit about how to grade it:
 * SQUINT AT THE SCREEN. With the 1px lines, the engraving, the small text and
 * the subtle texture all gone, does the LARGE COMPOSITION still have hierarchy,
 * depth, a focal point and one obvious primary action? Fix that first; detail
 * second. So this suite grades the same way — almost nothing in it measures an
 * ornament, and the things it does measure are the ones that survive squinting:
 * which plane a surface is on, how many colours are competing for attention,
 * whether a control belongs to a family, and whether the artwork is composition
 * or decoration.
 *
 * ⚠ AND IT GUARDS WHAT THE BRIEF PUT OUT OF BOUNDS. Combat density is sacred
 * (VIS-2 / OTA-1745), the corrected title scrolling is not to be undone
 * (OTA-1744), no gameplay moves, and nothing here may cost a frame.
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
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { TitleScreen } from '../app/screens/TitleScreen';
import { factionCrest } from '../app/engine/factionCrests';
import { T, TType, TSurface, TButton, tartariaKitStyles, FACTION_PLATE_TEST_ID } from '../app/ui/tartariaKit';
import { STRIP_METRICS } from '../app/components/CombatStrip';
import type { SlotSummary } from '../app/engine/saveSystem';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; toJSON(): unknown; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

jest.setTimeout(240000);
const S = () => useGameStore.getState();
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const KIT = read('app', 'ui', 'tartariaKit.tsx');
const EXP = read('app', 'screens', 'ExplorationScreen.tsx');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');
const FEED = read('app', 'components', 'AdventureFeed.tsx');
const STRIP = read('app', 'components', 'CombatStrip.tsx');

/* ⚠⚠⚠ THE HOST-NODE FILTER, AND IT IS NOT OPTIONAL.
 * RN's `View` is a composite that forwards its props to a host `View`, so a
 * naive `findAll` returns EVERY element TWICE and any count taken off it is
 * double the truth. OTA-1745 nearly shipped a density claim priced at 2×
 * because of exactly this. Every count in this file goes through `hosts()`. */
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

// ── colour arithmetic, so "darker" and "legible" are measured, not asserted ──
const hexRgb = (h: string): [number, number, number] => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
};
const parseColor = (c: string): { rgb: [number, number, number]; a: number } => {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(c);
  if (m) return { rgb: [+m[1]!, +m[2]!, +m[3]!], a: m[4] === undefined ? 1 : +m[4]! };
  return { rgb: hexRgb(c), a: 1 };
};
/** composite `fg` over an opaque background */
const over = (fg: string, bg: [number, number, number]): [number, number, number] => {
  const { rgb, a } = parseColor(fg);
  return [0, 1, 2].map((i) => rgb[i]! * a + bg[i]! * (1 - a)) as [number, number, number];
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
/** The two extremes of the player's own theme control (displaySettings). */
const DARK_THEME: [number, number, number] = [12, 14, 11];
const LIGHT_THEME: [number, number, number] = [232, 224, 206];

const mounted: Array<{ unmount(): void }> = [];
afterEach(async () => {
  while (mounted.length) {
    const t = mounted.pop()!;
    // eslint-disable-next-line no-await-in-loop
    await renderer.act(async () => { try { t.unmount(); } catch { /* already gone */ } });
  }
});

const slot = (over_: Partial<SlotSummary> = {}): SlotSummary => ({
  slotId: 'slot-a',
  playerName: 'Corvin',
  raceId: getRaces()[0]!.id,
  locationId: 'ashen_hollow',
  hp: 22,
  hpMax: 30,
  savedAt: Date.now() - 60_000,
  createdAt: Date.now() - 600_000,
  factionId: getFactions()[0]!.id,
  resurrectionGems: 0,
  ...over_,
} as SlotSummary);

const flush = async () => { await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const textOf = (n: TestNode): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestNode | null)?.children ? walk((x as TestNode).children) : '');
  return walk(n.children);
};
const allText = (tree: ReturnType<typeof renderer.create>) =>
  tree.root.findAll(() => true).map((n) => textOf(n)).join('\n');

async function mountTitle(slots: SlotSummary[]) {
  // ⚠ Same gate as OTA-1742: the boot gate (OTA-405) holds load/create until
  // the OTA check resolves and the classifier settles, and the screen re-reads
  // the slot list on appear (OTA-1294). Open the gate and put the roster back,
  // or this measures the gate instead of the design.
  useGameStore.setState({ slots, crashedSlotIds: [], otaBootResolved: true, cognitiveStatus: 'ready' } as never);
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<TitleScreen />); });
  await flush();
  useGameStore.setState({ slots, otaBootResolved: true, cognitiveStatus: 'ready' } as never);
  await flush();
  mounted.push(tree);
  return tree;
}
/** Tap the row that names this Tartarian — the expansion is what reveals the art. */
async function expandRow(tree: ReturnType<typeof renderer.create>, name: string) {
  const row = tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(name))[0];
  expect(row).toBeDefined();
  await renderer.act(async () => { (row!.props.onPress as () => void)(); });
  await flush();
}

// ═══ 1. THE LARGE COMPOSITION ════════════════════════════════════════════════
describe('the shape comes before the detail — the large composition', () => {
  test('the scene header is a housing, not a bordered rectangle', () => {
    // BEFORE: `styles.sceneBar` — flexDirection row, backgroundColor #13110f,
    // borderColor #3a342c, borderWidth 1, borderRadius 4. One of eight.
    expect(EXP).not.toContain('style={styles.sceneBar}');
    expect(EXP).not.toMatch(/\n\s*sceneBar:\s*\{/);
    expect(EXP).toContain('<TSurface');
    // it is a housing WITH A RAIL — the split is what makes it an instrument
    // rather than a box with two lines of text in it.
    expect(EXP).toMatch(/<TSurface[\s\S]{0,200}rail=\{/);
  });

  test('the feed is an INSET surface: darker face, light on the bottom edge', () => {
    // A raised plate is lighter than its ground with the light on TOP. A recess
    // is the exact inverse, and the inverse is the whole depth cue — there is no
    // shadow doing this work.
    const face = /container:\s*\{[\s\S]*?backgroundColor:\s*'([^']+)'/.exec(FEED)?.[1];
    const top = /container:\s*\{[\s\S]*?borderTopColor:\s*'([^']+)'/.exec(FEED)?.[1];
    const bottom = /container:\s*\{[\s\S]*?borderBottomColor:\s*'([^']+)'/.exec(FEED)?.[1];
    expect(face).toBeTruthy(); expect(top).toBeTruthy(); expect(bottom).toBeTruthy();
    for (const bg of [DARK_THEME, LIGHT_THEME]) {
      // the face is darker than the housing that surrounds it, on BOTH themes
      expect(lum(over(face!, bg))).toBeLessThan(lum(over(T.composite, bg)));
      // and the light hairline is on the bottom, the shadow on the top
      expect(lum(over(bottom!, bg))).toBeGreaterThan(lum(over(top!, bg)));
    }
  });

  test('the housing is the inverse: lighter face, light on the TOP edge', () => {
    const k = tartariaKitStyles as unknown as Record<string, Record<string, string>>;
    for (const bg of [DARK_THEME, LIGHT_THEME]) {
      expect(lum(over(T.composite, bg))).toBeGreaterThan(lum(over(T.glass, bg)));
      expect(lum(over(k.surfRimHousing!.borderTopColor!, bg)))
        .toBeGreaterThan(lum(over(k.surfRimHousing!.borderBottomColor!, bg)));
      expect(lum(over(k.surfRimInset!.borderBottomColor!, bg)))
        .toBeGreaterThan(lum(over(k.surfRimInset!.borderTopColor!, bg)));
    }
  });

  /* ⚠⚠⚠ WHAT THE HEADER COST, MEASURED AND STATED RATHER THAN HIDDEN.
   *
   * A housing is TALLER than the bordered strip it replaces: a rail, an
   * engraved split and a face, where there used to be two lines of text inside
   * one box. On this screen the FEED is `flex: 1`, so every pixel the header
   * takes comes straight out of what the player can read — which is precisely
   * the kind of quiet regression VIS-2's density work exists to prevent.
   *
   * So the cost is computed here from the SHIPPED style objects (never a second
   * copy of the numbers — a suite with its own copy grades itself), and held to
   * a ceiling. The old bar and the new housing are both measured the same way:
   * borders + paddings + the tallest content in each band. */
  test('the housing costs the feed 12dp, and the number is computed not claimed', () => {
    const k = tartariaKitStyles as unknown as Record<string, Record<string, number>>;
    const px = (name: string, prop: string) => {
      const block = new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(EXP)?.[0]
        ?? new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`).exec(EXP)?.[0] ?? '';
      return Number(new RegExp(`${prop}:\\s*(\\d+)`).exec(block)?.[1] ?? 0);
    };
    const line = (fontSize: number) => Math.round(fontSize * 1.25); // RN's default leading
    // BEFORE (OTA-748's sceneBar, from the commit this pass supersedes):
    //   border 1+1, paddingVertical 6+6, sceneText 10px over timeText 9px +1 margin
    const before = 2 + 12 + line(10) + line(9) + 1;
    // AFTER: border 1+1 | rail pad + the tallest thing in it (the gear socket,
    // which is why its padding was tightened) | the engraved rule | face pad +
    // the readout line.
    const gear = px('sceneBarBtn', 'paddingVertical') * 2 + 2 + line(px('sceneBarGear', 'fontSize'));
    const rail = k.surfRail!.paddingTop! + k.surfRail!.paddingBottom! + Math.max(gear, line(13));
    const face = k.surfFaceHousing!.paddingVertical! * 2 + line(10);
    const after = 2 + rail + 1 + face;
    /* ⚠⚠ 12dp, AND IT IS A REAL COST, NOT A ROUNDING ERROR — about half a line
     * of feed prose (whose line height is 22). It buys the screen's only
     * structural hierarchy, and every padding above was tightened until this
     * number stopped falling without the two registers running together. If a
     * future pass wants it back, the rail and the readout have to merge, and
     * the header goes back to being a strip. */
    expect(after - before).toBeLessThanOrEqual(12);
    // ⚠ and it must not have been bought by shrinking the tap target
    expect(EXP).toContain('hitSlop={8}');
  });

  test('the depth costs nothing — neither tone declares a shadow or an elevation', () => {
    const k = tartariaKitStyles as unknown as Record<string, Record<string, unknown>>;
    for (const name of ['surfRim', 'surfRimHousing', 'surfRimInset', 'surfFace', 'surfFaceHousing', 'surfFaceInset', 'surfRail', 'surfKey']) {
      const s = k[name]!;
      expect(Object.keys(s).filter((key) => /^shadow/.test(key) || key === 'elevation')).toEqual([]);
    }
    // and the feed's own recess did not buy its depth with one either
    expect(/container:\s*\{[\s\S]*?\n\s*\},/.exec(FEED)?.[0] ?? '').not.toMatch(/elevation|shadow/);
  });
});

// ═══ 2. GOLD MEANS ONE THING ═════════════════════════════════════════════════
describe('gold is a live obligation or a live process — and nothing else', () => {
  /* ⚠ THE SINGLE-LINE FORM IS TRIED FIRST, ON PURPOSE. Several of these styles
   * are one-liners; a `[\s\S]*?\n  \},` pattern matches them by running on into
   * the NEXT multi-line block and grading the wrong style. (It also, on the
   * first draft of this file, made three of these tests pass or fail for
   * reasons unrelated to the style they name.) */
  const styleBlock = (name: string) => {
    const one = new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(EXP);
    if (one) return one[0];
    return new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`).exec(EXP)?.[0] ?? '';
  };

  test.each([
    ['sceneName', 'where you are is identity, not an obligation'],
    ['sceneTime', 'a clock is technical detail'],
    ['sceneDot', 'a separator is not information'],
    ['sceneBarBtn', 'settings must not compete'],
    ['sceneBarGear', 'settings must not compete'],
    ['crestNavBtn', 'navigation is not a call to action'],
    ['didYouMeanChip', 'a parser guess is not an obligation'],
  ])('%s has left the gold (%s)', (name) => {
    const block = styleBlock(name);
    expect(block).not.toBe('');
    expect(block.toLowerCase()).not.toContain('c9a86a');
  });

  test('the two things that KEEP gold are the two live ones', () => {
    // the main-quest chip — a live obligation
    expect(styleBlock('objectiveChip').toLowerCase()).toContain('c9a86a');
    // the arbiter composing indicator — a live process
    expect(styleBlock('streamingTail').toLowerCase()).toContain('c9a86a');
  });

  test('the screen spends 40% less gold than it did, and that is the focal point', () => {
    /* ⚠⚠ THE CLAIM IS COMPARATIVE, SO THE OLD NUMBER IS WRITTEN DOWN RATHER
     * THAN REMEMBERED: before this pass Exploration's StyleSheet DECLARED
     * #c9a86a twenty times — on the place, the day, the weather, two nav
     * buttons, the settings gear, a parser guess, three controls that no longer
     * exist, the trader and the main quest alike. Nothing on the screen read as
     * primary because everything was claiming to be. It is now 12.
     *
     * ⚠ QUOTED occurrences only. Four of the remaining mentions are comments
     * explaining the demotion, and a test that counted those would grade the
     * obituary instead of the code — the exact mistake this file made on its
     * first run against ListHeaderComponent.
     *
     * ⚠⚠⚠ AND THE REMAINING 12 ARE NOT ALL "LIVE" — SAID PLAINLY RATHER THAN
     * OVERCLAIMED. Six are the main-quest chip (a live obligation) and its
     * SUMMON control, one is the arbiter's composing indicator (a live
     * process), and five are the TRADER — whose accent gold is OTA-1029's
     * deliberate per-chip colour family, left alone because this brief
     * explicitly forbids using it as licence for a blind redesign. What is
     * true is narrower and still worth having: gold has left the CHROME
     * entirely. Nothing structural on this screen is gold any more. */
    const golds = (EXP.match(/'#c9a86a'/g) ?? []).length;
    expect(golds).toBe(12);
  });
});

// ═══ 3. ONE CONTROL FAMILY ═══════════════════════════════════════════════════
describe('a coherent control family, not seven unrelated styles', () => {
  test('WORLD and LORE are the kit button, and no longer style themselves', () => {
    expect(EXP).toMatch(/<TButton\s[\s\S]{0,220}CREST_WORLD_LABEL/);
    expect(EXP).toMatch(/<TButton\s[\s\S]{0,220}CREST_LORE_LABEL/);
    // the old bespoke control is gone entirely — face, rim and text with it
    expect(EXP).not.toContain('crestNavText');
    const block = /\n  crestNavBtn:\s*\{[^}]*\},/.exec(EXP)?.[0] ?? '';
    expect(block).not.toMatch(/backgroundColor|borderWidth|borderColor/);
  });

  test('compact is a DENSITY, not an eighth button style', async () => {
    const grab = async (compact: boolean) => {
      let tree!: ReturnType<typeof renderer.create>;
      await renderer.act(async () => {
        tree = renderer.create(<TButton label="WORLD" variant="utility" compact={compact} onPress={() => {}} />);
      });
      mounted.push(tree);
      const faces = hosts(tree, (n) => {
        const s = flat(n.props.style);
        return s.paddingVertical !== undefined && s.backgroundColor !== undefined;
      });
      return flat(faces[faces.length - 1]!.props.style);
    };
    const full = await grab(false);
    const small = await grab(true);
    // the density really does change
    expect(Number(small.paddingVertical)).toBeLessThan(Number(full.paddingVertical));
    // ...and the SHAPE does not: same rounding, same rim geometry as its sibling
    const k = tartariaKitStyles as unknown as Record<string, Record<string, unknown>>;
    expect(k.btnRim!.borderRadius).toBe(3);
    expect(k.btnFaceCompact!.borderRadius).toBeUndefined();
    // one press animation for the whole family, still native and still one timing
    expect(KIT.match(/Animated\.timing\(/g) ?? []).toHaveLength(2);
    expect(KIT).toContain('if (reduceMotion) { depth.setValue(to); return; }');
  });

  test('⚠⚠⚠ the button costs ONE commit per render, not two', () => {
    /* A REAL REGRESSION THIS PASS CAUSED AND THEN FIXED, pinned so it cannot
     * come back. TButton built a fresh `interpolate` node and a fresh
     * `{ transform: [...] }` object on every render. RN's AnimatedProps reads a
     * new animated node as new props: it detaches, re-attaches and SCHEDULES
     * ANOTHER UPDATE — so every re-render of a screen containing one cost TWO
     * commits. On the title screen (which re-renders rarely) nothing showed. On
     * Exploration, which re-renders on every arbiter state change, OTA-1739's
     * commit-count suite failed the moment this control arrived — the exact
     * class of regression the LAG tranches exist to prevent.
     *
     * ⚠ Both halves are required: memoising the interpolation but rebuilding
     * the style object still hands AnimatedProps a new value every time. */
    expect(KIT).toMatch(/const translateY = useMemo\(\s*\(\) => depth\.interpolate\(/);
    expect(KIT).toContain('const lift = useMemo(() => ({ transform: [{ translateY }] }), [translateY]);');
    // and the animated style is the memoised one, never an inline literal
    expect(KIT).not.toMatch(/kit\.btnRim[\s\S]{0,200}\{ transform: \[\{ translateY \}\] \}\]/);
  });

  test('the settings key is a socket, at the same hit area it always had', () => {
    expect(EXP).toContain('hitSlop={8}');
    expect(EXP).toContain('accessibilityLabel="Settings"');
    // and it is still inside the pinned container OTA-1370 depends on
    expect(EXP).toContain('styles.sceneBarBtns');
  });
});

// ═══ 4. THE KEYED CORNER — ONE SHAPE, ONCE ═══════════════════════════════════
describe('purpose-designed silhouette, used with restraint', () => {
  const countKeys = (tree: ReturnType<typeof renderer.create>) =>
    hosts(tree, (n) => {
      const s = flat(n.props.style);
      return Array.isArray(s.transform)
        && (s.transform as Array<Record<string, unknown>>).some((t) => t.rotate === '45deg');
    }).length;

  test('a housing has exactly ONE chamfer, and it cannot take a tap', async () => {
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => { tree = renderer.create(<TSurface><></></TSurface>); });
    mounted.push(tree);
    expect(countKeys(tree)).toBe(1);
    const key = hosts(tree, (n) => {
      const s = flat(n.props.style);
      return Array.isArray(s.transform);
    })[0]!;
    expect(key.props.pointerEvents).toBe('none');
  });

  test('keyed={false} exists, because fifteen exotic shapes is not more polished', async () => {
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => { tree = renderer.create(<TSurface keyed={false}><></></TSurface>); });
    mounted.push(tree);
    expect(countKeys(tree)).toBe(0);
  });

  test('the cut is drawn between two colours this file owns — never against the theme', () => {
    const k = tartariaKitStyles as unknown as Record<string, Record<string, string>>;
    // both are near-opaque, so the player's chosen hue cannot bleed through the
    // chamfer and produce a bright wedge on a light theme
    expect(parseColor(k.surfKey!.backgroundColor!).a).toBeGreaterThanOrEqual(0.9);
    for (const bg of [DARK_THEME, LIGHT_THEME]) {
      // the cut face reads as a shadow on BOTH themes
      expect(lum(over(k.surfKey!.backgroundColor!, bg))).toBeLessThan(lum(over(T.composite, bg)));
    }
  });
});

// ═══ 5. MATERIAL AND TYPE ARE SYSTEMS ════════════════════════════════════════
describe('material discipline and typography as a system', () => {
  test('four material families, and they are genuinely distinguishable', () => {
    for (const bg of [DARK_THEME, LIGHT_THEME]) {
      const l = (c: string) => lum(over(c, bg));
      // composite (housing) > coating (utility) > glass (recess)
      expect(l(T.composite)).toBeGreaterThan(l(T.coating));
      expect(l(T.coating)).toBeGreaterThan(l(T.glass));
    }
    /* ⚠⚠⚠ AND THE RULE UNDERNEATH IT, WHICH IS WHY THE ABOVE HOLDS ON BOTH.
     * The plane order is only stable if the alphas are monotone in it. A MORE
     * transparent material admits MORE of the player's background, so on a
     * light theme a translucent "deep" plane rises above an opaque shallow one
     * and the depth cue silently inverts. This pass shipped that bug TWICE —
     * coating at 0.82 outranked the housing, and glass at 0.90 outranked the
     * coating — and both were caught here rather than on the device. Any fifth
     * material, or any alpha tweak to these four, has to satisfy this. */
    const alpha = (c: string) => parseColor(c).a;
    expect(alpha(T.composite)).toBeLessThanOrEqual(alpha(T.coating));
    expect(alpha(T.coating)).toBeLessThanOrEqual(alpha(T.glass));

    // ceramic is a MARK, not a face: it is pale, which is why it is never a
    // background anywhere in the kit
    expect(lum(hexRgb(T.ceramic))).toBeGreaterThan(0.2);
    expect(KIT).not.toMatch(/backgroundColor:\s*T\.ceramic/);
  });

  test('not everything is gold and not every panel is bronze', () => {
    // ⚠ The structural rims are ALLOY. A warm bronze rim on every plate is how
    // recovered technology becomes a castle door (the owner's own note on the
    // device). Gold appears in the kit only on lit/selected/primary states.
    const [r, g, b] = hexRgb(T.compositeRim);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(18);
    const [gr, gg, gb] = hexRgb(T.glassRim);
    expect(Math.max(gr, gg, gb) - Math.min(gr, gg, gb)).toBeLessThanOrEqual(18);
  });

  test('the type roles are named, and none of them uses size as a substitute for hierarchy', () => {
    const roles = TType as unknown as Record<string, { fontSize: number }>;
    for (const r of ['display', 'dossier', 'action', 'body', 'meta', 'technical', 'status']) {
      expect(roles[r]).toBeDefined();
    }
    // exactly one role is allowed to be large — the game's own name. Everything
    // else lives inside a 9-16px band, so rank comes from weight, tracking,
    // colour and PLACEMENT rather than from inflating a font.
    const others = Object.entries(roles).filter(([k]) => k !== 'display').map(([, v]) => v.fontSize);
    expect(Math.max(...others)).toBeLessThanOrEqual(16);
    expect(Math.min(...others)).toBeGreaterThanOrEqual(9);
  });

  test('the header stays legible on the owner\'s green AND his daughter\'s purple/blue', () => {
    // The header's own tones, composited over the housing, over each theme
    // extreme. The player owns the hue; the kit owes them contrast either way.
    for (const bg of [DARK_THEME, LIGHT_THEME]) {
      const face = over(T.composite, bg);
      expect(contrast(hexRgb('#e6d8b3'), face)).toBeGreaterThanOrEqual(4.5); // sceneName
      expect(contrast(hexRgb('#a2977b'), face)).toBeGreaterThanOrEqual(3);   // sceneTime
      expect(contrast(hexRgb('#e07a5f'), face)).toBeGreaterThanOrEqual(3);   // hazard / lethal
    }
  });

  test('danger is the one element allowed to escalate, and it never escalates into gold', () => {
    const tones = /function dangerTone[\s\S]*?\n\}/.exec(EXP)?.[0] ?? '';
    expect(tones).not.toContain('c9a86a');
    expect(tones).toContain('#e07a5f');
    // the tier NUMBER and its WORD both survived the move from prose to stamp
    expect(EXP).toMatch(/return `D\$\{d\} \$\{tier\}`/);
    expect(EXP).toContain("'LETHAL'");
  });
});

// ═══ 6. THE ARTWORK PARTICIPATES ═════════════════════════════════════════════
describe('artwork is composition, not a thumbnail in a box', () => {
  test('the expanded record is printed on its own faction, from the same decode', async () => {
    const tree = await mountTitle([slot()]);
    await expandRow(tree, 'Corvin');
    const crest = factionCrest(getFactions()[0]!.id);
    expect(crest).toBeDefined();
    const images = hosts(tree, (n) => n.props.source === crest);
    // the riveted plate AND the field — two draws, ONE source, so RN decodes the
    // asset once and both read the same cache entry
    expect(images.length).toBe(2);
    const sources = new Set(images.map((n) => n.props.source));
    expect(sources.size).toBe(1);
    // the field never intercepts the second tap that loads the character
    const field = images.find((n) => Number(flat(n.props.style).opacity ?? 1) < 1);
    expect(field).toBeDefined();
    expect(Number(flat(field!.props.style).opacity)).toBeLessThan(0.15);
    expect(field!.props.resizeMode).toBe('contain');
  });

  test('the field bleeds off the record rather than sitting centred in it', () => {
    // A print is CROPPED by the thing it is printed on. A picture centred in a
    // box is the failure this replaces, so the geometry is pinned.
    const block = /dossierField:\s*\{[^}]*\}/.exec(TITLE)?.[0] ?? '';
    expect(block).toContain("position: 'absolute'");
    expect(block).toMatch(/top: '-\d+%'/);
    expect(block).toMatch(/bottom: '-\d+%'/);
    // ...and it stays out of the written column by LAYOUT, before opacity
    expect(block).toMatch(/left: '3\d%'/);
    // clipping is local, so it cannot crop the seal plate that sits proud of the
    // record's corner (VIS-1's own composition, kept)
    expect(TITLE).toContain('dossierFieldClip');
    expect(/dossierFieldClip:\s*\{[^}]*\}/.exec(TITLE)?.[0]).toContain("overflow: 'hidden'");
  });

  /* ⚠⚠⚠ SUPERSEDED BY OTA-1747, REASONING KEPT RATHER THAN DELETED WITH IT.
   *
   * As written this asserted a collapsed record showed NEITHER the seal plate
   * nor the field, because VIS-1 made the emblem the EXPANSION REWARD — the
   * thing that made opening a record feel like pulling a file — and VIS-3 put
   * the field on the expanded card only, beside it.
   *
   * The owner then saw the expanded card on the device and asked for the field
   * on every card, collapsed included, each wearing its own faction. So the half
   * of this rule about the FIELD is retired on his instruction.
   *
   * ⚠ THE OTHER HALF IS NOT, AND THAT IS THE POINT OF REWRITING RATHER THAN
   * DELETING: the riveted SEAL PLATE is still expansion-only. It is the reward;
   * the field is the card's material. Putting the plate on a collapsed row would
   * undo VIS-1's two-stage design and there is no instruction to do that, so the
   * assertion stays — now stated as the distinction it always was. */
  test('a collapsed record wears its faction FIELD but not the seal PLATE', async () => {
    const tree = await mountTitle([slot(), slot({ slotId: 'slot-b', playerName: 'Vessa' })]);
    // the plate is still the expansion reward — nothing expanded, no plate
    expect(hosts(tree, (n) => n.props.testID === FACTION_PLATE_TEST_ID)).toHaveLength(0);
    // ...but the card material now carries the faction, on every row (OTA-1747)
    const crest = factionCrest(getFactions()[0]!.id);
    const drawn = hosts(tree, (n) => n.props.source === crest);
    expect(drawn).toHaveLength(2); // one field per collapsed row
    for (const n of drawn) expect(Number(flat(n.props.style).opacity)).toBeLessThan(0.15);
  });

  test('a faction the game ships no art for renders NOTHING, not a stand-in', async () => {
    const tree = await mountTitle([slot({ factionId: 'no_such_faction' } as Partial<SlotSummary>)]);
    await expandRow(tree, 'Corvin');
    expect(hosts(tree, (n) => n.props.testID === FACTION_PLATE_TEST_ID)).toHaveLength(0);
    // and it did not crash or render an empty Image with an undefined source
    expect(hosts(tree, (n) => n.props.source === undefined && n.props.resizeMode === 'contain')).toHaveLength(0);
  });
});

// ═══ 7. WHAT THE BRIEF PUT OUT OF BOUNDS ═════════════════════════════════════
describe('combat density is sacred, and so is everything else out of scope', () => {
  test('not one combat metric moved', () => {
    // The numbers OTA-1745 measured its whole density claim on.
    expect(STRIP_METRICS).toEqual({ row: 18, sub: 16, math: 15, gap: 2, entry: 3 });
    expect(FEED).toContain('combatEntry: { marginBottom: STRIP_METRICS.entry }');
    expect(FEED).toContain('entry: { marginBottom: 24 }');
    // this pass never opened the strip at all
    expect(STRIP).not.toContain('VIS-3');
  });

  test('no gameplay, no combat authority and no boot protection was touched', () => {
    for (const f of ['app/state/gameStore.ts', 'app/state/combatResolution.ts', 'app/state/slices/bootSlice.ts', 'App.tsx']) {
      expect(read(...f.split('/'))).not.toContain('VIS-3');
    }
  });

  test('the corrected title scrolling and the Settings placement both survive', () => {
    // OTA-1744: the roster heading and the footer actions live OUTSIDE the
    // FlatList, which is what stopped the whole lower screen moving with a
    // roster scroll. Re-introducing either prop is the regression.
    // ⚠ The PROP form, not the bare word: OTA-1744 wrote a paragraph of comment
    // explaining why both props were removed, so a substring test on the name
    // alone grades the obituary rather than the code.
    expect(TITLE).not.toContain('ListHeaderComponent=');
    expect(TITLE).not.toContain('ListFooterComponent=');
    // OTA-1744 moved these OFF the title screen. They stay off it — again as
    // rendered labels, not as the sentences that record their removal.
    expect(TITLE).not.toMatch(/>\s*EXIT GAME\s*</);
    expect(TITLE).not.toMatch(/label=["']RESTORE FROM BACKUP["']/);
  });

  test('nothing here costs a frame', () => {
    // ⚠ The LAG-1/2/3 rules, as source facts rather than as intentions: the new
    // surfaces are static View trees. No idle loop, no timer, no measurement,
    // no per-frame work, and no new store subscription anywhere in the kit.
    expect(KIT).not.toMatch(/setInterval|requestAnimationFrame|Animated\.loop|useWindowDimensions/);
    expect(KIT).not.toContain('onLayout');
    expect(KIT).not.toContain('useGameStore');
    // TSurface and the feed recess add no elevation, which is what produced the
    // dark all-round Android seam the owner photographed on the dossiers.
    expect(/export function TSurface[\s\S]*?\n\}/.exec(KIT)?.[0] ?? '').not.toMatch(/elevation|shadow/);
    // the field is one Image on ONE record, drawn only while expanded
    expect((TITLE.match(/styles\.dossierField\b/g) ?? []).length).toBe(1);
  });

  test('nothing in the kit parses prose or reaches for a modern builtin', () => {
    // OTA-1743's standing rule: the launch path takes no dependency on a JS
    // builtin newer than the oldest APK we still serve OTAs to.
    expect(KIT).not.toMatch(/Promise\.allSettled\(|Promise\.any\(|\.at\(|structuredClone/);
    expect(KIT).not.toMatch(/\.exec\(|\.match\(|new RegExp/);
  });
});

// ═══ 8. THE SCREEN STILL WORKS ═══════════════════════════════════════════════
describe('the polish did not break the screen it polished', () => {
  test('the roster still loads, expands and offers the threshold', async () => {
    const tree = await mountTitle([slot()]);
    await expandRow(tree, 'Corvin');
    const text = allText(tree);
    expect(text).toContain('Corvin');
    expect(text).toContain('ENTER TARTARIA');
  });

  test('a dead Tartarian is still offered resurrection, not a door', async () => {
    const tree = await mountTitle([slot({ dead: true } as Partial<SlotSummary>)]);
    await expandRow(tree, 'Corvin');
    const text = allText(tree);
    expect(text).toContain('RESURRECT THIS TARTARIAN');
    expect(text).not.toContain('ENTER TARTARIA');
  });

  test('this pass has a stamp of its own, live or superseded', () => {
    /* ⚠ WRITTEN AS A DURABLE CLAIM, NOT A ONE-RELEASE PIN. The original form
     * asserted OTA_BUILD_ID *equalled* 1746, which was true for exactly one
     * release: OTA-1747 superseded it the next day and the test failed for a
     * reason that was not a defect. The house rule is one OTA, one stamp, with
     * the previous one preserved on a `// SUPERSEDED:` line — so what is
     * actually worth holding is that this pass's stamp EXISTS in the ledger,
     * whether it is the live one or a superseded one. */
    const BUILD = read('app', 'buildInfo.ts');
    expect(BUILD).toContain("'2026-09-08-1746-the-shape-comes-before-the-detail'");
    expect(S).toBeDefined();
  });
});
