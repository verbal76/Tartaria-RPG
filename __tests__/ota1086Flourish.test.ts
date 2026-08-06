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
 * OTA-1086 — THE FLOURISH. The last item on the owner's seven-item list, and
 * the one the build plan wrote down as "the LLM contributes at most one short
 * flourish line per exchange, off the critical path, with a template fallback
 * if it's slow."
 *
 * The load-bearing claim these tests exist to hold is the second half of that
 * sentence. OTA-1081 shipped the conversation entirely synchronous because a
 * 14-20s generation in front of a tapped topic is a loading screen, and this
 * OTA puts the model NEAR that system for the first time. So:
 *
 *  - engine/flourish.ts carries the same no-async guard dialogue.ts carries;
 *  - the exchange TAKES from a slot, it never awaits one, so a slow, dormant
 *    or absent model is indistinguishable from an empty slot;
 *  - the authored line is the product, not an apology — every rule about
 *    frequency, repetition and exhaustion is enforced on the authored path.
 */
jest.setTimeout(60_000);

import {
  flourishFor, flourishKindFor, flourishPool, vetModelFlourish, flourishPrompt,
  FLOURISH_MAX_PER_CONVERSATION, FLOURISH_MAX_CHARS, FLOURISH_SYSTEM,
} from '../app/engine/flourish';
import { topicsFor, type TalkContext } from '../app/engine/dialogue';
import {
  useGameStore, _resetFlourishForTest, _setFlourishSlotForTest, _flourishSlotForTest,
} from '../app/state/gameStore';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DATA = require('../app/data/npcs/flourishes.json') as {
  byKind: Record<string, string[]>;
  byRegard: Record<string, string[]>;
  fallback: string[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const VENDORS = require('../app/data/npcs/vendors.json') as { vendors: { id: string; name: string; title: string }[] };

const allAuthored = [
  ...Object.values(DATA.byKind).flat(),
  ...Object.values(DATA.byRegard).flat(),
  ...DATA.fallback,
];

const req = (over: Partial<Parameters<typeof flourishFor>[0]> = {}) => ({
  npcId: 'irma_ironhand', npcName: 'Irma Ironhand', role: 'Heavy Armorer',
  regard: 'known' as const, topicId: 'armour', used: [] as string[], ...over,
});

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1086 — THE DESIGN CONSTRAINT, carried forward', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SRC: string = require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '../app/engine/flourish.ts'), 'utf8');

  it('engine/flourish.ts has no async and no model in it', () => {
    // ⚠ The same guard dialogue.ts carries, and for a sharper reason: this is
    // the module that TOUCHES the model's output. If the judging of a line ever
    // becomes awaitable, the exchange stops being synchronous, and the whole
    // reason Phase 2 shipped authored goes with it.
    expect(SRC).not.toMatch(/\basync\b/);
    expect(SRC).not.toMatch(/await |llama|qwen/i);
    // `Promise` is allowed nowhere either — not even in a type position, which
    // is how this would start.
    expect(SRC).not.toMatch(/Promise/);
  });

  it('...and dialogue.ts still has none either', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dlg: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/engine/dialogue.ts'), 'utf8');
    expect(dlg).not.toMatch(/\basync\b/);
    expect(dlg).not.toMatch(/await |Promise|llama|generate\(/);
  });

  it('the store TAKES from the slot rather than awaiting a generation', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    const fn = store.slice(store.indexOf('function emitFlourish('), store.indexOf('async function prefetchFlourish('));
    expect(fn.length).toBeGreaterThan(400);
    // The whole claim, in one assertion: the emit path contains no await.
    expect(fn).not.toContain('await ');
    // ...and it is called from raiseTopic on a first raise only.
    expect(store).toMatch(/if \(asked === 0\) emitFlourish\(get, set, topic\.id\)/);
    // The prefetch is fire-and-forget at both call sites.
    expect(store).toMatch(/void prefetchFlourish\(get, set,/);
  });
});

