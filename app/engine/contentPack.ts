// engine_Dev — Content-pack registry.
//
// The built-in Tartaria JSON in app/data/ is the DEFAULT pack. A developer can
// override any table or lore block AT RUNTIME (DeveloperSettingsScreen) to reskin
// the engine into a different game — new weapons/armor/materials/enemies/etc. and
// new world/faction/race lore — without touching engine code.
//
// Engine modules read content through resolveTable() / getWorldTone() instead of
// importing the JSON directly, so a loaded override transparently takes over. When
// nothing is overridden, every accessor returns the built-in default, so the base
// game is unchanged. This is the seam the "stripped engine" is built on.

export type ContentTableId =
  | 'weapons' | 'armor' | 'materials' | 'gear' | 'exploration'
  | 'amulets' | 'rings' | 'dogGear'
  | 'recipes' | 'enemies' | 'races' | 'factions' | 'locations' | 'lore' | 'powers' | 'weather'
  | 'startingLoadout';

export type LoreBlockId = 'world' | 'faction' | 'race' | 'flavor';

export interface ContentTableDef { id: ContentTableId; label: string; hint: string; }
export interface LoreBlockDef { id: LoreBlockId; label: string; hint: string; }

/** The tables the developer console exposes for upload, in display order. */
export const CONTENT_TABLES: ContentTableDef[] = [
  { id: 'weapons', label: 'Weapons', hint: 'JSON array of weapon rows (matches data/items/weapons.json)' },
  { id: 'armor', label: 'Armor', hint: 'JSON array of armor rows (data/items/armor.json)' },
  { id: 'materials', label: 'Materials', hint: 'JSON array of material rows (data/items/materials.json)' },
  { id: 'gear', label: 'Gear / equipment', hint: 'JSON array (data/items/gear.json)' },
  { id: 'exploration', label: 'Exploration items', hint: 'JSON array (data/items/exploration.json)' },
  { id: 'amulets', label: 'Amulets', hint: 'JSON array of amulet/relic rows (data/items/amulets.json)' },
  { id: 'rings', label: 'Rings', hint: 'JSON array of ring rows (data/items/rings.json)' },
  { id: 'dogGear', label: 'Dog gear (armor the DOG wears)', hint: 'JSON array of dog-armor rows the COMPANION DOG equips (not the player). Each: { "name", "kind": "dog_armor", "rarity", "acBonus", "baseDurability"?, "statBonus"?: { "stat": "strength|dexterity|intelligence", "amount" }, "tags": [...], "description" }. A dog-armor CRAFTING recipe\'s result resolves here, so define your dog vests in this table or the recipe crafts to a blank "misc".' },
  { id: 'recipes', label: 'Crafting recipes', hint: 'Crafting formulas: [{ "result": "Item Name", "ingredients": [{ "name": "Material", "quantity": 2 }] }]. IMPORTANT: a recipe is only the formula — the "result" MUST also be defined in your Weapons/Armor/Gear/Exploration/Amulets/Rings table (that\'s where the crafted item gets its stats; an undefined result crafts to a blank "misc"), and each ingredient "name" must be a real Material that is obtainable (loot/dig/salvage). Build items + materials FIRST. Names match by exact string.' },
  { id: 'enemies', label: 'Enemies', hint: 'JSON array of enemy rows. DAMAGE RELATIONS per enemy: "damage" carries what it DELIVERS (dice + a damage-type word, e.g. "2d6 frost" — any type you defined in Damage Types); "traits" carries WEAK / STRONG — add "vulnerable:<type>" for weak-to (takes 1.5×) and "resist:<type>" for strong-against (takes ½), e.g. traits: ["vulnerable:burn","resist:electrical"]. Types must match your Damage Types names.' },
  { id: 'races', label: 'Races (playable — character creation)', hint: 'JSON array of race rows. THIS is what the race-selection screen shows. (Not the "Race lore" box up in LORE — that\'s freeform story text.) PERKS + GEAR per race: "racialStatBonuses" {strength?,…} (always-on stat bumps), "racialACBonusRules" [{condition,delta}] (conditional AC), "startingWeapon" (item name for the starter primary), "startingGear" ["item names"] (extra creation items from your catalogs), "abilities" [{id,name,description,combatOnly?,effect:{type:heal|stat_buff|shield|repair|strike, amount?|dice?, stat?, rounds?, damageType?}}] (once-a-day powers). "resist": ["<damage type>"] / "weak": ["<damage type>"] — lower/raise the chance the member suffers that type\'s on-hit effect (the player has NO weakness unless granted here).' },
  { id: 'factions', label: 'Factions (playable — character creation)', hint: 'JSON array of faction rows. THIS is what the faction-selection screen shows. (Not the "Faction lore" box up in LORE.) Optional per faction: "flavor" (2-3 sentence blurb), "baseName" (STARTER COMPLEX title), "baseLocationId" (spawn location id). PERKS + GEAR: "startingGear" ["item names"] (creation items from your catalogs — replaces the built-in faction knife), "factionStatBonuses" {strength?,…} (always-on stat bumps while a member), "factionACBonusRules" [{condition,delta}] (conditional AC), "abilities" [{id,name,description,combatOnly?,effect:{type:heal|stat_buff|shield|repair|strike,…}}] (once-a-day powers). "resist"/"weak": ["<damage type>"] — member resists/is weak to that type\'s on-hit effect.' },
  { id: 'locations', label: 'Locations', hint: 'JSON array of locations (data/locations/locations.json). Optional per row: "x" / "y" — the spot to plot this location on your uploaded world map, in the world size set under MAPS (0,0 = top-left). Optional "hidden": true — the place shows as a colored "?" on the map and in the travel list (still fully routable) and reveals its real name only after the player travels there once.' },
  { id: 'weather', label: 'Weather / atmosphere', hint: 'JSON array of weather rows (data/weather/weather.json). Drives the "<name> presses on the world" atmosphere line AND mechanics, straight from the DATA fields (ids are free-form): visibility (negative → attack penalty), travelPenalty (3+ → slower repositioning), corruptionChance + hostile tags (storm/ash/hazardous → per-action tick), cold/snow tags → -1 DEX, fog/ash/smoke → -1 WIS. Each: { "id", "name", "description", "visibility", "travelPenalty", "corruptionChance", "tags": [...] }. Add a benign row (visibility 0, travelPenalty 0, no hostile tags) for fair weather. To disable weather entirely set top-level "weatherEnabled": false (or the dev-console FEATURES toggle).' },
  { id: 'lore', label: 'Lore document', hint: 'Your world bible as keyworded passages: [{ "tags": ["uss eldridge","fog"], "text": "..." }]. The narrator surfaces the passage whose tags match the scene; replaces the built-in canon. Write the big dump once — the engine pulls the right slice.' },
  { id: 'powers', label: 'Powers (magic / abilities)', hint: 'Your castable powers. Each: { "discipline": "shape|summon|mend" (the engine effect it runs), "name", "title", "body", "stat": "intelligence|wisdom", "dcBase", "fuels": ["item names"], "examples": ["cast phrases"] }. Replaces the built-in power set. Hit TEMPLATE for the shape.' },
  { id: 'startingLoadout', label: 'Starting loadout (creation gear)', hint: 'JSON array of the items a new character begins with — your re-skin\'s SOLE source of creation gear. Pick as many items as you want from ANY of your catalogs (weapons, armor, materials, gear/supplies). In a re-skin this REPLACES every built-in starter handout: if you DON\'T author a loadout, a new character starts with NOTHING. Each row: { "name", "tags": [...], "quantity"?, "equip"?, "faction"? }. Only "name" is required. The engine infers the item KIND from the tags (weapon → weapon, food/drink/consumable → consumable, relic/light/detection → relic, armor → armor, else misc), defaults quantity to 1, and — if the name matches one of your catalog items — pulls its real rarity / description / durability. KEEP the behavior tags to keep behavior: "food"/"drink" (eat/drink for stamina; a "drink"+"water" vessel starts full), "light" (reveal hooks), "rope"/"climb" (the climb beat), "detection" (relic finder), "throwable" (a one-shot thrown weapon from the bandolier — knives are "weapon"+"knife"+"throwable" (a held weapon OR a thrown one, never a "tool"); grenades are "weapon"+"throwable"+"grenade", consumed on throw). "equip": "main" | "off" | "head" | "chest" | "legs" | "feet" | "cloak" | "amulet" | "ring" auto-equips that row (default: the first weapon goes to the main hand). "faction": "<factionId>" makes the row PER-FACTION — a row with no faction is granted to everyone, a faction-tagged row only to that faction\'s members — so one array can hold shared kit + a different sidearm/knife per faction. Hit TEMPLATE for the shape.' },
];

/** Lore blocks, split the way the game uses them. */
export const LORE_BLOCKS: LoreBlockDef[] = [
  { id: 'world', label: 'World lore', hint: 'JSON: { "narrator": "You are <persona>…", "tone": "<one-line world tone the narrator uses>", "tagline": "<shown under the title>", "setting": "<a paragraph the narrator knows>", "terms": ["place/faction nouns"], "vocabulary": ["verbs the narrator favors"] }' },
  { id: 'faction', label: 'Faction lore (story notes — NOT playable)', hint: 'Free-form faction backstory for the narrator. The PLAYABLE factions (character creation) go in the "Factions" box under TABLES, not here.' },
  { id: 'race', label: 'Race lore (story notes — NOT playable)', hint: 'Free-form race backstory for the narrator. The PLAYABLE races (character creation) go in the "Races" box under TABLES, not here.' },
  { id: 'flavor', label: 'Narration flavor', hint: 'JSON object of the narrator’s canned line-pools by key (opening, genericRemarks, combatRemarks, lookLines, notedLines, sceneIntros, combatIntros, hubOpening, personalBeats, moodRemarks, intentRemarks, raceRemarks, factionRemarks). Also "starterItems": an array of starting-inventory item rows (keep each row\'s "tags" to keep its behavior — light/drink/food/detection). Hit TEMPLATE to see the keys; any key you omit keeps the built-in lines.' },
];

