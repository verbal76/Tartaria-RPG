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
 * OTA-1086 — SIX FROM THE LOG. Owner: "fix all six bugs, ship to all three
 * lines." All six were found in one 11-part device-log triage:
 *
 *  1. The mud-golem hook narrated a golem and spawned an Aetheric Scarab.
 *  2. Irma hinted 'accept vigil' for TWO different contracts in one breath.
 *  3. The Crucible named a Legendary chest piece "Hollow Quill Sheaf" — the
 *     exact curio the player fed into the forge.
 *  4. Tarek re-told the same outpost raid verbatim on four straight visits.
 *  5. The Phoenix-Feather scam vendor replayed twice inside an hour.
 *  6. A sneak PASSED its visible skill roll, then a second hidden d20 said
 *     "catches the movement — SPOTTED".
 */
jest.setTimeout(60_000);

import { getHookOutcome } from '../app/engine/hooks';
import { findEnemyByName } from '../app/engine/encounter';
import { acceptKeyword } from '../app/state/gameStore';
import { synthesizeFusionNameViaQwen, type FusionSynthEngine } from '../app/engine/itemFusion';
import { raidNewsFor, recordNpcDealing } from '../app/engine/npcMemory';
import { pickWastelandEncounter, RECENT_ENCOUNTER_MEMORY, __TEST_ONLY__ } from '../app/engine/wastelandEncounters';
import type { InventoryItem, NpcRelation, WorldMemory, Location, UniqueItemStats } from '../app/engine/types';
import * as fs from 'fs';
import * as path from 'path';

const store = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

// ── 1. The golem hook spawns a golem ─────────────────────────────────────

