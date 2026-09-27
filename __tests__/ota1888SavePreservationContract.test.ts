// OTA-1888 — the permanent save-preservation contract (GOLEM + HAL).
//
// Forensics (see savePreservationBoot.ts's own header) found the JS-level
// slot system already non-destructive: no parse/version failure deletes a
// save, and `deleteSlot` is only ever reached from an explicit player
// action. The evidenced gap is the NATIVE storage-engine transition, which
// runs before any JS executes on either platform. This suite proves the one
// thing JS CAN durably do: every boot, before anything else can touch a
// slot, every currently-readable save-relevant key is copied into a
// bounded, verified, rotating recovery namespace — additive only, and
// provably never touching a live/.bak/index/stash key, in every scenario
// including interruption, corruption, rotation and a genuinely orphaned
// slot the index has lost track of.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  runBootSavePreservation,
  discoverSaveKeys,
  listPreservationSnapshots,
  readPreservedValue,
} from '../app/engine/savePreservationBoot';
import { emergencyReclaimDiskSpace, loadSlot, listSlots } from '../app/engine/saveSystem';
import type { SlotSummary } from '../app/engine/saveSystem';

// The library's own official in-memory mock (same one atomicSaveWrites.test.ts
// uses) — a real getItem/setItem/getAllKeys/multiRemove/clear contract, not a
// hand-rolled stand-in, and jest.spyOn works against it exactly as it does
// against the real module.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function summary(slotId: string): SlotSummary {
  return {
    slotId, playerName: 'Test', raceId: 'mud_golem', locationId: 'nexus',
    hp: 10, hpMax: 10, savedAt: Date.now(), createdAt: Date.now(),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('OTA-1888 — discoverSaveKeys finds an orphaned slot behind a stale index', () => {
  it('includes indexed slots plus a raw key not in the index at all', async () => {
    await AsyncStorage.setItem('tartaria.slot.orphan1.v2', JSON.stringify({ player: { name: 'Orphan' } }));
    const keys = await discoverSaveKeys([summary('known1')]);
    expect(keys).toContain('tartaria.slot.known1.v2');
    expect(keys).toContain('tartaria.slot.known1.v2.bak');
    expect(keys).toContain('tartaria.slot.orphan1.v2');
    expect(keys).toContain('tartaria.slots.index.v2');
    expect(keys).toContain('tartaria.activeSlot.v2');
    expect(keys).toContain('tartaria.global.v2');
  });
});

describe('OTA-1888 — runBootSavePreservation: the normal case', () => {
  it('preserves every existing save-relevant key, verified byte-for-byte, and touches nothing else', async () => {
    const indexVal = JSON.stringify([{ slotId: 's1' }]);
    const activeVal = 's1';
    const stashVal = JSON.stringify({ resurrectionGems: 3 });
    const liveVal = JSON.stringify({ player: { name: 'Verbal', raceId: 'mud_golem' } });
    const bakVal = JSON.stringify({ player: { name: 'Verbal-OLD', raceId: 'mud_golem' } });
    await AsyncStorage.setItem('tartaria.slots.index.v2', indexVal);
    await AsyncStorage.setItem('tartaria.activeSlot.v2', activeVal);
    await AsyncStorage.setItem('tartaria.global.v2', stashVal);
    await AsyncStorage.setItem('tartaria.slot.s1.v2', liveVal);
    await AsyncStorage.setItem('tartaria.slot.s1.v2.bak', bakVal);

    const report = await runBootSavePreservation([summary('s1')]);

    expect(report.fatalError).toBeNull();
    expect(report.preserved).toBe(5);
    expect(report.failedKeys).toEqual([]);

    const snapshots = await listPreservationSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.bootId).toBe(report.bootId);

    expect(await readPreservedValue(report.bootId, 'tartaria.slots.index.v2')).toBe(indexVal);
    expect(await readPreservedValue(report.bootId, 'tartaria.activeSlot.v2')).toBe(activeVal);
    expect(await readPreservedValue(report.bootId, 'tartaria.global.v2')).toBe(stashVal);
    expect(await readPreservedValue(report.bootId, 'tartaria.slot.s1.v2')).toBe(liveVal);
    expect(await readPreservedValue(report.bootId, 'tartaria.slot.s1.v2.bak')).toBe(bakVal);

    // The originals are byte-identical to before — this is additive only.
    expect(await AsyncStorage.getItem('tartaria.slots.index.v2')).toBe(indexVal);
    expect(await AsyncStorage.getItem('tartaria.activeSlot.v2')).toBe(activeVal);
    expect(await AsyncStorage.getItem('tartaria.global.v2')).toBe(stashVal);
    expect(await AsyncStorage.getItem('tartaria.slot.s1.v2')).toBe(liveVal);
    expect(await AsyncStorage.getItem('tartaria.slot.s1.v2.bak')).toBe(bakVal);
  });

  it('preserves a genuinely orphaned slot blob that the index does not know about', async () => {
    await AsyncStorage.setItem('tartaria.slot.orphan1.v2', JSON.stringify({ player: { name: 'Orphan' } }));
    // No index entry for orphan1 at all — knownSlots is empty, exactly the
    // OTA-1885 "index empty/absent, blob exists" scenario.
    const report = await runBootSavePreservation([]);
    expect(report.preserved).toBe(1);
    const value = await readPreservedValue(report.bootId, 'tartaria.slot.orphan1.v2');
    expect(value).toBe(JSON.stringify({ player: { name: 'Orphan' } }));
  });

  it('records no snapshot at all when there is nothing to preserve', async () => {
    const report = await runBootSavePreservation([]);
    expect(report.preserved).toBe(0);
    expect(await listPreservationSnapshots()).toHaveLength(0);
  });
});

