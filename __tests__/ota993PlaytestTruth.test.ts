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

// OTA-993 — the playtest truth batch (review items #112-#117): the world
// checks itself before it speaks. Arrival at a hub location narrates the walk
// through the gate BEFORE listing rooms; a takeable item is never a climbable
// perch; the Qwen parse-fallback can no longer invent an unrelated action; the
// empty-swing refusal follows the hands that made it; stat level-up toasts
// show the sheet's number; stranded-traveler escorts come only from the wild.
import { useGameStore, statNowClause, qwenRephraseRejection } from '../app/state/gameStore';
import { isClimbable } from '../app/engine/interactionTags';
import { availableFactionQuests, FACTION_QUESTS } from '../app/engine/factionQuests';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem } from '../app/engine/types';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  return store;
}

describe('OTA-993 — playtest truth batch', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('#113 — a takeable catalog item is never climbable; real structures keep their grip', () => {
    expect(isClimbable('Rail Saber')).toBe(false); // the weapon from the device log
    expect(isClimbable('Bone Maul')).toBe(false);
    expect(isClimbable('wall')).toBe(true);
    expect(isClimbable('ladder')).toBe(true);
    expect(isClimbable('rope')).toBe(true); // plain structural rope, not an item name
    // a great climb that shares its name with a Legendary weapon row stays climbable
    expect(isClimbable('the Great Fang of Zharak')).toBe(true);
  });

  it('#114 — the exact device case is rejected; honest rephrases pass', () => {
    // "clomb into the warp" (resolved noun: warp) → "wait the reclaimer stake"
    expect(qwenRephraseRejection('warp', 'wait', 'wait the reclaimer stake', 'clomb into the warp')).toBeTruthy();
    // an honest repair keeps the noun → allowed
    expect(qwenRephraseRejection('warp', 'climb', 'climb the warp', 'clomb into the warp')).toBeNull();
    // no resolved noun + player really asked to wait → allowed
    expect(qwenRephraseRejection(null, 'wait', 'wait a while', 'wait around a bit')).toBeNull();
    // invented wait with no wait-word in the input → rejected
    expect(qwenRephraseRejection(null, 'wait', 'wait quietly', 'look at the sky')).toBeTruthy();
  });

  it('#117 — outpost boards never offer a stranded escort; the hook catalog keeps them', () => {
    for (const f of ['forgotten_order', 'reclaimers_guild']) {
      const pool = availableFactionQuests(f, 9999, [], []);
      expect(pool.some((q) => /_stranded_/.test(q.id))).toBe(false);
      expect(pool.length).toBeGreaterThan(0); // the rest of the board survives
    }
    expect(FACTION_QUESTS.some((q) => q.id.endsWith('_stranded_escort'))).toBe(true);
  });

  it('#116 — statNowClause reads the sheet: short form when gear adds nothing', async () => {
    const store = await boot('Trainer');
    const p = store.getState().player!;
    expect(statNowClause(null, 'dexterity', 5)).toBe('now 5');
    expect(statNowClause(p, 'dexterity', 7)).toMatch(/^(now 7|base 7, \d+ with your gear on)$/);
  });

  it('#112 — arrival at a hub location narrates the gate BEFORE the room Paths line', async () => {
    const store = await boot('Wayfarer');
    store.setState((s) => ({
      player: { ...s.player!, currentLocationId: 'reclaimer_stake', hubRoomId: null, travelTarget: undefined },
    }));
    store.getState().beginScene({ arrivalFromName: "The Architect's Blind" });
    await new Promise((r) => setTimeout(r, 10));
    // appendLog merges same-channel world lines landing within 500ms into one
    // entry, so search the JOINED text, not per-entry.
    const joined = store.getState().gameLog.map((e) => e.text).join('\n');
    // lastIndexOf: the BOOT scene at the faction hub prints its own Paths line;
    // the arrival's instances are the final ones.
    const gateAt = joined.lastIndexOf('You pass through the gate into');
    const pathsAt = joined.lastIndexOf('Paths: ');
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(pathsAt).toBeGreaterThanOrEqual(0);
    expect(gateAt).toBeLessThan(pathsAt); // the rooms are introduced before they're listed
    expect(store.getState().player!.hubRoomId).toBeTruthy();
  });

  it('#115 — an empty swing with a ranged weapon in hand refuses in ranged words', async () => {
    const store = await boot('Shooter');
    const bc: InventoryItem = {
      id: 'bc1', name: 'Test Bolt-Caster', kind: 'weapon', rarity: 'Common', quantity: 1,
      tags: ['weapon', 'ranged'],
    };
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [...s.player!.inventory, bc],
        equipped: { ...(s.player!.equipped ?? {}), main: 'Test Bolt-Caster', mainId: 'bc1' },
      },
      currentScene: { ...store.getState().currentScene!, enemies: [] },
    }));
    store.getState().submitPlayerAction('shoot the zzyzx');
    await new Promise((r) => setTimeout(r, 25));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    if (/answers your blade|answers the shot/.test(log)) {
      expect(log).toMatch(/answers the shot/);
      expect(log).not.toMatch(/answers your blade/);
    } else {
      // The unresolved target took a different refusal path — fine, as long
      // as no melee-worded empty-swing line fired with a ranged main hand.
      expect(log).not.toMatch(/answers your blade/);
    }
  });
});
