// ⚠⚠ OTA-1362 — THE SHARED ROLL OF THE FALLEN: identity, disk, and the exchange.
//
// GOLEM LINE ONLY. Not ported until the owner and one other player have run it
// on two golem APKs.
//
// `fallenLedger.ts` is the pure half — the door every foreign record comes
// through and the union rules that merge two ledgers. This is the half that
// touches the world: who THIS install is, what it has on disk, and how a batch
// of corpses gets out of one phone and into another.
//
// ⚠ THE TRANSPORT IS DELIBERATELY DUMB. Export hands back a string; import
// takes a string. Today the player carries it themselves — share sheet, group
// chat, paste. When the automatic mailbox lands, it calls these same two
// functions with the same strings, and nothing above this line learns that the
// bytes started arriving on their own. Sync is a delivery problem; it was never
// a gameplay problem, and the seam belongs here.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FallenHero } from './saveSystem';
import {
  fallenKey,
  mergeFallen,
  mergeRests,
  parseLedgerPayload,
  unrestedFallen,
  type ForeignFallen,
  type RestRecord,
} from './fallenLedger';

const LEDGER_KEY = 'tartaria.fallenLedger.v1';
const INSTALL_KEY = 'tartaria.fallen.installId.v1';
const HOUSE_KEY = 'tartaria.fallen.house.v1';
/** Bumped if the envelope shape ever changes; readers tolerate an older one. */
export const LEDGER_FORMAT = 1;

export interface Ledger {
  foreign: ForeignFallen[];
  rests: RestRecord[];
}

const EMPTY: Ledger = { foreign: [], rests: [] };

// ---- identity --------------------------------------------------------------
let INSTALL_ID: string | null = null;
let HOUSE: string | null = null;

/** ⚠ The identity that keys everything. Names collide — two players both called
 *  Verbal would fuse into one house and their dead would dedupe against each
 *  other. This is minted once and never changes. */
