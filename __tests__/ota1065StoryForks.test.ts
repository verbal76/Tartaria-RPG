jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1065 — PHASE 3: MAKE THE STORY ASK QUESTIONS.
 *
 * The build plan: "extend that shape — 1-2 genuine forks per motive, with
 * lasting consequence. Chapter cards become decisions rather than broadcasts."
 * And the risk it named in the same breath: "branch-state persistence needs
 * care, and this is the one place a save-migration bug would be unrecoverable
 * for a player mid-arc."
 *
 * ⚠ MOST OF THIS FILE IS ABOUT THAT SENTENCE. A fork is not queued anywhere —
 * `dueFork` is a pure read of the save, so a question cannot be lost by a
 * crash, a kill, a reload or a backfill. The only thing persisted is the
 * ANSWER. These tests exercise exactly the cases that would eat a queue.
 */
jest.setTimeout(60_000);

import {
  ALL_FORKS, dueFork, forkById, optionById, recordChoice, choicesOf,
  choiceKeys, epilogueChoiceLines, forksForMotive, forkAuthoringProblems,
} from '../app/engine/storyForks';
import { STORY_MOTIVE_IDS } from '../app/engine/story';
import { gateAllows, type TalkContext } from '../app/engine/dialogue';
import { useGameStore } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';

