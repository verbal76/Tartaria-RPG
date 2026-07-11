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
import { isInferredItem, isRecipeIngredientName, findWeaponByName, findArmorByName } from './crafting';
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
/** OTA — the material tag(s) an item contributes to a fusion, for the info block.
 *  Output RARITY is driven by how many DISTINCT materials the chosen inputs span
 *  (3 different → Rare, 4+ → Legendary), NOT by the inputs' own rarity. */
export function fusionMaterialTags(item: { name: string; tags?: readonly string[] }): string[] {
  const out = new Set<string>();
  for (const t of item.tags ?? []) { const k = t.toLowerCase(); if (MATERIAL_TAG_SET.has(k)) out.add(k); }
  for (const t of inferGearTagPack(item.name)) { if (MATERIAL_TAG_SET.has(t)) out.add(t); }
  return Array.from(out);
}

/** OTA-682 — which reserved inputs the Fusing Crucible picker should SHOW given
 *  the current selection. Hides same-material duplicates (an input that adds no
 *  material the picked set doesn't already cover) to steer toward diversity — BUT
 *  never hides so much that the player can't reach `minPick` items. A single
 *  material-rich input (an Aetheric Cog = metal + improvised + aether) can cover a
 *  whole reserved pool's materials in just two picks; without this escape hatch the
 *  remaining filler vanishes and the Fuse button can never light — a hard deadlock
 *  the player reads as "I still can't fuse." When short of `minPick` with nothing
 *  left that adds a new material, the redundant filler is revealed so the batch can
 *  complete. Reaching that state means the picked set already spans every material
 *  the pool has (so it already clears the diversity gate); the filler only pads the
 *  count. `pickedIds` may include ids not in `scraps` (already-spent) — harmless. */
export function visibleFusionInputs(
  scraps: readonly InventoryItem[],
  pickedIds: readonly string[],
  minPick: number,
): InventoryItem[] {
  const pickedSet = new Set(pickedIds);
  const pickedMats = new Set(
    scraps.filter((i) => pickedSet.has(i.id)).flatMap((i) => fusionMaterialTags(i)),
  );
  const addsNew = (it: InventoryItem) => fusionMaterialTags(it).some((m) => !pickedMats.has(m));
  const freshCount = scraps.filter((it) => !pickedSet.has(it.id) && addsNew(it)).length;
  const needFiller = pickedIds.length < minPick && freshCount === 0;
  return scraps.filter((it) => pickedSet.has(it.id) || addsNew(it) || needFiller);
}

/** OTA-756 (1a) — an AUTHORED catalog reagent that the forge should accept.
 *  The Crucible was inferred-only, so junk loot with a real catalog row (Rat Fur,
 *  Crystalline Echo, …) could never be reserved even though it's exactly the kind
 *  of throwaway material a player wants to melt. Opt those in — but ONLY 'loot'-
 *  tagged reagents that (a) aren't equip gear / edible / throwable / keepsake and
 *  (b) are NOT used in any recipe, so recipe-critical loot (Aetheric Cloth, Drone
 *  Core, …) stays protected and fusing never cannibalizes crafting. */
const FORGE_LOOT_BLOCK_TAGS = /throwable|keepsake|quest|sigil|currency|relic/i;
export function isForgeableLootReagent(item: { name: string; kind?: string; tags?: readonly string[] }): boolean {
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  if (!tags.includes('loot')) return false;
  if (FUSION_EQUIP_KINDS.includes(item.kind ?? '')) return false;
  if (tags.some((t) => FUSION_EDIBLE_TAG.test(t) || FORGE_LOOT_BLOCK_TAGS.test(t))) return false;
  if (isRecipeIngredientName(item.name)) return false;
  return true;
}

/** OTA-756 — the single source of truth for "can this item be reserved for and
 *  consumed by the Fusing Crucible?". Every fusion surface (the reserve toggle,
 *  the ◆ diamond, the save-for-fusion action, eligibleInputs) routes through this
 *  so what the UI advertises and what the bench accepts can never drift apart.
 *   - a fused one-of-a-kind (uniqueStats) is never re-fusible;
 *   - (2a) equip kinds — weapon / armor / accessory / amulet / ring — are OUT, so
 *     reserving a weapon no longer shows a ♥ the Crucible then silently ignores;
 *   - edible items are OUT;
 *   - catalog-absent inferred junk is IN (the original path);
 *   - (1a) authored 'loot' reagents with no recipe use are IN.
 *  Faction catalysts are handled separately by callers (they theme output rather
 *  than count as a normal input). */
