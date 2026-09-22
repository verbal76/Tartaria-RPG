/**
 * ⚠⚠⚠ OTA-1867 — THE SECOND DISCLOSURE IS ITS OWN QUESTION.
 *
 * OTA-1866 made every visible vendor question ask-once and proved it across the
 * whole corpus. Reading the exceptions afterwards found six authored topics
 * carrying TWO disclosures behind ONE label — Irma's ring and Nimari, Halem's
 * crossroads, Elara's tin ring, Felra's last run, Nalren's cold. Ask-once and a
 * second answer cannot both be true: the second press is refused, so those six
 * second paragraphs had become unreachable to anyone playing after OTA-1866.
 *
 * Owner ruling: *"Every visible vendor conversation question is ask-once."*
 * Deeper conversation is a DISTINCT follow-up question, not the same question
 * asked twice.
 *
 * ⚠ SO THE DEPENDENCY IS CONVERSATION MEMORY, AND IT IS SAID OUT LOUD.
 * `TopicGate.requiresTopic` names a topic on the SAME person's set that must
 * already have been asked. It resolves through `conversationMemory(npcId,
 * talked)` — a closure, not the ledger — so the gate layer can ask exactly one
 * thing, "has THIS person answered THIS question", and the answer still comes
 * from `topicSpent`, which stays the only definition of spent. Absent context
 * fails CLOSED: a missing ledger never opens a door.
 *
 * ⚠ AND THE OLD MULTI-ASK AUTHORITY IS GONE, NOT DORMANT. `answersAvailable`
 * was a branch — one answer for a laned person, `lines.length` for an authored
 * one — and that branch is what two readers drifted across for a year. It is
 * now the constant `ANSWERS_PER_QUESTION`. §A pins the corpus side too: no
 * authored topic holds a second line for a future reader to reach for.
 *
 * ⚠ A CLASS SET'S SIX LINES ARE NOT SIX ASKS. `class:roadside` keeps six
 * PARALLEL VOICES per topic — `voiceLaneFor` picks the lane from the person's
 * id, permanently — inside ONE ask-once topic. §G proves both halves: the lane
 * still selects, and the topic is still consumed after one accepted question.
 *
 * ⚠ LEGACY IS A MIGRATION FIELD, NOT A RULE. A save from before the split can
 * hold `<npc>:<parent> = 2`, meaning that player ALREADY HEARD the second
 * disclosure. `Topic.legacyHeardWith` says so on the six converted rows, naming
 * the exact old parent and the exact old count. It is read in one place. It is
 * NOT "a follow-up inherits its parent's count" — that would be wrong for every
 * ordinary follow-up authored after today, and §D proves a follow-up without
 * the field starts unheard the moment its parent is asked.
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
import { Text } from 'react-native';
import rawTopics from '../app/data/npcs/dialogue_topics.json';
import {
  ANSWERS_PER_QUESTION, conversationMemory, gateAllows, topicSpent, topicsFor,
  topicReply, voiceLaneFor, usesClassSet, alreadySaidLine,
  type Topic, type TalkContext,
} from '../app/engine/dialogue';
import { useGameStore } from '../app/state/gameStore';
import { TalkSheet } from '../app/components/TalkSheet';

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
const SET_KEYS = Object.keys(SETS);

/* ── THE SIX, AND NOTHING ELSE ─────────────────────────────────────────────
 * Named here rather than discovered, because "which topics were split" is a
 * historical fact about six authored rows and must not quietly grow. §A also
 * checks the discovered set matches this list exactly, both ways. */
const PAIRS = [
  { set: 'irma_ironhand', q1: 'irma_berrin', q2: 'irma_berrin_more' },
  { set: 'irma_ironhand', q1: 'irma_nimari', q2: 'irma_nimari_filed' },
  { set: 'halem_trader', q1: 'halem_stayed', q2: 'halem_stayed_sera' },
  { set: 'elara_lightfinger', q1: 'elara_ring', q2: 'elara_ring_mirei' },
  { set: 'felra_swiftfoot', q1: 'felra_stopped', q2: 'felra_stopped_song' },
  { set: 'nalren_frostgrip', q1: 'nalren_why', q2: 'nalren_why_second' },
] as const;

