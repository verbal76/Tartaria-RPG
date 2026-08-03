import type {
  WeatherEntry,
  Hazard,
  Enemy,
  Location,
  Quest,
  InventoryItem,
  ParsedInput,
  Intent,
  PlayerCharacter,
  WorldMemory,
} from './types';
import { withArticle, withArticleCap } from './grammar';
// OTA-1067 — Phase 5: the Arbiter's arc across the Cores and his opinion of
// the player, both derived from the save.
import { arbiterRemark } from './arbiterPersona';
import { pick, chance, rotatingPick } from './rng';
import openings from '../data/events/openings.json';
// OTA-298 — mood, intent, location, and scene flavor JSON files are
// lazy-loaded via require() inside getter functions below. Combined
// these are ~25 KB of Hermes parse weight that previously fired at
// narrativeGenerator module-load (which is at app boot, since
// gameStore imports from this module). Deferring them to first scene
// narration (always mid-session) gives Hermes a warm-engine moment
// for the parse and shrinks the title-screen cold-start cost.

const openingsList = openings as string[];

export function buildOpening(): string {
  return pick(openingsList);
}

// Coverage helpers — exported so callers (and regression tests) can
// confirm a race / faction id resolves to an authored Arbiter line.
// Returns null when the id has no pool entries.
export function pickArbiterRaceRemark(raceId: string): string | null {
  const pool = ARBITER_RACE_REMARKS[raceId];
  if (!pool || pool.length === 0) return null;
  return pick(pool);
}

export function pickArbiterFactionRemark(factionId: string): string | null {
  const pool = ARBITER_FACTION_REMARKS[factionId];
  if (!pool || pool.length === 0) return null;
  return pick(pool);
}

/**
 * Three-paragraph opening narrative for the first scene of a brand-new
 * character. Each paragraph is emitted as its own log entry so the
 * AdventureFeed renders them with real visual gaps. Order:
 *   1. Character framing — who they are, the buried world they woke into.
 *   2. Setting — the room / location they stand in (hub room when at
 *      the outpost, else the procedural location description).
 *   3. Atmosphere — an Arbiter-flavored line + the active weather's
 *      pressure on their stats, then the agency hand-off.
 * The Paths: line is emitted separately by the caller and reads as a
 * fourth, utility-flavoured paragraph.
 */
export function buildOpeningNarrative(input: {
  playerName: string;
  raceName: string;
  factionName: string;
  weather: WeatherEntry;
  weatherDescriptor: string;
  location: Location;
  hubRoomName?: string | null;
  hubRoomDescription?: string | null;
  hubName?: string | null;
}): [string, string, string] {
  const {
    playerName,
    raceName,
    factionName,
    weather,
    weatherDescriptor,
    location,
    hubRoomName,
    hubRoomDescription,
    hubName,
  } = input;

  // P1 — character framing. Pulls race + faction so the opening feels
  // earned rather than generic. The buried-world line is the same beat
  // every character gets; the specifics flex around it.
  // OTA-353 — name-aware framing. In the in-game-name flow (Tungsten Spire
  // tutorial) the opening narrates BEFORE the player types their name, so
  // playerName is empty here. The named variants then rendered as "Your name
  // is . Your blood is …" — a stray bare clause. Drop the name clause entirely
  // when the name isn't set yet; the Arbiter asks for it moments later.
  const named = (playerName ?? '').trim().length > 0;
  const p1Variants = named ? [
    `You are ${playerName} of the ${raceName}, walking under the colors of the ${factionName}. A thousand years ago the Aetherstone flood drowned Tartaria and most of what made it. The world above kept turning. The world below waited. Today the waiting ends — you have woken into the buried country.`,
    `Your name is ${playerName}. Your blood is ${raceName}. Your work, from this hour on, belongs to the ${factionName}. The continent under your boots is Tartaria — a civilization the surface forgot to remember. The flood that buried it is older than every kingdom drawn on every honest map. Today it lets you in.`,
    `${playerName}, of the ${raceName}, sworn to the ${factionName}: you have crossed into Tartaria. The buried country. The cataclysm that made it was called the Aetherstone Flood, and it ended a thousand years ago — yet here, at ground level, it never quite stopped. The mud still moves. The air still hums.`,
  ] : [
    `You walk under the colors of the ${factionName}, ${raceName} blood in your veins. A thousand years ago the Aetherstone flood drowned Tartaria and most of what made it. The world above kept turning. The world below waited. Today the waiting ends — you have woken into the buried country.`,
    `Your blood is ${raceName}. Your work, from this hour on, belongs to the ${factionName}. The continent under your boots is Tartaria — a civilization the surface forgot to remember. The flood that buried it is older than every kingdom drawn on every honest map. Today it lets you in.`,
    `Of the ${raceName}, sworn to the ${factionName}: you have crossed into Tartaria. The buried country. The cataclysm that made it was called the Aetherstone Flood, and it ended a thousand years ago — yet here, at ground level, it never quite stopped. The mud still moves. The air still hums.`,
  ];
  const p1 = pick(p1Variants);

  // P2 — setting. Hub mode anchors at the authored room; otherwise the
  // procedural location description carries the load. Preserves the
  // hub room's authored casing ("The Gate", not "The gate").
  // arb133 — don't double-article a location whose name already starts with "The"
  // ("The Monarch's Waystation" was rendering as "the The Monarch's Waystation").
  const locWithThe = /^the\s/i.test(location.name) ? location.name : `the ${location.name}`;
  const p2 = hubRoomName && hubRoomDescription
    ? `${hubName ?? "Reclaimers' Outpost"} rises out of the silt at the edge of ${locWithThe}. You arrive at ${hubRoomName}. ${hubRoomDescription}`
    : `You arrive at the edge of ${locWithThe}. ${location.description}`;

  // P3 — atmosphere + agency hand-off. In the hub we use a hub-flavored
  // line (we're indoors at the outpost — no Rust Monks on the road),
  // otherwise pick from the surface openings pool. Weather clause uses
  // "A / An" properly so we don't print "A etheric storm".
  const isHubScene = !!(hubRoomName && hubRoomDescription);
  const arbiterLine = isHubScene ? pick(HUB_OPENING_LINES) : pick(openingsList);
  const weatherClause = weatherDescriptor
    ? ` ${aOrAn(weather.name)} ${weather.name.toLowerCase()} presses on the world — ${weatherDescriptor}.`
    : '';
  const p3 = `${arbiterLine}${weatherClause} What you do here is yours to choose.`;

  return [p1, p2, p3];
}

// "A" / "An" based on whether the next word starts with a vowel sound.
// Cheap heuristic — matches common cases (etheric, iron, ash, aether,
// echoing, ominous) without a full phonetic table.
function aOrAn(nextWord: string): string {
  return /^[aeiou]/i.test(nextWord.trim()) ? 'An' : 'A';
}

// Hub-flavored opening lines — used in P3 of the opening narrative when
// the player spawns inside the Reclaimers' Outpost. Generic Tartaria-
// world openings (Rust Monks on the road, footprints in the silt, etc.)
// read as out-of-place when the player is standing in an authored room.
const HUB_OPENING_LINES = [
  `The outpost's lanterns sway in a draft that should not reach this far inside.`,
  `Reclaimers move past you on small errands — checking ropes, counting beads, pretending not to study the new arrival.`,
  `Somewhere behind the back wall, a kettle whistles itself empty and no one moves to take it off.`,
  // OTA 203 — Arbiter intro updated for the new vibe. Old line was
  // narrator-mystical ("they were here before the outpost"); new
  // line plants the cloak + the I-don't-care + the watching-you
  // beat so first impressions land closer to the actual character.
  `The Arbiter is already here, slouched against a post under a cloak that has seen more weather than most people. He looks asleep. He isn't. His eyes track you for one quiet beat before he goes back to looking at nothing.`,
  `A map-stone hums softly at the center of the camp — old enough to remember roads the Flood erased.`,
  `Smoke from the cook-fires turns blue where the Aether crosses it. No one comments.`,
];

export interface SceneInput {
  weather: WeatherEntry;
  location: Location;
  hazard?: Hazard | null;
  enemy?: Enemy | null;
  quest?: Quest | null;
}

// ---------------------------------------------------------------------------
// Lore pool wiring
// ---------------------------------------------------------------------------

// OTA 203 — Arbiter voice refresh.
// The vibe brief: he looks old and unassuming under a cloak, talks in
// cryptic shorthand that reads as nonsense until you parse it ("the
// desert walks with you" = you're being followed). Casual, terse,
// slightly bored on the surface. Under the cloak he carries dual
// bolt-casters; he's killed more out here than he's ever said. He
// knows the Aether, the old machinery, the old ways — he just
// doesn't care to flaunt it. He sees something in YOU, watches you
// for reasons he won't explain. He likes you. Don't read that as
// benevolence — cross him and he'll snap your neck, bury you where
// you fell, and walk on.
//
// Implementation: ADD new lines alongside the existing
// philosophical-narrator pools (don't replace — diverse rotation
// is healthier than wholesale rewrite). Three new registers
// distributed across the pools below:
//   1. CRYPTIC-SHORTHAND ("desert walks with you", "how many shadows")
//   2. CASUAL-DON'T-CARE ("Yes. It's behind you. Has been for two days.")
//   3. LETHALITY-UNDERCURRENT ("two killers in this room", "loosens
//      something inside the cloak")
// Plus a few "he sees something in you" lines that fire rarely in
// peace mode.

