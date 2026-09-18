// OTA-998 — THE HOLLOWED. The install's Fallen roll made flesh: a character
// who died in the mud does not always stay down. Unlike the other Aetherkin —
// frightened, defensive things clutching at what they were — a Hollowed
// REMEMBERS being a warrior. It kept the drilled muscle, the custom kit it
// died in, and the hunger for the fight it never finished. It lost only the
// fear. Each is a one-time BOSS event; putting one down is a mercy every
// faction understands (no Aetherkin reverence penalty — see isRevenant), and
// the Fallen memorial marks them "put to rest".
import type { Enemy, FallenGearPiece, InventoryItem } from './types';
import type { FallenHero } from './saveSystem';
import { RING_SLOTS } from './equipment';

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const REVENANT_TRAIT = 'fallen_revenant';

export function revenantName(f: Pick<FallenHero, 'name'>): string {
  return `Hollowed ${f.name}`;
}

/** Trait-marked, and the name carries no 'aetherkin' — BOTH on purpose, so
 *  aetherkin.isAetherkin() stays false and the kill never costs reverence
 *  standing. Locked by test. */
export function isRevenant(enemy: { traits?: string[] } | null | undefined): boolean {
  return !!enemy?.traits?.includes(REVENANT_TRAIT);
}

// ---- install-wide pool cache (loadFallen is async; the spawner is sync) ----
let FALLEN_CACHE: FallenHero[] | null = null;
export function primeFallenCache(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadFallen } = require('./saveSystem') as typeof import('./saveSystem');
  void loadFallen().then((f) => { FALLEN_CACHE = f; }).catch(() => { /* stay empty */ });
}
export function cachedFallen(): FallenHero[] {
  if (FALLEN_CACHE === null) { FALLEN_CACHE = []; primeFallenCache(); }
  return FALLEN_CACHE;
}
export function _setFallenCacheForTests(f: FallenHero[] | null): void { FALLEN_CACHE = f; }
/** OTA-991 — a death recorded THIS session joins the pool immediately. The cache
 *  was primed once per process and only markAvenged wrote to it, so a fallen
 *  predecessor could not rise for a successor until app restart. */
export function appendFallenToCache(f: FallenHero): void {
  if (FALLEN_CACHE) FALLEN_CACHE = [...FALLEN_CACHE, f];
}
/** ⚠⚠ OTA-1362 — THE POOL THE SPAWNER DRAWS FROM, local dead AND imported.
 *  This is the single join between the shared ledger and the existing Hollowed
 *  machinery: everything downstream — the scaling, the intro beats, the reclaim,
 *  the defeat lines — already works on a FallenHero and never asks where it came
 *  from. A foreign corpse is just one more name on the roll.
 *
 *  Kept lazy-required so the pure revenant module never hard-depends on storage,
 *  and so a ledger that fails to load costs the extra pool and nothing else. */
/** Did this corpse come from another house? */
export function isForeignFallen(f: FallenHero): boolean {
  return !!(f as { origin?: { installId?: string } }).origin?.installId;
}

/* ⚠⚠⚠ OTA-1843 — THE HOUSE WAS IN THE RECORD AND IN NONE OF THE WORDS.
 *
 * `origin.player` has ridden on every foreign corpse since OTA-1362, and until
 * now not one player-facing sentence said it. The emergence beat, the Arbiter's
 * identification, the enemy's own flavor, the defeat lines — every one of them
 * named the character, the ground they fell on, their epitaph and their kill
 * count, and none of them named the person whose game they came out of. So a
 * Hollowed sent across by a friend read exactly like one grown from your own
 * dead, and the single fact that makes the whole mechanic worth having —
 * THIS WAS ANOTHER REAL PLAYER'S CHARACTER — was the one fact the game kept to
 * itself.
 *
 * ⚠ THE DATA DID NOT CHANGE. Nothing below reads a field that was not already
 * there; these are the same records, finally saying out loud what they hold. */

