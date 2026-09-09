// ⚠⚠⚠ OTA-1763 — THE ILLUSTRATED DAMAGE ICONS. A TRIAL, NOT A MIGRATION.
//
// Owner: *"We are going to test the new illustrated icon library in ONE isolated
// surface first... DO NOT change live combat, weapon controls, weapon tabs/cards,
// inventory, or any other production icon surface yet."*
//
// Nine 64x64 RGBA PNGs, supplied by the owner and extracted from three source
// packs. They are wired into ONE place — the Lore cheat sheet's trial block —
// so they can be looked at on a real phone before anything commits to them.
//
// Same shape as `factionCrests.ts` and `buildingMaps.ts`: a table keyed by an id,
// so a consumer branches on "is there art for this concept" and never on a
// hard-coded name. That is the repo's established pattern for art lookups and
// this file does not invent a second one.
//
// ⚠⚠ TEN CONCEPTS, NINE BINARIES. `gas` deliberately reuses `noxious.png` for
// this trial rather than duplicating the bytes — the owner's instruction, and it
// is recorded here rather than looking like an oversight to the next reader.
//
// ⚠⚠⚠ THE SOURCE IDS (W50, W193, 101, …) ARE PROVENANCE AND NOTHING ELSE.
// Runtime code must never need them, which is why the files were renamed on the
// way in. They live in `assets/damage/README.md` beside what each picture
// actually shows — the same discipline `assets/crests/README.md` established
// after six emblems arrived mislabelled.
//
// ⚠ THESE ARE ILLUSTRATED ARTWORK, NOT MONOCHROME GLYPHS. No `tintColor`, no
// colour transformation, and every consumer must use `resizeMode="contain"` so
// the 1:1 source is never stretched. The existing text glyph system
// (`engine/weaponGlyphs.ts`) is untouched and still owns live combat.

/** The ten concepts this trial covers. Not the game's damage-type ids — see the
 *  note on BINDING below, which is an open owner decision. */
export type DamageIconId =
  | 'impact' | 'rupture' | 'heat' | 'galvanic' | 'noxious'
  | 'resonance' | 'cold' | 'radiation' | 'gas' | 'environmental';

/** Declaration order is the order the trial block renders them in. */
export const DAMAGE_ICON_IDS: readonly DamageIconId[] = [
  'impact', 'rupture', 'heat', 'galvanic', 'noxious',
  'resonance', 'cold', 'radiation', 'gas', 'environmental',
] as const;

const DAMAGE_ICONS: Readonly<Record<DamageIconId, number>> = {
  impact: require('../../assets/damage/impact.png'),
  rupture: require('../../assets/damage/rupture.png'),
  heat: require('../../assets/damage/heat.png'),
  galvanic: require('../../assets/damage/galvanic.png'),
  noxious: require('../../assets/damage/noxious.png'),
  resonance: require('../../assets/damage/resonance.png'),
  cold: require('../../assets/damage/cold.png'),
  radiation: require('../../assets/damage/radiation.png'),
  // ⚠ Ten concepts, nine files: gas shares noxious by instruction.
  gas: require('../../assets/damage/noxious.png'),
  environmental: require('../../assets/damage/environmental.png'),
};

/** The label shown beside the artwork. The picture SUPPLEMENTS the word; it
 *  never replaces it, which is the owner's rule 6 for this trial. */
export const DAMAGE_ICON_LABEL: Readonly<Record<DamageIconId, string>> = {
  impact: 'Impact',
  rupture: 'Rupture',
  heat: 'Heat',
  galvanic: 'Galvanic',
  noxious: 'Noxious',
  resonance: 'Resonance',
  cold: 'Cold / Freezing',
  radiation: 'Radiation',
  gas: 'Gas / Fumes',
  environmental: 'Environmental',
};

/** The art for a concept, or `undefined` if the trial has none for it. */
export function damageIcon(id: string): number | undefined {
  return (DAMAGE_ICONS as Record<string, number | undefined>)[id];
}

/** Every id the trial ships art for. */
export function damageIconIds(): readonly DamageIconId[] {
  return DAMAGE_ICON_IDS;
}

/* ⚠⚠⚠ BINDING TO THE GAME'S DAMAGE TYPES IS DELIBERATELY NOT DONE HERE, AND
 * THAT IS AN OPEN OWNER DECISION RATHER THAN AN OMISSION.
 *
 * The owner supplied concept → file. The GAME's damage vocabulary is a different
 * list — `engine/damageTypes.ts` canonicalises bludgeoning, slashing, piercing,
 * aetheric, radiation, stun, burn, cold, poison, acid, corruption, degradation,
 * electrical — and only three of the ten concepts share a name with it (`cold`,
 * `radiation`, and arguably `impact`↔bludgeoning).
 *
 * Deciding that `rupture` means slashing, or piercing, or both; that `resonance`
 * means aetheric or stun; and what in the game `environmental` or `gas` even
 * refers to, is a SEMANTIC ruling about the game's own vocabulary — not an art
 * question — and inventing it inside an art table would smuggle a design
 * decision in under a display experiment. The owner asked to make the visual
 * call first: *"Once I approve the artwork and display size, we will separately
 * design the live-combat image container."*
 * So the trial block shows the TEN CONCEPTS BY NAME. Nothing in the shipped
 * damage path reads this file. */
