// OTA-898 (SA-6) — device accessibility prefs store. Kept off the game-save
// path; persisted to its own AsyncStorage key. Today it carries reduce-motion.

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAccessibility } from '../app/state/accessibility';

const STORAGE_KEY = '@tartaria/accessibility';

describe('OTA-898 — accessibility prefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useAccessibility.setState({ reduceMotion: false, loaded: false });
  });

  it('defaults reduce-motion off', () => {
    expect(useAccessibility.getState().reduceMotion).toBe(false);
  });

  it('setReduceMotion flips the flag AND persists it', async () => {
    useAccessibility.getState().setReduceMotion(true);
    expect(useAccessibility.getState().reduceMotion).toBe(true);
    // Persisted under the dedicated key (not the save blob).
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).reduceMotion).toBe(true);
  });

  it('hydrateAccessibility reads a previously-persisted value back', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ reduceMotion: true }));
    await useAccessibility.getState().hydrateAccessibility();
    expect(useAccessibility.getState().reduceMotion).toBe(true);
    expect(useAccessibility.getState().loaded).toBe(true);
  });

  it('hydrate with no stored pref leaves the default and marks loaded', async () => {
    await useAccessibility.getState().hydrateAccessibility();
    expect(useAccessibility.getState().reduceMotion).toBe(false);
    expect(useAccessibility.getState().loaded).toBe(true);
  });

  it('hydrate tolerates a corrupt pref blob (falls back to default)', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');
    await useAccessibility.getState().hydrateAccessibility();
    expect(useAccessibility.getState().reduceMotion).toBe(false);
    expect(useAccessibility.getState().loaded).toBe(true);
  });
});