describe('OTA-1086 — the authored pool is the product', () => {
  it('every vendor in the game lands in a trade bucket', () => {
    // A vendor with no bucket falls through to the regard pool alone, which is
    // half a voice. 30 named people, 30 job titles, and the mapping has to
    // cover all of them or the feature is quietly thinner than it looks.
    const missed = VENDORS.vendors.filter((v) => !flourishKindFor(v.id, v.title));
    expect(missed.map((v) => v.title)).toEqual([]);
  });

  it('the specific trade beats the generic shop word', () => {
    // "Mechanical Outfitter" works metal, "Wilderness Outfitter" works road,
    // and they share a noun. Order in KIND_RULES is what separates them.
    expect(flourishKindFor('x', 'Mechanical Outfitter')).toBe('forge');
    expect(flourishKindFor('x', 'Wilderness Outfitter')).toBe('field');
    expect(flourishKindFor('x', 'Boot-Smith')).toBe('forge');
    expect(flourishKindFor('x', 'Master Mason')).toBe('forge');
    expect(flourishKindFor('x', 'Relic Dealer')).toBe('curio');
    expect(flourishKindFor('x', 'Order Scholar')).toBe('books');
    expect(flourishKindFor('x', 'Monarch Agent')).toBe('quarters');
    expect(flourishKindFor('x', 'Scrap Broker')).toBe('counter');
    expect(flourishKindFor('x', 'Wandering Drifter')).toBe('road');
  });

  it('the procedural cast is bucketed off the class key, with no role at all', () => {
    // OTA-1085 gave wanderers, roadside traders, escorts and Guardians their
    // topics by KIND. The flourish reads the same ids so it needs no new data.
    expect(flourishKindFor('wanderer:refugee:corin', null)).toBe('road');
    expect(flourishKindFor('roadside:grit-maalen', null)).toBe('road');
    expect(flourishKindFor('escort:hessa', null)).toBe('escort');
    expect(flourishKindFor('guardian:vault', null)).toBe('guardian');
  });

  it('every authored line substitutes cleanly and reads as one beat', () => {
    for (const raw of allAuthored) {
      const line = raw.replace(/\{npc\}/g, 'Irma Ironhand');
      expect(line).not.toContain('{');
      expect(line.length).toBeLessThanOrEqual(FLOURISH_MAX_CHARS);
      expect(line).toMatch(/[.!]$/);
      // Stage business, not dialogue. The authored topic lines own the words.
      expect(line).not.toContain('"');
      expect(line).not.toContain('?');
    }
  });

  it('there is a pool for every rung of the ladder, wronged included', () => {
    for (const regard of ['stranger', 'met', 'known', 'familiar', 'trusted', 'wronged'] as const) {
      expect(DATA.byRegard[regard]?.length ?? 0).toBeGreaterThan(0);
      expect(flourishPool('forge', regard).length).toBeGreaterThan(1);
    }
  });

  it('a wronged shopkeeper watches your hands', () => {
    // The one relationship state where the beat is doing real work: OTA-1081
    // leaves a thief exactly one topic, and this is the posture under it.
    const line = flourishFor(req({ regard: 'wronged', topicId: 'apology' }));
    expect(line).toBeTruthy();
    expect(line).toContain('Irma Ironhand');
  });

  it('somebody with no trade and no ladder still gets the fallback', () => {
    expect(flourishPool(null, 'nobody' as never)).toEqual(DATA.fallback);
  });
});

