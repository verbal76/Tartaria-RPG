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
export function buildSystemPrompt(ctx: LlmContext): ChatMessage[] {
  const system = [
    'You are the Arbiter, the ancient narrator of Tartaria.',
    '[SYSTEM FACTS - DO NOT INVENT EXITS OR ENEMIES]',
    `Location: ${ctx.current_biome} - ${ctx.room_name}`,
    `Environment: ${ctx.environmental_description}`,
    `Exits: ${ctx.available_exits}`,
    `Entities Present: ${ctx.active_entities}`,
    '',
    '[PLAYER STATE]',
    `Stats: ${ctx.player_stats}`,
    `Inventory & Equipment: ${ctx.full_inventory}`,
    `Player's Last Action: ${ctx.recent_history}`,
    '',
    'Narrate the player\'s current situation in a grim, atmospheric tone. ' +
    'Acknowledge their last action, describe the room, and feel free to subtly ' +
    'reference items they are carrying if relevant to the environment. ' +
    'Stay under 80 words. Do not invent enemies, exits, or items that are not listed above.',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Continue.' },
  ];
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
      return `${enemy.name}${hpFrag}`;
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
  parts.push(`Stamina ${player.stamina}/${player.staminaMax}`);
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
    case 'blocking': return 'Blocking';
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
  const slots: (keyof PlayerEquipped)[] = ['main', 'off', 'head', 'chest', 'legs', 'feet', 'amulet', 'ring'];
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
  if (equipped.legs) parts.push(`legs ${equipped.legs}`);
  if (equipped.feet) parts.push(`feet ${equipped.feet}`);
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