/** The house a foreign corpse came out of, or null for your own dead. */
export function revenantHouse(f: FallenHero): string | null {
  const house = (f as { origin?: { player?: string } }).origin?.player;
  return house && house.trim() ? house.trim() : null;
}

/** "<name> child of <house>" for a foreign corpse, bare name for your own.
 *  ⚠ Derived here rather than imported from `fallenLedger` so this module keeps
 *  its no-hard-dependency-on-storage property; the spelling is pinned against
 *  `fallenTitle` by test so the two can never drift into two namings. */
export function revenantTitle(f: FallenHero): string {
  const house = revenantHouse(f);
  return house ? `${f.name} child of ${house}` : f.name;
}

/** ⚠ THE PROVENANCE SENTENCE, one authority for every surface that shows it.
 *  Stat-neutral by construction: it is prose, and the only thing it is ever
 *  written into is a field the item model already had. */
export function fallenProvenanceLine(f: FallenHero): string {
  const house = revenantHouse(f);
  return house
    ? `Carried to the end by ${f.name} child of ${house}, and recovered from the mud that kept them.`
    : `Carried to the end by ${f.name} of your own dead, and recovered from the mud that kept them.`;
}

export function revenantPool(): FallenHero[] {
  const local = cachedFallen().filter((f) => !f.avengedTs);
  let foreign: FallenHero[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require('./fallenLedgerStore') as typeof import('./fallenLedgerStore');
    foreign = store.foreignPool();
  } catch { foreign = []; }
  return [...local, ...foreign];
}

export function markAvenged(ts: number, by: string): void {
  if (FALLEN_CACHE) {
    FALLEN_CACHE = FALLEN_CACHE.map((f) => (f.ts === ts ? { ...f, avengedBy: by, avengedTs: Date.now() } : f));
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { markFallenAvenged } = require('./saveSystem') as typeof import('./saveSystem');
  // OTA-994 — the memorial write RETRIES. Fire-and-forget meant one failed disk
  // write let a put-to-rest revenant rise again after an app restart.
  void (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await markFallenAvenged(ts, by); return; }
      catch { await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); }
    }
  })();
}

/** The kit they died in. Post-998 deaths record it; pre-998 records get a
 *  SEEDED custom loadout (Rare-or-better) so the same fallen always wears —
 *  and can drop — the same gear. */
export function revenantGearNames(f: FallenHero): string[] {
  if (f.gearNames && f.gearNames.length > 0) return f.gearNames.slice(0, 10);
  type GearRow = { name: string; rarity: string };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const wj = require('../data/items/weapons.json') as unknown;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const aj = require('../data/items/armor.json') as unknown;
  const wRows: GearRow[] = Array.isArray(wj) ? (wj as GearRow[]) : ((wj as { weapons?: GearRow[] }).weapons ?? []);
  const aRows: GearRow[] = Array.isArray(aj) ? (aj as GearRow[]) : ((aj as { armor?: GearRow[] }).armor ?? []);
  const rng = mulberry32(hashSeed(`fallen:${f.name}:${f.ts}`));
  const out: string[] = [];
  const takeFrom = (rows: Array<{ name: string; rarity: string }>, n: number) => {
    const pool = rows.filter((r) => r.rarity === 'Rare' || r.rarity === 'Legendary');
    for (let i = 0; i < n && pool.length > 0; i++) {
      const p = pool[Math.floor(rng() * pool.length)]!;
      if (!out.includes(p.name)) out.push(p.name);
    }
  };
  takeFrom(wRows, 1);
  takeFrom(aRows, 2);
  if (out.length === 0) out.push('Aetheric Shard');
  return out;
}

/** Boss-band revenant: their lifetime record feeds the monster — your best
 *  dead make the worst Hollowed. Standard defeat-path loot rolls draw from
 *  the died-in kit (the "chance to drop what they wore"). */