const topicOf = (set: string, id: string): Topic => {
  const t = SETS[set]!.topics.find((x) => x.id === id);
  if (!t) throw new Error(`no topic ${set}/${id}`);
  return t;
};

/** A context generous on every WORLD dimension, so the only thing that can
 *  close a gate in these tests is the conversation itself. */
function worldlyCtx(over: Partial<TalkContext> = {}): TalkContext {
  return {
    regard: 'trusted', contractsTurnedIn: 99, standing: 99, titles: [],
    hasRecentRaidNews: true, chapter: 'ended', cores: 9, choices: [],
    lovedGifts: 9, pocketsMumbled: 9,
    ...over,
  } as unknown as TalkContext;
}

/** The same context, plus the conversation memory the store would build. */
const ctxWith = (npcId: string, talked: Record<string, number>): TalkContext =>
  worldlyCtx({ topicConsumed: conversationMemory(npcId, talked) });

const openIds = (npcId: string, talked: Record<string, number>): string[] =>
  topicsFor(npcId, ctxWith(npcId, talked)).map((t) => t.id);

const talkedNow = (): Record<string, number> =>
  useGameStore.getState().worldMemory.talkedTopics ?? {};
const countFor = (npcId: string, topicId: string): number => talkedNow()[`${npcId}:${topicId}`] ?? 0;

const worldLines = (): string[] =>
  useGameStore.getState().gameLog.filter((e) => e.channel === 'world').map((e) => e.text);

/** ⚠ OTA-1063 — a FIRST raise appends a flourish beat to the same world entry
 *  ("Irma Ironhand drops her voice…"), so a reply entry STARTS WITH its
 *  authored paragraph rather than equalling it. Counting entries that open with
 *  the paragraph is therefore the honest "how many times was this answered". */
const answeredTimes = (paragraph: string): number =>
  worldLines().filter((l) => l.startsWith(paragraph)).length;
const flourishCount = (): number => useGameStore.getState().pendingTalk?.flourishCount ?? 0;

/** Wipe conversation memory AND the relation ledger, then seat this person in
 *  the scene at `trusted` so the real TALK door can be walked. */
function seatPerson(npcId: string, name: string, rel: Record<string, number> = {}): void {
  const wm = useGameStore.getState().worldMemory;
  useGameStore.setState({
    worldMemory: {
      ...wm,
      talkedTopics: {},
      npcTranscripts: {},
      // meetings > 0 and contractsTurnedIn >= 2 is `trusted` on the OTA-1439
      // ladder — the rung all six parents sit at or below.
      npcRelations: { ...(wm.npcRelations ?? {}), [npcId]: { meetings: 3, wrongs: 0, trades: 4, contractsTurnedIn: 2, tcTraded: 0, ...rel } as never },
    },
    gameLog: [],
    currentScene: { vendor: { id: npcId, name, faction: null, title: 'trader' } } as never,
    pendingTalk: null,
  });
  const p = useGameStore.getState().player!;
  // OTA-1064's deferral rule has its own suite; an occupied lead slot would be
  // re-measured here instead of the thing under test.
  useGameStore.setState({ player: { ...p, pendingLead: null } as never });
}

/** Walk the REAL door: talkablePeople → matchTalkable → talkContextFor →
 *  topicsFor → pendingTalk. Nothing about the tray is hand-built. */
const openTalk = (name: string): void => { useGameStore.getState().talkToNpc(name); };
const trayIds = (): string[] => (useGameStore.getState().pendingTalk?.topics ?? []).map((t) => t.id);

/** What the player can actually read on the sheet, between the header and the
 *  exit — the transcript echoes each asked question, so a whole-sheet scrape
 *  would find a label that is no longer offered. */
