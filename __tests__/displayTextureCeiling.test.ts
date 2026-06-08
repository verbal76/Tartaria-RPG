import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDisplaySettings, resetDisplaySettings } from '../app/ui/displaySettings';

// OTA-347 — the Display tab "Paper texture" ceiling was raised 20% → 50% per
// player ask. The stepper max alone isn't enough: setDisplaySettings (and the
// load path) clamp textureOpacity, so the clamp ceiling had to move too or any
// value above 0.20 would snap back.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('display textureOpacity ceiling (OTA-347 — 20% → 50%)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await resetDisplaySettings();
  });

  it('accepts the new 50% ceiling', async () => {
    const s = await setDisplaySettings({ textureOpacity: 0.5 });
    expect(s.textureOpacity).toBe(0.5);
  });

  it('a value between the old 20% and the new 50% now sticks (used to clamp to 0.20)', async () => {
    const s = await setDisplaySettings({ textureOpacity: 0.35 });
    expect(s.textureOpacity).toBeCloseTo(0.35, 5);
  });

  it('clamps above 50% back down to 0.50', async () => {
    const s = await setDisplaySettings({ textureOpacity: 0.9 });
    expect(s.textureOpacity).toBe(0.5);
  });

  it('still accepts low values and 0', async () => {
    expect((await setDisplaySettings({ textureOpacity: 0.06 })).textureOpacity).toBeCloseTo(0.06, 5);
    expect((await setDisplaySettings({ textureOpacity: 0 })).textureOpacity).toBe(0);
  });
});
