// ⚠⚠⚠ OTA-1649 — WHAT A RING IS FOR.
//
// Owner: *"they should give combinations of stat buffs, moderate resists and
// let's get some special AOE effects… each ring doesn't need to have all three
// things. the combinations of 1, 2 or three things should scale with rarity."*
//
// Before this, an accessory could do exactly two things: add ONE stat point or
// two, and (on two rows out of thirty-two) add 1 AC. A third field —
// `resistances`, carried by fifteen rows and printed on the item card — did
// NOTHING: `aggregateArmor`'s resist walk covered ARMOR_SLOTS only, so an
// amulet's list reached the damage math as `[]`. Measured before any of this
// was written; the ota1649 suite re-runs that probe so it can never come back.
//
// ⚠⚠ THE ROW PICKS THE FLAVOUR, THE LADDER PICKS THE NUMBER. Not one catalog
// row carries a magnitude. A ring says "I boost burn coatings"; how much is
// COATED_BOOST_PCT[rarity]. This is the whole reason the owner's *"better
// effects with rarity"* is a property of the system rather than a promise about
// forty-four hand-typed numbers — a row cannot sit off the ladder, and a
// rebalance is one table edit instead of a JSON sweep.
import type { PlayerCharacter, Rarity, CombatRange } from './types';
import { RANGE_ORDER } from './types';
import type { CatalogAccessory, ArmorSlotResist } from './crafting';
import { findAmuletByName, findRingByName } from './crafting';
import { RING_SLOTS } from './equipment';

/** The three things the owner named. `stat` covers flat stat buffs AND the flat
 *  AC bonus — an AC point is a defensive stat, and counting it separately would
 *  make the two shipped +1 AC rings read as richer than they play. */
export type AccessoryFamily = 'stat' | 'resist' | 'special';

export type AccessoryKind = 'ring' | 'amulet';

// ── THE LADDERS ─────────────────────────────────────────────────────────────

/** ⚠⚠⚠ THE LADDER. Owner: *"the combinations of 1, 2 or three things should
 *  scale with rarity."*
 *
 *    Common     1–2 families, never a special
 *    Uncommon   1–2 families, never a special
 *    Rare       2–3 families, a special is allowed
 *    Legendary  all 3 families, a special is REQUIRED
 *
 *  ⚠⚠ THE GATE IS THE SPECIAL, NOT THE COUNT, and that is the whole design.
 *  The first draft of this table pinned an exact count per rarity, and it
 *  failed against the shipped catalog on contact: five accessories — two of
 *  them COMMON (Minor Aetheric Amulet, Aetheric Locket) — already carried two
 *  families, and holding the line would have meant deleting a resist off items
 *  that are sitting in players' packs right now. A ladder is not worth robbing
 *  a save for.
 *
 *  So the rule moved to where the owner's sentence actually points: a Common
 *  gives you a stat and maybe a small ward; a Rare can do something; a
 *  Legendary does all three and always does something. Every band still gets
 *  strictly better than the one below on MAGNITUDE too — every table below
 *  steps up at every rarity — so a two-family Uncommon never out-values a
 *  two-family Rare. And the rule needs no removals at all: the seven rows it
 *  found off-ladder were all missing something, and all seven gained it.
 *
 *  ⚠ MIN IS A FLOOR AND MAX IS A CEILING, both enforced. Without the ceiling
 *  "scales with rarity" is unfalsifiable, because a Common carrying all three
 *  would still satisfy a floor. */
export interface FamilyRule {
  min: number;
  max: number;
  special: 'forbidden' | 'allowed' | 'required';
}
export const FAMILY_RULE: Readonly<Record<Rarity, FamilyRule>> = {
  Common: { min: 1, max: 2, special: 'forbidden' },
  Uncommon: { min: 1, max: 2, special: 'forbidden' },
  Rare: { min: 2, max: 3, special: 'allowed' },
  Legendary: { min: 3, max: 3, special: 'required' },
};

/** Mitigation weight one piece of jewellery contributes against a damage type
 *  it resists. Feeds the SAME multiplicative, diminishing, 0.8-capped stack
 *  armour uses (`armorResistanceFraction`) — jewellery does not get its own
 *  parallel resist math, it joins the one that already exists.
 *
 *  ⚠ AN AMULET BEATS A RING at equal rarity: there is one neck and four
 *  fingers, so pricing them the same would make the neck the worst slot on the
 *  body. Both sit BELOW the chest plate's 0.35 — the owner asked for *moderate*
 *  resists, and no single trinket should out-armour armour.
 *
 *  What the owner's example costs, since he named a number: *"fire resist that
 *  mitigates 50% of incoming fire damage"* is a Legendary amulet + a Legendary
 *  ring + a Rare ring — 1 − (0.74 × 0.80 × 0.85) = 0.497. Three slots spent on
 *  one element buys almost exactly half. One Legendary ring alone buys a fifth. */