// Mood pools — picked when the cognitive layer detects a dominant emotion.
// Hardcoded baselines stay as fallbacks; lore-curated lines from
// `arbiter-mood-quotes.json` are concatenated so the pool grows organically.
const BASE_MOOD_REMARKS: Record<string, string[]> = {
  FEAR: [
    `"Whatever watches has not yet decided," the Arbiter says, very quietly.`,
    `The Arbiter does not turn their head. "It knows you are here. Move as if it does."`,
    `"Fear is information," the Arbiter murmurs. "What does yours tell you?"`,
    `"You are not the first to feel this dread in ${'this place'}," the Arbiter says. "Some of them lived."`,
    `The Arbiter's hand tightens on something unseen. "Make your next breath count."`,
    // OTA 203 — casual / cryptic
    `The Arbiter does not turn. "Yes. It's behind you. Has been for two days. You're slow."`,
    `"How many shadows do you have today?" the Arbiter asks. He does not look up.`,
    `"You picked up something three days back," the Arbiter says. "Hasn't introduced itself yet."`,
  ],
  CURIOSITY: [
    `"The buried world rewards a careful eye," the Arbiter says. "Look longer."`,
    `"Something here is older than its name," the Arbiter murmurs. "Find what called it that."`,
    `The Arbiter watches your hands. "What you don't understand isn't empty. It's waiting."`,
    `"Half of Tartaria is what was never written down," the Arbiter says. "You're reading the rest."`,
    `"Curiosity buys nothing in the market," the Arbiter says, "but it buys you the next door."`,
    // OTA 203 — sees something in you
    `The Arbiter studies you a beat too long. "Hm." He doesn't elaborate.`,
    `"Tartaria's been quiet about you," the Arbiter says. "That usually means it's paying attention."`,
  ],
  AGGRESSION: [
    `"A blade is a question," the Arbiter says. "Be sure you want the answer."`,
    `The Arbiter watches the air settle. "Some things bleed loudly. Others bleed last."`,
    `"Strike like you mean to walk away," the Arbiter says. "Anything less is wasted."`,
    `The Arbiter's gaze stays level. "Violence here is older than language. It will outlast yours."`,
    `"Don't celebrate," the Arbiter says quietly. "Tartaria keeps the body count."`,
    // OTA 203 — lethality undercurrent
    `The Arbiter loosens something inside the cloak. "If it comes for both of us, mind the angle."`,
    `"There are two killers in this room right now," the Arbiter says. "One of them is calmer about it."`,
    `"Don't make me decide which one of you to leave breathing," the Arbiter says, voice flat.`,
  ],
  CAUTIOUSNESS: [
    `"Patience is a relic too," the Arbiter says. "Few think to carry it."`,
    `The Arbiter nods once. "Slowness is its own kind of skill."`,
    `"Listen for what doesn't repeat," the Arbiter murmurs. "That is where the danger lives."`,
    `"You have not died yet," the Arbiter says. "Find out why before you change anything."`,
    `The Arbiter watches the dust settle. "Move when the stones forget you. Not before."`,
    // OTA 203 — cryptic-shorthand register
    `"The desert walks with you," the Arbiter says, and goes back to his cup.`,
    `"Nothing out here is alone," the Arbiter says, glancing at the horizon. "Including you."`,
    `The Arbiter watches your shadow. "More of it than the sun explains."`,
  ],
  RESOLVE: [
    `"Resolve is the only relic Tartaria does not corrupt," the Arbiter says.`,
    `The Arbiter inclines their head. "Then keep walking. The road remembers feet that don't stop."`,
    `"Good," the Arbiter says simply. "The next part is harder."`,
    `"Tartaria buries the wavering," the Arbiter says. "It does not bury you yet."`,
    // OTA 203 — terse approval, sees something in you
    `The Arbiter nods, once. "That's the first useful thing I've seen you do."`,
    `"Good," the Arbiter says. The cloak settles. He says nothing else.`,
  ],
  DESPAIR: [
    `"Sit if you must," the Arbiter says. "The ruins will still be here. So will you, if you choose."`,
    `The Arbiter does not look at you. "Despair is fast. Resolve is slow. Pick your speed."`,
    `"Many before you found this same wall," the Arbiter says. "A few walked around it."`,
    `"Rest the body, not the watch," the Arbiter says. "Tartaria does not stop watching."`,
    // OTA 203 — don't-give-a-shit register
    `"Pull yourself together," the Arbiter says, voice flat. "Or don't. I've buried both."`,
    `The Arbiter watches you fold. "I'm not in the business of carrying anyone. Decide which of us walks out."`,
  ],
};

// Intent pools — used when no cognitive mood is available, but we know the
// player's deterministic intent.
const BASE_INTENT_REMARKS: Partial<Record<Intent, string[]>> = {
  attack: [
    `The Arbiter watches the blow land or fail. "Both are answers."`,
    `"Make the next strike count for two," the Arbiter says. "Tartaria taxes the first."`,
    `"You attack as if you mean to leave," the Arbiter murmurs. "Good."`,
    // OTA 203 — casual / lethal
    `The Arbiter does not look up. "Hit it before it hits you. That's the entire trick."`,
    `"Either you walk away or it does," the Arbiter says. "I'm not particular."`,
  ],
  stealth: [
    `"The Aetherstone hears breath before it hears footsteps," the Arbiter says quietly. "Mind both."`,
    `The Arbiter's eyes drift across the room. "Quiet is a kind of armour. Wear it well."`,
    `"The watchers here have patience," the Arbiter murmurs. "Match theirs."`,
    // OTA 203 — first-person flicker, lethality
    `"I learned to walk this country quiet," the Arbiter says. "It still kills the loud ones first."`,
  ],
  diplomacy: [
    `"Tartaria has more old voices than living ones," the Arbiter says. "Address the right one."`,
    `The Arbiter tilts their head. "Words here cost something. Spend wisely."`,
    `"You can talk to the buried world," the Arbiter says. "It rarely talks back the way you expect."`,
  ],
  escape: [
    `"Retreat is a relic too," the Arbiter says. "Almost no one carries it."`,
    `The Arbiter steps aside. "Better feet than blood. Go."`,
    `"You can leave and come back," the Arbiter says. "Tartaria will recognise you."`,
    // OTA 203 — dry
    `The Arbiter shrugs under the cloak. "Living is a strategy. Pick it more often."`,
  ],
  investigate: [
    `"What you find is half of what is there," the Arbiter says. "Look again later."`,
    `The Arbiter nods at the dust. "Notice what doesn't disturb. That tells you who else moved here."`,
    `"Search the room a second time once you've left it once," the Arbiter says. "Different things will be visible."`,
    `"A relic does not announce itself," the Arbiter murmurs. "It corrects the shape of the room around it."`,
    // OTA 203 — terse, slightly bored
    `"Look twice," the Arbiter says. "Tartaria hides the second thing under the first."`,
    `The Arbiter sips at nothing. "A real find changes the shape of the room. The rest is dust."`,
  ],
  rest: [
    `The Arbiter inclines their head. "Sleep watched is still sleep."`,
    `"Tartaria does not forget the wounded," the Arbiter says. "But it will wait for them."`,
    `"Drink something," the Arbiter says. "The stones drink whatever you don't."`,
    // OTA 203 — he's watching while you sleep
    `"Sleep," the Arbiter says. "I'll wake one of us if anything comes. Probably."`,
    `The Arbiter does not sit. "Rest if you must. I keep my eyes open by habit."`,
  ],
  travel: [
    `"Every road in Tartaria leads down," the Arbiter says, "even when it climbs."`,
    `The Arbiter watches you go. "Mark the way back. Few here remember how to retrace."`,
    `"The buried world is wide," the Arbiter says. "Walk it like it knows you."`,
    // OTA 203 — cryptic / dry
    `"East," the Arbiter repeats. "Good. The east is where I'd go if I wanted what's left of me to be a story."`,
    `The Arbiter watches you walk. "Light feet. The silt is reading you, whether you noticed."`,
  ],
  cast: [
    `"Aether bends to want, not need," the Arbiter says. "Choose carefully."`,
    `"Every channel costs the channeller something," the Arbiter murmurs. "Notice what is gone."`,
    // OTA 203 — he knows the Aether, just doesn't talk about it
    `The Arbiter watches the channel without comment. He has seen better. He has seen worse.`,
  ],
  use_relic: [
    `"Relics remember their first hand," the Arbiter says. "You are not it."`,
    `"Wake it slowly," the Arbiter says. "Tartaria's old things bite when surprised."`,
  ],
  wait: [
    `"Stillness is a question too," the Arbiter says. "Listen for the answer."`,
    `The Arbiter does not move. "Tartaria fills silence with itself. Hear what arrives."`,
  ],
};

// Wrap a raw lore quote (which tends to be a bare sentence in the
// Arbiter's voice) in the same `"…," the Arbiter says.` shape that the
// hardcoded pool uses, so the two read consistently when concatenated.
function wrapLoreQuote(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  // If the line already looks dressed (starts with a quote or contains the
  // narrator beat), leave it alone.
  if (trimmed.startsWith('"') || trimmed.startsWith('`') || /the Arbiter/i.test(trimmed)) {
    return trimmed;
  }
  return `"${trimmed}" the Arbiter says.`;
}

function mergePools<K extends string>(
  base: Partial<Record<K, string[]>>,
  extra: Partial<Record<K, string[]>>,
): Record<K, string[]> {
  const out: Record<string, string[]> = {};
  const keys = new Set<string>([...Object.keys(base), ...Object.keys(extra)]);
  for (const key of keys) {
    const baseLines = (base as Record<string, string[] | undefined>)[key] ?? [];
    const extraLines = ((extra as Record<string, string[] | undefined>)[key] ?? []).map(wrapLoreQuote);
    out[key] = [...baseLines, ...extraLines];
  }
  return out as Record<K, string[]>;
}

// OTA-298 — lazy getter pattern. Each pool merges its BASE_* table
// (defined in this file at module load) with the JSON file's
// contents at first call, then caches the result. First scene
// narration pays the parse cost; every later narration is O(1).

