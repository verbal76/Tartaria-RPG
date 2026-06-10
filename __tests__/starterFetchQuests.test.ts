// OTA-450 — generic per-faction STARTER fetch quests. Turn-in is gated on the
// player actually holding the items, which are consumed on completion.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { FACTION_QUESTS } from '../app/engine/factionQuests';

async function boot(name: string, factionId: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-450 — starter fetch quests', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('every faction has a rep-0 starter fetch quest', () => {
    for (const f of getFactions()) {
      const starter = FACTION_QUESTS.find((q) => q.factionId === f.id && q.fetch && q.requirement.rep === 0);
      expect(starter).toBeDefined();
    }
  });

  it('turn-in is gated on holding the items, which are consumed on completion', async () => {
    const factionId = 'reclaimers_guild';
    const store = await boot('Fetcher', factionId);
    // A same-faction vendor in the scene so accept/turn-in resolve.
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, vendor: { name: 'Quartermaster', faction: factionId, offers: [] } as never },
    }));

    store.getState().acceptFactionQuest('Scrap Run');
    expect(store.getState().player!.activeFactionQuestIds).toContain('fq_reclaimers_starter');

    // Turn in with nothing — refused, quest stays active.
    store.getState().turnInFactionQuest('Scrap Run');
    expect(store.getState().player!.activeFactionQuestIds).toContain('fq_reclaimers_starter');

    // Bring the 5 Scrap Metal (plus a spare unrelated item) and turn in.
    const tcBefore = store.getState().player!.tc;
    store.setState((s) => ({
      player: { ...s.player!, inventory: [
        ...s.player!.inventory,
        { id: 'sm', name: 'Scrap Metal', kind: 'misc', quantity: 7, tags: ['metal'] },
      ] },
    }));
    store.getState().turnInFactionQuest('Scrap Run');

    const p = store.getState().player!;
    expect(p.completedFactionQuestIds).toContain('fq_reclaimers_starter');
    expect(p.activeFactionQuestIds).not.toContain('fq_reclaimers_starter');
    expect(p.tc).toBe(tcBefore + 35); // reward paid
    // 5 of 7 Scrap Metal consumed → 2 left.
    const sm = p.inventory.filter((i) => i.name === 'Scrap Metal').reduce((n, i) => n + i.quantity, 0);
    expect(sm).toBe(2);
  });

  it('OTA-451 — the mission board (no vendor) accepts + turns in faction quests', async () => {
    const factionId = 'reclaimers_guild';
    const store = await boot('Boarder', factionId);
    // A board in the scene, NO vendor.
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, vendor: null, missionBoard: { faction: factionId } },
    }));

    // Reading the board posts the open contracts to the feed.
    store.getState().readMissionBoard();
    const log1 = store.getState().gameLog.map((l) => l.text).join('\n');
    expect(log1).toMatch(/Mission Board/i);
    expect(log1).toMatch(/Scrap Run/);

    // Accept from the board (no vendor present).
    store.getState().acceptFactionQuest('Scrap Run');
    expect(store.getState().player!.activeFactionQuestIds).toContain('fq_reclaimers_starter');

    // Gather + turn in at the board.
    store.setState((s) => ({
      player: { ...s.player!, inventory: [
        ...s.player!.inventory,
        { id: 'sm', name: 'Scrap Metal', kind: 'misc', quantity: 5, tags: ['metal'] },
      ] },
    }));
    const tcBefore = store.getState().player!.tc;
    store.getState().turnInFactionQuest('Scrap Run');
    const p = store.getState().player!;
    expect(p.completedFactionQuestIds).toContain('fq_reclaimers_starter');
    expect(p.tc).toBe(tcBefore + 35);
  });
});