/** ⚠⚠ OTA-1366 — THE CLONE'S OWN NUMBERS. Owner: *"I want a clone sent."*
 *
 *  When a record carries a snapshot, the Hollowed fights as that character
 *  fought: their real hpMax, their strongest attribute, and the damage of the
 *  weapon actually in their hand — a fused blade's own dice, else the catalog
 *  or inference resolution of its name. No kill-count formula, no scaling off
 *  the living player.
 *
 *  ⚠ THE BALANCE CONSEQUENCE, STATED PLAINLY: the old build capped HP at the
 *  LIVING player's hpMax × 2.5, which quietly guaranteed every Hollowed was
 *  fightable. A clone has no such courtesy — a veteran's corpse walking into a
 *  fresh character's wastes is a wall, and a rookie's is a pushover. That is
 *  what "exactly as it was when they died" means, and it is the owner's call.
 *  `CLONE_HP_CAP_MULTIPLIER` is the one line that puts a ceiling back. */
export const CLONE_HP_CAP_MULTIPLIER: number | null = null;

/** The damage the weapon in their hand actually deals. */
function cloneWeaponDamage(f: FallenHero): string | null {
  const piece = (f.gear ?? []).find((g) => g.slot === 'main') ?? (f.gear ?? [])[0];
  if (!piece) return null;
  // A fused one-of-a-kind carries its own dice — the truest number there is.
  const fused = (piece as { uniqueStats?: { damageDice?: string } }).uniqueStats?.damageDice;
  if (typeof fused === 'string' && /^\d{1,2}d\d{1,3}$/.test(fused)) return fused;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findWeaponByName } = require('./crafting') as typeof import('./crafting');
    const w = findWeaponByName(piece.name);
    if (w?.damageDice) return w.damageDice;
  } catch { /* fall through to the kill-count band */ }
  return null;
}

export function revenantFromFallen(f: FallenHero, playerHpMax: number): Enemy {
  const gear = revenantGearNames(f);
  pinSeededKit(f, gear);
  const kills = Math.max(0, Math.floor(f.kills || 0));
  const snap = f.snapshot;
  // The clone's own health, or the legacy kill-count band for records written
  // before a character was ever recorded.
  const hp = snap && snap.hpMax > 0
    ? (CLONE_HP_CAP_MULTIPLIER
      ? Math.max(20, Math.min(Math.round(Math.max(40, playerHpMax) * CLONE_HP_CAP_MULTIPLIER), Math.round(snap.hpMax)))
      : Math.max(20, Math.round(snap.hpMax)))
    : Math.max(60, Math.min(Math.round(Math.max(40, playerHpMax) * 2.5), 90 + kills * 2));
  const damage = cloneWeaponDamage(f)
    ?? (kills >= 150 ? '3d8' : kills >= 60 ? '2d8' : '2d6');
  return {
    name: revenantName(f),
    type: 'Hollowed Revenant',
    // Their strongest attribute, as it stood — not a hard-coded 'Strength 6'.
    abilityPoint: (() => {
      if (!snap?.stats) return 'Strength 6';
      const entries = Object.entries(snap.stats) as [string, number][];
      const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a), entries[0]!);
      return `${best[0].charAt(0).toUpperCase()}${best[0].slice(1)} ${Math.round(best[1])}`;
    })(),
    attack: `${gear[0] ?? 'Mud-Fused Blade'} (remembered)`,
    damage,
    hp,
    rarity: 'Legendary',
    // ⚠⚠ OTA-1362 — THE GEAR FAUCET. A foreign corpse yields its WEAPON only:
    // the guaranteed reclaim still fires (the blade is the emotional point and
    // you can swing exactly one), but the armour drop pool is empty. Armour is
    // where the volume lives — four slots per corpse times five houses — and
    // that inflow comes from saves this player does not control. Rarity is
    // untouched on purpose: degrading a foreign Legendary would lie about what
    // that specific character actually carried. Cut the volume, keep the truth.
    // Your own dead are unchanged.
    loot: isForeignFallen(f) ? [] : gear.slice(0, 4),
    boss: true,
    traits: [REVENANT_TRAIT, 'boss'],
    // ⚠ OTA-1843 — the house, for a foreign corpse. Appended rather than woven
    // in, so the sentence a local Hollowed carries is byte-identical to what it
    // always was and only a foreign one gains anything.
    flavor: `${f.raceName}, once. ${kills} foes to the name before ${f.locationName} took them. No stone ever closed over this one — the work was still burning when they went down, and the mud gave back the task and kept the fear.${
      revenantHouse(f) ? ` They belong to ${revenantHouse(f)} — another player's dead, walking here.` : ''}`,
  };
}

