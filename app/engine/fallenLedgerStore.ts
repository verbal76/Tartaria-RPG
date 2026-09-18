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
import { seal, sealMatches, mintSendingKey } from './fallenSeal';
import {
  fallenKey,
  isPairedHouse,
  makeHouseCode,
  MAX_EXCHANGE_BYTES,
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

/* ⚠ OTA-1839 removed a shared `EMPTY` constant that every cache was built from
 * with `{ ...EMPTY }`. A spread copies the OBJECT but keeps the SAME two array
 * references, so every "fresh empty" ledger shared one pair of arrays. Nothing
 * mutated them in place, so it never bit — but a cache is now built from its own
 * literals, and the one empty object that still exists is frozen and canonical
 * for exactly one purpose: saying "not hydrated yet". See the disk section. */

// ---- identity --------------------------------------------------------------
let INSTALL_ID: string | null = null;
let HOUSE: string | null = null;

/** ⚠ The identity that keys everything. Names collide — two players both called
 *  Verbal would fuse into one house and their dead would dedupe against each
 *  other. This is minted once and never changes. */
/* ⚠⚠⚠ #157 — "MINTED ONCE" WAS A CLAIM, NOT A GUARANTEE, AND IT WAS MEASURED
 * FALSE. There are two awaits between "nobody has an id" and "this id is now
 * ours", and nothing held the door: every caller that entered the cold path
 * before the first write landed read an empty disk, minted its OWN id, and
 * returned that local — not the cache, not the disk. Measured on this file
 * before the fix, with no instrumentation whatsoever: sixteen concurrent cold
 * callers produced SIXTEEN DISTINCT IDS, and callers were handed ids that never
 * became durable (returned inst_uqef…, disk kept inst_xe3b…, and the reload
 * agreed with the disk, not with the callers).
 *
 * That is an identity fork, not a wasted allocation. This id is the mailbox
 * address this house's dead are pushed to, the `byInstallId` stamped on every
 * rest record, and the field `isPairedHouse()` matches a foreign payload's
 * origin against — so a fork means one install filing its dead under an id
 * other houses were never given.
 *
 * The fix is the one this file already uses three times over (OTA-1839 ledger,
 * OTA-1840 paired list and house name): serialise the cold path behind ONE
 * in-flight promise, so concurrent callers share an initialisation instead of
 * racing writes and accepting whichever landed last. The `finally` clears the
 * slot on settle — including a rejection — so a failed start can never poison
 * every later attempt.
 *
 * ⚠ ONE DELIBERATE DIFFERENCE from the other three: the assignment below is
 * UNCONDITIONAL, not `if (INSTALL_ID === null)`. `cachedInstallId()` installs
 * `''` as its "not primed yet" marker, so a `=== null` guard would see that
 * placeholder and refuse to install the real id — the install would stay
 * nameless for the session. An install id is write-once and never renamed, so
 * there is no concurrent mutation for the guard to protect here anyway. */
let INSTALL_HYDRATION: Promise<string> | null = null;

export async function ensureInstallId(): Promise<string> {
  if (INSTALL_ID) return INSTALL_ID;
  if (INSTALL_HYDRATION) return INSTALL_HYDRATION;
  const run = (async (): Promise<string> => {
    try {
      const held = await AsyncStorage.getItem(INSTALL_KEY);
      // ⚠ An id already on disk is this install's identity forever. Never
      // replaced, never re-minted, whatever else is in flight.
      if (held && held.length > 0) { INSTALL_ID = held; return held; }
    } catch { /* fall through and mint */ }
    // No crypto dependency: install ids only need to not collide across a handful
    // of friends, and a 96-bit random-ish string clears that by a mile.
    const minted = `inst_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    INSTALL_ID = minted;
    try { await AsyncStorage.setItem(INSTALL_KEY, minted); } catch { /* memory-only this run */ }
    return minted;
  })();
  INSTALL_HYDRATION = run;
  try { return await run; } finally { if (INSTALL_HYDRATION === run) INSTALL_HYDRATION = null; }
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
/* ⚠⚠ OTA-1840 — `null` MEANS UNHYDRATED HERE TOO, and `''` is a real answer.
 * `cachedHouseName()` used to install `''` and `loadHouseName()` early-returns
 * on any non-null HOUSE, so one synchronous look before the disk had answered
 * left this install nameless for the session — and its dead rode out to other
 * players' rolls stamped `an unnamed house` while the name sat on disk. Same
 * mistake OTA-1839 closed for the ledger; same shape of repair. */
let HOUSE_HYDRATION: Promise<string> | null = null;

export async function loadHouseName(): Promise<string> {
  if (HOUSE !== null) return HOUSE;
  if (HOUSE_HYDRATION) return HOUSE_HYDRATION;
  const run = (async (): Promise<string> => {
    let next: string;
    try { next = (await AsyncStorage.getItem(HOUSE_KEY)) ?? ''; } catch { next = ''; }
    // a rename may have landed while we were reading; it wins.
    if (HOUSE === null) HOUSE = next;
    return HOUSE;
  })();
  HOUSE_HYDRATION = run;
  try { return await run; } finally { if (HOUSE_HYDRATION === run) HOUSE_HYDRATION = null; }
}
/** ⚠ Empty until the disk answers, and it does NOT install that emptiness. */
export function cachedHouseName(): string {
  if (HOUSE !== null) return HOUSE;
  void loadHouseName();
  return '';
}
export async function setHouseName(name: string): Promise<void> {
  const clean = name.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32);
  HOUSE = clean;
  try { await AsyncStorage.setItem(HOUSE_KEY, clean); } catch { /* memory-only this run */ }
}

// ---- pairing ---------------------------------------------------------------
/* ⚠⚠⚠ OTA-1840 — THE PAIRING LIST IS A TRUST RECORD, AND IT USED TO FORGET THE
 * HALF THAT DOES THE TRUSTING. Two separate faults lived here, and they
 * compounded into a phone that ACCEPTED A FORGERY after a restart:
 *
 *   1. `loadPaired()` rebuilt each row from a field whitelist that listed
 *      player/installId/addedTs and NOT `key`. `persistPaired()` writes the
 *      whole row with JSON.stringify, so the key reached the disk perfectly and
 *      was then thrown away on the way back. After a cold start every sealed
 *      pairing silently degraded to a keyless one.
 *   2. With every key gone, `authenticate()` holds no keys at all — and a phone
 *      holding no keys is by design a phone from before seals existed, so it
 *      admits an unsealed payload. The restart did not merely lose a
 *      verification; it converted a REFUSAL into an ACCEPTANCE.
 *
 * `cachedPaired()` carried the third: it installed `[]` as the answer and
 * `loadPaired()` early-returns on a truthy PAIRED, so one synchronous look
 * before the disk answered left this install permanently unpaired for the
 * session — every arriving corpse turned away as a stranger, and the next
 * write persisted the empty list over the real one. Same `unhydrated is not
 * empty` mistake OTA-1839 closed for the ledger; same shape of repair. */
let PAIRED: PairedHouse[] | null = null;
let PAIRED_HYDRATION: Promise<PairedHouse[]> | null = null;

/** Handed to a synchronous reader before the disk has answered. Frozen, and
 *  deliberately NOT installed — it says "not yet", never "nobody". */
const UNHYDRATED_PAIRED: PairedHouse[] = [];
Object.freeze(UNHYDRATED_PAIRED);

/** ⚠ Rebuilds one stored row. `key` is CARRIED, not regenerated: the trim and
 *  64-char bound are exactly what `parseHouseCode` already applied when the key
 *  came in, so this is idempotent for anything that entered through the front
 *  door and cannot turn a real key into a different one. A row with no usable
 *  key stays keyless — an old card from before seals existed is still paired,
 *  and no key is invented for it. */
function revivePairedRow(d: unknown): PairedHouse[] {
  if (typeof d !== 'object' || d === null) return [];
  const r = d as Record<string, unknown>;
  const player = typeof r.player === 'string' ? r.player.slice(0, 32) : '';
  const installId = typeof r.installId === 'string' ? r.installId.slice(0, 40) : '';
  if (!player || !installId) return [];
  const row: PairedHouse = { player, installId, addedTs: typeof r.addedTs === 'number' ? r.addedTs : 0 };
  const key = typeof r.key === 'string' ? r.key.trim().slice(0, 64) : '';
  if (key) row.key = key;
  return [row];
}

export async function loadPaired(): Promise<PairedHouse[]> {
  if (PAIRED) return PAIRED;
  if (PAIRED_HYDRATION) return PAIRED_HYDRATION;
  const run = (async (): Promise<PairedHouse[]> => {
    let next: PairedHouse[];
    try {
      const raw = await AsyncStorage.getItem(PAIRED_KEY);
      const doc: unknown = raw ? JSON.parse(raw) : [];
      next = Array.isArray(doc) ? doc.flatMap(revivePairedRow) : [];
    } catch { next = []; }
    // a pairing or a revoke may have landed while we were reading; it wins.
    if (PAIRED === null) PAIRED = next;
    return PAIRED;
  })();
  PAIRED_HYDRATION = run;
  try { return await run; } finally { if (PAIRED_HYDRATION === run) PAIRED_HYDRATION = null; }
}

/** ⚠ Empty until the disk answers, and it does NOT install that emptiness. */
export function cachedPaired(): PairedHouse[] {
  if (PAIRED) return PAIRED;
  void loadPaired();
  return UNHYDRATED_PAIRED;
}

async function persistPaired(list: PairedHouse[]): Promise<void> {
  PAIRED = list;
  try { await AsyncStorage.setItem(PAIRED_KEY, JSON.stringify(list)); } catch { /* memory-only this run */ }
}

export function _setPairedForTests(l: PairedHouse[] | null): void { PAIRED = l; PAIRED_HYDRATION = null; }

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
/* ⚠⚠⚠ OTA-1839 — `null` MEANS "WE HAVE NOT LOOKED AT THE DISK YET", AND NOTHING
 * ELSE IS ALLOWED TO MEAN THAT.
 *
 * This used to hold either `null` or a ledger, and that is one state short. The
 * moment anything needed a ledger SYNCHRONOUSLY, `cachedLedger()` minted an
 * empty one and installed it as canonical — after which "we never looked" and
 * "we looked and there was nothing" were the same value, and `loadLedger()`'s
 * opening `if (LEDGER_CACHE) return LEDGER_CACHE` handed the placeholder back
 * without ever reaching the disk. The `void loadLedger()` on the very next
 * expression could not save it: it saw the truthy cache that had just been
 * installed one statement earlier.
 *
 * ⚠⚠ AND EVERY WRITE WRITES THE WHOLE LEDGER, so this was not merely a reading
 * fault. A player's foreign dead sat safely on disk, invisible, until the next
 * ordinary import or rest merged into the synthetic empty and wrote it over the
 * top of them. Measured: one import of a different corpse, and the corpse
 * already on disk was gone for good.
 *
 * Only the hydration below may install a canonical cache. A synchronous reader
 * gets a frozen snapshot it cannot install and cannot mutate, and the hydration
 * it kicks off still reaches the disk — so the spawner's first, too-early look
 * costs one frame of foreign revenants and nothing else. */
let LEDGER_CACHE: Ledger | null = null;

/** The single in-flight disk read, so two cold callers cannot start two. */
let LEDGER_HYDRATION: Promise<Ledger> | null = null;

/** What a synchronous reader sees before the disk has answered. Frozen so it can
 *  never be mutated into something that looks like real state, and never stored
 *  in `LEDGER_CACHE` — it is an answer, not a ledger. */
const UNHYDRATED_SNAPSHOT: Ledger = { foreign: [], rests: [] };
Object.freeze(UNHYDRATED_SNAPSHOT.foreign);
Object.freeze(UNHYDRATED_SNAPSHOT.rests);
Object.freeze(UNHYDRATED_SNAPSHOT);

export async function loadLedger(): Promise<Ledger> {
  if (LEDGER_CACHE) return LEDGER_CACHE;
  if (LEDGER_HYDRATION) return LEDGER_HYDRATION;
  const run = (async (): Promise<Ledger> => {
    let next: Ledger;
    try {
      const raw = await AsyncStorage.getItem(LEDGER_KEY);
      // ⚠ Re-validated on the way OFF disk too, not just off the wire. A ledger
      // written by an older build, or edited by hand on a rooted phone, is exactly
      // as untrusted as a stranger's payload.
      if (!raw) next = { foreign: [], rests: [] };
      else { const parsed = parseLedgerPayload(raw); next = { foreign: parsed.fallen, rests: parsed.rests }; }
    } catch {
      next = { foreign: [], rests: [] };
    }
    // ⚠ A mutation may have landed while we were reading — `persist()` installs
    // its own result. Ours is the OLDER picture, so it does not get to win.
    if (LEDGER_CACHE === null) LEDGER_CACHE = next;
    return LEDGER_CACHE;
  })();
  LEDGER_HYDRATION = run;
  try { return await run; } finally { if (LEDGER_HYDRATION === run) LEDGER_HYDRATION = null; }
}

/** ⚠ Sync accessor for the spawner, which cannot await. Before the disk has
 *  answered this is EMPTY AND SAYS SO — it installs nothing, so the hydration it
 *  starts still reads the disk and the next look is the real roll. */
export function cachedLedger(): Ledger {
  if (LEDGER_CACHE) return LEDGER_CACHE;
  void loadLedger();
  return UNHYDRATED_SNAPSHOT;
}

export function _setLedgerForTests(l: Ledger | null): void { LEDGER_CACHE = l; LEDGER_HYDRATION = null; }
export function _setIdentityForTests(installId: string | null, house: string | null): void {
  INSTALL_ID = installId;
  HOUSE = house;
  HOUSE_HYDRATION = null;
  INSTALL_HYDRATION = null;
}

/** ⚠⚠⚠ OTA-1838 — WHAT A REFUSED DISK SOUNDS LIKE, BECAUSE IT USED TO SOUND
 *  EXACTLY LIKE SUCCESS. Every mutation here returns `Promise<void>`, and until
 *  this existed a resolved one meant "written" and ALSO meant "not written, and
 *  never will be". A caller cannot tell those apart, so it reported the loss as
 *  a success. This is the smallest thing that separates them. */
export class FallenPersistError extends Error {
  /** What the storage layer actually said. For the log, not for the player. */
  readonly detail: string;
  constructor(detail: string) {
    super('fallen ledger: the disk refused every attempt');
    this.name = 'FallenPersistError';
    this.detail = detail;
  }
}

/** True for the failure above. The two callers that must tell a bad PASTE from
 *  a bad DISK live in other files and reach this module through `require()`, so
 *  `instanceof` alone is not a safe test — the name is checked as well. */
/** ⚠⚠ OTA-1842 — TOO BIG TO LOOK AT. A refusal, not a failure: nothing was
 *  read, nothing was parsed, nothing was written. It is a typed error for the
 *  same reason `FallenPersistError` is — the screen has to tell these apart to
 *  say anything true, and a bare `throw` makes every cause look like the same
 *  shrug. */
export class FallenPayloadTooLargeError extends Error {
  readonly bytes: number;
  constructor(bytes: number) {
    super('fallen exchange: that is too large to read');
    this.name = 'FallenPayloadTooLargeError';
    this.bytes = bytes;
  }
}
export function isFallenPayloadTooLargeError(e: unknown): boolean {
  if (e instanceof FallenPayloadTooLargeError) return true;
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'FallenPayloadTooLargeError';
}

export function isFallenPersistError(e: unknown): boolean {
  if (e instanceof FallenPersistError) return true;
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'FallenPersistError';
}

async function persist(l: Ledger): Promise<void> {
  // ⚠⚠⚠ OTA-1838 — THE CACHE MOVES FIRST AND IS PUT BACK IF THE DISK REFUSES.
  //
  // Moving it before the write is deliberate and is NOT the defect: the spawner
  // reads `cachedLedger()` synchronously and cannot await, so a rested corpse
  // must leave the pool the instant the rest is taken or it can rise again in
  // the seconds a write is in flight. What was missing is the other half. When
  // every attempt failed, memory was left holding a commit that never happened
  // — and since the loop simply ran out and the function returned, the caller
  // was told it had worked. A player on a full phone saw "3 joined your wastes"
  // and had none of them next launch; a Hollowed "put to rest" stood back up.
  //
  // ⚠ WORSE THAN LOST: UNRECOVERABLE. The phantom record stayed in the cache, so
  // the dedupe turned the honest retry away too — importing the same payload
  // again after the disk recovered added nothing, for the rest of the session.
  // The rollback is what makes a retry possible at all.
  //
  // ⚠ IT IS A COMPARE-AND-SWAP, not a blind restore. If another mutation landed
  // while we were retrying, the cache is no longer ours to put back and we leave
  // it alone — that write's own outcome governs it. (That two of these can
  // interleave at all is a SEPARATE defect, the same lost-update shape OTA-1835
  // closed for the GlobalStash. It is recorded, not fixed here.)
  const previous = LEDGER_CACHE;
  LEDGER_CACHE = l;
  // ⚠ The write RETRIES, for the reason OTA-994 gave markAvenged: one failed
  // disk write and a corpse you already put down rises again next launch.
  let last = 'unknown';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify({ v: LEDGER_FORMAT, fallen: l.foreign, rests: l.rests }));
      return;
    } catch (e) {
      last = String((e as { message?: unknown })?.message ?? e);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (LEDGER_CACHE === l) LEDGER_CACHE = previous;
  throw new FallenPersistError(last);
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

/** ⚠⚠ OTA-1842 — WHAT THE PLAYER IS BEING OFFERED, IN WORDS THEY DIDN'T HAVE TO
 *  LEARN. The exchange worked and was unreadable: a valid paste mutated the save
 *  the instant it parsed, and the only way to find out WHO was arriving was to
 *  let them in. This is the same decision the import makes, asked without
 *  committing it.
 *
 *  ⚠ THE TRUST WORDS ARE A TRANSLATION, NOT A NEW POLICY. `verified` IS
 *  `AuthResult.kind === 'sealed'`; `legacy` IS `'unsealed'` — a house paired
 *  before seals existed, which the engine deliberately still admits; `refused`
 *  is every rejection the import already performs. Nothing here decides
 *  anything: it reports what the gate below is going to do. */
export type ExchangeTrust = 'verified' | 'legacy' | 'refused';

export interface ExchangePreview {
  trust: ExchangeTrust;
  /** Why it was refused — for the sentence shown, never for the player to debug. */
  refusal?: 'forged' | 'unpaired' | 'unreadable' | 'too-large';
  /** The house sending, as they named themselves. Empty when unreadable. */
  fromHouse: string;
  /** Titled names of the dead that would actually arrive if confirmed. */
  arrivals: string[];
  /** Dead in this payload that this house may not speak for. */
  turnedAway: number;
  /** Closure receipts that would be folded in — the news from your own dead. */
  rests: number;
}

/** The whole decision, with no write in it: parse, authenticate, and work out
 *  exactly which records would be taken. `importPayloadText` runs this and then
 *  persists; `previewPayloadText` runs this and then describes it. They cannot
 *  disagree about trust or about which dead are wanted, because there is only
 *  one of them. */
interface ExchangeDecision {
  myInstallId: string;
  ledger: Ledger;
  auth: AuthResult;
  wanted: ForeignFallen[];
  wantedRests: RestRecord[];
  unpaired: number;
  fromHouse: string;
  /** ⚠⚠ OTA-1842 — DID THIS TEXT PARSE AS A DOCUMENT AT ALL?
   *  `parseLedgerPayload` is deliberately total: garbage in, empty batch out,
   *  never a throw. That is right for the importer — a torn paste must cost the
   *  batch and nothing else — but it erases the ONE distinction the preview
   *  needs. A friend's honest payload carrying no dead yet and a half-copied
   *  string are both "nothing arrived", and telling a player their nonsense came
   *  from a LEGACY HOUSE is worse than telling them nothing. So the readability
   *  of the text is carried out alongside the batch rather than inferred from
   *  its emptiness. The import path does not read it: its answer for both cases
   *  is identical and already correct. */
  readable: boolean;
}

async function decideExchange(text: string): Promise<ExchangeDecision> {
  const myInstallId = await ensureInstallId();
  const ledger = await loadLedger();
  const paired = await loadPaired();
  const inner = unwrapEnvelope(text);
  let readable = false;
  try { const d: unknown = JSON.parse(inner); readable = typeof d === 'object' && d !== null; } catch { readable = false; }
  const batch = parseLedgerPayload(inner);

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
  // The house as it named itself, for the preview line. Display only — the gate
  // below trusts the install id and the seal, never this string.
  const fromHouse = batch.fallen[0]?.origin.player ?? '';
  if (auth.kind === 'forged') {
    // Sealed, but by nobody we hold a key for. Refuse the whole payload — a
    // partial accept here would be the worst of both answers.
    return { myInstallId, ledger, auth, wanted: [], wantedRests: [], unpaired: batch.fallen.length, fromHouse, readable };
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

  return { myInstallId, ledger, auth, wanted, wantedRests, unpaired: unpairedFallen, fromHouse, readable };
}

/** ⚠⚠⚠ OTA-1842 — LOOK BEFORE YOU LET THEM IN, AND CHANGE NOTHING BY LOOKING.
 *  Runs the identical decision the import runs — same parser, same
 *  `authenticate`, same pairing and seal filters, same merge — and stops one
 *  line short of `persist`. That "one line short" is the whole design: a
 *  separate describe-this-payload path could drift from the path that actually
 *  admits records, and a preview that can say VERIFIED while the commit
 *  disagrees is worse than no preview at all.
 *
 *  ⚠ TOTAL BY CONTRACT. A torn, hostile or enormous paste answers `refused`
 *  with a reason; it never throws at the screen that called it. */
export async function previewPayloadText(text: string): Promise<ExchangePreview> {
  const empty = { fromHouse: '', arrivals: [], turnedAway: 0, rests: 0 };
  if (text.length > MAX_EXCHANGE_BYTES) return { trust: 'refused', refusal: 'too-large', ...empty };
  let d: ExchangeDecision;
  try { d = await decideExchange(text); } catch { return { trust: 'refused', refusal: 'unreadable', ...empty }; }
  // ⚠⚠ A TORN PASTE IS NOT A QUIET HOUSE. `parseLedgerPayload` is total, so half
  // a copied string and an honest payload carrying no dead both come back empty
  // — and without this line the first one is shown to the player as LEGACY HOUSE
  // / "No new dead in this one", which reads as "your friend sent nothing"
  // rather than "that is not an exchange". The distinction is the text's
  // readability, never the emptiness of what came out of it.
  if (!d.readable) return { trust: 'refused', refusal: 'unreadable', ...empty };
  if (d.auth.kind === 'forged') {
    return { trust: 'refused', refusal: 'forged', ...empty, fromHouse: d.fromHouse, turnedAway: d.unpaired };
  }
  // The merge is pure, so asking it what WOULD arrive costs nothing and is
  // exact: duplicates, your own dead and the already-rested are excluded here
  // for the same reasons they will be excluded on commit.
  const restsMerged = mergeRests(d.ledger.rests, d.wantedRests);
  const fallenMerged = mergeFallen(d.ledger.foreign, d.wanted, { myInstallId: d.myInstallId, rests: restsMerged.rests });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fallenTitle } = require('./fallenLedger') as typeof import('./fallenLedger');
  const arrivals = fallenMerged.added.map((f) => fallenTitle(f));
  if (arrivals.length === 0 && restsMerged.added.length === 0 && d.unpaired > 0) {
    // Everything in it belongs to a house this install does not ride with.
    return { trust: 'refused', refusal: 'unpaired', ...empty, fromHouse: d.fromHouse, turnedAway: d.unpaired };
  }
  return {
    trust: d.auth.kind === 'sealed' ? 'verified' : 'legacy',
    fromHouse: d.fromHouse,
    arrivals,
    turnedAway: d.unpaired,
    rests: restsMerged.added.length,
  };
}

/** Take a payload from anywhere — pasted, shared, or (later) fetched — and fold
 *  it in. Every record goes through the validator; a hostile or torn batch costs
 *  the batch, never the save. */
export async function importPayloadText(text: string): Promise<ImportOutcome> {
  // ⚠ OTA-1842 — the ceiling is checked here too, not only in the preview. The
  // preview is the normal road in, but this function is also the mailbox's door
  // and a suite's direct call, and a guard that only one caller passes through
  // is not a guard.
  if (text.length > MAX_EXCHANGE_BYTES) throw new FallenPayloadTooLargeError(text.length);
  const d = await decideExchange(text);
  const { myInstallId, ledger, auth, wanted, wantedRests } = d;
  if (auth.kind === 'forged') {
    return {
      added: 0, rests: 0, skippedOwn: 0, skippedRested: 0, skippedDuplicate: 0,
      rejected: 0, evicted: 0, unpaired: d.unpaired, unsealed: 0, forged: true, arrivals: [],
    };
  }
  const unpairedFallen = d.unpaired;

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
