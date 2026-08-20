// ⚠⚠ OTA-1360 — THE SHARED ROLL OF THE FALLEN: validator + merge rules.
//
// GOLEM LINE ONLY. Owner: *"this is a golem line only feature… don't push this
// to HAL until we can test it on Golem with myself and another player I give
// the golem APK to."* Nothing here is ported until that test happens.
//
// THE FEATURE. Owner's design: a handful of players share their dead. Your
// fallen walk in their wastes as Hollowed revenants; theirs walk in yours; the
// pool grows and the world gets heavier. Killing one puts it on a SEPARATE roll
// that names the player it came from and how it died.
//
// THE GAMEPLAY HALF ALREADY EXISTS — `fallenRevenants.ts` builds the revenant,
// scales it off the dead character's kill count and the living player's hpMax,
// spawns it on quiet wild ground, and hands back the real gear they died in.
// This module is the part that lets a record from ANOTHER PHONE into that pipe
// without letting it into anything else.
//
// ⚠⚠ WHY THE VALIDATOR IS THE FIRST THING BUILT, BEFORE ANY TRANSPORT.
// Owner asked about "a hash check to check for viruses". There is no virus
// vector — the payload is JSON that only ever becomes a FallenHero, never code,
// never eval'd. But a hash proves only that bytes arrived intact, and a
// signature only that a paired player sent them; NEITHER says the data is sane,
// because whoever writes a hostile record also writes its hash and signs it.
//
// The real hole is item injection. `reconstructFallenPiece` spreads a gear
// object wholesale into a live InventoryItem, and FallenGearPiece is
// `Omit<InventoryItem, 'id' | 'quantity'>` — EVERY item field. A hand-edited
// record could carry a `golemCore` worth half a trained golem, a Legendary
// rarity, arbitrary fused stats, or a `quest` tag that wedges the piece into
// your inventory as undroppable — and reclaiming that revenant's weapon writes
// it permanently into the save. Harmless while the only source is your own dead
// characters. A live economy exploit the moment records arrive from other
// phones — the same family as the OTA-1311 restore-revive glitch, except this
// one arrives over the network.
//
// So: NOTHING foreign is spread. Every field is read by name, every number is
// clamped, every string is bounded, and everything unrecognised is dropped.
// This module is the only door, and it is deliberately NARROWER than the local
// item shape — a revenant's blade crossing the wire loses its coatings, and
// that is a cheap price for deleting a whole validation surface.
import type { FallenHero } from './saveSystem';
import type { FallenGearPiece, Rarity } from './types';
import { FUSION_CLAMPS } from './itemFusion';
import gearData from '../data/items/gear.json';

// ---- caps ------------------------------------------------------------------
/** Foreign dead held at once. The pool is the difficulty dial: five players
 *  feeding it is the point, an unbounded pool is a boss rush. */
export const FOREIGN_FALLEN_CAP = 40;
/** Rest records kept. These are trophies — they outlive the corpse. */
export const REST_RECORD_CAP = 120;
/** Gear pieces per fallen — a full loadout is ten slots (OTA-1360). */
export const MAX_GEAR_PIECES = 10;
/** A record dated further ahead than this is a broken or forged clock. */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

const MAX_KILLS = 500;
const MAX_HOURS = 100_000;

// ---- shapes ----------------------------------------------------------------
/** Who a foreign record came from. `installId` is the identity that matters —
 *  display names collide, installs don't. */
export interface FallenOrigin {
  /** The other player's chosen handle, for display only. */
  player: string;
  /** Stable per-install id. The half of the key that must be unique. */
  installId: string;
}

/** A fallen record that arrived from another phone. */
export type ForeignFallen = FallenHero & { origin: FallenOrigin };

/** ⚠ APPEND-ONLY, and that is the whole trick. A rest is not a MUTATION of
 *  someone else's fallen record — it is its own record. That keeps every ledger
 *  a pure union: two phones that swap ledgers both end up with the same set, no
 *  conflict resolution, no authority deciding who is right, no ordering
 *  problem. It is also, for free, the separate roll the owner asked for. */
export interface RestRecord {
  /** fallenKey() of the corpse that was put down. */
  fallenKey: string;
  /** Denormalised for display so the roll reads without the fallen in hand. */
  fallenName: string;
  fallenOriginPlayer: string;
  /** Who put it to rest. */
  byPlayer: string;
  byInstallId: string;
  byCharacter: string;
  /** Where it was put down. */
  whereRested: string;
  /** Wall-clock of the kill. */
  ts: number;
  /** ⚠ The dead player's OWN words, written by THEIR phone's model and carried
   *  with the record. Two installs narrate differently; shipping the prose with
   *  the corpse is what stops the same death reading two ways. */
  description?: string;
}

