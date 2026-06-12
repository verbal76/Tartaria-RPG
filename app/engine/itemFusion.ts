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
import { inferGearTagPack } from './itemDefaults';

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
/** arb113 — equip kinds (worn/wielded) and edible/usable tags are never fusion
 *  scrap. Everything else inferred + reserved is fair game — INCLUDING reagents
 *  whose kind got mis-stamped (e.g. "Aetheric Moss" → kind 'consumable' via the
 *  fungus name heuristic). The old `kind === 'misc'` filter silently dropped those,
 *  so a reserved material you could SEE (♥) didn't actually count. */
const FUSION_EQUIP_KINDS = ['weapon', 'armor', 'accessory', 'amulet', 'ring'];
const FUSION_EDIBLE_TAG = /food|drink|healing|potion|weapon_coating|edible|ration|alcohol|treat|forag/i;
function eligibleInputs(inventory: readonly InventoryItem[]): InventoryItem[] {
  const out: InventoryItem[] = [];
  for (const it of inventory) {
    if (it.stolen) continue;
    if (!it.reservedForFusion) continue;
    if (!isInferredItem(it.name)) continue;
    if (it.quantity <= 0) continue;
    if (FUSION_EQUIP_KINDS.includes(it.kind)) continue;
    if ((it.tags ?? []).some((t) => FUSION_EDIBLE_TAG.test(t))) continue;
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
export function gateFusion(
  inventory: readonly InventoryItem[],
  factionCatalyst?: InventoryItem | null,
): FusionGate {
  const inputs = eligibleInputs(inventory);
  // arb-fix — a reserved faction CATALYST now COUNTS as the third item. Player
  // expectation: "2 inferred items + a faction item should fuse into a faction
  // piece." With a catalyst present the bar is 2 inferred inputs (the catalyst
  // is the 3rd) and 2 material tags (the faction supplies the output's
  // identity, so less raw diversity is needed). Without a catalyst the original
  // 3-inferred / 3-tag gate stands.
  const hasCatalyst = !!factionCatalyst;
  const minInputs = hasCatalyst ? 2 : 3;
  if (inputs.length < minInputs) {
    return {
      ok: false,
      reason: hasCatalyst
        ? `Need at least 2 inferred items (♥) to fuse with your faction catalyst. You have ${inputs.length}.`
        : `Need at least 3 inferred items reserved for fusion (♥ in inventory). You have ${inputs.length}.`,
      inputs: [],
      tagProfile: [],
    };
  }
  const tagSet = new Set<string>();
  const tagSources = hasCatalyst ? [...inputs, factionCatalyst] : inputs;
  for (const inp of tagSources) {
    if (!inp) continue;
    for (const t of inp.tags ?? []) {
      const k = t.toLowerCase();
      if (MATERIAL_TAG_SET.has(k)) tagSet.add(k);
    }
    // arb112 — ALSO re-derive material tags from the item's NAME. Inferred loot
    // (and inferred weapons like "Shrike Claw") often persist sparse tags — a vial
    // of "Aetheric Blood" carries only [loot,improvised,aether], no `organic` — so
    // the diversity gate was a dead end. Re-deriving from the name (which knows
    // blood/feather/moss/claw → organic) restores that diversity for items already
    // in old saves, with no migration.
    for (const t of inferGearTagPack(inp.name)) {
      if (MATERIAL_TAG_SET.has(t)) tagSet.add(t);
    }
  }
  const tagProfile = Array.from(tagSet);
  const minTags = hasCatalyst ? 2 : 3;
  if (tagProfile.length < minTags) {
    return {
      ok: false,
      reason: `Your reserved items are too alike — the Crucible needs ${minTags} DIFFERENT material types to fuse (not just more of the same), but yours span only ${tagProfile.length} (${tagProfile.join(', ') || 'none'}). Reserve something of another material — metal, bone, stone, cloth, wood, crystal.`,
      inputs: [],
      tagProfile,
    };
  }
  return { ok: true, inputs, tagProfile };
}

/** arb105 — optional faction CATALYST. A faction-gear item (tagged
 *  `faction_gear`) the player has reserved (♥) acts as a catalyst at the
 *  Crucible: when present at fuse time the output is themed as a unique
 *  faction item (faction-prefixed name, faction tags, bumped rarity) and the
 *  catalyst is consumed alongside the scrap inputs. arb-fix — it now also
 *  COUNTS toward the input gate (see gateFusion). Returns the first reserved
 *  faction-gear item, or null. `excludeIds` skips EQUIPPED instances so the
 *  Crucible never consumes gear the player is still wearing. */
export function findFactionCatalyst(
  inventory: readonly InventoryItem[],
  excludeIds?: ReadonlySet<string>,
): InventoryItem | null {
  for (const it of inventory) {
    if (!it.reservedForFusion) continue;
    if (it.quantity <= 0) continue;
    if (excludeIds?.has(it.id)) continue;
    if ((it.tags ?? []).includes('faction_gear')) return it;
  }
  return null;
}

/** Faction-theme overlay for a fused item. Identity of the catalyst's
 *  faction is supplied by the caller (it has factions.json). */
export interface FactionTheme {
  /** Faction id, added as a tag so the item reads as that faction's. */
  id: string;
  /** Short display label prefixed to the fused name ("Monarch Court", … ). */
  label: string;
  /** The catalyst InventoryItem id to drain on fuse. */
  catalystId: string;
  /** arb107 — the rarity the faction catalyst confers, computed by the
   *  caller as ONE tier above the inputs' natural fusion rarity (capped at
   *  Legendary). With the minimum 3-tag input set this lands on Rare; a
   *  richer 4+-tag set reaches Legendary. Replaces arb105's unconditional
   *  Legendary stamp, which (with free scrap + a cheap catalyst) trivialized
   *  the rarity ladder. */
  rarity: 'Rare' | 'Legendary';
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
        '- "rarity" should be "Legendary" when the input pack spans 4+ material tags; otherwise "Rare". A fused piece is always a premium, above-rare reward.',
        '- Optionally add "stealthBonus": 1–2 ONLY when the inputs include stealthy / silent / shadow / muffled gear (e.g. a shiv, cloak, footwraps) — it grants +Stealth while equipped. Omit otherwise.',
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
  stealthBonus?: unknown; // OTA-349
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
  // OTA-349 — optional stealth bonus on a fused item (0-3, clamped). Lets the
  // model grant stealth when the inputs are stealthy; the deterministic path
  // does the same off the tag profile.
  const stealthBonus = typeof raw.stealthBonus === 'number'
    ? Math.max(0, Math.min(3, Math.floor(raw.stealthBonus)))
    : 0;

  const stats: UniqueItemStats = {
    kind: kind as 'weapon' | 'armor' | 'dog_armor',
    rarity,
    durability: { current: FUSION_CLAMPS.durabilityMax, max: FUSION_CLAMPS.durabilityMax },
    ...(resistance ? { resistance } : {}),
    ...(special ? { special } : {}),
    ...(stealthBonus > 0 ? { statBonus: { stat: 'stealth' as const, amount: stealthBonus } } : {}),
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
/** OTA-221 — deterministic fusion fallback. Playtest log showed the
 *  player tapping fuse 20+ times after meeting every gate; Qwen
 *  returned `isReady() === false` every time and refused. The player
 *  earned the fusion (3 reserved items, 3 distinct material tags) and
 *  must never be permanently blocked by Qwen state. This function
 *  synthesizes a valid UniqueItemStats deterministically from the
 *  input profile — same clamp ranges as the Qwen path. Name + kind
 *  are picked from the dominant material tag; stats scale with input
 *  count and rarity. The result has less narrative variety than
 *  Qwen-generated but is always serviceable. */
export function synthesizeFusionDeterministic(
  inputs: readonly InventoryItem[],
  tagProfile: string[],
): { name: string; description: string; stats: UniqueItemStats } {
  const tagSet = new Set(tagProfile);
  // Dominant material — first match wins. Drives kind + theme.
  const dominantTag =
    tagSet.has('aether') ? 'aether'
    : tagSet.has('crystal') ? 'aether'
    : tagSet.has('blade') ? 'metal'
    : tagSet.has('metal') ? 'metal'
    : tagSet.has('iron') ? 'metal'
    : tagSet.has('plate') ? 'metal'
    : tagSet.has('cloth') ? 'cloth'
    : tagSet.has('fiber') ? 'cloth'
    : tagSet.has('organic') ? 'organic'
    : tagSet.has('bone') ? 'organic'
    : tagSet.has('wood') ? 'wood'
    : tagSet.has('stone') ? 'stone'
    : 'improvised';
  // Kind from the dominant tag.
  const kind: 'weapon' | 'armor' | 'dog_armor' =
    dominantTag === 'metal' || dominantTag === 'wood' || dominantTag === 'stone'
      ? 'weapon'
      : dominantTag === 'cloth'
        ? (tagSet.has('aether') ? 'armor' : 'dog_armor')
        : dominantTag === 'aether'
          ? 'weapon'
          : 'armor';
  // OTA-445 — [playability] fusion is an INVESTMENT (collect + reserve 3+ inferred
  // pieces + fire the Crucible), so the payoff should out-class anything you'd
  // just find. Legendary now lands at 4+ tags (was 5+); the 3-tag floor is still
  // Rare but its stats below are bumped ABOVE a same-rarity catalog piece. So a
  // fused item is reliably "a level above rare."
  const rarity: 'Rare' | 'Legendary' = tagProfile.length >= 4 ? 'Legendary' : 'Rare';
  // Name from a theme word + suffix. Deterministic via the input hash
  // so the same input set always produces the same name.
  const themePool: Record<string, string[]> = {
    aether: ['Resonant', 'Humming', 'Singing', 'Aether-Veined'],
    metal: ['Iron-Bound', 'Salvaged', 'Tempered', 'Brass-Edged'],
    cloth: ['Patched', 'Woven', 'Mud-Worn', 'Veil-Stitched'],
    organic: ['Marrow-Etched', 'Bone-Stitched', 'Sinew-Wrapped', 'Carapace'],
    wood: ['Hardwood', 'Burl', 'Rooted', 'Splint'],
    stone: ['Mudstone', 'Cairn', 'Slate', 'Pillar'],
    improvised: ['Field-Forged', 'Reclaimed', 'Salt-Worn', 'Veteran'],
  };
  const suffixPool: Record<string, string[]> = {
    weapon: ['Cleaver', 'Edge', 'Spike', 'Lash', 'Maul'],
    armor: ['Brace', 'Vigil', 'Mantle', 'Shroud', 'Bulwark'],
    dog_armor: ['Vigil', 'Wrap', 'Pattern', 'Stride'],
  };
  const hash = parseInt(fusionInputHash(inputs).substring(0, 8), 16);
  const theme = themePool[dominantTag] ?? themePool.improvised!;
  const suffix = suffixPool[kind] ?? suffixPool.weapon!;
  // OTA-224 — playtest fix: a previous synth named the result
  // "Resonant undefined" because `hash >> 4` is a SIGNED 32-bit
  // right shift in JavaScript. For hashes ≥ 2^31, the shift returns
  // a negative integer; `negative % length` returns negative;
  // `array[-3]` is undefined. Use the unsigned shift `>>>` so the
  // index stays non-negative for any input.
  const themeIdx = Math.abs(hash) % theme.length;
  const suffixIdx = (hash >>> 4) % suffix.length;
  const name = `${theme[themeIdx]!} ${suffix[suffixIdx]!}`;
  // Stats — deterministic, clamped. OTA-445 — durability + power bumped so a
  // fused piece beats a same-rarity catalog item (a catalog Rare weapon is 2d8;
  // pre-OTA a fused Rare was a weak 1d8). Legendary fused = 2d8, Rare fused = 2d6.
  const baseStats: UniqueItemStats = {
    kind,
    rarity,
    durability: rarity === 'Legendary' ? { current: 45, max: 45 } : { current: 35, max: 35 },
  };
  const scale: UniqueItemStats['scalesWith'] =
    dominantTag === 'aether' ? 'intelligence'
    : dominantTag === 'metal' ? 'strength'
    : 'dexterity';
  if (kind === 'weapon') {
    // OTA-445 — Legendary 2d8 / Rare 2d6 (was 2d6 / 1d8). damageType + scaling
    // stat by dominant tag.
    const dice = rarity === 'Legendary' ? '2d8' : '2d6';
    const dmgType: UniqueItemStats['damageType'] =
      dominantTag === 'aether' ? 'aetheric'
      : dominantTag === 'metal' ? 'slashing'
      : 'bludgeoning';
    baseStats.damageDice = dice;
    baseStats.damageType = dmgType;
    baseStats.scalesWith = scale;
  } else {
    // OTA-445 — Legendary AC +5 / Rare AC +3 (was 4 / 2).
    baseStats.acBonus = rarity === 'Legendary' ? 5 : 3;
    if (kind === 'armor') {
      baseStats.armorSlot = dominantTag === 'cloth' ? 'chest' : 'head';
    }
  }
  // OTA-445 — a fused piece always carries a real perk: +2 (Legendary) / +1
  // (Rare) to its scaling stat. A stealthy input set overrides this with the
  // stealth bonus below (preserving the OTA-349 stealth-fusion path).
  baseStats.statBonus = { stat: scale, amount: rarity === 'Legendary' ? 2 : 1 };
  // Resistance from dominant tag.
  const resistance =
    dominantTag === 'aether' ? 'aetheric'
    : dominantTag === 'organic' ? 'poison'
    : dominantTag === 'metal' ? 'degradation'
    : undefined;
  if (resistance) baseStats.resistance = resistance;
  // OTA-349 — stealth flows through the Crucible: if any input is stealthy
  // (carries the 'stealth' tag), the fused result inherits a stealth bonus
  // (Rare +1 / Legendary +2). Detected off the tag profile, which is built
  // from the inputs' tags.
  if (tagSet.has('stealth')) {
    baseStats.statBonus = { stat: 'stealth', amount: rarity === 'Legendary' ? 2 : 1 };
  }
  baseStats.special = `Field-forged from ${inputs.length} reclaimer scraps. The Crucible answered.`;
  const description = `A ${rarity.toLowerCase()} ${kind === 'dog_armor' ? 'dog vest' : kind} hammered together from your reserved pieces. The seams still hum with the Crucible's last breath.`;
  return { name, description, stats: baseStats };
}

export function applyFusion(
  inventory: readonly InventoryItem[],
  inputs: readonly InventoryItem[],
  result: { name: string; description: string; stats: UniqueItemStats },
  itemIdSeed: string,
  faction?: FactionTheme | null,
): { inventory: InventoryItem[]; fused: InventoryItem } {
  const inputIds = new Set(inputs.map((i) => i.id));
  // arb105 — the faction catalyst is also consumed (one unit) when present.
  if (faction) inputIds.add(faction.catalystId);
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

  // arb105/arb107 — faction theming overlay. A catalyst makes the result a
  // one-of-a-kind faction item: the name is prefixed with the faction's
  // label and the faction id + faction_gear tags are stamped on. arb107
  // changed the rarity from an unconditional Legendary stamp to "one tier
  // above the inputs' natural rarity" (the caller passes `faction.rarity`),
  // and never DOWNGRADES below what the synth produced — so a rich input
  // set that already synthesized Legendary stays Legendary.
  const rank = (r: 'Rare' | 'Legendary') => (r === 'Legendary' ? 1 : 0);
  const themedRarity: 'Rare' | 'Legendary' = faction
    ? (rank(faction.rarity) >= rank(result.stats.rarity) ? faction.rarity : result.stats.rarity)
    : result.stats.rarity;
  const stats: UniqueItemStats = faction
    ? { ...result.stats, rarity: themedRarity }
    : result.stats;
  const name = faction ? `${faction.label} ${result.name}`.slice(0, 48) : result.name;
  const tags = faction
    ? ['fused', 'unique', 'faction_gear', faction.id, ...(stats.resistance ? [stats.resistance] : [])]
    : ['fused', 'unique', ...(stats.resistance ? [stats.resistance] : [])];

  const fused: InventoryItem = {
    id: `fused_${itemIdSeed}`,
    name,
    kind: inventoryKind,
    quantity: 1,
    tags,
    rarity: stats.rarity,
    description: faction
      ? `${result.description} It bears the mark of ${faction.label}.`
      : result.description,
    durability: { ...stats.durability },
    uniqueStats: stats,
  };

  return { inventory: [...drained, fused], fused };
}
