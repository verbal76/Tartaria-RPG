// aetherkin — OTA-914 (HAL + golem only; NOT the lore-agnostic engine line).
//
// The Aetherkin: Tartarians who were trapped below when the Great Mud Flood
// struck — drowned, mud-mummified, and reanimated by the Aether they died
// steeped in. Canon (glossary): "the Aether-infused undead of Tartaria, buried
// by the Great Mud Flood and trapped in an ethereal plane of peace... they
// reawaken... hostile to all intruders who threaten their longed-for rest."
//
// Per the player's design, they are NOT zombies: they are reanimated, AFRAID,
// carrying basic memories of who they were and a muscle-memory of fright-or-
// flight. They don't hunt — they cringe, and defend themselves if pressed. Some
// factions revere them (they hold old Tartaria and its dead sacred); others fear
// them (they want the empire kept buried). Killing one angers the reverent;
// talking one down — reaching the frightened person still inside — pleases them.
//
// Encounters are built with a randomized IDENTITY so every one reads different:
// who they were in life, who they might have been, and why they're here.

/** Factions that revere the Aetherkin (the reanimated flood-dead). Killing an
 *  Aetherkin lowers standing with these; talking one down raises it. Chosen from
 *  canon: the True Tartarians reinter the flood-dead with reverence; the Servants
 *  of the Giants and the Tartarian Revivalists hold old Tartaria sacred; the
 *  Aetherborn Eternal Dynasty claim them as Aether-bound kin. */
export const AETHERKIN_REVERING_FACTIONS: readonly string[] = [
  'true_tartarians',
  'servants_of_giants',
  'tartarian_revivalists',
  'eternal_dynasty',
];

/** The new defensive Aetherkin enemy variants (authored in enemies.json). The
 *  older, tougher power-hall "Aetherkin" also matches isAetherkin by name. */
export const AETHERKIN_VARIANT_NAMES: readonly string[] = [
  'Drowned Aetherkin',
  'Mud-Wracked Aetherkin',
];

/** True when an enemy is one of the Aetherkin — by the marker trait OR by name
 *  (so scaled/renamed instances and the legacy power-hall Aetherkin all match). */
export function isAetherkin(enemy: { name?: string; traits?: readonly string[] } | null | undefined): boolean {
  if (!enemy) return false;
  if ((enemy.traits ?? []).some((t) => t.toLowerCase() === 'aetherkin')) return true;
  return /aetherkin/i.test(enemy.name ?? '');
}

// ── Identity pools ─────────────────────────────────────────────────────────

/** Who they were in life — read off what the mud left behind. */
const FORMER_LIVES: readonly string[] = [
  'a baker — flour still ghosts the creases of what were once their sleeves',
  'a child, no taller than your hip, one small hand closed around nothing',
  'a ward-sister of some drowned infirmary, a splint still lashed to their own arm',
  'a machinist, one hand fused half-around a wrench that rusted into the bone',
  'a market-scribe, ink and silt run together down the front of them',
  'a bell-ringer, shoulders rounded from a rope pulled ten thousand times',
  'a mud-farmer, boots still on, still caked to the knee',
  'a lamplighter, a cold dead wick clutched to their chest like a charm',
  'a house-servant in the grey of some family that has no name left',
  'a young mother, arms curled around an absence the flood took first',
  'an old, old man, the years worn deeper into him than the mud',
  'a soldier of an army nobody remembers losing',
  'a glassblower, lungs long since filled with something that isn\'t breath',
  'a midwife, hands still shaped to catch',
  'a tax-collector, ledger fused shut, that not one soul came back to mourn',
];

/** A hedged guess layered on top — the mud takes faces first. */
const MIGHT_HAVE_BEEN: readonly string[] = [
  'or maybe just someone who happened to live here — you can\'t be sure',
  'the set of the jaw is close enough to a portrait you saw once in a flooded hall',
  'there\'s a ring worn thin on one finger; someone loved them, whoever they were',
  'the mud takes faces first, so the rest is a guess and a kindness',
  'you find yourself wanting to know their name, and knowing you never will',
  'they could be anyone\'s — a neighbour, a stranger, the person you\'d have been',
];