function renderTray(): string[] {
  let tree: TestTree | null = null;
  renderer.act(() => { tree = renderer.create(<TalkSheet />); });
  const t = tree as unknown as TestTree;
  const all = t.root.findAll((n: TI) => n.type === Text)
    .map((n: TI) => {
      const kids = n.props.children;
      return Array.isArray(kids) ? kids.join('') : String(kids ?? '');
    });
  renderer.act(() => { t.unmount(); });
  const from = all.indexOf('ASK ABOUT');
  const to = all.indexOf('STOP TALKING');
  expect(from).toBeGreaterThanOrEqual(0);
  return all.slice(from + 1, to < 0 ? all.length : to);
}

beforeAll(async () => {
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Asker', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
});

/* ══ A — THE CORPUS AND THE GRAPH ═════════════════════════════════════════ */

describe('A — one question, one answer, corpus-wide', () => {
  it('1 — every authored topic holds exactly one line, so nothing needs a second ask', () => {
    const offenders: string[] = [];
    for (const k of SET_KEYS) {
      if (k.startsWith('class:')) continue;
      for (const t of SETS[k]!.topics) if (t.lines.length !== 1) offenders.push(`${k}/${t.id}=${t.lines.length}`);
    }
    expect(offenders).toEqual([]);
    expect(ANSWERS_PER_QUESTION).toBe(1);
  });

  it('2 — no sequential same-question conversation survives anywhere in the corpus', () => {
    // The old shape was: one label, N paragraphs, reached by pressing N times.
    // With ask-once that shape is content the player can never reach. The only
    // multi-line rows left are class sets, and those are lanes (§G).
    const sequential = SET_KEYS
      .filter((k) => !k.startsWith('class:'))
      .flatMap((k) => SETS[k]!.topics.filter((t) => t.lines.length > 1).map((t) => `${k}/${t.id}`));
    expect(sequential).toEqual([]);
  });

  it('3 — the six follow-up relationships are exactly the six, and every one is valid', () => {
    const discovered = SET_KEYS.flatMap((k) =>
      SETS[k]!.topics.filter((t) => t.gate?.requiresTopic).map((t) => `${k}/${t.id}`));
    expect(discovered.sort()).toEqual(PAIRS.map((p) => `${p.set}/${p.q2}`).sort());

    for (const { set, q1, q2 } of PAIRS) {
      const parent = topicOf(set, q1);
      const follow = topicOf(set, q2);
      expect({ pair: q2, requires: follow.gate?.requiresTopic }).toEqual({ pair: q2, requires: q1 });
      // same person: the prerequisite lives on THIS set
      expect(SETS[set]!.topics.some((t) => t.id === q1)).toBe(true);
      // no self-dependency, no dangling, no cycle (the parent requires nothing)
      expect(follow.gate?.requiresTopic).not.toBe(q2);
      expect(parent.gate?.requiresTopic).toBeUndefined();
      // reachable: the follow-up is not gated harder than its own parent
      expect(follow.gate?.minRegard).toBe(parent.gate?.minRegard);
      // and it did not inherit a grant
      expect(follow.grants).toBeUndefined();
      expect(parent.grants ?? null).toBeNull();
    }
  });

  it('21 — graph integrity: unique ids per set, and no prerequisite points off-set', () => {
    for (const k of SET_KEYS) {
      const ids = SETS[k]!.topics.map((t) => t.id);
      expect({ set: k, unique: new Set(ids).size }).toEqual({ set: k, unique: ids.length });
      for (const t of SETS[k]!.topics) {
        const req = t.gate?.requiresTopic;
        if (!req) continue;
        expect({ set: k, topic: t.id, onSet: ids.includes(req) }).toEqual({ set: k, topic: t.id, onSet: true });
      }
    }
  });

  it('22 — all twelve authored paragraphs survive, and each Q2 carries its own', () => {
    const paragraphs = new Set<string>();
    for (const { set, q1, q2 } of PAIRS) {
      const a = topicOf(set, q1).lines[0]!;
      const b = topicOf(set, q2).lines[0]!;
      expect(a.length).toBeGreaterThan(200);
      expect(b.length).toBeGreaterThan(200);
      expect(a).not.toBe(b);
      paragraphs.add(a); paragraphs.add(b);
    }
    expect(paragraphs.size).toBe(12);
    // The four reconciled openings say "you asked" no more — the player is not
    // being told they repeated a question they did not repeat.
    for (const { set, q2 } of PAIRS) {
      expect(topicOf(set, q2).lines[0]).not.toContain('asked twice');
      expect(topicOf(set, q2).lines[0]).not.toContain('since you ask twice');
    }
  });

  it('a Q2 label is a real conversational choice, never a generic re-ask', () => {
    const BANNED = ['ask again', 'ask twice', 'ask more', 'continue', 'keep talking', 'follow up'];
    for (const { set, q1, q2 } of PAIRS) {
      const label = topicOf(set, q2).label;
      expect(label).not.toBe(topicOf(set, q1).label);
      for (const bad of BANNED) expect(label.toLowerCase()).not.toContain(bad);
      expect(label.startsWith('Ask')).toBe(true);
      expect(label.length).toBeGreaterThan(20);
    }
  });
});

