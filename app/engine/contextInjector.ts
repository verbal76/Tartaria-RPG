import type {
  PlayerCharacter,
  PlayerEquipped,
  InventoryItem,
  GameLogEntry,
  Location,
  Enemy,
  Hazard,
  WeatherEntry,
  StatusEffect,
} from './types';
import type { ChatMessage } from '../ai/generation/QwenGenerativeEngine';
import type { MacroLocation, MicroLocation, MicroMicroLocation } from './worldLadder';
import { describeTraits } from './enemyTraits';
import { buildCanonFactsParagraph } from './canonFacts';
import { getNarratorPersona, getWorldTone, getWorldSetting, getWorldTerms, getWorldVocabulary, hasLoreOverride, resolveTable } from './contentPack';
import { displayStaminaMax } from './equipment';

const EMPTY_LORE_DOC: readonly unknown[] = [];

/**
 * The strict, comma-light fact sheet that gets injected into the Qwen
 * system prompt every turn. The TDD §3.2 protocol: the engine declares the
 * world's physical facts, the model only narrates them.
 *
 * Every field is a flat string so the prompt template can interpolate
 * deterministically. Anything not represented here is invisible to the LLM —
 * including the lore book, faction politics, and quest state. Those are the
 * narrator's job to remember, not the model's.
 */
export interface LlmContext {
  current_biome: string;
  room_name: string;
  environmental_description: string;
  available_exits: string;
  active_entities: string;
  player_stats: string;
  full_inventory: string;
  recent_history: string;
  /** True when at least one hostile entity is present. Drives a tighter
   *  combat-focused instruction in buildSystemPrompt — the small Qwen
   *  model has been observed to take "describe the room" too literally
   *  mid-fight and write atmospheric tour-guide prose instead of
   *  narrating the action. */
  in_combat: boolean;
  /** OTA-232 — player's current faction id (e.g. 'reclaimers',
   *  'forgotten_order'). Surfaces into the canon-fact picker so the
   *  Arbiter prefers events that involve the player's faction. */
  player_faction_id?: string;
  /** arb163 — ambient mode. When true, buildSystemPrompt uses the
   *  AMBIENT_INSTRUCTION: an UNPROMPTED, reflective companion line that does
   *  NOT react to the last action. Ambient lines are decoupled from events, so
   *  the slow Qwen latency never reads as "late" (you can't be late to a
   *  remark that wasn't answering anything). The reactive beats are carried by
   *  instant canned templates instead. */
  ambient?: boolean;
}

/** What buildLlmContext needs from the store. Explicit deps, no store import. */
export interface ContextInputs {
  player: PlayerCharacter | null;
  scene: SceneSlice | null;
  gameLog: readonly GameLogEntry[];
  /** Optional world-ladder chunk the player is currently in. When supplied,
   *  room_name / environmental_description / available_exits come from the
   *  Micro-Micro node instead of the top-level Location. The biome name
   *  comes from the Macro. */
  ladder?: { macro: MacroLocation; micro: MicroLocation; microMicro: MicroMicroLocation } | null;
  /** arb163 — request the ambient (reflective companion) instruction. */
  ambient?: boolean;
}

export interface SceneSlice {
  location: Location;
  weather: WeatherEntry;
  hazard: Hazard | null;
  enemies: readonly Enemy[];
  enemyHps: readonly number[];
  vendor?: { name?: string; affiliation?: string } | null;
}

// ---------------------------------------------------------------------------
// Top-level builder
// ---------------------------------------------------------------------------

const UNKNOWN_BIOME = 'The Wastes';
const UNKNOWN_ROOM = 'an unmarked stretch of ground';
const NO_ENTITIES = 'None.';

export function buildLlmContext(input: ContextInputs): LlmContext {
  const { player, scene, gameLog, ladder } = input;
  const room_name = ladder
    ? ladder.microMicro.name
    : scene?.location?.name ?? UNKNOWN_ROOM;
  const current_biome = ladder
    ? ladder.macro.name
    : deriveBiome(scene?.location);
  const environmental_description = ladder
    ? buildLadderEnvironment(ladder, scene)
    : deriveEnvironment(scene);
  const available_exits = ladder && ladder.microMicro.exits.length > 0
    ? ladder.microMicro.exits.join(', ')
    : deriveExits(scene);
  return {
    current_biome,
    room_name,
    environmental_description,
    available_exits,
    active_entities: formatActiveEntities(scene),
    player_stats: formatPlayerStats(player),
    full_inventory: stringifyInventory(player?.inventory ?? [], player?.equipped, player?.tc ?? 0),
    recent_history: formatRecentHistory(gameLog),
    in_combat: (scene?.enemies?.length ?? 0) > 0,
    player_faction_id: player?.factionId,
    ambient: input.ambient ?? false,
  };
}