export interface MergeFallenResult {
  /** The pool to keep. */
  pool: ForeignFallen[];
  /** Records newly admitted this merge. */
  added: ForeignFallen[];
  /** Failed validation outright. */
  rejected: number;
  /** Ours — never re-import our own dead. */
  skippedOwn: number;
  /** Already put to rest in this world. */
  skippedRested: number;
  /** Already held. */
  skippedDuplicate: number;
  /** Dropped to stay under the cap. */
  evicted: number;
}

// ---- primitives ------------------------------------------------------------
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Bounded, control-character-free text. Returns '' for anything unusable —
 *  callers decide whether an empty field is fatal. */
function str(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // Control characters out: they wreck log lines, card layout and the roll.
  const clean = v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const RARITIES: readonly Rarity[] = ['Common', 'Uncommon', 'Rare', 'Legendary'];
const KINDS = ['weapon', 'armor', 'relic', 'consumable', 'misc', 'runecaster', 'dog_armor'] as const;
type ItemKind = (typeof KINDS)[number];
const BASE_STATS = ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'stealth'] as const;
const GEAR_SLOTS = ['main', 'off', 'head', 'chest', 'legs', 'feet', 'amulet', 'ring', 'ring2', 'ring3', 'dog', 'relic', ''] as const;

/** ⚠ Tags that grant a LOCK, not a look. A foreign piece arriving tagged
 *  `quest` would land in the save as view-only — unsellable, undroppable, and
 *  attached to a contract this player was never given. Stripped on the way in. */
const FORBIDDEN_TAGS = new Set(['quest', 'contract', 'broker', 'whisper', 'storyline', 'mystery']);

function tags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    const t = str(raw, 24).toLowerCase();
    if (!t || FORBIDDEN_TAGS.has(t) || out.includes(t)) continue;
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

function durability(v: unknown): { current: number; max: number } | undefined {
  if (!isObj(v)) return undefined;
  const max = int(v.max, 1, 200, 0);
  if (max <= 0) return undefined;
  return { current: int(v.current, 0, max, max), max };
}

function statBonuses(v: unknown): { stat: string; amount: number }[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: { stat: string; amount: number }[] = [];
  for (const raw of v) {
    if (!isObj(raw)) continue;
    const stat = str(raw.stat, 16).toLowerCase();
    if (!(BASE_STATS as readonly string[]).includes(stat)) continue;
    out.push({ stat, amount: int(raw.amount, -5, 5, 0) });
    if (out.length >= 6) break;
  }
  return out.length > 0 ? out : undefined;
}

// ---- per-instance upgrade carriers -----------------------------------------
// ⚠⚠ OTA-1360 — THE UPGRADES TRAVEL. Owner: *"most of the dead will have
// inferred weapons. since lost inferred weapons are better stats than lore
// weapons it seems and can be upgraded as well. we want them to carry these
// effects over."*
//
// ⚠ THE BASE STATS ALREADY CROSSED, and nothing had to be sent for it: weapon
// inference is a pure function of the NAME, so the receiving phone infers the
// identical weapon from the identical string. What did NOT cross was the work
// the player put IN afterwards — coatings, the second coating slot, worked-in
// armour resists, and a Crucible fusion's one-of-a-kind stats. Those were
// dropped in the first cut to delete a validation surface, and dropping them
// threw away the part that made the kit theirs.
//
// So they cross now, and every ceiling below is taken from WHAT THE GAME CAN
// ITSELF PRODUCE rather than a number invented for the occasion:
//   · fusion damage tops out at 2d8 and acBonus at 6 (itemFusion)
//   · catalog armour tops out at acBonus 5
//   · coatings in play are 1d4 and 2d6
//   · ADDED_RESIST_CAP is 3, +1 with the Crucible upgrade
// A foreign piece therefore can never be better than a piece the receiving
// player could have forged themselves — which is the only cap that cannot be
// argued with.
const COATING_KINDS = ['poison', 'acid', 'corruption', 'electrical', 'burn', 'cold'] as const;
const DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'aetheric', 'burn', 'electrical', 'poison', 'cold', 'degradation'] as const;
const FUSED_KINDS = ['weapon', 'armor', 'dog_armor'] as const;
const FUSED_RARITIES = ['Rare', 'Legendary'] as const;
const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'] as const;
/** ⚠⚠ THE CEILINGS ARE THE GAME'S OWN, READ FROM THE GAME.
 *  Owner: *"fuse crucible weapons and armor are very important aspect of the
 *  game, and nerfing them on import kind of defeats the purpose."* Exactly so,
 *  and the first cut DID nerf them: it capped fused dice at 2d8 while
 *  `FUSION_CLAMPS` allows sides [4, 6, 8, 10], so a legitimately forged 1d10 or
 *  2d10 arrived quietly downgraded. It was simultaneously too LOOSE the other
 *  way — accepting 2d7 and 1d9 that the Crucible itself refuses, and passing a
 *  coating at 2d8 when the strongest vial in the game is 1d6.
 *
 *  So nothing below is a number of my choosing. Fused items are checked against
 *  the same exported `FUSION_CLAMPS` the Crucible validates its own output
 *  with, and coatings against the vials that actually exist in gear.json — so a
 *  vial added in a later OTA widens the import automatically and cannot be
 *  forgotten. An imported piece is held to exactly what a local one is. */
