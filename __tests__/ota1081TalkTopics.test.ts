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
  chapter: 'hook', cores: 0, choices: [], // OTA-1088
};
const at = (over: Partial<TalkContext>): TalkContext => ({ ...base, ...over });
const ids = (npc: string, ctx: TalkContext) => topicsFor(npc, ctx).map((t) => t.id);

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1081 — the slice is three people, and it says so', () => {
  it('OTA-1082 — every authored vendor now has topics, not just the slice', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vendors = require('../app/data/npcs/vendors.json') as { vendors: { id: string; name: string }[] };
    for (const v of vendors.vendors) {
      expect(hasTopicsFor(v.id)).toBe(true);
      expect(displayNameFor(v.id)).toBe(v.name);
    }
    expect(TOPIC_NPC_IDS.length).toBe(vendors.vendors.length);
  });

  it('every one of them opens with something, and closes to one thing if robbed', () => {
    for (const npc of TOPIC_NPC_IDS) {
      expect(topicsFor(npc, at({ regard: 'met' })).length).toBeGreaterThan(0);
      expect(topicsFor(npc, at({ regard: 'wronged' }))).toHaveLength(1);
    }
  });

  it('OTA-1085 — the non-vendor cast is covered by CLASS, not by name', () => {
    // ⚠ This asserted `hasTopicsFor('roadside:grit_maalen') === false` before
    // OTA-1085 and the change is intended: roadside traders are 24
    // procedurally-named people sharing two archetypes, so what makes them
    // distinct is their KIND. The ledger still treats them as individuals —
    // Grit remembers you personally; what he SAYS is what a roadside trader
    // says.
    expect(hasTopicsFor('roadside:grit_maalen')).toBe(true);
    expect(hasTopicsFor('wanderer:refugee:corin')).toBe(true);
    expect(hasTopicsFor('escort:sena')).toBe(true);
    expect(hasTopicsFor('guardian:zharaks_teeth')).toBe(true);
    // Somebody genuinely uncovered still falls through — a talk verb that
    // swallows the input and says nothing is worse than not having it.
    expect(hasTopicsFor('hidden_market_weapons')).toBe(false);
    expect(topicsFor('nobody_at_all', base)).toEqual([]);
    expect(displayNameFor('nobody_at_all')).toBeNull();
  });

  it('an EXACT entry always beats the class one', () => {
    // So authoring a specific person later needs no code change.
    expect(displayNameFor('irma_ironhand')).toBe('Irma Ironhand');
    // ...and somebody covered only by class has no authored display name,
    // because "a refugee" is not what anybody is called.
    expect(displayNameFor('wanderer:refugee:corin')).toBeNull();
  });

  it('every wanderer archetype the generator can mint has a voice', () => {
    // A missing archetype would be an invisible hole: the traveller spawns,
    // the TALK verb finds nothing, and nothing says why.
    for (const arch of ['traveler', 'refugee', 'tinker', 'scout', 'pilgrim', 'drifter', 'scavenger']) {
      expect(hasTopicsFor(`wanderer:${arch}:someone`)).toBe(true);
      expect(topicsFor(`wanderer:${arch}:someone`, at({ regard: 'known' })).length).toBeGreaterThan(1);
    }
  });

  it('class sets obey every rule the named cast does', () => {
    for (const k of ['class:roadside', 'class:escort', 'class:guardian', 'class:wanderer:drifter']) {
      const id = k.replace('class:', '').replace('wanderer:', 'wanderer:') + ':x';
      const probe = k === 'class:wanderer:drifter' ? 'wanderer:drifter:x' : id;
      expect(topicsFor(probe, at({ regard: 'met' })).length).toBeGreaterThan(0);
      expect(topicsFor(probe, at({ regard: 'wronged' }))).toHaveLength(1);
    }
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

  it('every one of them has something to say about it', () => {
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

describe('OTA-1082 — the story is the fifth gate', () => {
  it('a chapter topic is shut before you get there and open after', () => {
    expect(ids('order_scholar', at({ regard: 'trusted', chapter: 'cores' }))).not.toContain('vesryn_chapter');
    expect(ids('order_scholar', at({ regard: 'trusted', chapter: 'descent' }))).toContain('vesryn_chapter');
    // ...and stays open for every later phase, because the line is about
    // something you have DONE, and you cannot un-descend.
    for (const c of ['nexus', 'choice', 'ended'] as const) {
      expect(ids('order_scholar', at({ regard: 'trusted', chapter: c }))).toContain('vesryn_chapter');
    }
  });

  it('cores gate separately from phase — `cores` is a long chapter', () => {
    const two = at({ regard: 'familiar', chapter: 'cores', cores: 2 });
    expect(ids('order_scholar', two)).toContain('t_cores');
    expect(ids('order_scholar', { ...two, cores: 1 })).not.toContain('t_cores');
  });

  it('a character who never started the main quest defaults to the beginning', () => {
    // The store passes 'hook' when mainQuest is absent. Getting this wrong the
    // other way — defaulting to 'ended' — would unlock every story topic on a
    // fresh character.
    expect(ids('order_scholar', at({ regard: 'trusted', chapter: 'hook' }))).not.toContain('vesryn_chapter');
  });

  it('ALL FIVE gate dimensions the build plan named are live in content', () => {
    // ⚠ The machinery for standing / titles / contracts existed in OTA-1081 and
    // no authored topic used it, so those paths had never run on a device.
    // Tested is not the same as exercised.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('../app/data/npcs/dialogue_topics.json') as
      { npcs: Record<string, { topics: { gate?: Record<string, unknown> }[] }> };
    const used = new Set<string>();
    for (const npc of Object.values(raw.npcs)) {
      for (const t of npc.topics) for (const k of Object.keys(t.gate ?? {})) used.add(k);
    }
    for (const dim of ['minRegard', 'onlyRegard', 'minStanding', 'requiresTitle',
                       'minContractsTurnedIn', 'minChapter', 'minCores', 'requiresRecentRaid']) {
      expect(used.has(dim)).toBe(true);
    }
  });

  it('standing, titles and contracts each actually gate a real topic', () => {
    expect(ids('halem_trader', at({ regard: 'known', standing: 34 }))).not.toContain('halem_standing');
    expect(ids('halem_trader', at({ regard: 'known', standing: 35 }))).toContain('halem_standing');
    expect(ids('scrap_broker', at({ regard: 'known', contractsTurnedIn: 1 }))).not.toContain('tellin_contracts');
    expect(ids('scrap_broker', at({ regard: 'known', contractsTurnedIn: 2 }))).toContain('tellin_contracts');
    expect(ids('irma_ironhand', at({ regard: 'known' }))).not.toContain('irma_title');
    expect(ids('irma_ironhand', at({ regard: 'known', titles: ['skyreacher'] }))).toContain('irma_title');
  });
});
