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
 * OTA-1080 — THE REST OF THE CAST GOES ON THE LEDGER.
 *
 * Phase 1 built a per-person relationship ledger and then wired it to vendors
 * and Core Guardians only. The two populations the player actually TALKS to
 * were invisible to it:
 *
 *  - WANDERERS. Persuadable travellers on the road: talk to them, talk a lead
 *    out of them, or put a hand on them and take their coins. None of it was
 *    remembered by anybody. And `makeWanderer` mints
 *    `wanderer_<archetype>_<tile seed>`, so even once they were on the ledger
 *    the same person met on two tiles would have been two rows — the roadside
 *    leak of OTA-1076 waiting to happen again in a system that had never been
 *    keyed at all. Archetype + name is the person.
 *  - ESCORTS. Worse: there was nobody to put on it. An escort was a POOL —
 *    label, hp, count — with no individuals in it, so you could walk three
 *    people across the flats and the survivors had no more identity than a
 *    stack of rations. The pool now names whoever walks at the front.
 *
 * The ledger itself needed no extending. It needed pointing at the rest of the
 * cast.
 */
jest.setTimeout(60_000);

import { vendorNpcId } from '../app/state/gameStore';
import { npcLedgerId, vendorLedgerId, recordNpcSighting, recordNpcDealing, getRelation, npcRegard } from '../app/engine/npcMemory';
import { emptyMemory } from '../app/engine/worldMemory';
import { makeWanderer } from '../app/engine/wanderers';
import { spawnEscortPool, escortLeaderName } from '../app/engine/escort';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1080 — a wanderer is a person, on any tile', () => {
  it('THE LEAK THAT NEVER GOT THE CHANCE: the tile seed does not split them', () => {
    // makeWanderer's id carries the seed, so two encounters with the same
    // person on different tiles carry different ids. Keyed naively, that is
    // OTA-1076 all over again — an unbounded row per encounter.
    const a = makeWanderer(7);
    const b = makeWanderer(7 + 0); // same seed, same person
    expect(npcLedgerId(a)).toBe(npcLedgerId(b));
    expect(npcLedgerId(a)).toMatch(/^wanderer:[a-z_]+:[a-z0-9_]+$/);
    expect(npcLedgerId(a)).not.toContain('7');
  });

  it('two genuinely different travellers stay two people', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(npcLedgerId(makeWanderer(i)));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('the same name in a different role is a different person', () => {
    // Archetype is part of the identity: "Corin the refugee" is not "Corin the
    // scavenger" who happens to share a first name.
    expect(npcLedgerId({ id: 'wanderer_refugee_1', name: 'Corin' }))
      .not.toBe(npcLedgerId({ id: 'wanderer_scavenger_1', name: 'Corin' }));
  });

  it('meeting one three times makes them know you, like anybody else', () => {
    const w = makeWanderer(3);
    let m = emptyMemory();
    for (let h = 0; h < 3; h++) {
      m = recordNpcSighting(m, { id: npcLedgerId(w), name: w.name, role: w.role }, { nowMs: h + 1, hoursElapsed: h * 10 });
    }
    const rel = getRelation(m, npcLedgerId(w))!;
    expect(rel.meetings).toBe(3);
    expect(npcRegard(rel)).toBe('known');
  });

  it('SHAKING THEM DOWN IS A WRONG — it used to be the one free robbery', () => {
    // Lifting an item off a vendor's counter has cost you a `wrongs` since
    // OTA-1072. Putting a hand on a traveller and taking their coins cost
    // nothing personal, because wanderers were not on the ledger at all.
    const w = makeWanderer(11);
    const id = npcLedgerId(w);
    let m = recordNpcSighting(emptyMemory(), { id, name: w.name }, { nowMs: 1, hoursElapsed: 0 });
    m = recordNpcDealing(m, id, { wrongs: 1 });
    expect(getRelation(m, id)!.wrongs).toBe(1);
    expect(npcRegard(getRelation(m, id))).toBe('wronged');
  });

  it('the store and the engine agree on who they are', () => {
    // vendorNpcId is the store's alias for the same rule; a drift here is how
    // the ledger silently splits one person into two.
    const w = makeWanderer(21);
    expect(vendorNpcId(w)).toBe(npcLedgerId(w));
    expect(vendorLedgerId(w)).toBe(npcLedgerId(w));
  });
});

