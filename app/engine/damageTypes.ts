// arb119 — every enemy attack resolves to a concrete damage TYPE.
//
// Roughly half the bestiary authored its `damage` as bare dice ("2D6", "3D10")
// with no type word, so `parseDamageTypeKeyword` returned null and the armor
// resistance ladder (OTA-529/530) couldn't engage and the portrait/combat log
// had nothing to show. Rather than hand-edit every catalog row (and miss future
// enemies), `enemyDamageType` derives the type in three tiers:
//   1. an explicit type word in the damage string  ("1d6 piercing" → piercing)
//   2. inferred from the attack/enemy NAME verb     ("Claw" → slashing)
//   3. a physical default                           (bludgeoning)
// so EVERY enemy carries a meaningful, player-visible damage type.

import type { Enemy } from './types';

// Canonical resistance/display damage types. `psychic` folds into `aetheric`
// for resistance purposes (the catalog uses both words interchangeably).
export const DAMAGE_TYPE_KEYWORDS = [
  'degradation',
  'bludgeoning',
  'burn',
  // OTA-827 [Group-K] — `cold` is now a first-class damage type (frost weapons +
  // the two Core Guardians' authored cold weakness/resist). Deep chill seizes
  // machinery and slows the living.
  'cold',
  'aetheric',
  'electrical',
  'piercing',
  'poison',
  // OTA-874 — `acid` and `corruption` are now first-class incoming damage types (they
  // were previously folded into `poison`). Acid corrodes metal (constructs are weak);
  // corruption rots the living. This makes an armor resist against them meaningful and
  // lets the inference type acidic / hollowing enemy attacks distinctly.
  'acid',
  'corruption',
  'radiation',
  'slashing',
  'stun',
  'psychic',
] as const;

// OTA-827 [Group-K] — canonical damage-type aliases, shared by EVERY consumer of
// the weakness math (applyDamageTypeModifier, traitDamageMultiplier, the combat
// flare procs). Pre-fix only gameStore's proc layer aliased these, so `force`
// weapons (aetheric-flavored runecasters) and `frost` weapons stayed type-neutral
// in the actual DAMAGE reconcile even though the proc layer already treated them
// as aetheric/cold. Making the alias authoritative closes that gap in one place.
export const DAMAGE_TYPE_ALIASES: Record<string, string> = {
  force: 'aetheric',
  psychic: 'aetheric',
  frost: 'cold',
  ice: 'cold',
  shock: 'electrical',
  // OTA-874 — acid / corruption synonyms.
  corrosive: 'acid',
  caustic: 'acid',
  blight: 'corruption',
  hollowing: 'corruption',
};

/** Canonicalize a damage-type word through the shared alias table (identity for
 *  a non-aliased type). Always lower-cases. */
export function canonicalDamageType(t: string | null | undefined): string {
  const lc = (t ?? '').toLowerCase();
  return DAMAGE_TYPE_ALIASES[lc] ?? lc;
}

/** OTA-873 — true iff `type` is a damage type an enemy can actually DEAL, i.e. a
 *  type that a worn armor resist can ever match. Keyed off DAMAGE_TYPE_KEYWORDS (via
 *  the alias table). `acid` and `corruption` are OFFENSIVE-only coating families —
 *  the player's coated WEAPON applies them as DOTs; no enemy emits them as incoming
 *  damage — so a coating resist against them is inert. The "apply to armor" flow uses
 *  this to reject those vials; if acid/corruption ever become real incoming types,
 *  adding them to DAMAGE_TYPE_KEYWORDS auto-enables the armor path. */
export function isResistableIncomingType(type: string | null | undefined): boolean {
  const c = canonicalDamageType(type);
  return (DAMAGE_TYPE_KEYWORDS as readonly string[]).includes(c);
}

/** Scan a string for an explicit damage-type word. Returns the canonical type
 *  (psychic normalized to aetheric, frost→cold, force→aetheric, …) or null when
 *  none is present. Mirrors the long-standing parseIncomingDamageType so
 *  resistance behavior is unchanged for already-typed enemies. */
export function parseDamageTypeKeyword(s: string | null | undefined): string | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  for (const t of DAMAGE_TYPE_KEYWORDS) {
    if (lower.includes(t)) return t === 'psychic' ? 'aetheric' : t;
  }
  // OTA-827 — fall back to the alias words (frost/ice/force/shock) so a string
  // that names only a synonym still resolves to its canonical type.
  for (const alias of Object.keys(DAMAGE_TYPE_ALIASES)) {
    if (lower.includes(alias)) return DAMAGE_TYPE_ALIASES[alias]!;
  }
  return null;
}

