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

// OTA-952 — zero grip means gravity. Owner (from the pillar log): "you
// shouldn't be stuck on a climb at zero — you fall and take damage." One clear
// warning survives from the OTA-936 no-unwarned-drops rule; after it, an empty
// reach UP falls (full scaled damage, progress wiped) and climbing DOWN on
// empty arms is a half-damage slide. Eating mid-climb is ungated and restores
// stamina — the escape hatch, now named in the warnings. Also: the rest-on-wall
// refusal answers every retry (was dedup-swallowed in the same log).
import { useGameStore } from '../app/state/gameStore';
import { computeClimbFallBase } from '../app/engine/climbHeight';
import { getRaces, getFactions } from '../app/engine/character';

async function bootOnWall(stamina: number) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Gripper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      enemies: [],
      ambientNouns: ['stone pillar', 'shore'],
      elevatedOn: { noun: 'stone pillar', tier: 2, totalTiers: 3 },
      elevatedOverlayMeta: undefined,
    },
  });
  store.setState((s) => ({
    player: {
      ...s.player!,
      hp: 100, hpMax: 100,
      stamina, staminaMax: 20,
      inventory: [
        ...s.player!.inventory,
        { id: 'rope1', name: 'Climbing Rope', kind: 'misc' as const, rarity: 'Common' as const, quantity: 1, tags: ['gear'], durability: { current: 10, max: 10 } },
      ],
    },
  }));
  return store;
}

describe('OTA-952 — fall math is shared and unchanged', () => {
  it('computeClimbFallBase matches the historical climbFall formula', () => {
    expect(computeClimbFallBase(100, 1)).toBe(17);  // 0.12 + 0.055
    expect(computeClimbFallBase(100, 2)).toBe(23);
    expect(computeClimbFallBase(100, 15)).toBe(90); // capped at 0.9
  });
});

describe('OTA-952 — zero on the wall: one warning, then gravity', () => {
  it('first empty reach UP is held with the explicit warning; no fall yet', async () => {
    const store = await bootOnWall(0);
    store.getState().submitPlayerAction('climb the stone pillar');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes('the next reach UP will drop you'))).toBe(true);
    expect(store.getState().player!.hp).toBe(100);
    expect(store.getState().currentScene!.elevatedOn?.noun).toBe('stone pillar');
  });

  it('the SECOND empty reach UP falls: scaled damage, back on the ground, progress wiped', async () => {
    const store = await bootOnWall(0);
    store.getState().submitPlayerAction('climb the stone pillar');
    await new Promise((r) => setTimeout(r, 5));
    store.getState().submitPlayerAction('climb the stone pillar');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes('sheds you'))).toBe(true);
    expect(store.getState().player!.hp).toBeLessThan(100);
    expect(store.getState().currentScene!.elevatedOn).toBeNull();
  });

  it('climbing DOWN on empty arms is a half-damage slide that still gets you to the ground', async () => {
    const store = await bootOnWall(0);
    store.getState().submitPlayerAction('climb down');
    await new Promise((r) => setTimeout(r, 5));
    const slide = store.getState().gameLog.find((e) => e.text.includes('half-climb, half-fall'));
    expect(slide).toBeTruthy();
    const hp = store.getState().player!.hp;
    expect(hp).toBeLessThan(100);
    // half of the tier-2 fall (23) = 11, minus nothing else
    expect(100 - hp).toBeLessThanOrEqual(12);
    expect(store.getState().currentScene!.elevatedOn).toBeNull();
  });

  it('PARTIAL stamina still holds safely, and the hold mentions eating', async () => {
    const store = await bootOnWall(1);
    store.getState().submitPlayerAction('climb the stone pillar');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes('eat something where you hang'))).toBe(true);
    expect(store.getState().player!.hp).toBe(100);
    expect(store.getState().currentScene!.elevatedOn?.noun).toBe('stone pillar');
  });
});

describe('OTA-952 — eating mid-climb is the ungated escape hatch', () => {
  it('at zero stamina on the wall, eating a field kit restores stamina in place', async () => {
    const store = await bootOnWall(0);
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          ...s.player!.inventory,
          { id: 'kit1', name: 'Aetheric Field Kit', kind: 'consumable' as const, rarity: 'Uncommon' as const, quantity: 1, tags: ['exploration', 'gear'] },
        ],
      },
    }));
    store.getState().submitPlayerAction('eat aetheric field kit');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().player!.stamina).toBeGreaterThan(0);
    expect(store.getState().currentScene!.elevatedOn?.noun).toBe('stone pillar');
  });
});

describe('OTA-952 — rest-on-wall refusal answers every retry', () => {
  it('two rests on the wall get two visible refusals (no dedup silence)', async () => {
    const store = await bootOnWall(0);
    store.getState().submitPlayerAction('rest');
    await new Promise((r) => setTimeout(r, 5));
    store.getState().submitPlayerAction('rest');
    await new Promise((r) => setTimeout(r, 5));
    const refusals = store.getState().gameLog.filter((e) => e.text.includes('sleep on a wall'));
    expect(refusals.length).toBe(2);
  });
});
