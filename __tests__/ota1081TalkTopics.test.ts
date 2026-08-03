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
 * OTA-1081 — PHASE 2, VERTICAL SLICE: GIVE THE WORLD A MOUTH.
 *
 * A `talk <npc>` exchange with three named vendors: a short list of topics,
 * each gated on what has actually passed between you, each with an authored
 * reply. This is the first feature that reads the Phase 1 ledger for something
 * the PLAYER chooses rather than something that happens at them.
 *
 * ⚠ THE MODEL IS NOT IN THE CRITICAL PATH. A Qwen turn measures 14-20s on
 * device; a conversation at that speed is a loading screen with dialogue in it.
 * Every reply here is authored and synchronous. These tests assert that — a
 * future "just make it dynamic" change has to break something visible.
 */
jest.setTimeout(60_000);

import {
  topicsFor, gateAllows, topicReply, hasTopicsFor, displayNameFor,
  alreadySaidLine, nothingToSayLine, TOPIC_NPC_IDS, type TalkContext,
} from '../app/engine/dialogue';

const base: TalkContext = {
  regard: 'met', contractsTurnedIn: 0, standing: 0, titles: [], hasRecentRaidNews: false,
};
const at = (over: Partial<TalkContext>): TalkContext => ({ ...base, ...over });
const ids = (npc: string, ctx: TalkContext) => topicsFor(npc, ctx).map((t) => t.id);

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1081 — the slice is three people, and it says so', () => {
  it('exactly the authored cast has topics', () => {
    expect(TOPIC_NPC_IDS.sort()).toEqual(['halem_trader', 'irma_ironhand', 'scrap_broker']);
    expect(hasTopicsFor('irma_ironhand')).toBe(true);
    expect(displayNameFor('irma_ironhand')).toBe('Irma Ironhand');
  });

  it('everybody else is untouched — the verb must not be swallowed', () => {
    // A vendor with no topics has to fall through to the behaviour they had
    // before this OTA. A slice that silently breaks "talk to" for the rest of
    // the cast is worse than not shipping the verb.
    expect(hasTopicsFor('roadside:grit_maalen')).toBe(false);
    expect(hasTopicsFor('hidden_market_weapons')).toBe(false);
    expect(topicsFor('nobody_at_all', base)).toEqual([]);
    expect(displayNameFor('nobody_at_all')).toBeNull();
  });
});

describe('OTA-1081 — warmth opens the conversation up', () => {
  it('a stranger gets the shop-front topic and nothing personal', () => {
    const open = ids('irma_ironhand', at({ regard: 'met' }));
    expect(open).toEqual(['irma_trade']);
  });

  it('being placed unlocks the next layer', () => {
    expect(ids('irma_ironhand', at({ regard: 'known' }))).toEqual(['irma_trade', 'irma_giants']);
  });

  it('a regular hears about the flood', () => {
    expect(ids('irma_ironhand', at({ regard: 'familiar' }))).toContain('irma_flood');
  });

  it('only somebody trusted gets asked back', () => {
    expect(ids('irma_ironhand', at({ regard: 'familiar' }))).not.toContain('irma_you');
    expect(ids('irma_ironhand', at({ regard: 'trusted' }))).toContain('irma_you');
  });

  it('the ladder is monotone — warmth never LOSES you a topic', () => {
    const rungs = ['met', 'known', 'familiar', 'trusted'] as const;
    for (const npc of TOPIC_NPC_IDS) {
      let prev: string[] = [];
      for (const r of rungs) {
        const now = ids(npc, at({ regard: r }));
        for (const p of prev) expect(now).toContain(p);
        prev = now;
      }
    }
  });
});

describe('OTA-1081 — robbing somebody is not a warmth level', () => {
  it('THE TRAP: wronged does not read as "above trusted"', () => {
    // A naive ladder would sort `wronged` somewhere on the scale and hand a
    // thief the most private topic in the set. It is a different state, not a
    // rung — so every ordinary topic closes and exactly one opens.
    const w = ids('irma_ironhand', at({ regard: 'wronged' }));
    expect(w).toEqual(['irma_wronged']);
    expect(w).not.toContain('irma_you');
    expect(w).not.toContain('irma_trade');
  });

  it('every one of the three has something to say about it', () => {
    for (const npc of TOPIC_NPC_IDS) {
      const w = topicsFor(npc, at({ regard: 'wronged' }));
      expect(w).toHaveLength(1);
      expect(w[0]!.lines[0]!.length).toBeGreaterThan(40);
    }
  });

  it('...and the apology topic is not reachable any other way', () => {
    for (const r of ['met', 'known', 'familiar', 'trusted'] as const) {
      for (const npc of TOPIC_NPC_IDS) {
        expect(ids(npc, at({ regard: r })).filter((i) => i.endsWith('_wronged'))).toEqual([]);
      }
    }
  });
});

