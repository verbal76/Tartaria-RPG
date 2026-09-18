/* ⚠⚠⚠ OTA-1840 — THE PAIRING AUTHORITY FORGOT THREE THINGS ACROSS A RESTART,
 * AND ONE OF THEM WAS THE KEY THAT PROVES WHO SENT YOU A CORPSE.
 *
 * Three defects, one authority, one mistake wearing three coats.
 *
 * ⚠⚠ A — THE KEY IS WRITTEN AND THEN THROWN AWAY ON THE WAY BACK IN.
 * `persistPaired()` does `JSON.stringify(list)`, so a house card's sending key
 * reaches the disk intact. `loadPaired()` then RECONSTRUCTS each row:
 *
 *     return [{ player, installId, addedTs: ... }];   // ← `key` is not copied
 *
 * It is a whitelist that forgot a field. Everything still works — you are still
 * paired, the dead still arrive — so nothing looks broken. What is gone is the
 * evidence: `authenticate()` walks the paired list looking for a key that
 * verifies the payload, and after a restart there are no keys to walk. It cannot
 * say "forged", because it holds nothing to check against, so it falls through
 * to `unsealed` and the payload is admitted on the pairing gate alone.
 *
 * ⚠ WHICH MEANS A FORGERY IS ACCEPTED AFTER A COLD START. Not "less verified" —
 * accepted. A payload sealed with a key nobody holds is refused while the app is
 * warm and waved through after a restart. §1.5 is that sentence as a test.
 *
 * ⚠⚠ B and C — THE SAME "UNHYDRATED IS NOT EMPTY" MISTAKE OTA-1839 CLOSED FOR
 * THE LEDGER, on the two fields beside it:
 *
 *     cachedPaired()      installs `PAIRED = []`  → loadPaired() early-returns
 *     cachedHouseName()   installs `HOUSE = ''`   → loadHouseName() early-returns
 *
 * B is the worse of the two: an empty paired list does not mean "no houses", it
 * means EVERY arriving corpse is turned away as "no house you ride with". C
 * sends your dead out stamped `an unnamed house` when you have a name on disk.
 *
 * ⚠ THIS SUITE IS THE REPRODUCTION AND THE GUARD. Every ⚠ claim below was
 * written against the UNREPAIRED store and run there first.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  acceptHouseCode,
  loadPaired,
  cachedPaired,
  myHouseCode,
  loadHouseName,
  cachedHouseName,
  setHouseName,
  buildExportPayload,
  importPayloadText,
  ensureSendingKey,
  _setSendingKeyForTests,
  _setPairedForTests,
  _setIdentityForTests,
  _setLedgerForTests,
} from '../app/engine/fallenLedgerStore';
import { seal } from '../app/engine/fallenSeal';
import { recordFallen } from '../app/engine/saveSystem';

jest.setTimeout(60_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const PAIRED_KEY = 'tartaria.fallen.paired.v1';
const HOUSE_KEY = 'tartaria.fallen.house.v1';
const realGetItem = AsyncStorage.getItem.bind(AsyncStorage);

afterEach(() => { jest.restoreAllMocks(); });

/** Count — and optionally slow — reads of one key. */
function watchReads(key: string, delayMs = 0): { reads: number } {
  const state = { reads: 0 };
  jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (k: string) => {
    if (k !== key) return realGetItem(k);
    state.reads += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return realGetItem(k);
  });
  return state;
}

