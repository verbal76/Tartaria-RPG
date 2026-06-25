// engine_Dev — FACTION MISSIONS builder. The dev-console form serializes a faction
// contract into missions.factionQuests with a rep gate, TC/rep/item rewards, and a
// mission plan (stages) or a fetch requirement. This locks that the form's shape
// survives the real loader and that the engine reads it: the rep gate filters the
// board, and reward.items is preserved for the turn-in grant.

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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));

import { useContentPackStore } from '../app/state/contentPackStore';
import { getFactionQuests, availableFactionQuests, findFactionQuestById } from '../app/engine/factionQuests';

// Exactly what FactionMissionsBox.save() serializes (a rep-gated, item-rewarding,
// staged contract), nested under the missions object.
const MISSIONS = {
  factionQuests: [{
    id: 'silence_the_relay',
    factionId: 'allies',
    title: 'Silence the Relay',
    description: 'Knock out the forward relay before the next drop.',
    objective: 'Destroy the enemy relay',
    requirement: { rep: 15 },
    reward: { tc: 120, rep: 8, items: ['Field Radio'] },
    stages: [
      { narration: 'Cross the line and find the relay mast.', advanceOn: 'travel' },
      { narration: 'Put the relay down and its guards with it.', advanceOn: 'kill' },
    ],
  }],
};

describe('faction mission builder — shape survives loader + engine reads it', () => {
  beforeEach(() => { useContentPackStore.getState().clearMissions(); });

  test('loads, overrides built-in, and preserves rep gate + item reward', () => {
    const r = useContentPackStore.getState().loadMissionsJson(JSON.stringify(MISSIONS));
    expect(r.ok).toBe(true);

    const q = findFactionQuestById('silence_the_relay');
    expect(q).not.toBeNull();
    expect(q!.requirement.rep).toBe(15);
    expect(q!.reward.items).toEqual(['Field Radio']);
    expect(q!.stages).toHaveLength(2);
    // uploaded set replaces built-in
    expect(getFactionQuests().some((x) => x.id === 'silence_the_relay')).toBe(true);
  });

  test('the rep gate filters the Mission Board', () => {
    useContentPackStore.getState().loadMissionsJson(JSON.stringify(MISSIONS));
    // below the gate → not offered
    expect(availableFactionQuests('allies', 10, [], [])).toHaveLength(0);
    // at/above the gate → offered
    expect(availableFactionQuests('allies', 15, [], []).map((q) => q.id)).toContain('silence_the_relay');
    // already completed → not offered again
    expect(availableFactionQuests('allies', 99, [], ['silence_the_relay'])).toHaveLength(0);
  });
});