describe('OTA-1086 — deterministic, and not a dice roll', () => {
  it('the same person, topic and state gives the same beat every time', () => {
    // Same reason as OTA-1072: somebody whose gestures reshuffle on a replay of
    // the same state reads as broken rather than as alive.
    const a = flourishFor(req());
    const b = flourishFor(req());
    expect(a).toEqual(b);
    expect(a).toBeTruthy();
  });

  it('...but different questions get different business', () => {
    const seen = new Set(
      ['armour', 'encampments', 'flood', 'you', 'work'].map((topicId) => flourishFor(req({ topicId }))),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('a line already used in this conversation is skipped, not repeated', () => {
    const first = flourishFor(req())!;
    const second = flourishFor(req({ used: [first] }));
    expect(second).toBeTruthy();
    expect(second).not.toEqual(first);
  });

  it('an exhausted pool goes SILENT rather than repeating a gesture', () => {
    const pool = flourishPool(flourishKindFor('irma_ironhand', 'Heavy Armorer'), 'known')
      .map((l) => l.replace(/\{npc\}/g, 'Irma Ironhand'));
    expect(flourishFor(req({ used: pool }))).toBeNull();
  });
});

describe('OTA-1086 — the judge for a model line', () => {
  const good = 'Irma sets the hammer down on the anvil without looking at it.';

  it('accepts a short, third-person beat that names them', () => {
    expect(vetModelFlourish(good, 'Irma')).toEqual(good);
  });

  it('takes the first sentence and drops the rest', () => {
    expect(vetModelFlourish(`${good} Then she says something else entirely.`, 'Irma')).toEqual(good);
  });

  it('rejects a line that is not about the person in front of you', () => {
    // The exact failure mode the ambient path has shipped twice: an off-scene
    // musing about somewhere else, surfacing where a reply just landed.
    expect(vetModelFlourish('The alleyway smells of wet stone and old iron.', 'Irma')).toBeNull();
  });

  it('rejects dialogue, questions and quotation marks', () => {
    expect(vetModelFlourish('Irma says "get out of my light."', 'Irma')).toBeNull();
    expect(vetModelFlourish('Irma wonders what you want from her?', 'Irma')).toBeNull();
  });

  it('rejects the two registers this model actually falls into', () => {
    // OTA-1054: a second-person ACTION opener is scene text in the wrong slot.
    expect(vetModelFlourish('You watch Irma work the bellows for a moment.', 'Irma')).toBeNull();
    expect(vetModelFlourish('I watch Irma work the bellows for a moment.', 'Irma')).toBeNull();
  });

  it('rejects an instruction echo', () => {
    // OTA-1053 caught the brief itself streaming raw to the screen.
    expect(vetModelFlourish('Irma follows the rules: one sentence about the player.', 'Irma')).toBeNull();
  });

  it('rejects a paragraph and a fragment', () => {
    expect(vetModelFlourish(`Irma ${'x'.repeat(FLOURISH_MAX_CHARS)}.`, 'Irma')).toBeNull();
    expect(vetModelFlourish('Irma.', 'Irma')).toBeNull();
    expect(vetModelFlourish('', 'Irma')).toBeNull();
    expect(vetModelFlourish('Irma reaches for the tongs', 'Irma')).toBeNull(); // unterminated
  });

  it('the brief and the judge agree about what is being asked for', () => {
    // They live in the same file so they cannot drift; assert the contract.
    expect(FLOURISH_SYSTEM).toMatch(/one sentence/i);
    expect(FLOURISH_SYSTEM).toMatch(/Use their name/i);
    expect(FLOURISH_SYSTEM).toMatch(/no quotation marks/i);
    expect(flourishPrompt('Irma Ironhand', 'Heavy Armorer', 'forge')).toContain('Heavy Armorer');
    expect(flourishPrompt('Irma Ironhand', null, 'forge')).toContain('forge');
  });
});

describe('OTA-1086 — in the exchange', () => {
  const ctx: TalkContext = {
    regard: 'trusted', contractsTurnedIn: 4, standing: 60, titles: [],
    hasRecentRaidNews: false, chapter: 'cores', cores: 2, choices: [], // OTA-1088
  };
  const topics = topicsFor('irma_ironhand', ctx);

  const openTalk = () => {
    _resetFlourishForTest();
    useGameStore.setState({
      pendingTalk: {
        npcId: 'irma_ironhand', npcName: 'Irma Ironhand', topics,
        role: 'Heavy Armorer', flourishesUsed: [], flourishCount: 0,
        // OTA-1113 — the teaser fields ride along; this harness talks at
        // trusted with everything open, so the locked count is genuinely 0.
        lockedCount: 0, regard: 'trusted', teaserTaps: 0,
        // OTA-1118 — where this conversation's own transcript begins in the feed.
        // The harness opens the talk by hand, so start at the top of the log.
        startedAtTs: 0,
      },
    });
    const wm = useGameStore.getState().worldMemory;
    useGameStore.setState({ worldMemory: { ...wm, talkedTopics: {} } });
  };
  const lastWorld = () =>
    [...useGameStore.getState().gameLog].reverse().find((e) => e.channel === 'world')?.text ?? '';

  beforeAll(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Flourish', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('there are enough topics to test the cap with', () => {
    expect(topics.length).toBeGreaterThan(FLOURISH_MAX_PER_CONVERSATION);
  });

  it('a first raise lands the reply AND a beat under it', () => {
    openTalk();
    useGameStore.getState().raiseTopic(topics[0]!.id);
    expect(useGameStore.getState().pendingTalk!.flourishCount).toBe(1);
    const used = useGameStore.getState().pendingTalk!.flourishesUsed;
    expect(used).toHaveLength(1);
    // Both lines are world-channel and land inside the debounce window, so the
    // feed shows one card: the answer, then the business.
    expect(lastWorld()).toContain(used[0]!);
    expect(lastWorld()).toContain(topics[0]!.lines[0]!);
  });

  it('asking the same thing again gets the words back but not the business', () => {
    openTalk();
    const t = topics.find((x) => x.lines.length > 1) ?? topics[0]!;
    useGameStore.getState().raiseTopic(t.id);
    expect(useGameStore.getState().pendingTalk!.flourishCount).toBe(1);
    useGameStore.getState().raiseTopic(t.id);
    // The reply moved on to its second line; the flourish did not fire again.
    expect(useGameStore.getState().pendingTalk!.flourishCount).toBe(1);
  });

  it('the beat is punctuation, so it stops after FLOURISH_MAX_PER_CONVERSATION', () => {
    openTalk();
    for (const t of topics) useGameStore.getState().raiseTopic(t.id);
    expect(useGameStore.getState().pendingTalk!.flourishCount).toBe(FLOURISH_MAX_PER_CONVERSATION);
    // ...and never repeats itself inside one conversation.
    const used = useGameStore.getState().pendingTalk!.flourishesUsed;
    expect(new Set(used).size).toBe(used.length);
  });

  it('a vetted model line in the slot speaks INSTEAD of the template, once', () => {
    openTalk();
    const modelLine = 'Irma Ironhand turns the billet over and sets it down cooling.';
    _setFlourishSlotForTest('irma_ironhand', modelLine);
    useGameStore.getState().raiseTopic(topics[0]!.id);
    expect(lastWorld()).toContain(modelLine);
    // Consumed. One slot, one exchange — it cannot echo on the next topic.
    expect(_flourishSlotForTest()).toBeNull();
    useGameStore.getState().raiseTopic(topics[1]!.id);
    expect(useGameStore.getState().pendingTalk!.flourishesUsed[1]).not.toEqual(modelLine);
  });

  it('a line banked for somebody else never speaks here', () => {
    openTalk();
    _setFlourishSlotForTest('odar_flamewright', 'Odar bends over the coals and does not look up.');
    useGameStore.getState().raiseTopic(topics[0]!.id);
    expect(lastWorld()).not.toContain('Odar');
    expect(_flourishSlotForTest()).toBeTruthy(); // untouched, not stolen
  });

  it('walking away drops the slot — the beat was about that exchange', () => {
    openTalk();
    _setFlourishSlotForTest('irma_ironhand', 'Irma Ironhand wipes her hands on the apron.');
    useGameStore.getState().closeTalk();
    expect(_flourishSlotForTest()).toBeNull();
    expect(useGameStore.getState().pendingTalk).toBeNull();
  });

  it('with no model anywhere in the room, every beat is still authored', () => {
    // Qwen is never initialised in this suite, so prefetchFlourish returns at
    // its first guard on every call. That is the shipped behaviour on a device
    // whose model is dormant, and the exchange is unchanged by it.
    openTalk();
    useGameStore.getState().raiseTopic(topics[0]!.id);
    const line = useGameStore.getState().pendingTalk!.flourishesUsed[0]!;
    const authored = allAuthored.map((l) => l.replace(/\{npc\}/g, 'Irma Ironhand'));
    expect(authored).toContain(line);
  });
});
