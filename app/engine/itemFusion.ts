// itemFusion — combine the player's reserved inferred items into a
// one-of-a-kind weapon / armor / dog vest at a Reclaimer's Fusing
// Crucible (a random travel encounter). The result is unique to this
// save: stats are stamped on the InventoryItem's `uniqueStats` field
// rather than tracked in a global catalog, so the same player will
// never see the same fused item twice, and a different player will
// rarely see the same one at all.
//
// Pipeline:
//   1. gateFusion(inventory)   — does the pack satisfy fusion rules?
//                                Need ≥3 reserved inferred misc items
//                                spanning ≥3 distinct material tags.
//   2. pickFusionInputs(inv)   — gather the eligible inputs.
//   3. synthesizeFusionViaQwen — call Qwen with the input tag profile;
//                                returns clamped UniqueItemStats or null.
//   4. applyFusion(...)        — consume inputs, mint the fused item,
//                                grant to inventory.
//
// Mirrors `itemSynthesisQwen.ts` for the LLM-output validation + clamp
// pattern. Same fail-closed rule: any parse failure / unsupported kind
// / out-of-range value returns null and the caller logs an arbiter
// refusal instead of crafting a degenerate item.

import type { InventoryItem, UniqueItemStats } from './types';
import { isInferredItem } from './crafting';

/** Minimal Qwen interface — matches itemSynthesisQwen.ts so tests can
 *  pass a mock without dragging the full LlamaRuntime stack. */
export interface FusionSynthEngine {
  isReady(): boolean;
  generate(
    messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    opts?: { maxNewTokens?: number; temperature?: number },
  ): Promise<string>;
}

/** Hard ceilings on every numeric Qwen returns. Same defense-in-depth
 *  pattern as the basic item synth — the model is well-behaved at
 *  temperature 0.1 but should never be trusted to balance loot. */
const FUSION_CLAMPS = {
  /** Max weapon damage. "2d8" is the cap; we accept 1d4–2d8 across
   *  the standard die set. */
  damageDieCounts: [1, 2] as const,
  damageDieSides: [4, 6, 8, 10] as const,
  /** Armor / dog_armor AC bonus ceiling. */
  acBonus: 6,
  /** Per-instance durability ceiling. */
  durabilityMax: 30,
} as const;

const VALID_KINDS = ['weapon', 'armor', 'dog_armor'] as const;
const VALID_STATS = ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma'] as const;
const VALID_DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'aetheric', 'burn', 'electrical', 'poison'] as const;
const VALID_RESISTANCES = ['burn', 'cold', 'poison', 'aetheric', 'electrical', 'degradation'] as const;
const VALID_ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'] as const;

const MATERIAL_TAG_SET = new Set([
  'metal', 'plate', 'iron', 'blade',
  'cloth', 'fiber', 'organic', 'bone',
  'wood', 'haft',
  'stone', 'mudstone', 'improvised',
  'aether', 'crystal',
]);

/** Result of gating a potential fusion. Used by the encounter / verb
 *  to decide whether to offer the crucible interaction. */
export interface FusionGate {
  ok: boolean;
  reason?: string;
  /** Eligible inputs the engine would consume if the player triggers
   *  the fusion right now. Empty when ok === false. */
  inputs: InventoryItem[];
  /** Distinct material tags present across the inputs. Used in the
   *  Qwen prompt so the LLM stays grounded. */
  tagProfile: string[];
}

/** Find inputs eligible for fusion: misc kind, inferred (no authored
 *  catalog row), reservedForFusion=true, not stolen, not equipped. The
 *  equip check is handled by the caller via the kind filter — we only
 *  consider 'misc' here. */
function eligibleInputs(inventory: readonly InventoryItem[]): InventoryItem[] {
  const out: InventoryItem[] = [];
  for (const it of inventory) {
    if (it.kind !== 'misc') continue;
    if (it.stolen) continue;
    if (!it.reservedForFusion) continue;
    if (!isInferredItem(it.name)) continue;
    if (it.quantity <= 0) continue;
    out.push(it);
  }
  return out;
}

