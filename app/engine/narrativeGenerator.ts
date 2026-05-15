import type { WeatherEntry, Hazard, Enemy, Location, Quest, InventoryItem, ParsedInput, Intent } from './types';
import { pick, chance } from './rng';
import openings from '../data/events/openings.json';
import moodQuotes from '../data/lore/arbiter-mood-quotes.json';
import intentQuotes from '../data/lore/arbiter-intent-quotes.json';
import locationFlavors from '../data/lore/location-flavors.json';
import sceneFlavors from '../data/lore/scene-flavors.json';

const openingsList = openings as string[];

export function buildOpening(): string {
  return pick(openingsList);
}

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
  ],
  CURIOSITY: [
    `"The buried world rewards a careful eye," the Arbiter says. "Look longer."`,
    `"Something here is older than its name," the Arbiter murmurs. "Find what called it that."`,
    `The Arbiter watches your hands. "What you don't understand isn't empty. It's waiting."`,
    `"Half of Tartaria is what was never written down," the Arbiter says. "You're reading the rest."`,
    `"Curiosity buys nothing in the market," the Arbiter says, "but it buys you the next door."`,
  ],
  AGGRESSION: [
    `"A blade is a question," the Arbiter says. "Be sure you want the answer."`,
    `The Arbiter watches the air settle. "Some things bleed loudly. Others bleed last."`,
    `"Strike like you mean to walk away," the Arbiter says. "Anything less is wasted."`,
    `The Arbiter's gaze stays level. "Violence here is older than language. It will outlast yours."`,
    `"Don't celebrate," the Arbiter says quietly. "Tartaria keeps the body count."`,
  ],
  CAUTIOUSNESS: [
    `"Patience is a relic too," the Arbiter says. "Few think to carry it."`,
    `The Arbiter nods once. "Slowness is its own kind of skill."`,
    `"Listen for what doesn't repeat," the Arbiter murmurs. "That is where the danger lives."`,
    `"You have not died yet," the Arbiter says. "Find out why before you change anything."`,
    `The Arbiter watches the dust settle. "Move when the stones forget you. Not before."`,
  ],
  RESOLVE: [
    `"Resolve is the only relic Tartaria does not corrupt," the Arbiter says.`,
    `The Arbiter inclines their head. "Then keep walking. The road remembers feet that don't stop."`,
    `"Good," the Arbiter says simply. "The next part is harder."`,
    `"Tartaria buries the wavering," the Arbiter says. "It does not bury you yet."`,
  ],
  DESPAIR: [
    `"Sit if you must," the Arbiter says. "The ruins will still be here. So will you, if you choose."`,
    `The Arbiter does not look at you. "Despair is fast. Resolve is slow. Pick your speed."`,
    `"Many before you found this same wall," the Arbiter says. "A few walked around it."`,
    `"Rest the body, not the watch," the Arbiter says. "Tartaria does not stop watching."`,
  ],
};

// Intent pools — used when no cognitive mood is available, but we know the
// player's deterministic intent.
const BASE_INTENT_REMARKS: Partial<Record<Intent, string[]>> = {
  attack: [
    `The Arbiter watches the blow land or fail. "Both are answers."`,
    `"Make the next strike count for two," the Arbiter says. "Tartaria taxes the first."`,
    `"You attack as if you mean to leave," the Arbiter murmurs. "Good."`,
  ],
  stealth: [
    `"The Aetherstone hears breath before it hears footsteps," the Arbiter says quietly. "Mind both."`,
    `The Arbiter's eyes drift across the room. "Quiet is a kind of armour. Wear it well."`,
    `"The watchers here have patience," the Arbiter murmurs. "Match theirs."`,
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
  ],
  investigate: [
    `"What you find is half of what is there," the Arbiter says. "Look again later."`,
    `The Arbiter nods at the dust. "Notice what doesn't disturb. That tells you who else moved here."`,
    `"Search the room a second time once you've left it once," the Arbiter says. "Different things will be visible."`,
    `"A relic does not announce itself," the Arbiter murmurs. "It corrects the shape of the room around it."`,
  ],
  rest: [
    `The Arbiter inclines their head. "Sleep watched is still sleep."`,
    `"Tartaria does not forget the wounded," the Arbiter says. "But it will wait for them."`,
    `"Drink something," the Arbiter says. "The stones drink whatever you don't."`,
  ],
  travel: [
    `"Every road in Tartaria leads down," the Arbiter says, "even when it climbs."`,
    `The Arbiter watches you go. "Mark the way back. Few here remember how to retrace."`,
    `"The buried world is wide," the Arbiter says. "Walk it like it knows you."`,
  ],
  cast: [
    `"Aether bends to want, not need," the Arbiter says. "Choose carefully."`,
    `"Every channel costs the channeller something," the Arbiter murmurs. "Notice what is gone."`,
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

const MOOD_REMARKS: Record<string, string[]> = mergePools(
  BASE_MOOD_REMARKS,
  moodQuotes as Record<string, string[]>,
);

const INTENT_REMARKS: Partial<Record<Intent, string[]>> = mergePools<Intent>(
  BASE_INTENT_REMARKS,
  intentQuotes as Partial<Record<Intent, string[]>>,
);

const LOCATION_FLAVORS = locationFlavors as Record<string, string[]>;
const SCENE_FLAVORS = sceneFlavors as Record<string, string[]>;

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
    if (SCENE_FLAVORS.danger?.length) return 'danger';
  }
  if (has('aetheric', 'aether', 'aetherstone', 'aetheric_core', 'aetheric_node', 'etheric_engine')) {
    if (SCENE_FLAVORS.aether?.length) return 'aether';
  }
  if (has('ruin', 'buried', 'tomb', 'spire', 'tower', 'capital', 'lost_capital', 'stronghold')) {
    if (SCENE_FLAVORS.ruins?.length) return 'ruins';
  }
  if (has('mystery', 'unknown', 'forgotten_order', 'objective')) {
    if (SCENE_FLAVORS.mystery?.length) return 'mystery';
  }
  if (SCENE_FLAVORS.atmospheric?.length) return 'atmospheric';
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
    parts.push(`A ${input.enemy.name} (${input.enemy.type}, ${input.enemy.rarity}) emerges. Its ${input.enemy.attack} can deal ${input.enemy.damage}.`);
  }

  if (input.quest) {
    parts.push(`Objective: ${input.quest.objective.verb} ${input.quest.objective.target} ${input.quest.complication.text}.`);
  }

  // ~25% chance: append a scene flavor line drawn from the best-matching
  // category. Falls back gracefully if no category resolves.
  if (Math.random() < 0.25) {
    const cat = pickSceneFlavorCategory(input);
    const pool = cat ? SCENE_FLAVORS[cat] : undefined;
    if (pool && pool.length > 0) {
      parts.push(pick(pool));
    }
  }

  return parts.join('\n\n');
}