let _moodRemarks: Record<string, string[]> | null = null;
function getMoodRemarks(): Record<string, string[]> {
  if (_moodRemarks) return _moodRemarks;
  const moodQuotes = require('../data/lore/arbiter-mood-quotes.json');
  _moodRemarks = mergePools(BASE_MOOD_REMARKS, moodQuotes as Record<string, string[]>);
  return _moodRemarks!;
}

let _intentRemarks: Partial<Record<Intent, string[]>> | null = null;
function getIntentRemarks(): Partial<Record<Intent, string[]>> {
  if (_intentRemarks) return _intentRemarks;
  const intentQuotes = require('../data/lore/arbiter-intent-quotes.json');
  _intentRemarks = mergePools<Intent>(
    BASE_INTENT_REMARKS,
    intentQuotes as Partial<Record<Intent, string[]>>,
  );
  return _intentRemarks!;
}

// Exported so gameStore's arrival-flavor composer can pull a lore beat
// from the same canonical pool without duplicating the JSON import.
let _locationFlavors: Record<string, string[]> | null = null;
export function getLocationFlavors(): Record<string, string[]> {
  if (_locationFlavors) return _locationFlavors;
  _locationFlavors = require('../data/lore/location-flavors.json') as Record<string, string[]>;
  return _locationFlavors!;
}

let _sceneFlavors: Record<string, string[]> | null = null;
function getSceneFlavors(): Record<string, string[]> {
  if (_sceneFlavors) return _sceneFlavors;
  _sceneFlavors = require('../data/lore/scene-flavors.json') as Record<string, string[]>;
  return _sceneFlavors!;
}

// Pick the best-matching scene flavor category for the current scene.
// Returns null if nothing applies. Categories are scored by tag overlap with
// hazard / weather / location tags; `atmospheric` is the gentle default.
function pickSceneFlavorCategory(input: SceneInput): string | null {
  const tagBag = new Set<string>();
  for (const t of input.weather.tags ?? []) tagBag.add(t.toLowerCase());
  for (const t of input.location.tags ?? []) tagBag.add(t.toLowerCase());
  if (input.hazard) {
    for (const t of input.hazard.tags ?? []) tagBag.add(t.toLowerCase());
  }

  const has = (...needles: string[]) => needles.some((n) => {
    for (const t of tagBag) if (t.includes(n)) return true;
    return false;
  });

  // Danger wins when an enemy is staged or hazard severity is implied.
  if (input.enemy || has('damage', 'trap', 'corruption', 'hazard', 'encounter')) {
    if (getSceneFlavors().danger?.length) return 'danger';
  }
  if (has('aetheric', 'aether', 'aetherstone', 'aetheric_core', 'aetheric_node', 'etheric_engine')) {
    if (getSceneFlavors().aether?.length) return 'aether';
  }
  if (has('ruin', 'buried', 'tomb', 'spire', 'tower', 'capital', 'lost_capital', 'stronghold')) {
    if (getSceneFlavors().ruins?.length) return 'ruins';
  }
  if (has('mystery', 'unknown', 'forgotten_order', 'objective')) {
    if (getSceneFlavors().mystery?.length) return 'mystery';
  }
  if (getSceneFlavors().atmospheric?.length) return 'atmospheric';
  return null;
}

export function buildScene(input: SceneInput): string {
  const parts: string[] = [];

  parts.push(`${input.weather.description}`);
  parts.push(`You are at ${input.location.name}. ${input.location.description}`);

  if (input.hazard) {
    parts.push(`Hazard: ${input.hazard.name}. ${input.hazard.description}`);
  }

  if (input.enemy) {
    parts.push(`${withArticleCap(input.enemy.name)} (${input.enemy.type}, ${input.enemy.rarity}) emerges. Its ${input.enemy.attack} can deal ${input.enemy.damage}.`);
  }

  if (input.quest) {
    parts.push(`Objective: ${input.quest.objective.verb} ${input.quest.objective.target} ${input.quest.complication.text}.`);
  }

  // ~25% chance: append a scene flavor line drawn from the best-matching
  // category. Falls back gracefully if no category resolves.
  if (Math.random() < 0.25) {
    const cat = pickSceneFlavorCategory(input);
    const pool = cat ? getSceneFlavors()[cat] : undefined;
    if (pool && pool.length > 0) {
      parts.push(pick(pool));
    }
  }

  return parts.join('\n\n');
}

// Last-resort fallback when NO location flavor, NO mood pool, NO intent
// pool, NO hook, NO target noun, and NO recent action matched. Used to
// hold meaningless Yoda-mantras ("Decide", "Patient hands, patient
// hands", "Either it gives or it doesn't") — the player called those
// out as nonsense narration that surfaces without context. Replaced
// with short lore-grounded statements about Tartaria as a setting so
// even the bottom of the fallback chain teaches the player something
// about the world.
// OTA 027 — replacement for the bland "The Arbiter notes how you look."
// fallback. Pool of variants picked via rotatingPick so the same line
// doesn't fire on every back-to-back look. Matches the established
// Arbiter voice (Yoda-coded cryptic killer, OTA-200-era direction).
const ARBITER_LOOK_LINES = [
  `The Arbiter does not look up. "What you see is more than what is here."`,
  `The Arbiter's eyes track yours. "Looking is the cheap action. Knowing is the one with teeth."`,
  `The Arbiter scans the same arc you did, slower. "What you miss is what comes back later."`,
  `The Arbiter waits a beat. "Tartaria gives a discount to the patient eye."`,
  `The Arbiter says nothing. The silence is its own commentary.`,
  `The Arbiter half-smiles. "Twice over makes a thing yours. Once over is a guess."`,
  // arb164 — look-pool expansion (same dilution effort as the noted pool).
  `The Arbiter lets the quiet stretch. "Look twice. The mud hides its better half."`,
  `The Arbiter follows your gaze without moving. "Half of what's here only shows itself to the second glance."`,
  `The Arbiter murmurs, "Eyes are cheap. Attention costs. Spend it well."`,
  `The Arbiter watches the same shadows. "Something here is worth the staring. Maybe not today."`,
  `The Arbiter says, "The careful eye leaves Tartaria richer. The careless one leaves it a body."`,
  `The Arbiter does not blink. "You're looking for it. It's looking back. Fair trade."`,
  `The Arbiter tips their chin at the dark. "Read the room before the room reads you."`,
  `The Arbiter says softly, "Look long enough and the buried country starts to look familiar. That's the danger."`,
  `The Arbiter waits with you. "Patience is a tool here. Most pack everything but that."`,
  `The Arbiter says, "What you overlook now, you meet again later. It rarely improves."`,
];

// OTA-186 — first-person reaction lines that replace the awkward
// third-person "The Arbiter notes how you ${verb}." template. The
// old template echoed the raw verb-target string verbatim, which
// produced lines like "The Arbiter notes how you investigate stall."
// — clinical, third-person, ungrammatical. Player ask: "I don't
// want him calling himself arbiter, say something like 'I saw how
// you were looking at that stall'."
//
// New pool is generic enough to read after any player action
// (investigate, attack, salvage, climb, eat, etc.) without needing
// per-verb grammar mapping. The Arbiter speaks as "I" — the prefix
// "The Arbiter says, " or "The Arbiter watches. " carries the
// dialogue-tag so it stays in the existing arbiter-voice cadence.
const ARBITER_NOTED_LINES = [
  `The Arbiter watches. "I saw the way you came at that."`,
  `The Arbiter speaks low. "I noticed how you handled that."`,
  `The Arbiter half-nods. "I marked the choice."`,
  `The Arbiter follows your eyes. "I see what you saw."`,
  `The Arbiter says, "I caught the read. Good or bad — that was yours."`,
  `The Arbiter watches you finish. "I noted the move."`,
  `The Arbiter says quietly. "I saw it. The world saw it too."`,
  // arb164 — pool expansion so the reaction line stops repeating every few
  // actions. Same first-person register, generic enough to follow any deed.
  `The Arbiter inclines their head. "That'll do. For now."`,
  `The Arbiter watches your hands. "Steadier than last time. I keep track."`,
  `The Arbiter says, "Noted. The mud keeps its own ledger too."`,
  `The Arbiter's gaze lingers a moment. "You move like you've decided something."`,
  `The Arbiter exhales through the nose. "Not how I'd have done it. Not wrong, either."`,
  `The Arbiter says, "I've watched a hundred do that. You did it quieter."`,
  `The Arbiter tilts their head. "Hm. The country noticed that one."`,
  `The Arbiter says low, "Every move spends something. I'm keeping count."`,
  `The Arbiter nods, barely. "That's the kind of thing that gets remembered out here."`,
  `The Arbiter watches you settle. "You're getting a feel for the weight of this place."`,
  `The Arbiter says, "Good instincts. Tartaria eats the other kind."`,
  `The Arbiter's mouth twitches. "I'd call that nerve. The mud calls it dinner, sometimes."`,
  `The Arbiter says, "I saw it land. So did whatever's listening."`,
  `The Arbiter looks from you to the dark and back. "Fine. Keep that edge."`,
  `The Arbiter says quietly, "You hesitated less that time. I notice the small things."`,
  `The Arbiter regards you evenly. "A clean read. The buried country rewards those, rarely."`,
  `The Arbiter says, "Filed away. I forget nothing down here — it's the one thing I'm good for."`,
  `The Arbiter watches a breath longer than needed. "You're harder to read than when we started. Good."`,
];

