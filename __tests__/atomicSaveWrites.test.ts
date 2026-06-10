import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveSlot,
  loadSlot,
  deleteSlot,
  getLastSaveWriteError,
  clearLastSaveWriteError,
  consumeSaveReclaimedFlag,
  slotSaveKey,
} from '../app/engine/saveSystem';
import type { SaveState } from '../app/engine/types';

// OTA-344 — atomic save writes. A save must be all-or-nothing: an interrupted
// write (crash / OS kill / OTA reload mid-write — the OTA-338 brick) can never
// leave the only copy truncated. The contract:
//   - normal save round-trips;
//   - a corrupt LIVE key falls back to the previous good save (.bak) and heals;
//   - a failed verify leaves the live save untouched and records the error
//     WITHOUT throwing (callers fire-and-forget persist()).

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const SLOT = 'slot_atomic_1';

function mkState(name: string): SaveState {
  return {
    version: 1,
    savedAt: 0,
    player: {
      name, raceId: 'mud_dweller', factionId: 'forgotten_order',
      hp: 30, hpMax: 30, currentLocationId: 'camp',
    } as never,
    worldMemory: { tag: name } as never,
    gameLog: [],
    currentScreen: 'exploration',
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  clearLastSaveWriteError();
});

describe('atomic saveSlot — happy path', () => {
  it('saves and loads back the exact state', async () => {
    await saveSlot(SLOT, mkState('Verbal'));
    const loaded = await loadSlot(SLOT);
    expect(loaded?.player?.name).toBe('Verbal');
    expect(getLastSaveWriteError()).toBeNull();
  });

  it('leaves no temp key behind after a successful write', async () => {
    await saveSlot(SLOT, mkState('Verbal'));
    expect(await AsyncStorage.getItem(`${slotSaveKey(SLOT)}.tmp`)).toBeNull();
  });

  it('keeps the PREVIOUS save as a backup after a second save', async () => {
    await saveSlot(SLOT, mkState('Aldric'));   // live = Aldric
    await saveSlot(SLOT, mkState('Verbal'));    // bak = Aldric, live = Verbal
    const bakRaw = await AsyncStorage.getItem(`${slotSaveKey(SLOT)}.bak`);
    expect(bakRaw).not.toBeNull();
    expect((JSON.parse(bakRaw!) as SaveState).player?.name).toBe('Aldric');
  });
});

describe('atomic loadSlot — corruption recovery', () => {
  it('recovers the previous save from .bak when the live key is corrupt', async () => {
    await saveSlot(SLOT, mkState('Aldric'));   // live = Aldric
    await saveSlot(SLOT, mkState('Verbal'));    // bak = Aldric, live = Verbal
    // Simulate an interrupted swap: the live key is left truncated/garbage.
    await AsyncStorage.setItem(slotSaveKey(SLOT), '{"player":{"name":"Verb  <<TRUNCATED');

    const loaded = await loadSlot(SLOT);
    expect(loaded?.player?.name).toBe('Aldric'); // fell back to the previous good save

    // ...and HEALED the live key from the backup so the next read is clean.
    const healed = await AsyncStorage.getItem(slotSaveKey(SLOT));
    expect((JSON.parse(healed!) as SaveState).player?.name).toBe('Aldric');
  });

  it('returns null only when both live and backup are gone', async () => {
    expect(await loadSlot('nonexistent')).toBeNull();
  });
});

describe('atomic saveSlot — failure leaves the live save intact, never throws', () => {
  it('a failed verify records the error and does NOT touch the live save', async () => {
    await saveSlot(SLOT, mkState('Aldric')); // good live save exists
    clearLastSaveWriteError();

    // Make the verify read-back return the WRONG bytes on BOTH stage attempts
    // (the initial stage AND the OTA-406 post-reclaim retry) — a persistent
    // truncated/quota-capped staged write, so the save genuinely can't land.
    (AsyncStorage.getItem as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve('garbage-not-the-payload'))
      .mockImplementationOnce(() => Promise.resolve('garbage-not-the-payload'));

    await expect(saveSlot(SLOT, mkState('Verbal'))).resolves.toBeUndefined(); // never throws
    expect(getLastSaveWriteError()).toMatch(/verify/i);

    // The live save is still the prior good one — the failed save was a no-op.
    const loaded = await loadSlot(SLOT);
    expect(loaded?.player?.name).toBe('Aldric');
  });

  it('a PERSISTENTLY rejecting setItem is swallowed (no unhandled rejection from persist)', async () => {
    // Both stage attempts reject — the initial stage AND the post-reclaim retry
    // (OTA-406) — so the save can never land. saveSlot must still resolve
    // (never throw) and record the error. Two one-shot rejections cover both
    // setItem stage calls, then the default mock impl is preserved for the
    // next test.
    (AsyncStorage.setItem as jest.Mock)
      .mockImplementationOnce(() => Promise.reject(new Error('quota')))
      .mockImplementationOnce(() => Promise.reject(new Error('quota')));
    await expect(saveSlot(SLOT, mkState('Verbal'))).resolves.toBeUndefined();
    expect(getLastSaveWriteError()).toMatch(/verify|quota/i);
  });
});

describe('OTA-406 — storage-full self-heal: purge the copy-log + retry', () => {
  const logKey = (slot: string) => `tartaria.gamelog.${slot}.v2`;

  it('frees space by removing the on-disk copy-log, then the save lands', async () => {
    // The pre-398 unbounded copy-log that stuffed the DB.
    await AsyncStorage.setItem(logKey(SLOT), 'x'.repeat(5000));
    clearLastSaveWriteError();
    consumeSaveReclaimedFlag(); // clear any leftover flag from a prior test

    // The FIRST setItem (staging to the temp key) rejects as if the DB were
    // full; every subsequent setItem uses the default mock (stores normally) —
    // mirroring the removeItem having freed enough space for the retry.
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('database or disk is full')),
    );

    await saveSlot(SLOT, mkState('Rescued'));

    // The regenerable copy-log was purged to reclaim space…
    expect(await AsyncStorage.getItem(logKey(SLOT))).toBeNull();
    // …and the player's save actually landed despite the first full-DB failure.
    const loaded = await loadSlot(SLOT);
    expect(loaded?.player?.name).toBe('Rescued');
    expect(getLastSaveWriteError()).toBeNull();
    // The recovery flag is raised so persist() can tell the player.
    expect(consumeSaveReclaimedFlag()).toBe(true);
  });
});

describe('deleteSlot — clears every atomic key', () => {
  it('removes live, temp, and backup keys', async () => {
    await saveSlot(SLOT, mkState('Aldric'));
    await saveSlot(SLOT, mkState('Verbal')); // creates .bak
    await deleteSlot(SLOT);
    expect(await AsyncStorage.getItem(slotSaveKey(SLOT))).toBeNull();
    expect(await AsyncStorage.getItem(`${slotSaveKey(SLOT)}.tmp`)).toBeNull();
    expect(await AsyncStorage.getItem(`${slotSaveKey(SLOT)}.bak`)).toBeNull();
  });
});
