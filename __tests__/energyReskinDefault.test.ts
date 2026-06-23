jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({ InferenceSession: { create: jest.fn() }, Tensor: class {} }));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', EncodingType: {} }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
import { getEnergyName, getEnergyMaterial, setWorldNameOverride, setEnergyNameOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('energy default — neutral for a re-skin, Aether only for pure built-in', () => {
  beforeEach(() => clearAllOverrides());
  afterEach(() => clearAllOverrides());
  test('pure built-in (no reskin) → Aether (unchanged)', () => {
    expect(getEnergyName()).toBe('Aether');
    expect(getEnergyMaterial()).toBe('Aetherstone');
  });
  test('re-skin (worldName set), no energy named → NEUTRAL, not Aether', () => {
    setWorldNameOverride('The Fold');
    expect(getEnergyName()).toBe('energy');
    expect(getEnergyMaterial()).toBe('essence');
  });
  test('author sets energy name → wins over everything', () => {
    setWorldNameOverride('The Fold');
    setEnergyNameOverride('Vril');
    expect(getEnergyName()).toBe('Vril');
  });
});
