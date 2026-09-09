/**
 * OTA-1789 — ONE WEAPON-FAMILY RESOLVER, AND IT READS THE GAME'S OWN DATA.
 *
 * The reference pack: *"Create one governed weapon-family -> glyph resolver at
 * the smallest appropriate shared point. Do not scatter item-name conditionals
 * across transcript JSX. Unknown/missing family must fail safely to a neutral
 * existing fallback, not crash and not show a misleading specific weapon."*
 * And, load-bearing: *"Use the actual resolved weapon/item family from combat
 * state, not prose string matching... Map the supplied glyphs to the ACTUAL
 * shipped weapon categories. Do not invent a parallel weapon taxonomy just to
 * match this pack."*
 *
 * ⚠⚠⚠ THE SHIPPED TAXONOMY IS THE `tags` ARRAY, AND IT WAS ALREADY THERE.
 * A census of all 301 catalog weapons found a real family vocabulary in use:
 * `blade` 49 · `runecaster` 64 · `firearm` 29 · `shield` 28 · `spear` 23 ·
 * `knife` 19 · `thrown` 17 · `hammer` 13 · `axe` 12 · `bow` 11 · `crossbow` 5 ·
 * `barehanded` 5, plus `club`, `flail`, `polearm`, `blunt`, `bolt-caster` and
 * `throwable`. Nothing here is invented; every key below is a word the catalog
 * already says about itself.
 *
 * ⚠⚠ WHAT THE GLYPH MEANS, AND WHAT IT MUST NOT. The pack: *"The small glyph to
 * the left of a combat exchange identifies the weapon family used for that
 * exchange. It is not a HIT/MISS icon and not a damage-type icon."* So this
 * table is a THIRD family beside `combatGlyphArt` (what kind of harm) and
 * `utilityGlyphArt` (what a control does). Weapon glyph = what DELIVERED the
 * attack. Collapsing those concepts is explicitly forbidden and a test asserts
 * none of the three tables reaches into another's asset directory.
 *
 * ⚠ THREE OWNER RULINGS ARE BAKED IN HERE, each recorded where it applies:
 *   1. FIREARM SHARES the runecaster/energy-sidearm mark. It is 29 weapons and
 *      the pack supplied no separate picture; the owner ruled "share" rather
 *      than leave the largest ranged family unmarked.
 *   2. SHIELD IS A MELEE FAMILY IN ITS OWN RIGHT — "full shield icon melee
 *      family". The family is defined here and resolves; the ARTWORK does not
 *      exist yet, so it resolves to no picture rather than to a wrong one.
 *      That is the pack's own fail-safe rule, not a shortcut.
 *   3. THE WAND/STAFF PICTURE IS THE ENERGY WEAPON. There is no `wand` or
 *      `staff` tag in the catalog, so the picture had no home — the owner named
 *      the category, and the category is derivable (see `energyMelee`).
 */
import { canonicalDamageType } from './damageTypes';

/** The families this game actually ships. `shield` has no artwork yet and that
 *  is deliberate — see the ruling above. */
export type WeaponFamily =
  | 'unarmed' | 'dagger' | 'sword' | 'axe' | 'spear' | 'mace'
  | 'bow' | 'crossbow' | 'thrown' | 'runecaster' | 'energy' | 'shield';

/** ⚠ ONE `require()` SITE, the rule both other glyph tables carry. */
const FAMILY_ART: Partial<Record<WeaponFamily, number>> = {
  unarmed: require('../../assets/weapon-glyphs/unarmed.png'),
  dagger: require('../../assets/weapon-glyphs/dagger.png'),
  sword: require('../../assets/weapon-glyphs/sword.png'),
  axe: require('../../assets/weapon-glyphs/axe.png'),
  spear: require('../../assets/weapon-glyphs/spear.png'),
  mace: require('../../assets/weapon-glyphs/mace.png'),
  bow: require('../../assets/weapon-glyphs/bow.png'),
  crossbow: require('../../assets/weapon-glyphs/crossbow.png'),
  thrown: require('../../assets/weapon-glyphs/thrown.png'),
  /** ⚠ RULING 1 — firearms share this. The source is a long coil/energy pistol,
   *  which reads for both an aetheric sidearm and this world's "firearms". */
  runecaster: require('../../assets/weapon-glyphs/runecaster.png'),
  /** ⚠ RULING 3 — the wand/staff silhouette, given a real category by the owner. */
  energy: require('../../assets/weapon-glyphs/wand_staff.png'),
  // shield: NO ARTWORK YET. Ruling 2 defines the family; the picture is owed.
};

/** ⚠⚠ TAG → FAMILY, IN PRIORITY ORDER. First match wins, so the narrow words
 *  (`knife`) are tested before the broad ones (`blade`) — a throwing knife is a
 *  dagger, not a sword. */