/** Built-in default world tone — SETTING-NEUTRAL. The LLM prompt falls back to this
 *  only when neither an author World-lore override NOR the installed generic default is
 *  present. Authors replace it via an uploaded World lore block. */
export const DEFAULT_WORLD_TONE =
  'Survivors pick through the ruins of a fallen world, where a strange residual power lingers wherever the old world broke.';

/** Default game title shown on the start screen (under the icon). Lore-agnostic;
 *  renamable in the dev console. */
export const DEFAULT_GAME_TITLE = 'Text RPG Engine';
/** Default tagline under the title. Overridden manually in the dev console, or
 *  auto-filled from an uploaded World-lore block's "tagline" field. */
export const DEFAULT_GAME_TAGLINE = 'A procedural text RPG — your world, their story.';

/** The default name for the narrator voice — the entity that talks to the player
 *  and whose voice the TTS speaks. Lore-agnostic: "Narrator" by default, renamable
 *  in the dev console to anything the author wants (e.g. "The Arbiter", "Eldridge",
 *  "DM"). Player-facing UI and the LLM persona read getNarratorName() so a rename
 *  flows everywhere at once. */
export const DEFAULT_NARRATOR_NAME = 'Narrator';

// --- GENERIC DEFAULT PACK -------------------------------------------------------
// engine_Dev — a complete, setting-neutral game that sits BETWEEN the author's
// uploads and the built-in (Tartaria) data. When a section has no override (the
// author skipped it, or RESET wiped it), the resolvers fall to this pack instead of
// Tartaria — so the built-in setting never leaks into someone else's game. It is
// EMPTY until installGenericDefaults() runs (called once at app boot), so unit tests
// — which never install it — still resolve to the Tartaria built-ins they assert
// against. A partial install would be inconsistent, so install all-or-nothing.
interface GenericDefaultPack {
  tables: Partial<Record<ContentTableId, readonly unknown[]>>;
  missions: Partial<Record<MissionTableId, readonly unknown[]>>;
  flavor?: Record<string, unknown>;
  startingAreas?: StartingArea[];
  mainQuest?: { title?: string; steps?: unknown[] };
  bosses?: unknown[];
  collectables?: unknown[];
  digging?: unknown;
  scrap?: unknown;
  salvage?: unknown;
  overlays?: unknown[];
  dogScenarios?: unknown[];
  summons?: { noun?: string; defs: unknown[] };
  whispers?: unknown[];
  hooks?: HooksOverride;
  vendors?: unknown[];
  roadsideTraders?: unknown[];
  wasteland?: Record<string, unknown>;
  /** Generic World-lore block ({ tone?, setting?, terms?, vocabulary?, narrator?, tagline? }). */
  worldLore?: Record<string, unknown>;
  // engine_Dev — identity strings (the loudest leaks: "Tartaria" / narrator / title).
  identity?: { worldName?: string; corruptionName?: string; narratorName?: string; gameTitle?: string };
}
const genericDefaults: GenericDefaultPack = { tables: {}, missions: {} };
let genericDefaultsInstalled = false;
export function installGenericDefaults(pack: GenericDefaultPack): void {
  genericDefaults.tables = pack.tables ?? {};
  genericDefaults.missions = pack.missions ?? {};
  genericDefaults.flavor = pack.flavor;
  genericDefaults.startingAreas = pack.startingAreas;
  genericDefaults.mainQuest = pack.mainQuest;
  genericDefaults.bosses = pack.bosses;
  genericDefaults.collectables = pack.collectables;
  genericDefaults.digging = pack.digging;
  genericDefaults.scrap = pack.scrap;
  genericDefaults.salvage = pack.salvage;
  genericDefaults.overlays = pack.overlays;
  genericDefaults.dogScenarios = pack.dogScenarios;
  genericDefaults.summons = pack.summons;
  genericDefaults.whispers = pack.whispers;
  genericDefaults.hooks = pack.hooks;
  genericDefaults.vendors = pack.vendors;
  genericDefaults.roadsideTraders = pack.roadsideTraders;
  genericDefaults.wasteland = pack.wasteland;
  genericDefaults.worldLore = pack.worldLore;
  genericDefaults.identity = pack.identity;
  genericDefaultsInstalled = true;
}
export function hasGenericDefaults(): boolean { return genericDefaultsInstalled; }
/** Test/host hook — drop the generic pack back out (restores pure Tartaria fallback). */
export function clearGenericDefaults(): void {
  genericDefaults.tables = {};
  genericDefaults.missions = {};
  genericDefaults.flavor = undefined;
  genericDefaults.startingAreas = undefined;
  genericDefaults.mainQuest = undefined;
  genericDefaults.bosses = undefined;
  genericDefaults.collectables = undefined;
  genericDefaults.digging = undefined;
  genericDefaults.scrap = undefined;
  genericDefaults.salvage = undefined;
  genericDefaults.overlays = undefined;
  genericDefaults.dogScenarios = undefined;
  genericDefaults.summons = undefined;
  genericDefaults.whispers = undefined;
  genericDefaults.hooks = undefined;
  genericDefaults.vendors = undefined;
  genericDefaults.roadsideTraders = undefined;
  genericDefaults.wasteland = undefined;
  genericDefaults.worldLore = undefined;
  genericDefaults.identity = undefined;
  genericDefaultsInstalled = false;
}

/** The generic game's named vendors, if the generic pack is installed (else null). The
 *  vendor resolver layers author override → this → Tartaria built-in. */
export function getGenericVendors(): unknown[] | null {
  return genericDefaults.vendors && genericDefaults.vendors.length > 0 ? genericDefaults.vendors : null;
}

/** The generic game's wasteland encounters, if installed (else null). The wasteland
 *  resolver layers author override → this → Tartaria built-in. */
export function getGenericWasteland(): Record<string, unknown> | null {
  return genericDefaults.wasteland && Object.keys(genericDefaults.wasteland).length > 0 ? genericDefaults.wasteland : null;
}

// --- active overrides (module-level; mirrored from the content-pack store) ------
const tableOverrides: Partial<Record<ContentTableId, readonly unknown[]>> = {};
const loreOverrides: Partial<Record<LoreBlockId, unknown>> = {};
let narratorNameOverride: string | null = null;
let gameTitleOverride: string | null = null;
let gameTaglineOverride: string | null = null;
// engine_Dev — the item-fusion feature ("Crucible"). Renamable, or disabled
// entirely, from the dev console. Default name + enabled.
let crucibleNameOverride: string | null = null;
let crucibleEnabled = true;
// engine_Dev — the WORLD NOUN. Built-in narration templates use "Tartaria" as the
// setting's proper noun in dozens of places; a re-skin sets this and appendLog
// swaps the literal so the leak never reaches the player. Default keeps the
// built-in word so the Tartaria game itself is unchanged.
let worldNameOverride: string | null = null;
// engine_Dev — the CORRUPTION / affliction concept. Tartaria's "plague" is named
// Corruption; a re-skin renames it (Phase-Sickness, Chronal Decay, Static-burn …).
let corruptionNameOverride: string | null = null;

/** Rename the game (or null to fall back to "Text RPG Engine"). */
export function setGameTitleOverride(name: string | null): void {
  const t = typeof name === 'string' ? name.trim() : '';
  gameTitleOverride = t.length > 0 ? t : null;
}
export function hasGameTitleOverride(): boolean { return gameTitleOverride != null; }
/** The game's display title — shown under the icon on the start screen. */
export function getGameTitle(): string { return gameTitleOverride ?? genericDefaults.identity?.gameTitle ?? DEFAULT_GAME_TITLE; }

/** Set the tagline manually (or null to fall back to lore / the default). */
export function setGameTaglineOverride(text: string | null): void {
  const t = typeof text === 'string' ? text.trim() : '';
  gameTaglineOverride = t.length > 0 ? t : null;
}
export function hasGameTaglineOverride(): boolean { return gameTaglineOverride != null; }
/** The tagline under the title. Priority: manual override → the uploaded World
 *  lore's "tagline" field (so it auto-updates once a world is described) →
 *  the built-in default. */
export function getGameTagline(): string {
  if (gameTaglineOverride) return gameTaglineOverride;
  const w = loreOverrides.world as { tagline?: unknown } | undefined;
  if (w && typeof w.tagline === 'string' && w.tagline.trim().length > 0) return w.tagline.trim();
  return DEFAULT_GAME_TAGLINE;
}

/** Rename the narrator (or pass null to fall back to "Narrator"). Mirrored from
 *  the content-pack store; persisted so the name survives restarts. */
export function setNarratorNameOverride(name: string | null): void {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  narratorNameOverride = trimmed.length > 0 ? trimmed : null;
}
export function hasNarratorNameOverride(): boolean {
  return narratorNameOverride != null;
}
/** The narrator's display name — "Narrator" by default, or whatever the author
 *  set in the dev console. Read by player-facing UI and the LLM persona. */
export function getNarratorName(): string {
  return narratorNameOverride ?? genericDefaults.identity?.narratorName ?? DEFAULT_NARRATOR_NAME;
}

/** The item-fusion feature's display name — "Crucible" by default, renamable in
 *  the dev console (e.g. "Reality Welder", "The Fold-Forge"). Read by every
 *  player-facing fusion label + narration. */
export const DEFAULT_CRUCIBLE_NAME = 'Crucible';
export function setCrucibleNameOverride(name: string | null): void {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  crucibleNameOverride = trimmed.length > 0 ? trimmed : null;
}
export function hasCrucibleNameOverride(): boolean { return crucibleNameOverride != null; }
export function getCrucibleName(): string { return crucibleNameOverride ?? DEFAULT_CRUCIBLE_NAME; }
/** When false, the fusion feature is OFF: no Crucible chip, no vendor offer, and
 *  the fuse action refuses — for games that don't want item fusion at all. */
export function setCrucibleEnabled(on: boolean): void { crucibleEnabled = on; }
export function isCrucibleEnabled(): boolean { return crucibleEnabled; }