const FUSED_DIE_COUNTS: readonly number[] = FUSION_CLAMPS.damageDieCounts;
const FUSED_DIE_SIDES: readonly number[] = FUSION_CLAMPS.damageDieSides;
const MAX_AC_BONUS: number = FUSION_CLAMPS.acBonus;
const MAX_FUSED_DURABILITY: number = FUSION_CLAMPS.durabilityMax;

function oneOf<T extends string>(v: unknown, set: readonly T[]): T | undefined {
  const t = str(v, 24).toLowerCase();
  return (set as readonly string[]).includes(t) ? (t as T) : undefined;
}

/** Every coating the game can actually paint on, harvested from the vials
 *  themselves so the allowed set is never a copy that can rot. */
const CATALOG_COATINGS: { kinds: Set<string>; dice: Set<string> } = (() => {
  const kinds = new Set<string>();
  const dice = new Set<string>();
  try {
    const rows = (gearData as { gear?: unknown[] }).gear ?? [];
    for (const row of rows) {
      const c = (row as { effect?: { coating?: { kind?: unknown; dice?: unknown } } }).effect?.coating;
      if (!c) continue;
      if (typeof c.kind === 'string') kinds.add(c.kind.toLowerCase());
      if (typeof c.dice === 'string') dice.add(c.dice.toLowerCase());
    }
  } catch { /* fall back below */ }
  // A build that somehow ships no vials must not become a free-for-all.
  if (kinds.size === 0) for (const k of COATING_KINDS) kinds.add(k);
  if (dice.size === 0) dice.add('1d4');
  return { kinds, dice };
})();

/** Fused dice: the Crucible accepts only its own standard set, and so do we.
 *  REJECTED rather than trimmed — trimming a cheat value down to a legal one
 *  hands the cheater a legal weapon for free, and a genuine piece never arrives
 *  malformed (the seal catches mangling in transit). */
function fusedDice(v: unknown): string | undefined {
  const raw = str(v, 8).toLowerCase();
  const m = /^(\d{1,2})d(\d{1,3})$/.exec(raw);
  if (!m) return undefined;
  const count = Number(m[1]);
  const sides = Number(m[2]);
  if (!FUSED_DIE_COUNTS.includes(count)) return undefined;
  if (!FUSED_DIE_SIDES.includes(sides)) return undefined;
  return `${count}d${sides}`;
}

/** A weapon coating: the work a player painted on. Held to the vials that
 *  exist — kind AND dice must both be something the game can actually apply. */
function coating(v: unknown): WeaponCoatingLike | undefined {
  if (!isObj(v)) return undefined;
  const kind = oneOf(v.kind, COATING_KINDS);
  const d = str(v.dice, 8).toLowerCase();
  if (!kind || !CATALOG_COATINGS.kinds.has(kind) || !CATALOG_COATINGS.dice.has(d)) return undefined;
  const sb = statBonuses(v.statBonus ? [v.statBonus] : undefined);
  return {
    kind,
    dice: d,
    label: str(v.label, 24) || kind,
    ...(sb && sb[0] ? { statBonus: { stat: sb[0].stat, amount: Math.min(2, Math.max(-2, sb[0].amount)) } } : {}),
  };
}

interface WeaponCoatingLike {
  kind: string;
  dice: string;
  label: string;
  statBonus?: { stat: string; amount: number };
}

/** A Crucible fusion's one-of-a-kind stats, rebuilt field by field. */
function uniqueStats(v: unknown): Record<string, unknown> | undefined {
  if (!isObj(v)) return undefined;
  const kind = oneOf(v.kind, FUSED_KINDS);
  if (!kind) return undefined;
  const rarityRaw = str(v.rarity, 16);
  const rarity = (FUSED_RARITIES as readonly string[]).includes(rarityRaw) ? rarityRaw : 'Rare';
  const durRaw = durability(v.durability) ?? { current: MAX_FUSED_DURABILITY, max: MAX_FUSED_DURABILITY };
  const durMax = Math.min(MAX_FUSED_DURABILITY, durRaw.max);
  const dur = { max: durMax, current: Math.min(durMax, durRaw.current) };
  const dd = fusedDice(v.damageDice);
  const dt = oneOf(v.damageType, DAMAGE_TYPES);
  const scales = oneOf(v.scalesWith, ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma'] as const);
  const slot = oneOf(v.armorSlot, ARMOR_SLOTS);
  const resist = oneOf(v.resistance, DAMAGE_TYPES);
  const ac = v.acBonus != null ? int(v.acBonus, 0, MAX_AC_BONUS, 0) : undefined;
  const sb = statBonuses(v.statBonuses);
  return {
    kind, rarity, durability: dur,
    ...(dd ? { damageDice: dd } : {}),
    ...(dt ? { damageType: dt } : {}),
    ...(scales ? { scalesWith: scales } : {}),
    ...(slot ? { armorSlot: slot } : {}),
    ...(resist ? { resistance: resist } : {}),
    ...(ac != null && ac > 0 ? { acBonus: ac } : {}),
    ...(sb ? { statBonuses: sb } : {}),
    ...(str(v.special, 160) ? { special: str(v.special, 160) } : {}),
  };
}

/** Worked-in armour resists: ADDED_RESIST_CAP is 3, +1 with the upgrade. */
function addedResists(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const raw of v) {
    const t = oneOf(raw, DAMAGE_TYPES);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 4) break;
  }
  return out.length > 0 ? out : undefined;
}

