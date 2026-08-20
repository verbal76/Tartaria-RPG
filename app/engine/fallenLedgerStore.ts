// ⚠⚠ OTA-1363 — THE SHARED ROLL OF THE FALLEN: identity, disk, and the exchange.
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
import { seal, sealMatches, mintSendingKey } from './fallenSeal';
import {
  fallenKey,
  isPairedHouse,
  makeHouseCode,
  mergeFallen,
  mergeRests,
  parseHouseCode,
  parseLedgerPayload,
  unrestedFallen,
  type ForeignFallen,
  type PairedHouse,
  type RestRecord,
} from './fallenLedger';

const LEDGER_KEY = 'tartaria.fallenLedger.v1';
const INSTALL_KEY = 'tartaria.fallen.installId.v1';
const HOUSE_KEY = 'tartaria.fallen.house.v1';
const PAIRED_KEY = 'tartaria.fallen.paired.v1';
const SENDKEY_KEY = 'tartaria.fallen.sendkey.v1';
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

/** ⚠ This install's sending key: minted once, handed out INSIDE the house card,
 *  and used to seal everything this house sends. Whoever holds the card can
 *  verify our payloads — and, being symmetric, could also forge them. That is
 *  the same trust as the pairing itself (you texted the card to one person),
 *  and the honest level for a handful of friends. */
let SEND_KEY: string | null = null;
export async function ensureSendingKey(): Promise<string> {
  if (SEND_KEY) return SEND_KEY;
  try {
    const held = await AsyncStorage.getItem(SENDKEY_KEY);
    if (held && held.length > 0) { SEND_KEY = held; return held; }
  } catch { /* fall through and mint */ }
  const minted = mintSendingKey();
  SEND_KEY = minted;
  try { await AsyncStorage.setItem(SENDKEY_KEY, minted); } catch { /* memory-only this run */ }
  return minted;
}
export function _setSendingKeyForTests(k: string | null): void { SEND_KEY = k; }

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

// ---- pairing ---------------------------------------------------------------
let PAIRED: PairedHouse[] | null = null;

export async function loadPaired(): Promise<PairedHouse[]> {
  if (PAIRED) return PAIRED;
  try {
    const raw = await AsyncStorage.getItem(PAIRED_KEY);
    const doc: unknown = raw ? JSON.parse(raw) : [];
    PAIRED = Array.isArray(doc)
      ? doc.flatMap((d) => {
        if (typeof d !== 'object' || d === null) return [];
        const r = d as Record<string, unknown>;
        const player = typeof r.player === 'string' ? r.player.slice(0, 32) : '';
        const installId = typeof r.installId === 'string' ? r.installId.slice(0, 40) : '';
        if (!player || !installId) return [];
        return [{ player, installId, addedTs: typeof r.addedTs === 'number' ? r.addedTs : 0 }];
      })
      : [];
  } catch { PAIRED = []; }
  return PAIRED;
}

export function cachedPaired(): PairedHouse[] {
  if (PAIRED === null) { PAIRED = []; void loadPaired(); }
  return PAIRED;
}

async function persistPaired(list: PairedHouse[]): Promise<void> {
  PAIRED = list;
  try { await AsyncStorage.setItem(PAIRED_KEY, JSON.stringify(list)); } catch { /* memory-only this run */ }
}

export function _setPairedForTests(l: PairedHouse[] | null): void { PAIRED = l; }

/** ⚠⚠ THE REQUEST. This is what the player sends — their own house card. There
 *  is nothing to "receive" it yet, so it travels the way everything else does:
 *  they text it. When the mailbox lands, it carries this exact string. */
export async function myHouseCode(): Promise<string> {
  const installId = await ensureInstallId();
  const house = (await loadHouseName()) || 'an unnamed house';
  return makeHouseCode(house, installId, await ensureSendingKey());
}

export type AcceptOutcome =
  | { ok: true; house: PairedHouse; already: boolean }
  | { ok: false; reason: 'unreadable' | 'self' };

/** ⚠⚠ THE ACCEPT. Storing a house here is the whole authorization decision:
 *  from this moment their dead may walk here, and until it, they may not —
 *  no matter how well-formed their payload is or how it arrives. */
export async function acceptHouseCode(code: string): Promise<AcceptOutcome> {
  const parsed = parseHouseCode(code);
  if (!parsed) return { ok: false, reason: 'unreadable' };
  const mine = await ensureInstallId();
  // Pairing with yourself would put your own dead in your own wastes, which the
  // merge refuses anyway — refuse it here too, where the message can be honest.
  if (parsed.installId === mine) return { ok: false, reason: 'self' };
  const list = await loadPaired();
  const held = list.find((p) => p.installId === parsed.installId);
  if (held) return { ok: true, house: held, already: true };
  const house: PairedHouse = { ...parsed, addedTs: Date.now() };
  await persistPaired([...list, house]);
  return { ok: true, house, already: false };
}

/** Cut a house off. Their dead already standing in your wastes stay — you agreed
 *  to those, and a corpse mid-errand does not evaporate because the houses fell
 *  out — but nothing further of theirs is admitted. */
