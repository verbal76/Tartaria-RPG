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

// OTA-987 — escort pay model. Owner: "go with the scaled party for most
// escorts, but make the higher tier escorts all or nothing to make them
// harder." Scaled (default): the TC fee tracks the fraction of the party
// still standing at delivery. all_or_nothing (the hard drop-offs): full pay
// if they arrive alive, total loss when the pool dies. Plus the content pass:
// every escort faction now fields 3 scaled + 2 all_or_nothing contracts.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import { isEscortQuest } from '../app/engine/escort';

describe('OTA-987 — content pass: 3 scaled + 2 all_or_nothing per escort faction', () => {
  it('each escort faction fields both tiers', () => {
    for (const fid of ['stone_builders', 'forgotten_order', 'eternal_dynasty', 'tartarian_revivalists']) {
      const escorts = FACTION_QUESTS.filter((q) => q.factionId === fid && isEscortQuest(q));
      const hard = escorts.filter((q) => q.escort?.mode === 'all_or_nothing');
      const scaled = escorts.filter((q) => q.escort?.mode !== 'all_or_nothing');
      expect(scaled.length).toBeGreaterThanOrEqual(3);
      expect(hard.length).toBeGreaterThanOrEqual(2);
    }
  });
});

async function bootTurnIn(questId: string, hp: number, hpMax: number, label: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Broker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const def = FACTION_QUESTS.find((q) => q.id === questId)!;
  store.setState((s) => ({
    currentScene: { ...s.currentScene!, missionBoard: { faction: def.factionId }, enemies: [], enemyHps: [] },
    player: {
      ...s.player!,
      activeFactionQuestIds: [questId],
      activeFactionQuests: [{
        id: questId, stage: 0, postedByFaction: def.factionId, acceptedAt: 1, tracked: true,
        escort: { label, hp, hpMax, count: def.escort?.count ?? 2 },
      }],
    },
  }));
  return { store, def };
}

describe('OTA-987 — scaled vs all-or-nothing pay at delivery', () => {
  it('a half-strength party on a SCALED contract pays ~half and says so', async () => {
    const { store } = await bootTurnIn('fq_stone_builders_survey_escort', 30, 60, 'Surveyors');
    const tcBefore = store.getState().player!.tc;
    store.getState().turnInFactionQuest('fq_stone_builders_survey_escort');
    await new Promise((r) => setTimeout(r, 10));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/battered, but breathing/);
    expect(log).toMatch(/50% pay/);
    const gained = store.getState().player!.tc - tcBefore;
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThan(70); // full fee is 70+journey; half-strength pays about half
    expect(store.getState().player!.completedFactionQuestIds ?? []).toContain('fq_stone_builders_survey_escort');
  });

  it('a bloodied-but-alive party on an ALL-OR-NOTHING drop-off still pays in full', async () => {
    const { store, def } = await bootTurnIn('fq_stone_builders_founders_bones_escort', 1, 60, 'Bearers');
    const tcBefore = store.getState().player!.tc;
    store.getState().turnInFactionQuest('fq_stone_builders_founders_bones_escort');
    await new Promise((r) => setTimeout(r, 10));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/peel off with a nod/);
    expect(log).not.toMatch(/battered, but breathing/);
    const gained = store.getState().player!.tc - tcBefore;
    expect(gained).toBeGreaterThanOrEqual(def.reward.tc); // full fee (plus any journey bonus)
  });
});