/** engine_Dev — the WORLD NOUN used in built-in narration (default "Tartaria").
 *  A re-skin sets its own (e.g. "the Void", "the Zenith"); appendLog swaps the
 *  literal so no Tartaria leaks into the player's feed. */
export const DEFAULT_WORLD_NAME = 'Tartaria';
export function setWorldNameOverride(name: string | null): void {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  worldNameOverride = trimmed.length > 0 ? trimmed : null;
}
export function hasWorldNameOverride(): boolean { return worldNameOverride != null; }
export function getWorldName(): string { return worldNameOverride ?? genericDefaults.identity?.worldName ?? DEFAULT_WORLD_NAME; }

/** engine_Dev — true when the world has been re-skinned in a way that makes the
 *  BUILT-IN Tartaria main quest (cores / Lost Capitals / phase hints) meaningless:
 *  the locations table was replaced, or the world was renamed. The objective chip
 *  uses this to suppress the hard-coded Tartaria caption when a re-skin has no
 *  custom main quest of its own (it shows a neutral line instead). */
export function isReskinActive(): boolean {
  return hasGenericDefaults()
    || hasTableOverride('locations')
    || hasTableOverride('factions')
    || hasTableOverride('races')
    || hasTableOverride('enemies')
    || worldNameOverride != null;
}

/** engine_Dev — the CORRUPTION / affliction noun (default "Corruption"). A re-skin
 *  renames the plague; appendLog swaps the word everywhere the player reads it. The
 *  tier names (Tainted / Corrupted / Hollowed) can be remapped via world.termMap. */
export const DEFAULT_CORRUPTION_NAME = 'Corruption';
export function setCorruptionNameOverride(name: string | null): void {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  corruptionNameOverride = trimmed.length > 0 ? trimmed : null;
}
export function hasCorruptionNameOverride(): boolean { return corruptionNameOverride != null; }
export function getCorruptionName(): string { return corruptionNameOverride ?? genericDefaults.identity?.corruptionName ?? DEFAULT_CORRUPTION_NAME; }

/** engine_Dev — the affliction TIER names. Built-in are Tainted / Corrupted /
 *  Hollowed; a re-skin sets world.corruptionTiers: { tainted, corrupted, hollowed }
 *  to its own (Phase-touched / Phase-sick / Phase-lost). Falls back to the
 *  capitalized built-in id. */
const DEFAULT_TIER_NAMES: Record<string, string> = { clean: 'Clean', tainted: 'Tainted', corrupted: 'Corrupted', hollowed: 'Hollowed' };
export function getCorruptionTierName(tier: string): string {
  const w = loreOverrides.world as { corruptionTiers?: Record<string, unknown> } | undefined;
  const v = w?.corruptionTiers?.[tier];
  if (typeof v === 'string' && v.trim()) return v.trim();
  return DEFAULT_TIER_NAMES[tier] ?? (tier.charAt(0).toUpperCase() + tier.slice(1));
}

/** engine_Dev — the ENERGY / "magic" concept of the world. The engine's built-in
 *  setting calls it "Aether" (energy), "Aetheric" (adjective), "Aetherstone"
 *  (material). A re-skin defines its own in the World-lore block under `energy`:
 *    "energy": {
 *      "name": "The Fold",            // the energy itself (replaces "Aether")
 *      "adjective": "folded",         // descriptor (replaces "Aetheric")
 *      "material": "Fold-matter",     // its physical source (replaces "Aetherstone")
 *      "verb": "weave",               // how a caster uses it ("weave the Fog")
 *      "caster": "Resonator",         // what a caster is called (vs "mage")
 *      "slang": ["the Static", "Vril", "the Red Shift", "Green Fog", "Slip"],
 *      "factionTerms": { "onr": "Unified-Field Resonance", "ahnenerbe": "Vril" }
 *    }
 *  Lets different factions name the SAME anomalous energy differently. In a crime
 *  game `name` could be "respect" or "power" with street slang in `slang`. */
export interface EnergyConfig {
  name: string;
  adjective: string;
  material: string;
  verb?: string;
  caster?: string;
  slang: string[];
  factionTerms: Record<string, string>;
}
const DEFAULT_ENERGY: EnergyConfig = {
  name: 'Aether', adjective: 'Aetheric', material: 'Aetherstone', slang: [], factionTerms: {},
};
// engine_Dev — for a RE-SKINNED game (world renamed / tables replaced) that never set an
// energy name, fall back to NEUTRAL words instead of the built-in "Aether" family, so
// {energy}/{energy_adj}/{energy_material} tokens don't leak Tartaria. The author should
// still set the Energy/magic name; this just stops the bleed when they don't.
const NEUTRAL_ENERGY: EnergyConfig = {
  name: 'energy', adjective: 'charged', material: 'essence', slang: [], factionTerms: {},
};
// engine_Dev — quick "Energy / magic name" rename, settable as a first-class dev field
// (like world/corruption), without writing the whole World-lore energy block. Wins over
// the World-lore energy.name when set.
let energyNameOverride: string | null = null;
export function setEnergyNameOverride(n: string | null): void {
  const t = (n ?? '').trim();
  energyNameOverride = t.length > 0 ? t : null;
}
export function hasEnergyNameOverride(): boolean { return energyNameOverride != null; }
export function getEnergyNameOverride(): string | null { return energyNameOverride; }
export function hasEnergyOverride(): boolean {
  if (energyNameOverride != null) return true;
  const w = loreOverrides.world as { energy?: unknown } | undefined;
  return !!w && typeof w.energy === 'object' && w.energy !== null;
}
export function getEnergy(): EnergyConfig {
  const w = loreOverrides.world as { energy?: Partial<EnergyConfig> } | undefined;
  const e = w?.energy;
  // Re-skinned game with no energy named → neutral words, not the built-in "Aether".
  const base = isReskinActive() ? NEUTRAL_ENERGY : DEFAULT_ENERGY;
  if ((!e || typeof e !== 'object') && energyNameOverride == null) return base;
  const ee = (e && typeof e === 'object' ? e : {}) as Partial<EnergyConfig>;
  const str = (v: unknown, d: string): string => (typeof v === 'string' && v.trim() ? v.trim() : d);
  return {
    name: energyNameOverride ?? str(ee.name, base.name),
    adjective: str(ee.adjective, base.adjective),
    material: str(ee.material, base.material),
    verb: typeof ee.verb === 'string' ? ee.verb.trim() : undefined,
    caster: typeof ee.caster === 'string' ? ee.caster.trim() : undefined,
    slang: Array.isArray(ee.slang) ? ee.slang.filter((s): s is string => typeof s === 'string' && s.trim().length > 0) : [],
    factionTerms: ee.factionTerms && typeof ee.factionTerms === 'object' ? (ee.factionTerms as Record<string, string>) : {},
  };
}
export function getEnergyName(): string { return getEnergy().name; }
export function getEnergyAdjective(): string { return getEnergy().adjective; }
export function getEnergyMaterial(): string { return getEnergy().material; }
export function getEnergySlang(): string[] { return getEnergy().slang; }
/** The faction's own word for the energy → its factionTerms entry, else the
 *  canonical name. Lets narration scoped to a faction use that faction's term. */
export function energyTermForFaction(factionId?: string | null): string {
  const e = getEnergy();
  const t = factionId ? e.factionTerms[factionId] : undefined;
  return t && t.trim() ? t : e.name;
}

/** engine_Dev — scrub built-in Tartaria leaks from a feed line. Runs in appendLog
 *  (every line passes through it) so the dozens of hard-coded template strings that
 *  name "Tartaria" or the role-words "the Arbiter" / "the Narrator" are rewritten
 *  to the author's world name and narrator name. Both halves are gated on an
 *  override being set, so the built-in Tartaria game is untouched. */
export function dressBuiltInLeaks(text: string): string {
  if (!text) return text;
  let out = text;
  // Role-word narrator → the chosen name. Built-in combat/ambient templates print
  // "The Narrator" / "the Arbiter" literally instead of the configured name.
  if (hasNarratorNameOverride()) {
    const name = getNarratorName();
    if (name && !/^the\s/i.test(name)) {
      out = out.replace(/\b[Tt]he (?:Arbiter|Narrator)\b/g, name);
    }
  }
  // World noun → the chosen world name. Covers the whole word family — the proper
  // noun "Tartaria" AND the adjective "Tartarian"/"Tartarians" (the OTA-705 version
  // missed the adjective). The adjective maps to "<world> " so "Tartarian stone" →
  // "the Void stone"; tidy enough, and the term map below can refine it.
  if (hasWorldNameOverride()) {
    const w = getWorldName();
    out = out.replace(/\bTartarians\b/g, w).replace(/\bTartarian\b/g, w).replace(/\bTartaria\b/g, w);
  }
  // engine_Dev — the ENERGY / "magic" concept. Built-in narration names it "Aether"
  // (the energy), "Aetheric" (adjective) and "Aetherstone" (its material). A re-skin
  // sets world.energy and the whole family is rewritten — so "the magic" reads as
  // The Fold / Vril / the Static / broken physics instead of fantasy Aether. Gated
  // on an override so the built-in game is unchanged; a re-skin that uploads its own
  // materials won't have "Aetherstone <X>" items to desync against.
  if (hasEnergyOverride()) {
    const e = getEnergy();
    // Case-preserving (like the corruption swap below) so the family is caught in
    // BOTH proper-noun text AND lowercase mechanical lines — e.g. a weapon's
    // "aetheric damage" reads as your energy adjective, not a leaked "aetheric".
    out = out.replace(/\bAetherstone\b/g, e.material).replace(/\baetherstone\b/g, e.material.toLowerCase())
      .replace(/\bAetheric\b/g, e.adjective).replace(/\baetheric\b/g, e.adjective.toLowerCase())
      .replace(/\bAether\b/g, e.name).replace(/\baether\b/g, e.name.toLowerCase());
  }
  // engine_Dev — the affliction noun. "corruption" / "Corruption" → the re-skin's
  // name for its plague (Phase-Sickness, Chronal Decay, …). Case-preserving so a
  // sentence-start "Corruption" stays capitalized.
  if (hasCorruptionNameOverride()) {
    const c = getCorruptionName();
    out = out.replace(/\bCorruption\b/g, c).replace(/\bcorruption\b/g, c.toLowerCase());
  }
  // engine_Dev — the CATCHALL term map. The author supplies world.termMap in the
  // World-lore block: { "Reclaimers": "operatives", "Aetherstone": "the Anomaly", … }.
  // Every key is rewritten to its value across ALL feed text (pools, one-off
  // narration, and dynamic/LLM lines) so any setting-specific noun the built-in
  // flavor still names can be re-skinned from JSON without touching engine code.
  // Applied longest-key-first so multi-word terms win over their substrings.
  out = applyTermMap(out);
  // engine_Dev — collapse a doubled article left by swapping a word into a name that
  // itself starts with "the" (e.g. "the Aether" → "the The Fold" → "the Fold").
  out = out.replace(/\b([Tt]he)\s+[Tt]he\b/g, '$1');
  return out;
}

