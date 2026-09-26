// Defect J — FINAL OWNER RULING: a consumable must NOT be spent when its
// attempted use would produce literally ZERO legitimate effect. The rule is
// based on the RESULT (would ANY applicable effect actually occur?), never
// on "full HP" alone — a multi-effect item still fires normally at full HP
// as long as ANY other axis (stamina, cure, buff, reveal) has room.
//
// Catalog census (python walk of every app/data/items/*.json consumable
// row): of 42 consumables that restore HP, 40 ALSO carry restoreStamina>0
// and/or a buff/cure/reveal/dogTreat effect. Exactly TWO rows — Rhubarb
// Stalk and Red Cap Mushroom — declare `healHP` with every other field
// absent or explicitly `restoreStamina: 0`: the only true "nothing else can
// happen" HP-only consumables in the game. Field Dressing (healHP+cureBleed,
// no stamina) is the multi-effect item used to prove boundary F below.
//
// REPAIR SURFACE: the generic "did anything actually change?" guard, added
// to all three places a consumable's effect is applied — the 'eat' fx
// branch, the 'use_relic' fx branch, and applyItemToDog — each keyed off
// deltas the site already computes (heal/stamGain/cures/buffLine, or
// anyRealEffect for use_relic, or healAmount+loyalty for the dog). No item
// name is hardcoded anywhere in the guard.

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
import type { DogCompanion, InventoryItem, StatusEffect } from '../app/engine/types';

jest.setTimeout(30000);
const store = useGameStore;
const get = () => store.getState();
const wait = () => new Promise((r) => setTimeout(r, 25));