describe('OTA-1086 — the mud-golem hook spawns the monster it narrated', () => {
  it('mud_golem_stir resolves to a NAMED Mud Golem, and that enemy exists', () => {
    const final = getHookOutcome('mud_golem_stir', 1); // stage 2 of 2 — the turn
    expect(final?.effects).toEqual([{ type: 'spawn_enemy_name', name: 'Mud Golem' }]);
    expect(findEnemyByName('Mud Golem')).toBeTruthy();
  });

  it('the spawn handler honors names, and its feed line matches the range it sets', () => {
    expect(store).toMatch(/case 'spawn_enemy_name':\s*\n\s*case 'spawn_enemy_tag': \{/);
    // The state sets range 'mid'; the line must not say "close".
    expect(store).toMatch(/rises to meet you\. Combat begins at mid range\./);
    expect(store).not.toMatch(/emerges from the hook\. Combat begins at close range\./);
  });
});

// ── 2. One keyword per contract ──────────────────────────────────────────

describe("OTA-1086 — 'accept X' hints never collide at one counter", () => {
  it("Irma's exact pair gets two distinct keywords", () => {
    const taken = new Set<string>();
    const a = acceptKeyword('Kindling for the Vigil', taken);
    const b = acceptKeyword('The Giant-Watch Vigil', taken);
    expect(a).toBe('vigil');
    expect(b).toBe('giant-watch'); // hyphen kept, so it still fuzzy-matches its title
    expect(a).not.toBe(b);
  });

  it('the alternate keyword is a real word of its own title (fuzzy match holds)', () => {
    const taken = new Set<string>(['vigil']);
    const kw = acceptKeyword('The Giant-Watch Vigil', taken);
    expect('The Giant-Watch Vigil'.toLowerCase()).toContain(kw);
  });

  it('with no collision the behavior is unchanged (last significant word)', () => {
    expect(acceptKeyword('The Bog Dragon of Old Drakova')).toBe('drakova');
    expect(acceptKeyword('Cradle of Dusk Compass')).toBe('compass');
  });

  it('all four vendor hint sites share the per-visit keyword set', () => {
    const wired = store.match(/acceptKeyword\([a-z]\.title, takenAcceptWords\)/g) ?? [];
    expect(wired.length).toBe(4);
  });
});

// ── 3. The forge never names its product after an ingredient ─────────────

describe('OTA-1086 — the Crucible refuses input-echo and curio names', () => {
  const stats: UniqueItemStats = { kind: 'armor', armorSlot: 'chest', rarity: 'Legendary', acBonus: 3, durability: { current: 20, max: 20 } } as unknown as UniqueItemStats;
  const inputs = [
    { id: 'a', name: 'Hollow Quill Sheaf', quantity: 1 },
    { id: 'b', name: 'Aetheric Shard', quantity: 1 },
    { id: 'c', name: 'Aether Dust', quantity: 1 },
  ] as unknown as InventoryItem[];
  const qwenSaying = (name: string): FusionSynthEngine => ({
    isReady: () => true,
    generate: async () => JSON.stringify({ name, description: 'A worked piece, cooled and set.' }),
  });

  it("the owner's exact case — an input's own name — is rejected (falls back to deterministic)", async () => {
    const out = await synthesizeFusionNameViaQwen(stats, inputs, ['aether', 'metal', 'cloth', 'organic'], qwenSaying('Hollow Quill Sheaf'));
    expect(out).toBeNull();
  });

  it('any curio-catalog name is rejected even when it was not an input', async () => {
    const out = await synthesizeFusionNameViaQwen(stats, inputs, ['aether', 'metal'], qwenSaying('Brass Cog Cluster'));
    expect(out).toBeNull();
  });

  it('an original name still lands', async () => {
    const out = await synthesizeFusionNameViaQwen(stats, inputs, ['aether', 'metal'], qwenSaying('Stormcalled Cuirass'));
    expect(out?.name).toBe('Stormcalled Cuirass');
  });
});

// ── 4. A raid is news exactly once per person ────────────────────────────

describe('OTA-1086 — the raid is told once, not on every room-hop', () => {
  const rel = (over: Partial<NpcRelation> = {}): NpcRelation => ({
    id: 'roadside:tarek', name: 'Tarek', firstMetAt: 0, lastSeenAt: 0, lastSeenHours: 20,
    prevSeenHours: 0, meetings: 5, trades: 2, tcTraded: 30, contractsTaken: 1,
    contractsTurnedIn: 0, wrongs: 0, factionId: 'reclaimers_guild', ...over,
  } as NpcRelation);
  const memory = (): WorldMemory => ({
    npcRelations: { 'roadside:tarek': rel() },
    recentRaids: [{ defenderId: 'reclaimers_guild', attackerId: 'x', attackerName: 'Conspiracy Architects', locationId: 'somewhere', locationName: 'Somewhere', atHours: 10 }],
  } as unknown as WorldMemory);

  it('fresh raid qualifies; a delivered raid does not', () => {
    expect(raidNewsFor(memory(), rel(), 20)?.atHours).toBe(10);
    expect(raidNewsFor(memory(), rel({ raidHeardAtHours: 10 }), 20)).toBeNull();
  });

  it('a NEWER raid still gets through after an older one was told', () => {
    const m = memory();
    (m.recentRaids as { atHours: number }[]).push({ ...(m.recentRaids as object[])[0] as object, atHours: 15 } as never);
    expect(raidNewsFor(m, rel({ raidHeardAtHours: 10 }), 20)?.atHours).toBe(15);
  });

  it('recordNpcDealing max-merges the stamp (a stale caller cannot un-tell)', () => {
    let m = memory();
    m = recordNpcDealing(m, 'roadside:tarek', { raidHeardAtHours: 10 });
    m = recordNpcDealing(m, 'roadside:tarek', { raidHeardAtHours: 4 });
    expect(m.npcRelations?.['roadside:tarek']?.raidHeardAtHours).toBe(10);
  });

  it('both greeting paths stamp the delivery', () => {
    const stamps = store.match(/recordNpcDealing\(s\.worldMemory, rel\.id, \{ raidHeardAtHours: raid\.atHours \}\)/g) ?? [];
    expect(stamps.length).toBe(2);
  });
});

// ── 5. Set-pieces don't replay back-to-back ──────────────────────────────

describe('OTA-1086 — recent encounters stay off the table', () => {
  const loc = { id: 'x', name: 'X', type: 'wilds', danger: 2, tags: ['outskirts', 'open'] } as unknown as Location;
  const eligibleIds = Object.entries(__TEST_ONLY__.ARCHETYPES)
    .filter(([, a]) => a.matchers.some((m) => ['outskirts', 'open'].includes(m.toLowerCase())))
    .map(([id]) => id);

  it('the feather vendor is in this biome, and excluding recents excludes it', () => {
    expect(eligibleIds).toContain('cursed_relic_trade');
    const allButOne = eligibleIds.filter((id) => id !== eligibleIds[0]);
    for (let i = 0; i < 60; i++) {
      const enc = pickWastelandEncounter(loc, {
        stepsSinceLastEncounter: 99, threshold: 0, rollChance: 1.0,
        recentArchetypeIds: allButOne,
      });
      expect(enc).toBeTruthy();
      expect(enc!.archetypeId).toBe(eligibleIds[0]); // the only non-recent one
    }
  });

  it('excluding EVERYTHING falls back to the full pool rather than a silent step', () => {
    const enc = pickWastelandEncounter(loc, {
      stepsSinceLastEncounter: 99, threshold: 0, rollChance: 1.0,
      recentArchetypeIds: eligibleIds,
    });
    expect(enc).toBeTruthy();
  });

  it('the travel step records what fired, newest first, capped', () => {
    expect(RECENT_ENCOUNTER_MEMORY).toBe(8);
    expect(store).toMatch(/recentArchetypeIds: get\(\)\.worldMemory\.recentEncounterArchetypes \?\? \[\]/);
    expect(store).toMatch(/\.slice\(0, RECENT_ENCOUNTER_MEMORY\)/);
  });
});

// ── 6. One button, one roll ──────────────────────────────────────────────

describe('OTA-1086 — the visible sneak roll is THE sneak roll', () => {
  it('the opener no longer rolls a second hidden d20', () => {
    expect(store).toMatch(/stealth: opener carried by the skill roll/);
    expect(store).not.toMatch(/catches the movement — no sneaking up on this one/);
  });

  it('the reset contest uses the roll the player already saw', () => {
    expect(store).toMatch(/const pInit = \(skill\.total \?\? 0\) \+ 2 \+ timeBonus;/);
  });
});