export async function revokeHouse(installId: string): Promise<void> {
  const list = await loadPaired();
  await persistPaired(list.filter((p) => p.installId !== installId));
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

type AuthResult =
  | { kind: 'sealed'; installId: string }
  | { kind: 'unsealed' }
  | { kind: 'forged' };

/** Which paired house, if any, actually wrote this? Tries every held key rather
 *  than trusting the envelope's own `from` field — a claim about identity is not
 *  evidence of it, and with a handful of houses the extra work is nothing. */
function authenticate(text: string, paired: readonly PairedHouse[]): AuthResult {
  let env: unknown;
  try { env = JSON.parse(text); } catch { return { kind: 'unsealed' }; }
  if (typeof env !== 'object' || env === null) return { kind: 'unsealed' };
  const e = env as Record<string, unknown>;
  const body = typeof e.body === 'string' ? e.body : null;
  const claimed = e.seal;
  if (!body || typeof claimed !== 'string') return { kind: 'unsealed' };
  let holdAnyKey = false;
  for (const h of paired) {
    if (!h.key) continue;
    holdAnyKey = true;
    if (sealMatches(h.key, body, claimed)) return { kind: 'sealed', installId: h.installId };
  }
  // ⚠ "I cannot verify this" is NOT "this is a forgery", and conflating them was
  // a real bug: senders always seal now, so a house paired before seals existed
  // — whose card carried no key — would have had every honest payload refused.
  // With no key on file there is nothing to check against, so fall through to
  // the pairing gate, which still decides whether the house is wanted at all.
  if (!holdAnyKey) return { kind: 'unsealed' };
  return { kind: 'forged' };
}

/** Unwrap a sealed envelope down to the payload the validator reads. Anything
 *  that is not an envelope passes through untouched, so a hand-pasted plain
 *  ledger still works. */
export function unwrapEnvelope(text: string): string {
  try {
    const env: unknown = JSON.parse(text);
    if (typeof env === 'object' && env !== null) {
      const b = (env as Record<string, unknown>).body;
      if (typeof b === 'string') return b;
    }
  } catch { /* not an envelope */ }
  return text;
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
  const body = JSON.stringify({ v: LEDGER_FORMAT, house, installId, fallen: stamped, rests: ledger.rests });
  // ⚠ The seal covers the body STRING, and the reader verifies before parsing —
  // so a tampered payload never reaches the parser at all.
  const sealed = seal(await ensureSendingKey(), body);
  return JSON.stringify({ v: 2, from: installId, seal: sealed.seal, body });
}

export interface ImportOutcome {
  added: number;
  rests: number;
  skippedOwn: number;
  skippedRested: number;
  skippedDuplicate: number;
  rejected: number;
  evicted: number;
  /** Turned away because their house is not one you ride with. */
  unpaired: number;
  /** Admitted from a house we hold no verifying key for (a pre-seal pairing). */
  unsealed: number;
  /** The payload carried a seal that no paired house's key verifies. */
  forged: boolean;
  /** Names of the newly-arrived, already titled for display. */
  arrivals: string[];
}

/** Take a payload from anywhere — pasted, shared, or (later) fetched — and fold
 *  it in. Every record goes through the validator; a hostile or torn batch costs
 *  the batch, never the save. */
export async function importPayloadText(text: string): Promise<ImportOutcome> {
  const myInstallId = await ensureInstallId();
  const ledger = await loadLedger();
  const paired = await loadPaired();
  const batch = parseLedgerPayload(unwrapEnvelope(text));

  // ⚠⚠ THE GATE. Validation says a record is SAFE; pairing says it is WANTED,
  // and they are not the same question. Before this existed, any payload that
  // parsed got in, so "who am I playing with" was answered by whoever pasted.
  // Unpaired dead are refused here — after the validator, so a hostile stranger
  // is both sanitised AND turned away, never one or the other.
  // ⚠⚠ THE SEAL. Once the dead arrive from a shared mailbox instead of a text,
  // "this claims to be from a house you ride with" stops being worth anything on
  // its own — anyone who can write to the mailbox can claim it. So: unwrap the
  // envelope, and find which paired house's key actually verifies the body.
  // Verification happens over the raw STRING, before parsing, so tampered bytes
  // never reach the parser.
  const auth = authenticate(text, paired);
  if (auth.kind === 'forged') {
    // Sealed, but by nobody we hold a key for. Refuse the whole payload — a
    // partial accept here would be the worst of both answers.
    return {
      added: 0, rests: 0, skippedOwn: 0, skippedRested: 0, skippedDuplicate: 0,
      rejected: 0, evicted: 0, unpaired: batch.fallen.length, unsealed: 0, forged: true, arrivals: [],
    };
  }

  const wanted = batch.fallen.filter((f) => {
    if (!isPairedHouse(f.origin.installId, paired)) return false;
    // A house speaks only for its own dead. If the payload was sealed, the
    // records must belong to the house that sealed it — otherwise a paired
    // house could launder another house's corpses through its own signature.
    if (auth.kind === 'sealed' && f.origin.installId !== auth.installId) return false;
    // Unsealed payloads are admitted only for houses we hold NO key for — a
    // house that gave us a key and then sends unsealed is a downgrade attempt.
    if (auth.kind === 'unsealed') {
      const h = paired.find((pp) => pp.installId === f.origin.installId);
      if (h?.key) return false;
    }
    return true;
  });
  const unpairedFallen = batch.fallen.length - wanted.length;
  // Rests are receipts about corpses, not corpses. One from an unpaired house
  // can only ever say "someone put down a corpse you never held" — worthless
  // rather than dangerous — but it is still noise, so it is held to the same rule.
  const wantedRests = batch.rests.filter((r) => {
    const owner = r.fallenKey.split(':')[0] ?? '';
    return owner === myInstallId || isPairedHouse(owner, paired) || isPairedHouse(r.byInstallId, paired);
  });

  const restsMerged = mergeRests(ledger.rests, wantedRests);
  const fallenMerged = mergeFallen(ledger.foreign, wanted, {
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
    unpaired: unpairedFallen,
    unsealed: auth.kind === 'unsealed' ? wanted.length : 0,
    forged: false,
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