/** Why they're where you found them — sealed in a home. */
const WHY_BUILDING: readonly string[] = [
  'The mud took this house with them still inside it. They never reached the door.',
  'They died where they slept, sealed in when the flood came up through the floorboards.',
  'This was their home. They have not left it in a very long time, and did not mean to now.',
  'The Aetherstone set hard around them right here, in this room. You are the first living thing through the door since.',
];

/** Why they're where you found them — clawed up out of open mud. */
const WHY_MUD: readonly string[] = [
  'The silt let go of them all at once, and they came up clawing at the light.',
  'Something you stirred woke the Aetherstone that held them; now they\'re awake and out.',
  'They surfaced out of the flat mud like a held breath finally, terribly let go.',
  'The ground gave them back without warning — one moment mud, the next a person who should be dead.',
];

/** The identification beat — connect the enemy to the storied Aetherkin so the
 *  player knows what they're looking at. */
const IDENTIFICATION: readonly string[] = [
  'These are the Aetherkin the roadside traders whisper about — the flood-dead the Aether would not let rest.',
  'You\'ve heard of these on the road: the Aetherkin, the ones the mud drowned and the Aether raised back up.',
  'This is one of the Aetherkin, then — not a story after all. The dead of old Tartaria, still walking because the Aether in them never stopped.',
  'The traders were right. Aetherkin. Some kneel to them; some burn them where they stand.',
];

/** How they carry themselves — afraid, defensive, running on muscle-memory. */
const CHARACTER: readonly string[] = [
  'It doesn\'t lunge. It cringes back, arms up over its face — remembering, dimly, that living things once meant harm. It will only fight if you make it.',
  'It flinches from you and puts its back to the wall, hands raised — not a hunter, just something frightened that has forgotten everything except how to be afraid.',
  'There\'s no hunger in it, only fright. It shrinks from your step, then squares up on trembling legs — it will defend itself, and nothing more.',
  'It looks at you the way a cornered animal looks at a door. Fight or flight, and the flight is walled off. Press it and it will strike; leave it and it will let you.',
];

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] ?? arr[0]!;
}

export type AetherkinContext = 'building' | 'mud';

export interface AetherkinEncounter {
  /** Enemy name to spawn (resolved via findEnemyByName, then scaled). */
  enemyName: string;
  /** The shape rising — world beat. */
  emergence: string;
  /** "These are the Aetherkin you've heard about" — arbiter beat, per the
   *  player's note that the Arbiter (or flavor) names them for you. */
  identification: string;
  /** Who they were / might have been / why they're here — world beat. */
  identity: string;
  /** Afraid, defensive, running on muscle-memory — world beat. */
  character: string;
  /** All four beats in narration order (emergence → identification → identity
   *  → character), for callers/tests that want them as a flat list. */
  lines: string[];
}

/** Build a randomized Aetherkin encounter for the given context. The caller
 *  spawns `enemyName` (scaled) and appends the beats as world/arbiter lines. */
export function buildAetherkinEncounter(where: AetherkinContext, rng: () => number = Math.random): AetherkinEncounter {
  const enemyName = pick(AETHERKIN_VARIANT_NAMES, rng);
  const emergence = where === 'building'
    ? 'Something stirs in the dark of the place — a shape peeling itself up off the floor where the mud had set it.'
    : 'The flat silt heaves, and a hand breaks the surface, then an arm, then a face caked grey with a thousand years of it.';
  const life = pick(FORMER_LIVES, rng);
  const guess = pick(MIGHT_HAVE_BEEN, rng);
  const why = where === 'building' ? pick(WHY_BUILDING, rng) : pick(WHY_MUD, rng);
  const identification = pick(IDENTIFICATION, rng);
  const identity = `In life it was ${life} — ${guess}. ${why}`;
  const character = pick(CHARACTER, rng);
  return {
    enemyName,
    emergence,
    identification,
    identity,
    character,
    lines: [emergence, identification, identity, character],
  };
}