/* ══ B — THE GATE, AS PURE ENGINE ═════════════════════════════════════════ */

describe('B — the prerequisite is conversation memory, per person, fail-closed', () => {
  it('4 — Q2 is hidden before Q1, for all six', () => {
    for (const { set, q1, q2 } of PAIRS) {
      const open = openIds(set, {});
      expect({ pair: q2, q1: open.includes(q1), q2: open.includes(q2) })
        .toEqual({ pair: q2, q1: true, q2: false });
    }
  });

  it('5 — Q2 is open the moment Q1 is consumed, for all six', () => {
    for (const { set, q1, q2 } of PAIRS) {
      const open = openIds(set, { [`${set}:${q1}`]: 1 });
      expect({ pair: q2, open: open.includes(q2) }).toEqual({ pair: q2, open: true });
    }
  });

  it('a context with no conversation memory at all keeps every follow-up shut', () => {
    // Every TalkContext authored before this release — and any future caller
    // that forgets the predicate — must read as "nothing has been asked".
    for (const { set, q1, q2 } of PAIRS) {
      const blind = worldlyCtx();
      expect(gateAllows(topicOf(set, q2).gate, blind)).toBe(false);
      expect(gateAllows(topicOf(set, q1).gate, blind)).toBe(true);
    }
  });

  it('the prerequisite cannot reach across people — another vendor asking does not open it', () => {
    for (const { set, q1, q2 } of PAIRS) {
      // Somebody ELSE answered a topic of the same id. Keys are person-scoped,
      // so this is simply a different row and the gate never sees it.
      const other = openIds(set, { [`somebody_else:${q1}`]: 1 });
      expect({ pair: q2, open: other.includes(q2) }).toEqual({ pair: q2, open: false });
    }
  });

  it('the ordinary gate still applies on top — trusted is still trusted', () => {
    for (const { set, q1, q2 } of PAIRS) {
      const need = topicOf(set, q2).gate?.minRegard;
      const tooLow = need === 'familiar' ? 'known' : 'familiar';
      const ctx = {
        ...worldlyCtx({ regard: tooLow as never }),
        topicConsumed: conversationMemory(set, { [`${set}:${q1}`]: 1 }),
      } as TalkContext;
      expect(gateAllows(topicOf(set, q2).gate, ctx)).toBe(false);
    }
  });
});

/* ══ C — THE SAME OPEN CONVERSATION, THROUGH THE REAL DOOR ════════════════ */

