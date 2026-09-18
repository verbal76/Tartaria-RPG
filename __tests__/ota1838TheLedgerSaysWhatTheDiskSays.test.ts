/* ⚠⚠⚠ OTA-1838 — THE LEDGER SAID IT HAD WRITTEN WHAT IT HAD NOT.
 *
 * `fallenLedgerStore.persist()` retried a failed disk write three times, for the
 * reason OTA-994 gave: one lost write and a corpse you already put down rises
 * again next launch. It never said what happened when all three failed. The loop
 * simply ran out and the function returned normally, so a `Promise<void>` that
 * means "written" and a `Promise<void>` that means "not written, and never will
 * be" were the same value.
 *
 * ⚠⚠ AND THE CACHE WAS ALREADY MOVED BEFORE THE FIRST ATTEMPT. `LEDGER_CACHE = l`
 * is the first statement in the function, so memory committed unconditionally
 * and disk was asked afterwards. That is the whole defect in one line: the two
 * halves could disagree and only the honest half — disk — was allowed to fail.
 *
 * What a player got from that, on a phone whose storage was full:
 *
 *   IMPORT   "3 joined your wastes" — and on the next launch, nobody did.
 *   REST     the roll of the Hollowed "closes", the news "will find their
 *            house", the corpse leaves the spawn pool — and on the next launch
 *            the corpse is back, unrested, with no receipt to send home.
 *
 * ⚠ THIS SUITE IS THE REPRODUCTION AND THE GUARD IN ONE. Every claim below was
 * written against the UNREPAIRED store and run there first; the ones marked ⚠
 * were red, and they were red in exactly the way the owner's brief predicted.
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

/** The mock's own setItem, captured before anything spies on it. */
const realSetItem = AsyncStorage.setItem.bind(AsyncStorage);

/** Break the LEDGER write — and only that key — for the first `n` attempts.
 *  `Infinity` breaks it for good, which is the terminal case the defect is
 *  about. Returns a live counter so a test can assert HOW MANY times the store
 *  actually reached for the disk. */
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

afterEach(() => { jest.restoreAllMocks(); });

/** What is ACTUALLY on disk, read past every cache. */
async function onDisk(): Promise<{ fallen: unknown[]; rests: unknown[] } | null> {
  const raw = await AsyncStorage.getItem(LEDGER_KEY);
  if (!raw) return null;
  const d = JSON.parse(raw) as { fallen?: unknown[]; rests?: unknown[] };
  return { fallen: d.fallen ?? [], rests: d.rests ?? [] };
}

/** A cold restart: throw the cache away and let the store read canonical state
 *  off disk, exactly as the next launch would. */
async function coldReload() {
  _setLedgerForTests(null);
  return loadLedger();
}

const DEAD = {
  name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96,
};

/** Phone A buries someone and hands over a payload; the returned string is a
 *  real export, built by the real exporter, not a hand-rolled guess. */
async function payloadFromHouseA(ts = 1_760_000_000_000): Promise<string> {
  await AsyncStorage.clear();
  _setIdentityForTests('inst-A', 'Sasmooch');
  _setLedgerForTests({ foreign: [], rests: [] });
  _setPairedForTests([]);
  await recordFallen({ ...DEAD, ts } as never);
  return buildExportPayload();
}

/** …and phone B, which rides with A and holds an empty roll. */
async function asHouseB(): Promise<void> {
  await AsyncStorage.clear();
  _setIdentityForTests('inst-B', 'Brannoch');
  _setLedgerForTests({ foreign: [], rests: [] });
  _setPairedForTests([{ player: 'house_A', installId: 'inst-A', addedTs: 1 }]);
}

