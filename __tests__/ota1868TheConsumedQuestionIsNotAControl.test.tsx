/**
 * ⚠⚠⚠ #193 — THE TRAY REMEMBERS THE QUESTION; THE CONTROL NO LONGER OFFERS AN
 * ACTION.
 *
 * OTA-1866 made a vendor question ask-once. OTA-1867 gave the six two-line
 * topics real follow-ups. Both were about STATE, and both were right. This is
 * about the CONTROL, and it was wrong the whole time.
 *
 * ⚠ THE DEVICE. A Pixel 10 Pro XL session on OTA-1866, vendor Odar Flameforge:
 * 20 question selections, 2 distinct questions, 2 legitimate first answers,
 * 18 defensive refusals, 18 of 19 selections on one row — `Ask about their
 * trade` — every refusal the same sentence, because `alreadySaidLine` is one
 * fixed sentence. The owner's word for it: *"Conversation repatolition"*.
 *
 * ⚠⚠ NOTHING ABOUT THE STATE CONTRACT FAILED. The question really was already
 * consumed, `topicSpent` really did say so, and `raiseTopic` really did refuse
 * the second answer. What failed is that a question with NOTHING LEFT TO GIVE
 * still behaved like a live control: it took the touch, ran the press
 * animation, called the mutation, and spent a feed line saying no. `asked`
 * decided the border colour, the ink colour and the word `(asked)` — and
 * nothing else. `onPress` was unconditional.
 *
 * OWNER RULING (final, option A): a consumed vendor question REMAINS VISIBLE in
 * the tray as `(asked)`, and is completely disabled and non-actionable.
 *
 * ⚠ SO `disabled` IS THE REPAIR, AND IT IS THE REAL ONE. Not `onPress={() =>
 * {}}`, which leaves the element semantically actionable and lies to touch, to
 * accessibility and to automation alike. A disabled `Pressable` never becomes
 * the touch responder — `Pressability.onStartShouldSetResponder` returns
 * `!disabled` — so `onPressIn` never fires, `pressed` can never go true, the
 * press language and the planes stay at rest, and `onPress` is gated a second
 * time even if something called it. §A asks the RENDERED CONTROL for that gate
 * rather than trusting the prop, which is why these tests reach for the host
 * node's own responder handler.
 *
 * ⚠⚠ AND THE STATE LAYER'S GUARD STAYS. UI prevention and state-layer defence
 * are different jobs. Normal play can no longer reach `raiseTopic` on a spent
 * topic (§B, §C, §D prove it through the real tray), but a stale or
 * programmatic caller still can, and when one does it must still refuse a
 * second answer (§G). Deleting the guard because the door is shut would be
 * trading defence in depth for tidiness.
 *
 * ⚠ NO SPECIAL CASES. The rule is `topicSpent(topic, npcId, talked)` and
 * nothing else: no vendor-name check, no topic-id allowlist, no six-row
 * exception, no Odar branch. §A walks the corpus, §C is class-laned, §D is the
 * six authored pairs, §E is the migrated legacy states.
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
// ⚠ Sound is a plain object, not a class with a self-referential static: the
// `static createAsync = jest.fn(...)` spelling infers TS7022 and would push the
// test-typecheck ratchet past its baseline.
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: {
      createAsync: jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      })),
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));


jest.setTimeout(120_000);

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { Text } from 'react-native';
import rawTopics from '../app/data/npcs/dialogue_topics.json';
import {
  alreadySaidLine, conversationMemory, topicSpent, topicsFor,
  type Topic, type TalkContext,
} from '../app/engine/dialogue';
import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';
import { useGameStore } from '../app/state/gameStore';
import { TalkSheet } from '../app/components/TalkSheet';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

/** The house shape — `react-test-renderer` ships no declarations, so an
 *  `import` of it is an implicit `any` and pushes the test-typecheck ratchet. */
interface TI { type: unknown; props: Record<string, unknown>; findAll(f: (n: TI) => boolean): TI[] }
interface TestTree { root: TI; unmount(): void }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => TestTree;
  act: (fn: () => void) => void;
};

const SETS = (rawTopics as { npcs: Record<string, { displayName: string; topics: Topic[] }> }).npcs;

/* The six OTA-1867 pairs, named rather than discovered — "which topics were
 * split" is a historical fact about six authored rows, and ota1867 §A already
 * pins the list both ways. */
const PAIRS = [
  { set: 'irma_ironhand', q1: 'irma_berrin', q2: 'irma_berrin_more' },
  { set: 'irma_ironhand', q1: 'irma_nimari', q2: 'irma_nimari_filed' },
  { set: 'halem_trader', q1: 'halem_stayed', q2: 'halem_stayed_sera' },
  { set: 'elara_lightfinger', q1: 'elara_ring', q2: 'elara_ring_mirei' },
  { set: 'felra_swiftfoot', q1: 'felra_stopped', q2: 'felra_stopped_song' },
  { set: 'nalren_frostgrip', q1: 'nalren_why', q2: 'nalren_why_second' },
] as const;