describe('OTA-1081 — the world-state gates', () => {
  it('the raid topic waits for an actual raid', () => {
    expect(ids('irma_ironhand', at({ regard: 'known' }))).not.toContain('irma_war');
    expect(ids('irma_ironhand', at({ regard: 'known', hasRecentRaidNews: true }))).toContain('irma_war');
  });

  it('a raid does not open a topic you have not warmed into', () => {
    // Gates are AND, not OR. World state must not substitute for a relationship.
    expect(ids('irma_ironhand', at({ regard: 'met', hasRecentRaidNews: true }))).not.toContain('irma_war');
  });

  it('titles, standing and contracts each gate independently', () => {
    const g = { minRegard: 'known' as const, requiresTitle: 'skyreacher', minStanding: 40, minContractsTurnedIn: 2 };
    const ok = at({ regard: 'known', titles: ['skyreacher'], standing: 40, contractsTurnedIn: 2 });
    expect(gateAllows(g, ok)).toBe(true);
    expect(gateAllows(g, { ...ok, titles: [] })).toBe(false);
    expect(gateAllows(g, { ...ok, standing: 39 })).toBe(false);
    expect(gateAllows(g, { ...ok, contractsTurnedIn: 1 })).toBe(false);
    expect(gateAllows(g, { ...ok, regard: 'met' })).toBe(false);
  });

  it('an absent gate opens the topic to anybody', () => {
    expect(gateAllows(undefined, at({ regard: 'stranger' }))).toBe(true);
  });
});

describe('OTA-1081 — authored, deterministic, and finite', () => {
  it('the same state gives the same list, every time', () => {
    const ctx = at({ regard: 'familiar' });
    const first = ids('halem_trader', ctx);
    for (let i = 0; i < 50; i++) expect(ids('halem_trader', ctx)).toEqual(first);
  });

  it('the reply is indexed off how often you asked, never rolled', () => {
    const t = topicsFor('scrap_broker', at({ regard: 'trusted' }))[0]!;
    const a = topicReply(t, 0);
    for (let i = 0; i < 50; i++) expect(topicReply(t, 0)).toBe(a);
  });

  it('every authored line is real prose, with no placeholder left in it', () => {
    for (const npc of TOPIC_NPC_IDS) {
      for (const t of topicsFor(npc, at({ regard: 'trusted', hasRecentRaidNews: true }))) {
        expect(t.label.length).toBeGreaterThan(3);
        expect(t.lines.length).toBeGreaterThan(0);
        for (const line of t.lines) {
          expect(line.length).toBeGreaterThan(40);
          expect(line).not.toContain('{');
          expect(line).not.toContain('TODO');
        }
      }
    }
  });

  it('a spent topic is acknowledged, not replayed', () => {
    expect(alreadySaidLine('Irma')).toContain('Irma');
    expect(alreadySaidLine('Irma')).toContain('told you');
  });

  it('somebody with nothing to say reads as a state, not a missing feature', () => {
    expect(nothingToSayLine('Halem')).toContain('Halem');
    expect(nothingToSayLine('Halem')).toContain('nothing between you yet');
  });

  it('THE DESIGN CONSTRAINT: no async, no model, anywhere in this module', () => {
    // ⚠ The whole reason this ships. A 14-20s generation cannot be in a
    // conversation's critical path, so if someone later makes topicReply
    // awaitable this test is what stops it going out quietly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/engine/dialogue.ts'), 'utf8');
    expect(src).not.toMatch(/\basync\b/);
    expect(src).not.toMatch(/await |Promise|llama|generate\(/);
    expect(topicReply(topicsFor('irma_ironhand', at({ regard: 'trusted' }))[0]!, 0))
      .toEqual(expect.any(String));
  });
});
