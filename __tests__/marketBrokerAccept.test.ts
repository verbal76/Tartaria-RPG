// OTA-789 — accepting a contract at a Hidden Market broker stall must work even
// when the contract belongs to a DIFFERENT faction than the vendor's own rostered
// one. The board aggregates every faction's work; the accept handlers used to
// resolve the pool from scene.vendor.faction (one faction), so any cross-faction
// pick fell out of the pool and produced "…has nothing on offer for you right now."

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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { buildStallVendor } from '../app/engine/vendors';
import { availableFactionQuests } from '../app/engine/factionQuests';
import { FACTIONS } from '../app/engine/factions';

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name: 'Delver', raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0 } } : s));
  return store;
}

describe('OTA-789 — broker stalls accept cross-faction contracts', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('accepts a faction quest whose faction differs from the broker vendor\'s own', async () => {
    const store = await freshGame();

    // A broker stall vendor (id starts hidden_market_). Pin its rostered faction
    // to the FIRST faction so we can pick a target from a DIFFERENT one.
    const base = buildStallVendor('weapons', 'Weapons');
    const vendorFaction = FACTIONS[0]!.id;
    const broker = { ...base, faction: vendorFaction };
    expect(broker.id.startsWith('hidden_market_')).toBe(true);

    // Find a rep-0 faction quest belonging to a DIFFERENT faction.
    let target: { id: string; title: string } | null = null;
    for (const f of FACTIONS) {
      if (f.id === vendorFaction) continue;
      const pool = availableFactionQuests(f.id, 0, [], []);
      if (pool.length) { target = pool[0]!; break; }
    }
    expect(target).toBeTruthy();

    // Place the broker in-scene and accept the cross-faction contract.
    store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, vendor: broker } } : s));
    store.getState().acceptFactionQuest(target!.title);

    expect(store.getState().player!.activeFactionQuestIds ?? []).toContain(target!.id);
  });

  it('a NON-broker vendor still only accepts its own faction (cross-faction is refused)', async () => {
    const store = await freshGame();

    const vendorFaction = FACTIONS[0]!.id;
    // Ordinary (non-broker) vendor id — no hidden_market_ prefix.
    const base = buildStallVendor('weapons', 'Weapons');
    const plainVendor = { ...base, id: 'roadside_trader', faction: vendorFaction };

    let target: { id: string; title: string } | null = null;
    for (const f of FACTIONS) {
      if (f.id === vendorFaction) continue;
      const pool = availableFactionQuests(f.id, 0, [], []);
      if (pool.length) { target = pool[0]!; break; }
    }
    expect(target).toBeTruthy();

    store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, vendor: plainVendor } } : s));
    store.getState().acceptFactionQuest(target!.title);

    // A plain vendor of faction A cannot hand out faction B's quest.
    expect(store.getState().player!.activeFactionQuestIds ?? []).not.toContain(target!.id);
  });
});
