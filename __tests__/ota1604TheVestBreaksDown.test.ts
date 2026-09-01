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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1604 — THE VEST BREAKS DOWN.
//
// Owner, on the OTA-1603 report's finding that scrap refused dog armor:
// "make them all scrappable."
//
// canScrap admitted weapon / armor / relic while scrapOutputFor — twenty
// lines down in the same file — has ALWAYS routed dog_armor as armor-like:
// the door and the table disagreed. (Before OTA-1603 the disagreement even
// inverted: a kind-DRIFTED vest slipped through the gate as 'relic' while a
// correctly-stamped one was refused.)
//
// And opening the gate exposes a trap the gate was accidentally covering:
// OTA-058's auto-unequip-on-scrap walks every PLAYER slot and never the
// dog's back — while dogVestAcBonus resolves catalog vests by NAME with no
// inventory check. Scrap the worn vest and the dog keeps the AC of a vest
// that no longer exists — the OTA-796 ghost-gear shape, one saddle over. So
// the worn vest unbuckles first, out loud.

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { canScrap, scrapOutputFor } from '../app/engine/scrapEngine';
import { createDogCompanion } from '../app/engine/dogCompanion';
import { dogVestAcBonus } from '../app/state/combatResolution';
import { DOG_GEAR } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe('OTA-1604 — the gate finally agrees with the table', () => {
  it('⚠⚠⚠ every catalog vest is scrappable, and so is a healed legacy forge', () => {
    for (const g of DOG_GEAR) {
      const inst = { id: `t_${g.name}`, name: g.name, kind: 'dog_armor', quantity: 1, tags: [...g.tags] } as never as InventoryItem;
      expect(canScrap(inst)).toBe(true);
      const out = scrapOutputFor(inst);
      expect(out.grants.length).toBeGreaterThan(0);
    }
    // The owner's item, post-OTA-1603 heal.
    const woven = {
      id: 'fused_owner_vest', name: 'Woven Stride', kind: 'dog_armor', quantity: 1,
      tags: ['fused', 'unique'], rarity: 'Rare',
      uniqueStats: { kind: 'dog_armor', rarity: 'Rare', acBonus: 3, durability: { current: 30, max: 30 } },
    } as never as InventoryItem;
    expect(canScrap(woven)).toBe(true);
    expect(scrapOutputFor(woven).grants.length).toBeGreaterThan(0);
  });

  it('⚠⚠ a TAG-only drifted vest passes too, and raw stock still refuses', () => {
    expect(canScrap({ id: 'd', name: 'Odd Vest', kind: 'misc', quantity: 1, tags: ['dog_armor'] } as never)).toBe(true);
    // Materials are already stock — the old refusal stands.
    expect(canScrap({ id: 'p', name: 'Patched Cloth', kind: 'misc', quantity: 1, tags: ['cloth'] } as never)).toBe(false);
  });
});

describe('OTA-1604 — the worn vest unbuckles before it breaks down', () => {
  const realRandom = Math.random;

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Scrapper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  afterEach(() => { Math.random = realRandom; });

  function seedDogWithVests() {
    const p = get().player!;
    const dog = createDogCompanion({ name: 'Rocky', breed: 'mutt', rawSex: 'boy', startingProfile: 'mongrel', currentHour: 0 } as never);
    const worn = { id: 'vest_worn', name: 'Riveted Leather Vest', kind: 'dog_armor', quantity: 1, tags: ['dog_armor', 'vest', 'leather'] } as never as InventoryItem;
    const spare = { id: 'vest_spare', name: 'Burlap Vest', kind: 'dog_armor', quantity: 1, tags: ['dog_armor', 'vest', 'burlap'] } as never as InventoryItem;
    store.setState({
      player: {
        ...p,
        dog: { ...dog, status: 'with_player', equipped: { vest: worn.name, vestId: worn.id } },
        inventory: [
          ...p.inventory.filter((i) => !/Vest/.test(i.name)),
          worn, spare,
        ],
      } as never,
    });
  }

  it('⚠⚠⚠ scrapping the vest Rocky is WEARING clears his back first — no ghost AC', () => {
    seedDogWithVests();
    expect(dogVestAcBonus(get().player as never)).toBeGreaterThan(0); // worn catalog vest pays AC
    Math.random = () => 0; // scrap roll succeeds
    get().scrapInventoryItem('Riveted Leather Vest', 'vest_worn');
    const player = get().player!;
    expect(player.dog?.equipped?.vest ?? null).toBeNull();
    expect(player.dog?.equipped?.vestId ?? null).toBeNull();
    expect(player.inventory.some((i) => i.id === 'vest_worn' && i.quantity > 0)).toBe(false);
    expect(dogVestAcBonus(player as never)).toBe(0);
    expect(get().gameLog.slice(-10).some((e) => e.text.includes('unbuckle') && e.text.includes('Rocky'))).toBe(true);
  });

  it('⚠⚠ scrapping the SPARE leaves the worn vest exactly where it is', () => {
    seedDogWithVests();
    Math.random = () => 0;
    get().scrapInventoryItem('Burlap Vest', 'vest_spare');
    const player = get().player!;
    expect(player.dog?.equipped?.vestId).toBe('vest_worn');
    expect(player.inventory.some((i) => i.id === 'vest_worn' && i.quantity > 0)).toBe(true);
    expect(player.inventory.some((i) => i.id === 'vest_spare' && i.quantity > 0)).toBe(false);
    expect(dogVestAcBonus(player as never)).toBeGreaterThan(0);
  });

  it('⚠ the wiring is pinned — gate, tag path, and the unbuckle guard', () => {
    const SCRAP = readFileSync(join(__dirname, '..', 'app', 'engine', 'scrapEngine.ts'), 'utf8');
    expect(SCRAP).toContain("|| scrapKind === 'dog_armor') return true;");
    expect(SCRAP).toContain("t.includes('dog_armor')");
    const INV = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'inventorySlice.ts'), 'utf8');
    expect(INV).toContain('if (wornDogVestInstanceId(player) === item.id) {');
  });
});
