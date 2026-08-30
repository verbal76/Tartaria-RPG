// runecasterPassives — OTA-1560. WHICH STAT A RUNE-CASTER'S CRUCIBLE PASSIVE
// SCALES ON, and how many it can hold.
//
// ⚠⚠⚠ THE OWNER SET THE WHOLE FRAME: *"a runecaster is a power weapon so it can
// only use the power it can generate, so you cannot apply coatings, but they can
// be upgraded at the crucible, but it adds passive stats instead that improve
// with character stats."* And on what decides which stat: *"the passives would
// depend on what the power is ... say you're going for stealth and you want a
// dexterity passive so then maybe that only applies to mud."*
//
// ⚠⚠⚠ HIS EXAMPLE IS WHAT PICKED THE AXIS, and it overruled my first attempt.
// I modelled DAMAGE TYPE → stat first, and it put Slick Mud and Dust Cloud on
// STRENGTH — because they are bludgeoning — when those two are exactly what a
// stealth build reaches for. The role is the playstyle; the damage type is just
// what the spell is made of. So:
//
//   · THE ROLE picks the stat, wherever the role IS a playstyle (a ward, a
//     restrain, a summon, a cover). That is the honest signal.
//   · PLAIN STRIKE is 29 of 63 casters and has no playstyle of its own — it just
//     does damage — so there, and only there, the DAMAGE TYPE picks the stat.
//
// ⚠⚠ SCHOOL CHANGES NOTHING, on the owner's agreement. Two spells that do the
// same job give the same result whether they are mud or aether. Adding a third
// hidden multiplier would mean a player cannot look at a rune-caster and predict
// what it will give them — and the schools are already separated somewhere far
// better than a number: mud simply has no healing spells, aether simply has no
// summons. The difference lives in what EXISTS.
//
// ⚠⚠ THE INT/WIS SPLIT, which the owner asked for by name. Eighteen of the
// aether strikes fell on INT and WIS held five, so WIS — the stat that already
// reads an enemy's weaknesses — had almost nothing to want. The split is not a
// quota: it is what the spells ARE. Spells that apply force outward (Spark,
// Push, Pillar, Shatter, and the two force casters) stay INT. Spells that UNMAKE
// — Disrupt severs a thread, Displace moves a thing out of true, the Void trio
// takes something away rather than pushing it — go to WIS, and carry an
// `unmaking` tag so the rule reads off the data instead of a name list.
//
// ⚠ CAPS, verbatim from the owner: *"like coatings up to 2 passives unless it's
// extremely rare then 3 passives."* Two slots, three at Legendary.
import type { Stats } from './types';

/** The six stats a passive can scale on. Mirrors engine/types.Stats. */
export type PassiveStat = keyof Stats;

/** Roles that ARE a playstyle, and therefore name the stat themselves. Read off
 *  the weapon's tags, exactly as the school and the legendary flag are. */
const ROLE_STAT: ReadonlyArray<{ tag: string; stat: PassiveStat }> = [
  { tag: 'ward', stat: 'strength' },       // it stands between you and the blow
  { tag: 'restrain', stat: 'dexterity' },  // holding a thing still is timing
  { tag: 'aoe', stat: 'intelligence' },    // reach and yield
  { tag: 'summon', stat: 'charisma' },     // you command what you make
  { tag: 'healing', stat: 'wisdom' },
  { tag: 'utility', stat: 'wisdom' },
  { tag: 'debuff', stat: 'wisdom' },
  { tag: 'terrain', stat: 'stealth' },     // the ground is a tool for the quiet
  { tag: 'cover', stat: 'stealth' },
  { tag: 'buff', stat: 'stealth' },
];

/** Plain strikes only: what the spell is MADE of names the stat. */
const DAMAGE_STAT: Readonly<Record<string, PassiveStat>> = {
  bludgeoning: 'strength',
  piercing: 'dexterity',
  electrical: 'dexterity',
  aetheric: 'intelligence',
  force: 'intelligence',
  cold: 'wisdom',
  radiation: 'wisdom',
  poison: 'stealth',
  burn: 'charisma',
};

const lower = (tags: readonly string[] | undefined): string[] =>
  (tags ?? []).map((t) => String(t).toLowerCase());

/** The playstyle this caster is for, or 'strike' when it only does damage. */
export function runecasterRole(tags: readonly string[] | undefined): string {
  const t = lower(tags);
  for (const row of ROLE_STAT) if (t.includes(row.tag)) return row.tag;
  return 'strike';
}

/**
 * ⚠⚠⚠ THE STAT THIS CASTER'S PASSIVES SCALE ON. Null for anything that is not a
 * rune-caster, so a caller can refuse rather than invent an answer.
 *
 * Order matters and is the design: role first (it is the playstyle), damage type
 * only for plain strikes, and `unmaking` overriding the aether default so the
 * spells that take a thing apart reward WISDOM rather than raw INTELLIGENCE.
 */
export function runecasterPassiveStat(weapon: {
  weaponKind?: string;
  damageType?: string;
  tags?: readonly string[];
}): PassiveStat | null {
  if (weapon.weaponKind !== 'runecaster') return null;
  const t = lower(weapon.tags);
  for (const row of ROLE_STAT) if (t.includes(row.tag)) return row.stat;
  // ⚠ THE INT/WIS SPLIT. An aether strike that UNMAKES rather than pushes reads
  // off WISDOM. Checked before the damage table because it is a statement about
  // this specific spell, and the table is only a default for its element.
  if (t.includes('unmaking')) return 'wisdom';
  return DAMAGE_STAT[String(weapon.damageType ?? '').toLowerCase()] ?? 'intelligence';
}

/** ⚠ Owner: *"like coatings up to 2 passives unless it's extremely rare then 3
 *  passives."* Legendary is the only tier that gets the third. Read from BOTH
 *  the rarity field and the `legendary` tag, because the catalog carries the
 *  claim in both places and a row with only one of them is still a Legendary. */
export function runecasterPassiveSlots(weapon: {
  rarity?: string;
  tags?: readonly string[];
}): number {
  const isLegendary = String(weapon.rarity ?? '').toLowerCase() === 'legendary'
    || lower(weapon.tags).includes('legendary');
  return isLegendary ? 3 : 2;
}

/** What a passive on this caster DOES — the role decides the shape, the stat
 *  only decides how hard it scales. Player-facing wording, one line, so the
 *  Crucible screen and the item card can say the same thing. */
export function runecasterPassiveShape(tags: readonly string[] | undefined): string {
  switch (runecasterRole(tags)) {
    case 'ward': return 'the barrier holds more before it breaks';
    case 'restrain': return 'the hold lasts longer and is harder to shake';
    case 'aoe': return 'the blast reaches wider';
    case 'summon': return 'what you raise is tougher and stays longer';
    case 'healing': return 'it mends more';
    case 'utility': return 'it works further and more surely';
    case 'debuff': return 'the affliction bites deeper and lingers';
    case 'terrain': return 'the ground stays changed longer';
    case 'cover': return 'the cover holds against a keener eye';
    case 'buff': return 'the edge it gives you lasts longer';
    default: return 'the strike lands harder';
  }
}
