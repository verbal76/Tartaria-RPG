/* ⚠ THE NATIVE EDGE, MOCKED — the same preamble OTA-1756 carries, and for the
 * same reason: `MissionCompleteModal` reads the store, the store reaches the
 * whole engine, and the engine reaches onnxruntime and llama.rn, neither of
 * which exists in a Jest process. Reduce-motion is mocked on as well, because
 * it is a real shipped path AND it stops RN Animated graphs outliving teardown. */
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
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

/**
 * OTA-1862 — A BEAT MAY NOT GROW PAST THE SCREEN AND TAKE ITS WAY OUT WITH IT.
 *
 * ⚠⚠⚠ THE REPORT. The owner, on a physical iPhone SE: not all popups are
 * resolution-aware, and some extend partially off-screen. His ruling on how to
 * read that: *"Treat this as a CONFIRMED UI DEFECT, not a speculative audit."*
 * And on how to fix it: *"SAME UI / SAME CONTENT / SAME INTERACTION /
 * RESPONSIVE BOUNDS."* — no content deleted, shortened, hidden or conditionally
 * omitted to make a card fit, and no dialog turned into a full-screen page to
 * make a test green.
 *
 * ⚠⚠ THE DEFECT CLASS, NAMED PRECISELY. The kit carries two modal shells
 * (OTA-1777). `modalCard` — the DIALOG — has capped its height at 85% since
 * OTA-1614, so a dialog cannot outgrow the screen. `momentCard` — the BEAT —
 * declared no ceiling at all. The asymmetry stayed invisible for as long as it
 * did because Family B's six adopters solve containment two different ways:
 *
 *   WRAPPED  DogOnboarding · GolemNaming · WandererEncounter
 *            the whole card sits inside a ScrollView that is a flex child of
 *            the scrim, so the card may be any height and stays reachable.
 *   DIRECT   CombatPrimer · MissionComplete · MissionStinger
 *            the card hangs straight off `momentScrim`, whose
 *            `justifyContent: 'center'` pushes overflow off BOTH ends at once.
 *
 * Three of six were bounded by accident of construction and three were not
 * bounded at all. That is the class: A CARD THAT IS A DIRECT CHILD OF
 * `momentScrim` MUST DECLARE A CEILING. §C below states it as a rule over the
 * whole tree rather than as three filenames, because the seventh moment modal
 * somebody writes next year is exactly the one a list of three would miss.
 *
 * ⚠⚠⚠ AND MEASURED FROM THE AUTHORED CORPUS, NOT FROM A GUESS. The worst real
 * shape is a mission stinger, because both of its variable parts come from the
 * quest data: `line` is `stageDef.stinger ?? stageDef.narration` and `granted`
 * is the pack receipt for a RANGE of stages, so one card can list every grant
 * since the player last saw one. Across all 50 arcs / 281 stages the ceilings
 * are a 403-character line (hunts.json, "The Mud Titan of the Endless Stair")
 * and 8 grant-bearing stages in one arc ("The Red Tower's Mouth"). §A turns
 * those two numbers into the height the card wanted, and the answer is 780pt
 * inside a 667pt window — 113pt of overflow, centred, so ~56pt left the screen
 * at each end and the CTA was the part that went off the bottom.
 *
 * ⚠ WHAT THIS SUITE CANNOT DO, said plainly, in OTA-1799's words because they
 * are still true: it cannot open a keyboard, cannot measure a real safe-area
 * inset, and cannot tell you what an iPhone SE does. Level 2 renders real
 * components and asks STRUCTURAL questions, which are size-independent — the
 * device sweep lives in §A's arithmetic, and the phone lives with the owner.
 */
import React from 'react';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';