/** ⚠⚠⚠ OTA-1843 — THE ORDERED BEATS, BUILT HERE AND NOT IN THE STORE.
 *
 *  `gameStore` is at its line ceiling by design, and the rule that ceiling
 *  states is the right one anyway: "the responsibility belongs in a module
 *  outside the file". Deciding WHICH lines a Fallen encounter prints, on WHICH
 *  channel, in WHAT order, is presentation — it belongs next to the sentences,
 *  not in the middle of the spawner. The store's two spawn sites and its defeat
 *  site now each walk one of these arrays, which is both less store code than
 *  they had before and one authority instead of three hand-ordered copies that
 *  had already drifted (the hook route printed no signature at all until this
 *  function existed to be shared).
 *
 *  ⚠ THE CHANNELS ARE THE STORE'S OWN. Kept as a narrow string union rather
 *  than importing `LogChannel` from the state layer, because this module's
 *  no-hard-dependency-on-storage property is load-bearing for the spawner. */
export type FallenLogChannel = 'world' | 'arbiter' | 'combat' | 'system' | 'reward';
export interface FallenLogLine { channel: FallenLogChannel; text: string }

/** Everything the player reads when a Hollowed stands up, in order. */
export function revenantArrivalLog(f: FallenHero, foeName: string, wearsYourFace: boolean): FallenLogLine[] {
  const b = revenantIntroBeats(f, wearsYourFace);
  return [
    // ⚠ The signature leads, and only for a foreign corpse: "this is another
    // player's dead" is the first thing read, not a detail three beats down.
    ...(b.signature ? [{ channel: 'system' as const, text: b.signature }] : []),
    { channel: 'world', text: b.emergence },
    { channel: 'arbiter', text: b.identification },
    { channel: 'world', text: b.identity },
    { channel: 'combat', text: `\u2694 BOSS EVENT \u2014 ${foeName}. ${b.character}` },
  ];
}

/** Everything the player reads when it goes down — which is also the rest. */
export function revenantRestLog(f: FallenHero, by: string): FallenLogLine[] {
  const d = revenantDefeatLines(f, by);
  return [
    { channel: 'world', text: d.world },
    { channel: 'reward', text: d.reward },
    // ⚠ WHAT GOES HOME, said before it goes. Null for your own dead: nothing
    // travels, and promising a word to a house that does not exist would make
    // the transcript a liar.
    ...(d.homeward ? [{ channel: 'system' as const, text: d.homeward }] : []),
  ];
}

/** ⚠⚠ OTA-1843 — THE SIGNATURE. One line, the same shape every time, so a
 *  player learns in two encounters what they are looking at. It says whose dead
 *  this is and nothing about how that was established — no seal, no house code,
 *  no trust word. Those belong to the exchange screen; in the mud, the only
 *  question is whose name is on it. Returns null for your own dead, which is
 *  what keeps an ordinary local Hollowed from wearing a foreign banner. */
export function revenantSignature(f: FallenHero): string | null {
  const house = revenantHouse(f);
  if (!house) return null;
  return `☗ ONE OF THE FALLEN — ${f.name} child of ${house}. This one walked in another player's world before it walked in yours.`;
}