export const ACCESSORY_RESIST_WEIGHT: Readonly<Record<AccessoryKind, Readonly<Record<Rarity, number>>>> = {
  amulet: { Common: 0.09, Uncommon: 0.14, Rare: 0.20, Legendary: 0.26 },
  ring: { Common: 0.06, Uncommon: 0.10, Rare: 0.15, Legendary: 0.20 },
};

/** How much harder a matching weapon COATING bites while this is worn. The
 *  owner's example — *"boosts fire coated weapons damage by 25%"* — is the Rare
 *  step, so a Rare burn ring is exactly the item he described. */
export const COATED_BOOST_PCT: Readonly<Record<Rarity, number>> = {
  Common: 0.10, Uncommon: 0.15, Rare: 0.25, Legendary: 0.35,
};

/** How much harder a strike made from stealth lands. The owner's example — *"a
 *  thieves ring could increase stealth damage by 60%"* — is the Legendary step. */
export const STEALTH_DAMAGE_PCT: Readonly<Record<Rarity, number>> = {
  Common: 0.20, Uncommon: 0.35, Rare: 0.50, Legendary: 0.60,
};

/** Flat damage a once-per-encounter discharge deals to every living enemy in
 *  its bands. The owner's example — *"50 frost damage to anything in 2 rings of
 *  range once per combat encounter"* — is the Legendary step. */
export const BURST_DAMAGE: Readonly<Record<Rarity, number>> = {
  Common: 12, Uncommon: 20, Rare: 35, Legendary: 50,
};

// ── READING ONE ROW ─────────────────────────────────────────────────────────

/** Every stat buff a row grants: the primary `statBonus` plus any extras. ⚠ The
 *  primary is NOT duplicated into `statBonuses` in the JSON — it stays exactly
 *  where every existing reader and the item preview already look for it, and
 *  this is the one place that knows both halves are the same list. */
export function accessoryStatBonuses(row: CatalogAccessory): { stat: string; amount: number }[] {
  const out: { stat: string; amount: number }[] = [];
  if (row.statBonus) out.push(row.statBonus);
  for (const b of row.statBonuses ?? []) out.push(b);
  return out;
}

/** Which of the three families a row actually carries. Drives the rarity gate. */
export function accessoryFamilies(row: CatalogAccessory): AccessoryFamily[] {
  const fams: AccessoryFamily[] = [];
  if (accessoryStatBonuses(row).length > 0 || (row.acBonus ?? 0) > 0) fams.push('stat');
  if ((row.resistances ?? []).length > 0) fams.push('resist');
  if (row.coatedBoost || row.stealthDamage || row.burst) fams.push('special');
  return fams;
}

/** Why a row is off the ladder, or null when it is on it. Returns the REASON
 *  rather than a bare boolean so the suite's failure message names the row and
 *  the rule it broke instead of printing `false`. */
export function accessoryLadderViolation(row: CatalogAccessory): string | null {
  const fams = accessoryFamilies(row);
  const rule = FAMILY_RULE[row.rarity];
  const hasSpecial = fams.includes('special');
  if (fams.length < rule.min) return `${row.rarity} needs at least ${rule.min} families, has ${fams.length} (${fams.join('+') || 'none'})`;
  if (fams.length > rule.max) return `${row.rarity} allows at most ${rule.max} families, has ${fams.length} (${fams.join('+')})`;
  if (rule.special === 'forbidden' && hasSpecial) return `${row.rarity} may not carry a special effect`;
  if (rule.special === 'required' && !hasSpecial) return `${row.rarity} must carry a special effect, has only ${fams.join('+')}`;
  return null;
}

/** True when a row sits on the ladder for its rarity. */
export function accessoryOnLadder(row: CatalogAccessory): boolean {
  return accessoryLadderViolation(row) === null;
}

/** The mitigation weight this row contributes per resisted type. */
export function accessoryResistWeight(kind: AccessoryKind, rarity: Rarity): number {
  return ACCESSORY_RESIST_WEIGHT[kind][rarity];
}

// ── READING THE WHOLE HAND ──────────────────────────────────────────────────