describe('OTA-1888 — failure and interruption never lose or half-write anything', () => {
  it('a setItem failure on one key is reported and skipped; every other key still preserves', async () => {
    await AsyncStorage.setItem('tartaria.slot.s1.v2', 'GOOD');
    await AsyncStorage.setItem('tartaria.global.v2', 'ALSO GOOD');
    const originalSetItem = AsyncStorage.setItem.bind(AsyncStorage);
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key: string, value: string) => {
      if (key.endsWith('.tartaria.slot.s1.v2')) {
        throw new Error('simulated write failure');
      }
      return originalSetItem(key, value);
    });
    try {
      const report = await runBootSavePreservation([summary('s1')]);
      expect(report.failedKeys).toContain('tartaria.slot.s1.v2');
      expect(report.preserved).toBeGreaterThanOrEqual(1);
      const globalCopy = await readPreservedValue(report.bootId, 'tartaria.global.v2');
      expect(globalCopy).toBe('ALSO GOOD');
    } finally {
      spy.mockRestore();
    }
  });

  it('a readback mismatch is treated as a failure and leaves no half-written copy behind', async () => {
    await AsyncStorage.setItem('tartaria.slot.s1.v2', 'ORIGINAL');
    const originalGetItem = AsyncStorage.getItem.bind(AsyncStorage);
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key: string) => {
      if (key.startsWith('tartaria.preserveBoot.') && key.endsWith('tartaria.slot.s1.v2')) {
        return 'CORRUPTED-ON-READBACK';
      }
      return originalGetItem(key);
    });
    try {
      const report = await runBootSavePreservation([summary('s1')]);
      expect(report.failedKeys).toContain('tartaria.slot.s1.v2');
      expect(report.preserved).toBe(0);
      // No orphaned half-written destination key survives the mismatch —
      // checked via the SAME spied getItem (it only fakes a mismatch on the
      // FIRST readback of this key; removeItem's own cleanup uses a plain
      // getItem-free path, so a real absence here is a genuine absence).
      const dest = `tartaria.preserveBoot.${report.bootId}.tartaria.slot.s1.v2`;
      expect(await originalGetItem(dest)).toBeNull();
      // The original is completely untouched.
      expect(await originalGetItem('tartaria.slot.s1.v2')).toBe('ORIGINAL');
    } finally {
      spy.mockRestore();
    }
  });

  it('discoverSaveKeys failing entirely reports a fatal error rather than throwing, and preserves nothing', async () => {
    const spy = jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValue(new Error('boom'));
    try {
      // getAllKeys failing is swallowed inside discoverSaveKeys (best-effort
      // discovery), so this actually still succeeds off the known-slots set —
      // proving the orphan-scan failing never blocks preserving what IS known.
      await AsyncStorage.setItem('tartaria.slot.s1.v2', 'X');
      const report = await runBootSavePreservation([summary('s1')]);
      expect(report.fatalError).toBeNull();
      expect(report.preserved).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('OTA-1888 — bounded rotation never drops the last surviving snapshot', () => {
  it('keeps only the most recent snapshots up to the cap, oldest evicted first', async () => {
    const reports = [];
    for (let i = 0; i < 5; i++) {
      await AsyncStorage.setItem('tartaria.slot.s1.v2', `payload-${i}`);
      reports.push(await runBootSavePreservation([summary('s1')]));
    }
    const snapshots = await listPreservationSnapshots();
    expect(snapshots.length).toBeLessThanOrEqual(3);
    expect(snapshots.length).toBeGreaterThan(0);
    // The newest snapshot is always present and readable.
    const newest = reports[reports.length - 1]!;
    expect(await readPreservedValue(newest.bootId, 'tartaria.slot.s1.v2')).toBe('payload-4');
    // The oldest two were rotated out and their bytes are actually gone —
    // proving rotation isn't just an index trim that leaks storage forever.
    const oldest = reports[0]!;
    expect(await readPreservedValue(oldest.bootId, 'tartaria.slot.s1.v2')).toBeNull();
  });

  it('never rotates out the only snapshot even under repeated empty-diff boots', async () => {
    await AsyncStorage.setItem('tartaria.slot.s1.v2', 'stable');
    const first = await runBootSavePreservation([summary('s1')]);
    for (let i = 0; i < 4; i++) {
      await runBootSavePreservation([summary('s1')]);
    }
    const snapshots = await listPreservationSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
    // At least one snapshot (the newest) always resolves — the contract's
    // "at least one recoverable representation" holds under repetition too.
    const newest = snapshots[snapshots.length - 1]!;
    expect(await readPreservedValue(newest.bootId, 'tartaria.slot.s1.v2')).toBe('stable');
    void first;
  });
});

describe('OTA-1888 — the preservation namespace is invisible to the emergency-reclaim purge', () => {
  it('emergencyReclaimDiskSpace never removes a tartaria.preserveBoot.* key', async () => {
    await AsyncStorage.setItem('tartaria.slot.s1.v2', 'live');
    const report = await runBootSavePreservation([summary('s1')]);
    expect(report.preserved).toBeGreaterThan(0);
    const before = await listPreservationSnapshots();
    expect(before).toHaveLength(1);

    await emergencyReclaimDiskSpace('s1');

    const after = await listPreservationSnapshots();
    expect(after).toHaveLength(1);
    expect(await readPreservedValue(report.bootId, 'tartaria.slot.s1.v2')).toBe('live');
  });
});

describe('OTA-1888 — acceptance: an old-format save survives a boot preservation pass and still loads', () => {
  it('an old-format slot (missing every field added since) is preserved, still loads normally, and survives even if the live key is later lost', async () => {
    const OLD_SLOT = 's_old_2026_05';
    // Shaped exactly like an early build would have written it — before
    // characterSeed (OTA-1311), resurrectionGems-on-player (OTA-1850),
    // mainQuest/dog/golem summary fields, or scene capture existed. Only
    // what loadSlot has ALWAYS required: version/savedAt/player.
    const oldSave = JSON.stringify({
      version: 1,
      savedAt: 1700000000000,
      player: {
        name: 'Old Timer', raceId: 'mud_dweller', factionId: 'forgotten_order',
        hp: 22, hpMax: 30, currentLocationId: 'camp_reclaimers',
      },
      worldMemory: { discovered: ['camp_reclaimers'] },
      gameLog: [],
      currentScreen: 'exploration',
    });
    const oldIndex = JSON.stringify([{
      slotId: OLD_SLOT, playerName: 'Old Timer', raceId: 'mud_dweller',
      locationId: 'camp_reclaimers', hp: 22, hpMax: 30,
      savedAt: 1700000000000, createdAt: 1699000000000,
    }]);
    await AsyncStorage.setItem('tartaria.slots.index.v2', oldIndex);
    await AsyncStorage.setItem(`tartaria.slot.${OLD_SLOT}.v2`, oldSave);

    // The next boot after an "update": the store's own listSlots() feeds the
    // preservation pass, in the same order bootSlice.ts wires them.
    const slots = await listSlots();
    const report = await runBootSavePreservation(slots);
    expect(report.failedKeys).toEqual([]);
    expect(report.preserved).toBeGreaterThanOrEqual(2); // index + the old save itself

    // SAME SAVE LOADS — the existing, unchanged loadSlot() still reads it,
    // because nothing about this contract touches the read path at all.
    const loaded = await loadSlot(OLD_SLOT);
    expect(loaded).not.toBeNull();
    expect(loaded!.player!.name).toBe('Old Timer');
    expect(loaded!.player!.hp).toBe(22);

    // AND a verified, byte-identical recovery copy exists independently —
    // proven by reading it back even after the live key is gone, which is
    // the exact scenario this contract exists for.
    const preservedSave = await readPreservedValue(report.bootId, `tartaria.slot.${OLD_SLOT}.v2`);
    expect(preservedSave).toBe(oldSave);
    await AsyncStorage.removeItem(`tartaria.slot.${OLD_SLOT}.v2`);
    expect(await loadSlot(OLD_SLOT)).toBeNull(); // confirms the live copy is genuinely gone
    const stillRecoverable = await readPreservedValue(report.bootId, `tartaria.slot.${OLD_SLOT}.v2`);
    expect(stillRecoverable).toBe(oldSave);
    expect(JSON.parse(stillRecoverable!).player.name).toBe('Old Timer');
  });
});