describe('C — Q1 then Q2 without closing the sheet', () => {
  it.each(PAIRS.map((p) => [p.set, p.q1, p.q2] as const))(
    '6,7,15 — %s: %s answers once, %s appears in the same conversation and then closes',
    (set, q1, q2) => {
      const name = SETS[set]!.displayName;
      seatPerson(set, name);
      openTalk(name);

      // OPEN: Q1 offered, Q2 not.
      expect(useGameStore.getState().pendingTalk?.npcId).toBe(set);
      expect(trayIds()).toContain(q1);
      expect(trayIds()).not.toContain(q2);
      const labelsBefore = renderTray();
      expect(labelsBefore).toContain(topicOf(set, q1).label);
      expect(labelsBefore).not.toContain(topicOf(set, q2).label);

      // ASK Q1 — one answer, and it is the authored first paragraph.
      const beforeQ1 = worldLines().length;
      useGameStore.getState().raiseTopic(q1);
      expect(worldLines().length - beforeQ1).toBe(1);
      expect(answeredTimes(topicOf(set, q1).lines[0]!)).toBe(1);
      expect(flourishCount()).toBe(1);

      // WITHOUT CLOSING: Q1 is consumed and shown as asked; Q2 is now offered.
      expect(countFor(set, q1)).toBe(1);
      expect(trayIds()).toContain(q2);
      const labelsMid = renderTray();
      expect(labelsMid).toContain(`${topicOf(set, q1).label}  (asked)`);
      expect(labelsMid).not.toContain(topicOf(set, q1).label);
      expect(labelsMid).toContain(topicOf(set, q2).label);

      // ASK Q2 — one answer, the authored second paragraph, its own key.
      const beforeQ2 = worldLines().length;
      useGameStore.getState().raiseTopic(q2);
      expect(worldLines().length - beforeQ2).toBe(1);
      expect(answeredTimes(topicOf(set, q2).lines[0]!)).toBe(1);
      // 20 — the follow-up is a FIRST raise of its own topic, so it gets its own
      // single flourish. Neither beat fires twice.
      expect(flourishCount()).toBe(2);
      expect(countFor(set, q2)).toBe(1);

      // 11 — INDEPENDENT KEYS. Q1 stays consumed at its one accepted ask; the
      // new model never drives the parent counter to 2.
      expect(countFor(set, q1)).toBe(1);

      const labelsAfter = renderTray();
      expect(labelsAfter).toContain(`${topicOf(set, q2).label}  (asked)`);
      expect(labelsAfter).not.toContain(topicOf(set, q2).label);

      // And pressing either again is refused, not replayed.
      const beforeDup = worldLines().length;
      useGameStore.getState().raiseTopic(q1);
      useGameStore.getState().raiseTopic(q2);
      expect(worldLines().slice(beforeDup)).toEqual([alreadySaidLine(name), alreadySaidLine(name)]);
      expect(answeredTimes(topicOf(set, q1).lines[0]!)).toBe(1);
      expect(answeredTimes(topicOf(set, q2).lines[0]!)).toBe(1);
      expect(flourishCount()).toBe(2);
      expect(countFor(set, q1)).toBe(1);
      expect(countFor(set, q2)).toBe(1);
    },
  );

  it('13 — reopening the conversation produces the same state, not a fresh one', () => {
    for (const { set, q1, q2 } of PAIRS) {
      const name = SETS[set]!.displayName;
      seatPerson(set, name);
      openTalk(name);
      useGameStore.getState().raiseTopic(q1);
      // Close it the way STOP TALKING does, then walk back in.
      useGameStore.setState({ pendingTalk: null });
      openTalk(name);
      expect({ pair: q2, tray: trayIds().includes(q2) }).toEqual({ pair: q2, tray: true });
      const labels = renderTray();
      expect(labels).toContain(`${topicOf(set, q1).label}  (asked)`);
      expect(labels).toContain(topicOf(set, q2).label);
    }
  });
});

/* ══ D — THE LEGACY MATRIX, ALL SIX PAIRS × ALL THREE STATES ══════════════ */