const restFor = (f: ForeignFallen): RestRecord => ({
  fallenKey: fallenKey(f),
  fallenName: f.name,
  fallenOriginPlayer: f.origin.player,
  byPlayer: 'Brannoch',
  byInstallId: 'inst-B',
  byCharacter: 'Stellan',
  whereRested: 'the Ashen Steps',
  ts: 1_760_000_100_000,
  description: 'Put down at the water line.',
});

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1838 §1 — the ordinary path is exactly what it was', () => {
  it('1.1 a healthy import reaches the disk and reports what it wrote', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    const out = await importPayloadText(payload);
    expect(out.added).toBe(1);
    const disk = await onDisk();
    expect(disk?.fallen).toHaveLength(1);
    // and a cold restart agrees with it
    const reloaded = await coldReload();
    expect(reloaded.foreign).toHaveLength(1);
  });

  it('1.2 a healthy rest reaches the disk, and the corpse leaves the pool', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    await importPayloadText(payload);
    const corpse = (await loadLedger()).foreign[0]!;
    expect(foreignPool()).toHaveLength(1);
    await recordRest(restFor(corpse));
    expect(foreignPool()).toHaveLength(0);
    const disk = await onDisk();
    expect(disk?.rests).toHaveLength(1);
    expect(disk?.fallen).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1838 §2 — a terminal durable failure is visible', () => {
  it('2.1 ⚠ THE DEFECT: every attempt fails, and the import REJECTS', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    breakLedgerWrites(Infinity);
    await expect(importPayloadText(payload)).rejects.toBeDefined();
  });

  it('2.2 the retries stay bounded — three reaches for the disk, then it stops', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    const w = breakLedgerWrites(Infinity);
    await importPayloadText(payload).catch(() => undefined);
    expect(w.attempts).toBe(3);
  });

  it('2.3 ⚠ the failure says it was the DISK — not "that paste was not a ledger"', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    breakLedgerWrites(Infinity);
    const err = await importPayloadText(payload).then(() => null, (e: unknown) => e);
    expect(err).not.toBeNull();
    expect(isFallenPersistError(err)).toBe(true);
    // a genuinely unreadable paste is a DIFFERENT failure and must not be confused
    jest.restoreAllMocks();
    await asHouseB();
    const junk = await importPayloadText('not a ledger at all').catch((e: unknown) => e);
    expect(isFallenPersistError(junk)).toBe(false);
  });

  it('2.4 ⚠ nothing reached the disk, so no receipt may claim it did', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    breakLedgerWrites(Infinity);
    await importPayloadText(payload).catch(() => undefined);
    const disk = await onDisk();
    expect(disk === null || disk.fallen.length === 0).toBe(true);
  });

  it('2.5 ⚠⚠ MEMORY DOES NOT CLAIM WHAT THE DISK DOES NOT HAVE', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    breakLedgerWrites(Infinity);
    await importPayloadText(payload).catch(() => undefined);
    // the cache must not be sitting on an import that was never committed
    expect((await loadLedger()).foreign).toHaveLength(0);
    expect(foreignPool()).toHaveLength(0);
  });

  it('2.6 ⚠ and the next launch agrees — memory and disk tell one story', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    breakLedgerWrites(Infinity);
    await importPayloadText(payload).catch(() => undefined);
    const live = (await loadLedger()).foreign.length;
    jest.restoreAllMocks();
    const cold = (await coldReload()).foreign.length;
    expect(live).toBe(cold);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1838 §3 — the retry still recovers, and recovers exactly once', () => {
  it('3.1 first attempt fails, the second lands: one success, one record', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    const w = breakLedgerWrites(1);
    const out = await importPayloadText(payload);
    expect(out.added).toBe(1);
    expect(w.attempts).toBe(2);
    expect((await onDisk())?.fallen).toHaveLength(1);
  });

  it('3.2 two failures then a success is still ONE record, not three', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    breakLedgerWrites(2);
    await importPayloadText(payload);
    expect((await onDisk())?.fallen).toHaveLength(1);
    expect((await coldReload()).foreign).toHaveLength(1);
  });

  it('3.3 ⚠ the same paste can be taken again once the disk recovers', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    breakLedgerWrites(Infinity);
    await importPayloadText(payload).catch(() => undefined);
    jest.restoreAllMocks();
    // the dedupe must not have been left holding a record that never landed
    const second = await importPayloadText(payload);
    expect(second.added).toBe(1);
    expect((await onDisk())?.fallen).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1838 §4 — the rest, which is the one OTA-994 was about', () => {
  it('4.1 ⚠ a terminal failure rejects instead of reporting a closed roll', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    await importPayloadText(payload);
    const corpse = (await loadLedger()).foreign[0]!;
    breakLedgerWrites(Infinity);
    await expect(recordRest(restFor(corpse))).rejects.toBeDefined();
  });

  it('4.2 ⚠⚠ THE CORPSE IS STILL STANDING — it was never actually put down', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    await importPayloadText(payload);
    const corpse = (await loadLedger()).foreign[0]!;
    breakLedgerWrites(Infinity);
    await recordRest(restFor(corpse)).catch(() => undefined);
    // memory must agree with the disk, which still holds an unrested corpse
    expect((await loadLedger()).foreign).toHaveLength(1);
    expect(foreignPool()).toHaveLength(1);
    expect((await onDisk())?.rests).toHaveLength(0);
  });

  it('4.3 ⚠ no receipt exists to travel home for a rest that never committed', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    await importPayloadText(payload);
    const corpse = (await loadLedger()).foreign[0]!;
    breakLedgerWrites(Infinity);
    await recordRest(restFor(corpse)).catch(() => undefined);
    expect((await loadLedger()).rests).toHaveLength(0);
    jest.restoreAllMocks();
    expect((await coldReload()).rests).toHaveLength(0);
  });

  it('4.4 ⚠ and it can be put down again once the disk recovers — exactly once', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    await importPayloadText(payload);
    const corpse = (await loadLedger()).foreign[0]!;
    breakLedgerWrites(Infinity);
    await recordRest(restFor(corpse)).catch(() => undefined);
    jest.restoreAllMocks();
    await recordRest(restFor(corpse));
    expect((await onDisk())?.rests).toHaveLength(1);
    expect(foreignPool()).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1838 §5 — one failure does not poison what comes after', () => {
  it('5.1 the next healthy write succeeds normally', async () => {
    const payload = await payloadFromHouseA();
    await asHouseB();
    breakLedgerWrites(Infinity);
    await importPayloadText(payload).catch(() => undefined);
    jest.restoreAllMocks();
    const out = await importPayloadText(payload);
    expect(out.added).toBe(1);
    expect((await onDisk())?.fallen).toHaveLength(1);
  });

  it('5.2 ⚠⚠ A FAILURE NEVER EMPTIES A LEDGER THAT ALREADY HAD DEAD IN IT', async () => {
    // ⚠ The rollback must put back what was THERE, not wipe the roll. A repair
    // that "reconciled" a failure by clearing the cache — or by invalidating it
    // and letting a later write flush an empty ledger over a full one — would be
    // worse than the defect it fixed. Both payloads are built BEFORE phone B is
    // set up, because building one clears storage.
    const first = await payloadFromHouseA(1_760_000_000_000);
    const second = await payloadFromHouseA(1_760_000_500_000);
    await asHouseB();
    await importPayloadText(first);
    expect((await loadLedger()).foreign).toHaveLength(1);
    breakLedgerWrites(Infinity);
    await expect(importPayloadText(second)).rejects.toBeDefined();
    // the dead who were already home are still home, in memory AND on disk
    expect((await loadLedger()).foreign).toHaveLength(1);
    expect((await onDisk())?.fallen).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1838 §6 — the three callers, and what each of them now says', () => {
  const STORE = codeOnly(src('app', 'engine', 'fallenLedgerStore.ts'));

  it('6.1 the store throws rather than falling off the end of its retry loop', () => {
    expect(STORE).toMatch(/throw new FallenPersistError/);
    // and the cache is captured before it is moved, so it can be put back
    expect(STORE).toMatch(/const previous = LEDGER_CACHE/);
  });

  it('6.2 ⚠ the import screen tells the player it was the DISK, not their paste', () => {
    const UI = codeOnly(src('app', 'components', 'LoreCodexBody.tsx'));
    expect(UI).toMatch(/isFallenPersistError/);
    // the old single message is no longer the only answer that catch can give
    const cat = /catch \([\s\S]{0,400}?That paste was not a ledger/.exec(UI)?.[0] ?? '';
    expect(cat).toMatch(/isFallenPersistError/);
  });

  it('6.3 ⚠ the closure path tells the player when the roll did NOT close', () => {
    const STOREJS = codeOnly(src('app', 'state', 'gameStore.ts'));
    const at = STOREJS.indexOf('recordRest({');
    expect(at).toBeGreaterThan(-1);
    const seg = STOREJS.slice(at, at + 2000);
    expect(seg).toMatch(/\.catch\(\(\) => \{[^}]*appendLog/);
  });

  it('6.4 the mailbox counts a refused write as a FAILED pull, never a pulled one', () => {
    const MB = codeOnly(src('app', 'engine', 'fallenMailbox.ts'));
    const at = MB.indexOf('importPayloadText(text)');
    expect(at).toBeGreaterThan(-1);
    // the pull counter is only reached if the import resolved
    expect(MB.slice(at, at + 200)).toMatch(/pulled \+= 1[\s\S]*catch[\s\S]*failed \+= 1/);
  });
});
