/**
 * ⚠⚠⚠ OTA-1866 — A QUESTION IS ASKED ONCE, AND THE LIST HAS TO AGREE.
 *
 * THE OWNER'S CONTRACT, stated for #191: a vendor question is asked once, the
 * answer is delivered once, the conversation remembers it, and the question is
 * thereafter unavailable for that character. Not a checklist — a person who
 * already told you.
 *
 * ⚠⚠ WHAT THE DEVICE PROVED, and it is not an Ilva problem. Bundle
 * muc6fh1tj2l7 (2026-09-22): 79 asks in 25.1s against Ilva Sidelong, three
 * rotating options, `"I have told you that one."` every time, ~200ms apart,
 * input healthy throughout. Ilva is `roadside:ilva_sidelong` → `class:roadside`.
 * The three labels in the trace are exactly that class's three topics open at
 * `familiar` regard: c_front / c_known / cls_roadside_pitch.
 *
 * ⚠⚠⚠ THE CLASS DEFECT — TWO READERS OF ONE FACT, AND THEY DISAGREED.
 * OTA-1784 made a class set's `lines` PARALLEL VOICES rather than a repeat
 * sequence, so a laned person has exactly ONE answer per topic, and introduced
 * `answersAvailable(topic, npcId)` to say so. The store was moved onto it —
 * `raiseTopic`'s already-said guard AND `hasUnspokenTalk`'s glow, whose own
 * comment reads "on `lines.length` a laned trader's glow never dims".
 * `TalkSheet` was not. It kept asking `talked >= topic.lines.length`.
 *
 * For `class:roadside`, whose six topics each carry six lanes, that is
 * `1 >= 6` — false. And it is false FOREVER, because `raiseTopic` returns on
 * the already-said path BEFORE the counter write, so the counter freezes at 1
 * and can never climb to 6. The question stays undimmed, unsunk, unlabelled
 * and pressable for the rest of the character's life. 79 presses is simply how
 * long the owner kept pressing.
 *
 * ⚠ THE REPAIR IS ONE AUTHORITY, NOT A PATCH PER READER. `topicSpent` lives
 * beside `answersAvailable` in the dialogue engine and is what the store and
 * the list both ask. The divergence is not fixed; it is made unrepresentable.
 *
 * ⚠ NOT A RACE. `raiseTopic` latches the counter synchronously inside the same
 * call that accepts the selection, so §F below drives 79 back-to-back presses
 * and gets exactly one authored answer either way. Rapid pressing exposed the
 * defect; it is not the defect, and a debounce would not have touched it.
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
  answersAvailable, topicsFor, hasTopicsFor, usesClassSet, classKeyFor,
  alreadySaidLine, type Topic, type TalkContext,
} from '../app/engine/dialogue';
import { useGameStore } from '../app/state/gameStore';
import { TalkSheet } from '../app/components/TalkSheet';

/** ⚠ The house shape — `react-test-renderer` ships no declarations, so an
 *  `import` of it is an implicit `any` and pushes the test-typecheck ratchet.
 *  Same typed `require` the OTA-1864 suite uses. */
interface TI { type: unknown; props: Record<string, unknown>; findAll(f: (n: TI) => boolean): TI[] }
interface TestTree { root: TI; unmount(): void }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => TestTree;
  act: (fn: () => void) => void;
};

const SETS = (rawTopics as { npcs: Record<string, { topics: Topic[] }> }).npcs;
const SET_KEYS = Object.keys(SETS);
const CLASS_KEYS = SET_KEYS.filter((k) => k.startsWith('class:'));
const AUTHORED_KEYS = SET_KEYS.filter((k) => !k.startsWith('class:'));

/** A person who belongs to each set. For an authored entry that is the key
 *  itself; for a class set it is an id the class resolver actually accepts —
 *  which is the colon form the ledger mints (`roadside:<slug>`), not the
 *  scene's transient `roadside_<demeanor>_<ts>`. */
function personFor(setKey: string): string {
  if (!setKey.startsWith('class:')) return setKey;
  if (setKey.startsWith('class:wanderer:')) return `wanderer:${setKey.slice('class:wanderer:'.length)}:someone`;
  return `${setKey.slice('class:'.length)}:someone`;
}

const REGARDS = ['stranger', 'met', 'known', 'familiar', 'trusted', 'wronged'] as const;