const GENERIC_REMARKS = [
  `"Tartaria was a place of life and power once," the Arbiter says. "Now mostly whispers."`,
  `"The Aetherstone Flood ended a thousand years ago," the Arbiter says, "but at ground level it never quite stopped moving."`,
  `"Every faction down here is hunting the same thing," the Arbiter says. "They just call it different names."`,
  `"The mud remembers what the surface forgot," the Arbiter murmurs.`,
  `"The Reclaimers Guild maps what they can," the Arbiter says. "What they can't, they pay you to chart."`,
  `"The Forgotten Order won't say what they're rebuilding," the Arbiter notes. "Only that it's older than the flood."`,
  `"True Tartarians walked these roads before the mud came. Some of them still do."`,
  `"Aetherstone is the bedrock of this country," the Arbiter says. "Touch it carefully — it has opinions."`,
  // arb164 — lore-musing expansion; these are the targetless fallback flavor.
  `"The towers went down in a day," the Arbiter says. "The mud's been finishing the job for a thousand years."`,
  `"Everything down here was someone's home once," the Arbiter murmurs. "Mind your boots."`,
  `"The flood didn't drown Tartaria," the Arbiter says. "It buried it alive. There's a difference."`,
  `"Maps lie out here," the Arbiter notes. "The ground rearranges itself when no one's watching."`,
  `"The Giants are gone," the Arbiter says. "Their servants didn't get the message."`,
  `"Coin spends the same in every camp," the Arbiter says. "Loyalty doesn't. Spend that one slower."`,
  `"The Aetherstorms remember the old roads," the Arbiter says. "Walk them and they'll walk back."`,
  `"There are older things than the factions down here," the Arbiter says. "They don't recruit. They collect."`,
  `"The buried cities still have lights on," the Arbiter says. "No one's asked who's paying the bill."`,
  `"Tartaria keeps what it takes," the Arbiter says. "Names, mostly. See that you keep yours."`,
  `"The Conspiracy Architects redraw what fell," the Arbiter says. "Whether it wants redrawing, they don't ask."`,
  `"Every relic down here was a tool first," the Arbiter says. "Most still remember the job."`,
  `"The mud's patient," the Arbiter says. "It's outlasted empires. It'll outlast your hurry."`,
  `"The dead outnumber the living a thousand to one here," the Arbiter says. "Be polite."`,
  `"Whatever ended this place left in a hurry," the Arbiter says. "The cups are still on the tables."`,
  `"They say the Aetherstone dreams," the Arbiter says. "On the bad nights, I believe them."`,
];

export interface ArbiterContext {
  location: Location;
  hazard?: Hazard | null;
  enemy?: Enemy | null;
  intent?: Intent;
  mood?: string;
  /**
   * Most recent player actions (free-form short phrases like "drew your
   * blade" or "stepped into the chamber"). When present, the Arbiter will
   * occasionally reference the most recent one in passing.
   */
  recentActions?: string[];
  /**
   * Unresolved narrative hooks in the current scene. When present, the
   * Arbiter has a chance to reference the thread instead of pulling a
   * random mood line — this is what makes the world feel coherent.
   */
  unresolvedHooks?: { kind: string; nouns: string[] }[];
  /**
   * The specific noun the player named in this turn (steal dagger, attack
   * figure, throw stone at the camp...). When set, the Arbiter's hook
   * callback fork is suppressed so the response doesn't drift off-target
   * — "you stole the dagger" should not be followed by "the Arbiter
   * glances at the statue, still waiting." Stay on the player's noun.
   */
  playerTargetNoun?: string;
  /**
   * Player vitals + inventory hints for the wellness fork. The Arbiter
   * occasionally drops a friend-chat remark — "you holding up? eat
   * something / there's a first-aid kit in your pack" — when HP or
   * stamina is in the rough zone. All optional; missing values disable
   * the fork.
   */
  playerHpFraction?: number;
  playerStaminaFraction?: number;
  hasFirstAidKit?: boolean;
  hasFood?: boolean;
}

// OTA-1026 — the mood arrives one action STALE (the cognitive read for the
// current action lands after this line prints), so the first peaceful action
// after a fight still reads AGGRESSION — and every AGGRESSION line
// presupposes a live opponent ("don't make me decide which one of you to
// leave breathing" fired over a quiet crate salvage in the owner's log).
// Every other mood reads fine ambient (FEAR is atmosphere, CURIOSITY is
// looting); AGGRESSION alone is combat-locked, so it only selects its pool
// when the scene actually holds a live enemy.
function pickMoodPool(mood: string | undefined, hasLiveEnemy?: boolean): string[] | undefined {
  if (!mood) return undefined;
  if (mood === 'AGGRESSION' && !hasLiveEnemy) return undefined;
  const pool = getMoodRemarks()[mood];
  return pool && pool.length > 0 ? pool : undefined;
}

// Combat-only Arbiter lines that reference the specific enemy. Used when the
// scene has an active hostile; takes priority over the generic intent pool.
// OTA 203 — highest-fired pool (65% chance per combat turn). New lines lean
// on the lethality-undercurrent and casual-killer registers; he's seen
// worse, the cloak hides more than it shows, and if you fold he might
// solve it himself just to keep his afternoon quiet.
const COMBAT_REMARKS = [
  `The Arbiter watches the {enemy}. "It is not the first thing here that decided to keep its distance, then changed its mind."`,
  `"Footwork over fury," the Arbiter says quietly. "The {enemy} is patient. Be patienter."`,
  `The Arbiter does not look away from the {enemy}. "Decide quickly. It already has."`,
  `"You hit what you commit to," the Arbiter says. "The {enemy} hears the difference."`,
  `"Tartaria does not award style points," the Arbiter says, eyes on the {enemy}. "End it."`,
  `The Arbiter's hand drifts to nothing in particular. "The {enemy} will not tire before you do. Spend wisely."`,
  `"That one bleeds slow," the Arbiter says. "Make the hit count."`,
  `"You can fight, hide, or speak," the Arbiter says low. "The {enemy} is already deciding for itself."`,
  // OTA 203 — lethality undercurrent, casual delivery
  `The Arbiter loosens something inside the cloak, not looking down. "The {enemy} is closer than you think it is."`,
  `"There are two killers here right now," the Arbiter says, watching the {enemy}. "Be the calmer one."`,
  `The Arbiter does not move. "If you can't finish the {enemy}, I will. I'd rather not. My afternoon's planned."`,
  `"That {enemy} is making the same mistake," the Arbiter says, almost bored. "Capitalize."`,
  `The Arbiter glances at the {enemy} the way you'd glance at weather. "Storm. Pass through it."`,
  `"Don't tell me what the {enemy} is," the Arbiter says, eyes flat. "Show me what it was."`,
  `The Arbiter does not look at you. "Kill it before it gets a name. They're harder once they've earned one."`,
  // arb164 — combat-pool expansion. {enemy} token replaced at pick time.
  `The Arbiter watches the {enemy} circle. "It's measuring you. Give it the wrong number."`,
  `"The {enemy} has done this before," the Arbiter says. "So have you. Prove you remember."`,
  `The Arbiter's voice stays level. "Breathe. The {enemy} wants you ragged."`,
  `"Let the {enemy} swing first," the Arbiter says. "Then take everything it leaves open."`,
  `The Arbiter eyes the {enemy} without concern. "It's bigger. Bigger falls harder."`,
  `"The {enemy} fights like it's already won," the Arbiter says. "Disagree with it."`,
  `The Arbiter watches the gap close. "The {enemy} is committed now. Make it regret that."`,
  `"Strike where the {enemy} is going," the Arbiter says, "not where it's been."`,
  `The Arbiter does not raise their voice. "The {enemy} can be reasoned with. The reasoning is a blade."`,
  `"One of you ends this exchange standing," the Arbiter says, eyes on the {enemy}. "Cast the vote."`,
];

// OTA-813 — a boss / named Guardian is a PROPER NOUN; lowercasing it reads wrong
// ("the heir atalan-drowned is patient"). Generic creatures still lowercase cleanly
// ("the mud boar"). Keyed off the `boss` flag (Core Guardians + boss-gate spawns all
// carry it), so the fix is scoped to exactly the named threats.
export function combatEnemyLabel(enemy: Pick<Enemy, 'name' | 'boss'>): string {
  return enemy.boss ? enemy.name : enemy.name.toLowerCase();
}

function combatRemark(enemy: Enemy): string {
  return rotatingPick(COMBAT_REMARKS, 'arbiter.combat.remark').replace('{enemy}', combatEnemyLabel(enemy));
}

// arb136 — cooldown counter for the unresolved-hook "nag" callback. Without it the
// Arbiter chanted "still there, still yours" / "that memory will rot" at 40% on EVERY
// targetless action about the SAME hook. Now it fires at most once per ~6 qualifying
// actions. Module-level so it persists across remark calls (like rotatingPick's state).
let hookNagCooldown = 0;

