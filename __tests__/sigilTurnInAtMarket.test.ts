// OTA-783 — the Hidden Market brokers faction-sigil turn-ins. You can hand in
// ANY faction's sigil there (+1 standing), not only at that faction's home
// stake — the one-stop hub, so a carried crest is never stranded.

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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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
import { getStanding } from '../app/engine/factions';
import { placedAt } from '../test-utils/placePlayer';

async function bootstrap(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name, raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

const SIGIL_ID = 'sig_reclaimer_1';
function giveSigil(store: typeof useGameStore) {
  const p = store.getState().player!;
  store.setState({
    player: {
      ...p,
      inventory: [
        ...p.inventory,
        { id: SIGIL_ID, name: 'Reclaimer Sigil', kind: 'quest', rarity: 'Uncommon', quantity: 1, tags: ['sigil', 'reclaimers_guild'] } as never,
      ],
    },
  });
}
function reclaimerStanding(): number {
  return getStanding(useGameStore.getState().player!.factionStanding ?? [], 'reclaimers_guild');
}
function hasSigil(): boolean {
  return useGameStore.getState().player!.inventory.some((i) => i.id === SIGIL_ID && i.quantity > 0);
}

describe('OTA-783 — sigil turn-in at the Hidden Market', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('turning in a sigil AT the market grants +1 standing and spends it', async () => {
    const store = await bootstrap('SigilBroker');
    giveSigil(store);
    const before = reclaimerStanding();
    // Stand in the market.
    store.setState({ player: { ...store.getState().player!, ...placedAt('hidden_market') } });

    store.getState().turnInSigil(SIGIL_ID);

    expect(reclaimerStanding()).toBe(before + 1);
    expect(hasSigil()).toBe(false);
  });

  it('turning it in somewhere that is NEITHER the market NOR the faction stake is refused (sigil kept)', async () => {
    const store = await bootstrap('SigilNowhere');
    giveSigil(store);
    const before = reclaimerStanding();
    store.setState({ player: { ...store.getState().player!, ...placedAt('some_random_tile_xyz') } });

    store.getState().turnInSigil(SIGIL_ID);

    expect(reclaimerStanding()).toBe(before); // no change
    expect(hasSigil()).toBe(true);            // still carried
  });
});