describe('D — a save from before the split is read honestly', () => {
  it('8 — CASE A (parent 0): Q1 offered, Q2 locked, neither spent — 6/6', () => {
    const rows = PAIRS.map(({ set, q1, q2 }) => {
      const talked: Record<string, number> = {};
      const open = openIds(set, talked);
      return {
        pair: q2,
        q1Open: open.includes(q1), q2Open: open.includes(q2),
        q1Spent: topicSpent(topicOf(set, q1), set, talked),
        q2Spent: topicSpent(topicOf(set, q2), set, talked),
      };
    });
    expect(rows).toEqual(PAIRS.map((p) => ({ pair: p.q2, q1Open: true, q2Open: false, q1Spent: false, q2Spent: false })));
  });

  it('9 — CASE B (parent 1): Q1 spent, Q2 open and NOT spent — 6/6', () => {
    const rows = PAIRS.map(({ set, q1, q2 }) => {
      const talked = { [`${set}:${q1}`]: 1 };
      const open = openIds(set, talked);
      return {
        pair: q2,
        q2Open: open.includes(q2),
        q1Spent: topicSpent(topicOf(set, q1), set, talked),
        q2Spent: topicSpent(topicOf(set, q2), set, talked),
      };
    });
    expect(rows).toEqual(PAIRS.map((p) => ({ pair: p.q2, q2Open: true, q1Spent: true, q2Spent: false })));
  });

  it('10 — CASE C (parent ≥2): both spent, and disclosure 2 is NOT replayed — 6/6', () => {
    const spentRows = PAIRS.map(({ set, q1, q2 }) => {
      const talked = { [`${set}:${q1}`]: 2 };
      return {
        pair: q2,
        q1Spent: topicSpent(topicOf(set, q1), set, talked),
        q2Spent: topicSpent(topicOf(set, q2), set, talked),
      };
    });
    expect(spentRows).toEqual(PAIRS.map((p) => ({ pair: p.q2, q1Spent: true, q2Spent: true })));

    // And behaviourally: a legacy player walking in is refused both, and the
    // second paragraph never reaches the feed again.
    for (const { set, q1, q2 } of PAIRS) {
      const name = SETS[set]!.displayName;
      seatPerson(set, name);
      const wm = useGameStore.getState().worldMemory;
      useGameStore.setState({ worldMemory: { ...wm, talkedTopics: { [`${set}:${q1}`]: 2 } } });
      openTalk(name);
      useGameStore.getState().raiseTopic(q2);
      expect(worldLines()).toEqual([alreadySaidLine(name)]);
      expect(worldLines()).not.toContain(topicOf(set, q2).lines[0]);
      // Shown as already asked, exactly like any other consumed question.
      const labels = renderTray();
      expect(labels).toContain(`${topicOf(set, q2).label}  (asked)`);
      expect(labels).not.toContain(topicOf(set, q2).label);
    }
  });

  it('the compatibility field is bounded to the six, and cannot become a rule', () => {
    const carriers = SET_KEYS.flatMap((k) =>
      SETS[k]!.topics.filter((t) => t.legacyHeardWith).map((t) => ({ set: k, id: t.id, l: t.legacyHeardWith! })));
    expect(carriers.map((c) => `${c.set}/${c.id}`).sort())
      .toEqual(PAIRS.map((p) => `${p.set}/${p.q2}`).sort());
    for (const c of carriers) {
      expect(c.l.topic).toBe(SETS[c.set]!.topics.find((t) => t.id === c.id)!.gate!.requiresTopic);
      expect(c.l.atCount).toBe(2);
    }
  });

  it('an ordinary follow-up WITHOUT the field starts unheard when its parent is asked', () => {
    // This is the rule that must NOT exist: "parent asked twice ⇒ child spent".
    // Prove it by stripping the migration field from a real pair.
    const { set, q1, q2 } = PAIRS[0]!;
    const plain: Topic = { ...topicOf(set, q2) };
    delete (plain as { legacyHeardWith?: unknown }).legacyHeardWith;
    expect(topicSpent(plain, set, { [`${set}:${q1}`]: 2 })).toBe(false);
    expect(topicSpent(plain, set, { [`${set}:${q2}`]: 1 })).toBe(true);
  });
});

/* ══ E — PERSISTENCE, RECONSTRUCTION, ISOLATION ═══════════════════════════ */

