// OTA-1841 / #157 — CAN ONE INSTALL POSSESS MORE THAN ONE IDENTITY?
//
// ⚠ These began as MEASUREMENT, not repair, and the measurement is why the
// repair exists: A.1 and A.2 below were written against unmodified production
// source and went red with no instrumentation at all — sixteen concurrent cold
// callers, sixteen distinct install ids. The adjacent finding recorded by OTA-1840 was that
// `cachedInstallId()` carries the same "unhydrated is not empty" SHAPE as the
// three faults that OTA closed — but shape is not a defect. The question this
// file exists to answer, with evidence:
//
//   «Can concurrent cold callers cause one Tartaria installation to
//    temporarily or durably possess more than one install identity?»
//
// The install id is not cosmetic. It keys Fallen pairing identity: it is the
// address the mailbox pushes this house's dead to (fallenMailbox boxUrl), the
// `byInstallId` stamped on every rest record (gameStore), and the field
// `isPairedHouse()` matches a foreign payload's origin against. Two ids for one
// install is therefore an identity-integrity question, not a tidiness one.
//
// ⚠ These tests run against UNMODIFIED production source. Nothing here reaches
// into the module to create a window that production does not already have.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ensureInstallId,
  cachedInstallId,
  _setIdentityForTests,
} from '../app/engine/fallenLedgerStore';

const INSTALL_KEY = 'tartaria.fallen.installId.v1';

/** A true cold start: disk empty, module cache cleared exactly as a process
 *  restart clears it. `_setIdentityForTests(null, null)` is the production
 *  module's own reset seam, not a back door opened for this test. */
async function coldAndEmpty(): Promise<void> {
  await AsyncStorage.clear();
  _setIdentityForTests(null, null);
}

/** Memory-only reset — the disk survives, as it does across a real restart. */
function restartProcessKeepingDisk(): void {
  _setIdentityForTests(null, null);
}

beforeEach(async () => {
  await coldAndEmpty();
});

