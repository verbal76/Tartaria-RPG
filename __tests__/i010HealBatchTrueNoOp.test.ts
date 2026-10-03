// I-010 (fragmented healing paths) — useHealBatch never got the J true-no-op
// guard.
//
// Defect J (jFullHealthConsumptionAudit.test.ts) taught three of the five/six
// duplicated healing implementations — the 'use_relic' fx branch, the 'eat'/
// rest fx branch, and applyItemToDog (all in gameStore.ts) — never to spend a
// consumable when every one of its applicable effects is already at its cap
// (full HP, full stamina, nothing to cure). applyItemToGolem already enforced
// the equivalent unconditional full-HP refusal (a golem repair part has no
// secondary effect).
//
// inventorySlice.ts's useHealBatch — the ACTUAL production door behind the
// "✚ heals" quick-bar pouch (InputBox.tsx, OTA-1658/1662/1663) and the
// InventoryScreen "Feed <dog>" / "Heal to full" / "Use Max" buttons — is a
// SIXTH, independently-shaped implementation of the exact same mechanic, and
// the J guard was never ported to it. Before this fix, tapping a heal-pouch
// item on a full-HP self/dog/golem (or the plain "Feed <dog>" button on a
// full-HP, max-loyalty dog) silently burned the item for zero effect — the
// very class of bug J was supposed to eliminate everywhere, just missed in
// the one path the mid-combat quick-bar actually uses.
//
// This file drives the REAL production door — store.getState().useHealBatch,
// the same action InputBox.tsx's pouch and InventoryScreen's batch/feed/heal
// buttons call directly (never a parallel/mocked engine) — for all three
// targets (self / dog / golem), each with a true-no-op case (RED before the
// fix) and a sanity/negative-control case proving the guard doesn't over-
// refuse a batch that still has real room.

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
import { GOLEM_DEFINITIONS, makeCompanion } from '../app/engine/golems';
import type { DogCompanion, InventoryItem } from '../app/engine/types';

const store = useGameStore;
const get = () => store.getState();

