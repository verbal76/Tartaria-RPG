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
  enemy?: Enemy | null;
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

// Combat-only Arbiter lines that reference the specific enemy. Used when the
// scene has an active hostile; takes priority over the generic intent pool.
const COMBAT_REMARKS = [
  `The Arbiter watches the {enemy}. "It is not the first thing here that decided to keep its distance, then changed its mind."`,
  `"Footwork over fury," the Arbiter says quietly. "The {enemy} is patient. Be patienter."`,
  `The Arbiter does not look away from the {enemy}. "Decide quickly. It already has."`,
  `"You hit what you commit to," the Arbiter says. "The {enemy} hears the difference."`,
  `"Tartaria does not award style points," the Arbiter says, eyes on the {enemy}. "End it."`,
  `The Arbiter's hand drifts to nothing in particular. "The {enemy} will not tire before you do. Spend wisely."`,
  `"That one bleeds slow," the Arbiter says. "Make the hit count."`,
  `"You can fight, hide, or speak," the Arbiter says low. "The {enemy} is already deciding for itself."`,
];

function combatRemark(enemy: Enemy): string {
  return pick(COMBAT_REMARKS).replace('{enemy}', enemy.name.toLowerCase());
}

export function buildArbiterRemark(ctx: ArbiterContext): string {
  const inCombat = !!ctx.enemy;

  // When an enemy is present, the Arbiter stays on combat. No location
  // tourism mid-fight ("the borderlands. Where Tartaria thins" was firing
  // while the player was mid-swing).
  if (inCombat) {
    // ~20% chance to ack the player's most recent action even in combat —
    // gives the Arbiter a beat of awareness before the combat color.
    if (
      ctx.recentActions &&
      ctx.recentActions.length > 0 &&
      Math.random() < 0.2
    ) {
      const lastAction = ctx.recentActions[ctx.recentActions.length - 1];
      if (lastAction && lastAction.trim().length > 0) {
        return `The Arbiter notes how you ${lastAction.trim()}. ${combatRemark(ctx.enemy!)}`;
      }
    }
    // Mood/intent pools still get a turn so combat remarks vary in color.
    const aggressionPool = pickMoodPool('AGGRESSION');
    const intentAttack = INTENT_REMARKS.attack;
    const r = Math.random();
    if (r < 0.55) return combatRemark(ctx.enemy!);
    if (r < 0.8 && intentAttack && intentAttack.length > 0) return pick(intentAttack);
    if (aggressionPool) return pick(aggressionPool).replace('this place', ctx.location.name);
    return combatRemark(ctx.enemy!);
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
  /** 0..1 — used to bias the Arbiter toward suggesting food when the player is hurt. */
  playerHpFraction?: number;
  /** Cognitive layer's most recent dominant emotion, used to bias hints. */
  mood?: string;
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

  if (enemy) {
    return pick([
      `The Arbiter does not look away from the ${enemy.name.toLowerCase()}. "Decide quickly. It will not wait."`,
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

export function buildArbiterSceneIntro(location: Location, enemy?: Enemy | null): string {
  // ~18% of intros are personal — the Arbiter drops a fragment of who they
  // are or where they have been. Conversational, never expository. These
  // never reference the player's current location directly so they read
  // as memory rather than reaction.
  if (!enemy && Math.random() < 0.18) {
    return pick(ARBITER_PERSONAL_BEATS);
  }
  if (enemy) {
    return pick(ARBITER_COMBAT_INTROS).replace('{enemyName}', enemy.name.toLowerCase());
  }
  return pick(ARBITER_SCENE_INTROS).replace('{locationName}', location.name);
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