const ODAR = { id: 'odar_flameforge', name: 'Odar Flameforge' };
/** OTA-1866's own reproduction: `roadside:ilva_sidelong` → `class:roadside`,
 *  three laned questions, 79 presses in 25.1 s on the device. */
const ILVA = { id: 'roadside:ilva_sidelong', name: 'Ilva Sidelong' };
/** Her three laned questions. `class:roadside` names them `c_*`; an AUTHORED
 *  person's equivalents are `t_*`. Both go through the same tray. */
const LANED = ['c_front', 'c_known', 'c_deep'] as const;
/** A SECOND AUTHORED PERSON who shares Odar's topic IDS — the honest test of
 *  cross-person isolation is two people whose keys differ only by the npcId. */
const TAREK = { id: 'tarek_tinkerer', name: 'Tarek the Tinkerer' };

const topicOf = (set: string, id: string): Topic => {
  const t = SETS[set]!.topics.find((x) => x.id === id);
  if (!t) throw new Error(`no topic ${set}/${id}`);
  return t;
};

const talkedNow = (): Record<string, number> =>
  useGameStore.getState().worldMemory.talkedTopics ?? {};
const countFor = (npcId: string, topicId: string): number => talkedNow()[`${npcId}:${topicId}`] ?? 0;
const worldLines = (): string[] =>
  useGameStore.getState().gameLog.filter((e) => e.channel === 'world').map((e) => e.text);
const feedLength = (): number => useGameStore.getState().gameLog.length;
/** ⚠ OTA-1063 — a FIRST raise appends a flourish beat to the SAME world entry,
 *  so a reply entry STARTS WITH its authored paragraph rather than equalling
 *  it. Counting entries that open with the paragraph is the honest count. */
const answeredTimes = (paragraph: string): number =>
  worldLines().filter((l) => l.startsWith(paragraph)).length;
const refusalsFor = (name: string): number =>
  worldLines().filter((l) => l === alreadySaidLine(name)).length;

/** Seat this person in the scene at `trusted` and wipe conversation memory, so
 *  the REAL talk door can be walked. Mirrors ota1867's helper exactly. */
function seatPerson(npcId: string, name: string, talked: Record<string, number> = {}): void {
  const wm = useGameStore.getState().worldMemory;
  useGameStore.setState({
    worldMemory: {
      ...wm,
      talkedTopics: { ...talked },
      npcTranscripts: {},
      npcRelations: { ...(wm.npcRelations ?? {}), [npcId]: { meetings: 3, wrongs: 0, trades: 4, contractsTurnedIn: 2, tcTraded: 0 } as never },
    },
    gameLog: [],
    currentScene: { vendor: { id: npcId, name, faction: null, title: 'trader' } } as never,
    pendingTalk: null,
  });
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, pendingLead: null } as never });
}

/** Walk the REAL door: talkablePeople → talkContextFor → topicsFor →
 *  pendingTalk. Nothing about the tray is hand-built anywhere below. */
const openTalk = (name: string): void => { useGameStore.getState().talkToNpc(name); };

/* ── THE RENDERED CONTROL ──────────────────────────────────────────────────
 * Every claim in this suite is made against the tray the player actually
 * touches, not against a prop object we assembled. A topic row is found by its
 * own accessibility identity and its `disabled` prop, which the teaser row,
 * the collapse key, the breadcrumb and STOP TALKING do not carry. */
interface Row {
  id: string;
  label: string;
  /** what assistive technology reads */
  a11yLabel: string;
  asked: boolean;
  disabled: boolean;
  a11yDisabled: boolean | undefined;
  hasOnPress: boolean;
  /** the control's own answer to "may I take this touch" */
  takesTouch: boolean;
  restingStyle: unknown[];
  pressedStyle: unknown[];
  press: () => void;
}