export function revenantIntroBeats(f: FallenHero, wearsYourFace: boolean): {
  emergence: string; identification: string; identity: string; character: string;
  /** ⚠ OTA-1843 — null for your own dead. See `revenantSignature`. */
  signature: string | null;
} {
  const house = revenantHouse(f);
  return {
    signature: revenantSignature(f),
    emergence: 'The mud ahead stands up wearing armor. Not the shapeless dead — this one moves like drilled muscle, sets its feet like it has done ten thousand times, and it is already closing.',
    identification: wearsYourFace
      ? `The Arbiter goes very quiet. "Steady. It wears your face. ${f.name} died at ${f.locationName} — and the mud remembers everything you taught it."`
      : house
        ? `"${f.name} child of ${house}," the Arbiter says, barely above the wind. "Not ours. Fell at ${f.locationName}, ${f.hours} hours into the walk — in a world that is not this one, under a hand that is not yours. Their house kept the roll. The mud kept them, and the mud does not care whose they were."`
        : `"${f.name}," the Arbiter says, barely above the wind. "Fell at ${f.locationName}, ${f.hours} hours into the walk. The roll remembers them. The mud kept them."`,
    identity: `${f.epitaph} Where the sleeping Aetherkin were received by the Aether and let go of everything, this one was never taken in — the errand was too heavy to set down, so no stone ever formed. ${f.kills} foes to the name, and the task still moving on its lips like a man counting steps in the dark.`,
    character: 'It cannot be talked down, because there is nothing left in there to talk to — only the last order it was given, worn down to a groove. It will not stop. Put them to rest. Nothing else is mercy.',
  };
}

/** ⚠⚠ OTA-1843 — DEFEAT IS ALSO THE REST, and that is not a thing this OTA
 *  changed. The store writes the rest record on the same beat it writes these
 *  lines: there is no second gesture, no "go and bury them later". So this is
 *  the closure ceremony, and it has to read like one — which is why the house
 *  belongs here more than anywhere else. The person on the other phone is about
 *  to be told their character's story ended. The player doing it should know
 *  whose story that was.
 *
 *  ⚠ `homeward` is NULL for your own dead: nothing travels, so promising a
 *  word to a house that does not exist would be the transcript lying. */
export function revenantDefeatLines(f: FallenHero, by: string): {
  world: string; reward: string; homeward: string | null;
} {
  const house = revenantHouse(f);
  return {
    world: `The task goes out of them first — you watch it leave the mouth mid-word, an errand four hundred years old finally set down. Then the light. For one clear breath the mud lets go, and it is only ${f.name} again — ${f.raceName}, ${f.kills} foes to the name, the warrior the roll remembers. The stone closes over them the way it should have the first time. They rest now — received at last, and the Aether does not give this one back.`,
    reward: `✦ ${f.name} is at rest. The Fallen roll marks them: put to rest by ${by}.`,
    homeward: house
      ? `${f.name} came out of ${house}'s world and ends in yours. What ${house} will be told: who put them down, where the ground closed, and that it is finished. Send your dead back across and the word goes with them.`
      : null,
  };
}

// ---- OTA — THE RECLAIM. The kit is captured as FULL ITEM COPIES at death and
// handed back as REAL gear when the Hollowed falls: the WEAPON is guaranteed
// (a one-time boss — losing the signature piece to a dice roll could never be
// retried), armor pieces ride the normal chance rolls, and everything returns
// PRISTINE — the mud kept it as it was carried (owner's calls, 2026-07-27).

/** Capture the equipped kit as full item copies (id/quantity stripped, slot
 *  kept, weapon first). Prefers the exact INSTANCE via the equipped `<slot>Id`
 *  pointer so a fused piece keeps its rolled stats; falls back to name match. */
