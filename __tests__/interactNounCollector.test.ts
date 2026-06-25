jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({ InferenceSession: { create: jest.fn() }, Tensor: class {} }));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', EncodingType: {} }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
import { collectInteractableNouns } from '../app/engine/contentTemplates';
import { setStartingAreasOverride, setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('interaction-tags collector — ONLY loaded uploads, deduped', () => {
  beforeEach(() => clearAllOverrides());
  afterEach(() => clearAllOverrides());

  test('nothing loaded → empty (no built-in / template / generic bleed)', () => {
    expect(collectInteractableNouns()).toEqual([]);
  });

  test('unions loaded Locations + loaded Starting-area rooms, deduped + sorted', () => {
    setTableOverride('locations', [
      { id: 'a', interactables: ['radio set', 'crate'] },
      { id: 'b', interactables: ['crate', 'jeep'] }, // 'crate' dup
    ]);
    setStartingAreasOverride([{ factionId: 'allies', name: 'Base', locationId: 'a', rooms: [
      { id: 'ops', name: 'Ops', description: '', interactables: ['secret panel', 'radio set'] }, // 'radio set' dup
    ] }]);
    const nouns = collectInteractableNouns();
    expect(nouns).toEqual(['crate', 'jeep', 'radio set', 'secret panel']); // deduped + sorted
  });

  test('only locations loaded → only its nouns (starting areas not bled in)', () => {
    setTableOverride('locations', [{ id: 'a', interactables: ['well'] }]);
    expect(collectInteractableNouns()).toEqual(['well']);
  });
});
