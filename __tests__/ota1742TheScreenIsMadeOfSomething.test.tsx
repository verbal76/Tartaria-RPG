/**
 * OTA-1742 — THE SCREEN IS MADE OF SOMETHING (task VIS-1-A7E4).
 *
 * The first visual-overhaul pass. Its brief was not "restyle the title screen"
 * but "establish a professional, reusable Tartaria game-interface language and
 * use the title / character-selection screen as its first reference
 * implementation" — so the tests below are in two halves.
 *
 * THE LANGUAGE (app/ui/tartariaKit.tsx): that the material is layered rather
 * than a border on a fill, that every colour in it is neutral or the existing
 * brand gold so the PLAYER'S chosen background hue is never fought, that the
 * only two animations are native-driven and reduce-motion-aware, and that
 * nothing in it polls, loops, blurs or allocates per frame.
 *
 * THE SCREEN (app/screens/TitleScreen.tsx): that the two-stage tap contract,
 * swipe-to-delete, the roster's truth, the footer's order and every dev control
 * survived the restyle intact; that the faction emblem appears ONLY on an
 * expanded record and only when the game actually ships that faction's art; and
 * that the new layers cannot take a tap.
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
// ⚠ Reduce-motion is a real shipped path and it also stops RN Animated graphs
// from outliving Jest's teardown. The animated paths are covered by source pins
// and by their own reduce-motion branch tests below.
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import React, { Profiler } from 'react';
import { readFileSync } from 'fs';
import { existsSync } from 'fs';
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
const S = () => useGameStore.getState();
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');
const KIT = read('app', 'ui', 'tartariaKit.tsx');
const flush = async () => { await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const textOf = (n: TestNode): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestNode | null)?.children ? walk((x as TestNode).children) : '');
  return walk(n.children);
};
const allText = (tree: { root: { findAll(p: (n: TestNode) => boolean): TestNode[] } }): string =>
  tree.root.findAll(() => true).map((n) => textOf(n)).join('\n');

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
  playerName: 'Corvin',
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

async function mountTitle(slots: SlotSummary[], gems = 0) {
  // ⚠ The boot gate (OTA-405) holds character load/create until the OTA check
  // has resolved and the classifier has settled. Open it, or every control on
  // this screen renders its locked label and the test measures the gate rather
  // than the design.
  useGameStore.setState({
    slots, resurrectionGems: gems, crashedSlotIds: [],
    otaBootResolved: true, cognitiveStatus: 'ready',
  });
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<TitleScreen />); });
  await flush();
  // The screen re-reads the slot list on appear (OTA-1294); put ours back.
  useGameStore.setState({ slots, otaBootResolved: true, cognitiveStatus: 'ready' });
  await flush();
  mounted.push(tree);
  return tree;
}

/** Every TouchableOpacity/Pressable whose rendered text contains `label`. */
const pressablesSaying = (tree: ReturnType<typeof renderer.create>, label: string): TestNode[] =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(label));

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1742 — the language is layered, not bordered', () => {
  it('⚠⚠ a plate is depth: outer shadow → rim → face → content, not backgroundColor + borderColor', () => {
    // The failure mode the brief names by hand: "never just a backgroundColor
    // and a borderColor." Each construction has a distinct outer/rim/face.
    for (const key of ['panelOuter:', 'panelRim:', 'panelFace:', 'btnOuter:', 'btnRim:', 'btnFace:', 'plateOuter:', 'plateRim:', 'plateWell:']) {
      expect(KIT).toContain(key);
    }
    // And the rim is lit from above: its top edge is not its side edge.
    expect(KIT).toContain('borderTopColor');
    expect(KIT).toContain('borderBottomColor');
  });

  it('⚠⚠ the record itself is layered, and the collapsed and open records are the SAME construction', () => {
    for (const key of ['dossierOuter:', 'dossierRim:', 'dossierFace:', 'spine:']) {
      expect(TITLE).toContain(key);
    }
    // Open is a MODIFIER on the base, never a second card: every "Open" style
    // is applied alongside its base in the JSX.
    expect(TITLE).toContain('[styles.dossierRim, styles.dossierRimOpen');
    expect(TITLE).toContain('[styles.dossierFace, styles.dossierFaceOpen');
    // The flat originals are gone rather than merely unused — two languages on
    // one screen is how this drifts back.
    expect(TITLE).not.toContain('  slot: {');
    expect(TITLE).not.toContain('slotCompact:');
  });

  it('⚠⚠⚠ selection is NOT just a different border colour', () => {
    // The brief's explicit failure test. The open record differs in face tone,
    // bevel, spine, shadow and type size — not only in rim colour.
    const open = TITLE.slice(TITLE.indexOf('dossierOuterOpen:'), TITLE.indexOf('enterBand:'));
    expect(open).toContain('shadowOpacity');   // deeper shadow
    expect(open).toContain('dossierFaceOpen'); // warmer face
    expect(open).toContain('spineOpen');       // wider, lit spine
    expect(open).toContain('slotNameOpen');    // larger name
  });

  it('⚠ a pressed control physically depresses, and the press is transform-only', () => {
    const btn = KIT.slice(KIT.indexOf('export function TButton'), KIT.indexOf('// ─── RESOURCE'));
    expect(btn).toContain('onPressIn');
    expect(btn).toContain('onPressOut');
    expect(btn).toContain('transform: [{ translateY }]');
    expect(btn).toContain('useNativeDriver: true');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1742 — the player owns the hue, and the kit respects it', () => {
  it('⚠⚠⚠ nothing in the kit is keyed to green (or to any hue but the brand gold)', () => {
    // The player picks bgHue/bgSat/bgLight in displaySettings and AppShell
    // paints it under every screen. A kit with a hard-coded hue would fight
    // that on olive, purple, blue and slate alike.
    /* ⚠⚠⚠ IT GRADES CODE, NOT PROSE — AND IT DID NOT UNTIL OTA-1759.
     * This rule is about the colours the kit PAINTS. It was reading the raw
     * file, so a comment that NAMES a colour tripped it — and the comment that
     * tripped it was `tRowStyle`'s, which exists precisely to record two hexes
     * the kit REFUSED to adopt because of this rule. A check that fails on the
     * write-up of its own enforcement teaches people to delete the write-up.
     * ⚠ That is the FOURTH time in two days: twice during OTA-1756, once when
     * `check:gold` was born, and here. `scripts/check-gold.mjs` grew a proper
     * tokeniser for the same reason; the two implementations are a legacy-hunt
     * item (extract one authority), NOT a reason to leave this one reading
     * comments in the meantime. */
    const code = KIT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const hexes = [...code.matchAll(/#([0-9A-Fa-f]{6})\b/g)].map((m) => m[1]!.toUpperCase());
    expect(hexes.length).toBeGreaterThan(0);
    const BRAND = new Set(['C9A86A', '8E7548', 'E07A5F', '5A2A26']); // gold, dim gold, rust, rust rim
    for (const h of hexes) {
      if (BRAND.has(h)) continue;
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      /* ⚠⚠ VIS-1-PHONE-FIX WIDENED THIS BY ONE CATEGORY, ON PURPOSE. The rule
       * was "warm neutral or the brand gold" (r >= g >= b), which is right for
       * bronze and wrong for what the owner actually asked for after seeing the
       * screen on the Pixel: *"precise ancient alloys, composites ... not
       * medieval fantasy"*. Machined alloy is COOL. So a colour now qualifies if
       * it is a warm neutral (as before) OR near-neutral of any temperature —
       * chroma <= 18, which is grey with a bias, not a hue. Everything the rule
       * was built to catch still fails it: a green, a blue or a purple keyed to
       * the current theme is far past 18 and is not warm-ordered either. */
      const warmOrdered = r >= g && g >= b;
      const nearNeutral = chroma <= 18;
      expect({ h, chroma, warmOrdered, nearNeutral })
        .toEqual({ h, chroma: expect.any(Number), warmOrdered: expect.any(Boolean), nearNeutral: expect.any(Boolean) });
      expect(warmOrdered || nearNeutral).toBe(true);
      // A warm aged metal tops out around 58 (the lit rim); a real hue is past it.
      expect(chroma).toBeLessThanOrEqual(60);
    }
  });

  it('⚠⚠ the texture, vignette-ish and linework layers are translucent black/white — they tint, they do not paint', () => {
    // The strata is the kit's own engraved rule turned down by OPACITY rather
    // than a pale colour, so it does not disappear on a light background.
    const strata = KIT.slice(KIT.indexOf('strataBand:'), KIT.indexOf('strataTick:') + 160);
    expect(strata).toContain('opacity:');
    expect(strata).not.toContain('backgroundColor:');
    // Faces darken what is behind them rather than replacing it.
    expect(KIT).toContain("face: 'rgba(");
    expect(KIT).toContain("well: 'rgba(");
  });

  it('⚠ and the screen still paints on the player’s background — the container stays transparent', () => {
    expect(TITLE).toContain("backgroundColor: 'transparent'");
  });

  it('⚠⚠⚠ every plate stays legible on seven substantially different player themes — including LIGHT ones', () => {
    // The plates are TRANSLUCENT: what the player reads text on is the kit's
    // face composited over whatever hue/saturation/lightness they chose. That
    // is a real legibility risk in exactly one direction — a light background
    // lifts the plate toward mid grey — and it is the reason the face alphas
    // are where they are. Measured here from the shipped tokens so a later
    // "let's let more of the background through" fails in CI, not on a phone.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { T } = require('../app/ui/tartariaKit') as { T: Record<string, string> };
    const hsl = (h: number, sat: number, l: number): number[] => {
      const s2 = sat / 100, l2 = l / 100;
      const k = (n: number) => (n + h / 30) % 12;
      const a = s2 * Math.min(l2, 1 - l2);
      const f = (n: number) => l2 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
    };
    const lin = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rgba = (v: string) => {
      const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(v.replace(/\s/g, ''))!;
      return { c: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
    };
    const over = (f: { c: number[]; a: number }, bg: number[]) =>
      f.c.map((c, i) => Math.round(c * f.a + bg[i]! * (1 - f.a)));

    const THEMES: Array<[string, number, number, number]> = [
      ['olive (the shipped green)', 84, 22, 12],
      ['deep blue', 218, 38, 14],
      ['royal purple', 282, 34, 16],
      ['near-black slate', 210, 8, 6],
      ['warm rust', 18, 40, 18],
      ['LIGHT parchment', 40, 30, 82],
      ['LIGHT cold grey', 210, 10, 88],
    ];
    const worst: Array<[string, number]> = [];
    for (const [name, h, sat, l] of THEMES) {
      const bg = hsl(h, sat, l);
      for (const faceName of ['face', 'faceLit', 'faceUtility'] as const) {
        const plate = over(rgba(T[faceName]!), bg);
        // Every tone the kit puts WORDS in, on every plate, on every theme.
        for (const tone of ['ink', 'inkDim', 'gold', 'rust'] as const) {
          worst.push([`${name}/${faceName}/${tone}`, ratio(hex(T[tone]!), plate)]);
        }
      }
    }
    const floor = worst.reduce((a, b) => (b[1] < a[1] ? b : a));
    // WCAG AA for normal text. The quietest tone measured is inkDim, and it is
    // documented as ornament-only precisely because it does not clear this.
    expect({ where: floor[0], ratio: Number(floor[1].toFixed(2)) })
      .toEqual({ where: floor[0], ratio: expect.any(Number) });
    expect(floor[1]).toBeGreaterThanOrEqual(4.5);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1742 — do not give the lag back', () => {
  it('⚠⚠⚠ the kit has no per-frame JS, no polling, no blur and no runtime image work', () => {
    for (const banned of ['setInterval', 'requestAnimationFrame', 'BlurView', 'blurRadius', 'Animated.loop', 'LinearGradient', 'addListener(']) {
      expect(KIT).not.toContain(banned);
    }
    // There are exactly two animations in the whole kit and both are native.
    const timings = KIT.match(/Animated\.timing\(/g) ?? [];
    expect(timings.length).toBe(2);
    expect((KIT.match(/useNativeDriver: true/g) ?? []).length).toBeGreaterThanOrEqual(timings.length);
    expect(KIT).not.toContain('useNativeDriver: false');
  });

  it('⚠⚠ both animations are skipped under reduce-motion — SET, not animated', () => {
    const btn = KIT.slice(KIT.indexOf('const run = useCallback'), KIT.indexOf('const translateY'));
    expect(btn).toContain('if (reduceMotion) { depth.setValue(to); return; }');
    const settle = KIT.slice(KIT.indexOf('export function TSettle'), KIT.indexOf('const kit = StyleSheet.create'));
    // ⚠ VIS-1-PHONE-FIX: the settle's REST is now 1 for both states (an
    // inactive card used to sit parked at the start of its own entrance, which
    // is what produced the dark seam above every record on the Pixel), so
    // reduce-motion sets 1 rather than a computed target. Still SET, not
    // animated, which is the claim.
    expect(settle).toContain('if (!active || reduce) { v.setValue(1); return; }');
  });

  it('⚠⚠ the settle is inside the brief’s 150-220ms window and the press inside 80-140ms', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SETTLE_MS } = require('../app/ui/tartariaKit') as { SETTLE_MS: number };
    expect(SETTLE_MS).toBeGreaterThanOrEqual(150);
    expect(SETTLE_MS).toBeLessThanOrEqual(220);
    const press = /const PRESS_MS = (\d+)/.exec(KIT);
    const release = /const RELEASE_MS = (\d+)/.exec(KIT);
    expect(Number(press![1])).toBeGreaterThanOrEqual(80);
    expect(Number(press![1])).toBeLessThanOrEqual(140);
    expect(Number(release![1])).toBeGreaterThanOrEqual(80);
    expect(Number(release![1])).toBeLessThanOrEqual(140);
  });

  it('⚠⚠ nothing new subscribes broadly to the game store, and the ornament costs static Views', () => {
    // The kit reads exactly one piece of app state — the reduce-motion flag,
    // through its own narrow selector — and never the game store at all.
    expect(KIT).not.toContain('useGameStore');
    expect(KIT).toContain("from '../state/accessibility'");
    // No image is processed at runtime; the only Image is the faction art the
    // game already ships, drawn with contain (the source PNGs are not square).
    expect((KIT.match(/<Image /g) ?? []).length).toBe(1);
    expect(KIT).toContain('resizeMode="contain"');
  });

  it('⚠ the screen adds no timer, no interval and no new store subscription', () => {
    const before = TITLE.slice(0, TITLE.indexOf('const styles = StyleSheet.create'));
    // setTimeout is the pre-existing button-flash apparatus; setInterval never
    // belonged to this screen and must not arrive with a restyle.
    expect(before).not.toContain('setInterval');
    expect(before).not.toContain('requestAnimationFrame');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1742 — the faction emblem is the expansion reward', () => {
  it('⚠⚠ every faction the game ships HAS canonical art — nothing had to be invented', () => {
    // The brief: "do not generate replacement faction artwork ... if an
    // expected faction emblem does not exist, report that." Reported: all nine
    // exist, so the emblem is never a placeholder.
    const factions = getFactions().map((f) => f.id);
    expect(factions.length).toBeGreaterThan(0);
    const missing = factions.filter((id) => factionCrest(id) === undefined);
    expect(missing).toEqual([]);
    expect(crestFactionIds().length).toBeGreaterThanOrEqual(factions.length);
  });

  it('⚠⚠ a save with no faction, or a faction with no art, renders NOTHING — never a stand-in', () => {
    expect(factionCrest(undefined)).toBeUndefined();
    expect(factionCrest('no_such_faction')).toBeUndefined();
    /* And the screen guards on exactly that, rather than falling back to a glyph.
     * ⚠ ANCHORED ON THE GUARD, NOT ON THE LOOKUP. This used to also pin the
     * literal `factionCrest(item.factionId)` call, which broke twice for no
     * defect: OTA-1747 moved the lookup above the collapsed/expanded branch, and
     * OTA-1749 changed WHICH field it reads (the summary's faction is optional
     * and older saves have none, so it now recovers the id from characterSeed).
     * Both were legitimate changes to a line this test only cared about as a
     * landmark. What the test is actually about is the REFUSAL — no art, no
     * emblem, never a stand-in — so that is what it pins. */
    expect(TITLE).toContain('{crest !== undefined && (');
    expect(TITLE).toContain('if (crest === undefined) return null;');
    expect(TITLE).toMatch(/const crest = factionCrest\(/);
  });

  it('⚠⚠⚠ the emblem appears on the EXPANDED record and never on a collapsed one', async () => {
    const tree = await mountTitle([slot(), slot({ slotId: 'slot-b', playerName: 'Vessa' })]);
    // Host nodes only — RN's View is a composite that forwards testID, so an
    // unfiltered findAll counts every emblem twice.
    const platesIn = (t: typeof tree) =>
      t.root.findAll((n) => typeof n.type === 'string' && n.props.testID === FACTION_PLATE_TEST_ID);
    const plates = () => platesIn(tree);
    // Nothing is expanded on arrival, so no emblem is mounted at all — which is
    // what makes opening a record feel like pulling a file.
    expect(plates().length).toBe(0);
    await renderer.act(async () => { (pressablesSaying(tree, 'Corvin')[0]!.props.onPress as () => void)(); });
    await flush();
    expect(plates().length).toBe(1);
    // Switching selection moves it — a stale emblem never survives on the
    // record the player just left.
    await renderer.act(async () => { (pressablesSaying(tree, 'Vessa')[0]!.props.onPress as () => void)(); });
    await flush();
    expect(plates().length).toBe(1);
    const open = pressablesSaying(tree, 'Vessa')[0]!;
    expect((open.props.accessibilityState as { expanded?: boolean }).expanded).toBe(true);
    // A save with no faction expands with no emblem, and nothing in its place.
    const none = await mountTitle([slot({ slotId: 'slot-c', playerName: 'Ilse', factionId: undefined })]);
    await renderer.act(async () => { (pressablesSaying(none, 'Ilse')[0]!.props.onPress as () => void)(); });
    await flush();
    expect(platesIn(none).length).toBe(0);
    expect(allText(none)).toContain('ENTER TARTARIA');
  });

  it('⚠⚠ the emblem cannot take a tap, cover text, or sit over the gesture layer', () => {
    /* ⚠ THE SLICE ANCHOR IS A STRUCTURAL MARKER, NOT A LINE THAT CHURNS.
     * `styles.dossierOuterOpen` is what MAKES this the expanded branch, so it
     * cannot drift without the branch itself changing. The previous anchor was
     * the faction-lookup line, which two later OTAs legitimately rewrote — and
     * when an anchor misses, `slice` returns '' and every assertion under it
     * fails for a reason that has nothing to do with what it tests. */
    const openBranch = TITLE.slice(TITLE.indexOf('styles.dossierOuterOpen,'), TITLE.indexOf('const styles = StyleSheet.create'));
    expect(openBranch).not.toBe('');
    // It lives in its own layout column beside the written column — not
    // absolutely positioned over the record — so it cannot land on a name, a
    // wrapped objective or a dead-row button.
    expect(openBranch).toContain('styles.dossierSplit');
    expect(openBranch).toContain('styles.dossierMain');
    expect(openBranch).toContain('<View style={styles.dossierSeal} pointerEvents="none">');
    const seal = TITLE.slice(TITLE.indexOf('dossierSeal:'), TITLE.indexOf('dossierSeal:') + 120);
    expect(seal).not.toContain('position:');
    // The kit's plate is itself inert.
    expect(KIT).toContain('<View style={[kit.plateOuter, box, style]} pointerEvents="none"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1742 — gameplay and gestures survived the restyle', () => {
  it('⚠⚠⚠ OTA-1491’s two-stage contract is intact: first tap expands, second tap loads', async () => {
    const tree = await mountTitle([slot()]);
    const collapsed = pressablesSaying(tree, 'Corvin')[0]!;
    expect((collapsed.props.accessibilityState as { expanded?: boolean }).expanded).toBe(false);
    await renderer.act(async () => { (collapsed.props.onPress as () => void)(); });
    await flush();
    const open = pressablesSaying(tree, 'Corvin')[0]!;
    expect((open.props.accessibilityState as { expanded?: boolean }).expanded).toBe(true);
    // The second tap is the LOAD path — unchanged in source, and the open
    // record's hint still says so.
    expect(String(open.props.accessibilityHint)).toContain('Loads Corvin');
    expect(TITLE).toContain('onPress={() => onSlotTap(item)}');
    expect(TITLE).toContain('onPress={() => setExpandedSlotId(item.slotId)}');
  });

  it('⚠⚠ the ENTER band is a label on the door, not the door — and it tells the truth about a dead Tartarian', async () => {
    const tree = await mountTitle([slot()]);
    await renderer.act(async () => { (pressablesSaying(tree, 'Corvin')[0]!.props.onPress as () => void)(); });
    await flush();
    expect(allText(tree)).toContain('ENTER TARTARIA');
    // pointerEvents="none": it can never intercept the second tap.
    expect(TITLE).toContain('<View style={styles.enterBand} pointerEvents="none">');
    // A dead character opens the resurrection prompt, so the band says that
    // instead of promising a door that is not there.
    expect(TITLE).toContain("'RESURRECT THIS TARTARIAN' : 'ENTER TARTARIA'");
  });

  it('⚠⚠ swipe-to-delete still wraps BOTH states', () => {
    const renderItem = TITLE.slice(TITLE.indexOf('const renderItem ='), TITLE.indexOf('  return (\n    <View style={styles.container}>'));
    expect((renderItem.match(/<SwipeableRow onDelete=\{\(\) => confirmDelete\(item\)\}>/g) ?? []).length).toBe(2);
    // And no new layer sits between the row and its gesture responder.
    expect(renderItem).not.toContain('onStartShouldSetResponder');
  });

  it('⚠ the roster still tells the truth, and still says how to delete', async () => {
    const tree = await mountTitle([slot()]);
    const text = allText(tree);
    expect(text).toContain('YOUR TARTARIANS');
    expect(text).toContain('swipe left to delete');
    expect(text).toContain('Corvin');
  });

  it('⚠⚠⚠ the restyled screen does not re-render while the player looks at it', async () => {
    // "A visually richer screen that becomes slower is a FAILED implementation."
    // The new material is static Views and StyleSheet objects; the only motion
    // is a press and a selection settle, both driven natively and both fired by
    // a touch. Nothing here should tick.
    useGameStore.setState({
      slots: [slot(), slot({ slotId: 'slot-b', playerName: 'Vessa' })],
      resurrectionGems: 2, crashedSlotIds: [],
      otaBootResolved: true, cognitiveStatus: 'ready',
    });
    let commits = 0;
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => {
      tree = renderer.create(
        <Profiler id="title" onRender={() => { commits += 1; }}><TitleScreen /></Profiler>,
      );
    });
    await flush();
    mounted.push(tree);
    // ⚠ Let the screen's PRE-EXISTING boot work land first, all of it: the
    // APK-pointer hydrate, the GitHub refresh and OTA-405's 5s gate cap are
    // this screen's own, predate VIS-1, and are not what this test is about.
    // Past 6s every one of them has fired and the screen is genuinely at rest.
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 6200)); });
    // OTA-1294's re-read of the roster lands during that settle; put ours back
    // and let THAT commit land before the idle window opens.
    await renderer.act(async () => {
      useGameStore.setState({ slots: [slot(), slot({ slotId: 'slot-b', playerName: 'Vessa' })] });
    });
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    const settled = commits;
    // Now a second and a bit of wall clock with nobody touching anything.
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 4000)); });
    expect(commits - settled).toBe(0);
    // And expanding a record costs ONE commit, not a stream of them.
    const before = commits;
    await renderer.act(async () => { (pressablesSaying(tree, 'Corvin')[0]!.props.onPress as () => void)(); });
    await flush();
    expect(commits - before).toBeLessThanOrEqual(2);
    // ...and then goes quiet again. FlatList lands one follow-up commit of its
    // own after a row changes height; what matters is that it STOPS, which a
    // looping glow or a per-frame JS animation would not.
    const afterExpand = commits;
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    expect(commits - afterExpand).toBeLessThanOrEqual(1);
    const quiet = commits;
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    expect(commits - quiet).toBe(0);
  });

  it('⚠ a long Tartarian name cannot push the time stamp off the record', async () => {
    const long = 'Aurelianus Threnody of the Sunken Cartograph Guild';
    const tree = await mountTitle([slot({ playerName: long })]);
    expect(allText(tree)).toContain(long);
    // The name row shrinks and clips to one line; the time stamp keeps its own
    // space in the row rather than being pushed out of the plate.
    expect(TITLE).toContain('slotNameRow: { flexDirection: \'row\', alignItems: \'baseline\', gap: 8, flexShrink: 1 }');
    await renderer.act(async () => { (pressablesSaying(tree, long)[0]!.props.onPress as () => void)(); });
    await flush();
    expect(allText(tree)).toContain(long);
  });

  it('⚠ an empty roster still explains itself', async () => {
    const tree = await mountTitle([]);
    expect(allText(tree)).toContain('No Tartarians yet');
  });

  it('⚠⚠ Resurrection Gems read as a held resource, and only when the player holds any', async () => {
    const none = await mountTitle([slot()], 0);
    expect(allText(none)).not.toContain('RESURRECTION GEM');
    const one = await mountTitle([slot()], 1);
    expect(allText(one)).toContain('RESURRECTION GEM');
    expect(allText(one)).not.toContain('RESURRECTION GEMS');
    const many = await mountTitle([slot()], 3);
    expect(allText(many)).toContain('RESURRECTION GEMS');
    // No invented economy: the count and the existing name, nothing more.
    expect(TITLE).not.toMatch(/gems? (earn|spend|shop|market)/i);
  });

  it('⚠⚠ every peripheral control the owner asked for is still on the screen', async () => {
    const tree = await mountTitle([slot()]);
    const text = allText(tree);
    /* ⚠⚠⚠ VIS-1-PHONE-FIX — THE LIST GOT SHORTER BY OWNER ORDER, AND THE
     * CAPABILITIES DID NOT. Seeing Visual #1 on the Pixel, the owner asked for
     * RESTORE FROM BACKUP, EXIT GAME, REPORT BUG and INVITE PLAYTESTER to come
     * off this screen. EXIT GAME is deleted outright (on Android it only
     * backgrounds the app — a control that lied about what it did); the other
     * three are in Settings, which is asserted below rather than taken on
     * trust. What must still be HERE is the game's own two actions. */
    for (const label of ['NEW TARTARIAN', 'CHECK FOR OTA UPDATE']) {
      expect(text).toContain(label);
    }
    for (const gone of ['RESTORE FROM BACKUP', 'INVITE PLAYTESTER', 'REPORT BUG', 'EXIT GAME',
      'Thank you for helping us test our new game']) {
      expect({ gone, onTitle: text.includes(gone) }).toEqual({ gone, onTitle: false });
    }
    const about = read('app', 'screens', 'AboutScreen.tsx');
    expect(about).toContain('RESTORE FROM BACKUP (paste a backup first)');
    expect(about).toContain('INVITE A PLAYTESTER');
    expect(about).toContain('REPORT A BUG');
    // ⚠ EXIT GAME is the one that is GONE, not moved.
    expect(TITLE).not.toContain('BackHandler.exitApp');
    expect(about).not.toContain('BackHandler.exitApp');
    // Settings still reachable from the corner gear.
    expect(TITLE).toContain('accessibilityLabel="Settings"');
  });

  it('⚠ build identity is demoted, not deleted — same words, quieter place', async () => {
    const tree = await mountTitle([slot()]);
    const text = allText(tree);
    expect(text).toContain('BUILD');            // the arb132/OTA-1228 marker still renders
    expect(text).toContain('Year 2148');        // beside the version + in-world year
    expect(TITLE).toContain('<View style={styles.metaRow}>');
    // And it renders BELOW the roster now, not under the crest.
    expect(TITLE.indexOf('styles.metaRow')).toBeGreaterThan(TITLE.indexOf('<TStrata />'));
    expect(TITLE.indexOf('styles.buildMarker')).toBeGreaterThan(TITLE.indexOf('ListFooterComponent'));
  });

  it('⚠⚠ the crest and TARTARIA REALMS are preserved exactly — the brief said support it, not redesign it', async () => {
    const tree = await mountTitle([slot()]);
    const text = allText(tree);
    expect(text).toContain('TARTARIA');
    expect(text).toContain('REALMS');
    expect(TITLE).toContain("source={require('../../assets/icon.png')}");
    expect(existsSync(join(ROOT, 'assets', 'icon.png'))).toBe(true);
    // A long name cannot push the name row into the time stamp.
    expect(TITLE).toContain('numberOfLines={1}>{item.playerName}</Text>');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1742 — the language is reusable, and the first pass stayed in its lane', () => {
  it('⚠⚠ the kit ships a small vocabulary, not dozens of abstractions', () => {
    const exported = [...KIT.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]!);
    expect(exported).toContain('TPanel');
    expect(exported).toContain('TButton');
    expect(exported).toContain('TFactionPlate');
    /* ⚠ CEILING RAISED 14 → 16 BY VIS-3 (OTA-1746), NOT RELAXED. That pass was
     * asked for a second SHAPE — a housing you can cut things into, as opposed
     * to a plate that sits on the world — and it cost exactly one new component
     * (TSurface) plus its type export. The point of this number is unchanged:
     * a kit that grows a component per screen is not a language, it is a
     * junk drawer. Raising it again needs a brief that asks for a shape the
     * existing ones cannot make.
     *
     * ⚠ 16 → 17 BY OTA-1748, AND THAT IS THE RULE BEING FOLLOWED RATHER THAN
     * BENT. The settings mark was `⚙` rendered as TEXT — so the icon belonged to
     * whichever symbol font the device shipped, and U+2699 has an emoji
     * presentation variant that can render in colour and ignore the colour we
     * set. Native builds are parked, so `react-native-svg` and icon fonts cannot
     * ship at all; drawing it was the only font-independent option. A ring and
     * eight radial teeth is genuinely a shape none of the primitives above can
     * make, which is exactly the brief this ceiling asks for.
     *
     * ⚠⚠⚠ OTA-1759 SPLIT THE COUNT INSTEAD OF RAISING IT, AND THE DISTINCTION IS
     * THE ONE THIS COMMENT ALREADY MAKES. Everything above argues about
     * COMPONENTS — "a kit that grows a component per SCREEN is not a language",
     * "raising it needs a brief that asks for a SHAPE the existing ones cannot
     * make". `tRowStyle` is neither: it is a style helper, and TRow is
     * deliberately NOT a component because the four list screens' interactions
     * do not converge. Under this ceiling's own stated rule it therefore cannot
     * justify a raise — so the component budget is UNCHANGED at 12, and the
     * non-component exports (tokens, type scale, two constants, the stylesheet,
     * and now this helper) get their own tighter bound. That is stricter than
     * the single number was, not looser: the drawer can no longer fill up with
     * helpers while the component count sits still. */
    /* ⚠ A component is an exported FUNCTION with a `T`-prefixed name. The kind
     * matters: `TType` is a StyleSheet and would otherwise be counted as a
     * thirteenth component by its name alone. */
    const decls = [...KIT.matchAll(/^export (function|const) (\w+)/gm)];
    const components = decls.filter((m) => m[1] === 'function' && /^T[A-Z]/.test(m[2]!));
    const helpers = decls.filter((m) => !(m[1] === 'function' && /^T[A-Z]/.test(m[2]!)));
    /* ⚠⚠⚠ 12 → 13 BY OTA-1762 (TTabBar), AND THIS IS THE RULE BEING FOLLOWED.
     * The ceiling says a raise "needs a brief that asks for a SHAPE the existing
     * ones cannot make". A tab bar is a SEGMENTED SELECTOR — a row of mutually
     * exclusive controls where exactly one holds a selected state — and nothing
     * above expresses that. `TButton` is a single control; `TScreenHeader` is a
     * fixed back/title/slot row. Neither can say "one of N".
     * ⚠ And the arithmetic is the opposite of a junk drawer: ONE component
     * replaces FIVE hand-rolled bars carrying FIFTEEN tabs. It is also named in
     * the rollout's own Tier 0 list, so it arrives by instruction rather than by
     * a screen quietly needing something. That is exactly the distinction this
     * test was re-aimed at in VIS-3. */
    expect(components.length).toBeLessThanOrEqual(13);
    expect(helpers.length).toBeLessThanOrEqual(6);
    expect(exported.length).toBeLessThanOrEqual(19);
  });

  /* ⚠⚠⚠ SUPERSEDED BY VIS-3 (OTA-1746) — AND THE REASONING IS KEPT HERE RATHER
   * THAN DELETED WITH IT.
   *
   * As written, this asserted the kit had EXACTLY ONE consumer, because VIS-1's
   * brief said the first pass was to establish a language and use ONE screen as
   * its reference implementation — not to redecorate the game. That was right
   * for OTA-1742 and it is not right now: VIS-3 was explicitly asked to make
   * every major surface feel purpose-designed, and Exploration was the screen
   * still built entirely out of backgroundColor + borderColor.
   *
   * ⚠ SO THE RULE IS NOT DROPPED, IT IS RE-AIMED. What this test was really
   * protecting is that propagation happens BY INSTRUCTION and never by drift —
   * one screen quietly importing the kit for one control is how a design system
   * becomes a second, inconsistent one. The consumer list therefore stays an
   * EXACT list. A third screen joining it is a real decision that shows up as a
   * failing test, which is exactly what should happen. */
  it('⚠⚠⚠ propagation is by instruction, never by drift — the consumer list is exact', () => {
    /* Still off, and still by name: these were never asked for.
     * ⚠⚠⚠ OTA-1758 REMOVED `ContractsScreen` FROM THIS LIST, DELIBERATELY, AND
     * THAT IS THE MECHANISM WORKING. This test is the guardrail that stops a
     * second design system forming by drift, and it caught the Tier 0 header
     * rollout the moment two screens imported a primitive without the list
     * being updated in the same commit. Widening it is an ACT, recorded here;
     * a screen that appears in `consumers` below without a line in this comment
     * is drift, and drift is what this test exists to fail on.
     * ⚠⚠ OTA-1759 REMOVED `VendorScreen` AND `CraftingScreen` for `TRow` — the
     * two screens whose base row was BYTE-IDENTICAL to the other's, which is
     * what made the chassis an extraction rather than a preference. Inventory
     * stays off: its row disagrees on `marginBottom` (4 against 6) and carries a
     * third border state, so its adoption is a decision, not a substitution. */
    const off = ['CombatScreen', 'InventoryScreen',
      'CharacterScreen', 'GuidanceScreen'];
    for (const name of off) {
      const p = join(ROOT, 'app', 'screens', `${name}.tsx`);
      if (!existsSync(p)) continue;
      expect(readFileSync(p, 'utf8')).not.toContain('tartariaKit');
    }
    const screens = require('fs').readdirSync(join(ROOT, 'app', 'screens')) as string[];
    const consumers = screens.filter((f) => f.endsWith('.tsx')
      && readFileSync(join(ROOT, 'app', 'screens', f), 'utf8').includes('tartariaKit')).sort();
    /* VIS-1's reference implementation, VIS-3's polish target, the two screens
     * that adopted `TScreenHeader` in OTA-1758 (chosen for their regression
     * cover — 31 and 9 referencing suites — not for convenience), and the two
     * that adopted `tRowStyle` in OTA-1759.
     * ⚠ The four thin-cover screens (Log, Lore, Guidance, World) are NOT here
     * and must not be added until the owner's open decision about writing
     * cover first is settled. */
    expect(consumers).toEqual([
      'ActionReferenceScreen.tsx',
      'ContractsScreen.tsx',
      'CraftingScreen.tsx',
      'ExplorationScreen.tsx',
      'TitleScreen.tsx',
      'VendorScreen.tsx',
    ]);
  });

  it('⚠ typography is a handful of functional roles, not a pile of decorative fonts', () => {
    const roles = [...KIT.matchAll(/^\s{2}(\w+): \{ fontSize/gm)].map((m) => m[1]!);
    const typeBlock = KIT.slice(KIT.indexOf('export const TType'), KIT.indexOf('// ─── ORNAMENT'));
    const declared = [...typeBlock.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]!);
    expect(declared.length).toBeGreaterThanOrEqual(4);
    /* ⚠ 6 → 8 BY VIS-3 (OTA-1746). The brief asked for typography to be a
     * SYSTEM with named roles, and found two that every screen was already
     * faking by re-colouring `body` or `meta` inline at the call site: an
     * instrument readout (technical) and a condition the player is under
     * (status). Naming a role that already exists in practice shrinks the
     * vocabulary; it does not grow it. The ceiling is still low on purpose —
     * the failure this guards against is a pile of decorative sizes, and the
     * OTA-1746 suite adds the sharper version of the same rule: exactly one
     * role may be large, so hierarchy can never be bought with font size. */
    expect(declared.length).toBeLessThanOrEqual(8);
    // And no custom font is loaded — the roles are weight, size and tracking.
    expect(KIT).not.toContain('fontFamily');
    void roles;
  });

  it('⚠⚠ one ornament motif, repeated — so the controls would still read as Tartaria with the logo cropped out', () => {
    // The brief's own test. The survey diamond marks the resource, flanks the
    // primary action and breaks the section rule; the registration corners mark
    // every record. Two motifs, used everywhere, invented nowhere else.
    expect((KIT.match(/◈/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(KIT).toContain('corner:');
    // No second decorative vocabulary crept in.
    for (const banned of ['✦', '✧', '★', '❖', '⚜']) expect(KIT).not.toContain(banned);
  });
});