/** Gate fusion against the live inventory. Returns the eligible inputs
 *  and a reason if the pack doesn't satisfy the rules. Rules:
 *   - At least 3 reserved inferred misc items
 *   - Spanning at least 3 distinct material tags (from the canonical
 *     scrap-tag set: metal / fiber / wood / stone / aether / etc.)
 *  Without diversity, the LLM has nothing to make a unique theme
 *  from; without quantity, the bench feels too easy to spam. */
export function gateFusion(inventory: readonly InventoryItem[]): FusionGate {
  const inputs = eligibleInputs(inventory);
  if (inputs.length < 3) {
    return {
      ok: false,
      reason: `Need at least 3 inferred items reserved for fusion (♥ in inventory). You have ${inputs.length}.`,
      inputs: [],
      tagProfile: [],
    };
  }
  const tagSet = new Set<string>();
  for (const inp of inputs) {
    for (const t of inp.tags ?? []) {
      const k = t.toLowerCase();
      if (MATERIAL_TAG_SET.has(k)) tagSet.add(k);
    }
  }
  const tagProfile = Array.from(tagSet);
  if (tagProfile.length < 3) {
    return {
      ok: false,
      reason: `The Crucible needs at least 3 distinct material tags across your reserved items; your profile carries only ${tagProfile.length} (${tagProfile.join(', ') || 'none'}).`,
      inputs: [],
      tagProfile,
    };
  }
  return { ok: true, inputs, tagProfile };
}

/** Stable hash of an input set so reloads / re-attempts with the same
 *  pack produce the same fused item. Deterministic by sorted lowercased
 *  names. */
