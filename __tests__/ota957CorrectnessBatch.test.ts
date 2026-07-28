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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

// OTA-957 — correctness batch: (1) full weather symmetry — every element resist counters
// its weather's penalties (not just the damage tick, not just cold), buffs survive, and
// black rain's 'tainted' tag finally maps to the corruption resist; (2) the store
// validates applyCoating's replaceSlot against the weapon's real slot capacity.
import {
  tickWeather,
  weatherAttackPenalty,
  weatherRepositionCost,
  weatherStatModifiers,
  weatherCounteredByResists,
} from '../app/engine/weatherEffects';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem, WeatherEntry, PlayerCharacter } from '../app/engine/types';

const w = (id: string, tags: string[]): WeatherEntry =>
  ({ id, name: id, tags } as unknown as WeatherEntry);

const blizzard = w('silent_blizzard', ['cold', 'silence', 'psychic']);
const ethericStorm = w('etheric_storm', ['aetheric', 'lightning', 'tech_disruption']);
const blackRain = w('black_rain', ['rain', 'tainted']);
const ironFog = w('iron_fog', ['fog', 'magnetic']);
const player = { name: 'T' } as unknown as PlayerCharacter;

describe('OTA-957 — weather symmetry: any matching resist counters its weather', () => {
  it('an electrical coat now cancels an electrical storm penalties, same as cold vs blizzard', () => {
    expect(weatherCounteredByResists(ethericStorm, ['electrical'])).toBe(true);
    expect(weatherRepositionCost(blizzard, ['cold'])).toBe(1);
    expect(weatherAttackPenalty(blizzard, ['cold'])).toBe(0);
  });

  it('a mismatched resist still leaks the penalties', () => {
    expect(weatherRepositionCost(blizzard, ['electrical'])).toBe(2);
    expect(weatherAttackPenalty(blizzard, ['electrical'])).toBe(2);
    expect(weatherStatModifiers(blizzard, ['electrical'])).toEqual({ dexterity: -1, strength: -1 });
  });

  it('buffs survive the counter — an insulated player keeps the Aether-resonance +INT', () => {
    expect(weatherStatModifiers(ethericStorm, [])).toEqual({ intelligence: 1, wisdom: -1 });
    expect(weatherStatModifiers(ethericStorm, ['electrical'])).toEqual({ intelligence: 1 });
  });

  it('black rain: a corruption resist finally counters the tainted tick and the CHA nerf', () => {
    const rand = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(tickWeather(blackRain, player, []).corruptionDelta).toBe(1);
      expect(tickWeather(blackRain, player, ['corruption']).corruptionDelta).toBe(0);
    } finally {
      rand.mockRestore();
    }
    expect(weatherStatModifiers(blackRain, [])).toEqual({ charisma: -1 });
    expect(weatherStatModifiers(blackRain, ['corruption'])).toEqual({});
  });

  it('psychic/magnetic weather stays uncounterable by design', () => {
    expect(weatherCounteredByResists(ironFog, ['cold', 'electrical', 'burn', 'corruption'])).toBe(false);
    expect(weatherAttackPenalty(ironFog, ['cold', 'electrical', 'burn', 'corruption'])).toBe(2);
  });
});

describe('OTA-957 — applyCoating validates replaceSlot against real capacity', () => {
  it('refuses coating2 on a 1-slot weapon: nothing stamped, vial NOT consumed', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'SlotGuard', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();

    const weaponId = 'ota_guard_weap';
    const acidId = 'ota_guard_acid';
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          ...s.player!.inventory.filter((i) => i.id !== weaponId && i.id !== acidId),
          {
            id: weaponId, name: 'Rusted Blade', kind: 'weapon', quantity: 1,
            coating: { kind: 'electrical', dice: '1d4', label: 'Charged' },
          } as unknown as InventoryItem,
          { id: acidId, name: 'Acid Flask', kind: 'consumable', quantity: 1, tags: ['weapon_coating', 'acid'] } as unknown as InventoryItem,
        ],
      },
    }));

    store.getState().applyCoating(acidId, weaponId, 'coating2');

    const inv = store.getState().player!.inventory;
    const weap = inv.find((i) => i.id === weaponId)! as unknown as {
      coating?: { kind: string }; coating2?: { kind: string };
    };
    expect(weap.coating?.kind).toBe('electrical'); // original coat untouched
    expect(weap.coating2).toBeUndefined();         // no illegal second slot
    expect(inv.find((i) => i.id === acidId)?.quantity).toBe(1); // vial not consumed
  });
});
