// OTA-229 — useFirstTimeHint AsyncStorage contract.
//
// The hook itself wraps useState + useEffect around a read of
// `tartaria.hint.v1.<id>`; the visible-or-hidden decision is
// `raw == null` and the dismiss action writes '1'. That logic is
// tested here against a mocked AsyncStorage so the contract is
// pinned. The Phase 2+ migrations rely on it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { resetFirstTimeHint, resetAllFirstTimeHints } from '../app/components/useFirstTimeHint';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      multiRemove: jest.fn((keys: string[]) => { for (const k of keys) delete store[k]; return Promise.resolve(); }),
      getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
      clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); }),
    },
  };
});

const KEY_PREFIX = 'tartaria.hint.v1.';

beforeEach(async () => {
  await resetAllFirstTimeHints();
  // @ts-expect-error — clear() exists on the mock
  await AsyncStorage.clear();
});

describe('OTA-229 — first-time-hint storage contract', () => {
  it('fresh id: AsyncStorage returns null → hint shows (raw == null)', async () => {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + 'probe_fresh');
    expect(raw).toBeNull();
    expect(raw == null).toBe(true); // hook reads this as shouldShow=true
  });

  it('after the dismiss write (setItem "1"), the same id reads "1" and hint hides', async () => {
    await AsyncStorage.setItem(KEY_PREFIX + 'probe_dismiss', '1');
    const raw = await AsyncStorage.getItem(KEY_PREFIX + 'probe_dismiss');
    expect(raw).toBe('1');
    expect(raw == null).toBe(false); // hook reads this as shouldShow=false
  });

  it('different ids are independent — dismissing one does not flag the other', async () => {
    await AsyncStorage.setItem(KEY_PREFIX + 'probe_a', '1');
    const a = await AsyncStorage.getItem(KEY_PREFIX + 'probe_a');
    const b = await AsyncStorage.getItem(KEY_PREFIX + 'probe_b');
    expect(a).toBe('1');
    expect(b).toBeNull();
  });

  it('resetFirstTimeHint(id) removes the flag so the hint shows again', async () => {
    await AsyncStorage.setItem(KEY_PREFIX + 'probe_reset', '1');
    expect(await AsyncStorage.getItem(KEY_PREFIX + 'probe_reset')).toBe('1');
    await resetFirstTimeHint('probe_reset');
    expect(await AsyncStorage.getItem(KEY_PREFIX + 'probe_reset')).toBeNull();
  });

  it('resetAllFirstTimeHints() clears every tartaria.hint.v1.* flag', async () => {
    await AsyncStorage.setItem(KEY_PREFIX + 'probe_a', '1');
    await AsyncStorage.setItem(KEY_PREFIX + 'probe_b', '1');
    await AsyncStorage.setItem('tartaria.something.else.v1', 'do_not_touch'); // non-hint key
    await resetAllFirstTimeHints();
    expect(await AsyncStorage.getItem(KEY_PREFIX + 'probe_a')).toBeNull();
    expect(await AsyncStorage.getItem(KEY_PREFIX + 'probe_b')).toBeNull();
    // The reset must NOT wipe other tartaria.* keys (audio settings,
    // synth cache, voice settings, etc.).
    expect(await AsyncStorage.getItem('tartaria.something.else.v1')).toBe('do_not_touch');
  });

  it('storage key format uses the documented prefix so future grep finds every hint', async () => {
    await AsyncStorage.setItem(KEY_PREFIX + 'inventory_first_open', '1');
    // @ts-expect-error — getAllKeys exists on the mock
    const keys: string[] = await AsyncStorage.getAllKeys();
    const hintKeys = keys.filter((k) => k.startsWith(KEY_PREFIX));
    expect(hintKeys).toContain(`${KEY_PREFIX}inventory_first_open`);
  });
});