/** Read the author's term map from the World-lore block (world.termMap) and apply
 *  it, longest key first, on word boundaries. No-op when unset. Cached by identity
 *  of the world override object so we don't rebuild the sorted list every call. */
let _termMapSrc: unknown = undefined;
let _termMapEntries: Array<[RegExp, string]> = [];
function applyTermMap(text: string): string {
  const world = loreOverrides.world as { termMap?: Record<string, string> } | undefined;
  const map = world?.termMap;
  if (!map || typeof map !== 'object') return text;
  if (map !== _termMapSrc) {
    _termMapSrc = map;
    _termMapEntries = Object.entries(map)
      .filter(([k, v]) => k && typeof v === 'string')
      .sort((a, b) => b[0].length - a[0].length)
      .map(([k, v]) => [new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), v] as [RegExp, string]);
  }
  if (_termMapEntries.length === 0) return text;
  let out = text;
  for (const [re, v] of _termMapEntries) out = out.replace(re, v);
  return out;
}

/** Fix the grammar when the narrator carries a PROPER NAME instead of a role.
 *  Built-in narration is written for role-words ("the Narrator looks up", "the
 *  Arbiter's voice"), which read wrong once the author renames the narrator to a
 *  person ("the Bob looks up"). When a name override is active, strip the leading
 *  article off occurrences of the name — "The Bob" → "Bob", "the Bob's" → "Bob's"
 *  — and leave the default role-word narrator untouched. No-op when no override is
 *  set or the text doesn't mention the name. */
export function dressNarratorArticles(text: string): string {
  if (!text || !hasNarratorNameOverride()) return text;
  const name = getNarratorName();
  if (!name || /^(the\s)/i.test(name)) return text; // author kept an article in the name
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "The Bob" / "the Bob" (followed by 's, whitespace, or punctuation) → "Bob"
  return text.replace(new RegExp(`\\b[Tt]he\\s+(${esc})\\b`, 'g'), '$1');
}

/** engine_Dev — author-callable placeholders. So a re-skinned game never has to
 *  hard-code the narrator/guide name or the fusion-feature name into its uploaded
 *  JSON, the author drops a token into ANY content string (mission `arbiter`/
 *  `narration` lines, whisper plant/meet lines, hook lines, wasteland narration,
 *  flavor pools, lore, …) and the engine substitutes the chosen name at render
 *  time. Tokens (case-insensitive):
 *    {narrator} / {arbiter} / {guide}  → the narrator name (getNarratorName)
 *    {crucible} / {fuse} / {forge}     → the fusion-feature name (getCrucibleName)
 *    {title} / {game}                  → the game title (getGameTitle)
 *  Applied centrally in appendLog (every feed line passes through it), so a token
 *  works anywhere authored text reaches the player. No-op for strings with no `{`. */
export function fillContentPlaceholders(text: string): string {
  if (!text || text.indexOf('{') === -1) return text;
  return text
    .replace(/\{(?:narrator|arbiter|guide)\}/gi, getNarratorName())
    .replace(/\{(?:crucible|fuse|forge)\}/gi, getCrucibleName())
    .replace(/\{(?:title|game)\}/gi, getGameTitle())
    .replace(/\{(?:world|setting)\}/gi, getWorldName())
    .replace(/\{(?:energy|aether)\}/gi, getEnergyName())
    .replace(/\{(?:energy_adj|aetheric)\}/gi, getEnergyAdjective())
    .replace(/\{(?:energy_material|aetherstone)\}/gi, getEnergyMaterial())
    .replace(/\{(?:corruption|affliction|plague)\}/gi, getCorruptionName());
}

export function setTableOverride(id: ContentTableId, rows: readonly unknown[] | null): void {
  if (rows && rows.length > 0) tableOverrides[id] = rows;
  else delete tableOverrides[id];
}
export function hasTableOverride(id: ContentTableId): boolean {
  const ov = tableOverrides[id];
  return Array.isArray(ov) && ov.length > 0;
}
/** The RAW author upload for a table (ignores generic defaults + built-in). null when
 *  the author hasn't loaded one. Used where we want ONLY the author's loaded content. */
export function getTableOverride(id: ContentTableId): readonly unknown[] | null {
  const ov = tableOverrides[id];
  return Array.isArray(ov) && ov.length > 0 ? ov : null;
}
export function tableOverrideCount(id: ContentTableId): number {
  return tableOverrides[id]?.length ?? 0;
}
/** Engine modules pass their built-in table; if an override is loaded it wins. */
export function resolveTable<T>(id: ContentTableId, builtin: readonly T[]): readonly T[] {
  const ov = tableOverrides[id];
  if (ov && ov.length > 0) return ov as readonly T[];
  const gd = genericDefaults.tables[id];
  return gd && gd.length > 0 ? (gd as readonly T[]) : builtin;
}

export function setLoreOverride(id: LoreBlockId, value: unknown | null): void {
  if (value == null) delete loreOverrides[id];
  else loreOverrides[id] = value;
}
export function hasLoreOverride(id: LoreBlockId): boolean {
  return loreOverrides[id] != null;
}
/** True when a World-lore block is active — author override OR the installed generic
 *  default. Gates world setting/terms/vocabulary injection so the GENERIC game's world
 *  lore is used (the author-override-only hasLoreOverride('world') would miss it). */
export function hasWorldLore(): boolean {
  return resolveWorldBlock() != null;
}
export function getLoreOverride(id: LoreBlockId): unknown | null {
  return loreOverrides[id] ?? null;
}

// --- missions override ----------------------------------------------------------
// engine_Dev — MISSIONS are uploaded as ONE object whose keys are the mission sub-
// tables (hunts / mysteries / factionQuests / storylines + the procedural-lead
// seeds objectives / complications / rewards). Stored together because they're
// authored as one set; resolved per sub-table at the engine's consumption sites so
// an uploaded set replaces the built-in Tartaria quests.
export type MissionTableId =
  | 'hunts' | 'mysteries' | 'factionQuests' | 'storylines'
  | 'objectives' | 'complications' | 'rewards';
const missionOverrides: Partial<Record<MissionTableId, readonly unknown[]>> = {};
/** Replace the whole mission set (pass null to clear). Only non-empty arrays win;
 *  any sub-table the author omits keeps its built-in default. */
export function setMissionsOverride(obj: Partial<Record<MissionTableId, readonly unknown[]>> | null): void {
  for (const k of Object.keys(missionOverrides)) delete missionOverrides[k as MissionTableId];
  if (obj) {
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v) && v.length > 0) missionOverrides[k as MissionTableId] = v;
    }
  }
}
export function hasMissionsOverride(): boolean {
  return Object.keys(missionOverrides).length > 0;
}
export function missionOverrideCount(id: MissionTableId): number {
  return missionOverrides[id]?.length ?? 0;
}
/** Engine mission modules pass their built-in array; an uploaded sub-table wins. */
export function resolveMissions<T>(id: MissionTableId, builtin: readonly T[]): readonly T[] {
  const ov = missionOverrides[id];
  if (ov && ov.length > 0) return ov as readonly T[];
  const gd = genericDefaults.missions[id];
  return gd && gd.length > 0 ? (gd as readonly T[]) : builtin;
}

// --- hooks override -------------------------------------------------------------
// engine_Dev — HOOKS (atmospheric multi-stage leads) are uploaded as ONE object:
//   { plants: { <kind>: [{ line, nouns }] }, chains: { <kind>: [HookOutcome] },
//     weights?: { <kind>: number }, indoor?: [<kind>] }
// `plants` are the discovery lines + matchable nouns; `chains` are the staged
// outcomes (each stage a list of effect verbs). An uploaded set replaces the
// built-in Tartaria hooks wholesale.
export interface HooksOverride {
  plants?: Record<string, { line: string; nouns: string[] }[]>;
  chains?: Record<string, unknown[]>;
  weights?: Record<string, number>;
  indoor?: string[];
}
let hooksOverride: HooksOverride | null = null;
export function setHooksOverride(obj: HooksOverride | null): void {
  const hasPlants = obj?.plants && Object.keys(obj.plants).length > 0;
  const hasChains = obj?.chains && Object.keys(obj.chains).length > 0;
  hooksOverride = (hasPlants || hasChains) ? obj : null;
}
export function hasHooksOverride(): boolean { return hooksOverride != null; }
export function getHooksOverride(): HooksOverride | null { return hooksOverride; }
/** engine_Dev — the installed generic-default hooks (neutral "the Reaches" leads). The
 *  hooks layer is author override → generic default → built-in Tartaria, mirroring whispers,
 *  so the stock generic game never falls back to the Tartaria-flavored built-in hook pool. */
export function getGenericHooks(): HooksOverride | null { return genericDefaults.hooks ?? null; }

