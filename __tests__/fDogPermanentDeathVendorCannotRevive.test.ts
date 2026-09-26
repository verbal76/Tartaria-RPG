// Defect F / OWNER RULING — dog death/revival, follow-up campaign.
//
// The owner's authoritative contract: a downed dog (status 'waiting_at_base',
// hp<=0, bleeding out) has DOG_BLEED_OUT_HOURS (24) IN-GAME HOURS to be
// revived through the PLAYER'S OWN PACK (a feed/heal consumable, the real
// applyItemToDog production door). The vendor is NOT a legitimate recovery
// path at any point in that window, and once the window expires (status
// 'dead') or the dog is abandoned (status 'abandoned'), death is permanent —
// no vendor service may reverse it, at any price.
//
// Two production defects existed here, both now repaired in gameStore.ts's
// tryVendorServiceVerb dog branch:
//   1. `revive`/`restore dog` fully resurrected a 'dead' or 'abandoned' dog
//      for a flat 300 TC (vs.REVIVE_DOG_COST, now removed).
//   2. The ordinary `heal dog` (bare, ONE-word target, no item) fell through
//      to the plain companionHealCost path even for a dog currently DOWN
//      (hp<=0, status 'waiting_at_base') — paying to heal it to full HP,
//      which tickDogStatus's off-bench reconciliation then promotes straight
//      back to status:'with_player'. That is the SAME vendor-revives-during-
//      the-window outcome the owner ruled out, reached by a different verb.
//
// This suite drives the real production doors: submitPlayerAction('revive
// dog') / ('heal dog') for the vendor path, submitPlayerAction('feed dog
// <item>') for the legitimate player-pack door, and lets tickDogStatus's
// real microtask reconciliation run (no mocked timers, no shortcuts).

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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { DogCompanion, InventoryItem } from '../app/engine/types';

const store = useGameStore;
const get = () => store.getState();
const wait = () => new Promise((r) => setTimeout(r, 25));

function baseDog(patch: Partial<DogCompanion>): DogCompanion {
  return {
    id: 'dog_test',
    name: 'Rex',
    breed: 'Mongrel',
    sex: { raw: 'boy', pronoun: 'he' },
    startingProfile: 'mongrel',
    hp: 30,
    hpMax: 30,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 80,
    lastFedAtHour: 0,
    equipped: { vest: null },
    status: 'with_player',
    ...patch,
  } as DogCompanion;
}

async function standWith(dog: DogCompanion, hoursElapsed = 100, extraItems: InventoryItem[] = []) {
  await get().hydrate();
  await get().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  get().skipTutorial?.();
  await wait();
  store.setState((s) => ({
    player: {
      ...s.player!,
      tc: 1000,
      hoursElapsed,
      dog,
      inventory: [...s.player!.inventory, ...extraItems],
    },
    currentScene: {
      ...s.currentScene!,
      vendor: {
        id: 'f_test_vendor', name: 'The Mender', faction: 'reclaimers_guild',
        offers: [], greeting: '"State your business."',
      } as never,
    },
  }));
}

const trailRation = (): InventoryItem => ({
  id: 'inv_trail_ration', name: 'Trail Rations', kind: 'consumable', rarity: 'Common', quantity: 3, tags: ['food'],
} as unknown as InventoryItem);