describe('E — the three states survive the save', () => {
  const STATES: { name: string; talked: (s: string, a: string, b: string) => Record<string, number> }[] = [
    { name: 'before Q1', talked: () => ({}) },
    { name: 'after Q1 before Q2', talked: (s, a) => ({ [`${s}:${a}`]: 1 }) },
    { name: 'after Q2', talked: (s, a, b) => ({ [`${s}:${a}`]: 1, [`${s}:${b}`]: 1 }) },
  ];

  it('12 — a JSON round-trip of the ledger reconstructs the same open list', () => {
    for (const { set, q1, q2 } of PAIRS) {
      for (const st of STATES) {
        const before = st.talked(set, q1, q2);
        const after = JSON.parse(JSON.stringify(before)) as Record<string, number>;
        expect(openIds(set, after)).toEqual(openIds(set, before));
        expect(topicSpent(topicOf(set, q2), set, after)).toBe(topicSpent(topicOf(set, q2), set, before));
      }
    }
  });

  it('14 — the store persists both keys and rebuilds the conversation from them', async () => {
    const { set, q1, q2 } = PAIRS[0]!;
    const name = SETS[set]!.displayName;
    seatPerson(set, name);
    openTalk(name);
    useGameStore.getState().raiseTopic(q1);
    useGameStore.getState().raiseTopic(q2);
    await useGameStore.getState().persist();

    // Reconstruct from the persisted ledger alone.
    const saved = JSON.parse(JSON.stringify(talkedNow())) as Record<string, number>;
    expect(saved[`${set}:${q1}`]).toBe(1);
    expect(saved[`${set}:${q2}`]).toBe(1);
    const wm = useGameStore.getState().worldMemory;
    useGameStore.setState({ worldMemory: { ...wm, talkedTopics: saved }, pendingTalk: null, gameLog: [] });
    openTalk(name);
    const labels = renderTray();
    expect(labels).toContain(`${topicOf(set, q1).label}  (asked)`);
    expect(labels).toContain(`${topicOf(set, q2).label}  (asked)`);
    // No resurrection: neither paragraph comes back.
    useGameStore.getState().raiseTopic(q1);
    useGameStore.getState().raiseTopic(q2);
    expect(worldLines()).toEqual([alreadySaidLine(name), alreadySaidLine(name)]);
  });

  it('15 — cross-character isolation: a second character starts at Case A', () => {
    const { set, q1, q2 } = PAIRS[0]!;
    // A different save's ledger is simply a different object; nothing about the
    // corpus remembers the first character.
    expect(openIds(set, {}).includes(q2)).toBe(false);
    expect(topicSpent(topicOf(set, q1), set, {})).toBe(false);
  });

  it('16 — cross-vendor isolation: Irma answering does not open Halem', () => {
    const irma = PAIRS[0]!, halem = PAIRS[2]!;
    const talked = { [`${irma.set}:${irma.q1}`]: 1 };
    expect(openIds(irma.set, talked)).toContain(irma.q2);
    expect(openIds(halem.set, talked)).not.toContain(halem.q2);
    // Both directions, and for every pair against every other pair.
    for (const a of PAIRS) {
      const only = { [`${a.set}:${a.q1}`]: 1 };
      for (const b of PAIRS) {
        if (a.q2 === b.q2) continue;
        expect({ from: a.q1, to: b.q2, open: openIds(b.set, only).includes(b.q2) })
          .toEqual({ from: a.q1, to: b.q2, open: b.set === a.set && b.q1 === a.q1 });
      }
    }
  });
});

/* ══ F — RAPID PRESS, SIDE EFFECTS, AND THE OTA-1866 FIXTURE ══════════════ */