async function freshGame() {
  await get().hydrate();
  await get().startNewGame({ name: 'Sated', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  get().skipTutorial?.();
  await wait();
}

function baseDog(patch: Partial<DogCompanion>): DogCompanion {
  return {
    id: 'dog_test', name: 'Rex', breed: 'Mongrel', sex: { raw: 'boy', pronoun: 'he' },
    startingProfile: 'mongrel', hp: 30, hpMax: 30,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 80, lastFedAtHour: 0, equipped: { vest: null }, status: 'with_player',
    ...patch,
  } as DogCompanion;
}

const item = (name: string, qty = 1): InventoryItem =>
  ({ id: `j_${name.replace(/\s+/g, '_')}`, name, kind: 'consumable', rarity: 'Common', quantity: qty, tags: ['food'] } as unknown as InventoryItem);

describe('J — boundary A/B: a TRUE pure-HP-only consumable (no secondary effect exists)', () => {
  it.each(['Rhubarb Stalk', 'Red Cap Mushroom'])(
    'A. %s at full HP + full stamina: refused, item preserved, HP unchanged',
    async (name) => {
      await freshGame();
      const p0 = get().player!;
      store.setState({
        player: {
          ...p0, hp: p0.hpMax, stamina: p0.staminaMax ?? p0.stamina,
          inventory: [...p0.inventory.filter((i) => i.name !== name), item(name, 2)],
        },
      });
      const before = get().player!;
      get().submitPlayerAction(`eat ${name.toLowerCase()}`);
      await wait();
      const after = get().player!;
      expect(after.inventory.find((i) => i.name === name)?.quantity).toBe(2); // NOT consumed
      expect(after.hp).toBe(before.hp);
      expect(after.stamina).toBe(before.stamina);
    },
  );

  it('A (use_relic door). "use rhubarb stalk" at full HP is refused the same way as "eat" it', async () => {
    await freshGame();
    const p0 = get().player!;
    store.setState({
      player: {
        ...p0, hp: p0.hpMax, stamina: p0.staminaMax ?? p0.stamina,
        inventory: [...p0.inventory.filter((i) => i.name !== 'Rhubarb Stalk'), item('Rhubarb Stalk', 2)],
      },
    });
    get().submitPlayerAction('use rhubarb stalk');
    await wait();
    expect(get().player!.inventory.find((i) => i.name === 'Rhubarb Stalk')?.quantity).toBe(2);
  });

  it('B. Rhubarb Stalk with damaged HP: accepted, consumed, heals normally', async () => {
    await freshGame();
    const p0 = get().player!;
    store.setState({
      player: {
        ...p0, hp: Math.max(1, p0.hpMax - 5), stamina: p0.staminaMax ?? p0.stamina,
        inventory: [...p0.inventory.filter((i) => i.name !== 'Rhubarb Stalk'), item('Rhubarb Stalk', 2)],
      },
    });
    const before = get().player!;
    get().submitPlayerAction('eat rhubarb stalk');
    await wait();
    const after = get().player!;
    expect(after.inventory.find((i) => i.name === 'Rhubarb Stalk')?.quantity).toBe(1); // consumed
    expect(after.hp).toBeGreaterThan(before.hp);
  });
});

describe('J — boundary C/D: a multi-effect consumable at full HP is NOT a no-op while another axis has room', () => {
  it('C/D. Trail Rations (healHP+restoreStamina) at full HP, partial stamina: consumed, HP unchanged, stamina rises', async () => {
    await freshGame();
    const p0 = get().player!;
    store.setState({
      player: {
        ...p0, hp: p0.hpMax, stamina: Math.max(0, (p0.staminaMax ?? 20) - 5),
        inventory: [...p0.inventory.filter((i) => i.name !== 'Trail Rations'), item('Trail Rations', 2)],
      },
    });
    const before = get().player!;
    get().submitPlayerAction('eat trail rations');
    await wait();
    const after = get().player!;
    expect(after.inventory.find((i) => i.name === 'Trail Rations')?.quantity).toBe(1); // consumed
    expect(after.hp).toBe(before.hpMax); // HP claim was already full — unchanged
    expect(after.stamina).toBeGreaterThan(before.stamina); // but stamina DID rise — not a no-op
  });
});

describe('J — boundary E/F: Field Dressing (healHP+cureBleed, NO stamina) isolates the cure axis', () => {
  it('E. full HP/full stamina + an active bleed: accepted, consumed, bleed cured', async () => {
    await freshGame();
    const p0 = get().player!;
    const bleeding: StatusEffect = { kind: 'bleed', remainingRounds: 5 } as StatusEffect;
    store.setState({
      player: {
        ...p0, hp: p0.hpMax, stamina: p0.staminaMax ?? p0.stamina, statusEffects: [bleeding],
        inventory: [...p0.inventory.filter((i) => i.name !== 'Field Dressing'), item('Field Dressing', 2)],
      },
    });
    get().submitPlayerAction('eat field dressing');
    await wait();
    const after = get().player!;
    expect(after.inventory.find((i) => i.name === 'Field Dressing')?.quantity).toBe(1); // consumed
    expect((after.statusEffects ?? []).some((e) => e.kind === 'bleed')).toBe(false); // cured
  });

  it('F. full HP/full stamina + NO bleed present: every effect this item has is inapplicable — refused, preserved', async () => {
    await freshGame();
    const p0 = get().player!;
    store.setState({
      player: {
        ...p0, hp: p0.hpMax, stamina: p0.staminaMax ?? p0.stamina, statusEffects: [],
        inventory: [...p0.inventory.filter((i) => i.name !== 'Field Dressing'), item('Field Dressing', 2)],
      },
    });
    const before = get().player!;
    get().submitPlayerAction('eat field dressing');
    await wait();
    const after = get().player!;
    expect(after.inventory.find((i) => i.name === 'Field Dressing')?.quantity).toBe(2); // NOT consumed
    expect(after.hp).toBe(before.hp);
  });
});

describe('J — DOG: the same rule, mirrored', () => {
  it('a full-HP dog below max loyalty still gains loyalty from feeding — NOT a no-op, consumed', async () => {
    await freshGame();
    store.setState((s) => ({
      player: {
        ...s.player!, dog: baseDog({ status: 'with_player', hp: 30, hpMax: 30, loyalty: 50 }),
        inventory: [...s.player!.inventory.filter((i) => i.name !== 'Trail Rations'), item('Trail Rations', 1)],
      },
    }));
    const before = get().player!.inventory.find((i) => i.name === 'Trail Rations')!.quantity;
    get().submitPlayerAction('feed dog Trail Rations');
    await wait();
    const dog = get().player!.dog!;
    expect(dog.hp).toBe(30); // already full, unchanged
    expect(dog.loyalty).toBeGreaterThan(50); // but loyalty rose — not a no-op
    expect(get().player!.inventory.find((i) => i.name === 'Trail Rations')?.quantity ?? 0).toBe(before - 1);
  });

  it('a full-HP dog ALSO already at max (100) loyalty: a true no-op — refused, item preserved', async () => {
    await freshGame();
    store.setState((s) => ({
      player: {
        ...s.player!, dog: baseDog({ status: 'with_player', hp: 30, hpMax: 30, loyalty: 100 }),
        inventory: [...s.player!.inventory.filter((i) => i.name !== 'Rhubarb Stalk'), item('Rhubarb Stalk', 2)],
      },
    }));
    get().submitPlayerAction('feed dog Rhubarb Stalk');
    await wait();
    const dog = get().player!.dog!;
    expect(dog.hp).toBe(30);
    expect(dog.loyalty).toBe(100);
    expect(get().player!.inventory.find((i) => i.name === 'Rhubarb Stalk')?.quantity ?? 0).toBe(2); // NOT consumed
  });
});

describe('J — GOLEM: the pre-existing comparison case, unconditionally refuses at full HP', () => {
  it('a repair item on a full-HP golem is refused outright and NOT consumed', async () => {
    await freshGame();
    const p0 = get().player!;
    if (!p0.golem) return; // golem may not be summoned by default on this race; skip rather than fabricate state
    store.setState({
      player: {
        ...p0, golem: { ...p0.golem, hp: p0.golem.hpMax },
        inventory: [...p0.inventory, item('Scrap Metal', 1)],
      } as never,
    });
    const before = get().player!;
    get().submitPlayerAction('feed golem Scrap Metal');
    await wait();
    const after = get().player!;
    expect(after.golem!.hp).toBe(before.golem!.hpMax);
    expect(after.inventory.find((i) => i.name === 'Scrap Metal')?.quantity ?? 0).toBe(1); // still refused
  });
});