async function freshGame() {
  await get().hydrate();
  await get().startNewGame({ name: 'Batcher', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  get().skipTutorial?.();
}

function baseDog(patch: Partial<DogCompanion>): DogCompanion {
  return {
    id: 'dog_i010', name: 'Scout', breed: 'Mongrel', sex: { raw: 'boy', pronoun: 'he' },
    startingProfile: 'mongrel', hp: 30, hpMax: 30,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 50, lastFedAtHour: 0, equipped: { vest: null }, status: 'with_player',
    ...patch,
  } as DogCompanion;
}

const item = (name: string, qty: number): InventoryItem =>
  ({ id: `i010_${name.replace(/\s+/g, '_')}`, name, kind: 'consumable', rarity: 'Common', quantity: qty, tags: ['food'] } as unknown as InventoryItem);

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('I-010 — useHealBatch SELF: the true no-op guard, ported from J', () => {
  it('full HP + full stamina + no bleed: First Aid Kit is refused, NOT consumed', async () => {
    await freshGame();
    const p0 = get().player!;
    store.setState({
      player: {
        ...p0, hp: p0.hpMax, stamina: p0.staminaMax ?? p0.stamina, statusEffects: [],
        inventory: [...p0.inventory.filter((i) => i.name !== 'First Aid Kit'), item('First Aid Kit', 3)],
      },
    });
    const before = get().player!;
    get().useHealBatch('First Aid Kit', 'self', 1);
    const after = get().player!;
    expect(after.inventory.find((i) => i.name === 'First Aid Kit')?.quantity).toBe(3); // NOT consumed
    expect(after.hp).toBe(before.hp);
    expect(after.stamina).toBe(before.stamina);
  });

  it('negative control: damaged HP — First Aid Kit still fires normally, consumed, heals', async () => {
    await freshGame();
    const p0 = get().player!;
    store.setState({
      player: {
        ...p0, hp: Math.max(1, p0.hpMax - 10), stamina: p0.staminaMax ?? p0.stamina, statusEffects: [],
        inventory: [...p0.inventory.filter((i) => i.name !== 'First Aid Kit'), item('First Aid Kit', 3)],
      },
    });
    const before = get().player!;
    get().useHealBatch('First Aid Kit', 'self', 1);
    const after = get().player!;
    expect(after.inventory.find((i) => i.name === 'First Aid Kit')?.quantity).toBe(2); // consumed
    expect(after.hp).toBeGreaterThan(before.hp);
  });
});

describe('I-010 — useHealBatch DOG: the true no-op guard, ported from J', () => {
  it('full-HP dog ALSO already at max (100) loyalty: Trail Rations refused, NOT consumed', async () => {
    await freshGame();
    store.setState((s) => ({
      player: {
        ...s.player!, dog: baseDog({ hp: 30, hpMax: 30, loyalty: 100 }),
        inventory: [...s.player!.inventory.filter((i) => i.name !== 'Trail Rations'), item('Trail Rations', 2)],
      },
    }));
    get().useHealBatch('Trail Rations', 'dog', 1);
    const dog = get().player!.dog!;
    expect(dog.hp).toBe(30);
    expect(dog.loyalty).toBe(100);
    expect(get().player!.inventory.find((i) => i.name === 'Trail Rations')?.quantity ?? 0).toBe(2); // NOT consumed
  });

  it('negative control: full-HP dog BELOW max loyalty — still consumed, loyalty rises', async () => {
    await freshGame();
    store.setState((s) => ({
      player: {
        ...s.player!, dog: baseDog({ hp: 30, hpMax: 30, loyalty: 50 }),
        inventory: [...s.player!.inventory.filter((i) => i.name !== 'Trail Rations'), item('Trail Rations', 2)],
      },
    }));
    get().useHealBatch('Trail Rations', 'dog', 1);
    const dog = get().player!.dog!;
    expect(dog.hp).toBe(30); // already full, unchanged
    expect(dog.loyalty).toBeGreaterThan(50); // loyalty DID rise — not a no-op
    expect(get().player!.inventory.find((i) => i.name === 'Trail Rations')?.quantity ?? 0).toBe(1); // consumed
  });
});

describe('I-010 — useHealBatch GOLEM: the unconditional full-HP refusal, ported from applyItemToGolem', () => {
  it('a repair part on a full-HP golem is refused outright and NOT consumed', async () => {
    await freshGame();
    const p0 = get().player!;
    const golem = { ...makeCompanion(GOLEM_DEFINITIONS.iron_golem) };
    store.setState({
      player: {
        ...p0, golem: { ...golem, hp: golem.hpMax },
        inventory: [...p0.inventory.filter((i) => i.name !== 'Scrap Metal'), item('Scrap Metal', 2)],
      } as never,
    });
    get().useHealBatch('Scrap Metal', 'golem', 1);
    const after = get().player!;
    expect(after.golem!.hp).toBe(golem.hpMax);
    expect(after.inventory.find((i) => i.name === 'Scrap Metal')?.quantity ?? 0).toBe(2); // NOT consumed
  });

  it('negative control: damaged golem — still consumed, heals', async () => {
    await freshGame();
    const p0 = get().player!;
    const golem = { ...makeCompanion(GOLEM_DEFINITIONS.iron_golem) };
    store.setState({
      player: {
        ...p0, golem: { ...golem, hp: Math.max(1, golem.hpMax - 10) },
        inventory: [...p0.inventory.filter((i) => i.name !== 'Scrap Metal'), item('Scrap Metal', 2)],
      } as never,
    });
    get().useHealBatch('Scrap Metal', 'golem', 1);
    const after = get().player!;
    expect(after.golem!.hp).toBeGreaterThan(golem.hpMax - 10);
    expect(after.inventory.find((i) => i.name === 'Scrap Metal')?.quantity ?? 0).toBe(1); // consumed
  });
});
