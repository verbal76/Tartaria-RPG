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

// OTA-988 — hook escorts. Owner: "we need hook escort missions." A stranded
// traveler can now appear on novel wild ground (a hook, planted by the
// stepDirection spawner — never by the random hook picker). Talking to them
// opens the offer; CONTINUE takes a rep-0 field escort contract (record pushed
// exactly like a vendor accept, so collateral / fail / scaled pay / turn-in
// all work unchanged); ABANDON walks on.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import { plantHookByKind, pickRandomHookKind, HOOK_WEIGHTS } from '../app/engine/hooks';

const factionIds = (require('../app/data/factions/factions.json') as { id: string }[] | { factions?: { id: string }[] });

describe('OTA-988 — stranded defs: one rep-0 field escort per faction', () => {
  it('every faction has a valid stranded escort def', () => {
    const raw: any = factionIds;
    const list: { id: string }[] = Array.isArray(raw) ? raw : raw.factions ?? [];
    expect(list.length).toBeGreaterThan(0);
    const stranded = FACTION_QUESTS.filter((q) => q.id.endsWith('_stranded_escort'));
    expect(stranded.length).toBeGreaterThanOrEqual(9);
    const validIds = new Set(list.map((f) => f.id));
    for (const q of stranded) {
      expect(validIds.has(q.factionId)).toBe(true);
      expect(q.requirement.rep).toBe(0);
      expect(q.escort?.count).toBe(1);
    }
  });

  it('the stranded hook never comes from the random picker', () => {
    expect(HOOK_WEIGHTS.stranded_traveler).toBe(0);
    for (let i = 0; i < 200; i++) expect(pickRandomHookKind()).not.toBe('stranded_traveler');
  });
});

describe('OTA-988 — talk to the traveler, CONTINUE, and the contract is yours', () => {
  it('accepting pushes a live escort record; the party rides with you', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const h = plantHookByKind('stranded_traveler');
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], hooks: [h] },
      player: { ...s.player!, activeFactionQuests: [], activeFactionQuestIds: [] },
    }));
    await store.getState().submitPlayerAction('investigate traveler');
    await new Promise((r) => setTimeout(r, 10));
    expect(store.getState().pendingHookContinue).toBeTruthy(); // the offer is up
    store.getState().continueHook();
    await new Promise((r) => setTimeout(r, 10));
    const quests = store.getState().player!.activeFactionQuests ?? [];
    expect(quests.length).toBe(1);
    expect(quests[0]!.id.endsWith('_stranded_escort')).toBe(true);
    expect(quests[0]!.escort).toBeTruthy();
    expect(quests[0]!.escort!.hp).toBeGreaterThan(0);
    expect(quests[0]!.escort!.label).toBe('Stranded Traveler');
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/Contract taken in the field/);
  });
});