const GENERIC_REMARKS = [
  `The Arbiter inclines their head and says nothing for a moment.`,
  `"The Aetherstone hums when you are close to the right question," the Arbiter says.`,
  `"Few return from these ruins unchanged," the Arbiter murmurs.`,
  `The Arbiter watches the dust hang in the air. "It always does that, here. I've never known why."`,
  `"Tartaria was a place of life and power once," the Arbiter says. "Now mostly whispers."`,
];

export interface ArbiterContext {
  location: Location;
  hazard?: Hazard | null;
  intent?: Intent;
  mood?: string;
  /**
   * Most recent player actions (free-form short phrases like "drew your
   * blade" or "stepped into the chamber"). When present, the Arbiter will
   * occasionally reference the most recent one in passing.
   */
  recentActions?: string[];
}

function pickMoodPool(mood: string | undefined): string[] | undefined {
  if (!mood) return undefined;
  const pool = MOOD_REMARKS[mood];
  return pool && pool.length > 0 ? pool : undefined;
}

export function buildArbiterRemark(ctx: ArbiterContext): string {
  // ~15% chance to acknowledge the player's most recent action, wrapped in
  // the lore-flavored mood pool when available.
  if (
    ctx.recentActions &&
    ctx.recentActions.length > 0 &&
    Math.random() < 0.15
  ) {
    const lastAction = ctx.recentActions[ctx.recentActions.length - 1];
    if (lastAction && lastAction.trim().length > 0) {
      const moodPool = pickMoodPool(ctx.mood);
      const flavor = moodPool ? pick(moodPool).replace('this place', ctx.location.name) : null;
      const noted = `The Arbiter notes how you ${lastAction.trim()}.`;
      return flavor ? `${noted} ${flavor}` : noted;
    }
  }

  // ~10% chance to drop a location-specific flavor line.
  const locPool = LOCATION_FLAVORS[ctx.location.id];
  if (locPool && locPool.length > 0 && Math.random() < 0.1) {
    return `The Arbiter looks around. "${pick(locPool)}"`;
  }

  // Mood (from cognitive layer) wins if available.
  const moodPool = pickMoodPool(ctx.mood);
  if (moodPool) {
    return pick(moodPool).replace('this place', ctx.location.name);
  }
  // Otherwise pick by deterministic intent.
  const intentPool = ctx.intent ? INTENT_REMARKS[ctx.intent] : undefined;
  if (intentPool && intentPool.length > 0) {
    return pick(intentPool);
  }
  // Hazard-flavored.
  if (ctx.hazard && Math.random() < 0.4) {
    return `The Arbiter eyes the ${ctx.hazard.name.toLowerCase()}. "I'd place that at a Hard, if I had to guess."`;
  }
  return pick(GENERIC_REMARKS);
}

export function shouldArbiterSpeak(): boolean {
  return chance(45);
}

export interface SoftArbiterContext {
  parsed: ParsedInput;
  inventory: InventoryItem[];
  enemy?: Enemy | null;
  location: Location;
  hazard?: Hazard | null;
}

export function buildSoftArbiterFallback(ctx: SoftArbiterContext): string {
  const { parsed, inventory, enemy, location } = ctx;

  if (parsed.resolvedNoun) {
    return `The Arbiter follows your gaze toward the ${parsed.resolvedNoun.toLowerCase()}. "Tell me what you would do with it."`;
  }

  if (enemy) {
    return pick([
      `The Arbiter does not look away from the ${enemy.name.toLowerCase()}. "Decide quickly. It will not wait."`,
      `"You can fight, hide, or speak," the Arbiter says low. "${enemy.name} is already deciding for itself."`,
    ]);
  }

  if (inventory.length > 0) {
    const item = pick(inventory);
    return `The Arbiter glances at your pack. "Your ${item.name.toLowerCase()} is still there, if it suits the moment."`;
  }

  return pick([
    `The Arbiter waits, expression unreadable. "Say it plainer — the stones are listening."`,
    `"Search, rest, or move on," the Arbiter offers. "Even small choices echo in ${location.name}."`,
    `The Arbiter studies you. "Phrase it as the deed you mean to do. Look. Search. Strike. Flee."`,
  ]);
}