describe('F — the vendor may never revive a dog; only the player\'s own pack, inside the window', () => {
  it('1. player-pack recovery (feed dog) succeeds inside the 24h window and hands the dog back with_player', async () => {
    await standWith(
      baseDog({ status: 'waiting_at_base', hp: 0, hpMax: 30, downedAtHour: 100 - 10, bleedWarned: false }),
      100,
      [trailRation()],
    );

    get().submitPlayerAction('feed dog Trail Rations');
    await wait();

    const dog = get().player!.dog!;
    expect(dog.hp).toBeGreaterThan(0);
    expect(dog.status).toBe('with_player');
    expect(dog.downedAtHour).toBeUndefined();
  });

  it('2. vendor "revive dog" cannot resurrect a permanently DEAD dog, at any price', async () => {
    await standWith(baseDog({ status: 'dead', hp: 0 }));
    const tcBefore = get().player!.tc;

    get().submitPlayerAction('revive dog');
    await wait();

    expect(get().player!.tc).toBe(tcBefore);
    expect(get().player!.dog!.status).toBe('dead');
    expect(get().player!.dog!.hp).toBe(0);
  });

  it('3. vendor "revive dog" cannot bring back an ABANDONED dog either (OTA-1726: "neglect-abandonment buys you nothing")', async () => {
    await standWith(baseDog({ status: 'abandoned', hp: 15 }));
    const tcBefore = get().player!.tc;

    get().submitPlayerAction('revive dog');
    await wait();

    expect(get().player!.tc).toBe(tcBefore);
    expect(get().player!.dog!.status).toBe('abandoned');
  });

  it('4. vendor "heal dog" (bare, no item) cannot shortcut a dog currently DOWN inside the window', async () => {
    await standWith(baseDog({ status: 'waiting_at_base', hp: 0, hpMax: 30, downedAtHour: 100 - 2 }));
    const tcBefore = get().player!.tc;

    get().submitPlayerAction('heal dog');
    await wait();

    expect(get().player!.tc).toBe(tcBefore);
    expect(get().player!.dog!.hp).toBe(0);
    expect(get().player!.dog!.status).toBe('waiting_at_base');
  });

  it('5. expiry at the real production boundary (downFor >= 24) flips a downed dog to permanently dead', async () => {
    await standWith(baseDog({ status: 'waiting_at_base', hp: 0, hpMax: 30, downedAtHour: 100 - 24 }));

    get().submitPlayerAction('look around');
    await wait();

    expect(get().player!.dog!.status).toBe('dead');
  });

  it('6. negative control: a healthy, hurt (not downed) dog is still healed normally by the vendor for the ordinary fee', async () => {
    await standWith(baseDog({ status: 'with_player', hp: 10, hpMax: 30 }));
    const tcBefore = get().player!.tc;

    get().submitPlayerAction('heal dog');
    await wait();

    expect(get().player!.dog!.hp).toBe(30);
    expect(get().player!.tc).toBeLessThan(tcBefore);
  });

  it('7. negative control: ordinary feeding/loyalty on a healthy dog is untouched', async () => {
    await standWith(baseDog({ status: 'with_player', hp: 20, hpMax: 30, loyalty: 50 }), 100, [trailRation()]);

    get().submitPlayerAction('feed dog Trail Rations');
    await wait();

    const dog = get().player!.dog!;
    expect(dog.loyalty).toBeGreaterThan(50);
    expect(dog.hp).toBeGreaterThan(20);
    expect(dog.hp).toBeLessThanOrEqual(30);
  });

  // ⚠ Owner follow-up (Part 1) — the boundary/lifecycle proof was incomplete:
  // tests 1-7 proved vendor-never and one recovery + one expiry point, but
  // never proved (a) recovery works the instant the dog goes down, (b) the
  // window survives just short of the real production comparison (downFor
  // strictly < 24, via the actual tick, not just via feed's own lack of a
  // clock check), or (c) that a dog ALREADY dead cannot be brought back
  // through the legitimate pack door either — only that the VENDOR can't.
  // Added below, driving the same real doors, no wall clock, no shortcuts.

  it('8. pack recovery succeeds the instant the dog goes down (downFor = 0)', async () => {
    await standWith(
      baseDog({ status: 'waiting_at_base', hp: 0, hpMax: 30, downedAtHour: 100, bleedWarned: false }),
      100,
      [trailRation()],
    );

    get().submitPlayerAction('feed dog Trail Rations');
    await wait();

    const dog = get().player!.dog!;
    expect(dog.hp).toBeGreaterThan(0);
    expect(dog.status).toBe('with_player');
  });

  it('9. one in-game hour short of the real production boundary (downFor = 23), the tick leaves the dog recoverable, not dead', async () => {
    // bleedWarnStage pre-advanced to 3 (all three warning marks already
    // fired on a prior tick) so this tick's only live question is the one
    // under test: tickDogStatus's own `downFor >= DOG_BLEED_OUT_HOURS`
    // comparison, at the value immediately below it.
    await standWith(baseDog({
      status: 'waiting_at_base', hp: 0, hpMax: 30,
      downedAtHour: 100 - 23, bleedWarned: true, bleedWarnStage: 3,
    }));

    get().submitPlayerAction('look around');
    await wait();

    const dog = get().player!.dog!;
    expect(dog.status).toBe('waiting_at_base');
    expect(dog.hp).toBe(0);
  });

  it('10. pack recovery (feed dog) cannot revive a dog that already crossed into permanent death — only the vendor door was proven closed before this', async () => {
    await standWith(baseDog({ status: 'dead', hp: 0 }), 100, [trailRation()]);

    get().submitPlayerAction('feed dog Trail Rations');
    await wait();

    const dog = get().player!.dog!;
    expect(dog.status).toBe('dead');
    expect(dog.hp).toBe(0);
    // The ration was never spent on a dog that can no longer eat it.
    const ration = get().player!.inventory.find((i) => i.name === 'Trail Rations');
    expect(ration?.quantity).toBe(3);
  });

  it("11. vendor \"revive dog\" (not just bare \"heal dog\") is refused on a downed-but-still-recoverable dog, same as the bare verb", async () => {
    await standWith(baseDog({ status: 'waiting_at_base', hp: 0, hpMax: 30, downedAtHour: 100 - 2 }));
    const tcBefore = get().player!.tc;

    get().submitPlayerAction('revive dog');
    await wait();

    expect(get().player!.tc).toBe(tcBefore);
    expect(get().player!.dog!.hp).toBe(0);
    expect(get().player!.dog!.status).toBe('waiting_at_base');
  });
});