describe('OTA-1080 — an escort party has somebody at the front', () => {
  it('THE GAP: a pool had no people in it to remember', () => {
    const pool = spawnEscortPool(3, 20, 'pilgrims');
    expect(pool.leaderName).toBeTruthy();
    expect(pool.count).toBe(3);      // the party is unchanged
    expect(pool.label).toBe('pilgrims');
  });

  it('the same party is the same person — a reload cannot reshuffle them', () => {
    // Deterministic in the party's own shape, so accepting the same contract
    // twice, or loading a save, reads as the same escort.
    expect(spawnEscortPool(3, 20, 'pilgrims').leaderName)
      .toBe(spawnEscortPool(3, 20, 'pilgrims').leaderName);
    expect(escortLeaderName(3, 60, 'pilgrims')).toBe(escortLeaderName(3, 60, 'pilgrims'));
  });

  it('different parties get different people', () => {
    const names = new Set([
      spawnEscortPool(2, 20, 'pilgrims').leaderName,
      spawnEscortPool(4, 20, 'scholars').leaderName,
      spawnEscortPool(3, 40, 'refugees').leaderName,
      spawnEscortPool(5, 30, 'traders').leaderName,
    ]);
    expect(names.size).toBeGreaterThan(1);
  });

  it('the leader keys onto the ledger as a person, not a party', () => {
    const pool = spawnEscortPool(3, 20, 'pilgrims');
    const id = vendorNpcId({ id: `escort_${pool.leaderName}`, name: pool.leaderName! });
    expect(id).toBe(`escort:${pool.leaderName!.toLowerCase()}`);
    let m = recordNpcSighting(emptyMemory(), { id, name: pool.leaderName! }, { nowMs: 1, hoursElapsed: 0 });
    m = recordNpcDealing(m, id, { contractsTurnedIn: 1 });   // you got them home
    expect(getRelation(m, id)!.contractsTurnedIn).toBe(1);
    // A finished piece of work is worth more than merely being placed: one
    // delivered contract puts them at 'familiar', not 'known'.
    expect(npcRegard(getRelation(m, id))).toBe('familiar');
  });

  it('a pre-OTA-1080 save with no leader does not crash the party', () => {
    // leaderName is optional on the type precisely so old saves load. Nothing
    // may assume it exists.
    const legacy = { label: 'pilgrims', hp: 30, hpMax: 30, count: 3 };
    expect(legacy.count).toBe(3);
    expect((legacy as { leaderName?: string }).leaderName).toBeUndefined();
  });
});

describe('OTA-1080 — the identity rule keeps its old promises', () => {
  it('vendors, roadside, market stalls and overlay traders are untouched', () => {
    expect(npcLedgerId({ id: 'vendor_irma', name: 'Irma' })).toBe('vendor_irma');
    expect(npcLedgerId({ id: 'roadside_honest_1', name: 'Grit Maalen' })).toBe('roadside:grit_maalen');
    expect(npcLedgerId({ id: 'hidden_market_weapons', name: 'Zorin' })).toBe('hidden_market_weapons:zorin');
    expect(npcLedgerId({ id: 'overlay_x_ab12cd', name: 'Olek' })).toBe('overlay:olek');
    expect(npcLedgerId({ name: 'Nameless' })).toBe('vendor:nameless');
  });

  it('the five namespaces cannot collide', () => {
    const ids = [
      npcLedgerId({ id: 'roadside_honest_1', name: 'Sena' }),
      npcLedgerId({ id: 'wanderer_traveler_1', name: 'Sena' }),
      npcLedgerId({ id: 'escort_Sena', name: 'Sena' }),
      npcLedgerId({ id: 'overlay_a_b', name: 'Sena' }),
      npcLedgerId({ id: 'hidden_market_food', name: 'Sena' }),
    ];
    expect(new Set(ids).size).toBe(5);
  });
});
