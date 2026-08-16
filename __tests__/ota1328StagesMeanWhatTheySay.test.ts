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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));



// ⚠⚠ OTA-1328 — PUNCH LIST P19: A STAGE CAN NOW MEAN WHAT IT SAYS.
//
// Owner, playing 4.29.x: *"I needed to 'investigate the area' so I typed exactly that, it
// closed the stage, but the next stage spoke about giving the book to his sister. who's
// sister? and what book? … there's nothing in my inventory under mission items and there's
// no way to auto route to anything."*
//
// Measured: a stage could carry exactly four fields — stageType, narration, arbiter,
// checkKind. No item to grant, no item to require, no location, no person. And
// `huntAnchorId` reads the contract DEF, not the stage, so ONE anchor served all stages
// and there was nothing to route between. 57 stages across 50 contracts name an object or
// a person the engine had no way to produce. The stage closed because the VERB matched.
//
// ⚠ THE FIELDS ARE OPTIONAL AND SILENCE IS THE DEFAULT. 281 stages exist; they get filled
// in a content pass. A stage with no bindings must behave exactly as it did, or the
// half-done pass breaks the game — that is what the last test here holds.
import {
  countInPack, stageRequirementMet, stageRequirementLine, stageLocationId, nextStageDirection,
} from '../app/engine/questStage';
import { findHuntById } from '../app/engine/hunts';
import { resolvePosterLocation, huntAnchorId } from '../app/engine/contractMarkers';
import huntsData from '../app/data/quests/hunts.json';

const HUNTS = (huntsData as unknown as { hunts: Array<{ id: string; stages: Array<Record<string, unknown>> }> }).hunts;
const inv = (name: string, quantity = 1) =>
  [{ id: 'x', name, kind: 'misc' as const, rarity: 'Common' as const, quantity, tags: [] }];

describe('OTA-1328 — the stage layer', () => {
  it('⚠ a stage with no bindings behaves exactly as before — silence is the default', () => {
    expect(stageRequirementMet(undefined, undefined)).toBe(true);
    expect(stageRequirementMet({}, [])).toBe(true);
    expect(nextStageDirection({}, null, false)).toBeNull();
    // No locationName → the contract's anchor, unchanged.
    expect(stageLocationId({}, 'sinking_cathedral', resolvePosterLocation)).toBe('sinking_cathedral');
  });

  it('⚠⚠ a required item is actually REQUIRED, and counted exactly', () => {
    const stage = { requires: { item: "Wren's Logbook" } };
    expect(stageRequirementMet(stage, [])).toBe(false);
    expect(stageRequirementMet(stage, inv("Wren's Logbook"))).toBe(true);
    // ⚠ No fuzzy matching: a gate that accepts a near-miss is a gate that lies.
    expect(stageRequirementMet(stage, inv('Logbook'))).toBe(false);
    const two = { requires: { item: 'Aether Crystal', quantity: 2 } };
    expect(stageRequirementMet(two, inv('Aether Crystal', 1))).toBe(false);
    expect(stageRequirementMet(two, inv('Aether Crystal', 2))).toBe(true);
  });

  it('⚠⚠ the refusal NAMES the thing — the silence is what read as broken', () => {
    const line = stageRequirementLine({ requires: { item: "Wren's Logbook" } }, 'The Silt Serpent');
    expect(line).toContain("Wren's Logbook");
    expect(line).toContain('The Silt Serpent');
    expect(stageRequirementLine({ requires: { item: 'Aether Crystal', quantity: 3 } }, 'X'))
      .toContain('3× Aether Crystal');
  });

  it('⚠⚠ a stage can stand somewhere of its own — the missing half of auto-route', () => {
    expect(stageLocationId({ locationName: 'Samarran' }, 'sinking_cathedral', resolvePosterLocation))
      .toBe('samarran');
    // An unresolvable name must NOT strand the stage — it falls back, it does not break.
    expect(stageLocationId({ locationName: 'Nowhere At All' }, 'sinking_cathedral', resolvePosterLocation))
      .toBe('sinking_cathedral');
  });

  it('⚠⚠ each stage directs you to the next — place, person, and what to bring', () => {
    const d = nextStageDirection(
      { locationName: 'Samarran', npcName: "Wren's sister", requires: { item: "Wren's Cut Line" } },
      'Samarran', true,
    );
    expect(d).toContain('Samarran');
    expect(d).toContain("Wren's sister");
    expect(d).toContain("Wren's Cut Line");
    // ⚠ Same ground and nothing asked for → no line. "Carry on" is noise.
    expect(nextStageDirection({}, 'Samarran', false)).toBeNull();
    // Same ground but a person to find → still worth saying.
    expect(nextStageDirection({ npcName: 'the dive-boss' }, null, false)).toContain('dive-boss');
  });

  it('⚠ countInPack is exact-name and sums stacks', () => {
    expect(countInPack(undefined, 'x')).toBe(0);
    expect(countInPack(inv('Rope', 3), 'rope')).toBe(3);
    expect(countInPack(inv('Rope', 3), 'Climbing Rope')).toBe(0);
  });
});

describe("OTA-1328 — the owner's own hunt, made real", () => {
  const hunt = findHuntById('hunt_silt_serpent_cathedral')!;

  it('⚠⚠ THE CASE HE REPORTED: the logbook chain now exists as objects', () => {
    // Stage 1 finds Wren's line; stage 2 trades it to her SISTER, who is now somebody.
    expect(hunt.stages[1]!.grants?.item).toBe("Wren's Cut Line");
    expect(hunt.stages[2]!.npcName).toBe("Wren's sister");
    expect(hunt.stages[2]!.requires?.item).toBe("Wren's Cut Line");
    // Recover the body (stage 3) → that is what buys the logbook (stage 4).
    expect(hunt.stages[3]!.grants?.item).toBe("Wren's Body");
    expect(hunt.stages[4]!.requires?.item).toBe("Wren's Body");
    expect(hunt.stages[4]!.grants?.item).toBe("Wren's Logbook");
    // And the logbook is what the trick-stage reads.
    expect(hunt.stages[5]!.requires?.item).toBe("Wren's Logbook");
  });

  it('⚠⚠ every chain is CLOSED — nothing is required that was never granted', () => {
    // The defect in one assertion, generalised over every hunt in the game: a stage may
    // not ask for a thing unless an EARLIER stage of the same hunt hands it over.
    for (const h of HUNTS) {
      const granted = new Set<string>();
      for (const st of h.stages) {
        const req = st.requires as { item?: string } | undefined;
        const gr = st.grants as { item?: string } | undefined;
        if (req?.item) {
          expect({ hunt: h.id, needs: req.item, grantedSoFar: [...granted] })
            .toEqual({ hunt: h.id, needs: req.item, grantedSoFar: expect.arrayContaining([req.item]) });
        }
        if (gr?.item) granted.add(gr.item);
      }
    }
  });

  it('⚠ every stage location that is named resolves to a real tile', () => {
    for (const h of HUNTS) {
      for (const st of h.stages) {
        const ln = st.locationName as string | undefined;
        if (ln) expect(resolvePosterLocation(ln)).toBeTruthy();
      }
    }
  });

  it('⚠ the hunt still anchors where its poster says — the layer added, it did not move', () => {
    expect(huntAnchorId(hunt)).toBe('sinking_cathedral');
    expect(stageLocationId(hunt.stages[2], huntAnchorId(hunt), resolvePosterLocation))
      .toBe('sinking_cathedral');
  });
});