/** The smallest thing dueFork actually reads. */
const P = (over: Partial<PlayerCharacter> = {}) => ({
  storyMotive: 'debt',
  storyChoices: undefined,
  mainQuest: { phase: 'revelation', coresRecovered: [] },
  ...over,
} as unknown as PlayerCharacter);

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1065 — the authored forks', () => {
  it('every motive gets the 1-2 the plan asked for', () => {
    for (const m of STORY_MOTIVE_IDS) {
      const n = forksForMotive(m).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
    }
    expect(ALL_FORKS).toHaveLength(10);
  });

  it('the authoring guard finds nothing', () => {
    expect(forkAuthoringProblems()).toEqual([]);
  });

  it('every option is a real trade the player can SEE before taking it', () => {
    // A fork whose costs are hidden is a coin flip wearing a decision's
    // clothes, and consequence is the entire product of this phase.
    for (const f of ALL_FORKS) {
      for (const o of f.options) {
        expect(o.hint.length).toBeGreaterThan(20);
        expect(o.label.length).toBeLessThan(60);
        expect(o.epilogue.length).toBeGreaterThan(40);
      }
    }
  });

  it('no option is strictly better than its siblings', () => {
    // A fork with one option that pays and others that do not is not a
    // decision, it is a reward with extra taps. At most ONE option per fork
    // may hand over net coin.
    for (const f of ALL_FORKS) {
      const paying = f.options.filter((o) => (o.effects?.tc ?? 0) > 0);
      expect(paying.length).toBeLessThanOrEqual(1);
    }
  });

  it('⚠ story standing is one-shot by construction, not by a guard', () => {
    // OTA-1064 closed two rival-standing farms built out of REPEATABLE acts.
    // These are safe for the opposite reason: a fork can be answered once,
    // ever, so the line can run once, ever. Bounded anyway.
    for (const f of ALL_FORKS) {
      for (const o of f.options) {
        const st = o.effects?.standing;
        if (st) expect(Math.abs(st.delta)).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe('OTA-1065 — ⚠ a question cannot be lost', () => {
  it('a save that has never heard of forks is simply owed one', () => {
    // Every save written before this OTA has storyChoices === undefined. That
    // reads as "answered nothing", which is exactly right, with no migration.
    const legacy = P({ storyChoices: undefined });
    expect(choicesOf(legacy)).toEqual({});
    expect(dueFork(legacy)?.id).toBe('debt_collector');
  });

  it('asking is IDEMPOTENT — the same state always names the same question', () => {
    // This is what makes a crash in front of the card harmless: nothing was
    // consumed by raising it.
    const p = P();
    expect(dueFork(p)?.id).toBe(dueFork(p)?.id);
    expect(dueFork(p)?.id).toBe('debt_collector');
  });

  it('answering is the ONLY thing that closes it', () => {
    const answered = P({ storyChoices: { debt_collector: 'refuse' } });
    expect(dueFork(answered)?.id).not.toBe('debt_collector');
  });

  it('a phase gate opens and stays open — a skipped transition is not a skipped fork', () => {
    // A player who blew past the phase where a fork was authored is asked at
    // the next opportunity, not never.
    const early = P({ storyMotive: 'exile', mainQuest: { phase: 'cores', coresRecovered: [] } as never });
    expect(dueFork(early)?.id).toBe('exile_warrant');
    const late = P({
      storyMotive: 'exile',
      storyChoices: { exile_warrant: 'let_it_stand' },
      mainQuest: { phase: 'ended', coresRecovered: ['a', 'b'] } as never,
    });
    expect(dueFork(late)?.id).toBe('exile_throne');
  });

  it('a Cores gate is honoured inside the long phase', () => {
    const two = P({ mainQuest: { phase: 'cores', coresRecovered: ['a', 'b'] } as never,
      storyChoices: { debt_collector: 'refuse' } });
    expect(dueFork(two)).toBeNull();          // debt_claim wants three
    const three = P({ mainQuest: { phase: 'cores', coresRecovered: ['a', 'b', 'c'] } as never,
      storyChoices: { debt_collector: 'refuse' } });
    expect(dueFork(three)?.id).toBe('debt_claim');
  });

  it('an answer from a build that had forks this one does not is ignored, not fatal', () => {
    const future = P({ storyChoices: { fork_from_the_future: 'whatever' } });
    expect(() => dueFork(future)).not.toThrow();
    expect(epilogueChoiceLines(future)).toEqual([]);
    expect(dueFork(future)?.id).toBe('debt_collector');
  });

  it('a decision cannot be overwritten', () => {
    const once = recordChoice(undefined, 'debt_collector', 'refuse');
    const twice = recordChoice(once, 'debt_collector', 'pay_partial');
    expect(twice.debt_collector).toBe('refuse');
  });

  it('a nonsense option is refused rather than recorded', () => {
    expect(recordChoice(undefined, 'debt_collector', 'not_an_option')).toEqual({});
    expect(recordChoice(undefined, 'not_a_fork', 'refuse')).toEqual({});
  });
});

describe('OTA-1065 — lasting consequence, all three places', () => {
  it('1. the ending screen says what you did, in authored order', () => {
    const p = P({ storyChoices: { debt_claim: 'keep_the_heart', debt_collector: 'turn_them' } });
    const lines = epilogueChoiceLines(p);
    expect(lines).toHaveLength(2);
    // Authored order, not the order the answers happen to sit in the object.
    expect(lines[0]).toContain('collector');
    expect(lines[1]).toContain('claim');
  });

  it('2. the Phase 2 cast can gate a topic on what you chose', () => {
    const ctx = (choices: string[]): TalkContext => ({
      regard: 'known', contractsTurnedIn: 0, standing: 0, titles: [],
      hasRecentRaidNews: false, chapter: 'cores', cores: 3, choices,
    });
    const gate = { requiresChoice: 'debt_claim:sell_the_claim' };
    expect(gateAllows(gate, ctx([]))).toBe(false);
    expect(gateAllows(gate, ctx(['debt_claim:keep_the_heart']))).toBe(false);
    expect(gateAllows(gate, ctx(['debt_claim:sell_the_claim']))).toBe(true);
  });

  it('...and the topics that use it point at forks that exist', () => {
    // A topic gated on a choice nobody can make is a line that never speaks.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('../app/data/npcs/dialogue_topics.json') as {
      npcs: Record<string, { topics: { id: string; gate?: { requiresChoice?: string } }[] }>;
    };
    const used = Object.values(raw.npcs).flatMap((n) => n.topics)
      .map((t) => t.gate?.requiresChoice).filter((k): k is string => !!k);
    expect(used.length).toBeGreaterThan(0);
    for (const key of used) {
      const [forkId, optId] = key.split(':');
      expect(forkById(forkId!)).toBeTruthy();
      expect(optionById(forkId!, optId!)).toBeTruthy();
    }
  });

  it('choiceKeys produces exactly what the gate matches', () => {
    const p = P({ storyChoices: { debt_collector: 'refuse' } });
    expect(choiceKeys(p)).toEqual(['debt_collector:refuse']);
  });
});

describe('OTA-1065 — in the real store', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const store: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
  const overlay: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/components/StoryForkOverlay.tsx'), 'utf8');
  /* eslint-enable @typescript-eslint/no-require-imports */

  beforeAll(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Forker', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  const setup = (over: Partial<PlayerCharacter> = {}) => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      pendingFork: null, chapterCard: null, storyIntro: null,
      player: {
        ...p, storyMotive: 'debt', storyChoices: undefined,
        mainQuest: { ...(p.mainQuest ?? {}), phase: 'revelation', coresRecovered: [] },
        ...over,
      } as PlayerCharacter,
    });
  };

  it('the fork is DERIVED — clearing it and re-raising asks the same question', () => {
    setup();
    useGameStore.getState().dismissChapterCard();   // raises the due fork
    const first = useGameStore.getState().pendingFork;
    expect(first?.id).toBe('debt_collector');
    // Simulate the app being killed in front of the card: the view is gone and
    // nothing was written. It comes straight back.
    useGameStore.setState({ pendingFork: null });
    useGameStore.getState().dismissChapterCard();
    expect(useGameStore.getState().pendingFork?.id).toBe('debt_collector');
  });

  it('answering records the choice, narrates it, and closes the question for good', () => {
    setup();
    useGameStore.getState().dismissChapterCard();
    const tcBefore = useGameStore.getState().player!.tc;
    useGameStore.getState().answerFork('turn_them');
    const p = useGameStore.getState().player!;
    expect(p.storyChoices).toEqual({ debt_collector: 'turn_them' });
    expect(p.tc).toBe(tcBefore + 40);
    expect(useGameStore.getState().pendingFork).toBeNull();
    const feed = useGameStore.getState().gameLog.map((e) => e.text).join('\n');
    expect(feed).toContain('I know your face now');
    // ...and it never comes back.
    useGameStore.getState().dismissChapterCard();
    expect(useGameStore.getState().pendingFork).toBeNull();
  });

  it('an option that costs coin cannot push the player below zero', () => {
    setup();
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, tc: 10 } as PlayerCharacter });
    useGameStore.getState().dismissChapterCard();
    useGameStore.getState().answerFork('pay_partial');   // -140
    expect(useGameStore.getState().player!.tc).toBe(0);
  });

  it('a keepsake is quest-locked, so a decision cannot be pawned', () => {
    setup({ storyMotive: 'missing' } as Partial<PlayerCharacter>);
    useGameStore.getState().dismissChapterCard();
    expect(useGameStore.getState().pendingFork?.id).toBe('missing_letters');
    useGameStore.getState().answerFork('carry_them');
    const item = useGameStore.getState().player!.inventory.find((i) => i.name === 'The Fifth Letter');
    expect(item).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isQuestLockedItem } = require('../app/engine/questItems');
    expect(isQuestLockedItem(item!)).toBe(true);
  });

  it('a garbage option id does nothing at all', () => {
    setup();
    useGameStore.getState().dismissChapterCard();
    useGameStore.getState().answerFork('not_a_real_option');
    expect(useGameStore.getState().pendingFork?.id).toBe('debt_collector');
    expect(useGameStore.getState().player!.storyChoices).toBeUndefined();
  });

  it('⚠ the answer is written BEFORE the effects are paid', () => {
    // If the app dies between the two, the worst case is a player who chose
    // and did not get the coin — never one who got the coin and is asked again.
    const from = store.indexOf('answerFork: (optionId) => {');
    expect(from).toBeGreaterThan(0);
    const fn = store.slice(from, store.indexOf('\n  },\n', from));
    expect(fn).toContain('applyForkEffects(');
    expect(fn.indexOf('storyChoices: recordChoice')).toBeGreaterThan(0);
    expect(fn.indexOf('storyChoices: recordChoice')).toBeLessThan(fn.indexOf('applyForkEffects('));
  });

  it('the question yields to the tutorial, the crawl and a chapter card', () => {
    const fn = store.slice(store.indexOf('function raiseDueFork('), store.indexOf('function applyForkEffects('));
    expect(fn).toContain("get().tutorialStep !== null || get().storyIntro || get().chapterCard");
  });

  it('⚠ the overlay cannot be dismissed without answering', () => {
    // Every other modal in the game closes on the backdrop. This one must not:
    // a stray thumb would delete a chapter of the player's story.
    expect(overlay).toContain('onRequestClose={() => {}}');
    expect(overlay).not.toContain('closeFork');
    expect(overlay).not.toMatch(/onPress=\{dismiss\}/);
  });
});