export function fusionInputHash(inputs: readonly InventoryItem[]): string {
  const names = inputs.map((i) => i.name.toLowerCase()).sort().join('|');
  let h = 5381;
  for (let i = 0; i < names.length; i++) {
    h = ((h << 5) + h + names.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/** Build the Qwen prompt that asks the LLM to design a unique item
 *  from the input profile. Tartaria style guide kept short so the
 *  model has room to work. */
function buildPrompt(
  inputs: readonly InventoryItem[],
  tagProfile: string[],
): Array<{ role: 'system' | 'user'; content: string }> {
  const inputList = inputs.map((i) => `- ${i.name} [${(i.tags ?? []).join(', ') || 'no tags'}]`).join('\n');
  return [
    {
      role: 'system',
      content: [
        'You design a unique fused item for a post-flood salvager RPG. Output ONLY a single JSON object on one line — no markdown, no prose.',
        '',
        'World tone: Reclaimers scavenge a flooded wasteland; the Aether is a strange resonant material left over from a fallen civilization. Names should be short (2–4 words), evocative, never silly or modern-branded.',
        '',
        'Shape (kind === "weapon"):',
        '{ "kind": "weapon", "name": "Marrowsong Cleaver", "description": "<one line>", "rarity": "Rare"|"Legendary", "damageDice": "1d8"|"2d6"|..., "damageType": "slashing"|"piercing"|"bludgeoning"|"aether"|"burn"|"electrical"|"poison", "scalesWith": "strength"|"dexterity"|"intelligence"|"wisdom"|"charisma", "resistance"?: "burn"|"cold"|"poison"|"aetheric"|"electrical"|"degradation", "special": "<one-line flavor>" }',
        '',
        'Shape (kind === "armor"):',
        '{ "kind": "armor", "name": "Cinderhalt Brace", "description": "<one line>", "rarity": "Rare"|"Legendary", "armorSlot": "head"|"chest"|"legs"|"feet", "acBonus": 1–6, "resistance"?: "...", "special": "<one-line flavor>" }',
        '',
        'Shape (kind === "dog_armor"):',
        '{ "kind": "dog_armor", "name": "Reclaimer Pattern Vigil", "description": "<one line>", "rarity": "Rare"|"Legendary", "acBonus": 1–6, "resistance"?: "...", "special": "<one-line flavor>" }',
        '',
        'Rules:',
        '- Pick the kind that best matches the material tag profile (metal/blade → weapon; cloth/fiber → armor or dog_armor; aether dominates either).',
        '- damageDice are limited to 1d4, 1d6, 1d8, 1d10, 2d4, 2d6, 2d8.',
        '- acBonus 1–6 only. Higher only when the input pack is rich (5+ tags).',
        '- ONE resistance max, and only if a thematic tag (aether → aetheric, organic → poison) is present.',
        '- "special" is a single short clause; the engine does not parse it mechanically (yet).',
        '- "rarity" should be "Legendary" only when the input pack spans 5+ material tags; otherwise "Rare".',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Inputs:',
        inputList,
        '',
        `Material tag profile: ${tagProfile.join(', ')}`,
        '',
        'Design the fused item.',
      ].join('\n'),
    },
  ];
}

/** Defensive JSON extraction — pull the first balanced object out of
 *  the model's reply, tolerating prose around it or markdown fencing. */
function extractJsonObject(s: string): string | null {
  const stripped = s.replace(/^[\s`]*```(?:json)?\s*/i, '').replace(/```[\s`]*$/i, '');
  const start = stripped.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') {
      depth--;
      if (depth === 0) return stripped.substring(start, i + 1);
    }
  }
  return null;
}

interface RawFusionResponse {
  kind?: unknown;
  name?: unknown;
  description?: unknown;
  rarity?: unknown;
  damageDice?: unknown;
  damageType?: unknown;
  scalesWith?: unknown;
  acBonus?: unknown;
  armorSlot?: unknown;
  resistance?: unknown;
  special?: unknown;
}

/** Validate, clamp, and shape the model response into UniqueItemStats.
 *  Returns the unique stat row plus the chosen display name, or null
 *  on any anomaly. */
export function validateFusionResponse(raw: RawFusionResponse): { name: string; description: string; stats: UniqueItemStats } | null {
  if (!raw || typeof raw !== 'object') return null;

  const kind = typeof raw.kind === 'string' ? raw.kind.toLowerCase() : '';
  if (!(VALID_KINDS as readonly string[]).includes(kind)) return null;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 40) return null;

  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 200) : '';
  if (!description) return null;

  const rarity = typeof raw.rarity === 'string' && (raw.rarity === 'Rare' || raw.rarity === 'Legendary')
    ? raw.rarity
    : 'Rare';

  const resistanceCandidate = typeof raw.resistance === 'string' ? raw.resistance.toLowerCase() : '';
  const resistance = (VALID_RESISTANCES as readonly string[]).includes(resistanceCandidate)
    ? resistanceCandidate
    : undefined;

  const special = typeof raw.special === 'string' ? raw.special.trim().slice(0, 120) : undefined;

  const stats: UniqueItemStats = {
    kind: kind as 'weapon' | 'armor' | 'dog_armor',
    rarity,
    durability: { current: FUSION_CLAMPS.durabilityMax, max: FUSION_CLAMPS.durabilityMax },
    ...(resistance ? { resistance } : {}),
    ...(special ? { special } : {}),
  };

  if (kind === 'weapon') {
    const damageDice = typeof raw.damageDice === 'string' ? raw.damageDice.toLowerCase() : '';
    const diceMatch = damageDice.match(/^(\d+)d(\d+)$/);
    if (!diceMatch) return null;
    const count = parseInt(diceMatch[1]!, 10);
    const sides = parseInt(diceMatch[2]!, 10);
    if (!(FUSION_CLAMPS.damageDieCounts as readonly number[]).includes(count)) return null;
    if (!(FUSION_CLAMPS.damageDieSides as readonly number[]).includes(sides)) return null;
    const damageType = typeof raw.damageType === 'string' ? raw.damageType.toLowerCase() : '';
    if (!(VALID_DAMAGE_TYPES as readonly string[]).includes(damageType)) return null;
    const scalesWith = typeof raw.scalesWith === 'string' ? raw.scalesWith.toLowerCase() : '';
    if (!(VALID_STATS as readonly string[]).includes(scalesWith)) return null;
    stats.damageDice = `${count}d${sides}`;
    stats.damageType = damageType;
    stats.scalesWith = scalesWith as UniqueItemStats['scalesWith'];
  } else if (kind === 'armor') {
    const slot = typeof raw.armorSlot === 'string' ? raw.armorSlot.toLowerCase() : '';
    if (!(VALID_ARMOR_SLOTS as readonly string[]).includes(slot)) return null;
    const ac = typeof raw.acBonus === 'number' ? Math.floor(raw.acBonus) : 0;
    if (ac < 1 || ac > FUSION_CLAMPS.acBonus) return null;
    stats.armorSlot = slot as UniqueItemStats['armorSlot'];
    stats.acBonus = ac;
  } else {
    // dog_armor — no slot, but needs acBonus
    const ac = typeof raw.acBonus === 'number' ? Math.floor(raw.acBonus) : 0;
    if (ac < 1 || ac > FUSION_CLAMPS.acBonus) return null;
    stats.acBonus = ac;
  }

  return { name, description, stats };
}