function buildLadderEnvironment(
  ladder: NonNullable<ContextInputs['ladder']>,
  scene: SceneSlice | null,
): string {
  const parts: string[] = [ladder.microMicro.environmental_description.trim()];
  if (scene?.weather?.name) {
    parts.push(`Weather: ${scene.weather.name}${scene.weather.description ? ' — ' + scene.weather.description : ''}`);
  }
  if (scene?.hazard) {
    parts.push(`Hazard: ${scene.hazard.name} — ${scene.hazard.description}`);
  }
  return parts.join(' ').trim();
}

/**
 * Renders the TDD §3.3 system+user pair as a Qwen-friendly chat message
 * array. The model gets a stable system role with all facts, then a tiny
 * user role that just says "narrate" — most chat-tuned models behave better
 * with a non-empty user turn than with a system-only prompt.
 */
// Two final instructions — one for peaceful turns ("describe the room") and
// one for active combat ("DO NOT describe the room"). Qwen 0.5B is small
// enough that whichever instruction is loudest is what it follows; observed
// behavior was atmospheric tour-guide prose mid-knife-fight when the peaceful
// instruction fired during combat (the player took a bite of trail rations
// while a Scrap Drone was attacking, the chatter check fired, and Qwen wrote
// a sky description). The combat variant is shorter, more verb-heavy, and
// explicitly forbids room description so the model lands on the action.
// Hard rules every instruction shares. Voice + anti-hallucination guardrails
// pulled out so the combat and peaceful prompts can't diverge on them.
// Specifically reacting to Qwen 0.5B's observed failure modes:
//   - "The player, driven by rage..." → third person + invented emotion
//   - "triggered the Tartarian Trap, energy lance strikes began..." →
//     hallucinated events that never happened
//   - Mid-sentence trailing cutoffs
// engine_Dev — VOICE_RULES is now a function, with all Tartaria-specific
// vocabulary / place-name examples removed. Anti-hallucination is enforced
// generically ("nothing not in SYSTEM FACTS"); the only world-flavored verbs
// the model is told to favor come from the World-lore "vocabulary" field, so a
// re-skinned game teaches ITS verbs, not Tartaria's.
function voiceRules(): string {
  const base =
    "**SECOND PERSON ONLY.** Every sentence MUST address the player as " +
    "'you' / 'your'. NEVER write 'The player', NEVER write 'they', " +
    "NEVER write 'the adventurer', 'the figure', 'the explorer', or any " +
    'third-person stand-in for the player. Sentences must START with ' +
    '"You" or "Your" or with a direct action verb in second person. ' +
    'If a draft sentence begins with "The player" or "They", rewrite it. ' +
    'Do not invent emotions, motivations, traps, mechanics, events, or ' +
    'outcomes that are not listed in the SYSTEM FACTS above. Only narrate ' +
    "the player's last action and the static facts already present. " +
    'DO NOT name any location, room, weather, or NPC that is not in the ' +
    'SYSTEM FACTS, and do not invent scenery (no sarcophagi, vaulted ' +
    'ceilings, etc.) unless it appears in Environment. ' +
    'If you would have to invent scenery to fill a sentence, end early. ' +
    'AVAILABLE PLAYER ACTIONS the engine resolves mechanically: attack, ' +
    'brawl, throw, dodge, block, advance, retreat / step back, flee / escape, ' +
    'aim, fire, reload, take cover, dash / sprint, disengage, help, ready, ' +
    'climb, swim, jump, hide / sneak, search / look, equip / unequip, use ' +
    '(relic / item / torch), dig, craft, steal, gift, ask, rest. ';
  const vocab = getWorldVocabulary();
  const vocabLine = vocab ? `Favor this world's vocabulary in narration: ${vocab}. ` : '';
  return base + vocabLine + 'End on a complete sentence.';
}

