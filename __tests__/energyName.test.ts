jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({ InferenceSession: { create: jest.fn() }, Tensor: class {} }));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', EncodingType: {} }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
import { getEnergyName, hasEnergyOverride, setEnergyNameOverride, clearAllOverrides } from '../app/engine/contentPack';
import { useContentPackStore } from '../app/state/contentPackStore';

describe('energy/magic name — settable as a first-class rename', () => {
  beforeEach(() => clearAllOverrides());
  afterEach(() => clearAllOverrides());
  test('default: no override → "Aether" name but magic tab falls back to "Magic"', () => {
    expect(hasEnergyOverride()).toBe(false);
  });
  test('setEnergyNameOverride drives getEnergyName + hasEnergyOverride', () => {
    setEnergyNameOverride('Vril');
    expect(getEnergyName()).toBe('Vril');
    expect(hasEnergyOverride()).toBe(true);
  });
  test('store setEnergyName persists + applies (the dev-panel field)', () => {
    useContentPackStore.getState().setEnergyName('Essence');
    expect(getEnergyName()).toBe('Essence');
    useContentPackStore.getState().clearAll();
    expect(getEnergyName()).toBe('Aether'); // back to built-in default
  });
});