/** Synthesize a unique fused item via Qwen. Returns null when Qwen
 *  isn't ready, the response can't be parsed, or the validator rejects
 *  the row. The caller is expected to:
 *    - have already gated via gateFusion()
 *    - log an arbiter refusal if this returns null
 *    - apply the result via applyFusion(...) if it returns a row */
export async function synthesizeFusionViaQwen(
  inputs: readonly InventoryItem[],
  tagProfile: string[],
  qwen: FusionSynthEngine,
): Promise<{ name: string; description: string; stats: UniqueItemStats } | null> {
  if (!qwen.isReady()) return null;
  try {
    const messages = buildPrompt(inputs, tagProfile);
    const reply = await qwen.generate(messages, { maxNewTokens: 200, temperature: 0.4 });
    const json = extractJsonObject(reply);
    if (!json) return null;
    let parsed: RawFusionResponse;
    try {
      parsed = JSON.parse(json) as RawFusionResponse;
    } catch {
      return null;
    }
    return validateFusionResponse(parsed);
  } catch {
    return null;
  }
}

/** Apply a fusion result: consume the input items from the inventory
 *  and mint the fused InventoryItem. Returns the new inventory array
 *  and the fused item that was added. Pure — caller wires into the
 *  store. */
export function applyFusion(
  inventory: readonly InventoryItem[],
  inputs: readonly InventoryItem[],
  result: { name: string; description: string; stats: UniqueItemStats },
  itemIdSeed: string,
): { inventory: InventoryItem[]; fused: InventoryItem } {
  const inputIds = new Set(inputs.map((i) => i.id));
  // Drain one unit from each input. The eligible-inputs path filters
  // on quantity > 0, and inferred items are almost always quantity 1,
  // but be tolerant just in case.
  const drained = inventory
    .map((i) => {
      if (!inputIds.has(i.id)) return i;
      return { ...i, quantity: Math.max(0, i.quantity - 1) };
    })
    .filter((i) => i.quantity > 0);

  // The fused item's stored kind matches the unique-stats kind so
  // inventory routing (equip path / scrap path / canScrap) works the
  // same way authored gear does.
  const inventoryKind: InventoryItem['kind'] =
    result.stats.kind === 'weapon' ? 'weapon'
    : result.stats.kind === 'dog_armor' ? 'dog_armor'
    : 'armor';

  const fused: InventoryItem = {
    id: `fused_${itemIdSeed}`,
    name: result.name,
    kind: inventoryKind,
    quantity: 1,
    tags: ['fused', 'unique', ...(result.stats.resistance ? [result.stats.resistance] : [])],
    rarity: result.stats.rarity,
    description: result.description,
    durability: { ...result.stats.durability },
    uniqueStats: result.stats,
  };

  return { inventory: [...drained, fused], fused };
}