const PEACEFUL_INSTRUCTION =
  'Narrate the situation in a grim, atmospheric tone. Acknowledge the ' +
  'last action; you may subtly reference an available exit or a carried ' +
  'item if it fits the moment. ' +
  // arb162 — ONE short line on purpose. Qwen shares the voice lock and is
  // slow on this hardware; a longer line freezes Kokoro and arrives after
  // the action has scrolled away. The map/exits already show in the world
  // banner, so the Arbiter aside stays a single punchy beat.
  'Keep it to ONE short sentence — about 20 words, no more. ';

const COMBAT_INSTRUCTION =
  'The player is in ACTIVE COMBAT. Narrate the tension of the last ' +
  'action against the entities listed above. Brief, violent, grim — ' +
  'ONE short sentence, no more than 20 words. DO NOT describe the room ' +
  'or its scenery; the player has no time for atmosphere. Reference ' +
  'inventory items only if they are the weapon being used. ';

// arb163 — ambient companion line. UNPROMPTED and reflective: it does not react
// to the last action (the canned templates own reactions), so its latency never
// reads as late. Reflective/relational, never advice, one short line. The shared
// VOICE_RULES still pin it to second-person English with no third-person recap.
const AMBIENT_INSTRUCTION =
  'You have walked beside the player a long while. Make ONE short, UNPROMPTED ' +
  'aside — a passing reflection on how far they have come, their growth, the ' +
  'road behind you both, or your changing read of them. DO NOT narrate or react ' +
  'to their last action; this is idle companion talk between moments, not a ' +
  'response to anything. Warm or wry, never advice or instructions. ' +
  'ONE short sentence — about 18 words, no more. ';

export function buildSystemPrompt(ctx: LlmContext): ChatMessage[] {
  const instruction = ctx.ambient
    ? AMBIENT_INSTRUCTION
    : ctx.in_combat
    ? COMBAT_INSTRUCTION
    : PEACEFUL_INSTRUCTION;
  // Strict location anchor — playtest log: Qwen narrated "The Borderlands,
  // a twisted shadowy landscape..." while the player was in Tartarian
  // Outskirts. The model needs an explicit "this is the only place that
  // exists" instruction or it pulls names from training data.
  const locationName = ctx.room_name;
  // OTA-232 — canon facts injection. The Arbiter knows the world bible
  // now: a single compact line surfaces a relevant canonical event or
  // canon item when the scene's location / tags match. Token-budget
  // tight (~50 words max) so it doesn't eat the narration cap. Null
  // when nothing matches — the section is omitted entirely.
  // engine_Dev — canon line sourcing:
  //  • author "Lore document" uploaded → always inject the matching passage
  //    (buildCanonFactsParagraph returns it; it replaces Tartaria canon).
  //  • no lore doc, default pack (no custom World) → built-in Tartaria canon.
  //  • no lore doc but a custom World loaded → null (no Tartaria leak).
  const hasLoreDoc = resolveTable('lore', EMPTY_LORE_DOC).length > 0;
  const canonLine = (hasLoreDoc || !hasLoreOverride('world'))
    ? buildCanonFactsParagraph({
        sceneKeywords: deriveCanonKeywords(ctx),
        hasVendor: /vendor/i.test(ctx.active_entities ?? ''),
        playerFactionId: ctx.player_faction_id,
      })
    : null;
  // engine_Dev — world flavor is content-pack driven. Tone always injects (the
  // default pack's tone, or the author's); setting / terms inject only when the
  // World-lore block provides them. This is the seam that makes the NARRATION
  // lore-agnostic instead of hardcoded Tartaria.
  const worldSetting = getWorldSetting();
  const worldTerms = getWorldTerms();
  const parts = [
    getNarratorPersona(),
    `[WORLD]`,
    `Tone: ${getWorldTone()}`,
    ...(worldSetting ? [`Setting: ${worldSetting}`] : []),
    ...(worldTerms ? [`Key terms (use these nouns): ${worldTerms}`] : []),
    `[SYSTEM FACTS - DO NOT INVENT EXITS, ENEMIES, OR PLACE NAMES]`,
    `Location: ${ctx.current_biome} - ${ctx.room_name}`,
    `**The player is at "${locationName}". If you name any place, it MUST be "${locationName}". NEVER name any location that is not listed here.**`,
    `Environment: ${ctx.environmental_description}`,
    `Exits: ${ctx.available_exits}`,
    `Entities Present: ${ctx.active_entities}`,
  ];
  if (canonLine) {
    parts.push('', '[CANON LORE - true facts; may color narration, never contradict]', canonLine);
  }
  parts.push(
    '',
    '[PLAYER STATE]',
    `Stats: ${ctx.player_stats}`,
    `Inventory & Equipment: ${ctx.full_inventory}`,
    `Player's Last Action: ${ctx.recent_history}`,
    '',
    instruction,
    voiceRules(),
  );
  const system = parts.join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Continue.' },
  ];
}

