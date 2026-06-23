jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({ InferenceSession: { create: jest.fn() }, Tensor: class {} }));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', EncodingType: {} }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
import { getRecipes } from '../app/engine/crafting';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('crafting display reads the UPLOADED recipe book, not the built-in', () => {
  afterEach(() => clearAllOverrides());
  test('getRecipes() returns the loaded recipes override (the Craft/Recipes tabs use this)', () => {
    setTableOverride('recipes', [
      { result: 'Tesla-Coil Knuckles', ingredients: [{ name: 'Scrap Steel', quantity: 2 }] },
    ]);
    const names = getRecipes().map((r) => r.result);
    expect(names).toContain('Tesla-Coil Knuckles');
    // and the built-in Tartaria recipes are NOT present (the upload replaces them)
    expect(names).not.toContain('Aether-Purge Tonic');
  });
});