// ---- gear ------------------------------------------------------------------
/** ⚠⚠ ALLOWLIST RECONSTRUCTION. Every field is named here or it does not
 *  survive. Note what is deliberately ABSENT and can never cross the wire:
 *    · `golemCore`      — half a trained golem, minted from a text file.
 *    · `uniqueStats`    — fused one-of-a-kinds; a foreign kit is not a forge.
 *    · `coating*`       — a whole status-effect surface, dropped for a blade.
 *    · `stolen` / `selfCrafted` / `reserved*` / `materializing` / `forming*`
 *                       — local bookkeeping flags that mean nothing off-phone
 *                         and misbehave when they arrive pre-set.
 *  Returns null when the piece is unusable; callers drop it and keep going. */
export function sanitizeForeignGearPiece(raw: unknown): FallenGearPiece | null {
  if (!isObj(raw)) return null;
  const name = str(raw.name, 60);
  if (!name) return null;
  const kind = str(raw.kind, 16) as ItemKind;
  if (!(KINDS as readonly string[]).includes(kind)) return null;

  const slotRaw = str(raw.slot, 12).toLowerCase();
  const slot = (GEAR_SLOTS as readonly string[]).includes(slotRaw) ? slotRaw : '';
  const rarityRaw = str(raw.rarity, 16) as Rarity;
  const rarity: Rarity = RARITIES.includes(rarityRaw) ? rarityRaw : 'Common';
  const desc = str(raw.description, 300);
  const dur = durability(raw.durability);

  // instanceStats is the one per-instance carrier that crosses, because it is
  // what makes a veteran's kit feel like a veteran's kit — clamped hard.
  let instanceStats: { acBonus?: number; statBonuses?: { stat: string; amount: number }[] } | undefined;
  if (isObj(raw.instanceStats)) {
    const ac = isObj(raw.instanceStats) && raw.instanceStats.acBonus != null
      ? int(raw.instanceStats.acBonus, 0, MAX_AC_BONUS, 0)
      : undefined;
    const sb = statBonuses(raw.instanceStats.statBonuses);
    if ((ac != null && ac > 0) || sb) {
      instanceStats = { ...(ac != null && ac > 0 ? { acBonus: ac } : {}), ...(sb ? { statBonuses: sb } : {}) };
    }
  }

  // ⚠ The player's own work on this piece, carried across under the ceilings
  // above. Still an ALLOWLIST — each field is named and clamped, nothing is
  // spread — so widening what travels did not widen what can be injected.
  const c1 = coating(raw.coating);
  const c2 = coating(raw.coating2);
  const fused = uniqueStats(raw.uniqueStats);
  const resists = addedResists(raw.addedResists);

  const piece: FallenGearPiece = {
    name,
    kind,
    rarity,
    tags: tags(raw.tags),
    slot,
    ...(desc ? { description: desc } : {}),
    ...(dur ? { durability: dur } : {}),
    ...(instanceStats ? { instanceStats } : {}),
    ...(c1 ? { coating: c1 } : {}),
    // A second coating only exists on a Crucible-upgraded weapon, and only
    // alongside a first one.
    ...(c1 && c2 ? { coating2: c2, coatingSlots: 2 } : {}),
    ...(fused ? { uniqueStats: fused } : {}),
    ...(resists ? { addedResists: resists } : {}),
    ...(resists && resists.length > 3 ? { resistCapBonus: 1 } : {}),
  } as FallenGearPiece;
  return piece;
}

// ---- the fallen ------------------------------------------------------------
// ---- pairing ---------------------------------------------------------------
/** ⚠⚠ THE HANDSHAKE. Owner: *"so you send a fallen request, the other player
 *  accepts it, then it's open to an OTA from the other player?"* — yes, and the
 *  accept is the part that matters. The validator makes a stranger's payload
 *  SAFE (it cannot inject gear or wedge a save); it does not make it WANTED.
 *  Without a pairing list, any payload that parses gets in, and "who am I
 *  playing with" is answered by whoever pastes hardest.
 *
 *  ⚠ A pairing is a LOCAL decision, not a negotiated session. Each side stores
 *  the other's house card once and can revoke it forever after. There is no
 *  server to agree with, no session to expire, and nothing to re-do when the
 *  automatic mailbox lands — the mailbox will simply deliver payloads that this
 *  list already decides to accept or ignore. */
