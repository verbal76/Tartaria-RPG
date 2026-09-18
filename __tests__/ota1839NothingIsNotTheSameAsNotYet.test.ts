/* ⚠⚠⚠ OTA-1839 — "NOTHING" AND "NOT YET" WERE THE SAME VALUE, AND THE LEDGER
 * COULD NOT TELL THEM APART.
 *
 * `LEDGER_CACHE` held one of two things: `null`, or a ledger. There was no third
 * state for "we have not looked at the disk yet", so the moment anything needed
 * a ledger synchronously, `cachedLedger()` INVENTED one:
 *
 *     export function cachedLedger(): Ledger {
 *       if (LEDGER_CACHE === null) { LEDGER_CACHE = { ...EMPTY }; void loadLedger(); }
 *       return LEDGER_CACHE;
 *     }
 *
 * and `loadLedger()` began:
 *
 *     if (LEDGER_CACHE) return LEDGER_CACHE;
 *
 * So the empty placeholder a sync reader installed was indistinguishable from a
 * ledger that had been read and was genuinely empty. The `void loadLedger()` on
 * the very next expression could not help: it saw a truthy cache — the one just
 * installed — and returned it without touching the disk.
 *
 * ⚠⚠ THE ONLY SYNCHRONOUS READER IS THE SPAWNER. `foreignPool()` is called from
 * `revenantPool()`, which cannot await. So if the revenant spawner asked before
 * anything else had awaited the ledger, the foreign dead were gone for the whole
 * session — and the disk still had them, which is what made it survivable right
 * up until the moment it wasn't: the next successful `persist()` writes the
 * WHOLE ledger, so the synthetic empty would go over the top of the real one.
 *
 * ⚠ AND THE ONE FUNCTION THAT WOULD HAVE PREVENTED IT WAS NEVER CALLED.
 * `primeLedgerCache()` existed, did exactly the right thing, and had zero
 * callers anywhere in the app. It is deleted here rather than wired up: a repair
 * that depends on somebody remembering to call it at boot is a repair that
 * depends on call ordering, and the cache authority itself is the thing that was
 * wrong.
 *
 * ⚠ WHAT THIS SUITE IS. Every claim was written against the UNREPAIRED store and
 * run there first. The §1 claims were red, including the one that matters most —
 * a valid ledger on disk being erased by a later legitimate write.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  importPayloadText,
  recordRest,
  buildExportPayload,
  loadLedger,
  foreignPool,
  isFallenPersistError,
  _setLedgerForTests,
  _setIdentityForTests,
  _setPairedForTests,
} from '../app/engine/fallenLedgerStore';
import { fallenKey, type ForeignFallen, type RestRecord } from '../app/engine/fallenLedger';
import { recordFallen } from '../app/engine/saveSystem';

jest.setTimeout(60_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const LEDGER_KEY = 'tartaria.fallenLedger.v1';
const realGetItem = AsyncStorage.getItem.bind(AsyncStorage);
const realSetItem = AsyncStorage.setItem.bind(AsyncStorage);

afterEach(() => { jest.restoreAllMocks(); });

/** Count — and optionally slow down — reads of the LEDGER key. */
function watchLedgerReads(delayMs = 0): { reads: number } {
  const state = { reads: 0 };
  jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (k: string) => {
    if (k !== LEDGER_KEY) return realGetItem(k);
    state.reads += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return realGetItem(k);
  });
  return state;
}

/** Break the LEDGER write for the first `n` attempts — the OTA-1838 harness. */
function breakLedgerWrites(n: number): { attempts: number } {
  const state = { attempts: 0 };
  jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (k: string, v: string) => {
    if (k !== LEDGER_KEY) return realSetItem(k, v);
    state.attempts += 1;
    if (state.attempts <= n) throw new Error('database or disk is full');
    return realSetItem(k, v);
  });
  return state;
}

