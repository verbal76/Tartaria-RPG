// REPRO — does the dog-mortality feature write a save that bricks on reload?
// OTA-338 crashed ~90% of cold opens on the player's save; OTA-339 (= 337's
// exact runtime) STILL crashed that save while a fresh save booted clean. So
// 338 wrote state to the save that the boot/scene-begin path can't survive.
// This plants each candidate post-338 state into a slot and reloads it through
// the real cold-boot path (loadSlotIntoGame -> loadSlot + beginScene), asserting
// the load completes (player present, no slotLoadError, no throw).

jest.setTimeout(20000);
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { saveSlot } from '../app/engine/saveSystem';
import type { DogCompanion } from '../app/engine/types';

async function bootBase() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Verbal', raceId: 'mud_dweller', factionId: 'forgotten_order' });
  store.getState().skipTutorial?.();
  return store;
}

function mkDog(over: Partial<DogCompanion> = {}): DogCompanion {
  return {
    id: 'd', name: 'Rocky', breed: 'mutt',
    sex: { raw: 'male', pronoun: 'he' },
    startingProfile: 'mongrel',
    hp: 12, hpMax: 12,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 80, lastFedAtHour: 0,
    equipped: { vest: null },
    status: 'with_player',
    ...over,
  };
}

/** Plant a save with the given dog + worldMemory overrides, then reload it
 *  through the real cold-boot path. Returns the post-load health. */
async function loadWith(
  store: typeof useGameStore,
  dog: DogCompanion | null,
  wmOver: Record<string, unknown>,
): Promise<{ threw: boolean; err?: string; playerPresent: boolean; loadError?: string }> {
  const slotId = store.getState().activeSlotId!;
  const base = store.getState();
  const player = { ...base.player!, dog };
  const worldMemory = { ...base.worldMemory, ...wmOver };
  await saveSlot(slotId, { player, worldMemory, gameLog: base.gameLog ?? [] } as never);
  try {
    await store.getState().loadSlotIntoGame(slotId);
  } catch (e) {
    return { threw: true, err: e instanceof Error ? e.message : String(e), playerPresent: !!store.getState().player };
  }
  const s = store.getState();
  return { threw: false, playerPresent: !!s.player, loadError: s.slotLoadError ?? undefined };
}

function expectClean(r: { threw: boolean; err?: string; playerPresent: boolean; loadError?: string }) {
  expect({ threw: r.threw, err: r.err, playerPresent: r.playerPresent, loadError: r.loadError })
    .toEqual({ threw: false, err: undefined, playerPresent: true, loadError: undefined });
}

describe('dog-mortality save-brick reproduction', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('A — dead dog still on player.dog + puppyVendorOwed/queued', async () => {
    const store = await bootBase();
    expectClean(await loadWith(store, mkDog({ status: 'dead', hp: 0, downedAtHour: 0 }), { puppyVendorOwed: true, puppyVendorQueued: true }));
  });

  it('B — abandoned dog still on player.dog + flags', async () => {
    const store = await bootBase();
    expectClean(await loadWith(store, mkDog({ status: 'abandoned', loyalty: 0 }), { puppyVendorOwed: true, puppyVendorQueued: true }));
  });

  it('C — benched dog at 0 HP mid bleed-out (downedAtHour/bleedWarned set)', async () => {
    const store = await bootBase();
    expectClean(await loadWith(store, mkDog({ status: 'waiting_at_base', hp: 0, downedAtHour: 5, bleedWarned: true }), {}));
  });

  it('D — healthy with_player dog carrying the new loyalty/down fields', async () => {
    const store = await bootBase();
    expectClean(await loadWith(store, mkDog({ loyalty: 14, loyaltyBeatFloor: 15, downedAtHour: undefined }), {}));
  });

  it('E — vendor flags set with NO dog (player.dog null) — fires the dead vendor path on beginScene', async () => {
    const store = await bootBase();
    expectClean(await loadWith(store, null, { puppyVendorOwed: true, puppyVendorQueued: true }));
  });

  it('F — dead dog + flags + pendingDogOnboarding (rubble-puppy mid-onboarding)', async () => {
    const store = await bootBase();
    expectClean(await loadWith(store, mkDog({ status: 'dead', hp: 0 }), {
      puppyVendorOwed: true,
      pendingDogOnboarding: { stage: 'breed', rescueData: { scenario: 'puppy_rubble', startingProfile: 'puppy' } },
    }));
  });
});