export interface PairedHouse {
  player: string;
  installId: string;
  /** When this house was accepted here. */
  addedTs: number;
  /** ⚠ Their sending key, carried inside their house card. Verifies that a
   *  payload claiming to be theirs actually is. Absent on a card from before
   *  seals existed — such a house is still paired, just unsealed, and the
   *  import path says so out loud rather than pretending. */
  key?: string;
}

/** A house card: everything another player needs to accept you, in one line
 *  they can text. Checksummed so a truncated or mangled paste is REFUSED rather
 *  than silently pairing you with a house whose id lost a character. */
export function makeHouseCode(house: string, installId: string, sendingKey?: string): string {
  const h = (house || 'an unnamed house').slice(0, 32);
  // TAR2 carries the sending key; TAR1 (no key) still parses, so a card written
  // before seals existed pairs fine — unsealed, and labelled as such.
  const body = sendingKey ? `${h}|${installId}|${sendingKey}` : `${h}|${installId}`;
  const tag = sendingKey ? 'TAR2' : 'TAR1';
  return `${tag}.${encodeURIComponent(body)}.${checksum(body)}`;
}

export function parseHouseCode(code: unknown): { player: string; installId: string; key?: string } | null {
  const raw = typeof code === 'string' ? code.trim() : '';
  // Tolerate a paste that dragged along surrounding chat text.
  const m = /TAR([12])\.([^.\s]+)\.([0-9a-z]+)/i.exec(raw);
  if (!m) return null;
  let body: string;
  try { body = decodeURIComponent(m[2]!); } catch { return null; }
  if (checksum(body) !== m[3]!.toLowerCase()) return null;
  const parts = body.split('|');
  // A house name may not contain '|' — the id and key are the trailing fields.
  const withKey = m[1] === '2' && parts.length >= 3;
  const key = withKey ? (parts.pop() ?? '').trim().slice(0, 64) : undefined;
  const installId = (parts.pop() ?? '').trim().slice(0, 40);
  const player = parts.join('|').trim().slice(0, 32);
  if (!player || !installId) return null;
  if (withKey && !key) return null;
  return key ? { player, installId, key } : { player, installId };
}

/** Small, fast, and not a security boundary — this catches TRUNCATION, not
 *  forgery. Forgery is what the pairing list and the validator are for. */
function checksum(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Is this house one we agreed to ride with? */
export function isPairedHouse(installId: string, paired: readonly PairedHouse[]): boolean {
  return paired.some((p) => p.installId === installId);
}

/** ⚠⚠ THE LINEAGE NAME. Owner: *"how about keeping it medieval so the fallen is
 *  'Francis child of Sasmooch'"* — and it is the right frame, because it says
 *  the true thing: a character belongs to the player who raised them, and when
 *  they die in someone else's world that parentage is the whole point. Your own
 *  dead keep their bare name; only a corpse that travelled carries its house.
 *
 *  ⚠ This is the ROLL and PROSE name, deliberately not the combat name. The
 *  enemy stays "Hollowed Francis" (revenantName) — every swing, block and miss
 *  line prints that name, and a lineage in all of them reads as clutter by the
 *  third round. It belongs where it lands with weight: the Arbiter naming what
 *  just stood up, the roll of the fallen, and the trophy line after the kill. */
/** ⚠⚠ OTA-1370 — THE NAME GATE, now shared code behind a product flag. Owner: *"port the feature to Hal, but make it
 *  only visible if the characters name is Verbal or Sasmooch."*
 *
 *  ⚠ THIS FUNCTION SHIPS ON ALL FOUR LINES. Whether it is CONSULTED is decided
 *  by `FEATURES.fallenSharing` (app/config/features.ts): `'open'` short-circuits
 *  before it is called, `'gated'` calls it. Keeping the function shared and the
 *  CONSTANT per-product is the whole point of step 3 — the alternative is the
 *  hand-ported branch difference this replaces, which was indistinguishable
 *  from drift.
 *
 *  HAL is the live channel — the build other people are actually playing — and
 *  the shared roll of the fallen has never been tested with two real houses.
 *  This is the soft flag that lets it ride along on the owner's own phone
 *  without appearing for anyone else: the whole EXCHANGE panel is absent unless
 *  the character carries one of these names, and the panel is the ONLY entry
 *  point to import or export, so nothing can cross for a locked player.
 *
 *  ⚠ It gates VISIBILITY, not the engine. Everything downstream — the revenant
 *  pool join, the rest records, the gear faucet — stays wired for everyone,
 *  because a locked player's ledger is empty and an empty ledger costs exactly
 *  nothing. That is deliberate: gating the engine too would mean a player who
 *  is later unlocked finds their own machinery in a different state from the
 *  one it was tested in. One switch, one thing switched.
 *
 *  Matched on letters and digits only, case-insensitively, and by PREFIX, so
 *  "Verbal", "verbal76" and "Sasmooch" all pass while a stray "Verbalist" is
 *  the worst it can do — show a panel to somebody who then has nobody paired.
 *  Trivially widened: add a name to the array. */
export const SHARING_UNLOCK_NAMES: readonly string[] = ['verbal', 'sasmooch'];

export function sharingUnlockedFor(name: string | null | undefined): boolean {
  const n = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!n) return false;
  return SHARING_UNLOCK_NAMES.some((allowed) => n.startsWith(allowed));
}

