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

// OTA-947 — playtest batch: (1) "attack the arch" mis-bound to "research chart"
// because ambient matching used raw substrings ("research chart" contains "arch"
// mid-word) — matching is now word-level; (2) "shape stone" ate the player's
// EQUIPPED Aetheric Locket because the locket sat in the fuel list and fuel was
// taken in inventory order — locket removed, cheapest fuel first; (3) weapon
// swings at hard scenery now say the 1-2 HP cost with rotating snark, floored
// at 1 HP; (4) the elevated "climb down" refusal always answers on repeats
// (the arbiter dedup used to swallow them into dead silence).
import { useGameStore } from '../app/state/gameStore';
import { matchAmbientNoun } from '../app/engine/ambientNouns';
import { getRaces, getFactions } from '../app/engine/character';

const SNARKS = [
  `That wasn't your brightest move.`,
  `Uh — why did you do that?`,
  `The Arbiter pretends not to have seen that.`,
  `Somewhere, a bard decides not to write this down.`,
];

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Prober', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-947 — word-level ambient noun matching', () => {
  it('"arch" can never bind to "research chart" (mid-word substring)', () => {
    expect(matchAmbientNoun('arch', ['research chart'])).toBeNull();
  });
  it('"arch" still finds a real arch when one exists', () => {
    expect(matchAmbientNoun('arch', ['research chart', 'stone arch'])).toBe('stone arch');
  });
  it('a target with the noun mid-word in ITS text no longer matches either', () => {
    expect(matchAmbientNoun('parchment', ['arch'])).toBeNull();
  });
  it('whole-word forms keep working: "the wall" → "wall", plural fold, prefix', () => {
    expect(matchAmbientNoun('the wall', ['stone wall', 'wall'])).toBe('wall');
    expect(matchAmbientNoun('walls', ['wall'])).toBe('wall');
    expect(matchAmbientNoun('tele', ['telescope'])).toBe('telescope');
  });
});

describe('OTA-947 — Aethercraft fuel picker', () => {
  it('shape never consumes the Aetheric Locket; cheapest fuel goes first', async () => {
    const store = await boot();
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          { id: 'lk1', name: 'Aetheric Locket', kind: 'misc' as const, rarity: 'Rare' as const, quantity: 1, tags: ['detection', 'amulet', 'relic'] },
          { id: 'sh1', name: 'Aetheric Shard', kind: 'misc' as const, rarity: 'Uncommon' as const, quantity: 2, tags: ['aether', 'crystal'] },
          { id: 'rs1', name: 'Aether Residue', kind: 'misc' as const, rarity: 'Common' as const, quantity: 2, tags: ['aether'] },
        ],
      },
    }));
    store.getState().submitPlayerAction('shape stone');
    await new Promise((r) => setTimeout(r, 5));
    const inv = store.getState().player!.inventory;
    expect(inv.find((i) => i.name === 'Aetheric Locket')?.quantity).toBe(1);
    expect(inv.find((i) => i.name === 'Aetheric Shard')?.quantity).toBe(2);
    expect(inv.find((i) => i.name === 'Aether Residue')?.quantity).toBe(1);
    const consumed = store.getState().gameLog.filter((e) => e.text.includes('consumed.'));
    expect(consumed.some((e) => e.text.includes('Aether Residue'))).toBe(true);
    expect(consumed.some((e) => e.text.includes('Locket'))).toBe(false);
  });
});

describe('OTA-947 — hard-scenery strikes bite back, with snark', () => {
  async function bootAtWall(hp: number) {
    const store = await boot();
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, enemies: [], ambientNouns: ['research chart', 'stone arch'] } });
    store.setState((s) => ({ player: { ...s.player!, hp, hpMax: 100 } }));
    return store;
  }
  it('the playtest scene: "attack the arch" hits the ARCH (not the chart), costs 1-2 HP, and snarks', async () => {
    const store = await bootAtWall(100);
    store.getState().submitPlayerAction('attack the arch');
    await new Promise((r) => setTimeout(r, 5));
    const hp = store.getState().player!.hp;
    expect(hp).toBeGreaterThanOrEqual(98);
    expect(hp).toBeLessThanOrEqual(99);
    const line = store.getState().gameLog.find((e) => e.text.includes('does not concede.'));
    expect(line).toBeTruthy();
    expect(line!.text).toContain('stone arch');
    expect(line!.text).not.toContain('research chart');
    expect(line!.text).toMatch(/-[12] HP\./);
    expect(SNARKS.some((sn) => line!.text.includes(sn))).toBe(true);
  });
  it('the bruise can never kill — HP floors at 1', async () => {
    const store = await bootAtWall(1);
    store.getState().submitPlayerAction('attack the arch');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().player!.hp).toBe(1);
  });
});

describe('OTA-947 — elevated refusal always answers on repeats', () => {
  it('four investigate attempts from up top get four visible Arbiter replies', async () => {
    const store = await boot();
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        enemies: [],
        ambientNouns: ['shore', 'stone pillar'],
        elevatedOn: { noun: 'stone pillar', tier: 1, totalTiers: 2 },
        elevatedOverlayMeta: undefined,
      },
    });
    for (let i = 0; i < 4; i++) {
      store.getState().submitPlayerAction('investigate the shore');
      await new Promise((r) => setTimeout(r, 5));
    }
    const replies = store.getState().gameLog.filter(
      (e) => e.channel === 'arbiter' && /Climb down|down there|points down/.test(e.text),
    );
    expect(replies.length).toBe(4);
  });
});