export function buildFallenGearSnapshot(p: {
  equipped?: object | null;
  inventory?: InventoryItem[] | null;
}): FallenGearPiece[] {
  const eq = (p.equipped ?? {}) as Record<string, string | undefined>;
  const inv = p.inventory ?? [];
  const slotPrio = ['main', 'off', 'chest', 'head', 'legs', 'feet', 'amulet', ...RING_SLOTS];
  const out: FallenGearPiece[] = [];
  const slots = Object.keys(eq)
    .filter((k) => !!eq[k] && !k.endsWith('Id'))
    .sort((a, b) => {
      const ia = slotPrio.indexOf(a); const ib = slotPrio.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  // ⚠ OTA-1366 — ten slots, not six. Rings and an amulet are part of the kit
  // they died in, and the old cap silently dropped them from the clone.
  for (const slot of slots.slice(0, 10)) {
    const name = String(eq[slot]);
    const instId = eq[`${slot}Id`];
    const item = (instId ? inv.find((i) => i.id === instId) : undefined) ?? inv.find((i) => i.name === name);
    if (item) {
      const copy = JSON.parse(JSON.stringify(item)) as Omit<InventoryItem, 'id' | 'quantity'> & { id?: string; quantity?: number };
      delete copy.id;
      delete copy.quantity;
      out.push({ ...(copy as Omit<InventoryItem, 'id' | 'quantity'>), name: item.name, slot });
    } else {
      // Equipped name with no live inventory row (legacy save shapes) — keep
      // the name so the kit still reads right; kind from the slot.
      out.push({ name, kind: slot === 'main' || slot === 'off' ? 'weapon' : 'armor', tags: [], slot } as FallenGearPiece);
    }
  }
  return out;
}

/** Rebuild a snapshot piece as a live, PRISTINE inventory item: fresh instance
 *  id, single copy, durability restored to max (owner's call — the mud kept it
 *  whole). Instance stats, coatings and unique rolls ride the copy through. */
/** ⚠⚠⚠ OTA-1843 — THE BLADE REMEMBERS WHOSE HAND IT WAS IN.
 *
 *  `provenance` is written into `description`, a field `InventoryItem` has had
 *  all along and already persists — NO schema change, no migration, and nothing
 *  a stat reader looks at. Any description the captured copy already carried is
 *  kept and the provenance sits in front of it, because the catalog flavour is
 *  not ours to delete.
 *
 *  ⚠ AND IT MAKES THE ROW PER-INSTANCE. Two Legendary swords of the same name
 *  off two different people's corpses are NOT the same object, and before this
 *  they would merge into one stack and one of the two names would be gone. The
 *  one line in `inventory.stackCompatible` that reads the description is what
 *  keeps them apart; it is there and not here because OTA-1737 made that
 *  function the single authority on "are these the same kind of thing", and a
 *  second opinion living in this file is exactly what that OTA removed. */
export function reconstructFallenPiece(piece: FallenGearPiece, id: string, provenance?: string): InventoryItem {
  const { slot: _slot, ...rest } = piece;
  const dur = rest.durability ? { current: rest.durability.max, max: rest.durability.max } : undefined;
  const had = typeof rest.description === 'string' ? rest.description.trim() : '';
  return {
    ...(rest as Omit<InventoryItem, 'id' | 'quantity'>),
    id,
    quantity: 1,
    tags: Array.from(new Set([...(rest.tags ?? []), 'loot', ...(provenance ? ['fallen'] : [])])),
    ...(provenance ? { description: had ? `${provenance} ${had}` : provenance } : {}),
    ...(dur ? { durability: dur } : {}),
  };
}

/** The guaranteed reclaim: the weapon they died holding (slot 'main', else the
 *  first snapshot piece). Null when the record predates snapshots. */
export function revenantReclaimWeapon(f: Pick<FallenHero, 'gear'>): FallenGearPiece | null {
  const gear = f.gear ?? [];
  return gear.find((g) => g.slot === 'main') ?? gear[0] ?? null;
}

/** OTA-994 — pin a SYNTHESIZED (pre-snapshot) kit at first generation: cache now,
 *  disk best-effort. Without this the kit was only stable per BUILD — a Rare+
 *  catalog edit silently re-dressed every legacy fallen. */
export function pinSeededKit(f: FallenHero, names: string[]): void {
  if (f.gearNames && f.gearNames.length > 0) return;
  if (FALLEN_CACHE) {
    FALLEN_CACHE = FALLEN_CACHE.map((x) => (x.ts === f.ts ? { ...x, gearNames: names } : x));
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pinFallenGearNames } = require('./saveSystem') as typeof import('./saveSystem');
  void pinFallenGearNames(f.ts, names).catch(() => { /* pinned in cache; disk is best-effort */ });
}