export function fallenTitle(f: { name: string; origin?: FallenOrigin }): string {
  const house = f.origin?.player ?? '';
  return house ? `${f.name} child of ${house}` : f.name;
}

/** The trophy line for the separate roll: who it was, whose it was, who put it
 *  down and where. Reads off a rest record alone — the corpse is long gone. */
export function restRollLine(r: RestRecord): string {
  const who = r.fallenOriginPlayer ? `${r.fallenName} child of ${r.fallenOriginPlayer}` : r.fallenName;
  return `${who} — put to rest by ${r.byCharacter} at ${r.whereRested}.`;
}

/** Stable identity for a foreign corpse: whose install it came from, and when
 *  they died. Names collide; this pair does not. */
export function fallenKey(f: { origin?: FallenOrigin; ts: number }): string {
  return `${f.origin?.installId ?? 'local'}:${Math.round(f.ts)}`;
}

/** ⚠⚠ OTA-1360 — THE CLONE CROSSES. Owner: *"I want a clone sent."*
 *
 *  Numbers a character genuinely reached, so the ceilings are generous — this
 *  is not the place to second-guess someone's build. They are bounded only
 *  enough that a hand-edited file cannot mint an immortal: no legitimate
 *  character approaches these, and a cheater who sets 9,999,999 gets a hard
 *  fight rather than an unkillable one. */
const MAX_CLONE_STAT = 200;
const MAX_CLONE_HP = 5_000;
const MAX_CLONE_AC = 60;

function cloneSnapshot(raw: unknown): FallenSnapshotLike | undefined {
  if (!isObj(raw)) return undefined;
  const st = isObj(raw.stats) ? raw.stats : {};
  const stat = (k: string) => int((st as Record<string, unknown>)[k], 0, MAX_CLONE_STAT, 0);
  const hpMax = int(raw.hpMax, 0, MAX_CLONE_HP, 0);
  if (hpMax <= 0) return undefined;
  return {
    stats: {
      strength: stat('strength'), dexterity: stat('dexterity'), intelligence: stat('intelligence'),
      wisdom: stat('wisdom'), charisma: stat('charisma'), stealth: stat('stealth'),
    },
    hpMax,
    ac: int(raw.ac, 0, MAX_CLONE_AC, 0),
    ...(str(raw.raceId, 40) ? { raceId: str(raw.raceId, 40) } : {}),
    ...(str(raw.factionId, 40) ? { factionId: str(raw.factionId, 40) } : {}),
  };
}

interface FallenSnapshotLike {
  stats: { strength: number; dexterity: number; intelligence: number; wisdom: number; charisma: number; stealth: number };
  hpMax: number;
  ac: number;
  raceId?: string;
  factionId?: string;
}

/** ⚠⚠ THE DOOR. Anything from another phone comes through here or not at all.
 *  `now` is injectable so the clock-skew rule is testable. */
export function sanitizeForeignFallen(raw: unknown, now: number = Date.now()): ForeignFallen | null {
  if (!isObj(raw)) return null;

  const originRaw = raw.origin;
  if (!isObj(originRaw)) return null;
  const installId = str(originRaw.installId, 40);
  const player = str(originRaw.player, 32);
  if (!installId || !player) return null;

  const name = str(raw.name, 32);
  if (!name) return null;

  // A record from the future breaks ordering and eviction, and is the cheapest
  // forgery there is — an attacker's corpse that never ages out of the pool.
  const ts = int(raw.ts, 0, Number.MAX_SAFE_INTEGER, 0);
  if (ts <= 0 || ts > now + MAX_CLOCK_SKEW_MS) return null;

  const gearIn = Array.isArray(raw.gear) ? raw.gear.slice(0, MAX_GEAR_PIECES) : [];
  const gear: FallenGearPiece[] = [];
  for (const g of gearIn) {
    const piece = sanitizeForeignGearPiece(g);
    if (piece) gear.push(piece);
  }

  const gearNames: string[] = [];
  if (Array.isArray(raw.gearNames)) {
    for (const n of raw.gearNames.slice(0, MAX_GEAR_PIECES)) {
      const nm = str(n, 60);
      if (nm) gearNames.push(nm);
    }
  }

  // ⚠ `avengedBy` / `avengedTs` are NOT read. Rest state is derived from this
  // world's own rest records — never asserted by the sender, who would
  // otherwise be able to quietly retire their own corpse out of your pool.
  const out: ForeignFallen = {
    name,
    raceName: str(raw.raceName, 32) || 'Unknown',
    epitaph: str(raw.epitaph, 240),
    locationName: str(raw.locationName, 64) || 'somewhere unmarked',
    kills: int(raw.kills, 0, MAX_KILLS, 0),
    corruption: str(raw.corruption, 32),
    hours: int(raw.hours, 0, MAX_HOURS, 0),
    ts,
    ...(gearNames.length > 0 ? { gearNames } : {}),
    ...(gear.length > 0 ? { gear } : {}),
    ...(cloneSnapshot(raw.snapshot) ? { snapshot: cloneSnapshot(raw.snapshot) } : {}),
    origin: { player, installId },
  };
  return out;
}