/** What is ACTUALLY on disk, read past every cache. */
async function onDisk(): Promise<{ fallen: unknown[]; rests: unknown[] } | null> {
  const raw = await realGetItem(LEDGER_KEY);
  if (!raw) return null;
  const d = JSON.parse(raw) as { fallen?: unknown[]; rests?: unknown[] };
  return { fallen: d.fallen ?? [], rests: d.rests ?? [] };
}

const DEAD = {
  name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96,
};

async function payloadFromHouseA(ts = 1_760_000_000_000): Promise<string> {
  await AsyncStorage.clear();
  _setIdentityForTests('inst-A', 'Sasmooch');
  _setLedgerForTests({ foreign: [], rests: [] });
  _setPairedForTests([]);
  await recordFallen({ ...DEAD, ts } as never);
  return buildExportPayload();
}

function beHouseB(): void {
  _setIdentityForTests('inst-B', 'Brannoch');
  _setPairedForTests([{ player: 'house_A', installId: 'inst-A', addedTs: 1 }]);
}

/** ⚠ THE FIXTURE THAT MAKES THIS SUITE HONEST. The ledger is put on disk through
 *  the REAL write path, so the bytes are exactly what the store writes — not a
 *  hand-rolled guess that might fail to parse and fake a passing test. Then the
 *  process "restarts": memory is thrown away, the disk is kept. */
async function diskHoldsOneFallen(ts = 1_760_000_000_000): Promise<string> {
  const payload = await payloadFromHouseA(ts);
  await AsyncStorage.clear();
  beHouseB();
  _setLedgerForTests({ foreign: [], rests: [] });
  await importPayloadText(payload);
  expect((await onDisk())?.fallen).toHaveLength(1);   // the fixture, proven
  _setLedgerForTests(null);                            // ← COLD START
  return payload;
}

/** The same, but it also hands back a SECOND house's payload carrying a
 *  DIFFERENT corpse — which is what makes an overwrite visible. Re-importing the
 *  same record would silently put back exactly what the overwrite destroyed, so
 *  a test that does that proves nothing. */
async function diskHoldsFrancisPlusAnotherPayload(): Promise<string> {
  const second = await payloadFromHouseA(1_760_000_500_000);   // Brann-in-waiting
  await diskHoldsOneFallen(1_760_000_000_000);                 // disk: Francis only, cold
  return second;
}