export function isForgeReservableItem(
  item: { name: string; kind?: string; tags?: readonly string[]; uniqueStats?: unknown },
): boolean {
  if (item.uniqueStats) return false;
  if (FUSION_EQUIP_KINDS.includes(item.kind ?? '')) return false;
  if ((item.tags ?? []).some((t) => FUSION_EDIBLE_TAG.test(t))) return false;
  if (isInferredItem(item.name)) return true;
  return isForgeableLootReagent(item);
}

export function eligibleInputs(inventory: readonly InventoryItem[]): InventoryItem[] {
  const out: InventoryItem[] = [];
  for (const it of inventory) {
    if (it.stolen) continue;
    if (!it.reservedForFusion) continue;
    if (it.quantity <= 0) continue;
    if (!isForgeReservableItem(it)) continue;
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
  explicitInputs?: readonly InventoryItem[],
): FusionGate {
  // When the player has hand-picked a subset in the fusion picker, validate THOSE
  // exact items (still reserved/eligible) instead of the whole reserved pool.
  const inputs = explicitInputs ? [...explicitInputs] : eligibleInputs(inventory);
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
    // arb118 — Number.isFinite (not typeof === 'number') so a NaN acBonus can't
    // slip through (NaN < 1 and NaN > cap are BOTH false) and poison AC math.
    const ac = Number.isFinite(raw.acBonus) ? Math.floor(raw.acBonus as number) : 0;
    if (ac < 1 || ac > FUSION_CLAMPS.acBonus) return null;
    stats.armorSlot = slot as UniqueItemStats['armorSlot'];
    stats.acBonus = ac;
  } else {
    // dog_armor — no slot, but needs acBonus
    // arb118 — Number.isFinite (not typeof === 'number') so a NaN acBonus can't
    // slip through (NaN < 1 and NaN > cap are BOTH false) and poison AC math.
    const ac = Number.isFinite(raw.acBonus) ? Math.floor(raw.acBonus as number) : 0;
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

/** OTA-761 — a forged name is "low quality" when it reads like a prompt echo or a
 *  stat dump instead of an evocative 2-4 word name. The small on-device model
 *  sometimes parrots the naming PROMPT back ("A Rare Dog Armor (+3 AC)") or emits a
 *  bare "<theme> Armor". A good name has NO leading article, NO rarity word, NO
 *  generic kind word, and NO digits/parens (a stat echo like "(+3 AC)" or "2d8").
 *  Used to (a) reject such a Qwen name so the deterministic name stands, AND (b)
 *  re-name already-forged items that carry one from before this guard existed. */
export function isLowQualityForgeName(name: string): boolean {
  if (!name) return true;
  return /^(a|an|the)\b/i.test(name)
    || /\b(common|uncommon|rare|legendary)\b/i.test(name)
    || /[()\d]/.test(name)
    || /\b(armou?r|weapon)\b/i.test(name);
}

/** OTA-631 — name + description ONLY for an already-stat-balanced fused item.
 *  The deterministic synth has already decided the kind / rarity / stats; this
 *  asks Qwen for JUST the flavor (a 2-4 word name + one-line description), which
 *  is far fewer output tokens than the full stat synth (~64 vs ~200) so it's
 *  noticeably faster — and it CANNOT affect balance, since the stats are locked.
 *  Used by the background "materialization" path: the weapon is forged + minted
 *  instantly with a placeholder name, and this settles its true name when (if)
 *  it returns. Returns null if Qwen isn't ready / the reply can't be parsed /
 *  validation rejects it; the caller then keeps the deterministic name. */
export async function synthesizeFusionNameViaQwen(
  stats: UniqueItemStats,
  inputs: readonly InventoryItem[],
  tagProfile: string[],
  qwen: FusionSynthEngine,
): Promise<{ name: string; description: string } | null> {
  if (!qwen.isReady()) return null;
  try {
    const reply = await qwen.generate(buildNamePrompt(stats, inputs, tagProfile), {
      maxNewTokens: 64,
      temperature: 0.6,
    });
    const json = extractJsonObject(reply);
    if (!json) return null;
    let parsed: { name?: unknown; description?: unknown };
    try {
      parsed = JSON.parse(json) as { name?: unknown; description?: unknown };
    } catch {
      return null;
    }
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    const description = typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 200) : '';
    if (!name || name.length > 40 || !description) return null;
    // OTA-704 — reject a lazy/colliding Qwen name so the distinct deterministic name
    // (theme + kind suffix, e.g. "Resonant Aegis") stands instead. Two failure modes
    // seen in play: (a) the model returns a bare "<theme> Armor"/"Weapon" — generic
    // and, worse, "Aetheric Armor" is ALSO an authored runecaster WEAPON, so the
    // collision re-typed the forged armor; (b) any name that resolves to a CATALOG
    // item of a different kind than the forge. Fall back (return null) in both cases.
    const kindWord = stats.kind === 'weapon' ? 'weapon' : 'armor';
    const endsWithKindWord = new RegExp(`\\b${kindWord}$`, 'i').test(name);
    const collidesCrossKind = stats.kind === 'weapon'
      ? !!findArmorByName(name)
      : !!findWeaponByName(name); // armor/dog_armor forge must not be named like a catalog weapon
    // OTA-761 — also reject an ECHOED / low-quality name (see isLowQualityForgeName)
    // so the evocative deterministic name (theme + kind suffix, e.g. "Humming Vest")
    // stands instead.
    if (endsWithKindWord || collidesCrossKind || isLowQualityForgeName(name)) return null;
    return { name, description };
  } catch {
    return null;
  }
}

function buildNamePrompt(
  stats: UniqueItemStats,
  inputs: readonly InventoryItem[],
  tagProfile: string[],
): ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const kindWord = stats.kind === 'weapon' ? 'weapon' : stats.kind === 'dog_armor' ? 'dog armor' : 'armor';
  const power = stats.kind === 'weapon'
    ? `${stats.damageDice ?? ''} ${stats.damageType ?? ''}`.trim()
    : `+${stats.acBonus ?? 1} AC`;
  const inputList = inputs.map((i) => i.name).join(', ');
  return [
    {
      role: 'system',
      content: [
        'You name forged items for a salvage-wasteland RPG. Output ONLY one JSON object on one line, no markdown, no prose.',
        'Shape: {"name":"<2-4 word evocative name>","description":"<one short evocative sentence>"}',
        'World tone: Reclaimers scavenge a flooded wasteland; the Aether is a strange resonant material left over from a fallen civilization.',
        'Names are short (2-4 words), evocative, never silly or modern-branded. The description is one line and grounds the item in its materials.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `A ${stats.rarity} ${kindWord} (${power}) was just forged at an Aetheric Crucible from these scraps: ${inputList || 'assorted salvage'}.`,
        `Material profile: ${tagProfile.join(', ') || 'mixed'}.`,
        'Name it and describe it. Return the JSON.',
      ].join('\n'),
    },
  ];
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
  forcedKind?: 'weapon' | 'armor' | 'dog_armor',
  // OTA-739 — the armor slots forged most recently (newest first). The slot
  // picker steps past these so the Crucible rotates through slots instead of
  // handing back the same one twice in a row (playtest: three forges → three
  // head pieces, because the slot used a fixed cloth?chest:head default).
  recentSlots?: readonly string[],
): { name: string; description: string; stats: UniqueItemStats } {
  const tagSet = new Set(tagProfile);
  // OTA-759 — dominant material by COUNT across the actual inputs, NOT the old
  // fixed aether-first priority. That priority tested `aether`/`crystal` FIRST, so
  // a single aether-tagged input — and Tartaria fusion loot is aether-heavy — made
  // EVERY fusion aether-dominant → always 'aetheric' resist + aether theme/damage
  // ("all my fused dog vests are aetheric resist"). Now we tally how many of your
  // reserved pieces carry each canonical material and take the most common; ties
  // break on the input hash so different sets diverge (an organic/fur-heavy pool
  // forges poison-resist, a metal-heavy one degradation, an aether one aetheric).
  const CANON_MAT: Record<string, string> = {
    aether: 'aether', crystal: 'aether',
    blade: 'metal', metal: 'metal', iron: 'metal', plate: 'metal',
    cloth: 'cloth', fiber: 'cloth',
    organic: 'organic', bone: 'organic',
    wood: 'wood', stone: 'stone', mudstone: 'stone',
  };
  const MAT_ORDER = ['aether', 'metal', 'cloth', 'organic', 'wood', 'stone'] as const;
  const matCounts = new Map<string, number>();
  for (const it of inputs) {
    // fusionMaterialTags dedupes per item, so each piece adds at most 1 to a bucket
    // → the count is "how many of your pieces are metal / organic / aether / …".
    for (const t of fusionMaterialTags(it)) {
      const c = CANON_MAT[t];
      if (c) matCounts.set(c, (matCounts.get(c) ?? 0) + 1);
    }
  }
  const domSeed = parseInt(fusionInputHash(inputs).substring(0, 8), 16) || 0;
  const dominantTag = (() => {
    // Rotate the tiebreak order by the input hash so equal-count materials don't
    // always resolve to the same bucket across different reserved sets.
    const rot = domSeed % MAT_ORDER.length;
    const order = [...MAT_ORDER.slice(rot), ...MAT_ORDER.slice(0, rot)];
    let best: string | null = null;
    let bestN = 0;
    for (const c of order) {
      const n = matCounts.get(c) ?? 0;
      if (n > bestN) { bestN = n; best = c; }
    }
    return best ?? 'improvised';
  })();
  // Kind from the dominant tag — OVERRIDDEN by the player's explicit weapon/armor
  // choice from the fusion picker when provided (the material still drives theme +
  // stats, but the SHAPE is the player's call).
  const derivedKind: 'weapon' | 'armor' | 'dog_armor' =
    dominantTag === 'metal' || dominantTag === 'wood' || dominantTag === 'stone'
      ? 'weapon'
      : dominantTag === 'cloth'
        ? (tagSet.has('aether') ? 'armor' : 'dog_armor')
        : dominantTag === 'aether'
          ? 'weapon'
          : 'armor';
  const kind: 'weapon' | 'armor' | 'dog_armor' = forcedKind ?? derivedKind;
  // OTA-445 — [playability] fusion is an INVESTMENT (collect + reserve 3+ inferred
  // pieces + fire the Crucible), so the payoff should out-class anything you'd
  // just find. Legendary now lands at 4+ tags (was 5+); the 3-tag floor is still
  // Rare but its stats below are bumped ABOVE a same-rarity catalog piece. So a
  // fused item is reliably "a level above rare."
  const rarity: 'Rare' | 'Legendary' = tagProfile.length >= 4 ? 'Legendary' : 'Rare';
  // Name from a theme word + suffix. Deterministic via the input hash
  // so the same input set always produces the same name.
  // arb114 — MUCH larger word banks so the Crucible stops repeating names. Each
  // dominant-tag theme bank and each kind suffix bank is now ~16 deep, taking a
  // weapon's combination space from ~20 to ~250+ per material (and the hash picks
  // two independent slices, so different input sets rarely collide on a name).
  const themePool: Record<string, string[]> = {
    aether: [
      'Resonant', 'Humming', 'Singing', 'Aether-Veined', 'Etheric', 'Glimmerwrought',
      'Stormcalled', 'Voltaic', 'Pulse-Woven', 'Lumenforged', 'Aether-Touched', 'Spark-Riven',
      'Choir-Bound', 'Static-Laced', 'Witchlit', 'Ghost-Charged', 'Auralite', 'Halcyon',
    ],
    metal: [
      'Iron-Bound', 'Salvaged', 'Tempered', 'Brass-Edged', 'Forge-Black', 'Rust-Eaten',
      'Scrap-Welded', 'Anvil-Struck', 'Cold-Drawn', 'Slag-Cast', 'Rivet-Seamed', 'Hammer-Folded',
      'Galvanized', 'Bolt-Riveted', 'Foundry-Born', 'Pig-Iron',
    ],
    cloth: [
      'Patched', 'Woven', 'Mud-Worn', 'Veil-Stitched', 'Tatter-Sewn', 'Threadbare',
      'Shroud-Spun', 'Sackcloth', 'Frayed', 'Loom-Bound', 'Gauze-Wrapped', 'Quilted',
      'Ragspun', 'Weft-Knit',
    ],
    organic: [
      'Marrow-Etched', 'Bone-Stitched', 'Sinew-Wrapped', 'Chitin-Plated', 'Gut-Strung', 'Hide-Bound',
      'Tallow-Cured', 'Tooth-Set', 'Vein-Threaded', 'Husk-Grown', 'Spore-Crusted', 'Ichor-Slick',
      'Scale-Lapped', 'Tendon-Lashed',
    ],
    wood: [
      'Hardwood', 'Burl', 'Rooted', 'Splint', 'Knot-Grained', 'Greenwood',
      'Driftwood', 'Bog-Oak', 'Sap-Sealed', 'Bark-Lashed', 'Pith-Cored', 'Timberbound',
    ],
    stone: [
      'Mudstone', 'Cairn', 'Slate', 'Pillar', 'Granite-Cut', 'Cobble-Set',
      'Flint-Knapped', 'Basalt', 'Quarry-Hewn', 'Shale-Split', 'Geode-Cored', 'Menhir',
    ],
    improvised: [
      'Field-Forged', 'Reclaimed', 'Salt-Worn', 'Veteran', 'Jury-Rigged', 'Scavenged',
      'Makeshift', 'Lashed-Together', 'Roadworn', 'Gutter-Made', 'Half-Mended', "Drifter's",
      'Castoff', 'Pieced', 'Cobbled', 'Stopgap',
    ],
  };
  const suffixPool: Record<string, string[]> = {
    weapon: [
      'Cleaver', 'Edge', 'Spike', 'Lash', 'Maul', 'Reaver', 'Fang', 'Render',
      'Splitter', 'Brand', 'Gouge', 'Hewer', 'Cudgel', 'Talon', 'Ripper', 'Crusher',
      'Skewer', 'Breaker', 'Sunder', 'Biter',
    ],
    armor: [
      'Brace', 'Vigil', 'Mantle', 'Shroud', 'Bulwark', 'Ward', 'Carapace', 'Aegis',
      'Husk', 'Bastion', 'Girdle', 'Plating', 'Cuirass', 'Harness', 'Shell', 'Guard',
    ],
    dog_armor: [
      'Vigil', 'Wrap', 'Pattern', 'Stride', 'Harness', 'Coat', 'Barding', 'Hide',
      'Saddle', 'Collar', 'Vest', 'Cover',
    ],
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
      // OTA-739 — rotate the forged slot across all four positions instead of the
      // old fixed cloth?chest:head (which sent every non-cloth fusion to head).
      // Start from the input hash (so different reserved sets favor different
      // slots), then step past any slot forged in the last couple of fusions so
      // the Crucible never returns the same slot back-to-back. A soft material
      // lean is kept: cloth/fiber sets bias toward chest as the starting point.
      const startIdx = dominantTag === 'cloth'
        ? VALID_ARMOR_SLOTS.indexOf('chest')
        : Math.abs(hash) % VALID_ARMOR_SLOTS.length;
      const avoid = new Set((recentSlots ?? []).map((s) => s.toLowerCase()));
      let slotIdx = startIdx < 0 ? 0 : startIdx;
      for (
        let step = 0;
        step < VALID_ARMOR_SLOTS.length && avoid.has(VALID_ARMOR_SLOTS[slotIdx]!);
        step++
      ) {
        slotIdx = (slotIdx + 1) % VALID_ARMOR_SLOTS.length;
      }
      baseStats.armorSlot = VALID_ARMOR_SLOTS[slotIdx]!;
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

// OTA-706 — compact theme/suffix banks for RE-naming already-forged fused items whose
// stored name collides with a catalog row. Kept separate from the synth's richer banks
// so this migration path is self-contained; every entry is fantasy flavor that won't
// itself equal a catalog weapon/armor name.
const RENAME_THEME: Record<string, string[]> = {
  aether: ['Resonant', 'Humming', 'Aether-Veined', 'Stormcalled', 'Pulse-Woven', 'Ghost-Charged', 'Witchlit', 'Halcyon'],
  metal: ['Iron-Bound', 'Tempered', 'Forge-Black', 'Anvil-Struck', 'Slag-Cast', 'Galvanized', 'Foundry-Born', 'Cold-Drawn'],
  cloth: ['Woven', 'Veil-Stitched', 'Shroud-Spun', 'Loom-Bound', 'Quilted', 'Weft-Knit', 'Gauze-Wrapped'],
  organic: ['Marrow-Etched', 'Sinew-Wrapped', 'Chitin-Plated', 'Hide-Bound', 'Vein-Threaded', 'Scale-Lapped', 'Tendon-Lashed'],
  stone: ['Cairn', 'Slate', 'Granite-Cut', 'Flint-Knapped', 'Basalt', 'Quarry-Hewn', 'Shale-Split'],
  wood: ['Hardwood', 'Rooted', 'Knot-Grained', 'Bog-Oak', 'Bark-Lashed', 'Timberbound', 'Sap-Sealed'],
  improvised: ['Field-Forged', 'Reclaimed', 'Salt-Worn', 'Jury-Rigged', 'Roadworn', 'Cobbled', 'Pieced', 'Castoff'],
};
const RENAME_SUFFIX: Record<string, string[]> = {
  weapon: ['Cleaver', 'Edge', 'Reaver', 'Render', 'Brand', 'Gouge', 'Talon', 'Sunder'],
  armor: ['Brace', 'Vigil', 'Mantle', 'Bulwark', 'Ward', 'Aegis', 'Bastion', 'Cuirass'],
  dog_armor: ['Wrap', 'Pattern', 'Barding', 'Hide', 'Collar', 'Cover'],
};
function fnvHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

type NamedFusedRef = { id: string; name: string; tags?: string[]; uniqueStats?: UniqueItemStats };

/** True when a fused item's stored name resolves to a CATALOG item of a DIFFERENT
 *  kind than the forge chose — the "Aetheric Armor" trap (a forged armor sharing a
 *  name with an authored runecaster weapon). */
export function fusedNameCollidesCrossKind(item: NamedFusedRef): boolean {
  const u = item.uniqueStats;
  if (!u) return false;
  return u.kind === 'weapon' ? !!findArmorByName(item.name) : !!findWeaponByName(item.name);
}

/** OTA-706 — a distinct, structured, catalog-safe name for a fused item, derived
 *  deterministically from its id (so it's stable across loads) + its uniqueStats
 *  theme/kind. Salts until the generated name does NOT itself cross-kind-collide, so
 *  the load migration is idempotent. */
export function deterministicFusedName(item: NamedFusedRef): string {
  const u = item.uniqueStats;
  const kind = u?.kind === 'weapon' ? 'weapon' : u?.kind === 'dog_armor' ? 'dog_armor' : 'armor';
  const tags = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
  const themeKey =
    (u?.damageType === 'aetheric' || u?.resistance === 'aetheric' || tags.has('aether') || tags.has('aetheric') || tags.has('crystal')) ? 'aether'
    : (u?.damageType === 'slashing' || u?.resistance === 'degradation' || tags.has('metal') || tags.has('iron')) ? 'metal'
    : (tags.has('cloth') || tags.has('fiber')) ? 'cloth'
    : (tags.has('organic') || tags.has('bone')) ? 'organic'
    : tags.has('stone') ? 'stone'
    : tags.has('wood') ? 'wood'
    : 'improvised';
  const theme = RENAME_THEME[themeKey]!;
  const suffix = RENAME_SUFFIX[kind]!;
  for (let salt = 0; salt < 12; salt++) {
    const h = fnvHash(salt ? `${item.id}#${salt}` : item.id);
    const candidate = `${theme[h % theme.length]!} ${suffix[(h >>> 5) % suffix.length]!}`;
    if (!fusedNameCollidesCrossKind({ ...item, name: candidate })) return candidate;
  }
  return `${theme[0]!} ${suffix[0]!}`;
}

/** OTA-706 — one-time load migration: rename a fused item whose stored name
 *  cross-kind-collides with the catalog. Idempotent (a clean name is returned as-is). */
export function migrateFusedName(item: InventoryItem): InventoryItem {
  // OTA-761 — re-mint the name when it cross-kind-collides with a catalog row OR is
  // low-quality (a prompt echo like "A Rare Dog Armor (+3 AC)" or a bare "<theme>
  // Armor" that predates the namer guard). Guarded to fused items via uniqueStats so
  // deterministicFusedName (which reads uniqueStats) always has real data. Idempotent:
  // a clean name is left alone next load.
  if (!item.uniqueStats) return item;
  return (fusedNameCollidesCrossKind(item) || isLowQualityForgeName(item.name))
    ? { ...item, name: deterministicFusedName(item) }
    : item;
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
      // arb168 — clear the reservation on whatever survives the drain. Without
      // this, a multi-unit reserved stack (e.g. Shrike Claw ×3) stayed flagged
      // `reservedForFusion`, so pressing fuse again at a free outpost/market
      // Crucible re-drained the SAME stacks and minted another identical Rare —
      // the "4 weapons from 4 items" dupe. Forcing a re-reserve per batch closes it.
      return { ...i, quantity: Math.max(0, i.quantity - 1), reservedForFusion: false };
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
    // OTA-611 — exploit close: fused gear is player-made, so flag it
    // selfCrafted. Without this, scrapEngine's premium-strip/halve guard
    // (gated on selfCrafted) was skipped and a Rare fused weapon scrapped into
    // a free Golem Core + Scrap Metal — a renewable mint of the bottleneck
    // golem material from free inferred loot at a free Crucible.
    selfCrafted: true,
  };

  return { inventory: [...drained, fused], fused };
}
