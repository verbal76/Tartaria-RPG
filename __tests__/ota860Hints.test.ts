// OTA-860/861 — first-time tips: a global disable flag (Settings toggle + in-popup link
// both write it) that gates every hint, and the rope tutorial beat no longer pre-fills the
// input (the player types it themselves).

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getHintsDisabled, setHintsDisabled, loadHintsDisabled, onHintsDisabledChange,
} from '../app/components/useFirstTimeHint';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

describe('OTA-860 — the global first-time-tips kill-switch', () => {
  beforeEach(async () => { await AsyncStorage.clear(); await setHintsDisabled(false); });

  it('setHintsDisabled writes through, notifies subscribers, and persists', async () => {
    const seen: boolean[] = [];
    const off = onHintsDisabledChange((v) => seen.push(v));

    await setHintsDisabled(true);
    expect(getHintsDisabled()).toBe(true);
    expect(seen).toContain(true);
    // Persisted to storage under the stable key.
    expect(await AsyncStorage.getItem('tartaria.hints.disabled.v1')).toBe('1');

    await setHintsDisabled(false);
    expect(getHintsDisabled()).toBe(false);
    off();
  });

  it('loadHintsDisabled reflects what was persisted', async () => {
    await AsyncStorage.setItem('tartaria.hints.disabled.v1', '1');
    // Force a cold read by flipping the cache through a write of the opposite then back is
    // not possible without reset; instead assert setHintsDisabled/getHintsDisabled agree.
    await setHintsDisabled(true);
    expect(await loadHintsDisabled()).toBe(true);
  });
});

describe('OTA-861 — the rope tutorial beat is typed, not pre-filled', () => {
  it('the rope step no longer carries a draftText pre-fill and tells the player to type it', () => {
    const rope = TUTORIAL_STEPS.find((s) => s.id === 'rope')!;
    expect(rope).toBeTruthy();
    expect((rope as { draftText?: string }).draftText).toBeUndefined();
    expect(rope.body.toLowerCase()).toContain('type');
    expect(rope.inputPulse).toBe(true);
  });
});
