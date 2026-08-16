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


// ⚠⚠ OTA-1315 — THE INFINITE LIFE GLITCH.
//
// Owner: *"I accidentally hit restore character when Francis died, and it gave
// me an alive full health copy of Francis underneath dead Francis. so it's an
// infinite life glitch."*
//
// `importSaveAsNewSlot` mints a NEW slot and never overwrites — deliberate
// (OTA-1178), because a player restoring a backup has already lost a character
// once. But nothing asked whether the character was LOST or DEAD, so a backup
// taken while alive was a free, repeatable revival that bypassed the
// Resurrection Gem — the one sanctioned way back, scarce on purpose.
//
// Owner's rule: *"gate restore character behind having an alive one and behind
// having one on the role of the fallen. it should only be for when a character
// 'disappears'."*
import {
  importSaveAsNewSlot, listSlots, deleteSlot, saveSlot,
  recordFallenSeed, hasFallenSeed, characterSeedOf, loadGlobalStash, saveGlobalStash,
} from '../app/engine/saveSystem';
// ⚠ audit — SaveState lives in engine/types and was never re-exported by
// saveSystem; the old import passed Jest only because babel strips types, and
// it was the one error the typecheck:tests ratchet caught on golem (203 > 202).
import type { SaveState } from '../app/engine/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
beforeEach(async () => { await AsyncStorage.clear(); });

const FRANCIS = 'Francis|aetherborn|eternal_dynasty|1786800000000';

function save(over: Partial<Record<string, unknown>> = {}): SaveState {
  return {
    version: 1,
    savedAt: Date.now(),
    player: {
      name: 'Francis', raceId: 'aetherborn', factionId: 'eternal_dynasty',
      mapSeed: FRANCIS, hp: 40, hpMax: 40, dead: false,
      currentLocationId: 'tartarian_outskirts', inventory: [], stats: {},
      ...over,
    },
    worldMemory: {},
  } as unknown as SaveState;
}

describe('OTA-1315 — restore is only for a character that disappeared', () => {
  it('⚠ a character who vanished CAN still be restored — that is what this is for', async () => {
    const res = await importSaveAsNewSlot(save());
    expect(res.ok).toBe(true);
    expect((await listSlots()).length).toBe(1);
  });

  it('⚠⚠ GATE 1 — already on the roster: nothing disappeared, nothing to restore', async () => {
    await importSaveAsNewSlot(save());
    const again = await importSaveAsNewSlot(save());
    expect(again.ok).toBe(false);
    expect((again as { reason: string }).reason).toContain('already among your characters');
    // And no second Francis was minted.
    expect((await listSlots()).length).toBe(1);
  });

  it("⚠⚠ GATE 2 — THE OWNER'S CASE: died, then restored, is refused", async () => {
    // He is on the roster and dead — the exact state after the mis-tap.
    await importSaveAsNewSlot(save());
    await recordFallenSeed(FRANCIS);
    const revive = await importSaveAsNewSlot(save());
    expect(revive.ok).toBe(false);
    expect((await listSlots()).length).toBe(1);
  });

  it('⚠⚠ ...and DELETING the corpse first does not defeat it', async () => {
    // The roster gate alone would be trivially bypassed: delete dead Francis,
    // then restore. The Fallen register is what actually holds the line.
    const first = await importSaveAsNewSlot(save());
    await recordFallenSeed(FRANCIS);
    await deleteSlot((first as { slotId: string }).slotId);
    expect((await listSlots()).length).toBe(0);
    const revive = await importSaveAsNewSlot(save());
    expect(revive.ok).toBe(false);
    expect((revive as { reason: string }).reason).toContain('Resurrection Gem');
    expect((await listSlots()).length).toBe(0);
  });

  it('⚠⚠ the register is UNCAPPED — an old death cannot be waited out', async () => {
    // `stash.fallen` is a capped memorial (25). A permission check living on a
    // list that forgets is a permission check you can outlast, so the seeds get
    // their own record. Thirty later deaths must not free the first one.
    await recordFallenSeed(FRANCIS);
    for (let i = 0; i < 30; i++) await recordFallenSeed(`Other${i}|stone_kin|mud_monarchs|${i}`);
    expect(await hasFallenSeed(FRANCIS)).toBe(true);
    const revive = await importSaveAsNewSlot(save());
    expect(revive.ok).toBe(false);
  });

  it('⚠ a DIFFERENT character who happens to share the name is unaffected', async () => {
    await recordFallenSeed(FRANCIS);
    // Same name, same race, different character — its own seed.
    const other = save({ mapSeed: 'Francis|aetherborn|eternal_dynasty|1786899999999' });
    const res = await importSaveAsNewSlot(other);
    expect(res.ok).toBe(true);
  });

  it('⚠ the seed is the identity, and it is one function', () => {
    expect(characterSeedOf({ mapSeed: FRANCIS, name: 'x', raceId: 'y', factionId: 'z' })).toBe(FRANCIS);
    // Legacy saves predate mapSeed and must still resolve consistently.
    expect(characterSeedOf({ name: 'Francis', raceId: 'aetherborn', factionId: 'eternal_dynasty' }))
      .toBe('Francis|aetherborn|eternal_dynasty|legacy');
  });

  it('⚠ a legacy slot with no recorded seed still blocks its own double', async () => {
    // Slots written before this OTA carry no characterSeed; the roster gate
    // falls back to name+race so the common case is still covered on upgrade.
    await saveSlot('slot_legacy', save());
    const idx = await listSlots();
    await AsyncStorage.setItem('tartaria:slots', JSON.stringify(
      idx.map((sl) => { const c = { ...sl } as Record<string, unknown>; delete c.characterSeed; return c; }),
    ));
    const again = await importSaveAsNewSlot(save());
    expect(again.ok).toBe(false);
  });

  it('⚠⚠ DEATH IS WHAT FILLS THE REGISTER — pinned at the source', () => {
    // ⚠ No suite in this repo drives a real in-game death (they all test the
    // pieces), and a simulated one would be a coin-flip on the damage path. So
    // the wiring is pinned where it lives: the seed is recorded inside
    // handlePlayerDeath, right beside the memorial write, and it uses the shared
    // identity helper rather than re-deriving the seed a tenth time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('path');
    const store: string = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const death = store.indexOf('function handlePlayerDeath');
    expect(death).toBeGreaterThan(-1);
    const body = store.slice(death, death + 6000);
    expect(body).toContain('recordFallenSeed(characterSeedOf(player))');
    // Adjacent to the memorial, so the two records cannot drift apart.
    expect(body.indexOf('recordFallenSeed')).toBeLessThan(body.indexOf('recordFallen(hero)'));
  });

  it('⚠ the memorial roll is left alone — this adds a record, it does not change one', async () => {
    const before = await loadGlobalStash();
    await saveGlobalStash({ ...before, fallen: [{ name: 'Old', raceName: 'Stone-Kin', epitaph: 'e', locationName: 'l', kills: 1, corruption: 'c', hours: 2, ts: 1 }] });
    await recordFallenSeed(FRANCIS);
    const after = await loadGlobalStash();
    expect(after.fallen?.length).toBe(1);
    expect(after.fallenSeeds).toEqual([FRANCIS]);
  });
});