const restFor = (f: ForeignFallen): RestRecord => ({
  fallenKey: fallenKey(f), fallenName: f.name, fallenOriginPlayer: f.origin.player,
  byPlayer: 'Brannoch', byInstallId: 'inst-B', byCharacter: 'Stellan',
  whereRested: 'the Ashen Steps', ts: 1_760_000_100_000, description: 'Put down at the water line.',
});

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1839 §1 — a cold synchronous read cannot poison the ledger', () => {
  it('1.1 ⚠⚠ THE DEFECT: sync read first, and the disk is STILL found afterwards', async () => {
    await diskHoldsOneFallen();
    const sync = foreignPool();                 // the spawner, before anything awaited
    const hydrated = await loadLedger();        // …and then the real load
    expect(hydrated.foreign).toHaveLength(1);   // ← was 0 before the repair
    expect(hydrated.foreign[0]?.name).toBe('Francis');
    expect(Array.isArray(sync)).toBe(true);     // the sync answer itself is allowed to be empty
  });

  it('1.2 the sync reader may answer empty before hydration — that is permitted', async () => {
    await diskHoldsOneFallen();
    expect(foreignPool()).toHaveLength(0);
    // …but it must have ASKED for the disk, not just shrugged
    await loadLedger();
    expect(foreignPool()).toHaveLength(1);
  });

  it('1.3 ⚠ the spawner\'s path self-heals — the dead are not gone for the session', async () => {
    await diskHoldsOneFallen();
    foreignPool();                              // cold touch
    await loadLedger();                         // the hydration it kicked off
    expect(foreignPool()).toHaveLength(1);
  });

  it('1.4 ⚠⚠⚠ THE DATA LOSS: a later IMPORT must not erase the dead already on disk', async () => {
    const second = await diskHoldsFrancisPlusAnotherPayload();
    foreignPool();                              // the spawner touches it cold
    beHouseB();
    // an ordinary later operation — and every one of them writes the WHOLE ledger
    await importPayloadText(second);
    const disk = await onDisk();
    const names = (disk?.fallen as { ts: number }[] ?? []).map((f) => f.ts).sort();
    // both must be there. Before the repair the arriving corpse was merged into
    // the SYNTHETIC EMPTY cache and written over the top of the real ledger, so
    // the disk kept only the newcomer and Francis was gone for good.
    expect(names).toEqual([1_760_000_000_000, 1_760_000_500_000]);
  });

  it('1.5 ⚠⚠⚠ THE DATA LOSS AGAIN, through the rest path this time', async () => {
    await diskHoldsOneFallen();
    foreignPool();                              // poison attempt
    beHouseB();
    // A rest for a corpse this world does not hold is legal — rests merge by
    // union and travel home. It removes nobody from the pool, so the roll must
    // come through untouched. Before the repair it was written as
    // { foreign: [], rests: [one] } over a disk that held Francis.
    await recordRest({ ...restFor({ name: 'Elsewhere', origin: { player: 'H', installId: 'inst-Z' }, ts: 1 } as ForeignFallen) });
    const disk = await onDisk();
    expect(disk?.rests).toHaveLength(1);        // the rest landed
    expect(disk?.fallen).toHaveLength(1);       // ← was 0 before the repair: Francis erased
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1839 §2 — hydration, and an honestly empty ledger', () => {
  it('2.1 an empty disk hydrates to a legitimately empty ledger, as before', async () => {
    await AsyncStorage.clear();
    beHouseB();
    _setLedgerForTests(null);
    const l = await loadLedger();
    expect(l.foreign).toHaveLength(0);
    expect(l.rests).toHaveLength(0);
    expect(foreignPool()).toHaveLength(0);
  });

  it('2.2 async load FIRST, then every synchronous reader sees the hydrated roll', async () => {
    await diskHoldsOneFallen();
    await loadLedger();
    expect(foreignPool()).toHaveLength(1);
  });

  it('2.3 ⚠ a cold restart is UNHYDRATED, not canonically empty — the disk is re-read', async () => {
    await diskHoldsOneFallen();
    await loadLedger();
    const w = watchLedgerReads();
    _setLedgerForTests(null);                   // the next launch
    const again = await loadLedger();
    expect(w.reads).toBe(1);                    // it really went back to the disk
    expect(again.foreign).toHaveLength(1);
  });

  it('2.4 a hydrated ledger is not re-read on every call', async () => {
    await diskHoldsOneFallen();
    await loadLedger();
    const w = watchLedgerReads();
    await loadLedger();
    await loadLedger();
    expect(w.reads).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1839 §3 — two loads from cold are one hydration', () => {
  it('3.1 ⚠ concurrent cold loads share ONE disk read and agree', async () => {
    await diskHoldsOneFallen();
    const w = watchLedgerReads(40);
    const [a, b] = await Promise.all([loadLedger(), loadLedger()]);
    expect(w.reads).toBe(1);                    // ← was 2 before the repair
    expect(a.foreign).toHaveLength(1);
    expect(b.foreign).toHaveLength(1);
    expect(a).toBe(b);                          // the same logical ledger, not two
  });

  it('3.2 ⚠⚠ a mutation that lands while hydration is in flight is NOT overwritten', async () => {
    const payload = await diskHoldsOneFallen();
    watchLedgerReads(40);
    beHouseB();
    const bare = loadLedger();                  // hydration starts
    const mutating = importPayloadText(payload);// joins it, then merges and writes
    await Promise.all([bare, mutating]);
    // the late resolution must not have put the pre-mutation snapshot back
    expect((await loadLedger()).foreign).toHaveLength(1);
    expect((await onDisk())?.fallen).toHaveLength(1);
  });

  it('3.3 the sync reader during an in-flight hydration does not install anything', async () => {
    await diskHoldsOneFallen();
    watchLedgerReads(40);
    const p = loadLedger();
    foreignPool();                              // sync touch mid-flight
    await p;
    expect((await loadLedger()).foreign).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1839 §4 — OTA-1838 is not regressed', () => {
  it('4.1 a terminal write failure still throws a persistence failure', async () => {
    const payload = await diskHoldsOneFallen();
    beHouseB();
    await loadLedger();
    breakLedgerWrites(Infinity);
    const err = await importPayloadText(payload).then(() => null, (e: unknown) => e);
    expect(isFallenPersistError(err)).toBe(true);
  });

  it('4.2 and still rolls the cache back to what was durably there', async () => {
    const payload = await payloadFromHouseA(1_760_000_900_000);
    await AsyncStorage.clear();
    beHouseB();
    _setLedgerForTests({ foreign: [], rests: [] });
    const first = await payloadFromHouseA(1_760_000_000_000);
    await AsyncStorage.clear();
    beHouseB();
    _setLedgerForTests({ foreign: [], rests: [] });
    await importPayloadText(first);
    expect((await loadLedger()).foreign).toHaveLength(1);
    breakLedgerWrites(Infinity);
    await importPayloadText(payload).catch(() => undefined);
    expect((await loadLedger()).foreign).toHaveLength(1);   // the earlier one survives
    expect((await onDisk())?.fallen).toHaveLength(1);
  });

  it('4.3 retry recovery still works — first attempt fails, the second lands', async () => {
    const payload = await diskHoldsOneFallen();
    beHouseB();
    await loadLedger();
    const w = breakLedgerWrites(1);
    await recordRest(restFor((await loadLedger()).foreign[0]!));
    expect(w.attempts).toBe(2);
    expect((await onDisk())?.rests).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1839 §5 — the cache authority itself, read from source', () => {
  const STORE = codeOnly(src('app', 'engine', 'fallenLedgerStore.ts'));

  it('5.1 ⚠ the synchronous reader never assigns the canonical cache', () => {
    const at = STORE.indexOf('export function cachedLedger');
    expect(at).toBeGreaterThan(-1);
    const body = STORE.slice(at, STORE.indexOf('}', STORE.indexOf('{', at) + 1) + 1);
    expect(body).not.toMatch(/LEDGER_CACHE\s*=/);
  });

  it('5.2 ⚠ `null` still means UNHYDRATED, and hydration is serialised', () => {
    expect(STORE).toMatch(/LEDGER_HYDRATION/);
    expect(STORE).toMatch(/let LEDGER_CACHE: Ledger \| null = null/);
  });

  it('5.3 the dead prime entrypoint is gone, not left lying around', () => {
    expect(src('app', 'engine', 'fallenLedgerStore.ts')).not.toMatch(/primeLedgerCache/);
    for (const d of ['screens', 'components', 'engine', 'state']) {
      const dir = join(__dirname, '..', 'app', d);
      for (const f of require('fs').readdirSync(dir) as string[]) {
        if (!/\.tsx?$/.test(f)) continue;
        expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/primeLedgerCache/);
      }
    }
  });

  it('5.4 every persist path still hydrates from disk before it writes', () => {
    // the two mutators are the only callers of persist(), and both await the
    // ledger first — which is what makes a synthetic empty unwritable.
    for (const fn of ['importPayloadText', 'recordRest']) {
      const at = STORE.indexOf(`export async function ${fn}`);
      expect(at).toBeGreaterThan(-1);
      const body = STORE.slice(at, at + 3000);
      const load = body.indexOf('await loadLedger()');
      const write = body.indexOf('await persist(');
      expect(load).toBeGreaterThan(-1);
      expect(write).toBeGreaterThan(load);
    }
  });
});