function withTray<T>(fn: (rows: Row[], labels: string[]) => T): T {
  const pending = useGameStore.getState().pendingTalk;
  if (!pending) throw new Error('no open conversation');
  const byLabel = new Map(pending.topics.map((t) => [t.label, t.id]));
  let tree: TestTree | null = null;
  renderer.act(() => { tree = renderer.create(<TalkSheet />); });
  const t = tree as unknown as TestTree;

  const texts = t.root.findAll((n: TI) => n.type === Text).map((n: TI) => {
    const kids = n.props.children;
    return Array.isArray(kids) ? kids.join('') : String(kids ?? '');
  });
  const from = texts.indexOf('ASK ABOUT');
  const to = texts.indexOf('STOP TALKING');
  expect(from).toBeGreaterThanOrEqual(0);
  const labels = texts.slice(from + 1, to < 0 ? texts.length : to);

  const nodes = t.root.findAll((n: TI) => typeof n.props.accessibilityLabel === 'string'
    && n.props.accessibilityRole === 'button'
    && Object.prototype.hasOwnProperty.call(n.props, 'disabled'));
  const rows: Row[] = nodes.map((n: TI) => {
    const a11yLabel = n.props.accessibilityLabel as string;
    const asked = a11yLabel.endsWith(', already asked');
    const label = asked ? a11yLabel.slice(0, -', already asked'.length) : a11yLabel;
    const style = n.props.style as (s: { pressed: boolean }) => unknown[];
    /* ⚠ THE CONTROL'S OWN GATE, asked of the host node React Native actually
     * hands the touch to. `onStartShouldSetResponder` IS the door: false means
     * this element never becomes the responder, so onPressIn never runs, the
     * pressed style is never reached, and onPress is never called. */
    const hosts = n.findAll((h: TI) => typeof h.props.onStartShouldSetResponder === 'function');
    const gate = hosts.length
      ? (hosts[hosts.length - 1]!.props.onStartShouldSetResponder as () => boolean)
      : null;
    const onPress = n.props.onPress as (() => void) | undefined;
    return {
      id: byLabel.get(label) ?? `?${label}`,
      label,
      a11yLabel,
      asked,
      disabled: n.props.disabled === true,
      a11yDisabled: (n.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled,
      hasOnPress: typeof onPress === 'function',
      takesTouch: gate ? gate() === true : false,
      restingStyle: style({ pressed: false }),
      pressedStyle: style({ pressed: true }),
      /* A FINGER, faithfully: the touch lands, and the control decides. If it
       * refuses the responder nothing whatever happens — exactly the device. */
      press: () => {
        if (gate && gate() === true && typeof onPress === 'function') {
          renderer.act(() => { onPress(); });
        }
      },
    };
  });
  const out = fn(rows, labels);
  renderer.act(() => { t.unmount(); });
  return out;
}

const rowFor = (rows: Row[], id: string): Row => {
  const r = rows.find((x) => x.id === id);
  if (!r) throw new Error(`no rendered row ${id} (have: ${rows.map((x) => x.id).join(', ')})`);
  return r;
};
/** Open the tray, press one row the way a finger would, and close it. */
const pressRow = (id: string): void => { withTray((rows) => { rowFor(rows, id).press(); }); };

const ctxWith = (npcId: string, talked: Record<string, number>): TalkContext => ({
  regard: 'trusted', contractsTurnedIn: 99, standing: 99, titles: [],
  hasRecentRaidNews: true, chapter: 'ended', cores: 9, choices: [],
  lovedGifts: 9, pocketsMumbled: 9,
  topicConsumed: conversationMemory(npcId, talked),
} as unknown as TalkContext);

beforeAll(async () => {
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Presser', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
});

/* ══ A — THE CONTROL CONTRACT ═════════════════════════════════════════════ */

describe('A — unasked offers an action; consumed offers only a memory', () => {
  beforeEach(() => { seatPerson(ODAR.id, ODAR.name); openTalk(ODAR.name); });

  it('1 — an unasked question is visible in the tray', () => {
    withTray((rows, labels) => {
      expect(rows.length).toBeGreaterThanOrEqual(3);
      expect(labels).toContain(rowFor(rows, 't_front').label);
    });
  });

  it('2 — an unasked question is actionable: not disabled, and it carries a handler', () => {
    withTray((rows) => {
      for (const r of rows) {
        expect(r.asked).toBe(false);
        expect(r.disabled).toBe(false);
        expect(r.a11yDisabled).toBe(false);
        expect(r.hasOnPress).toBe(true);
      }
    });
  });

  it('3 — an unasked question takes the touch and keeps the house press language', () => {
    withTray((rows) => {
      const r = rowFor(rows, 't_front');
      expect(r.takesTouch).toBe(true);
      // OTA-1806's depression: pressed is a DIFFERENT face, and it is the kit's.
      expect(r.pressedStyle).toContain(kit.controlPressed);
      expect(r.restingStyle).not.toContain(kit.controlPressed);
    });
  });

  it('4 — pressing it delivers the one answer exactly once', () => {
    const line = topicOf(ODAR.id, 't_front').lines[0]!;
    pressRow('t_front');
    expect(countFor(ODAR.id, 't_front')).toBe(1);
    expect(worldLines().length).toBe(1);
    expect(refusalsFor(ODAR.name)).toBe(0);
    expect(typeof line).toBe('string');
  });

  it('5 — the consumed question REMAINS VISIBLE; the tray never silently shrinks', () => {
    const before = withTray((rows) => rows.length);
    pressRow('t_front');
    withTray((rows, labels) => {
      expect(rows.length).toBe(before);
      const r = rowFor(rows, 't_front');
      expect(labels.some((l) => l.startsWith(r.label))).toBe(true);
    });
  });

  it('6 — and still says `(asked)`, so the player can read what was already asked', () => {
    pressRow('t_front');
    withTray((rows, labels) => {
      const r = rowFor(rows, 't_front');
      expect(r.asked).toBe(true);
      expect(labels).toContain(`${r.label}  (asked)`);
    });
  });

  it('7 — the consumed question is disabled', () => {
    pressRow('t_front');
    withTray((rows) => { expect(rowFor(rows, 't_front').disabled).toBe(true); });
  });

  it('8 — assistive technology is told it is disabled AND still told it was asked', () => {
    pressRow('t_front');
    withTray((rows) => {
      const r = rowFor(rows, 't_front');
      expect(r.a11yDisabled).toBe(true);
      expect(r.a11yLabel).toBe(`${r.label}, already asked`);
    });
  });

  it('9 — ⚠ THE GATE: the consumed control refuses the touch itself', () => {
    pressRow('t_front');
    withTray((rows) => {
      // Not a claim about our prop — the rendered host node's own responder
      // decision. False here means onPressIn, `pressed` and onPress are all
      // unreachable by a finger, structurally.
      expect(rowFor(rows, 't_front').takesTouch).toBe(false);
      for (const r of rows) if (!r.asked) expect(r.takesTouch).toBe(true);
    });
  });

  it('10 — and carries NO handler at all, rather than an empty one', () => {
    pressRow('t_front');
    withTray((rows) => { expect(rowFor(rows, 't_front').hasOnPress).toBe(false); });
    // the source says it in the same breath, where a reader will see it
    const SRC = read('app/components/TalkSheet.tsx');
    expect(SRC).toMatch(/onPress=\{asked \? undefined : \(\) => raise\(t\.id\)\}/);
    expect(SRC).toMatch(/disabled=\{asked\}/);
    expect(SRC).toMatch(/accessibilityState=\{\{ disabled: asked \}\}/);
    expect(SRC).not.toMatch(/onPress=\{\(\) => \{\}\}/);
  });

  it('11 — the consumed row rests: no pressed cue on the face it actually shows', () => {
    pressRow('t_front');
    withTray((rows) => {
      expect(rowFor(rows, 't_front').restingStyle).not.toContain(kit.controlPressed);
    });
  });
});

/* ══ B — ODAR FLAMEFORGE, THE REAL-DEVICE SHAPE ═══════════════════════════ */

describe('B — the reported session: one row, eighteen dead presses', () => {
  it('12 — 18 repeat activations after the answer: no second answer, no refusal, no feed growth', () => {
    seatPerson(ODAR.id, ODAR.name);
    openTalk(ODAR.name);
    const paragraph = topicOf(ODAR.id, 't_front').lines[0]!;

    pressRow('t_front');                        // the one real answer
    expect(countFor(ODAR.id, 't_front')).toBe(1);

    const feedAfterAnswer = feedLength();
    const transcriptAfter = (useGameStore.getState().worldMemory.npcTranscripts?.[ODAR.id] ?? []).length;
    const invAfter = useGameStore.getState().player!.inventory.length;
    const leadAfter = useGameStore.getState().player!.pendingLead ?? null;
    const flourishAfter = useGameStore.getState().pendingTalk?.flourishCount ?? 0;

    for (let i = 0; i < 18; i += 1) pressRow('t_front');   // the reported 18

    expect(countFor(ODAR.id, 't_front')).toBe(1);
    expect(refusalsFor(ODAR.name)).toBe(0);
    expect(feedLength()).toBe(feedAfterAnswer);
    expect((useGameStore.getState().worldMemory.npcTranscripts?.[ODAR.id] ?? []).length).toBe(transcriptAfter);
    expect(useGameStore.getState().player!.inventory.length).toBe(invAfter);
    expect(useGameStore.getState().player!.pendingLead ?? null).toEqual(leadAfter);
    expect(useGameStore.getState().pendingTalk?.flourishCount ?? 0).toBe(flourishAfter);
    expect(typeof paragraph).toBe('string');
  });

  it('13 — the five questions never asked stayed live throughout', () => {
    seatPerson(ODAR.id, ODAR.name);
    openTalk(ODAR.name);
    pressRow('t_front');
    for (let i = 0; i < 18; i += 1) pressRow('t_front');
    withTray((rows) => {
      const live = rows.filter((r) => !r.asked);
      expect(live.length).toBe(rows.length - 1);
      for (const r of live) {
        expect(r.disabled).toBe(false);
        expect(r.takesTouch).toBe(true);
        expect(countFor(ODAR.id, r.id)).toBe(0);
      }
    });
  });

  it('14 — the whole session: 20 selections, 2 answers, and ZERO of the 18 refusals', () => {
    seatPerson(ODAR.id, ODAR.name);
    openTalk(ODAR.name);
    // the device's own sequence: two distinct questions, nineteen presses on one
    pressRow('t_front');
    pressRow('t_known');
    for (let i = 0; i < 18; i += 1) pressRow('t_front');
    expect(countFor(ODAR.id, 't_front')).toBe(1);
    expect(countFor(ODAR.id, 't_known')).toBe(1);
    expect(worldLines().length).toBe(2);
    expect(refusalsFor(ODAR.name)).toBe(0);
  });
});

/* ══ C — ILVA SIDELONG, THE OTA-1866 SHAPE (CLASS LANES) ══════════════════ */

describe('C — the class-laned reproduction', () => {
  it('15 — three laned questions, each consumed and disabled after its one answer', () => {
    seatPerson(ILVA.id, ILVA.name);
    openTalk(ILVA.name);
    const ids = withTray((rows) => rows.map((r) => r.id));
    expect(ids).toEqual(expect.arrayContaining(LANED));
    for (const id of LANED) pressRow(id);
    withTray((rows) => {
      for (const id of LANED) {
        const r = rowFor(rows, id);
        expect(r.asked).toBe(true);
        expect(r.disabled).toBe(true);
        expect(r.a11yDisabled).toBe(true);
        expect(r.takesTouch).toBe(false);
        expect(countFor(ILVA.id, id)).toBe(1);
      }
    });
  });

  it('16 — ⚠ the 79-press session is now structurally impossible through the tray', () => {
    seatPerson(ILVA.id, ILVA.name);
    openTalk(ILVA.name);
    for (const id of LANED) pressRow(id);
    const answers = worldLines().length;
    const feed = feedLength();
    // 79 presses in 25.1 s, spread over the three spent rows. No debounce.
    for (let i = 0; i < 79; i += 1) pressRow(LANED[i % 3]!);
    expect(worldLines().length).toBe(answers);
    expect(feedLength()).toBe(feed);
    expect(refusalsFor(ILVA.name)).toBe(0);
    for (const id of LANED) expect(countFor(ILVA.id, id)).toBe(1);
  });

  it('17 — the parallel voice lanes are untouched: one lane, one answer, still hers', () => {
    seatPerson(ILVA.id, ILVA.name);
    openTalk(ILVA.name);
    pressRow('c_front');
    const first = worldLines()[0]!;
    const lanes = topicOf('class:roadside', 'c_front').lines;
    expect(lanes.length).toBeGreaterThan(1);              // six parallel voices
    expect(lanes.some((l) => first.startsWith(l))).toBe(true);
    for (let i = 0; i < 12; i += 1) pressRow('c_front');
    expect(worldLines().length).toBe(1);                  // no rotation, no second lane
    expect(worldLines()[0]).toBe(first);
  });
});

/* ══ D — THE SIX OTA-1867 PAIRS, EACH ONE ════════════════════════════════ */

describe('D — Q1 sinks to (asked) and Q2 arrives live, in the same conversation', () => {
  for (const { set, q1, q2 } of PAIRS) {
    const name = SETS[set]!.displayName;
    const p1 = topicOf(set, q1).lines[0]!;
    const p2 = topicOf(set, q2).lines[0]!;

    it(`18..23 — ${set}: ${q1} → ${q2}`, () => {
      seatPerson(set, name);
      openTalk(name);

      // 18 — INITIAL: Q1 live, Q2 not offered at all.
      withTray((rows) => {
        const a = rowFor(rows, q1);
        expect(a.asked).toBe(false);
        expect(a.disabled).toBe(false);
        expect(a.takesTouch).toBe(true);
        expect(rows.some((r) => r.id === q2)).toBe(false);
      });

      pressRow(q1);

      // 19 — AFTER Q1, WITHOUT CLOSING: Q1 visible + (asked) + disabled, Q2 live.
      withTray((rows, labels) => {
        const a = rowFor(rows, q1);
        expect(a.asked).toBe(true);
        expect(a.disabled).toBe(true);
        expect(a.a11yDisabled).toBe(true);
        expect(a.takesTouch).toBe(false);
        expect(labels).toContain(`${a.label}  (asked)`);
        const b = rowFor(rows, q2);
        expect(b.asked).toBe(false);
        expect(b.disabled).toBe(false);
        expect(b.takesTouch).toBe(true);
        expect(b.hasOnPress).toBe(true);
      });

      // 20 — attempting Q1 again does nothing at all.
      const feed = feedLength();
      for (let i = 0; i < 6; i += 1) pressRow(q1);
      expect(feedLength()).toBe(feed);
      expect(countFor(set, q1)).toBe(1);
      expect(refusalsFor(name)).toBe(0);

      pressRow(q2);

      // 21 — both visible, both (asked), both disabled.
      withTray((rows, labels) => {
        for (const id of [q1, q2]) {
          const r = rowFor(rows, id);
          expect(r.asked).toBe(true);
          expect(r.disabled).toBe(true);
          expect(r.a11yDisabled).toBe(true);
          expect(labels).toContain(`${r.label}  (asked)`);
        }
      });

      // 22 — attempting either does nothing.
      const feed2 = feedLength();
      for (let i = 0; i < 6; i += 1) { pressRow(q1); pressRow(q2); }
      expect(feedLength()).toBe(feed2);
      expect(refusalsFor(name)).toBe(0);

      // 23 — and BOTH authored paragraphs were delivered, exactly once each.
      expect(answeredTimes(p1)).toBe(1);
      expect(answeredTimes(p2)).toBe(1);
      expect(countFor(set, q1)).toBe(1);
      expect(countFor(set, q2)).toBe(1);
    });
  }
});

/* ══ E — THE MIGRATED LEGACY STATES, WITH THEIR INTERACTION ══════════════ */

describe('E — a save from before the split opens in the right interaction state', () => {
  it('24 — LEGACY A (parent 0): Q1 live, Q2 not offered', () => {
    for (const { set, q1, q2 } of PAIRS) {
      seatPerson(set, SETS[set]!.displayName, {});
      openTalk(SETS[set]!.displayName);
      withTray((rows) => {
        expect(rowFor(rows, q1).disabled).toBe(false);
        expect(rows.some((r) => r.id === q2)).toBe(false);
      });
    }
  });

  it('25 — LEGACY B (parent 1): Q1 visible (asked) + disabled, Q2 live', () => {
    for (const { set, q1, q2 } of PAIRS) {
      seatPerson(set, SETS[set]!.displayName, { [`${set}:${q1}`]: 1 });
      openTalk(SETS[set]!.displayName);
      withTray((rows) => {
        const a = rowFor(rows, q1);
        expect(a.asked).toBe(true);
        expect(a.disabled).toBe(true);
        expect(a.takesTouch).toBe(false);
        const b = rowFor(rows, q2);
        expect(b.asked).toBe(false);
        expect(b.disabled).toBe(false);
        expect(b.takesTouch).toBe(true);
      });
    }
  });

  it('26 — LEGACY C (parent ≥2 — they already heard it): both visible, both disabled', () => {
    for (const { set, q1, q2 } of PAIRS) {
      seatPerson(set, SETS[set]!.displayName, { [`${set}:${q1}`]: 2 });
      openTalk(SETS[set]!.displayName);
      /* ⚠ THE INTERACTION CONFLICT THAT ISN'T. A gated-but-consumed legacy Q2
       * is SHOWN, not hidden: `requiresTopic` is satisfied by the parent's own
       * count, so the gate opens, and `legacyHeardWith` then reports it spent.
       * Migration semantics are untouched by #193 — the row was always in the
       * list; it is only the control that changed. */
      withTray((rows, labels) => {
        for (const id of [q1, q2]) {
          const r = rowFor(rows, id);
          expect(r.asked).toBe(true);
          expect(r.disabled).toBe(true);
          expect(r.a11yDisabled).toBe(true);
          expect(r.takesTouch).toBe(false);
          expect(r.hasOnPress).toBe(false);
          expect(labels).toContain(`${r.label}  (asked)`);
        }
      });
      // and neither can be re-asked into a second delivery
      for (let i = 0; i < 4; i += 1) { pressRow(q1); pressRow(q2); }
      expect(refusalsFor(SETS[set]!.displayName)).toBe(0);
      expect(worldLines().length).toBe(0);
    }
  });
});

/* ══ F — IT COMES FROM DURABLE MEMORY, NOT FROM THIS RENDER ══════════════ */

describe('F — the disabled state is conversation memory, not component state', () => {
  it('27 — close the conversation and reopen it: still visible, still (asked), still disabled', () => {
    seatPerson(ODAR.id, ODAR.name);
    openTalk(ODAR.name);
    pressRow('t_front');
    useGameStore.getState().closeTalk();
    expect(useGameStore.getState().pendingTalk).toBeNull();
    openTalk(ODAR.name);
    withTray((rows, labels) => {
      const r = rowFor(rows, 't_front');
      expect(r.asked).toBe(true);
      expect(r.disabled).toBe(true);
      expect(r.takesTouch).toBe(false);
      expect(labels).toContain(`${r.label}  (asked)`);
    });
  });

  it('28 — save and load: the row comes back disabled', async () => {
    seatPerson(ODAR.id, ODAR.name);
    openTalk(ODAR.name);
    pressRow('t_front');
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate();
    expect(countFor(ODAR.id, 't_front')).toBe(1);
    useGameStore.setState({
      currentScene: { vendor: { id: ODAR.id, name: ODAR.name, faction: null, title: 'trader' } } as never,
      pendingTalk: null,
    });
    openTalk(ODAR.name);
    withTray((rows) => {
      expect(rowFor(rows, 't_front').disabled).toBe(true);
      expect(rowFor(rows, 't_front').takesTouch).toBe(false);
    });
  });

  it('29 — no local cache: reconstruct the memory by hand and the control follows', () => {
    seatPerson(ODAR.id, ODAR.name);
    openTalk(ODAR.name);
    withTray((rows) => { expect(rowFor(rows, 't_deep').disabled).toBe(false); });
    // written straight into worldMemory — no raiseTopic, no press, no re-open
    const wm = useGameStore.getState().worldMemory;
    useGameStore.setState({
      worldMemory: { ...wm, talkedTopics: { ...(wm.talkedTopics ?? {}), [`${ODAR.id}:t_deep`]: 1 } },
    });
    withTray((rows) => {
      expect(rowFor(rows, 't_deep').disabled).toBe(true);
      expect(rowFor(rows, 't_deep').takesTouch).toBe(false);
    });
    const SRC = read('app/components/TalkSheet.tsx');
    expect(SRC).not.toMatch(/disabledTopics|spentCache|useState<[^>]*[Ss]pent/);
    expect(SRC).toMatch(/topicSpent\(topic, npcId, talked\)/);
  });

  it('30 — one person being asked never disables another person', () => {
    seatPerson(ODAR.id, ODAR.name);
    openTalk(ODAR.name);
    pressRow('t_front');
    const carried = useGameStore.getState().worldMemory.talkedTopics ?? {};
    seatPerson(TAREK.id, TAREK.name, carried);
    openTalk(TAREK.name);
    withTray((rows) => {
      const r = rowFor(rows, 't_front');
      expect(r.asked).toBe(false);          // same topic id, different person
      expect(r.disabled).toBe(false);
      expect(r.takesTouch).toBe(true);
    });
    expect(countFor(ODAR.id, 't_front')).toBe(1);
    expect(countFor(TAREK.id, 't_front')).toBe(0);
  });
});

/* ══ G — DEFENCE IN DEPTH, KEPT ══════════════════════════════════════════ */

describe('G — the state layer still refuses what the UI can no longer offer', () => {
  it('31 — a direct raiseTopic on a consumed topic still refuses a second answer', () => {
    seatPerson(ODAR.id, ODAR.name);
    openTalk(ODAR.name);
    pressRow('t_front');
    const inv = useGameStore.getState().player!.inventory.length;
    const lead = useGameStore.getState().player!.pendingLead ?? null;

    // bypassing the disabled control entirely — a stale or programmatic caller
    useGameStore.getState().raiseTopic('t_front');
    useGameStore.getState().raiseTopic('t_front');

    expect(countFor(ODAR.id, 't_front')).toBe(1);                 // no second answer
    expect(useGameStore.getState().player!.inventory.length).toBe(inv);  // no duplicate grant
    expect(useGameStore.getState().player!.pendingLead ?? null).toEqual(lead);   // the grant field
    /* ⚠ AND IT IS ALLOWED TO SAY SO. The refusal line is correct behaviour for
     * an impossible call; what #193 fixed is that a FINGER could produce it. */
    expect(refusalsFor(ODAR.name)).toBe(2);
  });

  it('32 — `alreadySaidLine` keeps exactly one production caller, inside that guard', () => {
    const callers = execSync(
      "grep -rn \"alreadySaidLine(\" app --include=*.ts --include=*.tsx | grep -v 'export function'",
      { cwd: ROOT },
    ).toString().trim().split('\n').filter(Boolean);
    const calls = callers.filter((l) => !/^app\/state\/gameStore\.ts:\d+:\s*hasTopicsFor/.test(l));
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatch(/^app\/state\/gameStore\.ts:\d+:\s*const dup = alreadySaidLine\(t\.npcName\);$/);
    const STORE = read('app/state/gameStore.ts');
    expect(STORE).toMatch(/if \(topicSpent\(topic, t\.npcId, get\(\)\.worldMemory\.talkedTopics\)\) \{\n\s*const dup = alreadySaidLine\(t\.npcName\);/);
  });

  it('33 — one tray renders vendor topics and one component reaches raiseTopic', () => {
    const renderers = execSync(
      'grep -rln "pendingTalk?.topics\\|ctx\\.topics\\b" app --include=*.tsx',
      { cwd: ROOT },
    ).toString().trim().split('\n').filter(Boolean);
    expect(renderers).toEqual(['app/components/TalkSheet.tsx']);
    /* ⚠ ParleySheet is the OTHER thing that says "topics", and it is a DOOR,
     * not a tray: `ctx.topicsNpcId` gates one "Just talk" key that OPENS this
     * sheet. It renders no topic row, so #193 reaches every one that exists. */
    const parley = read('app/components/ParleySheet.tsx');
    expect(parley).toMatch(/ctx\.topicsNpcId \? \(/);
    expect(parley).not.toMatch(/ctx\.topics\b|topicSpent|topicsFor/);
    const raisers = execSync(
      'grep -rln "raiseTopic" app --include=*.tsx', { cwd: ROOT },
    ).toString().trim().split('\n').filter(Boolean);
    expect(raisers).toEqual(['app/components/TalkSheet.tsx']);
  });
});

/* ══ H — WHAT #193 DID NOT TOUCH ═════════════════════════════════════════ */

describe('H — a UI interaction repair, and only that', () => {
  it('34 — no vendor name, no topic id, no six-row branch decides the control', () => {
    /* ⚠ COMMENTS ARE NOT BRANCHES. The block above this row names the device,
     * the vendor and the reported counts on purpose — that is the evidence, and
     * stripping it from the file to satisfy a census would be the wrong trade.
     * What must contain no person and no topic id is the CODE. */
    const SRC = read('app/components/TalkSheet.tsx');
    const codeOf = (src: string): string => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const region = codeOf(SRC.slice(SRC.indexOf('{ordered.map('), SRC.indexOf('OTA-1090 — the door')));
    expect(region).toMatch(/const asked = spent\(t\);/);
    for (const { set, q1, q2 } of PAIRS) {
      expect(region).not.toContain(set);
      expect(region).not.toContain(q1);
      expect(region).not.toContain(q2);
    }
    for (const needle of ['odar', 'Odar', 'ilva', 'Ilva', 't_front', 'npcId ===', 'npcName ===']) {
      expect(region).not.toContain(needle);
    }
  });

  it('35 — the corpus, the gates and the dependency graph are exactly as OTA-1867 left them', () => {
    const keys = Object.keys(SETS);
    expect(keys.length).toBe(41);
    expect(keys.reduce((n, k) => n + SETS[k]!.topics.length, 0)).toBe(353);
    for (const { set, q1, q2 } of PAIRS) {
      const b = topicOf(set, q2);
      expect((b.gate as { requiresTopic?: string } | undefined)?.requiresTopic).toBe(q1);
      expect(b.legacyHeardWith).toEqual({ topic: q1, atCount: 2 });
      expect(b.lines.length).toBe(1);
      expect(topicOf(set, q1).lines.length).toBe(1);
      // the engine's own reading of the graph, unchanged
      expect(topicsFor(set, ctxWith(set, {})).some((t) => t.id === q2)).toBe(false);
      expect(topicsFor(set, ctxWith(set, { [`${set}:${q1}`]: 1 })).some((t) => t.id === q2)).toBe(true);
      expect(topicSpent(topicOf(set, q2), set, { [`${set}:${q1}`]: 2 })).toBe(true);
    }
  });

  /* ⚠⚠⚠ THIS TEST REPLACES ONE THAT COULD NOT SURVIVE ITS OWN COMMIT.
   * It read `git diff --name-only HEAD -- app/` and expected the tray — which
   * described the DIRTY WORKTREE the author happened to be sitting in, not the
   * repository. On any clean checkout of the commit it describes, that diff is
   * empty by definition, so it passed locally before the commit and failed in
   * CI after it (run 2257, shard 3/4). A regression suite must assert
   * properties of the CHECKED-OUT CODE; reconstructing the author's editing
   * session is not a property of anything that ships.
   *
   * ⚠⚠ What it should have been asking is the claim #193 actually depends on.
   * §G-33 proves the boundary is centralised BETWEEN files — one renderer of
   * `pendingTalk.topics`, one caller of `raiseTopic`, ParleySheet a door rather
   * than a second tray. Nothing proved the boundary is airtight INSIDE that one
   * file: a second row, a duplicate, a future "ask again" affordance sitting
   * beside the guarded one would pass every other test in this suite and hand
   * the player back the dead key. So this asks the rendered conversation
   * directly, with two questions spent and the rest live: which controls will
   * take a touch, and what do they name. */
  it('36 — one control per question, and only a question with something left to give takes a touch', () => {
    seatPerson(ODAR.id, ODAR.name);
    openTalk(ODAR.name);
    pressRow('t_front');
    pressRow('t_known');

    const pending = useGameStore.getState().pendingTalk!;
    const spentLabels = pending.topics.filter((t) => topicSpent(t, ODAR.id, talkedNow())).map((t) => t.label);
    const liveLabels = pending.topics.filter((t) => !topicSpent(t, ODAR.id, talkedNow())).map((t) => t.label);
    expect(spentLabels.length).toBe(2);
    expect(liveLabels.length).toBeGreaterThan(0);

    let tree: TestTree | null = null;
    renderer.act(() => { tree = renderer.create(<TalkSheet />); });
    const t = tree as unknown as TestTree;

    // Every node the sheet renders that presents itself as a button. React
    // Native nests a few per logical control, so keep only the outermost of
    // each — that one is the control.
    const buttons = t.root.findAll((n: TI) => n.props.accessibilityRole === 'button'
      && typeof n.props.accessibilityLabel === 'string');
    const controls = buttons.filter((n: TI) => !buttons.some((o: TI) => o !== n
      && o.findAll((x: TI) => x === n).length > 0));

    const takesTouch = (n: TI): boolean => {
      const hosts = n.findAll((h: TI) => typeof h.props.onStartShouldSetResponder === 'function');
      return hosts.length
        ? (hosts[hosts.length - 1]!.props.onStartShouldSetResponder as () => boolean)() === true
        : false;
    };
    /* ⚠ READ THE TREE WHILE IT IS MOUNTED. `props` and the responder handlers
     * are live fibre reads, so anything lazy here throws "unable to find node
     * on an unmounted component" below. Flatten first, assert afterwards. */
    const offered = controls.map((n: TI) => ({
      label: n.props.accessibilityLabel as string,
      live: takesTouch(n),
    }));
    renderer.act(() => { t.unmount(); });

    const named = (label: string): string[] => offered
      .filter((c) => c.label === label || c.label === `${label}, already asked`)
      .map((c) => (c.live ? 'LIVE' : 'inert'));

    // ⚠ A consumed question is offered exactly ONE control, and that control
    // is inert. Not "the one we know about is inert" — every control in the
    // whole rendered conversation that names it.
    for (const label of spentLabels) expect(named(label)).toEqual(['inert']);
    // ⚠ And an unasked question is offered exactly ONE control, which is live.
    // A duplicate row would read ['LIVE', 'LIVE'] and fail here.
    for (const label of liveLabels) expect(named(label)).toEqual(['LIVE']);
    // No question is rendered twice and none is missing: one control each.
    expect(offered.filter((c) => [...spentLabels, ...liveLabels].some((l) =>
      c.label === l || c.label === `${l}, already asked`)).length)
      .toBe(pending.topics.length);
  });
});