// Attack VERB → damage type. Checked against the enemy's `attack` string only
// (e.g. "Aetheric Blast", "Venom Spit", "Claw"). First match wins; order most-
// specific (energy/elemental) before the broad physical buckets. Elemental
// types live HERE rather than in the species pass because an enemy whose NAME
// merely carries a material prefix ("Aetheric Ooze", "Aether Hound") shouldn't
// be read as dealing aetheric DAMAGE — that prefix is flavor, not its attack.
const ATTACK_VERB_TYPE: ReadonlyArray<readonly [RegExp, string]> = [
  [/aether|psychic|void|mind|spectral|phantom|wail|scream|gaze|hex|curse|drain|wither/i, 'aetheric'],
  [/burn|flame|\bfire\b|scorch|ember|ignite|cinder|searing|molten|magma/i, 'burn'],
  // OTA-827 [Group-K] — cold/frost attacks (before the physical buckets so a
  // "Frost Maul" reads as cold, not bludgeoning).
  [/frost|\bice\b|\bicy\b|freez|glaci|rime|chill|frigid|hoar|winter|permafrost/i, 'cold'],
  [/shock|spark|lightning|jolt|\bvolt|static|thunder|arc\b|electr/i, 'electrical'],
  // OTA-874 — acid + corruption split OUT of the poison bucket into their own types.
  // Both sit BEFORE the physical buckets so a "Corrosive Bite" reads acid (not piercing)
  // and a "Hollow Cleave" reads corruption (not slashing).
  [/acid|corros|caustic|dissolv|etch\b|slag\b/i, 'acid'],
  [/corrupt|blight|wither|defile|hollow|necrot|festering|\brot\b/i, 'corruption'],
  [/poison|venom|toxic|spore|plague|sick/i, 'poison'],
  [/radiat|irradiat|fallout|decay\b/i, 'radiation'],
  [/bite|fang|maw|sting|spike|spear|stab|pierc|gore|horn|tusk|quill|barb|bolt|arrow|lance|pincer|beak|impale|skewer|needle|jab/i, 'piercing'],
  [/claw|talon|rake|slash|rend|blade|cleaver|sword|knife|dagger|scythe|razor|saber|sabre|\baxe|shred|slice|gash|hook\b|sickle/i, 'slashing'],
  [/slam|bash|cudgel|club|maul|fist|punch|stomp|\btail|crush|smash|pound|hammer|kick|headbutt|head-butt|charge|sweep|buffet|thrash|tackle|swing|pummel|batter|wallop|stone|rock|boulder|sledge/i, 'bludgeoning'],
];

// SPECIES → physical damage type. Checked against the enemy's `name` only, when
// the attack verb gave nothing. Confined to PHYSICAL types (and obviously
// elemental species like Flame/Storm) so a generic material prefix in the name
// doesn't masquerade as elemental damage. A spider has fangs + needle legs
// (piercing); a golem is blunt mass (bludgeoning).
const NAME_SPECIES_TYPE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bflame|wildfire|cinderbeast|ember\b/i, 'burn'],
  [/stormcaller|thundercat|sparkhound/i, 'electrical'],
  // pointy/toothed/stinging creatures
  [/spider|scorpion|wasp|hornet|\bbee\b|serpent|\bsnake|viper|adder|cobra|\bhound|\bwolf|jackal|raptor|shrike|mosquito|leech|\brat\b|vermin|drake|\bbat\b|mantis|urchin|porcupine|needler|stinger|lamprey/i, 'piercing'],
  // bladed/clawed creatures
  [/razor|mantis|reaver|ripper|shredder|saberclaw|slasher/i, 'slashing'],
  // heavy/blunt mass
  [/golem|ooze|slime|sludge|\bblob|\bmass\b|titan|behemoth|sentinel|construct|brute|\bram\b|elemental|colossus|juggernaut|boulder|stoneback/i, 'bludgeoning'],
];

/** Resolve an enemy's concrete damage type (never null):
 *  1. explicit type word in the damage string ("1d6 piercing"),
 *  2. inferred from the ATTACK verb ("Claw" → slashing),
 *  3. inferred from the NAME species ("Iron Spider" → piercing),
 *  4. a bludgeoning physical default. */
export function enemyDamageType(enemy: Pick<Enemy, 'damage' | 'attack' | 'name'>): string {
  const explicit = parseDamageTypeKeyword(enemy.damage);
  if (explicit) return explicit;
  const attack = enemy.attack ?? '';
  for (const [re, type] of ATTACK_VERB_TYPE) {
    if (re.test(attack)) return type;
  }
  const name = enemy.name ?? '';
  for (const [re, type] of NAME_SPECIES_TYPE) {
    if (re.test(name)) return type;
  }
  return 'bludgeoning';
}