function ctxAt(regard: (typeof REGARDS)[number]): TalkContext {
  return {
    regard, contractsTurnedIn: 99, standing: 99, titles: [], hasRecentRaidNews: true,
    chapter: 'phase3', cores: 9, choices: [], lovedGifts: 9, pocketsMumbled: 9,
  } as unknown as TalkContext;
}

/** Every topic this person can ever see, across every regard. */
function allOpenTopics(npcId: string): Topic[] {
  const seen = new Map<string, Topic>();
  for (const r of REGARDS) for (const t of topicsFor(npcId, ctxAt(r))) seen.set(t.id, t);
  return [...seen.values()];
}

const talked = (): Record<string, number> => useGameStore.getState().worldMemory.talkedTopics ?? {};
const countFor = (npcId: string, topicId: string): number => talked()[`${npcId}:${topicId}`] ?? 0;

/** Seat a conversation without needing the person to be standing in the scene.
 *  `raiseTopic` — the selection handler under audit — reads `pendingTalk` and
 *  nothing else, so this is the real path for everything after the tap. §E
 *  drives the full `talkToNpc` door for Ilva. */
function seatTalk(npcId: string, npcName: string, topics: Topic[], regard: string = 'familiar'): void {
  useGameStore.setState({
    pendingTalk: {
      npcId, npcName, topics, role: null, flourishesUsed: [], flourishCount: 0,
      lockedCount: 0, regard, teaserTaps: 0, startedAtTs: Date.now(),
    } as never,
  });
}

const clearMemory = (): void => {
  const wm = useGameStore.getState().worldMemory;
  useGameStore.setState({ worldMemory: { ...wm, talkedTopics: {}, npcTranscripts: {} }, gameLog: [] });
};

const worldLines = (): string[] =>
  useGameStore.getState().gameLog.filter((e) => e.channel === 'world').map((e) => e.text);

beforeAll(async () => {
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Asker', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
});

beforeEach(clearMemory);

/* ══ A — THE CORPUS, AND WHAT IDENTITY IT HAS ══════════════════════════════ */

describe('A — every authored question has a stable, unique, vendor-scoped identity', () => {
  it('the census is what the report says it is', () => {
    expect({ sets: SET_KEYS.length, classSets: CLASS_KEYS.length, authored: AUTHORED_KEYS.length })
      .toEqual({ sets: 41, classSets: 11, authored: 30 });
  });

  it('no topic id repeats inside its own set', () => {
    const offenders = SET_KEYS.filter((k) => {
      const ids = SETS[k]!.topics.map((t) => t.id);
      return new Set(ids).size !== ids.length;
    });
    expect(offenders).toEqual([]);
  });

  it('every topic id is a non-empty stable string — nothing generated per render', () => {
    for (const k of SET_KEYS) {
      for (const t of SETS[k]!.topics) {
        expect(typeof t.id).toBe('string');
        expect(t.id.length).toBeGreaterThan(0);
        expect(t.id).not.toMatch(/\d{6,}/); // no timestamps / random suffixes
      }
    }
  });

  it('every set resolves for its representative person, and opens at least one topic', () => {
    for (const k of SET_KEYS) {
      const id = personFor(k);
      expect({ set: k, has: hasTopicsFor(id) }).toEqual({ set: k, has: true });
      expect(allOpenTopics(id).length).toBeGreaterThan(0);
    }
  });

  it('a class set is laned — one answer per person — and an authored set is a sequence', () => {
    for (const k of CLASS_KEYS) {
      const id = personFor(k);
      expect(usesClassSet(id)).toBe(true);
      for (const t of SETS[k]!.topics) expect(answersAvailable(t, id)).toBe(1);
    }
    for (const k of AUTHORED_KEYS) {
      expect(usesClassSet(k)).toBe(false);
      for (const t of SETS[k]!.topics) expect(answersAvailable(t, k)).toBe(t.lines.length);
    }
  });
});

/* ══ B — THE LIFECYCLE, DRIVEN THROUGH THE REAL HANDLER, FOR EVERY SET ════ */