describe('F — consumption is the lock, and nothing else moves', () => {
  it('17 — a burst in one tick yields one answer, on Q1 and on Q2 alike', () => {
    for (const { set, q1, q2 } of PAIRS) {
      const name = SETS[set]!.displayName;
      seatPerson(set, name);
      openTalk(name);
      for (let i = 0; i < 50; i++) useGameStore.getState().raiseTopic(q1);
      expect(answeredTimes(topicOf(set, q1).lines[0]!)).toBe(1);
      expect(countFor(set, q1)).toBe(1);
      for (let i = 0; i < 50; i++) useGameStore.getState().raiseTopic(q2);
      expect(answeredTimes(topicOf(set, q2).lines[0]!)).toBe(1);
      expect(countFor(set, q2)).toBe(1);
      // 100 presses, two answers, two flourishes — consumption is the lock.
      expect(flourishCount()).toBe(2);
    }
  });

  it('18 — OTA-1866 non-regression: Ilva Sidelong, 79 presses, three answers', () => {
    const ILVA = 'roadside:ilva_sidelong';
    seatPerson(ILVA, 'Ilva Sidelong');
    const topics = topicsFor(ILVA, ctxWith(ILVA, {})).filter((t) => !t.gate?.onlyRegard);
    useGameStore.setState({
      pendingTalk: {
        npcId: ILVA, npcName: 'Ilva Sidelong', topics, role: null, flourishesUsed: [],
        flourishCount: 0, lockedCount: 0, regard: 'trusted', npcFaction: null,
        teaserTaps: 0, startedAtTs: Date.now(),
      } as never,
    });
    for (let i = 0; i < 79; i++) useGameStore.getState().raiseTopic(topics[i % topics.length]!.id);
    const dup = worldLines().filter((l) => l === alreadySaidLine('Ilva Sidelong')).length;
    expect(worldLines().length - dup).toBe(topics.length);
    const labels = renderTray();
    for (const t of topics) {
      expect(labels).toContain(`${t.label}  (asked)`);
      expect(labels).not.toContain(t.label);
    }
  });

  it('19 — class voice lanes still select, inside one ask-once topic', () => {
    const front = SETS['class:roadside']!.topics.find((t) => t.id === 'c_front')!;
    expect(front.lines.length).toBe(6);
    const people = ['roadside:ilva_sidelong', 'roadside:grit_maalen', 'roadside:sarn_holt',
      'roadside:vey_orrin', 'roadside:tam_burrow', 'roadside:nesh_carrow'];
    for (const id of people) {
      expect(usesClassSet(id)).toBe(true);
      // The lane is that person's permanently, and asking again would get the
      // SAME voice — but it never gets asked again, because one ask spends it.
      const lane = voiceLaneFor(id, front.lines.length);
      expect(topicReply(front, 0, id)).toBe(front.lines[lane]);
      expect(topicReply(front, 5, id)).toBe(front.lines[lane]);
      expect(topicSpent(front, id, {})).toBe(false);
      expect(topicSpent(front, id, { [`${id}:c_front`]: 1 })).toBe(true);
    }
    // Different people really do land on different lanes — this is variety
    // BETWEEN vendors, not repetition within one.
    expect(new Set(people.map((id) => voiceLaneFor(id, 6))).size).toBeGreaterThan(1);
  });

  it('20 — a Q1→Q2 conversation moves nothing but the conversation', () => {
    const { set, q1, q2 } = PAIRS[0]!;
    const name = SETS[set]!.displayName;
    seatPerson(set, name);
    const snap = (): string => {
      const p = useGameStore.getState().player!;
      return JSON.stringify({
        tc: p.tc, inv: p.inventory?.length ?? 0, standing: p.factionStanding,
        titles: p.earnedTitles, lead: p.pendingLead ?? null,
        quests: p.activeFactionQuests?.length ?? 0, quest: p.mainQuest?.phase ?? null,
      });
    };
    openTalk(name);
    const before = snap();
    useGameStore.getState().raiseTopic(q1);
    useGameStore.getState().raiseTopic(q2);
    expect(snap()).toBe(before);
    // Neither carries a grant, so nothing could have fired — twice or once.
    expect(topicOf(set, q1).grants ?? null).toBeNull();
    expect(topicOf(set, q2).grants ?? null).toBeNull();
    // Exactly two world entries: the two authored paragraphs, each once, each
    // carrying its own single OTA-1063 beat and nothing else.
    expect(worldLines().length).toBe(2);
    expect(answeredTimes(topicOf(set, q1).lines[0]!)).toBe(1);
    expect(answeredTimes(topicOf(set, q2).lines[0]!)).toBe(1);
    expect(flourishCount()).toBe(2);
  });
});