export interface AccessoryBurst {
  /** The accessory that discharges — also the key the scene marks as spent. */
  source: string;
  damageType: string;
  amount: number;
  bands: readonly CombatRange[];
}

export interface AccessoryPowers {
  /** Ready to concat onto `aggregateArmor`'s resistSlots. */
  resistSlots: ArmorSlotResist[];
  /** Flat list for the character sheet / item card. */
  resistances: string[];
  /** Best boost per coating kind — see `coatedBoostPct`. */
  coated: Record<string, number>;
  /** Best stealth multiplier on the body, as a fraction (0.6 = +60%). */
  stealthPct: number;
  /** Every discharge the wearer is carrying. */
  bursts: AccessoryBurst[];
}

const EMPTY_POWERS = (): AccessoryPowers => ({
  resistSlots: [], resistances: [], coated: {}, stealthPct: 0, bursts: [],
});

function canonBands(bands: readonly string[] | undefined): CombatRange[] {
  const want = new Set((bands ?? []).map((b) => b.toLowerCase()));
  return RANGE_ORDER.filter((b) => want.has(b));
}

/** Every accessory the player is wearing, as one bundle of live effects.
 *
 *  ⚠ THE SLOT KEY IS THE SLOT NAME, and that is load-bearing: the resist stack
 *  counts each slot at most once per damage type, so four aetheric rings must
 *  arrive as 'ring' / 'ring2' / 'ring3' / 'ring4' and not four copies of one
 *  key. It walks RING_SLOTS for the same reason every other ring reader does
 *  (OTA-1648) — a fifth finger stays one edit. */
export function equippedAccessoryPowers(player: PlayerCharacter | null | undefined): AccessoryPowers {
  const out = EMPTY_POWERS();
  const eq = player?.equipped;
  if (!eq) return out;

  const worn: { slot: string; kind: AccessoryKind; row: CatalogAccessory }[] = [];
  if (eq.amulet) {
    const a = findAmuletByName(eq.amulet);
    if (a) worn.push({ slot: 'amulet', kind: 'amulet', row: a });
  }
  for (const slot of RING_SLOTS) {
    const name = eq[slot];
    if (!name) continue;
    const r = findRingByName(name);
    if (r) worn.push({ slot, kind: 'ring', row: r });
  }

  for (const { slot, kind, row } of worn) {
    const weight = accessoryResistWeight(kind, row.rarity);
    for (const raw of row.resistances ?? []) {
      const type = String(raw).toLowerCase();
      out.resistances.push(type);
      out.resistSlots.push({ type, slot, weight });
    }
    if (row.coatedBoost?.kind) {
      const k = row.coatedBoost.kind.toLowerCase();
      const pct = COATED_BOOST_PCT[row.rarity];
      // ⚠ BEST, NOT SUM. Two burn rings are a redundancy, not a doubling —
      // summing would let four fingers turn a 1d6 coating into a finisher.
      out.coated[k] = Math.max(out.coated[k] ?? 0, pct);
    }
    if (row.stealthDamage) {
      // Best, for the same reason.
      out.stealthPct = Math.max(out.stealthPct, STEALTH_DAMAGE_PCT[row.rarity]);
    }
    if (row.burst?.damageType) {
      const bands = canonBands(row.burst.bands);
      if (bands.length > 0) {
        // ⚠ BURSTS DO STACK, and they are the one thing here that does. Each is
        // a separate object spending a separate slot and each fires ONCE per
        // encounter — a player who gives up four fingers of passive value for
        // four openings has bought exactly one very loud opening round, and
        // then wears four rings that do nothing for the rest of the fight.
        out.bursts.push({
          source: row.name,
          damageType: String(row.burst.damageType).toLowerCase(),
          amount: BURST_DAMAGE[row.rarity],
          bands,
        });
      }
    }
  }
  return out;
}

/** One discharge, resolved against a lineup: who it caught and what it says. */
export interface BurstPlan {
  source: string;
  amount: number;
  damageType: string;
  /** Indices into the scene's enemy array. Empty = it went off at nobody. */
  victims: number[];
  /** Names, for the log line. */
  caught: string[];
  line: string;
}