export async function ensureInstallId(): Promise<string> {
  if (INSTALL_ID) return INSTALL_ID;
  try {
    const held = await AsyncStorage.getItem(INSTALL_KEY);
    if (held && held.length > 0) { INSTALL_ID = held; return held; }
  } catch { /* fall through and mint */ }
  // No crypto dependency: install ids only need to not collide across a handful
  // of friends, and a 96-bit random-ish string clears that by a mile.
  const minted = `inst_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  INSTALL_ID = minted;
  try { await AsyncStorage.setItem(INSTALL_KEY, minted); } catch { /* memory-only this run */ }
  return minted;
}

/** Sync accessor for the spawner, which cannot await. '' until primed. */
export function cachedInstallId(): string {
  if (INSTALL_ID === null) { INSTALL_ID = ''; void ensureInstallId(); }
  return INSTALL_ID;
}

/** ⚠⚠ THE HOUSE NAME. Owner: *"keeping it medieval so the fallen is 'Francis
 *  child of Sasmooch'"* — this is the Sasmooch half. It rides out with every
 *  corpse this install exports and is how other players' rolls name your dead.
 *  Your own screens never show it; a house only means something abroad. */
export async function loadHouseName(): Promise<string> {
  if (HOUSE !== null) return HOUSE;
  try { HOUSE = (await AsyncStorage.getItem(HOUSE_KEY)) ?? ''; } catch { HOUSE = ''; }
  return HOUSE;
}
export function cachedHouseName(): string {
  if (HOUSE === null) { HOUSE = ''; void loadHouseName(); }
  return HOUSE;
}
export async function setHouseName(name: string): Promise<void> {
  const clean = name.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32);
  HOUSE = clean;
  try { await AsyncStorage.setItem(HOUSE_KEY, clean); } catch { /* memory-only this run */ }
}

// ---- disk ------------------------------------------------------------------
let LEDGER_CACHE: Ledger | null = null;

export async function loadLedger(): Promise<Ledger> {
  if (LEDGER_CACHE) return LEDGER_CACHE;
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    if (!raw) { LEDGER_CACHE = { ...EMPTY }; return LEDGER_CACHE; }
    // ⚠ Re-validated on the way OFF disk too, not just off the wire. A ledger
    // written by an older build, or edited by hand on a rooted phone, is exactly
    // as untrusted as a stranger's payload.
    const parsed = parseLedgerPayload(raw);
    LEDGER_CACHE = { foreign: parsed.fallen, rests: parsed.rests };
  } catch {
    LEDGER_CACHE = { ...EMPTY };
  }
  return LEDGER_CACHE;
}

/** Sync accessor for the spawner. Empty until primed. */
export function cachedLedger(): Ledger {
  if (LEDGER_CACHE === null) { LEDGER_CACHE = { ...EMPTY }; void loadLedger(); }
  return LEDGER_CACHE;
}

export function primeLedgerCache(): void {
  void loadLedger();
}

export function _setLedgerForTests(l: Ledger | null): void { LEDGER_CACHE = l; }
export function _setIdentityForTests(installId: string | null, house: string | null): void {
  INSTALL_ID = installId;
  HOUSE = house;
}

async function persist(l: Ledger): Promise<void> {
  LEDGER_CACHE = l;
  // ⚠ The write RETRIES, for the reason OTA-994 gave markAvenged: one failed
  // disk write and a corpse you already put down rises again next launch.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify({ v: LEDGER_FORMAT, fallen: l.foreign, rests: l.rests }));
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

// ---- the exchange ----------------------------------------------------------
/** What this install sends out: its OWN dead, stamped with its house, plus the
 *  rests it has performed (so the players whose corpses they were learn how
 *  they ended). Never forwards other people's fallen — each house speaks for
 *  its own dead, which keeps the graph simple and provenance honest. */
export async function buildExportPayload(): Promise<string> {
  const installId = await ensureInstallId();
  const house = (await loadHouseName()) || 'an unnamed house';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadFallen } = require('./saveSystem') as typeof import('./saveSystem');
  let mine: FallenHero[] = [];
  try { mine = await loadFallen(); } catch { mine = []; }
  const ledger = await loadLedger();
  const stamped = mine.map((f) => ({ ...f, origin: { player: house, installId } }));
  return JSON.stringify({ v: LEDGER_FORMAT, house, installId, fallen: stamped, rests: ledger.rests });
}

export interface ImportOutcome {
  added: number;
  rests: number;
  skippedOwn: number;
  skippedRested: number;
  skippedDuplicate: number;
  rejected: number;
  evicted: number;
  /** Names of the newly-arrived, already titled for display. */
  arrivals: string[];
}

/** Take a payload from anywhere — pasted, shared, or (later) fetched — and fold
 *  it in. Every record goes through the validator; a hostile or torn batch costs
 *  the batch, never the save. */
export async function importPayloadText(text: string): Promise<ImportOutcome> {
  const myInstallId = await ensureInstallId();
  const ledger = await loadLedger();
  const batch = parseLedgerPayload(text);

  const restsMerged = mergeRests(ledger.rests, batch.rests);
  const fallenMerged = mergeFallen(ledger.foreign, batch.fallen, {
    myInstallId,
    rests: restsMerged.rests,
  });

  await persist({ foreign: fallenMerged.pool, rests: restsMerged.rests });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fallenTitle } = require('./fallenLedger') as typeof import('./fallenLedger');
  return {
    added: fallenMerged.added.length,
    rests: restsMerged.added.length,
    skippedOwn: fallenMerged.skippedOwn,
    skippedRested: fallenMerged.skippedRested,
    skippedDuplicate: fallenMerged.skippedDuplicate,
    rejected: fallenMerged.rejected,
    evicted: fallenMerged.evicted,
    arrivals: fallenMerged.added.map((f) => fallenTitle(f)),
  };
}

/** Write a rest: THIS world put a foreign corpse down. Append-only, so it
 *  merges by union like everything else and travels home on the next export. */
export async function recordRest(rest: RestRecord): Promise<void> {
  const ledger = await loadLedger();
  const merged = mergeRests(ledger.rests, [rest]);
  // ⚠ The corpse leaves the pool the moment THIS world puts it down. The
  // spawner reads the pool directly, so a rested Hollowed left sitting there
  // would rise again the same session — the bug OTA-994 fixed for local fallen,
  // arriving back here for free if the pool were left alone.
  const foreign = ledger.foreign.filter((f) => fallenKey(f) !== rest.fallenKey);
  await persist({ foreign, rests: merged.rests });
}

/** The foreign dead this world has not yet put down — the spawner's extra pool. */
export function foreignPool(): ForeignFallen[] {
  const l = cachedLedger();
  return unrestedFallen(l.foreign, cachedInstallId(), l.rests);
}