/** What is actually on disk for the paired list, past every cache. */
async function pairedOnDisk(): Promise<Record<string, unknown>[]> {
  const raw = await realGetItem(PAIRED_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
}

const DEAD = {
  name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96,
};

/** Put the module set in one install's shoes. */
function beInstall(installId: string, house: string, sendKey: string | null): void {
  _setIdentityForTests(installId, house);
  _setSendingKeyForTests(sendKey);
  _setPairedForTests([]);
  _setLedgerForTests({ foreign: [], rests: [] });
}

/** ⚠ A COLD RESTART, and the only honest way to test one: throw every module
 *  cache away and leave the disk exactly as it is. */
function coldRestart(installId: string, house: string | null): void {
  _setIdentityForTests(installId, house);
  _setPairedForTests(null);
  _setLedgerForTests(null);
}

/** House A mints a TAR2 card carrying its sending key, and a sealed payload of
 *  its own dead. Returns both, with the disk left holding nothing of A's. */
async function houseACardAndPayload(): Promise<{ card: string; payload: string; key: string }> {
  await AsyncStorage.clear();
  beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
  const key = await ensureSendingKey();
  const card = await myHouseCode();
  await recordFallen({ ...DEAD, ts: 1_760_000_000_000 } as never);
  const payload = await buildExportPayload();
  return { card, payload, key };
}

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1840 §1 — DEFECT A: the key survives the restart', () => {
  it('1.1 the key really does reach the disk — the fixture, proven', async () => {
    const { card, key } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    const out = await acceptHouseCode(card);
    expect(out.ok).toBe(true);
    const disk = await pairedOnDisk();
    expect(disk).toHaveLength(1);
    expect(disk[0]?.key).toBe(key);          // persisted, before anything reloads
  });

  it('1.2 ⚠⚠ THE DEFECT: and it is still there after a cold restart', async () => {
    const { card, key } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    coldRestart('inst-B', 'Brannoch');
    const paired = await loadPaired();
    expect(paired).toHaveLength(1);
    expect(paired[0]?.key).toBe(key);        // ← was undefined before the repair
  });

  it('1.3 the other fields are unchanged by the repair', async () => {
    const { card } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    coldRestart('inst-B', 'Brannoch');
    const p = (await loadPaired())[0]!;
    expect(p.player).toBe('Sasmooch');
    expect(p.installId).toBe('inst-A');
    expect(typeof p.addedTs).toBe('number');
  });

  it('1.4 ⚠ a genuinely sealed payload authenticates AS SEALED after a restart', async () => {
    const { card, payload } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    coldRestart('inst-B', 'Brannoch');
    const out = await importPayloadText(payload);
    expect(out.added).toBe(1);
    expect(out.forged).toBe(false);
    expect(out.unsealed).toBe(0);            // ← was 1: admitted as "we hold no key"
  });

  it('1.5 ⚠⚠⚠ AND A FORGERY IS REFUSED AFTER A RESTART, WHICH IT WAS NOT', async () => {
    const { card, payload } = await houseACardAndPayload();
    // the same body, sealed by somebody who is not House A
    const body = (JSON.parse(payload) as { body: string }).body;
    const forged = JSON.stringify({ v: 2, from: 'inst-A', seal: seal('k_not_their_key', body).seal, body });
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    coldRestart('inst-B', 'Brannoch');
    const out = await importPayloadText(forged);
    expect(out.forged).toBe(true);           // ← was false, and the corpse walked in
    expect(out.added).toBe(0);
  });

  it('1.6 a LEGACY KEYLESS pairing stays keyless — no key is invented for it', async () => {
    await AsyncStorage.clear();
    beInstall('inst-A', 'Sasmooch', null);
    _setSendingKeyForTests(null);
    // a TAR1 card: the shape a house card had before seals existed
    const legacy = 'TAR1.' + encodeURIComponent('Oldhouse|inst-OLD') + '.';
    const { makeHouseCode } = require('../app/engine/fallenLedger') as typeof import('../app/engine/fallenLedger');
    const card = makeHouseCode('Oldhouse', 'inst-OLD');
    expect(card.startsWith('TAR1.')).toBe(true);
    expect(legacy).toContain('TAR1.');
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    coldRestart('inst-B', 'Brannoch');
    const p = (await loadPaired())[0]!;
    expect(p.installId).toBe('inst-OLD');
    expect(p.key).toBeUndefined();           // keyless before, keyless after
  });

  it('1.7 ⚠ a keyless house is still admitted UNSEALED, not silently authenticated', async () => {
    // House A sends unsealed, and B holds no key for it: the existing legacy
    // path. The repair must not turn that into "sealed".
    await AsyncStorage.clear();
    beInstall('inst-A', 'Sasmooch', null);
    _setSendingKeyForTests(null);
    const { makeHouseCode } = require('../app/engine/fallenLedger') as typeof import('../app/engine/fallenLedger');
    const card = makeHouseCode('Sasmooch', 'inst-A');
    await recordFallen({ ...DEAD, ts: 1_760_000_000_000 } as never);
    _setSendingKeyForTests('k_aaaaaaaaaaaaaaaaaaaa');
    const payload = await buildExportPayload();
    const bare = (JSON.parse(payload) as { body: string }).body;   // no envelope at all
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    coldRestart('inst-B', 'Brannoch');
    const out = await importPayloadText(bare);
    expect(out.forged).toBe(false);
    expect(out.unsealed).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1840 §2 — DEFECT B: a sync read cannot poison the paired list', () => {
  async function diskHoldsOnePairing(): Promise<string> {
    const { card } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    expect(await pairedOnDisk()).toHaveLength(1);
    coldRestart('inst-B', 'Brannoch');
    return card;
  }

  it('2.1 ⚠⚠ THE DEFECT: sync read first, and the disk is STILL found', async () => {
    await diskHoldsOnePairing();
    cachedPaired();                          // the sync path, before anything awaited
    const paired = await loadPaired();
    expect(paired).toHaveLength(1);          // ← was 0 before the repair
    expect(paired[0]?.installId).toBe('inst-A');
  });

  it('2.2 the sync reader may answer empty before hydration — that is permitted', async () => {
    await diskHoldsOnePairing();
    expect(cachedPaired()).toHaveLength(0);
    await loadPaired();
    expect(cachedPaired()).toHaveLength(1);  // …and self-heals
  });

  it('2.3 ⚠⚠⚠ AND NO ARRIVING CORPSE IS TURNED AWAY BECAUSE OF IT', async () => {
    const { card, payload } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    coldRestart('inst-B', 'Brannoch');
    cachedPaired();                          // the spawner-shaped cold touch
    const out = await importPayloadText(payload);
    expect(out.added).toBe(1);               // ← was 0, unpaired 1: "no house you ride with"
    expect(out.unpaired).toBe(0);
  });

  it('2.4 a cold restart re-reads the disk rather than trusting a stale empty', async () => {
    await diskHoldsOnePairing();
    await loadPaired();
    const w = watchReads(PAIRED_KEY);
    _setPairedForTests(null);
    const again = await loadPaired();
    expect(w.reads).toBe(1);
    expect(again).toHaveLength(1);
  });

  it('2.5 a hydrated list is not re-read on every call', async () => {
    await diskHoldsOnePairing();
    await loadPaired();
    const w = watchReads(PAIRED_KEY);
    await loadPaired();
    await loadPaired();
    expect(w.reads).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1840 §3 — DEFECT C: a sync read cannot poison the house name', () => {
  async function diskHoldsAHouseName(): Promise<void> {
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await setHouseName('House of Brannoch');
    expect(await realGetItem(HOUSE_KEY)).toBe('House of Brannoch');
    coldRestart('inst-B', null);
  }

  it('3.1 ⚠⚠ THE DEFECT: sync read first, and the name is STILL found', async () => {
    await diskHoldsAHouseName();
    cachedHouseName();
    expect(await loadHouseName()).toBe('House of Brannoch');   // ← was '' before
  });

  it('3.2 the sync reader may answer empty before hydration', async () => {
    await diskHoldsAHouseName();
    expect(cachedHouseName()).toBe('');
    await loadHouseName();
    expect(cachedHouseName()).toBe('House of Brannoch');
  });

  it('3.3 ⚠ and the dead do not ride out stamped "an unnamed house"', async () => {
    await diskHoldsAHouseName();
    _setIdentityForTests('inst-B', null);
    cachedHouseName();                       // poison attempt
    await recordFallen({ ...DEAD, ts: 1_760_000_000_000 } as never);
    const payload = await buildExportPayload();
    const body = JSON.parse((JSON.parse(payload) as { body: string }).body) as { house: string };
    expect(body.house).toBe('House of Brannoch');
  });

  it('3.4 an install that genuinely has no name still reads as empty', async () => {
    await AsyncStorage.clear();
    beInstall('inst-B', null as unknown as string, 'k_bbbbbbbbbbbbbbbbbbbb');
    _setIdentityForTests('inst-B', null);
    expect(await loadHouseName()).toBe('');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1840 §4 — two cold loads are one hydration', () => {
  it('4.1 concurrent cold paired loads share ONE disk read and agree', async () => {
    const { card } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    coldRestart('inst-B', 'Brannoch');
    const w = watchReads(PAIRED_KEY, 40);
    const [a, b] = await Promise.all([loadPaired(), loadPaired()]);
    expect(w.reads).toBe(1);
    expect(a).toBe(b);
    expect(a).toHaveLength(1);
    expect(a[0]?.key).toBeDefined();
  });

  it('4.2 concurrent cold house-name loads share ONE disk read and agree', async () => {
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await setHouseName('House of Brannoch');
    coldRestart('inst-B', null);
    const w = watchReads(HOUSE_KEY, 40);
    const [a, b] = await Promise.all([loadHouseName(), loadHouseName()]);
    expect(w.reads).toBe(1);
    expect(a).toBe('House of Brannoch');
    expect(b).toBe('House of Brannoch');
  });

  it('4.3 accepting the same house twice does not duplicate it', async () => {
    const { card } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(card);
    coldRestart('inst-B', 'Brannoch');
    const again = await acceptHouseCode(card);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.already).toBe(true);
    expect(await pairedOnDisk()).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1840 §5 — a write after a cold sync read keeps what was there', () => {
  it('5.1 ⚠⚠⚠ House A on disk, sync read first, accept House B — BOTH survive', async () => {
    const { card: cardA } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-C', 'Third', 'k_cccccccccccccccccccc');
    _setIdentityForTests('inst-A2', 'SecondHouse');
    _setSendingKeyForTests('k_dddddddddddddddddddd');
    const cardB = await myHouseCode();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(cardA);
    expect(await pairedOnDisk()).toHaveLength(1);
    coldRestart('inst-B', 'Brannoch');
    cachedPaired();                          // the poison attempt
    await acceptHouseCode(cardB);            // an ordinary later write
    const disk = await pairedOnDisk();
    const ids = disk.map((d) => d.installId).sort();
    expect(ids).toEqual(['inst-A', 'inst-A2']);   // ← was ['inst-A2'] alone: A erased
  });

  it('5.2 renaming the house after a cold sync read writes the new name, not ""', async () => {
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await setHouseName('House of Brannoch');
    coldRestart('inst-B', null);
    cachedHouseName();
    await setHouseName('House of Stellan');
    expect(await realGetItem(HOUSE_KEY)).toBe('House of Stellan');
    expect(await loadHouseName()).toBe('House of Stellan');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1840 §6 — trust policy and the neighbouring authorities are untouched', () => {
  const STORE = codeOnly(src('app', 'engine', 'fallenLedgerStore.ts'));

  it('6.1 an UNPAIRED house is still refused, restart or not', async () => {
    const { payload } = await houseACardAndPayload();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    coldRestart('inst-B', 'Brannoch');       // paired list empty ON DISK too
    const out = await importPayloadText(payload);
    expect(out.added).toBe(0);
    expect(out.unpaired).toBeGreaterThan(0);
  });

  it('6.2 the seal and house-code formats are not touched by this repair', () => {
    const SEAL = src('app', 'engine', 'fallenSeal.ts');
    expect(SEAL).toMatch(/hmacSha256/);
    const LEDGER = src('app', 'engine', 'fallenLedger.ts');
    expect(LEDGER).toMatch(/TAR2/);
    expect(LEDGER).toMatch(/const tag = sendingKey \? 'TAR2' : 'TAR1'/);
  });

  it('6.3 ⚠ neither sync reader assigns its canonical cache any more', () => {
    for (const fn of ['cachedPaired', 'cachedHouseName']) {
      const at = STORE.indexOf(`export function ${fn}`);
      expect(at).toBeGreaterThan(-1);
      const body = STORE.slice(at, STORE.indexOf('}', STORE.indexOf('{', at) + 1) + 1);
      expect(body).not.toMatch(/(PAIRED|HOUSE)\s*=/);
    }
  });

  it('6.4 OTA-1839\'s ledger hydration is still the ledger\'s own', () => {
    expect(STORE).toMatch(/LEDGER_HYDRATION/);
    expect(STORE).toMatch(/UNHYDRATED_SNAPSHOT/);
    expect(STORE).not.toMatch(/primeLedgerCache/);
  });

  it('6.5 ⚠ the key a row carries is the key it was stored with — never a minted one', async () => {
    // Behavioural, not positional: put a key on disk BY HAND (no accept path, so
    // nothing in the store could have derived it), and require it back byte for
    // byte. A whitelist that forgets `key` fails; so does any path that
    // regenerates, renormalises, or substitutes the install id for it.
    await AsyncStorage.clear();
    const stored = 'k_' + 'e7'.repeat(20);
    await AsyncStorage.setItem('tartaria.fallen.paired.v1', JSON.stringify([
      { player: 'Sasmooch', installId: 'inst-A', addedTs: 5, key: stored },
      { player: 'Oldhouse', installId: 'inst-OLD', addedTs: 6 },
    ]));
    coldRestart('inst-B', 'Brannoch');
    const rows = await loadPaired();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.key).toBe(stored);
    expect(rows[0]?.key).not.toBe('inst-A');
    expect(rows[1]?.key).toBeUndefined();   // and none was invented for the old row
  });
});