/** ⚠⚠ WHO A DISCHARGE CATCHES — the whole decision, as a pure function.
 *
 *  It lives here rather than inside the store's swing handler for two reasons.
 *  The first is testability: a burst is the one accessory effect with real
 *  targeting logic, and targeting logic that can only be exercised through a
 *  live combat turn does not get exercised. The second is that gameStore is
 *  under a hard 37,000-line ratchet (ota1400) and this OTA walked it straight
 *  through — which is the ratchet doing its job. The store now applies a plan
 *  it did not compute.
 *
 *  ⚠ THE ACTIVE TARGET IS INCLUDED, unlike a weapon's splash — which skips it
 *  because the swing already hit it. This is a separate source of damage from a
 *  separate object; leaving the thing you are fighting out of your own
 *  detonation would be the odd behaviour, not the fair one.
 *
 *  ⚠ A BURST THAT CATCHES NOBODY IS STILL SPENT (empty `victims`, and the line
 *  says so). Refunding it would make a ring strictly better than a weapon's
 *  splash, which pays exactly the same price. */
export function planBursts(
  bursts: readonly AccessoryBurst[],
  lineup: {
    enemies: readonly { name: string }[];
    hpOf: (i: number) => number;
    knockedOut: (i: number) => boolean;
    bandOf: (i: number) => string | null;
  },
  alreadyFired: readonly string[] = [],
): BurstPlan[] {
  const out: BurstPlan[] = [];
  for (const burst of bursts) {
    if (alreadyFired.includes(burst.source)) continue;
    const bands = new Set<string>(burst.bands);
    const victims: number[] = [];
    const caught: string[] = [];
    lineup.enemies.forEach((e, i) => {
      if (lineup.hpOf(i) <= 0) return;              // never re-kill a corpse
      if (lineup.knockedOut(i)) return;
      const band = lineup.bandOf(i);
      if (!band || !bands.has(band)) return;
      victims.push(i);
      caught.push(e.name);
    });
    out.push({
      source: burst.source,
      amount: burst.amount,
      damageType: burst.damageType,
      victims,
      caught,
      line: victims.length === 0
        ? `${burst.source} discharges into empty ground — nothing is standing close enough.`
        : `${burst.source} discharges — ${burst.amount} ${burst.damageType} across ${caught.join(', ')}.`,
    });
  }
  return out;
}

/** Every plan's damage, applied to one HP row at once.
 *
 *  ⚠ ALL PLANNED, THEN ALL APPLIED, and the order matters. Every discharge is
 *  measured against the SAME lineup and lands in a single write: resolving them
 *  one at a time would let the first ring's kill hide a body from the second,
 *  which is not what "they all go off the moment you commit" means. */
export function applyBursts(enemyHps: readonly number[], plans: readonly BurstPlan[]): number[] {
  return enemyHps.map((hp, i) => Math.max(
    0, hp - plans.reduce((acc, p) => acc + (p.victims.includes(i) ? p.amount : 0), 0),
  ));
}

/** The coating boost that applies to a coating of `kind` — 0 when nothing worn
 *  matches. Fractional: 0.25 means the rolled coating damage rises by a quarter. */
export function coatedBoostPct(powers: AccessoryPowers, kind: string | null | undefined): number {
  if (!kind) return 0;
  return powers.coated[String(kind).toLowerCase()] ?? 0;
}

/** Raise `value` by `pct` (0.25 → a quarter more). Rounds, and NEVER lowers the
 *  number: a 0 pct returns it untouched and a rounding-down result is clamped
 *  back up. Both percentage effects in this module go through it, so a boost
 *  can never quietly cost the player damage. */
export function boostedBy(value: number, pct: number): number {
  if (pct <= 0) return value;
  return Math.max(value, Math.round(value * (1 + pct)));
}

/** ⚠ THE THIEF'S RING, applied to a whole strike.
 *
 *  It multiplies EVERYTHING already banked — dice, riders, coatings — because
 *  "stealth damage" is the damage of a blow landed unseen, not one component of
 *  it. And it does NOT check the weapon: the dice-doubling BACKSTAB in
 *  combatRules is gated on a dexterity weapon, this deliberately is not, since a
 *  ring that only worked for rogues holding daggers would be a second rogue tax
 *  on an item a heavy build might reasonably want. A heavy sneak strike gets the
 *  +5 to-hit and this multiplier; a finesse one gets those AND double dice, so
 *  the rogue stays strictly ahead.
 *
 *  ⚠ THE CALLER MUST READ `RollStep.fromStealth`, NOT THE PLAYER. `stealthed` is
 *  stripped by consumeOnResolve the moment the attack step resolves, and
 *  pendingRolls is nulled before concludeRolls runs — a damage-time read of the
 *  status would miss the exact swing the ring was bought for. */
export function applyStealthDamage(damage: number, pct: number): number {
  return boostedBy(damage, pct);
}