export function buildArbiterRemark(ctx: ArbiterContext): string {
  const inCombat = !!ctx.enemy;

  // When an enemy is present, the Arbiter stays on combat. No location
  // tourism mid-fight ("the borderlands. Where Tartaria thins" was firing
  // while the player was mid-swing).
  if (inCombat) {
    // ~20% chance to ack the player's most recent action even in combat —
    // gives the Arbiter a beat of awareness before the combat color.
    // recentActions is pre-filtered in gameStore so meta-questions don't
    // land here, but defense-in-depth: bail if it looks like a sentence
    // rather than a verb phrase.
    if (
      ctx.recentActions &&
      ctx.recentActions.length > 0 &&
      Math.random() < 0.2
    ) {
      const lastAction = ctx.recentActions[ctx.recentActions.length - 1];
      if (
        lastAction &&
        lastAction.trim().length > 0 &&
        lastAction.length <= 30 &&
        !lastAction.includes('?') &&
        !/^\s*(what|how|why|who|when|where|i am|i'm|am i)\b/i.test(lastAction)
      ) {
        // OTA 027 — bland "notes how you look" filler swapped for
        // rotating pool when the last action is a plain look. Other
        // actions still get the generic "notes how you {action}".
        // OTA-186 — non-look actions ALSO use a rotating pool now,
        // first-person voice instead of the third-person template
        // that echoed the raw verb verbatim.
        if (lastAction.trim().toLowerCase() === 'look') {
          return `${rotatingPick(ARBITER_LOOK_LINES, 'arbiter.look')} ${combatRemark(ctx.enemy!)}`;
        }
        // arb136 — was the NOTED line + combatRemark CONCATENATED, which double-tagged
        // the speaker ("The Arbiter watches. '…' The Arbiter watches the aetherbat. '…'").
        // Use the enemy-aware combat remark alone so it reads as one clean Arbiter line.
        return combatRemark(ctx.enemy!);
      }
    }
    // Combat color rotates between enemy-aware remarks and the attack
    // intent pool. Mood-pool lines (Mud Monarchs etc.) used to fire here
    // and read as off-topic mid-knife-fight; cut that branch entirely.
    const intentAttack = getIntentRemarks().attack;
    const r = Math.random();
    if (r < 0.65) return combatRemark(ctx.enemy!);
    if (intentAttack && intentAttack.length > 0) return rotatingPick(intentAttack, 'arbiter.combat.attack');
    return combatRemark(ctx.enemy!);
  }

  // ~15% chance to drop a friend-chat / wellness remark when the player
  // is genuinely hurt or tired AND has a useful item in their pack.
  // Fires out-of-combat only (the combat branch above already returned).
  // Suppressed when the player named a target this turn — staying
  // on-noun beats checking in. Tracked through rotatingPick so the
  // same line doesn't fire twice in a row.
  if (!ctx.playerTargetNoun && Math.random() < 0.15) {
    const hpFrac = ctx.playerHpFraction ?? 1;
    const stamFrac = ctx.playerStaminaFraction ?? 1;
    const wellnessLines: string[] = [];
    if (hpFrac < 0.4 && ctx.hasFirstAidKit) {
      wellnessLines.push(
        `The Arbiter softens. "You're carrying a first-aid kit. Crack it before the next swing comes."`,
        `"Field-dress that," the Arbiter says quietly. "Kit's in your pack. Use it now, not after."`,
        `The Arbiter watches you a moment. "You look rough. The kit is for moments like this — don't hoard it."`,
      );
    } else if (hpFrac < 0.4) {
      wellnessLines.push(
        `The Arbiter's voice drops. "You're bleeding more than you think. Find cover, find a bandage."`,
        `"You holding up?" the Arbiter says. "Honest answer. If it's no, fix that before you push on."`,
      );
    }
    if (stamFrac < 0.35 && ctx.hasFood) {
      wellnessLines.push(
        `"Eat something," the Arbiter says, almost gentle. "Stamina doesn't refill on grit. You've got rations."`,
        `The Arbiter taps the air near your pack. "Rations. Now. Tartaria does not forgive an empty stomach."`,
      );
    } else if (stamFrac < 0.35) {
      wellnessLines.push(
        `"You're running on fumes," the Arbiter says. "Sit a moment. Catch your breath before something catches you."`,
        `The Arbiter studies you. "Tired hands miss. Rest, even briefly, beats pressing through."`,
      );
    }
    if (hpFrac > 0.85 && stamFrac > 0.85 && Math.random() < 0.5) {
      // Quiet check-in when the player is fine — keeps the friend tone
      // present in the rotation instead of only firing on damage.
      wellnessLines.push(
        `"You're carrying yourself well today," the Arbiter says, almost casual.`,
        `The Arbiter glances at you. "Steady. Good. Tartaria rewards steady."`,
      );
    }
    if (wellnessLines.length > 0) {
      return rotatingPick(wellnessLines, 'arbiter.wellness');
    }
  }

  // ~40% chance to reference an unresolved narrative hook in this scene —
  // this is the one that ties the world together. The player saw smoke /
  // footprints / a spire on their last action; the Arbiter calls back to it.
  //
  // BUT: when the player named a specific noun this turn (steal dagger,
  // attack figure, throw stone at the camp), suppress the hook callback —
  // jumping to a different noun reads as the Arbiter ignoring what the
  // player just did. Stay on-target.
  if (
    !ctx.playerTargetNoun &&
    ctx.unresolvedHooks && ctx.unresolvedHooks.length > 0
  ) {
    // arb136 — COOLDOWN the hook-nag (was 40% on EVERY targetless action about the
    // same hook → the Arbiter nagged every couple seconds). Fire at most once per
    // ~6 qualifying actions.
    if (hookNagCooldown > 0) {
      hookNagCooldown -= 1;
    } else if (Math.random() < 0.35) {
      hookNagCooldown = 6;
      const hook = ctx.unresolvedHooks[0]!;
      const noun = hook.nouns[0] ?? hook.kind;
      // Plural-safe phrasings only — playtest log caught "The footprints hasn't
      // gone anywhere." Avoid is/are/has/have around ${noun} entirely.
      const callbacks = [
        `"The ${noun} — still waiting," the Arbiter says. "Decide if it matters."`,
        `"You saw the ${noun}," the Arbiter notes. "That memory will rot if you leave it."`,
        `"Threads in Tartaria don't wait long," the Arbiter says quietly. "The ${noun} won't either."`,
        `The Arbiter glances toward the ${noun}. "Still there. Still yours, if you take it."`,
      ];
      return pick(callbacks);
    }
  }

  // Player named a specific noun this turn — keep the Arbiter on-target.
  // The OLD lines here ("Either it gives or it doesn't", "Patient hands,
  // patient hands", "Pick what comes after") were the Yoda-mantras the
  // player complained about: surface noise that says nothing about the
  // noun or the world. Replaced with location-anchored callbacks that
  // either give a small lore beat OR explicitly defer to the player's
  // next move — never both, never neither.
  if (ctx.playerTargetNoun) {
    const n = ctx.playerTargetNoun;
    // Sanity gate — if the "noun" is clearly garbage prose (long
    // sentence, contains question/exclamation punctuation, or runs
    // over 60 chars) the player didn't actually name a thing.
    // Echoing it back as if it were a noun produces lines like
    // "The should also pop up pull nouns," the Arbiter says.
    //
    // 2026-05-26 OTA-060 — bumped wordCount limit from > 3 to > 6
    // and chars from > 40 to > 60. Playtester reported the Arbiter
    // saying "I'm not sure what you're trying to tell me" after a
    // legitimate "climb jagged dormant architectural sentinel"
    // (4 words, 36 chars) — flavor-prefixed scene nouns routinely
    // run 4-5 words ("salt-crusted sentinel diagnostic console" is
    // 5 words, 41 chars) and are real, parser-resolved nouns. Only
    // truly long player prose should trip this now.
    const wordCount = n.trim().split(/\s+/).length;
    const isGarbageNoun = wordCount > 6 || n.length > 60 || /[?!]/.test(n);
    if (isGarbageNoun) {
      return `The Arbiter studies you, plainly. "I'm not sure what you're trying to tell me. Phrase it as the deed you mean to do — 'search', 'attack', 'go east'."`;
    }
    // ~60% of the time, anchor the on-target line in the location's
    // lore pool — "the spire" + "The Spire still drinks. From what
    // celestial well, no one will answer." reads as the Arbiter
    // actually KNOWING what they're at.
    const locPool = getLocationFlavors()[ctx.location.id];
    if (locPool && locPool.length > 0 && Math.random() < 0.6) {
      // OTA-699 — was plain pick() (no anti-repeat), so the same room-flavor line
      // ("This is the room where the disaster was managed…") recurred verbatim on
      // every investigate. rotatingPick round-robins with an avoid-last guard, and
      // shares the SAME key as the default branch below so both drain one cursor.
      return `The Arbiter glances at the ${n}. "${rotatingPick(locPool, `arbiter.loc.${ctx.location.id}`)}"`;
    }
    // Otherwise a short defer-to-player line that names the noun
    // without pretending to know more than it does. Three options
    // only — small pool, rotating, no mantras.
    // Expanded from 3 to 10 lines per uniqueness audit — the
    // original three-line pool saturated within ~6 fires and
    // dominated the top-repeated Arbiter remarks list. Ten variants
    // grouped loosely by tone (patient / dry / wary / curious /
    // resigned) so back-to-back fires don't read as the same beat.
    const deferLines = [
      `"The ${n}," the Arbiter says. "Tell me what you mean to do with it."`,
      `The Arbiter watches you and the ${n} both. "Your move."`,
      `"What you make of the ${n} is on you," the Arbiter says.`,
      `The Arbiter considers the ${n}. "Name your intent and I'll grade it."`,
      `"You've got ${withArticle(n)} and a question," the Arbiter says. "Pair them."`,
      `"The ${n} won't act for you," the Arbiter says, dry. "Choose a verb."`,
      `The Arbiter glances between you and the ${n}. "Decide while it's still yours to."`,
      `"I will know what you mean when you act on the ${n}," the Arbiter says.`,
      `"The ${n} is here. So are you. Make something of that."`,
      `The Arbiter waits. "${n[0]?.toUpperCase()}${n.slice(1)}. What's the verb?"`,
    ];
    return rotatingPick(deferLines, 'arbiter.target-callback');
  }

  // ~15% chance to acknowledge the player's most recent action, wrapped in
  // the lore-flavored mood pool when available.
  if (
    ctx.recentActions &&
    ctx.recentActions.length > 0 &&
    Math.random() < 0.15
  ) {
    const lastAction = ctx.recentActions[ctx.recentActions.length - 1];
    if (lastAction && lastAction.trim().length > 0) {
      const moodPool = pickMoodPool(ctx.mood, !!ctx.enemy);
      const flavor = moodPool ? pick(moodPool).replace('this place', ctx.location.name) : null;
      // OTA 027 — see combat-context site above. Plain "look" gets
      // the rotating LOOK pool instead of the generic templated
      // filler. OTA-186 — non-look actions ALSO use a rotating
      // first-person pool; the third-person "Arbiter notes how
      // you ${verb}" template that echoed the raw verb verbatim
      // is gone.
      const noted = lastAction.trim().toLowerCase() === 'look'
        ? rotatingPick(ARBITER_LOOK_LINES, 'arbiter.look')
        : rotatingPick(ARBITER_NOTED_LINES, 'arbiter.noted.peace');
      return flavor ? `${noted} ${flavor}` : noted;
    }
  }

  // Location-specific flavor — the PRIMARY ambient remark when nothing
  // more specific (combat / hook / target / recent action) has fired.
  // Previously gated at 10%, falling through to mood/intent/generic
  // mantras 90% of the time and producing the "yeah, either the
  // torches or the torch isn't" gibberish the player flagged. Now this
  // is the default: at the Pillars the Arbiter talks about the
  // Pillars, at Voronov they talk about Voronov, at the Cathedral
  // about the Cathedral. Wrapped with rotatingPick so the same scene
  // doesn't repeat the same lore line two replies in a row.
  const locPool = getLocationFlavors()[ctx.location.id];
  if (locPool && locPool.length > 0) {
    return `The Arbiter looks around. "${rotatingPick(locPool, `arbiter.loc.${ctx.location.id}`)}"`;
  }

  // Mood pool — only fires when the location has no authored flavor
  // (procedural / future content). Replaces "this place" with the
  // actual location name so the line stays anchored.
  const moodPool = pickMoodPool(ctx.mood, !!ctx.enemy);
  if (moodPool) {
    return pick(moodPool).replace('this place', ctx.location.name);
  }
  // Intent-specific — same constraint, only when no location flavor.
  const intentPool = ctx.intent ? getIntentRemarks()[ctx.intent] : undefined;
  if (intentPool && intentPool.length > 0) {
    return pick(intentPool);
  }
  // Hazard fallback — names the active hazard, useful bearing.
  if (ctx.hazard && Math.random() < 0.4) {
    return `The Arbiter eyes the ${ctx.hazard.name.toLowerCase()}. "Tartaria's older hazards are the ones you can't see coming. This one you can."`;
  }
  // Last resort — lore-grounded setting remarks (no Yoda mantras).
  return rotatingPick(GENERIC_REMARKS, 'arbiter.generic');
}

/**
 * Failure narration pool for the `use_relic` skill check. Framed as the
 * player's fumble — "you tried but it didn't work" — rather than the relic
 * outright refusing the player. HANDOFF §5 #5 complaint: the old line
 * "The relic stutters. The connection does not hold." read as a hard
 * rejection from the device.
 *
 * Invariant the test asserts: none of these lines say "fail", "broken",
 * "refuse", or any other word that frames the relic as the problem.
 */
export const USE_RELIC_FAILURE_LINES: readonly string[] = [
  'You focus on the relic, but the Aether slips through your grasp. The connection wavers and breaks.',
  'You press the relic harder than it wants. The hum dies under your hand.',
  'You try to coax the relic to life — it answers only with a thin, faltering pulse, then nothing.',
];

/**
 * Whitelist of player intents where Qwen (the generative Arbiter) is
 * actually a good fit. Travel and diplomacy are the intents where the
 * player wants atmosphere or curiosity — exactly the cases where a
 * paragraph of generated prose adds value. `scene_intro` is the
 * synthetic intent the scene-entry path uses so the Arbiter can
 * narrate a new room with the same permission.
 *
 * Every other intent (attack, dodge, rest, use_relic, craft, inventory,
 * equip, dig, vendor flows, investigate…) wants instant feedback. The
 * deterministic template path covers those much faster than a 10–20 s
 * LLM round trip and never hallucinates events the engine didn't do.
 *
 * narrateViaArbiter checks this set AND scene combat state before
 * deciding to call the model. Outside the whitelist, or in active
 * combat, the template fires immediately and no LLM call is made.
 */
export const QWEN_ALLOWED_INTENTS: ReadonlySet<string> = new Set([
  // arb163 — REACTIVE Qwen is now limited to scene transitions only. The
  // dominant per-action beats (investigate / search / rest) were widened into
  // this set in arb158, but on the slow v8_2 kernel a reactive line takes
  // ~6-8s and the NEXT action cancels it before it finishes — so it almost
  // never completes, yet still feels "late" because the player is waiting for
  // a reaction to THAT action. The fix (player's idea): reactions are carried
  // by instant canned templates; Qwen instead speaks UNPROMPTED, reflective
  // AMBIENT lines (see maybeGenerateAmbientArbiter) that aren't tied to any
  // event, so latency stops mattering. Scene-entry narration stays here because
  // it fires once per transition (not spammy) and reads as arrival atmosphere.
  'travel',
  'diplomacy',
  'scene_intro',
]);

/**
 * Decides whether the Arbiter should speak this turn. Replaces the previous
 * flat 45% gate (HANDOFF §5 #1: "Arbiter feels disconnected"). The baseline
 * sits at 20% and earns context-aware boosts: combat, unresolved hooks, mood,
 * and recent player input each nudge it up. Cap is 60% so even maximally
 * "interesting" turns don't always trigger commentary.
 *
 * All flags are optional — callers from older code paths that just say
 * `shouldArbiterSpeak()` quietly settle at the 20% baseline rather than
 * dominating the log.
 */
export function shouldArbiterSpeak(ctx?: {
  hasEnemy?: boolean;
  hasUnresolvedHooks?: boolean;
  hasRecentActions?: boolean;
  hasMood?: boolean;
}): boolean {
  let chancePct = 20;
  if (ctx?.hasEnemy) chancePct += 15;
  if (ctx?.hasUnresolvedHooks) chancePct += 15;
  if (ctx?.hasMood) chancePct += 10;
  if (ctx?.hasRecentActions) chancePct += 5;
  return chance(Math.min(60, chancePct));
}

export interface SoftArbiterContext {
  parsed: ParsedInput;
  inventory: InventoryItem[];
  enemy?: Enemy | null;
  location: Location;
  hazard?: Hazard | null;
  /** 0..1 — used to bias the Arbiter toward suggesting food when the player is hurt. */
  playerHpFraction?: number;
  /** Cognitive layer's most recent dominant emotion, used to bias hints. */
  mood?: string;
  /** The most recently mentioned noun across the last few player turns —
   *  used to ground "what's inside?" / "is it open?" follow-ups so the
   *  Arbiter doesn't pull a random inventory item that has nothing to
   *  do with what the player was looking at. */
  lastInteractedNoun?: string | null;
  /** Original player input — lets the fallback match question patterns
   *  ("is there anything inside?", "what's in it?") that the parser
   *  classifies as unknown but which clearly refer to the most recent
   *  noun. */
  rawText?: string;
}

// Score an inventory item by relevance to the current situation. Higher score
// = better hint candidate. Used in soft fallback so the Arbiter mentions an
// item that actually fits the moment, not a random one from the pack.
function scoreItemForHint(item: InventoryItem, ctx: SoftArbiterContext): number {
  let score = 0;
  const tags = item.tags ?? [];
  const hazardTags = ctx.hazard?.tags ?? [];
  const hpHurt = (ctx.playerHpFraction ?? 1) < 0.5;
  const hpCritical = (ctx.playerHpFraction ?? 1) < 0.25;

  // Light sources in dark / obscured hazards or fearful mood.
  if (tags.includes('light')) {
    if (hazardTags.some((t) => /dark|obscure|fog|haze|night/.test(t))) score += 5;
    if (ctx.mood === 'FEAR') score += 2;
    if (ctx.enemy) score += 1;
  }
  // Food / consumables when the player is hurt.
  if (tags.includes('food') || item.kind === 'consumable') {
    if (hpCritical) score += 6;
    else if (hpHurt) score += 3;
  }
  // Detection / lore items when curious or facing mystery.
  if (tags.includes('detection') || tags.includes('relic')) {
    if (ctx.mood === 'CURIOSITY') score += 3;
    if (hazardTags.some((t) => /mystery|unknown|aether/.test(t))) score += 2;
  }
  // Weapons / blades in combat.
  if (tags.some((t) => /weapon|blade|edge|runecaster/.test(t))) {
    if (ctx.enemy) score += 4;
  }
  return score;
}

function pickContextualItem(inventory: InventoryItem[], ctx: SoftArbiterContext): InventoryItem | null {
  if (inventory.length === 0) return null;
  const scored = inventory.map((item) => ({ item, score: scoreItemForHint(item, ctx) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]!;
  if (top.score > 0) {
    const tied = scored.filter((s) => s.score === top.score).map((s) => s.item);
    return pick(tied);
  }
  return pick(inventory);
}

export function buildSoftArbiterFallback(ctx: SoftArbiterContext): string {
  const { parsed, inventory, enemy, location } = ctx;

  if (parsed.resolvedNoun) {
    return `The Arbiter follows your gaze toward the ${parsed.resolvedNoun.toLowerCase()}. "Tell me what you would do with it."`;
  }

  // "What's inside?" / "is there anything in it?" / "is it open?" —
  // questions about contents or state of the LAST noun the player
  // interacted with. Pulling a random inventory item here produced
  // "Your cavern sound stones is still there" when the player asked
  // about a locket. Ground the answer in the recent noun instead.
  const rawLower = (ctx.rawText ?? '').toLowerCase();
  const isContentsQuestion = /\b(inside|contents?|in it|in there|in the|what'?s? in)\b/i.test(rawLower)
    && /\?$|\bany\b|\bwhat\b/i.test(rawLower);
  if (isContentsQuestion && ctx.lastInteractedNoun) {
    const n = ctx.lastInteractedNoun.toLowerCase();
    return `The Arbiter glances at the ${n}. "If the ${n} were hiding something, it would have shown by now. What you took from it is what it had."`;
  }

  if (enemy) {
    return pick([
      `The Arbiter does not look away from the ${combatEnemyLabel(enemy)}. "Decide quickly. It will not wait."`,
      `"You can fight, hide, or speak," the Arbiter says low. "${enemy.name} is already deciding for itself."`,
    ]);
  }

  const item = pickContextualItem(inventory, ctx);
  if (item) {
    // Tagline depends on WHY it was picked, so the hint feels intentional.
    const name = item.name.toLowerCase();
    const tags = item.tags ?? [];
    if ((ctx.playerHpFraction ?? 1) < 0.5 && (tags.includes('food') || item.kind === 'consumable')) {
      return `The Arbiter notes your wounds and your pack in the same glance. "The ${name} would mend you, if you stopped to take it."`;
    }
    if (tags.includes('light') && (ctx.hazard || ctx.mood === 'FEAR')) {
      return `The Arbiter looks at the dark around you. "The ${name} was made for moments like this."`;
    }
    if (tags.includes('detection') && ctx.mood === 'CURIOSITY') {
      return `The Arbiter's eyes find your pack. "The ${name} hums in places like this. Worth a moment of attention."`;
    }
    return `The Arbiter glances at your pack. "Your ${name} is still there, if it suits the moment."`;
  }

  return pick([
    `The Arbiter waits, expression unreadable. "Say it plainer — the stones are listening."`,
    `"Search, rest, or move on," the Arbiter offers. "Even small choices echo in ${location.name}."`,
    `The Arbiter studies you. "Phrase it as the deed you mean to do. Look. Search. Strike. Flee."`,
  ]);
}

// Proactive Arbiter beats fired at scene start. These shape the story by
// gesturing at a direction the player might take — not "describe what's
// here" but "here is what to do about it." Combat scenes get a different
// pool so the Arbiter stays on-topic when an enemy is staged.
const ARBITER_SCENE_INTROS = [
  `The Arbiter steps to the edge of {locationName} and watches. "Worth a careful look before the dust settles."`,
  `"This place has changed since I last passed through," the Arbiter says. "Or perhaps it has not, and I have."`,
  `The Arbiter inhales the air of {locationName}. "Tartaria is louder here than it was an hour ago. Move carefully."`,
  `"There are paths from this place," the Arbiter murmurs. "Ask, and I will tell you what I know."`,
  `The Arbiter eyes one corner of {locationName}. "Begin there, if you must begin somewhere."`,
  `"You could rest here," the Arbiter says. "Or push on. Tartaria does not insist."`,
  `The Arbiter watches the dust hang. "The room has not been disturbed in some time. Or it has, and you should look closer."`,
  `"Three things in this place would reward attention," the Arbiter says, without naming them. "I would start with the one you cannot quite see."`,
];

const ARBITER_COMBAT_INTROS = [
  `The Arbiter watches the {enemyName}. "It has not moved on its own yet. That means something."`,
  `"You can take it, or you can leave it," the Arbiter says. "It will remember either way."`,
  `The Arbiter's gaze stays on the {enemyName}. "Strike, hide, or speak — the choice is yours and it is brief."`,
  `"That one bleeds slow," the Arbiter says quietly. "Plan two moves, not one."`,
];

export interface SceneIntroContext {
  location: Location;
  enemy?: Enemy | null;
  player?: PlayerCharacter | null;
  worldMemory?: WorldMemory | null;
}

export function buildArbiterSceneIntro(ctx: SceneIntroContext): string {
  const { location, enemy, player, worldMemory } = ctx;

  // Combat scenes stay tight on the threat — no identity / timeline drift
  // while a hostile is staged.
  if (enemy) {
    return pick(ARBITER_COMBAT_INTROS).replace('{enemyName}', combatEnemyLabel(enemy));
  }

  // ~12% — timeline callback. Builds dynamically from milestones and the
  // world's defeated-enemies / discovered-locations memory. Most evocative
  // option when it fires (Arbiter actually references what you've done).
  if (Math.random() < 0.12) {
    const cb = pickTimelineCallback(player, worldMemory);
    if (cb) return cb;
  }

  // ~12% — race-specific remark. The Arbiter acknowledges the heritage
  // the player picked at character creation.
  if (player && Math.random() < 0.12) {
    const pool = ARBITER_RACE_REMARKS[player.raceId];
    if (pool && pool.length > 0) return pick(pool);
  }

  // ~12% — faction-specific remark. The Arbiter acknowledges the faction
  // the player aligned with at start.
  if (player && Math.random() < 0.12) {
    const pool = ARBITER_FACTION_REMARKS[player.factionId];
    if (pool && pool.length > 0) return pick(pool);
  }

  // ⚠ OTA-1067 — PHASE 5. ~15% — who the Arbiter is, in passing.
  //
  // This branch is where the phase lands in play. It used to be a flat pick
  // from thirteen lines that knew nothing: the same confession on hour two and
  // hour ninety, to a player who robbed him blind and one who carried nine
  // Cores out, in identical tone.
  //
  // It now asks arbiterPersona what he would say GIVEN where he stands in the
  // arc and what he thinks of this player, and falls back to the old pool only
  // when there is no character to read (title-screen previews, fixtures).
  //
  // Note the counter rather than a roll — see arbiterRemark's header. WHETHER
  // he says something personal is still chance; WHICH thing he says is a pure
  // function of the save, because an opinion decided by a coin is not one.
  if (Math.random() < 0.15) {
    if (player) {
      const nth = (worldMemory?.discoveredLocationIds?.length ?? 0)
        + (worldMemory?.defeatedEnemies?.length ?? 0);
      const line = arbiterRemark(player, worldMemory, nth);
      if (line) return line;
    }
    return pick(ARBITER_PERSONAL_BEATS);
  }

  // Default — generic scene intro from earlier work.
  return pick(ARBITER_SCENE_INTROS).replace('{locationName}', location.name);
}

// Race-specific remarks. Conversational acknowledgments of the heritage
// the player picked at character creation. Each pool is 4–5 lines.
const ARBITER_RACE_REMARKS: Record<string, string[]> = {
  tartarian_giant: [
    `The Arbiter looks up at you, briefly. "A Tartarian Giant in the open. The dust feels something it has not in a long time."`,
    `"Your size opens doors that closed when the cities fell," the Arbiter says. "Some of them should have stayed shut."`,
    `"The first builders stood as tall as you do," the Arbiter murmurs. "I have wondered what they saw, looking down."`,
    `"Be careful in the low caves," the Arbiter warns. "Your ancestors made them, then forgot why."`,
    `"Aether knows your kind," the Arbiter says. "It always has."`,
  ],
  mud_dweller: [
    `"A Mud Dweller above ground," the Arbiter notes. "The surface feels different up here, doesn't it."`,
    `"Your people remember Tartaria as it was," the Arbiter says. "You do not need me to describe what's buried — you have walked it."`,
    `"Aethercraft sits in your hands the way breath sits in mine," the Arbiter says. "Use it without flinching."`,
    `"The True Tartarians watch you," the Arbiter says. "Whether they approve depends on the day."`,
    `"Subterranean eyes adjust quickly to surface light," the Arbiter observes. "Slower the other way around."`,
  ],
  reclaimer: [
    `The Arbiter watches you read the room. "A Reclaimer through and through. You see a ledger where most see ruins."`,
    `"Profit before ideology," the Arbiter says. "There is an honesty in that, at least."`,
    `"I have walked with Reclaimers before," the Arbiter says. "The careful ones survive. The greedy ones decorate the floor."`,
    `"Aetherstone signatures bend to your attention," the Arbiter says. "Trust the sense."`,
    `"Locks unmake themselves around your fingers," the Arbiter says. "A small magic. Use it well."`,
  ],
  architectural_sentinel: [
    `The Arbiter inclines their head. "Time does not touch you the way it touches the rest. A useful trait, where we walk."`,
    `"Your runic skin remembers the old protocols," the Arbiter says. "They are listening even now."`,
    `"Defense protocols hum under your hand," the Arbiter says. "Do not waste them on the first thing that moves."`,
    `"I have wondered, sometimes, what an Architectural Sentinel dreams of," the Arbiter says. "I have not yet asked."`,
  ],
  mud_golem: [
    `"A Mud Golem walking the Outskirts," the Arbiter says. "Tartaria made your kind in fear. Use that."`,
    `"Aetherstone fills you when it is near," the Arbiter says. "Save the recharge for when it matters."`,
    `"Your makers cast you for a purpose," the Arbiter says. "Some Golems still hold theirs. Others forget. Which one are you today?"`,
    `"The stones whisper to you in a language I do not have," the Arbiter admits. "Listen for both of us."`,
  ],
  unknowing_mass: [
    `"Surface-born, walking Tartaria," the Arbiter says. "The first time is always the worst time."`,
    `"You did not grow up knowing about any of this," the Arbiter says. "Some advantage in that — fewer assumptions to unmake."`,
    `"Your kind learns fast or dies fast," the Arbiter says. "Few stop in the middle."`,
    `"Beginner's luck has a half-life," the Arbiter warns. "Use the early grace well."`,
  ],
  aetherborn: [
    `"Aetherborn," the Arbiter says, slowly. "Your bloodline survived the Flood because Aetherstone chose it. Do not waste the favour."`,
    `"The Aether reads your pulse like a page," the Arbiter notes. "Whatever you intend, it will know first."`,
    `"Few Aetherborn walk far from their houses," the Arbiter says. "Fewer still come back the same as they left."`,
    `"Your kind opens locks no other race can hear," the Arbiter says. "Some of those doors were locked for a reason."`,
  ],
};

// Faction-specific remarks. Reference the faction the player aligned with
// at character creation — its goals, philosophy, and politics.
const ARBITER_FACTION_REMARKS: Record<string, string[]> = {
  mud_monarchs: [
    `"A Monarch's mark, even faint," the Arbiter says. "You did not come here to discover, did you."`,
    `"The Mud Monarchs would prefer Tartaria stayed forgotten," the Arbiter says. "Standing here, you are already disobeying."`,
    `"You serve people who would rather burn the past than read it," the Arbiter says. "I know the type."`,
    `"The Monarchs reach further than they admit," the Arbiter says quietly. "Be careful who you talk to."`,
  ],
  forgotten_order: [
    `"Forgotten Order," the Arbiter says, with something like approval. "The buried world owes you a hearing, and you owe it the listening."`,
    `"Varakush sends scholars into places like this and expects them to come back changed," the Arbiter says. "So far you are still intact."`,
    `"Your Order names me, sometimes," the Arbiter says. "I do not return the favor."`,
    `"Aether is humanity's birthright, your charter says," the Arbiter says. "Tartaria has opinions on inheritance."`,
  ],
  reclaimers_guild: [
    `"Reclaimers Guild," the Arbiter says. "The buyer gets what they pay for, and you get what's left."`,
    `"The Guild's brokers count their cuts before the relic is even dug out," the Arbiter notes. "You are one of them, now."`,
    `"A clean transaction is its own ethic," the Arbiter says. "Some of your peers forget that."`,
    `"The Guild has no rivals, only invoices," the Arbiter says drily.`,
  ],
  true_tartarians: [
    `"A True Tartarian, on the surface," the Arbiter says. "The empire was your inheritance long before it was your destination."`,
    `"Your enclave will want to know what you find here," the Arbiter says. "They will not always be patient about the wait."`,
    `"The Giants are watching," the Arbiter says. "Or they are not. Hard to tell with them."`,
    `"Your people remember the old kingdoms by their names," the Arbiter says. "Use the right ones."`,
  ],
  eternal_dynasty: [
    `"Aetherborn blood," the Arbiter says, gaze steady. "I have known some of your kind. Few of them well."`,
    `"The Dynasty would have the Aether for themselves," the Arbiter says. "You may want it for less."`,
    `"Your house's patience is older than most empires," the Arbiter notes. "Try not to confuse patience with permission."`,
  ],
  conspiracy_architects: [
    `"An Architect's eye," the Arbiter says. "You don't look at the world. You look at what's holding it up."`,
    `"The Conspiracy plays a long game," the Arbiter says. "Most of its players never see the end."`,
    `"You serve a faction that prefers the levers stayed hidden," the Arbiter says. "You will be asked to break a few in the open. Be ready."`,
    `"Architects whisper to Architects," the Arbiter says. "Choose what you say in front of whom."`,
  ],
  servants_of_giants: [
    `"You serve the Giants," the Arbiter says. "An older oath than most of what walks this country."`,
    `"The Servants keep the old roads open even when the Giants forget them," the Arbiter says. "That is no small work."`,
    `"Loyalty older than language has its own weight," the Arbiter notes. "Wear it without sinking."`,
    `"Some of the Giants still answer," the Arbiter says. "If you ask correctly. If you have anything to say worth their hearing."`,
  ],
  stone_builders: [
    `"A Stone Builder," the Arbiter says. "You raise things again that the Flood would not let stand."`,
    `"The Builders count in centuries," the Arbiter says. "Try to feel the shape of that pace."`,
    `"Foundations remember who laid them," the Arbiter notes. "Be the kind of builder that's worth remembering."`,
    `"The Stone Builders work where most have given up the ground," the Arbiter says. "It shows in their hands. And eventually in yours."`,
  ],
  tartarian_revivalists: [
    `"A Revivalist," the Arbiter says. "You believe Tartaria can come back. The country itself has not yet voted."`,
    `"The Revivalists are loud," the Arbiter notes. "Loud is sometimes brave and sometimes loud. Time will sort it."`,
    `"Restoring an empire is the kind of work that becomes the work of generations," the Arbiter says. "Do not expect to finish."`,
    `"Some Revivalists forget that what they revive will not be quite the same," the Arbiter warns. "Watch for that, in others. And in yourself."`,
  ],
};

// Timeline callbacks built dynamically from the player's milestones and the
// world's defeated-enemies / discovered-locations memory. Returns null if
// the player has not yet earned any callback-worthy beats.
function pickTimelineCallback(
  player: PlayerCharacter | null | undefined,
  worldMemory: WorldMemory | null | undefined,
): string | null {
  if (!player) return null;
  const ms = player.milestones;
  const options: string[] = [];

  // Memorable-event callbacks — the Arbiter pulls a discrete event from
  // history and references it by detail. These are the highest-fidelity
  // continuity beats we can offer.
  const events = worldMemory?.memorableEvents ?? [];
  if (events.length > 0) {
    const recent = events[events.length - 1];
    if (recent) {
      if (recent.kind === 'rare_kill') {
        options.push(`"You ${recent.text}," the Arbiter says, almost to themselves. "Few who try that walk away."`);
      } else if (recent.kind === 'theft_caught') {
        options.push(`"You ${recent.text}," the Arbiter says. "Word travels. Decide how you want it to travel next."`);
      } else if (recent.kind === 'faction_join') {
        options.push(`"You ${recent.text}," the Arbiter notes. "They will remember you in their own way."`);
      } else if (recent.kind === 'death_revive') {
        options.push(`"You ${recent.text}," the Arbiter says quietly. "Few things in Tartaria come back from the buried side. The Aetherstone marks the ones that do."`);
      } else if (recent.kind === 'first_kill') {
        options.push(`"You ${recent.text}," the Arbiter says. "I remember the way you stood after. Tell me — has the way you stand changed?"`);
      } else if (recent.kind === 'first_travel') {
        options.push(`"You ${recent.text}," the Arbiter says. "The world widens for those who walk it. It also takes."`);
      } else if (recent.kind === 'first_quest') {
        options.push(`"You ${recent.text}," the Arbiter notes. "Contracts pay in coin and in story. See which one matters more by the end of it."`);
      }
    }
  }

  if (ms) {
    if (ms.enemiesDefeated >= 3) {
      options.push(
        `"You have put down ${ms.enemiesDefeated} things in Tartaria so far," the Arbiter says. "None of them got up. That counts for something."`,
      );
    }
    if (ms.enemiesDefeated >= 10) {
      options.push(
        `"${ms.enemiesDefeated} kills behind you," the Arbiter notes. "The buried world begins to step aside, slightly, when it sees you coming."`,
      );
    }
    if (ms.travelsCompleted >= 3) {
      options.push(
        `"${ms.travelsCompleted} crossings already," the Arbiter says. "The dust has begun to recognize your shape."`,
      );
    }
    if (ms.travelsCompleted >= 10) {
      options.push(
        `"You have walked more of Tartaria than most who claim to know it," the Arbiter murmurs. "Stop sometimes. Listen for what you have passed."`,
      );
    }
    if (ms.checksSucceeded >= 5) {
      options.push(
        `"I have watched you succeed at things you should not have," the Arbiter says. "${ms.checksSucceeded} times now. It begins to feel like a pattern."`,
      );
    }
  }

  const defeated = worldMemory?.defeatedEnemies ?? [];
  const first = defeated[0];
  if (first) {
    options.push(
      `"The ${first.toLowerCase()} was the first thing you put down here," the Arbiter says quietly. "I remember it. I think you do too."`,
    );
  }
  if (defeated.length >= 4) {
    const recent = defeated[defeated.length - 1];
    if (recent) {
      options.push(
        `"You have a way of attracting the wrong company," the Arbiter says. "Lately the ${recent.toLowerCase()}, before that something with more legs. Tartaria keeps an inventory."`,
      );
    }
  }

  const discovered = worldMemory?.discoveredLocationIds ?? [];
  if (discovered.length >= 3) {
    options.push(
      `"Three places now you have stood and not left," the Arbiter says. "Tartaria notices the ones who keep coming back."`,
    );
  }

  if (options.length === 0) return null;
  return pick(options);
}

// Personal-history lines the Arbiter drops in passing — bits of backstory
// that imply who they are and what they've seen. Conversational tone,
// never exposition-dump. Designed so the player accumulates a sense of
// the Arbiter as a person over many sessions.
const ARBITER_PERSONAL_BEATS = [
  `"When I used to walk these ruins, there were three more towers," the Arbiter says, almost to themselves. "I do not remember which fell first."`,
  `"I knew a Reclaimer once who collected Aetherstone the way some collect coins," the Arbiter says. "It did not end the way they expected."`,
  `"There was a time I would have eaten the food before answering," the Arbiter says. "Tartaria taught me to listen first."`,
  `The Arbiter glances at their own hand for a moment. "I carried a relic, once. I no longer do."`,
  `"Three things I have stopped believing in," the Arbiter says quietly. "The buried world is no longer one of them."`,
  `"My last guide carried only a length of wire and a worn knife," the Arbiter says. "They lasted longer than most."`,
  `"You are not the first I have walked with through this stretch," the Arbiter says. "I will not say how many of them I remember by name."`,
  `The Arbiter touches a faint mark at their temple. "I forget what gave me this. Tartaria forgets nothing, which is the trade."`,
  `"I was younger when I last saw a sentinel wake," the Arbiter murmurs. "I do not want to be younger again."`,
  `"The Reclaimers offered me a place," the Arbiter says, after a pause. "I gave them a reason. We were both polite about it."`,
  `"I came up through the Forgotten Order, before there was much to forget," the Arbiter says. "The order is what changed, not the forgetting."`,
  `"There is a name I have not used in a long time," the Arbiter says. "Not even to myself. Not yet to you."`,
  `"The Aetherstone hummed differently before the Flood," the Arbiter says. "I am one of the few who can still hear the difference."`,
];