// ---- rest records ----------------------------------------------------------
/** One rest, keyed so that EVERY player may put down their own copy of the same
 *  corpse. Per-world rest is what keeps the pool heavy: five people's dead are
 *  not cleared by whoever reaches them first. */
export function restKey(r: { fallenKey: string; byInstallId: string }): string {
  return `${r.fallenKey}|${r.byInstallId}`;
}

export function sanitizeRestRecord(raw: unknown, now: number = Date.now()): RestRecord | null {
  if (!isObj(raw)) return null;
  const fk = str(raw.fallenKey, 60);
  const byInstallId = str(raw.byInstallId, 40);
  if (!fk || !byInstallId) return null;
  const ts = int(raw.ts, 0, Number.MAX_SAFE_INTEGER, 0);
  if (ts <= 0 || ts > now + MAX_CLOCK_SKEW_MS) return null;
  const description = str(raw.description, 400);
  return {
    fallenKey: fk,
    fallenName: str(raw.fallenName, 32) || 'a nameless one',
    fallenOriginPlayer: str(raw.fallenOriginPlayer, 32),
    byPlayer: str(raw.byPlayer, 32) || 'a wanderer',
    byInstallId,
    byCharacter: str(raw.byCharacter, 32) || 'a wanderer',
    whereRested: str(raw.whereRested, 64) || 'unmarked ground',
    ts,
    ...(description ? { description } : {}),
  };
}

// ---- the wire envelope -----------------------------------------------------
export interface LedgerPayload {
  fallen: ForeignFallen[];
  rests: RestRecord[];
}

/** Parse whatever arrived. Tolerant by design: a torn file, a truncated
 *  download, or one bad record must cost only that record — never a throw on
 *  the caller's thread, and never the rest of the batch. */
export function parseLedgerPayload(input: unknown, now: number = Date.now()): LedgerPayload {
  let doc: unknown = input;
  if (typeof input === 'string') {
    try { doc = JSON.parse(input); } catch { return { fallen: [], rests: [] }; }
  }
  if (!isObj(doc)) return { fallen: [], rests: [] };
  const fallen: ForeignFallen[] = [];
  const rests: RestRecord[] = [];
  if (Array.isArray(doc.fallen)) {
    for (const f of doc.fallen.slice(0, 500)) {
      const ok = sanitizeForeignFallen(f, now);
      if (ok) fallen.push(ok);
    }
  }
  if (Array.isArray(doc.rests)) {
    for (const r of doc.rests.slice(0, 1000)) {
      const ok = sanitizeRestRecord(r, now);
      if (ok) rests.push(ok);
    }
  }
  return { fallen, rests };
}

// ---- merge -----------------------------------------------------------------
/** Has THIS world already put that corpse down? */
export function isRestedHere(key: string, myInstallId: string, rests: readonly RestRecord[]): boolean {
  return rests.some((r) => r.fallenKey === key && r.byInstallId === myInstallId);
}

/** ⚠⚠ THE MERGE, exactly as the owner specified it: *"it deletes already killed
 *  fallen and already existing fallen and merges them to your save."*
 *    · already existing → deduped by key (records are immutable, so union is
 *      the whole operation — no conflict resolution anywhere).
 *    · already killed   → dropped, per THIS world's rest records.
 *    · plus: our own dead never come home, and the pool stays capped.
 *  Eviction takes the OLDEST first, so the corpses you have not met yet are
 *  the ones that survive a full pool. */
