import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  captureCrashSaveFromDisk,
  captureActiveCrashSave,
  loadCrashSave,
  clearCrashSave,
  buildCrashSaveExport,
  CRASH_SAVE_KEY,
} from '../app/diagnostics/crashSave';
import { ACTIVE_SLOT_KEY, slotSaveKey } from '../app/engine/saveSystem';

// OTA-343 — crash-save capture. After a crash, the EXACT on-disk save bytes of
// the offending slot must be captured so the next launch can COPY CRASHED SAVE
// for repro — including a CORRUPT save that can never be loaded (and so can
// never be reached by COPY SAVE). The capture functions are called from crash
// handlers, so they must never throw.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const SLOT = 'slot_test_1';

function validSaveBytes(): string {
  return JSON.stringify({
    version: 1,
    savedAt: 123,
    player: { name: 'Verbal', raceId: 'mud_dweller', factionId: 'forgotten_order', hp: 30, hpMax: 30, dead: false, inventory: [], statusEffects: [] },
    worldMemory: { puppyVendorOwed: true },
    gameLog: [],
    currentScreen: 'exploration',
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('crashSave — capture from disk (native load-crash path)', () => {
  it('captures the exact on-disk bytes of the flagged slot', async () => {
    const bytes = validSaveBytes();
    await AsyncStorage.setItem(slotSaveKey(SLOT), bytes);

    await captureCrashSaveFromDisk(SLOT, 'slot-load-native-crash');

    const cap = await loadCrashSave();
    expect(cap).not.toBeNull();
    expect(cap!.slotId).toBe(SLOT);
    expect(cap!.stage).toBe('slot-load-native-crash');
    expect(cap!.raw).toBe(bytes);
    expect(typeof cap!.capturedAt).toBe('number');
  });

  it('captures a CORRUPT (unparseable) save verbatim — the brick case', async () => {
    const corrupt = '{"player":{"name":"Verbal",  <<<TRUNCATED';
    await AsyncStorage.setItem(slotSaveKey(SLOT), corrupt);

    await captureCrashSaveFromDisk(SLOT, 'slot-load-native-crash');

    const cap = await loadCrashSave();
    expect(cap!.raw).toBe(corrupt);
  });
});

describe('crashSave — capture active slot (mid-session crash path)', () => {
  it('captures the active slot bytes via the active-slot pointer', async () => {
    const bytes = validSaveBytes();
    await AsyncStorage.setItem(ACTIVE_SLOT_KEY, SLOT);
    await AsyncStorage.setItem(slotSaveKey(SLOT), bytes);

    await captureActiveCrashSave('fatal:hydrate:done');

    const cap = await loadCrashSave();
    expect(cap!.slotId).toBe(SLOT);
    expect(cap!.raw).toBe(bytes);
  });

  it('no-ops cleanly when no slot is active (crash on title screen)', async () => {
    await captureActiveCrashSave('fatal:title');
    expect(await loadCrashSave()).toBeNull();
  });
});

describe('crashSave — lifecycle + never-throw contract', () => {
  it('clearCrashSave removes the buffer', async () => {
    await AsyncStorage.setItem(slotSaveKey(SLOT), validSaveBytes());
    await captureCrashSaveFromDisk(SLOT, 'x');
    expect(await loadCrashSave()).not.toBeNull();
    await clearCrashSave();
    expect(await loadCrashSave()).toBeNull();
    expect(await AsyncStorage.getItem(CRASH_SAVE_KEY)).toBeNull();
  });

  it('loadCrashSave returns null on a garbage buffer instead of throwing', async () => {
    await AsyncStorage.setItem(CRASH_SAVE_KEY, 'not json {');
    await expect(loadCrashSave()).resolves.toBeNull();
  });

  it('capture functions never throw even if AsyncStorage rejects', async () => {
    // mockImplementationOnce auto-reverts to the mock's default impl after one
    // call — no spyOn/mockRestore (which doesn't restore the async-storage mock
    // cleanly, since getItem is already a jest.fn, and would leak undefined into
    // the next test).
    // OTA-1035 — suite-scoped spy over the plain shared mock (calls through after the once).
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => Promise.reject(new Error('boom')));
    await expect(captureActiveCrashSave('x')).resolves.toBeUndefined();
  });
});

describe('crashSave — export format', () => {
  it('parseable save → HIGHLIGHTS + SAVE envelope', async () => {
    await AsyncStorage.setItem(slotSaveKey(SLOT), validSaveBytes());
    await captureCrashSaveFromDisk(SLOT, 'slot-load-native-crash');
    const out = buildCrashSaveExport((await loadCrashSave())!, 'DEVICE');
    expect(out).toMatch(/CRASHED SAVE \(captured at crash time/);
    expect(out).toMatch(/raw parsed OK/);
    expect(out).toMatch(/=== TARTARIA SAVE · \d+ CHARS · BEGIN ===/);
    expect(out).toContain('Verbal');
    expect(out).toContain('DEVICE');
  });

  it('corrupt save → PARSE FAILED marker with raw bytes verbatim', async () => {
    const corrupt = '{"player": <<<corrupt';
    await AsyncStorage.setItem(slotSaveKey(SLOT), corrupt);
    await captureCrashSaveFromDisk(SLOT, 'slot-load-native-crash');
    const out = buildCrashSaveExport((await loadCrashSave())!, 'DEVICE');
    expect(out).toMatch(/RAW PARSE FAILED/);
    expect(out).toContain(corrupt);
  });
});