// OTA-232 — flatten the scene context into a lowercase keyword bag
// for canon-event tag matching. Pulls from biome, room name,
// environment description so the matcher catches "Berlin" in the
// room name AND "buried capital" in the biome.
function deriveCanonKeywords(ctx: LlmContext): string[] {
  const bag: string[] = [];
  for (const field of [ctx.current_biome, ctx.room_name, ctx.environmental_description]) {
    if (!field) continue;
    for (const tok of field.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      if (tok.length >= 4) bag.push(tok);
    }
  }
  return bag;
}

// ---------------------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------------------

function deriveBiome(location: Location | undefined): string {
  if (!location) return UNKNOWN_BIOME;
  // First lore-canonical tag wins; falls back to the location type.
  const biomeTag = location.tags?.find((t) =>
    /buried|mud|aether|tartary|underground|surface|ruin|spire|tower/i.test(t),
  );
  if (biomeTag) return capitalizeWords(biomeTag.replace(/_/g, ' '));
  return capitalizeWords(location.type?.replace(/_/g, ' ') ?? UNKNOWN_BIOME);
}

function deriveEnvironment(scene: SceneSlice | null): string {
  if (!scene) return 'A featureless waste, dim and still.';
  const parts: string[] = [];
  if (scene.location?.description) parts.push(scene.location.description.trim());
  if (scene.weather?.name) {
    const w = scene.weather;
    parts.push(`Weather: ${w.name}${w.description ? ' — ' + w.description : ''}`);
  }
  if (scene.hazard) {
    parts.push(`Hazard: ${scene.hazard.name} — ${scene.hazard.description}`);
  }
  return parts.join(' ').trim() || 'A featureless waste, dim and still.';
}

function deriveExits(scene: SceneSlice | null): string {
  // For now the engine guarantees cardinal traversal everywhere; named exits
  // come in Phase 4 when the world ladder lands. We always advertise the four
  // cardinals so the LLM can mention them.
  if (!scene) return 'none — you are stranded';
  return 'north, east, south, west';
}

export function formatActiveEntities(scene: SceneSlice | null): string {
  if (!scene) return NO_ENTITIES;
  const parts: string[] = [];
  if (scene.enemies && scene.enemies.length > 0) {
    const entries = scene.enemies.map((enemy, idx) => {
      const hp = scene.enemyHps?.[idx];
      const hpFrag = typeof hp === 'number' && hp < enemy.hp ? ` (${hp}/${enemy.hp} HP)` : '';
      // Surface enemy perks to the LLM so narration can reference them
      // accurately ("the armored Mud Tortoise shrugs off your strike").
      // Bracket-delimited so Qwen treats them as metadata, not flowing prose.
      const traitsFrag = enemy.traits && enemy.traits.length > 0
        ? ` [${describeTraits(enemy.traits)}]`
        : '';
      return `${enemy.name}${hpFrag}${traitsFrag}`;
    });
    parts.push(entries.join(', '));
  }
  if (scene.vendor?.name) {
    const aff = scene.vendor.affiliation ? ` of the ${scene.vendor.affiliation}` : '';
    parts.push(`${scene.vendor.name}${aff} (vendor)`);
  }
  return parts.length === 0 ? NO_ENTITIES : parts.join('; ');
}