describe('B — ask-once holds across the whole vendor corpus', () => {
  const OVERPRESS = 5;

  it('every topic of every set accepts exactly its authored answers, then is consumed', () => {
    // ⚠ THE COUNTER IS THE FACT, NOT THE LINE COUNT. A first raise can also emit
    // a flourish beat and a grant's own lines, so counting world lines would
    // score authored colour as extra answers. `talkedTopics` is the single thing
    // both the engine and the list read, so it is what gets asserted — together
    // with one already-said refusal per press past the contract.
    const violations: { set: string; topic: string; latched: number; refusals: number; expected: number }[] = [];
    for (const k of SET_KEYS) {
      const npcId = personFor(k);
      for (const topic of allOpenTopics(npcId)) {
        clearMemory();
        // ⚠ OTA-1064 — a topic whose lead grant cannot land does NOT spend, by
        // design. Clearing the slot keeps this sweep measuring ask-once rather
        // than re-measuring the deferral rule, which has its own suite.
        const p = useGameStore.getState().player!;
        useGameStore.setState({ player: { ...p, pendingLead: null } as never });
        seatTalk(npcId, 'Somebody', [topic]);
        const want = answersAvailable(topic, npcId);
        for (let i = 0; i < want + OVERPRESS; i++) useGameStore.getState().raiseTopic(topic.id);
        const refusals = worldLines().filter((l) => l === alreadySaidLine('Somebody')).length;
        const latched = countFor(npcId, topic.id);
        if (latched !== want || refusals !== OVERPRESS) {
          violations.push({ set: k, topic: topic.id, latched, refusals, expected: want });
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('the consumed counter is latched by the accepting press itself', () => {
    const npcId = personFor('class:roadside');
    const topic = allOpenTopics(npcId)[0]!;
    seatTalk(npcId, 'Somebody', [topic]);
    expect(countFor(npcId, topic.id)).toBe(0);
    useGameStore.getState().raiseTopic(topic.id);
    // Synchronously — not after narration, not after a queue drains.
    expect(countFor(npcId, topic.id)).toBe(answersAvailable(topic, npcId));
  });

  it('the glow and the conversation agree about who still has something to say', () => {
    // hasUnspokenTalk is the store's own spent-reader. Draining every open
    // topic must take the light out, for a laned person as for an authored one.
    for (const k of SET_KEYS) {
      clearMemory();
      const npcId = personFor(k);
      const topics = allOpenTopics(npcId);
      const wm = useGameStore.getState().worldMemory;
      const next = { ...(wm.talkedTopics ?? {}) };
      for (const t of topics) next[`${npcId}:${t.id}`] = answersAvailable(t, npcId);
      useGameStore.setState({ worldMemory: { ...wm, talkedTopics: next } });
      seatTalk(npcId, 'Somebody', topics);
      for (const t of topics) {
        expect({ set: k, topic: t.id, left: countFor(npcId, t.id) < answersAvailable(t, npcId) })
          .toEqual({ set: k, topic: t.id, left: false });
      }
    }
  });
});

/* ══ C — THE LIST THE PLAYER TOUCHES ══════════════════════════════════════ */

/** Render TalkSheet over the live store and read back the ASK ABOUT tray — the
 *  rows a finger can actually press. This is the surface the 79 presses came
 *  through, so it is the surface that has to be asked.
 *
 *  ⚠ THE TRAY ONLY, AND THAT IS NOT A CONVENIENCE. The transcript above it
 *  legitimately echoes every question already put, so a whole-sheet text scrape
 *  would find a consumed label there and call the defect fixed. What is being
 *  asserted is what is OFFERED, which is the region between the tray's own
 *  heading and the close control. */
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

describe('C — a consumed question is never offered again by the list', () => {
  const CASES: { set: string; why: string }[] = [
    { set: 'class:roadside', why: 'the reproduced class: laned, six lines per topic' },
    { set: 'class:wanderer:refugee', why: 'a laned class with one line per topic' },
    { set: AUTHORED_KEYS[0]!, why: 'an individually authored person' },
  ];

  for (const c of CASES) {
    it(`${c.set} — ${c.why}`, () => {
      const npcId = personFor(c.set);
      const topics = allOpenTopics(npcId).filter((t) => !t.gate?.onlyRegard).slice(0, 3);
      expect(topics.length).toBeGreaterThan(0);
      seatTalk(npcId, 'Somebody', topics);

      const before = renderTray();
      for (const t of topics) expect(before).toContain(t.label);
      expect(before.filter((l) => l.includes('(asked)'))).toEqual([]);

      // Consume the first one the way a player does.
      const first = topics[0]!;
      for (let i = 0; i < answersAvailable(first, npcId); i++) {
        useGameStore.getState().raiseTopic(first.id);
      }

      const after = renderTray();
      expect(after).toContain(`${first.label}  (asked)`);
      expect(after).not.toContain(first.label);
      // The others are untouched and still plainly offered.
      for (const t of topics.slice(1)) expect(after).toContain(t.label);
    });
  }

  it('pressing every remaining question consumes each one independently', () => {
    const npcId = personFor('class:roadside');
    const topics = allOpenTopics(npcId).filter((t) => !t.gate?.onlyRegard).slice(0, 3);
    seatTalk(npcId, 'Somebody', topics);
    for (const t of topics) {
      for (let i = 0; i < answersAvailable(t, npcId); i++) useGameStore.getState().raiseTopic(t.id);
    }
    const after = renderTray();
    for (const t of topics) expect(after).toContain(`${t.label}  (asked)`);
    expect(after.filter((l) => l.includes('(asked)')).length).toBe(topics.length);
  });

  it('reopening the conversation cannot un-consume anything', () => {
    const npcId = personFor('class:roadside');
    const topics = allOpenTopics(npcId).filter((t) => !t.gate?.onlyRegard).slice(0, 2);
    seatTalk(npcId, 'Somebody', topics);
    const first = topics[0]!;
    useGameStore.getState().raiseTopic(first.id);
    useGameStore.getState().closeTalk();
    seatTalk(npcId, 'Somebody', topics);           // walked away and came back
    expect(renderTray()).toContain(`${first.label}  (asked)`);
  });
});

/* ══ D — IT SURVIVES THE SAVE ═════════════════════════════════════════════ */

describe('D — the conversation is remembered with the character', () => {
  it('talkedTopics rides worldMemory, which is what a save stores', () => {
    const npcId = personFor('class:roadside');
    const topic = allOpenTopics(npcId)[0]!;
    seatTalk(npcId, 'Somebody', [topic]);
    useGameStore.getState().raiseTopic(topic.id);

    // The real save shape: player + worldMemory, JSON, reloaded.
    const round = JSON.parse(
      JSON.stringify(useGameStore.getState().worldMemory),
    ) as Record<string, unknown>;
    useGameStore.setState({ worldMemory: { ...round } as never });
    expect(countFor(npcId, topic.id)).toBe(answersAvailable(topic, npcId));
    seatTalk(npcId, 'Somebody', [topic]);
    expect(renderTray()).toContain(`${topic.label}  (asked)`);
  });

  it('a character with no conversation memory at all starts clean — nothing is invented', () => {
    const npcId = personFor('class:roadside');
    const topics = allOpenTopics(npcId).filter((t) => !t.gate?.onlyRegard).slice(0, 3);
    const wm = useGameStore.getState().worldMemory;
    const legacy = { ...wm };
    delete (legacy as { talkedTopics?: unknown }).talkedTopics;   // pre-OTA-1058 save
    useGameStore.setState({ worldMemory: legacy });
    seatTalk(npcId, 'Somebody', topics);
    const labels = renderTray();
    for (const t of topics) expect(labels).toContain(t.label);
    expect(labels.filter((l) => l.includes('(asked)'))).toEqual([]);
  });
});

/* ══ E — ILVA, THE REPRODUCED CASE, KEPT AS A NAMED FIXTURE ═══════════════ */

describe('E — Ilva Sidelong (bundle muc6fh1tj2l7, 2026-09-22)', () => {
  const ILVA = 'roadside:ilva_sidelong';
  const OBSERVED = [
    'Ask why the stall is here',
    'Ask how far they range',
    'Ask why they trade out here',
  ];

  it('resolves to the roadside class and opens exactly the three observed questions', () => {
    expect(classKeyFor(ILVA)).toBe('class:roadside');
    expect(usesClassSet(ILVA)).toBe(true);
    expect(topicsFor(ILVA, ctxAt('familiar')).map((t) => t.label)).toEqual(OBSERVED);
  });

  it('each of the three answers once, and is gone from the list after', () => {
    const topics = topicsFor(ILVA, ctxAt('familiar'));
    seatTalk(ILVA, 'Ilva Sidelong', topics);
    const consumed: string[] = [];
    for (const t of topics) {
      const before = worldLines().length;
      useGameStore.getState().raiseTopic(t.id);
      expect(worldLines().length - before).toBe(1);
      expect(worldLines()[worldLines().length - 1]).not.toBe(alreadySaidLine('Ilva Sidelong'));
      consumed.push(t.label);
      const labels = renderTray();
      for (const done of consumed) expect(labels).toContain(`${done}  (asked)`);
    }
    expect(renderTray().filter((l) => l.includes('(asked)')).length).toBe(3);
  });

  it('⚠ THE DEVICE LOOP — 79 presses cannot produce 79 answers, and cannot be offered', () => {
    const topics = topicsFor(ILVA, ctxAt('familiar'));
    seatTalk(ILVA, 'Ilva Sidelong', topics);
    // The trace: 79 presses rotating across the three options, ~200ms apart.
    for (let i = 0; i < 79; i++) useGameStore.getState().raiseTopic(topics[i % topics.length]!.id);
    const dup = worldLines().filter((l) => l === alreadySaidLine('Ilva Sidelong')).length;
    const answers = worldLines().length - dup;
    // Three authored answers, and the rest correctly refused by the engine.
    expect(answers).toBe(3);
    // And the list has offered none of them since the first press each.
    const labels = renderTray();
    for (const t of topics) {
      expect(labels).toContain(`${t.label}  (asked)`);
      expect(labels).not.toContain(t.label);
    }
  });

  it('the defensive already-said line is unreachable from an offered question', () => {
    // It still exists, and it still fires for a direct call — that is a guard.
    // What must be true is that no question the list OFFERS can reach it.
    const topics = topicsFor(ILVA, ctxAt('familiar'));
    seatTalk(ILVA, 'Ilva Sidelong', topics);
    for (const t of topics) useGameStore.getState().raiseTopic(t.id);
    const offered = renderTray().filter((l) => !l.includes('(asked)'));
    for (const t of topics) expect(offered).not.toContain(t.label);
  });
});

/* ══ F — WHAT IT IS NOT: A RACE ═══════════════════════════════════════════ */

describe('F — rapid pressing is how it was found, not what it was', () => {
  it('back-to-back presses in one tick still yield exactly one authored answer', () => {
    const npcId = personFor('class:roadside');
    const topic = allOpenTopics(npcId)[0]!;
    seatTalk(npcId, 'Somebody', [topic]);
    for (let i = 0; i < 50; i++) useGameStore.getState().raiseTopic(topic.id);
    const dup = worldLines().filter((l) => l === alreadySaidLine('Somebody')).length;
    expect(worldLines().length - dup).toBe(1);
    expect(countFor(npcId, topic.id)).toBe(1);
  });

  it('a duplicate press cannot pay a topic grant twice', () => {
    const withGrant = SET_KEYS.flatMap((k) => allOpenTopics(personFor(k)).map((t) => ({ k, t })))
      .find(({ t }) => !!t.grants?.tc);
    if (!withGrant) return;                        // no coin grants authored today
    const npcId = personFor(withGrant.k);
    const before = useGameStore.getState().player!.tc;
    seatTalk(npcId, 'Somebody', [withGrant.t]);
    for (let i = 0; i < 12; i++) useGameStore.getState().raiseTopic(withGrant.t.id);
    const paid = useGameStore.getState().player!.tc - before;
    expect(paid).toBe(withGrant.t.grants!.tc);
  });
});

/* ══ G — ISOLATION ════════════════════════════════════════════════════════ */

describe('G — one person, one character, one memory', () => {
  it('two people of the same class do not consume each other topics', () => {
    const a = 'roadside:trader_one';
    const b = 'roadside:trader_two';
    const topic = allOpenTopics(a)[0]!;
    seatTalk(a, 'Trader One', [topic]);
    useGameStore.getState().raiseTopic(topic.id);
    expect(countFor(a, topic.id)).toBe(1);
    expect(countFor(b, topic.id)).toBe(0);
    seatTalk(b, 'Trader Two', [topic]);
    expect(renderTray()).toContain(topic.label);   // still open for B
  });

  it('the key carries the person, so no two sets can collide', () => {
    const keys = new Set<string>();
    for (const k of SET_KEYS) {
      const id = personFor(k);
      for (const t of SETS[k]!.topics) {
        const key = `${id}:${t.id}`;
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    }
  });

  it('a new character starts its own conversation from nothing', async () => {
    const npcId = personFor('class:roadside');
    const topic = allOpenTopics(npcId)[0]!;
    seatTalk(npcId, 'Somebody', [topic]);
    useGameStore.getState().raiseTopic(topic.id);
    expect(countFor(npcId, topic.id)).toBe(1);
    await useGameStore.getState().startNewGame({ name: 'Second', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    expect(countFor(npcId, topic.id)).toBe(0);
  });
});
