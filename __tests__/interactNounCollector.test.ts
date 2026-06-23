jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({ InferenceSession: { create: jest.fn() }, Tensor: class {} }));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', EncodingType: {} }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
import { collectInteractableNouns } from '../app/engine/contentTemplates';
import { setStartingAreasOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('interaction-tags noun collector — pulls from ALL loaded content', () => {
  afterEach(() => clearAllOverrides());
  test('includes starting-area room interactables, not just locations', () => {
    setStartingAreasOverride([{ factionId: 'allies', name: 'Base', locationId: 'x', rooms: [
      { id: 'ops', name: 'Ops', description: '', interactables: ['secret panel', 'radio set'] },
    ] }]);
    const nouns = collectInteractableNouns();
    expect(nouns).toContain('secret panel');
    expect(nouns).toContain('radio set');
    // still includes built-in hub / location nouns too (union across sources)
    expect(nouns.length).toBeGreaterThan(10);
  });
});