// --- custom titles override -----------------------------------------------------
// engine_Dev — IMPORTABLE TITLES. An uploaded array of title defs, each tying a
// trackable variable + threshold to a display name (see customTitles.ts). null when
// no override is loaded (the built-in WIRED_TITLES still apply alongside).
let customTitlesOverride: unknown[] | null = null;
export function setCustomTitlesOverride(rows: readonly unknown[] | null): void {
  customTitlesOverride = rows && rows.length > 0 ? (rows as unknown[]) : null;
}
export function hasCustomTitlesOverride(): boolean { return customTitlesOverride != null; }
export function getCustomTitles(): unknown[] { return customTitlesOverride ?? []; }

// --- custom main quest override -------------------------------------------------
// engine_Dev — a DATA-DRIVEN main quest: an ordered list of objective steps, each
// { action, target, locationId, reward? }, built line-by-line in the dev console.
// null = the built-in main quest. Shape lives in customMainQuest.ts.
let customMainQuestOverride: { title?: string; steps?: unknown[] } | null = null;
export function setCustomMainQuestOverride(obj: { title?: string; steps?: unknown[] } | null): void {
  customMainQuestOverride = obj && Array.isArray(obj.steps) && obj.steps.length > 0 ? obj : null;
}
export function hasCustomMainQuestOverride(): boolean { return customMainQuestOverride != null; }
export function getCustomMainQuest(): { title?: string; steps?: unknown[] } | null { return customMainQuestOverride ?? genericDefaults.mainQuest ?? null; }
/** engine_Dev — a DATA-DRIVEN main quest exists (an uploaded one OR the generic-
 *  default pack's). When true, the engine runs THAT quest (customMainQuestEngine)
 *  and the legacy built-in Tartaria main quest + Core Guardians are disabled. At
 *  runtime a quest is always present (generic defaults install at boot), so the
 *  built-in path only "runs" in unit tests that install nothing — i.e. it's dead
 *  in every real game. The hardcoded built-in quest is slated for removal. */
export function hasAnyMainQuest(): boolean { return getCustomMainQuest() != null; }

// --- custom bosses override -----------------------------------------------------
// engine_Dev — named, faction-affiliated bosses with stats / loot / quest item /
// spawn rules. Shape lives in customBosses.ts. null = none.
let customBossesOverride: unknown[] | null = null;
export function setCustomBossesOverride(rows: readonly unknown[] | null): void {
  customBossesOverride = rows && rows.length > 0 ? (rows as unknown[]) : null;
}
export function hasCustomBossesOverride(): boolean { return customBossesOverride != null; }
export function getCustomBosses(): unknown[] { return customBossesOverride ?? genericDefaults.bosses ?? []; }

// --- collectables override -------------------------------------------------------
// engine_Dev — character-story COLLECTABLES (note/letter/journal fragments the
// player finds as loot). Uploaded as an array of stories; null = built-in.
let collectablesOverride: unknown[] | null = null;
export function setCollectablesOverride(rows: readonly unknown[] | null): void {
  collectablesOverride = rows && rows.length > 0 ? (rows as unknown[]) : null;
}
export function hasCollectablesOverride(): boolean { return collectablesOverride != null; }
export function getCollectablesOverride(): unknown[] | null { return collectablesOverride ?? genericDefaults.collectables ?? null; }

// --- summons override ----------------------------------------------------------
// engine_Dev — SUMMONED SIDEKICKS (the golem family). An uploaded pack replaces
// the built-in golems wholesale and may rename the category noun ("automaton",
// "construct", …). Shape: { noun?: string, defs: SidekickDefinition[] }. null =
// built-in golems. Resolved by golems.ts resolveSidekickDefs()/getSummonNoun().
import type { SidekickDefinition } from './sidekicks';
let summonsOverride: { noun?: string; defs: SidekickDefinition[] } | null = null;
export function setSummonsOverride(payload: { noun?: string; defs: readonly unknown[] } | null): void {
  // The store validates/normalizes each def before this point; we trust the shape.
  summonsOverride = payload && Array.isArray(payload.defs) && payload.defs.length > 0
    ? { noun: payload.noun, defs: payload.defs as SidekickDefinition[] }
    : null;
}
export function hasSummonsOverride(): boolean { return summonsOverride != null; }
export function getSummonsOverride(): { noun?: string; defs: SidekickDefinition[] } | null { return summonsOverride; }
/** The live summon set: the author's uploaded pack if present, else the generic
 *  default pack's sidekicks, else null (golems.ts then falls to its built-in).
 *  Lets a reskin that skips the SUMMONED SIDEKICKS box fall to generic sidekicks
 *  rather than the Tartaria golems. */
export function resolveSummons(): { noun?: string; defs: SidekickDefinition[] } | null {
  if (summonsOverride != null) return summonsOverride;
  const g = genericDefaults.summons;
  if (g && Array.isArray(g.defs) && g.defs.length > 0) {
    return { noun: g.noun, defs: g.defs as SidekickDefinition[] };
  }
  return null;
}

// --- dog companion toggle ------------------------------------------------------
// engine_Dev — the rescuable DOG sidekick is on by default (Tartaria keeps it).
// A reskin can switch it OFF in the dev console; when off, dog-rescue scenarios
// never fire and the dog never enters play. Existing saved dogs are untouched.
let dogEnabled = true;
export function setDogEnabled(on: boolean): void { dogEnabled = on !== false; }
export function isDogEnabled(): boolean { return dogEnabled; }

// engine_Dev — VENDORS on/off + merge mode. vendorsEnabled false → no vendors spawn
// at all (hub, capital, or roadside). vendorsAppendGeneric controls what happens when
// the author UPLOADS a vendors override: false (default) = the upload REPLACES the
// generic storefront; true = the upload is ADDED alongside the five data-driven
// generic vendors. With no upload, a custom game gets the generic storefront.
let vendorsEnabled = true;
export function setVendorsEnabled(on: boolean): void { vendorsEnabled = on !== false; }
export function isVendorsEnabled(): boolean { return vendorsEnabled; }
let vendorsAppendGeneric = false;
export function setVendorsAppendGeneric(on: boolean): void { vendorsAppendGeneric = on === true; }
export function isVendorsAppendGeneric(): boolean { return vendorsAppendGeneric; }

// engine_Dev — WEATHER on/off. When false, scenes get no weather: no atmosphere line,
// no travel/visibility/stat/tick effects. Lets an author run a setting where weather
// isn't a mechanic without deleting their weather table. Default on.
let weatherEnabled = true;
export function setWeatherEnabled(on: boolean): void { weatherEnabled = on !== false; }
export function isWeatherEnabled(): boolean { return weatherEnabled; }

// engine_Dev — global gate: the player must be at least this % (0..100) through the
// data-driven main mission before SIDEKICK WEAPONS (golem_weapon recipes) can be
// crafted. 0 = no gate. Authored in the Sidekicks box; read by the craft handler.
let sidekickWeaponQuestPct = 0;
export function setSidekickWeaponQuestPct(pct: number): void {
  sidekickWeaponQuestPct = Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
}
export function getSidekickWeaponQuestPct(): number { return sidekickWeaponQuestPct; }