export function formatPlayerStats(player: PlayerCharacter | null): string {
  if (!player) return 'Unknown.';
  const parts: string[] = [];
  parts.push(`HP ${player.hp}/${player.hpMax}`);
  parts.push(`Stamina ${player.stamina}/${displayStaminaMax(player)}`);
  parts.push(`AC ${player.ac}`);
  if (typeof player.corruption === 'number' && player.corruption > 0) {
    parts.push(`Corruption ${player.corruption}`);
  }
  const effects = formatStatusEffects(player.statusEffects);
  if (effects) parts.push(effects);
  return parts.join(', ');
}

function formatStatusEffects(effects: StatusEffect[] | undefined): string {
  if (!effects || effects.length === 0) return '';
  const labels = effects.map((e) => e.label ?? prettyEffect(e.kind));
  return labels.join(' & ') + ' active';
}

function prettyEffect(kind: string): string {
  switch (kind) {
    case 'bleed': return 'Bleeding';
    case 'stun': return 'Stunned';
    case 'burn_scar': return 'Burn-scarred';
    case 'armor_severed': return 'Armor-severed';
    case 'paralyzed': return 'Paralyzed';
    case 'poisoned': return 'Poisoned';
    case 'dodging': return 'Dodging';
    default: return capitalizeWords(kind.replace(/_/g, ' '));
  }
}

/**
 * Compact inventory string. Items with quantity > 1 get "(xN)" suffixes;
 * equipped gear lands in a separate "Wearing: ..." trailer so the model can
 * tell stowed loot from worn gear at a glance. Wallet (TC) included.
 *
 * Token economy rule (TDD §3.3): comma-separated, never JSON.
 */
export function stringifyInventory(
  inventory: readonly InventoryItem[],
  equipped: PlayerEquipped | undefined,
  tc: number,
): string {
  const items: string[] = [];
  const equippedNames = collectEquippedNames(equipped);

  for (const item of inventory) {
    if (!item.name) continue;
    const qtyTag = item.quantity > 1 ? ` (x${item.quantity})` : '';
    items.push(`${item.name}${qtyTag}`);
  }
  if (tc > 0) items.push(`${tc} TC`);

  const wornParts = describeEquipped(equipped, equippedNames);

  const stowed = items.length === 0 ? 'Empty pack' : items.join(', ');
  return wornParts ? `${stowed} | Wearing: ${wornParts}` : stowed;
}

function collectEquippedNames(equipped: PlayerEquipped | undefined): Set<string> {
  const out = new Set<string>();
  if (!equipped) return out;
  const slots: (keyof PlayerEquipped)[] = ['main', 'off', 'head', 'chest', 'hands', 'legs', 'feet', 'cloak', 'amulet', 'ring', 'ring2', 'ring3'];
  for (const slot of slots) {
    const name = equipped[slot];
    if (typeof name === 'string' && name) out.add(name);
  }
  return out;
}

function describeEquipped(equipped: PlayerEquipped | undefined, _names: Set<string>): string {
  if (!equipped) return '';
  const parts: string[] = [];
  if (equipped.main) parts.push(`main hand ${equipped.main}`);
  if (equipped.off) parts.push(`off hand ${equipped.off}`);
  if (equipped.head) parts.push(`head ${equipped.head}`);
  if (equipped.chest) parts.push(`chest ${equipped.chest}`);
  if (equipped.hands) parts.push(`hands ${equipped.hands}`);
  if (equipped.legs) parts.push(`legs ${equipped.legs}`);
  if (equipped.feet) parts.push(`feet ${equipped.feet}`);
  if (equipped.cloak) parts.push(`cloak ${equipped.cloak}`);
  if (equipped.amulet) parts.push(`amulet ${equipped.amulet}`);
  if (equipped.ring) parts.push(`ring ${equipped.ring}`);
  return parts.join(', ');
}

/**
 * Last 2–3 player actions, newest first. Per the TDD token-economy rule, we
 * never dump the full game log — only the player-typed lines, which are the
 * only thing the model needs to "acknowledge their last action."
 */
export function formatRecentHistory(log: readonly GameLogEntry[]): string {
  const playerLines: string[] = [];
  for (let i = log.length - 1; i >= 0 && playerLines.length < 3; i--) {
    const entry = log[i];
    if (entry?.channel === 'player' && entry.text) {
      playerLines.push(entry.text.trim());
    }
  }
  if (playerLines.length === 0) return 'None — just arrived.';
  return playerLines.join(' ← ');
}

function capitalizeWords(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}
