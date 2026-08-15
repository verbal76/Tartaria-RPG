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
 * OTA-1061 — CONVERSATION THAT GIVES YOU SOMETHING.
 *
 * Topics were gated, characterful and inert. The neighbouring system already
 * pays — parley hands you a lead or their goods — so a talk that never yields
 * anything read thin sitting next to one that does. Topics can now carry a
 * grant: a traceable LEAD, an authored WHISPER chain, or a small payment.
 *
 * Two design rules the tests exist to hold:
 *  - FIRE-ONCE, and not by a separate flag. The grant is keyed off the SAME
 *    talkedTopics counter that drives "I have told you that one", so the payout
 *    and the acknowledgement read one fact and cannot disagree.
 *  - NO STANDING. OTA-803 deleted gifting over a faction-standing side door and
 *    OTA-1060 only reopened it behind a lifetime budget. A topic that granted
 *    standing would be a SECOND door into the same economy with no budget on
 *    it. Talk pays in information and occasionally coin. Never reputation.
 */
jest.setTimeout(60_000);

import { topicsFor, type TalkContext } from '../app/engine/dialogue';
import { CHAINS } from '../app/engine/whispers';

const base: TalkContext = {
  regard: 'trusted', contractsTurnedIn: 4, standing: 60, titles: [],
  hasRecentRaidNews: false, chapter: 'cores', cores: 2, choices: [], // OTA-1065
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RAW = require('../app/data/npcs/dialogue_topics.json') as {
  npcs: Record<string, { topics: { id: string; grants?: Record<string, unknown>; gate?: Record<string, unknown> }[] }>;
};
const allTopics = Object.values(RAW.npcs).flatMap((n) => n.topics);
const granting = allTopics.filter((t) => t.grants);

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1061 — talk can pay, in the two currencies it is allowed', () => {
  it('some topics grant, and they grant leads, whispers and coin', () => {
    expect(granting.length).toBeGreaterThan(0);
    const kinds = new Set(granting.flatMap((t) => Object.keys(t.grants!)));
    expect(kinds).toEqual(new Set(['lead', 'whisper', 'tc']));
  });

  it('⚠ NO TOPIC GRANTS STANDING — the second door stays shut', () => {
    // OTA-803 deleted gifting over exactly this. OTA-1060 reopened the verb only
    // behind a lifetime per-faction budget. A grant of standing here would be a
    // parallel route with no budget at all.
    for (const t of granting) {
      expect(Object.keys(t.grants!)).not.toContain('standing');
      expect(Object.keys(t.grants!)).not.toContain('rep');
    }
  });

  it('a payment is pocket money, not a contract fee', () => {
    for (const t of granting) {
      const tc = t.grants!.tc as number | undefined;
      if (tc !== undefined) {
        expect(tc).toBeGreaterThan(0);
        expect(tc).toBeLessThanOrEqual(40);
      }
    }
  });

  it('every whisper granted is a chain that actually exists', () => {
    // A topic promising a chain the engine has never heard of would say a line,
    // print nothing, and leave the player looking for a rumour that is not there.
    const ids = new Set(CHAINS.map((c) => c.id));
    for (const t of granting) {
      const w = t.grants!.whisper as string | undefined;
      if (w) expect(ids.has(w)).toBe(true);
    }
  });

  it('every lead is a real hint with a real reward', () => {
    for (const t of granting) {
      const lead = t.grants!.lead as { hint: string; rewardTc: number } | undefined;
      if (lead) {
        expect(lead.hint.length).toBeGreaterThan(30);
        expect(lead.hint).not.toContain('{');
        expect(lead.rewardTc).toBeGreaterThan(0);
      }
    }
  });
});

describe('OTA-1061 — you have to have earned the useful ones', () => {
  it('nothing that pays is available to somebody who just walked in', () => {
    // A stranger who can talk a lead out of a shopkeeper makes the whole
    // relationship layer pointless — the payout would be the fast path.
    const stranger: TalkContext = { ...base, regard: 'met', contractsTurnedIn: 0, standing: 0 };
    for (const npc of Object.keys(RAW.npcs)) {
      for (const t of topicsFor(npc, stranger)) {
        const authored = allTopics.find((x) => x.id === t.id);
        expect(authored?.grants).toBeUndefined();
      }
    }
  });

  it('every granting topic carries a gate', () => {
    for (const t of granting) expect(t.gate).toBeTruthy();
  });

  it('...and a robbed shopkeeper hands over nothing at all', () => {
    const thief: TalkContext = { ...base, regard: 'wronged' };
    for (const npc of Object.keys(RAW.npcs)) {
      for (const t of topicsFor(npc, thief)) {
        expect(allTopics.find((x) => x.id === t.id)?.grants).toBeUndefined();
      }
    }
  });
});

describe('OTA-1061 — the store pays once, and reads one fact to decide', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SRC: string = require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');

  it('the grant is gated on the FIRST raise, off the same counter as the reply', () => {
    // Not a separate `granted` flag. One fact, read twice, so the payout and
    // "I have told you that one" cannot drift apart.
    // OTA-1064 — the call now yields whether it DELIVERED, so a lead that could
    // not land does not spend the topic. The fact it reads is unchanged.
    expect(SRC).toMatch(/const granted = asked === 0 && topic\.grants\s*\n\s*\? applyTopicGrant/);
    expect(SRC).toMatch(/const asked = get\(\)\.worldMemory\.talkedTopics/);
  });

  it('an unclaimed lead is never silently overwritten', () => {
    // The payout site reads a single slot. Replacing an unclaimed lead would
    // quietly delete something the player was told to go and find.
    expect(SRC).toMatch(/if \(player\.pendingLead\) \{/);
    expect(SRC).toContain("tip will keep");
    // ⚠ OTA-1064 — and it is no longer a lie. The topic stays unspent, so the
    // player can come back and actually collect it.
    expect(SRC).toContain('deferred = true;');
    expect(SRC).toContain('if (granted) {');
  });

  it('a whisper you already have is not planted twice', () => {
    expect(SRC).toMatch(/completedWhisperIds \?\? \[\]\)\.includes\(grant\.whisper\)/);
  });

  it('applyTopicGrant cannot touch faction standing', () => {
    // OTA-1064 — bound to applyTopicGrant's OWN body (column-0 close), not to
    // whichever function happens to be declared next. A helper added between
    // them used to fail this test for its position rather than its behaviour.
    const from = SRC.indexOf('function applyTopicGrant(');
    const fn = SRC.slice(from, SRC.indexOf('\n}\n', from));
    expect(fn.length).toBeGreaterThan(400);
    expect(fn).toContain('grant.whisper');   // we sliced the right function
    expect(fn).not.toContain('applyRepChange');
    expect(fn).not.toContain('factionStanding');
  });
});
