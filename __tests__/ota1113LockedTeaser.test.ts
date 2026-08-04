// OTA-1113 — THE DOOR THE PLAYER CAN SEE. 141 of 182 topics sit behind gates,
// and a locked topic used to be invisible — depth the player could never know
// existed. The talk sheet now ends with a COUNT of what's still shut ("…4
// things Irma doesn't tell strangers"), never the labels; tapping it gets an
// in-voice deflection. Plus two new gate roads for the OTA-1114 authoring
// wave: minLovedGifts (you honored who they are) and minPocketsMumbled (the
// thief's-only door). This suite locks the teaser's no-spoiler invariants,
// the rung thresholds, the deflection pools, and the gate-key authoring lock.

jest.setTimeout(30000);

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
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import {
  TOPIC_NPC_IDS, TOPIC_CLASS_KEYS, topicsFor, lockedTopicCount, lockedTeaserLabel,
  teaserDeflectionLine, gateAllows, TEASER_MIN_REGARD,
} from '../app/engine/dialogue';
import type { TalkContext, Topic } from '../app/engine/dialogue';
import type { NpcRegard } from '../app/engine/npcMemory';
import rawTopics from '../app/data/npcs/dialogue_topics.json';

const baseCtx = (regard: NpcRegard, extra?: Partial<TalkContext>): TalkContext => ({
  regard,
  contractsTurnedIn: 0,
  standing: 0,
  titles: [],
  hasRecentRaidNews: false,
  chapter: 'hook',
  cores: 0,
  choices: [],
  ...extra,
});

const ALL_SETS = (rawTopics as { npcs: Record<string, { displayName: string; topics: Topic[] }> }).npcs;

describe('OTA-1113 — locked-topic count (the teaser number)', () => {
  it('strangers and the merely-met get NO teaser, whatever is locked', () => {
    for (const id of [...TOPIC_NPC_IDS, ...TOPIC_CLASS_KEYS]) {
      expect(lockedTopicCount(id, baseCtx('stranger'))).toBe(0);
      expect(lockedTopicCount(id, baseCtx('met'))).toBe(0);
    }
    expect(TEASER_MIN_REGARD).toBe('known');
  });

  it('the wronged get no teaser — no checklist for winning someone back', () => {
    for (const id of TOPIC_NPC_IDS) {
      expect(lockedTopicCount(id, baseCtx('wronged'))).toBe(0);
    }
  });

  it('at known, count = topics closed to this player, excluding onlyRegard repair topics', () => {
    for (const id of [...TOPIC_NPC_IDS, ...TOPIC_CLASS_KEYS]) {
      const ctx = baseCtx('known');
      const open = topicsFor(id, ctx).length;
      const locked = lockedTopicCount(id, ctx);
      const repairTopics = ALL_SETS[id]!.topics.filter((t) => t.gate?.onlyRegard).length;
      expect(open + locked + repairTopics).toBe(ALL_SETS[id]!.topics.length);
    }
  });

  it('the count shrinks (never grows) as regard climbs', () => {
    for (const id of TOPIC_NPC_IDS) {
      const atKnown = lockedTopicCount(id, baseCtx('known'));
      const atFamiliar = lockedTopicCount(id, baseCtx('familiar'));
      const atTrusted = lockedTopicCount(id, baseCtx('trusted'));
      expect(atFamiliar).toBeLessThanOrEqual(atKnown);
      expect(atTrusted).toBeLessThanOrEqual(atFamiliar);
    }
  });
});

describe('OTA-1113 — the teaser NEVER leaks a label', () => {
  it('the row text carries the count and the name — no authored topic label appears in it', () => {
    for (const id of TOPIC_NPC_IDS) {
      const set = ALL_SETS[id]!;
      for (const regard of ['known', 'familiar', 'trusted'] as const) {
        const n = lockedTopicCount(id, baseCtx(regard));
        if (n === 0) continue;
        const label = lockedTeaserLabel(set.displayName, regard, n);
        // The trusted rung's SINGULAR variant deliberately reads "…a thing"
        // (a count of one written as prose); every other shape carries the digit.
        if (regard === 'trusted' && n === 1) expect(label).toContain('a thing');
        else expect(label).toContain(String(n));
        for (const t of set.topics) {
          // A topic label leaking into the teaser would spoil the finding of it.
          expect(label.toLowerCase()).not.toContain(t.label.toLowerCase());
        }
      }
    }
  });

  it('wording scales with the rung, count pluralizes', () => {
    expect(lockedTeaserLabel('Irma', 'known', 4)).toBe("…4 things Irma doesn't tell strangers");
    expect(lockedTeaserLabel('Irma', 'known', 1)).toBe("…1 thing Irma doesn't tell strangers");
    expect(lockedTeaserLabel('Irma', 'familiar', 2)).toBe('…2 things Irma still holds back');
    expect(lockedTeaserLabel('Irma', 'trusted', 1)).toBe("…a thing Irma isn't ready to say");
  });
});

describe('OTA-1113 — in-voice deflections', () => {
  it('three per rung, all naming the person, rotating per tap and wrapping', () => {
    for (const regard of ['known', 'familiar', 'trusted'] as const) {
      const seen = new Set<string>();
      for (let tap = 0; tap < 3; tap++) {
        const line = teaserDeflectionLine('Irma', regard, tap);
        expect(line).toContain('Irma');
        seen.add(line);
      }
      expect(seen.size).toBe(3);
      expect(teaserDeflectionLine('Irma', 'known', 3)).toBe(teaserDeflectionLine('Irma', 'known', 0));
    }
  });
});

describe('OTA-1113 — the two new gate roads', () => {
  it('minLovedGifts opens on the gift ledger and defaults closed', () => {
    const gate = { minLovedGifts: 2 };
    expect(gateAllows(gate, baseCtx('trusted'))).toBe(false); // field absent → 0
    expect(gateAllows(gate, baseCtx('trusted', { lovedGifts: 1 }))).toBe(false);
    expect(gateAllows(gate, baseCtx('trusted', { lovedGifts: 2 }))).toBe(true);
  });

  it('minPocketsMumbled is the thief-only door', () => {
    const gate = { minPocketsMumbled: 1 };
    expect(gateAllows(gate, baseCtx('trusted'))).toBe(false);
    expect(gateAllows(gate, baseCtx('trusted', { pocketsMumbled: 1 }))).toBe(true);
  });
});

describe('OTA-1113 — authoring lock: every gate key in the JSON is a real gate', () => {
  // gateAllows silently IGNORES unknown fields — a typo'd "minRegrad" would
  // leave its topic permanently ungated, leaking authored depth to strangers.
  // This lock makes a typo a red test instead of a silent leak.
  const KNOWN_GATE_KEYS = new Set([
    'minRegard', 'onlyRegard', 'requiresRecentRaid', 'requiresTitle',
    'minContractsTurnedIn', 'minStanding', 'minChapter', 'minCores',
    'requiresChoice', 'minLovedGifts', 'minPocketsMumbled',
  ]);

  it('no unknown gate fields anywhere in dialogue_topics.json', () => {
    for (const [npcId, set] of Object.entries(ALL_SETS)) {
      for (const t of set.topics) {
        for (const key of Object.keys(t.gate ?? {})) {
          if (!KNOWN_GATE_KEYS.has(key)) {
            throw new Error(`${npcId}:${t.id} gate has unknown field "${key}"`);
          }
        }
      }
    }
  });
});