// --- damage types (EXTRA, author-added) ----------------------------------------
// engine_Dev — the engine ships 10 built-in damage types (bludgeoning, slashing,
// piercing, burn, electrical, poison, radiation, stun, degradation, aetheric). An
// author can ADD their own (e.g. "frost", "sonic") here; each extra type carries
// optional keyword aliases so the engine can infer it from a bare attack string,
// and an optional ON-HIT stat effect: when a creature is HIT by this type, the
// listed stat mods apply to the VICTIM for `onHitRounds` rounds (e.g. "cucumber"
// -> target −2 INT for 3 rounds). Extends (never removes) the built-ins.
export interface DamageStatMod { stat: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma' | 'stealth'; amount: number }
/** engine_Dev — a damage type's COMBAT effect when a weapon deals it (mirrors how
 *  Tartaria's coatings behave, but configurable). `mode` = 'on_hit' (immediate bonus
 *  damage) or 'dot' (ticks `dice` per round for `rounds`). The proc is GATED by an
 *  apply chance: baseChance, raised by weakBonus when the target is weak to the type,
 *  lowered by strongPenalty when strong. Defaults: base 0.7, weak +0.25, strong −0.25. */
export interface DamageCombatEffect {
  mode: 'on_hit' | 'dot';
  dice?: string;
  rounds?: number;
  baseChance?: number;
  weakBonus?: number;
  strongPenalty?: number;
}
export interface ExtraDamageType { name: string; keywords?: string[]; onHit?: DamageStatMod[]; onHitRounds?: number; combat?: DamageCombatEffect }
// engine_Dev — DEFAULT combat behavior for the BUILT-IN damage types, so a game on the built-in
// catalog (Tartaria + any reskin that doesn't author its own damageTypes) gets the same
// bidirectional typed-damage procs + onHit debuffs an author-defined type gets. An uploaded
// damageTypes entry for the same name OVERRIDES this (author wins). Conservative starting values;
// tuned by the balancing pass.
const BUILTIN_DT_DEFAULTS: Record<string, { combat?: DamageCombatEffect; onHit?: DamageStatMod[]; onHitRounds?: number }> = {
  piercing:    { combat: { mode: 'on_hit', dice: '1d4', baseChance: 0.5, weakBonus: 0.2, strongPenalty: 0.2 } },
  slashing:    { combat: { mode: 'on_hit', dice: '1d4', baseChance: 0.5, weakBonus: 0.2, strongPenalty: 0.2 } },
  bludgeoning: { combat: { mode: 'on_hit', dice: '1d4', baseChance: 0.5, weakBonus: 0.2, strongPenalty: 0.2 }, onHit: [{ stat: 'dexterity', amount: -1 }], onHitRounds: 2 },
  burn:        { combat: { mode: 'dot', dice: '1d4', rounds: 2, baseChance: 0.45, weakBonus: 0.2, strongPenalty: 0.3 } },
  electrical:  { combat: { mode: 'on_hit', dice: '1d4', baseChance: 0.45, weakBonus: 0.3, strongPenalty: 0.3 }, onHit: [{ stat: 'strength', amount: -1 }], onHitRounds: 2 },
  poison:      { combat: { mode: 'dot', dice: '1d4', rounds: 2, baseChance: 0.45, weakBonus: 0.2, strongPenalty: 0.3 } },
  radiation:   { combat: { mode: 'dot', dice: '1d4', rounds: 3, baseChance: 0.45, weakBonus: 0.2, strongPenalty: 0.4 } },
  stun:        { combat: { mode: 'on_hit', dice: '1d4', baseChance: 0.4, weakBonus: 0.2, strongPenalty: 0.2 }, onHit: [{ stat: 'dexterity', amount: -2 }], onHitRounds: 2 },
  degradation: { combat: { mode: 'on_hit', dice: '1d4', baseChance: 0.5, weakBonus: 0.2, strongPenalty: 0.2 } },
  aetheric:    { combat: { mode: 'on_hit', dice: '1d4', baseChance: 0.45, weakBonus: 0.3, strongPenalty: 0.3 }, onHit: [{ stat: 'dexterity', amount: -2 }], onHitRounds: 1 },
};
// Off-catalog type words that appear in built-in content → mapped to the closest real type so they
// stop being inert. force/psychic read as "otherworldly energy" → aetheric; common spelling variants.
const DT_ALIAS: Record<string, string> = { force: 'aetheric', psychic: 'aetheric', frost: 'cold', shock: 'electrical' };
/** Normalize a damage-type word: lowercased, with off-catalog aliases mapped to a real type. */
export function canonicalDamageType(name: string | null | undefined): string {
  const lc = (name ?? '').toLowerCase();
  return DT_ALIAS[lc] ?? lc;
}

/** The combat effect for a damage type: author override → built-in default → null. */
export function getDamageTypeCombat(typeName: string | null | undefined): DamageCombatEffect | null {
  if (!typeName) return null;
  const lc = canonicalDamageType(typeName);
  const t = getExtraDamageTypes().find((e) => e.name.toLowerCase() === lc);
  if (t?.combat) return t.combat; // author-uploaded type wins
  return BUILTIN_DT_DEFAULTS[lc]?.combat ?? null;
}
/** The apply chance (0..1) for a combat effect against a target with the given
 *  weak/strong relationship to the type. `match`: 'weak' raises it, 'resist' lowers
 *  it, 'normal' leaves the base. Author values override the defaults. */
export function damageTypeApplyChance(cfg: DamageCombatEffect, match: 'weak' | 'resist' | 'normal'): number {
  const base = cfg.baseChance ?? 0.7;
  const weak = cfg.weakBonus ?? 0.25;
  const strong = cfg.strongPenalty ?? 0.25;
  const c = base + (match === 'weak' ? weak : match === 'resist' ? -strong : 0);
  return Math.max(0, Math.min(1, c));
}
/** The on-hit stat effect for a damage type, or null when none (built-in types
 *  carry no stat effect). Resolved against the author's uploaded damage types. */
export function getDamageTypeOnHit(typeName: string | null | undefined): { mods: DamageStatMod[]; rounds: number } | null {
  if (!typeName) return null;
  const lc = canonicalDamageType(typeName);
  const t = getExtraDamageTypes().find((e) => e.name.toLowerCase() === lc);
  if (t && Array.isArray(t.onHit) && t.onHit.length > 0) return { mods: t.onHit, rounds: Math.max(1, t.onHitRounds ?? 3) };
  const d = BUILTIN_DT_DEFAULTS[lc]; // built-in default debuff (author types with no onHit fall through to null)
  if (d?.onHit && d.onHit.length > 0) return { mods: d.onHit, rounds: Math.max(1, d.onHitRounds ?? 3) };
  return null;
}
let damageTypesOverride: ExtraDamageType[] | null = null;
export function setDamageTypesOverride(rows: readonly ExtraDamageType[] | null): void {
  damageTypesOverride = rows && rows.length > 0 ? (rows as ExtraDamageType[]) : null;
}
export function hasDamageTypesOverride(): boolean { return damageTypesOverride != null; }
export function getExtraDamageTypes(): ExtraDamageType[] { return damageTypesOverride ?? []; }

// --- enemy type resistances (REPLACES the built-in map) ------------------------
// engine_Dev — which damage types each ENEMY TYPE resists / is weak to. Built-in
// keys are Tartaria enemy types (Mud Creature, Automation, …) — meaningless for a
// re-skin, whose enemies have their own type strings. Upload a map keyed by YOUR
// enemy types; null = built-in. Read via crafting.ts resolveTypeResistances().
export type ResistanceMap = Record<string, { resist: string[]; weak: string[] }>;
let damageResistancesOverride: ResistanceMap | null = null;
export function setDamageResistancesOverride(map: ResistanceMap | null): void {
  damageResistancesOverride = map && Object.keys(map).length > 0 ? map : null;
}
export function hasDamageResistancesOverride(): boolean { return damageResistancesOverride != null; }
export function getDamageResistancesOverride(): ResistanceMap | null { return damageResistancesOverride; }

// --- fusion material tags (EXTENDS the built-in whitelist) ----------------------
// engine_Dev — the Crucible needs inputs spanning ≥3 DIFFERENT material tags. The
// built-in whitelist is Tartaria-flavored (metal/aether/mudstone/…). An author adds
// their own tag words so their items' tags count toward fusion diversity. Extends
// the built-in set. Read via itemFusion.ts.
let fusionTagsOverride: string[] | null = null;
export function setFusionTagsOverride(tags: readonly string[] | null): void {
  fusionTagsOverride = tags && tags.length > 0 ? tags.map((t) => String(t).toLowerCase()) : null;
}
export function hasFusionTagsOverride(): boolean { return fusionTagsOverride != null; }
export function getFusionTagsOverride(): string[] { return fusionTagsOverride ?? []; }

// --- weapon coatings (RENAME the built-in five) --------------------------------
// engine_Dev — the five coating MECHANICS (poison=DOT, acid=DOT+armor-shred,
// corruption=DOT+stacks, electrical, burn) stay wired into combat; this override
// only RENAMES them (label/blurb/loot label) so a re-skin reads "Brine" / "Phase-
// rot" instead of "Acid" / "Corruption". Keyed by mechanic; null = built-in names.
export interface CoatingSkin {
  label?: string;
  blurb?: string;
  lootLabel?: string;
  // engine_Dev — fields below define a CUSTOM coating (a key beyond the built-in
  // five). `family` = which built-in BEHAVIOR it reuses in combat (poison = pure
  // DOT, acid = DOT+shred, corruption = DOT+stacks, electrical/burn = elemental
  // on-hit). `damageType` = what it counts as for resistances AND what resist it
  // grants when worked into armor (e.g. 'cold' for a Frost coating). `dice` = its
  // on-hit roll (default 1d4). Built-in five ignore these.
  family?: 'poison' | 'acid' | 'corruption' | 'electrical' | 'burn';
  damageType?: string;
  dice?: string;
}
// engine_Dev — keyed by coating id. The built-in five may be RENAMED (label/blurb/
// lootLabel); any OTHER key defines a NEW custom coating (family + damageType).
export type CoatingSkinMap = Record<string, CoatingSkin>;
let coatingsOverride: CoatingSkinMap | null = null;
export function setCoatingsOverride(map: CoatingSkinMap | null): void {
  coatingsOverride = map && Object.keys(map).length > 0 ? map : null;
}
export function hasCoatingsOverride(): boolean { return coatingsOverride != null; }
export function getCoatingsOverride(): CoatingSkinMap | null { return coatingsOverride; }

// --- digging config (dig-tool scores + dig loot table) -------------------------
// engine_Dev — the DIGGING subsystem's data: which items/tags dig well, how many
// productive digs a wild tile yields, and the dig loot table. Author-uploadable
// (was hardcoded in digging.ts). Resolved override → generic default → built-in.
let diggingOverride: unknown | null = null;
export function setDiggingOverride(o: unknown | null): void {
  diggingOverride = o && typeof o === 'object' && !Array.isArray(o) ? o : null;
}
export function hasDiggingOverride(): boolean { return diggingOverride != null; }
export function getDiggingOverride(): unknown | null { return diggingOverride; }
/** override → generic default → built-in (the JSON passed by digging.ts). */
export function resolveDigging<T>(builtin: T): T {
  if (diggingOverride != null) return diggingOverride as T;
  if (genericDefaults.digging != null) return genericDefaults.digging as T;
  return builtin;
}

// --- scrap config (item-scrap material roles + failure lines) ------------------
// engine_Dev — the SCRAP subsystem's data: which material each tag-ROLE yields,
// raw-mat guards, premium mats (stripped from self-crafted scrap), and failure
// narration. The tag→material RULES stay in scrapEngine.ts. Author-uploadable.
let scrapOverride: unknown | null = null;
export function setScrapOverride(o: unknown | null): void {
  scrapOverride = o && typeof o === 'object' && !Array.isArray(o) ? o : null;
}
export function hasScrapOverride(): boolean { return scrapOverride != null; }
export function getScrapOverride(): unknown | null { return scrapOverride; }
export function resolveScrap<T>(builtin: T): T {
  if (scrapOverride != null) return scrapOverride as T;
  if (genericDefaults.scrap != null) return genericDefaults.scrap as T;
  return builtin;
}

// --- salvage pools (per-noun salvage outcome pools) ----------------------------
// engine_Dev — the SALVAGE subsystem's data: per-noun outcome pools + junk fallback
// + flavor lines. The match/pick RULES stay in salvagePools.ts. Author-uploadable.
let salvageOverride: unknown | null = null;
export function setSalvageOverride(o: unknown | null): void {
  salvageOverride = o && typeof o === 'object' && !Array.isArray(o) ? o : null;
}
export function hasSalvageOverride(): boolean { return salvageOverride != null; }
export function getSalvageOverride(): unknown | null { return salvageOverride; }
export function resolveSalvage<T>(builtin: T): T {
  if (salvageOverride != null) return salvageOverride as T;
  if (genericDefaults.salvage != null) return genericDefaults.salvage as T;
  return builtin;
}

// --- elevated overlays (climb-apex mini-scenes) --------------------------------
// engine_Dev — the OVERLAY templates surfaced at the top of a tall climb (a nook,
// a vantage trader, a lookout, an encounter). Author-uploadable array; the roll +
// scene-build RULES stay in elevatedOverlay.ts.
let overlaysOverride: unknown[] | null = null;
export function setOverlaysOverride(rows: readonly unknown[] | null): void {
  overlaysOverride = rows && rows.length > 0 ? (rows as unknown[]) : null;
}
export function hasOverlaysOverride(): boolean { return overlaysOverride != null; }
export function getOverlaysOverride(): unknown[] | null { return overlaysOverride; }
export function resolveOverlays<T>(builtin: readonly T[]): readonly T[] {
  if (overlaysOverride != null) return overlaysOverride as readonly T[];
  if (genericDefaults.overlays != null) return genericDefaults.overlays as readonly T[];
  return builtin;
}

// --- dog-rescue scenarios (the "dog hook" wording) -----------------------------
// engine_Dev — the WORDING of the dog-acquisition rescue scenarios (hook nouns,
// captor names/factions, intro + victory lines, breed seed). The firing MECHANIC
// (one dog per save; tap a hookNoun -> faction-neutral captor -> onboarding) stays
// in the store + dogCompanion.ts. Author-uploadable array; null = built-in.
let dogScenariosOverride: unknown[] | null = null;
export function setDogScenariosOverride(rows: readonly unknown[] | null): void {
  dogScenariosOverride = rows && rows.length > 0 ? (rows as unknown[]) : null;
}
export function hasDogScenariosOverride(): boolean { return dogScenariosOverride != null; }
export function getDogScenariosOverride(): unknown[] | null { return dogScenariosOverride; }
export function resolveDogScenarios<T>(builtin: readonly T[]): readonly T[] {
  if (dogScenariosOverride != null) return dogScenariosOverride as readonly T[];
  if (genericDefaults.dogScenarios != null) return genericDefaults.dogScenarios as readonly T[];
  return builtin;
}

// --- inventory presentation (category labels + tool tags) ----------------------
// engine_Dev — RENAME the inventory category sections (Weapons -> Arsenal, Loot ->
// Salvage, …) and EXTEND the tool-tag list (which item tags read as "Tools"). The
// category IDS and order stay engine-fixed (they map to item kinds); only the
// player-facing labels + the tool-tag membership are data-driven. null = built-in.
export interface InventoryOverride { labels?: Record<string, string>; toolTags?: string[]; repairMaterialPct?: number }
let inventoryOverride: InventoryOverride | null = null;
export function setInventoryOverride(o: InventoryOverride | null): void {
  inventoryOverride = o && ((o.labels && Object.keys(o.labels).length > 0) || (o.toolTags && o.toolTags.length > 0) || typeof o.repairMaterialPct === 'number') ? o : null;
}
export function hasInventoryOverride(): boolean { return inventoryOverride != null; }
export function getInventoryOverride(): InventoryOverride | null { return inventoryOverride; }
/** The display label for an inventory category — the author's rename if set, else
 *  the built-in default. */
export function getInventoryLabel(categoryId: string, dflt: string): string {
  const l = inventoryOverride?.labels?.[categoryId];
  return typeof l === 'string' && l.trim() ? l : dflt;
}
/** Author-added tool tags (lowercased), extending the built-in tool-tag list. */
export function getExtraToolTags(): string[] {
  return (inventoryOverride?.toolTags ?? []).map((t) => String(t).toLowerCase());
}
/** The repair MATERIAL cost as a fraction of the item's scrap yield. Built-in is
 *  2.0 (200% — repair costs twice what breaking it down returns). Author sets
 *  repairMaterialPct (a percent, e.g. 150) to make repairs cheaper/dearer. */
export function getRepairMaterialFactor(): number {
  const pct = inventoryOverride?.repairMaterialPct;
  return typeof pct === 'number' && pct >= 0 ? pct / 100 : 2;
}

// --- whispers override ----------------------------------------------------------
// engine_Dev — WHISPERS (overheard NPC tips that plant a lead) are uploaded as an
// ARRAY of chain definitions. An authored chain plants at a hub room, points to a
// nearby tile in a time window, and pays off (meetLine + meetEffects) when the
// player arrives. An uploaded set replaces the built-in Tartaria whispers.
let whispersOverride: readonly unknown[] | null = null;
export function setWhispersOverride(rows: readonly unknown[] | null): void {
  whispersOverride = rows && rows.length > 0 ? rows : null;
}
export function hasWhispersOverride(): boolean { return whispersOverride != null; }
export function resolveWhispers<T>(builtin: readonly T[]): readonly T[] {
  if (whispersOverride && whispersOverride.length > 0) return whispersOverride as readonly T[];
  // engine_Dev — generic-default pack before the Tartaria built-in, so a reskin
  // that skips the WHISPERS box gets a bland generic whisper, not the yulka chain.
  const g = genericDefaults.whispers;
  if (g && g.length > 0) return g as readonly T[];
  return builtin;
}

// --- wasteland encounters override ----------------------------------------------
// engine_Dev — the between-locations travel encounters (an OBJECT keyed by
// archetype id: { type, weight, matchers, narration, loot?, npc_lines?, … }). An
// uploaded set replaces the built-in Tartaria archetypes wholesale.
let wastelandOverride: Record<string, unknown> | null = null;
export function setWastelandOverride(obj: Record<string, unknown> | null): void {
  wastelandOverride = obj && Object.keys(obj).length > 0 ? obj : null;
}
export function hasWastelandOverride(): boolean { return wastelandOverride != null; }
export function getWastelandOverride(): Record<string, unknown> | null { return wastelandOverride; }

// --- scene-prop pools override (climbable + salvageable ambient nouns) -----------
// engine_Dev — the curated nouns the engine injects into every scene as climb / salvage
// targets. Built-in pools are SETTING-NEUTRAL fallbacks; an uploaded set replaces them
// so an author can theme the props to their world (e.g. WWII wreckage instead of generic
// ruins). Each climbable: { name, context?: inside|outside|both, height? }. Each
// salvageable: { name, context? }.
export interface ScenePropSpawn { name: string; context?: 'inside' | 'outside' | 'both'; height?: number }
export interface ScenePropsOverride { climbables?: ScenePropSpawn[]; salvageables?: ScenePropSpawn[] }
let scenePropsOverride: ScenePropsOverride | null = null;
export function setScenePropsOverride(obj: ScenePropsOverride | null): void {
  const has = obj && ((obj.climbables?.length ?? 0) > 0 || (obj.salvageables?.length ?? 0) > 0);
  scenePropsOverride = has ? obj : null;
}
export function hasScenePropsOverride(): boolean { return scenePropsOverride != null; }
export function getScenePropsOverride(): ScenePropsOverride | null { return scenePropsOverride; }

// --- named vendors override -----------------------------------------------------
// engine_Dev — the named traders the engine spawns (id, name, title, faction?,
// description, offers[]). Built-in pool is the demo's; an uploaded array replaces it so
// an author can ship their own setting's traders. Each: { id, name, title, faction?,
// description, offers: [{ itemName, price, quantity? }], voiceId?, gender? }.
let vendorsOverride: unknown[] | null = null;
export function setVendorsOverride(arr: unknown[] | null): void {
  vendorsOverride = arr && arr.length > 0 ? arr : null;
}
export function hasVendorsOverride(): boolean { return vendorsOverride != null; }
export function getVendorsOverride(): unknown[] | null { return vendorsOverride; }

// --- roadside traders override --------------------------------------------------
// engine_Dev — the wandering market-stall archetypes the engine spawns on the road. An
// uploaded array replaces the built-in pool so an author ships their own. Each archetype:
// { id, name, title, demeanor: 'honest'|'sketchy', description, pool: [{ itemName,
// priceMin, priceMax, weight }] }.
let roadsideOverride: unknown[] | null = null;
export function setRoadsideOverride(arr: unknown[] | null): void {
  roadsideOverride = arr && arr.length > 0 ? arr : null;
}
export function hasRoadsideOverride(): boolean { return roadsideOverride != null; }
export function getRoadsideOverride(): unknown[] | null { return roadsideOverride; }
/** The generic game's roadside archetypes, if installed (else null). The resolver layers
 *  author override → this → built-in Tartaria pool. */
export function getGenericRoadside(): unknown[] | null {
  return genericDefaults.roadsideTraders && genericDefaults.roadsideTraders.length > 0 ? genericDefaults.roadsideTraders : null;
}

// --- interaction tags override --------------------------------------------------
// engine_Dev — the keyword lists that decide which interactable nouns are
// climbable / swimmable / breakable / searchable / salvageable. Uploaded as
// { climbable: [...], swimmable: [...], ... }; the author's words are ADDED to the
// built-in generic set (so "tank", "u-boat", "scaffolding" become climbable without
// losing "wall", "ladder").
export type InteractionTagKey = 'climbable' | 'swimmable' | 'breakable' | 'searchable' | 'salvageable';
let interactionTagsOverride: Partial<Record<InteractionTagKey, string[]>> | null = null;
export function setInteractionTagsOverride(obj: Partial<Record<InteractionTagKey, string[]>> | null): void {
  const has = obj && Object.values(obj).some((v) => Array.isArray(v) && v.length > 0);
  interactionTagsOverride = has ? obj : null;
}
export function hasInteractionTagsOverride(): boolean { return interactionTagsOverride != null; }
export function getInteractionTagsOverride(): Partial<Record<InteractionTagKey, string[]>> | null { return interactionTagsOverride; }

// --- starting areas override ----------------------------------------------------
// engine_Dev — per-faction STARTING AREAS: a separate list of small (e.g. 4-room)
// instances, each PLACED at a location on the map. Uploaded as an array:
//   [{ factionId, name, locationId, rooms: [{ id, name, shortName?, description,
//      interactables?, exits: {north,south,east,west}, anchorNpc? }] }]
// The faction's member spawns inside this instance (their starter complex), which
// sits at `locationId`.
// An exit value is another room's `id`, or `null` for no exit that way, or the
// sentinel "world" — a "world" exit leaves the instance and drops the player back
// onto the world map at this area's `locationId`. At least one room (the entry)
// should carry a "world" exit so the player can leave.
export interface StartingAreaRoom {
  id: string;
  name: string;
  shortName?: string;
  description: string;
  interactables?: string[];
  exits?: { north?: string | null; south?: string | null; east?: string | null; west?: string | null };
  anchorNpc?: string | null;
  /** engine_Dev — when true, the starter Mission Board stands in THIS room (the
   *  faction's rep-gated postings). Replaces the built-in hard-coded outpost_central
   *  gate for uploaded areas. Flag exactly one room per area. */
  missionBoard?: boolean;
}

/** Sentinel exit value meaning "leave the instance back onto the world map". */
export const STARTING_AREA_WORLD_EXIT = 'world';
export interface StartingArea {
  factionId: string;
  name: string;
  locationId: string;
  rooms: StartingAreaRoom[];
  /** engine_Dev — world-map grid cell where this area sits. Optional metadata used
   *  by the map planner (tap-to-place) and as a placement hint; the live hub still
   *  anchors on `locationId`. */
  coords?: { x: number; y: number };
  /** engine_Dev — if false, the area is a one-way prologue: once the player exits to
   *  the world map it vanishes (can't be re-entered), and any missions that
   *  originated here switch to REMOTE turn-in (completable from anywhere) since
   *  there's no board to return to. Defaults to true (a normal, returnable base). */
  returnable?: boolean;
}
let startingAreasOverride: StartingArea[] | null = null;
export function setStartingAreasOverride(rows: readonly unknown[] | null): void {
  const valid = Array.isArray(rows) && rows.some((r) => r && typeof r === 'object' && (r as { factionId?: unknown }).factionId);
  startingAreasOverride = valid ? (rows as StartingArea[]) : null;
}
export function hasStartingAreasOverride(): boolean { return startingAreasOverride != null; }
export function getStartingAreas(): StartingArea[] { return startingAreasOverride ?? genericDefaults.startingAreas ?? []; }
/** RAW author upload of starting areas (ignores the generic default). null = none loaded. */
export function getStartingAreasOverride(): StartingArea[] | null { return startingAreasOverride; }
export function startingAreaForFaction(factionId: string | null | undefined): StartingArea | null {
  if (!factionId) return null;
  // engine_Dev — author override → installed GENERIC default (so the generic game's hub,
  // with its mission board + anchor vendor, actually renders). Falls to null for the
  // built-in Tartaria factions, which use the static hub instead.
  return getStartingAreas().find((a) => a.factionId === factionId) ?? null;
}
/** Map a placement location id → the starting area sitting there (any faction). */
export function startingAreaAtLocation(locationId: string | null | undefined): StartingArea | null {
  if (!locationId) return null;
  return getStartingAreas().find((a) => a.locationId === locationId) ?? null;
}
/** A starting area is returnable unless its author explicitly set returnable:false.
 *  A non-returnable area is a one-way prologue (vanishes after you leave). */
export function startingAreaIsReturnable(area: StartingArea | null | undefined): boolean {
  return !area || area.returnable !== false;
}
/** True when a faction's home base is a one-way prologue → its missions use REMOTE
 *  turn-in (no board to come back to). */
export function factionUsesRemoteTurnIn(factionId: string | null | undefined): boolean {
  const area = startingAreaForFaction(factionId);
  return area != null && area.returnable === false;
}


/** The world-tone string injected into the LLM prompts. Override with a World
 *  lore block ({ "tone": "..." }); defaults to the Tartaria tone. */
/** The active World-lore block: author override → installed generic default → null.
 *  So the generic game's world tone/setting are used (instead of leaking the Tartaria
 *  DEFAULT) until an author uploads their own World lore. */
function resolveWorldBlock(): Record<string, unknown> | null {
  const ov = loreOverrides.world as Record<string, unknown> | undefined;
  if (ov && Object.keys(ov).length > 0) return ov;
  return (genericDefaults.worldLore as Record<string, unknown> | undefined) ?? null;
}
export function getWorldTone(): string {
  const w = resolveWorldBlock() as { tone?: unknown } | null;
  return w && typeof w.tone === 'string' && w.tone.trim().length > 0 ? w.tone.trim() : DEFAULT_WORLD_TONE;
}
/** Optional one-paragraph setting blurb from the World lore block ({ "setting":
 *  "..." }). Injected into the narration prompt when present; '' when absent. */
export function getWorldSetting(): string {
  const w = resolveWorldBlock() as { setting?: unknown } | null;
  return w && typeof w.setting === 'string' ? w.setting.trim() : '';
}
/** Optional key-terms list from the World lore block ({ "terms": ["...","..."] }
 *  or a plain string). Helps the model use the world's nouns. '' when absent. */
export function getWorldTerms(): string {
  const w = resolveWorldBlock() as { terms?: unknown } | null;
  if (!w) return '';
  if (Array.isArray(w.terms)) return w.terms.filter((t) => typeof t === 'string').join(', ').trim();
  return typeof w.terms === 'string' ? w.terms.trim() : '';
}
/** Optional narration vocabulary from the World lore block ({ "vocabulary":
 *  ["cast","channel"] or a string }). Replaces the old hardcoded "Aetheric
 *  verbs" line so the engine teaches the AUTHOR'S verbs, not Tartaria's. '' when
 *  absent → no vocabulary line is injected at all. */
export function getWorldVocabulary(): string {
  const w = resolveWorldBlock() as { vocabulary?: unknown } | null;
  if (!w) return '';
  if (Array.isArray(w.vocabulary)) return w.vocabulary.filter((t) => typeof t === 'string').join(', ').trim();
  return typeof w.vocabulary === 'string' ? w.vocabulary.trim() : '';
}
/** The narrator persona — first line of the main LLM narration prompt. Override
 *  with a World lore block ({ "narrator": "..." }); otherwise built from the
 *  narrator's name so a rename flows into the narration the model generates. */
export function getNarratorPersona(): string {
  const w = resolveWorldBlock() as { narrator?: unknown } | null;
  // engine_Dev — run the authored persona through the token filler so an author can
  // write {narrator}/{world}/{energy}/{crucible} in it instead of hard-coding the
  // chosen names (e.g. "You are {narrator}, a weary guide…").
  if (w && typeof w.narrator === 'string' && w.narrator.trim().length > 0) return fillContentPlaceholders(w.narrator.trim());
  return `You are ${getNarratorName()}, the narrator of this world.`;
}

/** Resolve a narrator canned-line pool by key through the 'flavor' lore override.
 *  Returns the author's pool when they've uploaded one for that key, else the
 *  built-in default — so a partial flavor upload only replaces the keys it
 *  defines (expand/contract friendly). */
export function resolveFlavor<T>(key: string, builtin: T): T {
  const f = loreOverrides.flavor as Record<string, unknown> | undefined;
  let v = f ? f[key] : undefined;
  if (v == null || (Array.isArray(v) && v.length === 0)) {
    // engine_Dev — no author override → try the generic default pack before Tartaria.
    const g = genericDefaults.flavor;
    v = g ? g[key] : undefined;
  }
  if (v == null) return builtin;
  if (Array.isArray(v) && v.length === 0) return builtin;
  return v as T;
}

/** Reset everything back to the built-in Tartaria pack. */
export function clearAllOverrides(): void {
  for (const k of Object.keys(tableOverrides)) delete tableOverrides[k as ContentTableId];
  for (const k of Object.keys(loreOverrides)) delete loreOverrides[k as LoreBlockId];
  setMissionsOverride(null);
  setHooksOverride(null);
  setWhispersOverride(null);
  setWastelandOverride(null);
  setScenePropsOverride(null);
  setVendorsOverride(null);
  setRoadsideOverride(null);
  setInteractionTagsOverride(null);
  setStartingAreasOverride(null);
  narratorNameOverride = null;
  gameTitleOverride = null;
  gameTaglineOverride = null;
  crucibleNameOverride = null;
  crucibleEnabled = true;
  worldNameOverride = null;
  corruptionNameOverride = null;
  energyNameOverride = null;
  customTitlesOverride = null;
  customMainQuestOverride = null;
  customBossesOverride = null;
  collectablesOverride = null;
  summonsOverride = null;
  dogEnabled = true;
  weatherEnabled = true;
  vendorsEnabled = true;
  vendorsAppendGeneric = false;
  sidekickWeaponQuestPct = 0;
  damageTypesOverride = null;
  damageResistancesOverride = null;
  fusionTagsOverride = null;
  coatingsOverride = null;
  inventoryOverride = null;
  diggingOverride = null;
  scrapOverride = null;
  salvageOverride = null;
  overlaysOverride = null;
  dogScenariosOverride = null;
}

// --- publish lock --------------------------------------------------------------
// Once a game is PUBLISHED, the developer door (the "Verbal" character-name access
// and the title DEV pill) is closed and uploads are locked — it ships as a normal
// game to play-test. Mirrored from the content-pack store; non-React engine code
// (e.g. the name-capture gate in gameStore) reads it through isPublished().
let published = false;
export function isPublished(): boolean { return published; }
export function setPublishedFlag(v: boolean): void { published = v; }

/** The character name that opens the developer console (while unpublished).
 *  Ghostbusters Easter egg — matched case- and space-insensitively (see
 *  isDevAccessName), so "iamthekeymaster", "I Am The Key Master", etc. all work. */
export const DEV_ACCESS_NAME = 'iamthekeymaster';
/** Normalize a name (lowercase, strip non-alphanumerics) for loose matching. */
function normalizeName(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }
/** True when the entered name is the dev-console key — capitalization and spaces
 *  don't matter, only the spelling. */
export function isDevAccessName(name: string): boolean {
  return normalizeName(name) === DEV_ACCESS_NAME;
}