// ───────────────────────────────────────────────────────────────────────────
describe('#157 §A — INV-A: one cold generation', () => {
  it('A.1 ⚠⚠⚠ two concurrent cold callers, no instrumentation at all', async () => {
    // The plainest possible statement of the question. If this diverges, the
    // race is not a theoretical interleaving that needs coaxing — it is what
    // the ordinary scheduler already does.
    const [a, b] = await Promise.all([ensureInstallId(), ensureInstallId()]);
    expect(a).toBe(b);
  });

  it('A.2 a burst of 16 concurrent cold callers collapses to one id', async () => {
    const ids = await Promise.all(Array.from({ length: 16 }, () => ensureInstallId()));
    expect(new Set(ids).size).toBe(1);
  });

  it('A.3 ⚠ deterministic barrier — the race cannot hide behind lucky scheduling', async () => {
    // Hold every caller inside the cold path (suspended on the disk read) until
    // all of them have entered it, then release together. This does not widen
    // the window; it only removes the possibility that a green result came from
    // the scheduler happening to serialise the calls.
    const real = AsyncStorage.getItem.bind(AsyncStorage);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let entered = 0;
    (AsyncStorage as unknown as { getItem: typeof AsyncStorage.getItem }).getItem =
      (async (k: string) => {
        if (k === INSTALL_KEY) { entered += 1; await gate; }
        return real(k);
      }) as typeof AsyncStorage.getItem;
    try {
      const running = Promise.all([ensureInstallId(), ensureInstallId(), ensureInstallId()]);
      // Prove genuine overlap rather than asserting a call count: while the disk
      // read is held, NONE of the three may have finished. If the runtime had
      // quietly serialised them, the first would have settled by now.
      const settledEarly = await Promise.race([
        running.then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 10)),
      ]);
      expect(settledEarly).toBe(false);   // all three still in flight, together
      expect(entered).toBeGreaterThanOrEqual(1);  // the barrier really engaged
      release();
      const ids = await running;
      expect(new Set(ids).size).toBe(1);
      // ⚠ `entered` is diagnostic, not an invariant: it was 3 before the repair
      // (three independent cold paths) and is 1 after (one shared). Asserting
      // the number would pin the implementation rather than the guarantee.
    } finally {
      (AsyncStorage as unknown as { getItem: typeof AsyncStorage.getItem }).getItem = real;
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#157 §B — INV-B: the returned id is the durable id', () => {
  it('B.1 ⚠⚠ every caller receives the id that actually reached disk', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => ensureInstallId()));
    const onDisk = await AsyncStorage.getItem(INSTALL_KEY);
    expect(onDisk).toBeTruthy();
    for (const id of ids) expect(id).toBe(onDisk);
  });

  it('B.2 no caller is handed an id that never became durable', async () => {
    const ids = await Promise.all([ensureInstallId(), ensureInstallId()]);
    const onDisk = await AsyncStorage.getItem(INSTALL_KEY);
    const orphaned = ids.filter((i) => i !== onDisk);
    expect(orphaned).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#157 §C — INV-C: restart stability', () => {
  it('C.1 the id survives a cold restart unchanged', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => ensureInstallId()));
    restartProcessKeepingDisk();
    const reloaded = await ensureInstallId();
    for (const id of ids) expect(reloaded).toBe(id);
  });

  it('C.2 a preexisting id on disk is never replaced by a concurrent burst', async () => {
    await AsyncStorage.setItem(INSTALL_KEY, 'inst_alreadyMine');
    restartProcessKeepingDisk();
    const ids = await Promise.all(Array.from({ length: 8 }, () => ensureInstallId()));
    expect(new Set(ids)).toEqual(new Set(['inst_alreadyMine']));
    expect(await AsyncStorage.getItem(INSTALL_KEY)).toBe('inst_alreadyMine');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#157 §D — INV-D: the production call paths', () => {
  it('D.1 ⚠ the sync reader and the async reader agree on one identity', async () => {
    // This is the real shape: gameStore stamps a rest record with
    // `cachedInstallId()` (sync, cannot await) while fallenMailbox addresses the
    // push with `await ensureInstallId()`. If those two disagree, this house's
    // dead are filed under one id and delivered under another.
    cachedInstallId();                       // the spawner-shaped cold touch
    const viaAsync = await ensureInstallId();
    await new Promise((r) => setTimeout(r, 10));
    const viaSync = cachedInstallId();
    expect(viaSync).toBe(viaAsync);
    expect(viaSync).toBe(await AsyncStorage.getItem(INSTALL_KEY));
  });

  it('D.2 a sync touch racing an async caller does not fork the identity', async () => {
    const running = ensureInstallId();
    cachedInstallId();                       // lands while the first is in flight
    const viaAsync = await running;
    await new Promise((r) => setTimeout(r, 10));
    expect(cachedInstallId()).toBe(viaAsync);
    expect(await AsyncStorage.getItem(INSTALL_KEY)).toBe(viaAsync);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#157 §F — a failed start must not poison every later attempt', () => {
  it('F.1 a disk that refuses everything still yields ONE id to a whole burst', async () => {
    const realGet = AsyncStorage.getItem.bind(AsyncStorage);
    const realSet = AsyncStorage.setItem.bind(AsyncStorage);
    (AsyncStorage as unknown as { getItem: unknown }).getItem =
      async () => { throw new Error('disk refused the read'); };
    (AsyncStorage as unknown as { setItem: unknown }).setItem =
      async () => { throw new Error('disk refused the write'); };
    try {
      const ids = await Promise.all(Array.from({ length: 8 }, () => ensureInstallId()));
      expect(new Set(ids).size).toBe(1);   // memory-only, but ONE identity
    } finally {
      (AsyncStorage as unknown as { getItem: unknown }).getItem = realGet;
      (AsyncStorage as unknown as { setItem: unknown }).setItem = realSet;
    }
  });

  it('F.2 ⚠ after a refused start, a later cold start is not blocked by a stale promise', async () => {
    const realGet = AsyncStorage.getItem.bind(AsyncStorage);
    (AsyncStorage as unknown as { getItem: unknown }).getItem =
      async () => { throw new Error('disk refused the read'); };
    try { await ensureInstallId(); } finally {
      (AsyncStorage as unknown as { getItem: unknown }).getItem = realGet;
    }
    // The in-flight slot must have been released on settle. A fresh cold start
    // with a working disk has to reach the disk again rather than be handed a
    // leftover promise from the failed episode.
    await coldAndEmpty();
    await AsyncStorage.setItem(INSTALL_KEY, 'inst_afterTheFailure');
    const ids = await Promise.all([ensureInstallId(), ensureInstallId()]);
    expect(new Set(ids)).toEqual(new Set(['inst_afterTheFailure']));
  });

  it('F.3 the in-flight slot is released on success, so later bursts still work', async () => {
    const first = await Promise.all([ensureInstallId(), ensureInstallId()]);
    const second = await Promise.all([ensureInstallId(), ensureInstallId()]);
    expect(new Set([...first, ...second]).size).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#157 §E — the warm path is not in question', () => {
  it('E.1 an already-warm cache answers without touching the disk', async () => {
    _setIdentityForTests('inst_warm', null);
    let reads = 0;
    const real = AsyncStorage.getItem.bind(AsyncStorage);
    (AsyncStorage as unknown as { getItem: typeof AsyncStorage.getItem }).getItem =
      (async (k: string) => { if (k === INSTALL_KEY) reads += 1; return real(k); }) as typeof AsyncStorage.getItem;
    try {
      expect(await ensureInstallId()).toBe('inst_warm');
      expect(cachedInstallId()).toBe('inst_warm');
      expect(reads).toBe(0);
    } finally {
      (AsyncStorage as unknown as { getItem: typeof AsyncStorage.getItem }).getItem = real;
    }
  });
});