export function mergeFallen(
  existing: readonly ForeignFallen[],
  incoming: readonly ForeignFallen[],
  opts: { myInstallId: string; rests?: readonly RestRecord[]; cap?: number },
): MergeFallenResult {
  const { myInstallId } = opts;
  const rests = opts.rests ?? [];
  const cap = opts.cap ?? FOREIGN_FALLEN_CAP;

  const pool = [...existing];
  const held = new Set(pool.map((f) => fallenKey(f)));
  const added: ForeignFallen[] = [];
  let rejected = 0;
  let skippedOwn = 0;
  let skippedRested = 0;
  let skippedDuplicate = 0;

  for (const f of incoming) {
    if (!f || !f.origin?.installId) { rejected += 1; continue; }
    if (f.origin.installId === myInstallId) { skippedOwn += 1; continue; }
    const key = fallenKey(f);
    if (held.has(key)) { skippedDuplicate += 1; continue; }
    if (isRestedHere(key, myInstallId, rests)) { skippedRested += 1; continue; }
    held.add(key);
    pool.push(f);
    added.push(f);
  }

  let evicted = 0;
  if (pool.length > cap) {
    pool.sort((a, b) => a.ts - b.ts);
    evicted = pool.length - cap;
    pool.splice(0, evicted);
    // A record evicted the same merge that admitted it never really arrived.
    const survived = new Set(pool.map((f) => fallenKey(f)));
    for (let i = added.length - 1; i >= 0; i -= 1) {
      if (!survived.has(fallenKey(added[i]!))) added.splice(i, 1);
    }
  }
  return { pool, added, rejected, skippedOwn, skippedRested, skippedDuplicate, evicted };
}

/** Rest records union the same way. Newest kept when the cap bites — the roll
 *  is a trophy shelf, and the recent kills are the ones anyone looks at. */
export function mergeRests(
  existing: readonly RestRecord[],
  incoming: readonly RestRecord[],
  cap: number = REST_RECORD_CAP,
): { rests: RestRecord[]; added: RestRecord[]; skippedDuplicate: number; evicted: number } {
  const rests = [...existing];
  const held = new Set(rests.map((r) => restKey(r)));
  const added: RestRecord[] = [];
  let skippedDuplicate = 0;
  for (const r of incoming) {
    const key = restKey(r);
    if (held.has(key)) { skippedDuplicate += 1; continue; }
    held.add(key);
    rests.push(r);
    added.push(r);
  }
  let evicted = 0;
  if (rests.length > cap) {
    rests.sort((a, b) => a.ts - b.ts);
    evicted = rests.length - cap;
    rests.splice(0, evicted);
  }
  return { rests, added, skippedDuplicate, evicted };
}

/** ⚠⚠ THE GEAR FAUCET. The open question I kept flagging, decided rather than
 *  left hanging: a Hollowed hands back the REAL kit its character died in, and
 *  with five houses feeding the pool that is a new inflow of Rare and Legendary
 *  gear from saves this player does not control.
 *
 *  The call: a FOREIGN corpse yields its WEAPON only. Armour rolls are skipped.
 *  Reasoning — the weapon is the whole emotional point ("you carry their blade
 *  now"), it is one piece and you can only swing one, and it is already the
 *  guaranteed reclaim. Armour is where the volume lives: four slots per corpse,
 *  times five houses, and the economy drowns quietly.
 *
 *  ⚠ AND THE RARITY IS NOT TOUCHED. Degrading a foreign Legendary to Rare was
 *  the obvious alternative and it is the wrong one: it lies about a specific
 *  character's gear. "Francis died carrying this" should mean the thing Francis
 *  carried. Cut the volume, keep the truth.
 *
 *  Your OWN dead are unchanged — full kit, full rolls, exactly as before. */
export const FOREIGN_RECLAIM_WEAPON_ONLY = true;

export function foreignReclaimAllowsArmor(): boolean {
  return !FOREIGN_RECLAIM_WEAPON_ONLY;
}

/** ⚠⚠ THE DIFFICULTY DIAL. Owner: *"it makes the game harder as the fallen
 *  start to populate the world."* The base roll has always been a flat 4% on
 *  quiet novel ground, and pooling five players' dead would NOT have changed
 *  that on its own — you would simply have met more varied Hollowed at exactly
 *  the same rate. Variety is not escalation, so the rate itself has to climb.
 *
 *  Deliberately GENTLE: one point per un-rested foreign corpse, ceiling 12%.
 *  Two friends' pools feel like weather; a full pool of forty is a road you
 *  think twice about walking. Raising this later is one number and no argument;
 *  shipping it too hot and taking it back costs a player their character. */
export const REVENANT_BASE_CHANCE = 0.04;
export const REVENANT_CHANCE_PER_FALLEN = 0.01;
export const REVENANT_CHANCE_CEILING = 0.12;

export function revenantSpawnChance(unrestedForeignCount: number): number {
  const n = Math.max(0, Math.floor(unrestedForeignCount || 0));
  return Math.min(REVENANT_CHANCE_CEILING, REVENANT_BASE_CHANCE + REVENANT_CHANCE_PER_FALLEN * n);
}

/** The un-rested pool the revenant spawner should draw from. */
export function unrestedFallen(
  pool: readonly ForeignFallen[],
  myInstallId: string,
  rests: readonly RestRecord[],
): ForeignFallen[] {
  return pool.filter((f) => !isRestedHere(fallenKey(f), myInstallId, rests));
}