import { DEVICE_PROFILES } from '../app/engine/keyboardSafeCard';
import { tMomentCard, tModalCard, tartariaKitStyles as kit } from '../app/ui/tartariaKit';
import { CombatPrimerModal } from '../app/components/CombatPrimerModal';
import { MissionCompleteModal } from '../app/components/MissionCompleteModal';
import { MissionStingerModal } from '../app/components/MissionStingerModal';
import { useGameStore } from '../app/state/gameStore';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const flat = (s: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

/* ══════════════════════════════════════════════════════════════════════════
   §A — LEVEL 1. THE ARITHMETIC, OVER THE REAL DEVICE LIST.
   ══════════════════════════════════════════════════════════════════════════
   ⚠ Every number below that belongs to the kit is READ from the kit. Only the
   content model is written down here, and it is written down because a test
   renderer does not lay out text. */

/** The scrim's gutter and the card's ceiling, taken from the shipped styles so
 *  that re-tuning either of them re-runs this arithmetic rather than silently
 *  invalidating it. */
const SCRIM_PAD = Number(flat(kit.momentScrim).padding);
/** ⚠ ZERO WHEN THERE IS NO CEILING, rather than a throw. A shell with no
 *  `maxHeight` is exactly the pre-repair tree, and it has to fail the
 *  ASSERTIONS below — loudly, one by one, naming what it broke. A module-level
 *  throw would take the whole suite down with a single line and tell a future
 *  reader nothing about which guarantee they lost. */
const CEILING_FRACTION = (() => {
  const raw = String(flat(tMomentCard()).maxHeight ?? '');
  const m = /^(\d+(?:\.\d+)?)%$/.exec(raw);
  return m ? Number(m[1]) / 100 : 0;
})();

/** The interior the scrim leaves, and the tallest card it will allow there. */
const interiorOf = (windowHeight: number) => windowHeight - 2 * SCRIM_PAD;
const ceilingOf = (windowHeight: number) => CEILING_FRACTION * interiorOf(windowHeight);

/** ⚠⚠ THE WORST REAL BEAT, DERIVED. Measured on the narrowest supported phone
 *  (375pt wide): the scrim leaves 327pt, the card's own 20pt padding and 1pt
 *  rim leave 285pt of text column. At `line`'s fontSize 18 a proportional Latin
 *  face averages about half an em per glyph, so ~31 characters fit a line and
 *  the 403-character record needs 13 of them at lineHeight 27. A heavier face
 *  gives MORE lines, never fewer, so this is the optimistic end of the estimate
 *  and the defect is at least this bad.
 *    prose    ceil(403 / 31) = 13 × 27                        = 351
 *    grants   8 × (lineHeight 20 + marginTop 12)              = 256
 *    next     lineHeight 19 + marginTop 14                    =  33   */
const BEAT_BODY = 351 + 256 + 33;
/** The parts that are PINNED and therefore cannot be scrolled out of: the
 *  kicker (11pt type, ~13pt line), the rule with its 14pt margins, the CTA
 *  (22pt above it, 10pt padding each side of a ~14pt line) and the card's own
 *  20pt padding top and bottom plus its 1pt rim. */
const BEAT_CHROME = 13 + 29 + 56 + 40 + 2;
/** What a ScrollView needs to be worth having. Below this the "reading window"
 *  is a slot, not a region — and a card that can only show two lines of a beat
 *  has complied with the letter of the repair and failed the player. */
const MIN_READING_WINDOW = 64;

const profile = (name: string): number => {
  const vp = DEVICE_PROFILES[name];
  if (!vp) throw new Error(`no such device profile: ${name}`);
  return vp.windowHeight;
};

describe('OTA-1862 §A — the ceiling is real arithmetic on every supported phone', () => {
  it('⚠⚠⚠ the worst authored beat overflowed the smallest phone — the defect, computed', () => {
    const se = profile('iPhone SE 3');
    const natural = BEAT_BODY + BEAT_CHROME;
    // This is the state of the tree BEFORE the repair: the card's height was a
    // pure function of its content, and the content is authored.
    expect(natural).toBeGreaterThan(se);
    // Centred in the scrim, so the overflow leaves at BOTH ends — which is why
    // the owner saw a card that was cut off at the top as well as the bottom.
    const overflow = natural - se;
    expect(overflow).toBeGreaterThan(100);
    expect(overflow / 2).toBeGreaterThan(50);
  });

  it('⚠⚠ and the ceiling contains it, on every device in the list', () => {
    for (const [name, vp] of Object.entries(DEVICE_PROFILES)) {
      const ceiling = ceilingOf(vp.windowHeight);
      // A ceiling that cannot fit on the screen is not a ceiling.
      expect([name, ceiling < vp.windowHeight]).toEqual([name, true]);
      // The pinned parts always fit inside it — the CTA can never be pushed out.
      expect([name, ceiling > BEAT_CHROME]).toEqual([name, true]);
      // And what is left over is a region a player can actually read in.
      expect([name, ceiling - BEAT_CHROME >= MIN_READING_WINDOW]).toEqual([name, true]);
    }
  });

  it('⚠ the reading window never shrinks as the phone grows (shape E)', () => {
    /* The owner's fifth representative shape is the same popup on a larger
     * supported phone, and the claim worth making about it is not "it still
     * works" — it is that the repair is MONOTONIC. A percentage of the scrim's
     * interior is; a table of per-device magic numbers would not be, and the
     * brief forbids those: *"Do NOT create multiple SE-specific magic-number
     * branches."* */
    const heights = Object.values(DEVICE_PROFILES)
      .map((v) => v.windowHeight)
      .sort((a, b) => a - b);
    let previous = 0;
    for (const h of heights) {
      const window = ceilingOf(h) - BEAT_CHROME;
      expect(window).toBeGreaterThanOrEqual(previous);
      previous = window;
    }
    // ⚠⚠⚠ AND A FINDING THE ARITHMETIC PRODUCED RATHER THAN CONFIRMED. The
    // first draft of this test asserted that the biggest supported phone fits
    // the worst authored beat whole. It does not: 0.85 × (932 − 48) = 751pt
    // against the 780pt that beat wants. So the record beat overflows EVERY
    // supported device, and the reason the owner met it on an iPhone SE is only
    // that the SE meets it soonest and worst. Recorded as an assertion instead
    // of a comment, because it is the strongest statement of why the repair had
    // to be a ceiling plus a scroll and could not have been a bigger card.
    for (const [name, vp] of Object.entries(DEVICE_PROFILES)) {
      expect([name, ceilingOf(vp.windowHeight) < BEAT_BODY + BEAT_CHROME]).toEqual([name, true]);
    }
    // ⚠ The bigger phone is still not capped into looking like the smaller one:
    // it spends its extra height on the beat, which is the "responsive bounds"
    // half of the owner's rule stated as a number rather than promised.
    expect(ceilingOf(profile('iPhone 15 Pro Max')) - BEAT_CHROME)
      .toBeGreaterThan((ceilingOf(profile('iPhone SE 3')) - BEAT_CHROME) * 1.5);
  });

  it('⚠ a short beat is untouched by the ceiling — shape A, as arithmetic', () => {
    /* *"SAME UI"* has a testable meaning: a card that already fitted must be
     * laid out exactly as it was. A maxHeight only ever binds upward, so the
     * proof is that the ordinary beat is nowhere near it on the SMALLEST phone
     * — if it clears there it clears everywhere. */
    const shortBeat = 27 * 3 + BEAT_CHROME;   // a three-line shout, no grants
    expect(shortBeat).toBeLessThan(ceilingOf(profile('iPhone SE 3')));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §B — THE TWO SHELLS. ONE RULE, NOT TWO MAGIC NUMBERS.
   ══════════════════════════════════════════════════════════════════════════ */

describe('OTA-1862 §B — the beat shell finally has the ceiling the dialog shell had', () => {
  it('⚠⚠⚠ Family A is UNCHANGED by this pass', () => {
    /* The repair must not have moved the shell that was already correct. This
     * is the "did you fix it by breaking something else" assertion. */
    expect(flat(tModalCard(380)).maxHeight).toBe('85%');
  });

  it('⚠⚠⚠ Family B now declares the SAME ceiling, spelled the same way', () => {
    const beat = flat(tMomentCard());
    expect(beat.maxHeight).toBe('85%');
    // ⚠ Identical to the dialog's, on purpose. Two different ceilings would be
    // two rules to remember and two places to get it wrong; the brief's *"Do
    // NOT blindly replace every dimension with percentages"* cuts the other way
    // too — this is the one dimension that was already governed elsewhere, and
    // it is taken from there rather than invented here.
    expect(beat.maxHeight).toBe(flat(tModalCard(380)).maxHeight);
  });

  it('⚠⚠ and NOTHING ELSE about the beat shell moved', () => {
    /* OTA-1777 pins the shell's full value set; this narrows to the claim that
     * matters here — the repair is geometry, and only the one value. */
    const beat = flat(tMomentCard());
    expect(beat.width).toBe('100%');
    expect(beat.maxWidth).toBe(440);
    expect(beat.backgroundColor).toBe('#17150f');
    expect(beat.borderRadius).toBe(6);
    expect(beat.padding).toBe(20);
    // the rim is still a parameter, which is how MissionComplete keeps its green
    expect(flat(tMomentCard('#9ec96a')).borderColor).toBe('#9ec96a');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §C — THE RULE, OVER THE WHOLE TREE. NOT A LIST OF THREE FILENAMES.
   ══════════════════════════════════════════════════════════════════════════
   ⚠⚠ Written in OTA-1778's idiom, which this repo already trusts for kit
   geometry, and aimed at the one question that separated the safe three from
   the unsafe three: IS THE CARD A DIRECT CHILD OF THE SCRIM? If it is, it must
   carry a ceiling. If it is inside a scroller, it is bounded by construction
   and the ceiling would be inert anyway — a percentage resolves against a
   parent with a DEFINITE size, and a ScrollView's content container is sized by
   its content along the scroll axis. */

const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** Brace-balanced style body, or null — the reader OTA-1772 taught this repo. */
function bodyOf(src: string, key: string): string | null {
  const code = codeOf(src);
  const i = code.indexOf(`\n  ${key}: {`);
  if (i < 0) return null;
  const j = code.indexOf('{', i);
  let d = 0;
  for (let n = j; n < code.length; n += 1) {
    if (code[n] === '{') d += 1;
    else if (code[n] === '}') {
      d -= 1;
      if (d === 0) return code.slice(j + 1, n).split(/\s+/).join(' ').trim();
    }
  }
  return null;
}

interface MomentFile { file: string; wrapped: boolean; bounded: boolean }

/** Every file that draws the beat scrim, classified by how it contains its
 *  card — read from the code with the prose stripped first. */
function momentFiles(): MomentFile[] {
  const out: MomentFile[] = [];
  for (const dir of ['components', 'screens']) {
    for (const f of readdirSync(join(ROOT, 'app', dir))) {
      if (!f.endsWith('.tsx')) continue;
      const src = read('app', dir, f);
      const code = codeOf(src);
      const at = code.indexOf('kit.momentScrim');
      if (at < 0) continue;
      // What is the FIRST element the scrim opens onto? A scroller means the
      // card is contained by construction; anything else means the card hangs
      // directly off a centred, full-height wash.
      const after = code.slice(code.indexOf('>', at) + 1);
      const firstTag = /<\s*([A-Za-z][\w.]*)/.exec(after)?.[1] ?? '';
      const wrapped = firstTag === 'ScrollView' || firstTag === 'FlatList';
      /* Does its card carry a ceiling — its own, or the kit's? ⚠⚠ AND THE
       * KIT'S IS RESOLVED, NOT ASSUMED. The first draft read "this file calls
       * tMomentCard, therefore it is bounded", and a negative control that
       * stripped the ceiling out of the shell while leaving MissionStinger's
       * private copy in place walked straight past this scan: it was trusting
       * the primitive rather than reading it. A file that delegates is bounded
       * exactly when the thing it delegates to is. */
      const own = bodyOf(src, 'card');
      const kitIsBounded = flat(tMomentCard()).maxHeight !== undefined;
      const bounded = (own?.includes('maxHeight') ?? false)
        || (!own && /tMomentCard\(/.test(code) && kitIsBounded);
      out.push({ file: `${dir}/${f}`, wrapped, bounded });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

describe('OTA-1862 §C — no card may hang unbounded off the beat scrim', () => {
  it('⚠⚠⚠ the offender set is EMPTY, and a new one fails here rather than on a phone', () => {
    const offenders = momentFiles().filter((m) => !m.wrapped && !m.bounded).map((m) => m.file);
    expect(offenders).toEqual([]);
  });

  it('⚠⚠ the scan is not vacuous — it reaches both halves of the split', () => {
    /* A guard that matches nothing passes forever. The population is the six
     * beats OTA-1777 named, and the split this repair was about must still be
     * visible in it: some wrap, some do not, and the ones that do not are the
     * ones that needed the ceiling. */
    const all = momentFiles();
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all.filter((m) => m.wrapped).length).toBeGreaterThan(0);
    expect(all.filter((m) => !m.wrapped).length).toBeGreaterThan(0);
    // and every direct child, whichever files they are today, is bounded
    for (const m of all.filter((x) => !x.wrapped)) {
      expect([m.file, m.bounded]).toEqual([m.file, true]);
    }
  });

  it('⚠⚠⚠ MissionStinger got the ceiling WITHOUT overturning its governed exception', () => {
    /* The sharp case, and the one place this repair had to choose. OTA-1777
     * ruled that this beat *"remains EXPERIENTIAL"* and keeps a private card,
     * so the kit's new ceiling does not reach it. Taking `tMomentCard` would
     * have bought safety by reversing an owner ruling; copying the one value
     * buys the same safety and leaves the ruling standing. Both halves are
     * asserted, because either one alone would read as an accident. */
    const src = read('app', 'components', 'MissionStingerModal.tsx');
    expect(codeOf(src)).not.toContain('tMomentCard');
    expect(bodyOf(src, 'card')).toContain('maxHeight');
    // the rim, ground and air are still this card's own
    expect(bodyOf(src, 'card')).toContain("backgroundColor: '#17150f'");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §D — LEVEL 2. THE ARCHITECTURE, ASKED OF THE RENDERED TREE.
   ══════════════════════════════════════════════════════════════════════════
   ⚠⚠ WHY THIS IS NOT A SOURCE PIN. §C states the rule; this section proves the
   thing the rule exists for, by rendering the real components and asking:
     1. does the region whose height comes from the DATA have a scrolling
        ancestor, and
     2. does the WAY OUT not have one?
   Rename the styles, reorder the JSX, swap the container — it still answers
   correctly. Revert the region to a plain View and it fails. */

const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): Tree;
};

interface TestNode {
  type: unknown;
  parent: TestNode | null;
  props: Record<string, unknown>;
  children: unknown[];
}
interface Tree {
  unmount(): void;
  root: { findAll(fn: (n: TestNode) => boolean): TestNode[] };
}

const mounted: Tree[] = [];
const mount = (el: React.ReactElement): Tree => {
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(el); });
  mounted.push(tree);
  return tree;
};
afterEach(() => {
  while (mounted.length) {
    const t = mounted.pop()!;
    renderer.act(() => { try { t.unmount(); } catch { /* already gone */ } });
  }
  renderer.act(() => { useGameStore.setState({ missionCompleteNotice: null }); });
});

const SCROLL_HOSTS = new Set(['RCTScrollView', 'ScrollView', 'FlatList']);
const nameOf = (n: TestNode): string => {
  const t = n.type;
  return typeof t === 'string'
    ? t
    : (t as { displayName?: string; name?: string })?.displayName
      ?? (t as { name?: string })?.name
      ?? '';
};
const isScrollOwner = (n: TestNode): boolean => SCROLL_HOSTS.has(nameOf(n));
const hasScrollingAncestor = (n: TestNode): boolean => {
  for (let p = n.parent; p; p = p.parent) if (isScrollOwner(p)) return true;
  return false;
};
const isButton = (n: TestNode): boolean => (n.props ?? {}).accessibilityRole === 'button';

/** What a control says — label first, else the words drawn on its face. */
const faceOf = (node: TestNode): string => {
  const label = (node.props ?? {}).accessibilityLabel;
  if (typeof label === 'string' && label.length > 0) return label;
  const words: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') { words.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const n = v as TestNode | null;
    if (n && typeof n === 'object' && Array.isArray(n.children)) n.children.forEach(walk);
  };
  node.children.forEach(walk);
  /* ⚠ COLLAPSED, because a JSX line is assembled from fragments: `✦ {g} — in
   * your pack.` arrives as three children, and joining them with a space puts a
   * double space either side of the interpolation. What a player reads is one
   * run of words, so that is what this returns. */
  return words.join(' ').replace(/\s+/g, ' ').trim();
};

/** One node per control — a Pressable renders as several nested nodes that all
 *  carry the role, and they are identified by SAYING THE SAME THING (ota1799). */
const controls = (root: Tree['root']): TestNode[] =>
  root.findAll(isButton).filter((n) => {
    const face = faceOf(n);
    for (let p = n.parent; p; p = p.parent) if (isButton(p) && faceOf(p) === face) return false;
    return true;
  });

/** The beat card itself, found by its geometry rather than by a style name, so
 *  the search survives every rename: a host View capped at 440 on the warm
 *  ground all six beats share. */
const cardNode = (root: Tree['root']): TestNode => {
  const hits = root.findAll((n) => {
    if (nameOf(n) !== 'View') return false;
    const s = flat((n.props ?? {}).style);
    return s.maxWidth === 440 && s.backgroundColor === '#17150f';
  });
  const card = hits[0];
  if (!card) throw new Error('no beat card in the rendered tree');
  return card;
};

/** Text nodes carrying a given pattern — ONE NODE PER LINE. A `<Text>` renders
 *  as a composite node and a host node that say exactly the same thing, so a
 *  raw count doubles every line and "does this region track the data" would
 *  mean nothing; a node counts unless an ancestor Text has the same face. */
const textsMatching = (root: Tree['root'], rx: RegExp): TestNode[] => {
  const isText = (n: TestNode) => nameOf(n) === 'Text';
  return root.findAll(isText).filter((n) => {
    const face = faceOf(n);
    if (!rx.test(face)) return false;
    for (let p = n.parent; p; p = p.parent) if (isText(p) && faceOf(p) === face) return false;
    return true;
  });
};

/* ── D1. THE STINGER: the shape whose height comes entirely from the data ─── */

/** ⚠ The real ceilings from the authored corpus, quoted rather than invented:
 *  the longest `line` in the game and the largest grant run in one arc. */
const WORST_LINE =
  'The True Tartarian agent doesn\'t sit. "We can\'t go down there ourselves — every '
  + 'shake brings the Stair down on whoever\'s mid-descent." She seals a writ and hands '
  + 'it over. "Master Karin holds the upper concourse at Asgardar. She was lead engineer '
  + 'when the Stair was still a stair. Cut through the Buried Cities on your way — one of '
  + 'our gantries went down there this morning and nobody has reported back."';
const WORST_GRANTS = Array.from({ length: 8 }, (_, i) => `relic ${i + 1}`);

const renderStinger = (granted: string[], line = WORST_LINE): Tree => mount(
  <MissionStingerModal
    stinger={{ title: 'The Mud Titan of the Endless Stair', line, next: '▸ Next: the upper concourse', granted }}
    onClose={() => {}}
  />,
);

describe('OTA-1862 §D — the stinger scrolls its beat and pins its way out', () => {
  it('⚠⚠⚠ shape D — every line of the worst authored beat has a scrolling ancestor', () => {
    const tree = renderStinger(WORST_GRANTS);
    const grants = textsMatching(tree.root, /in your pack\./);
    expect(grants.length).toBe(WORST_GRANTS.length);
    for (const g of grants) expect(hasScrollingAncestor(g)).toBe(true);
    // the prose and the "next" line travel with them
    for (const t of textsMatching(tree.root, /Master Karin|▸ Next/)) {
      expect(hasScrollingAncestor(t)).toBe(true);
    }
  });

  it('⚠⚠⚠ and the CTA does NOT — it is pinned, which is the whole point', () => {
    /* The defect was never "the text was too long". It was that the ONE WAY OUT
     * went off the bottom with it. A CTA inside the scroll would be an
     * improvement and still not a fix. */
    const [cta] = controls(renderStinger(WORST_GRANTS).root)
      .filter((c) => /fight|continue/i.test(faceOf(c)));
    if (!cta) throw new Error('the stinger rendered no way out');
    expect(hasScrollingAncestor(cta)).toBe(false);
  });

  it('⚠⚠ shape B vs shape A — the structure does not depend on the content', () => {
    /* A card that grows a scroll region only once it is already too tall has
     * moved the threshold rather than fixed anything; and *"SAME UI"* means a
     * short beat must be laid out by the same tree as a long one. */
    const short = renderStinger([], 'The last of them is down.');
    const long = renderStinger(WORST_GRANTS);
    const regions = short.root.findAll(isScrollOwner).length;
    /* ⚠⚠ AND THERE HAS TO BE ONE. This assertion was written as an equality
     * alone, and a negative control that stripped the scroller out entirely
     * walked straight past it: zero regions equals zero regions. A test that
     * passes on a card with nothing to scroll is not checking the thing it
     * names. OTA-1799's NC-2 taught this repo exactly the same lesson on
     * exactly the same shape. */
    expect(regions).toBeGreaterThan(0);
    expect(long.root.findAll(isScrollOwner).length).toBe(regions);
    expect(controls(long.root).length).toBe(controls(short.root).length);
    // and the short one keeps its way out pinned too
    for (const tree of [short, long]) {
      expect(flat((cardNode(tree.root).props ?? {}).style).maxHeight).toBe('85%');
    }
  });

  it('⚠ no content was deleted, shortened or hidden to make it fit', () => {
    /* The owner's hardest constraint, asserted rather than promised: every one
     * of the eight receipts is still rendered, and so is the prose, in full. */
    const tree = renderStinger(WORST_GRANTS);
    for (const g of WORST_GRANTS) {
      expect(textsMatching(tree.root, new RegExp(`${g} — in your pack\\.`)).length).toBe(1);
    }
    expect(textsMatching(tree.root, /nobody has reported back/).length).toBe(1);
  });
});

/* ── D2. THE PRIMER: shape C, a popup with more than one action ───────────── */

describe('OTA-1862 §D — the combat primer keeps both of its controls reachable', () => {
  const renderPrimer = (): Tree => mount(
    <CombatPrimerModal visible enemyName="Gutter Rat" onClose={() => {}} />,
  );

  it('⚠⚠⚠ shape C — every control is pinned outside the scroll, not just the last one', () => {
    /* This card carries TWO ways out: "Turn off tips" and FIGHT. A multi-action
     * popup fails differently from a single-action one — the first control can
     * be visible while the second is off-screen, which reads as "the button
     * does nothing" rather than as a broken layout. */
    const found = controls(renderPrimer().root);
    expect(found.length).toBeGreaterThanOrEqual(2);
    for (const c of found) expect(hasScrollingAncestor(c)).toBe(false);
  });

  it('⚠⚠ and the guide text — the part that is long — is inside it', () => {
    const tree = renderPrimer();
    const rows = textsMatching(tree.root, /FLEE —|You can lose/);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(hasScrollingAncestor(r)).toBe(true);
  });

  it('⚠ the card carries the ceiling it now inherits from the kit', () => {
    expect(flat((cardNode(renderPrimer().root).props ?? {}).style).maxHeight).toBe('85%');
  });
});

/* ── D3. THE COMPLETION CARD: the one whose body comes from the store ─────── */

describe('OTA-1862 §D — the completion card yields its take and keeps GOOD', () => {
  const seed = (rewards: string[], flavor: string[]): Tree => {
    renderer.act(() => {
      useGameStore.setState({
        missionCompleteNotice: { kind: 'hunt', title: 'The Mud Titan of the Endless Stair', rewards, flavor },
      });
    });
    return mount(<MissionCompleteModal />);
  };
  const REWARDS = Array.from({ length: 10 }, (_, i) => `spoil ${i + 1}`);
  const FLAVOR = [WORST_LINE, WORST_LINE];

  it('⚠⚠⚠ the take and the flavour scroll; GOOD does not', () => {
    const tree = seed(REWARDS, FLAVOR);
    const rows = textsMatching(tree.root, /^✦ spoil \d+$/);
    expect(rows.length).toBe(REWARDS.length);
    for (const r of rows) expect(hasScrollingAncestor(r)).toBe(true);
    const [good] = controls(tree.root).filter((c) => /dismiss/i.test(faceOf(c)));
    if (!good) throw new Error('the completion card rendered no way out');
    expect(hasScrollingAncestor(good)).toBe(false);
  });

  it('⚠⚠ the structure is the same for a one-line take as for a ten-line one', () => {
    const small = seed(['spoil 1'], []);
    const big = seed(REWARDS, FLAVOR);
    expect(big.root.findAll(isScrollOwner).length).toBe(small.root.findAll(isScrollOwner).length);
    for (const tree of [small, big]) {
      expect(flat((cardNode(tree.root).props ?? {}).style).maxHeight).toBe('85%');
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §E — THE BODIES YIELD. THE SECOND HALF OF THE REPAIR.
   ══════════════════════════════════════════════════════════════════════════
   ⚠⚠ A ceiling on the card and a scroller in the middle are not enough on
   their own. React Native defaults `flexShrink` to 0, so under the new ceiling
   the body would refuse to give way and would push the pinned CTA straight
   through the card's bottom edge instead. `flexShrink: 1, flexGrow: 0` is the
   pair BrandedModal's `scrollArea` has carried since OTA-1799 — it yields when
   there is not enough room and stays content-sized when there is, which is why
   a short beat is laid out exactly as it always was. */

describe('OTA-1862 §E — the scrolling body yields to the ceiling', () => {
  const YIELDING = ['CombatPrimerModal', 'MissionCompleteModal', 'MissionStingerModal'] as const;

  it('⚠⚠⚠ each direct-child beat has a body that shrinks and does not grow', () => {
    for (const n of YIELDING) {
      const body = bodyOf(read('app', 'components', `${n}.tsx`), 'bodyWrap');
      expect([n, body]).not.toEqual([n, null]);
      expect([n, body!.includes('flexShrink: 1')]).toEqual([n, true]);
      expect([n, body!.includes('flexGrow: 0')]).toEqual([n, true]);
    }
  });

  it('⚠⚠ and it is the same pair the shared dialog primitive already used', () => {
    /* Stated as an equality with BrandedModal rather than as two literals, so
     * this repair cannot drift away from the idiom it borrowed. */
    const branded = bodyOf(read('app', 'components', 'BrandedModal.tsx'), 'scrollArea');
    expect(branded).toBe('flexShrink: 1, flexGrow: 0');
    expect(bodyOf(read('app', 'components', 'MissionStingerModal.tsx'), 'bodyWrap')).toBe(branded);
  });

  it('⚠ the two cards that had their own reading window KEPT it', () => {
    /* *"SAME UI"*: `MissionComplete` capped its body at 380 and `CombatPrimer`
     * at 360 long before this pass, for their own editorial reasons. Those are
     * the card's reading window, not the screen's, and the repair had no
     * business touching them. */
    expect(bodyOf(read('app', 'components', 'MissionCompleteModal.tsx'), 'bodyWrap'))
      .toContain('maxHeight: 380');
    expect(bodyOf(read('app', 'components', 'CombatPrimerModal.tsx'), 'bodyWrap'))
      .toContain('maxHeight: 360');
  });
});

describe('the stamp', () => {
  it('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain('-1862-');
  });
});