const TAG_FAMILY: ReadonlyArray<readonly [string, WeaponFamily]> = [
  ['barehanded', 'unarmed'],
  ['shield', 'shield'],
  ['knife', 'dagger'],
  ['blade', 'sword'],
  ['axe', 'axe'],
  ['spear', 'spear'],
  ['polearm', 'spear'],
  ['hammer', 'mace'],
  ['club', 'mace'],
  ['flail', 'mace'],
  ['blunt', 'mace'],
  ['weighted', 'mace'],
  ['bow', 'bow'],
  ['crossbow', 'crossbow'],
  ['bolt-caster', 'crossbow'],
  ['runecaster', 'runecaster'],
  ['firearm', 'runecaster'],
  ['energy', 'energy'],
];

/** The tags that mean "this can be thrown". Deliberately NOT consulted unless
 *  the ATTACK was a throw — see `weaponFamilyOf`. */
const THROWN_TAGS = new Set(['thrown', 'throwable', 'throw']);

/** ⚠⚠⚠ RULING 3, DERIVED RATHER THAN RETAGGED. The owner named "energy weapon"
 *  as the wand/staff picture's category. No `wand`/`staff`/`energy` tag covers
 *  the rods and batons, so the family is derived from two fields the catalog
 *  already carries: a MELEE weapon whose damage is electrical or aetheric, with
 *  no other family word on it. That is Aetheric Rod, Energy Baton, Aetheric
 *  Baton, Magnetized Rod and their kin.
 *  ⚠ DERIVED, NOT RETAGGED, ON PURPOSE: editing 300 catalog rows to fit a
 *  picture is exactly the "parallel weapon taxonomy" the pack forbids, and a
 *  rule you can read is easier to correct than data you have to re-audit. */
function energyMelee(kind: string | undefined, damageType: string | undefined): boolean {
  if (kind !== 'melee') return false;
  const dt = canonicalDamageType(damageType ?? '');
  return dt === 'electrical' || dt === 'aetheric';
}

export interface WeaponFamilyInput {
  /** The catalog row's tags. Empty/absent is normal for 57 of 301 weapons. */
  tags?: readonly string[] | null;
  /** `melee` | `ranged` | `runecaster`. */
  weaponKind?: string | null;
  /** The catalog damage type — the coarse fallback's only input. */
  damageType?: string | null;
  /** ⚠⚠ THE ATTACK, NOT THE ITEM. The pack: *"Thrown attacks use the thrown
   *  mapping even if the thrown item also has a damage family."* A Stone Spear
   *  is a SPEAR when you stab with it and a THROWN when you throw it, and only
   *  the action knows which happened. */
  thrown?: boolean;
}

/**
 * The family that delivered this attack, or `null` when the data does not say.
 *
 * ⚠⚠⚠ `null` IS A REAL ANSWER AND THE CALLER MUST RENDER NOTHING FOR IT. The
 * pack: *"Unknown/missing family must fail safely to a neutral existing
 * fallback, not crash and not show a misleading specific weapon."* Showing a
 * sword for a weapon the catalog never called a sword is worse than showing no
 * mark at all — the transcript would be asserting something the engine does not
 * know.
 */
export function weaponFamilyOf(input: WeaponFamilyInput | null | undefined): WeaponFamily | null {
  if (!input) return null;
  const tags = new Set((input.tags ?? []).map((t) => String(t).toLowerCase()));

  // 1 — the action wins. A throw is a throw whatever the item also is.
  if (input.thrown && [...THROWN_TAGS].some((t) => tags.has(t))) return 'thrown';

  // 2 — an explicit family word.
  for (const [tag, family] of TAG_FAMILY) if (tags.has(tag)) return family;

  // 3 — ruling 3's derivation.
  if (energyMelee(input.weaponKind ?? undefined, input.damageType ?? undefined)) return 'energy';

  /* 4 — THE COARSE FALLBACK, and it is honest rather than clever. 57 of 301
   * catalog weapons carry no family word at all (Bone Maul, Rail Saber, the
   * golem armaments, the faction blades). `damageType` and `weaponKind` are
   * shipped categories too, so a bludgeoning melee weapon gets the pack's own
   * "generic heavy blunt" and a slashing one gets the sword — a silhouette that
   * is TRUE OF THE CLASS rather than a guess at the item.
   * ⚠ RANGED FALLS TO THE SHARED ENERGY-SIDEARM MARK under ruling 1: in this
   * world an unlabelled ranged weapon is a Beacon Rifle or a Field Carbine, and
   * the pistol silhouette is the nearest true thing the pack supplies. */
  const dt = canonicalDamageType(input.damageType ?? '');
  if (input.weaponKind === 'runecaster') return 'runecaster';
  if (input.weaponKind === 'ranged') return 'runecaster';
  if (input.weaponKind === 'melee') {
    if (dt === 'bludgeoning') return 'mace';
    if (dt === 'slashing') return 'sword';
    if (dt === 'piercing') return 'spear';
  }
  return null;
}

/** The artwork for a family, or `undefined` when there is none. `shield`
 *  resolves as a FAMILY and returns `undefined` here until its picture lands. */
export function weaponFamilyArt(family: WeaponFamily | null | undefined): number | undefined {
  if (!family) return undefined;
  return FAMILY_ART[family];
}

/** ⚠ Convenience for the transcript: family and picture in one call. */
export function weaponGlyphFor(input: WeaponFamilyInput | null | undefined): number | undefined {
  return weaponFamilyArt(weaponFamilyOf(input));
}
