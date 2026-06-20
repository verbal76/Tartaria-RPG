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
  | 'amulets' | 'rings'
  | 'recipes' | 'enemies' | 'races' | 'factions' | 'locations' | 'lore' | 'powers' | 'weather';

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
  { id: 'recipes', label: 'Crafting recipes', hint: 'JSON array (data/items/recipes.json)' },
  { id: 'enemies', label: 'Enemies', hint: 'JSON array of enemy rows (data/enemies/…)' },
  { id: 'races', label: 'Races (playable — character creation)', hint: 'JSON array of race rows. THIS is what the race-selection screen shows. (Not the "Race lore" box up in LORE — that\'s freeform story text.)' },
  { id: 'factions', label: 'Factions (playable — character creation)', hint: 'JSON array of faction rows. THIS is what the faction-selection screen shows. (Not the "Faction lore" box up in LORE.) Optional per faction: "flavor" (2-3 sentence what-you-are blurb shown in the opening), "baseName" (their STARTER COMPLEX title — Tartaria\'s outpost equivalent, e.g. "Drydock 4 Command"), "baseLocationId" (the Locations-table id the member spawns at and is safe inside until they leave).' },
  { id: 'locations', label: 'Locations', hint: 'JSON array of locations (data/locations/locations.json)' },
  { id: 'weather', label: 'Weather / atmosphere', hint: 'JSON array of weather rows (data/weather/weather.json). Drives the "<name> presses on the world" atmosphere line + travel/visibility effects. Each: { "id", "name", "description", "visibility", "travelPenalty", "corruptionChance", "tags": [...] }.' },
  { id: 'lore', label: 'Lore document', hint: 'Your world bible as keyworded passages: [{ "tags": ["uss eldridge","fog"], "text": "..." }]. The narrator surfaces the passage whose tags match the scene; replaces the built-in canon. Write the big dump once — the engine pulls the right slice.' },
  { id: 'powers', label: 'Powers (magic / abilities)', hint: 'Your castable powers. Each: { "discipline": "shape|summon|mend" (the engine effect it runs), "name", "title", "body", "stat": "intelligence|wisdom", "dcBase", "fuels": ["item names"], "examples": ["cast phrases"] }. Replaces Aethercraft. Hit TEMPLATE for the shape.' },
];

/** Lore blocks, split the way the game uses them. */
export const LORE_BLOCKS: LoreBlockDef[] = [
  { id: 'world', label: 'World lore', hint: 'JSON: { "narrator": "You are <persona>…", "tone": "<one-line world tone the narrator uses>", "tagline": "<shown under the title>", "setting": "<a paragraph the narrator knows>", "terms": ["place/faction nouns"], "vocabulary": ["verbs the narrator favors"] }' },
  { id: 'faction', label: 'Faction lore (story notes — NOT playable)', hint: 'Free-form faction backstory for the narrator. The PLAYABLE factions (character creation) go in the "Factions" box under TABLES, not here.' },
  { id: 'race', label: 'Race lore (story notes — NOT playable)', hint: 'Free-form race backstory for the narrator. The PLAYABLE races (character creation) go in the "Races" box under TABLES, not here.' },
  { id: 'flavor', label: 'Narration flavor', hint: 'JSON object of the narrator’s canned line-pools by key (opening, genericRemarks, combatRemarks, lookLines, notedLines, sceneIntros, combatIntros, hubOpening, personalBeats, moodRemarks, intentRemarks, raceRemarks, factionRemarks). Also "starterItems": an array of starting-inventory item rows (keep each row\'s "tags" to keep its behavior — light/drink/food/detection). Hit TEMPLATE to see the keys; any key you omit keeps the built-in lines.' },
];

/** Built-in default world tone (Tartaria). The LLM prompt falls back to this when
 *  no World-lore override is loaded. Replace it via an uploaded World lore block. */
export const DEFAULT_WORLD_TONE =
  'Reclaimers scavenge a flooded wasteland; the Aether is a strange resonant material left over from a fallen civilization.';

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

// --- active overrides (module-level; mirrored from the content-pack store) ------
const tableOverrides: Partial<Record<ContentTableId, readonly unknown[]>> = {};
const loreOverrides: Partial<Record<LoreBlockId, unknown>> = {};
let narratorNameOverride: string | null = null;
let gameTitleOverride: string | null = null;
let gameTaglineOverride: string | null = null;

/** Rename the game (or null to fall back to "Text RPG Engine"). */
export function setGameTitleOverride(name: string | null): void {
  const t = typeof name === 'string' ? name.trim() : '';
  gameTitleOverride = t.length > 0 ? t : null;
}
export function hasGameTitleOverride(): boolean { return gameTitleOverride != null; }
/** The game's display title — shown under the icon on the start screen. */
export function getGameTitle(): string { return gameTitleOverride ?? DEFAULT_GAME_TITLE; }

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
  return narratorNameOverride ?? DEFAULT_NARRATOR_NAME;
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

export function setTableOverride(id: ContentTableId, rows: readonly unknown[] | null): void {
  if (rows && rows.length > 0) tableOverrides[id] = rows;
  else delete tableOverrides[id];
}
export function hasTableOverride(id: ContentTableId): boolean {
  const ov = tableOverrides[id];
  return Array.isArray(ov) && ov.length > 0;
}
export function tableOverrideCount(id: ContentTableId): number {
  return tableOverrides[id]?.length ?? 0;
}
/** Engine modules pass their built-in table; if an override is loaded it wins. */
export function resolveTable<T>(id: ContentTableId, builtin: readonly T[]): readonly T[] {
  const ov = tableOverrides[id];
  return ov && ov.length > 0 ? (ov as readonly T[]) : builtin;
}

export function setLoreOverride(id: LoreBlockId, value: unknown | null): void {
  if (value == null) delete loreOverrides[id];
  else loreOverrides[id] = value;
}
export function hasLoreOverride(id: LoreBlockId): boolean {
  return loreOverrides[id] != null;
}
export function getLoreOverride(id: LoreBlockId): unknown | null {
  return loreOverrides[id] ?? null;
}
/** The world-tone string injected into the LLM prompts. Override with a World
 *  lore block ({ "tone": "..." }); defaults to the Tartaria tone. */
export function getWorldTone(): string {
  const w = loreOverrides.world as { tone?: unknown } | undefined;
  return w && typeof w.tone === 'string' && w.tone.trim().length > 0 ? w.tone.trim() : DEFAULT_WORLD_TONE;
}
/** Optional one-paragraph setting blurb from the World lore block ({ "setting":
 *  "..." }). Injected into the narration prompt when present; '' when absent. */
export function getWorldSetting(): string {
  const w = loreOverrides.world as { setting?: unknown } | undefined;
  return w && typeof w.setting === 'string' ? w.setting.trim() : '';
}
/** Optional key-terms list from the World lore block ({ "terms": ["...","..."] }
 *  or a plain string). Helps the model use the world's nouns. '' when absent. */
export function getWorldTerms(): string {
  const w = loreOverrides.world as { terms?: unknown } | undefined;
  if (!w) return '';
  if (Array.isArray(w.terms)) return w.terms.filter((t) => typeof t === 'string').join(', ').trim();
  return typeof w.terms === 'string' ? w.terms.trim() : '';
}
/** Optional narration vocabulary from the World lore block ({ "vocabulary":
 *  ["cast","channel"] or a string }). Replaces the old hardcoded "Aetheric
 *  verbs" line so the engine teaches the AUTHOR'S verbs, not Tartaria's. '' when
 *  absent → no vocabulary line is injected at all. */
export function getWorldVocabulary(): string {
  const w = loreOverrides.world as { vocabulary?: unknown } | undefined;
  if (!w) return '';
  if (Array.isArray(w.vocabulary)) return w.vocabulary.filter((t) => typeof t === 'string').join(', ').trim();
  return typeof w.vocabulary === 'string' ? w.vocabulary.trim() : '';
}
/** The narrator persona — first line of the main LLM narration prompt. Override
 *  with a World lore block ({ "narrator": "..." }); otherwise built from the
 *  narrator's name so a rename flows into the narration the model generates. */
export function getNarratorPersona(): string {
  const w = loreOverrides.world as { narrator?: unknown } | undefined;
  if (w && typeof w.narrator === 'string' && w.narrator.trim().length > 0) return w.narrator.trim();
  return `You are ${getNarratorName()}, the narrator of this world.`;
}

/** Resolve a narrator canned-line pool by key through the 'flavor' lore override.
 *  Returns the author's pool when they've uploaded one for that key, else the
 *  built-in default — so a partial flavor upload only replaces the keys it
 *  defines (expand/contract friendly). */
export function resolveFlavor<T>(key: string, builtin: T): T {
  const f = loreOverrides.flavor as Record<string, unknown> | undefined;
  const v = f ? f[key] : undefined;
  if (v == null) return builtin;
  if (Array.isArray(v) && v.length === 0) return builtin;
  return v as T;
}

/** Reset everything back to the built-in Tartaria pack. */
export function clearAllOverrides(): void {
  for (const k of Object.keys(tableOverrides)) delete tableOverrides[k as ContentTableId];
  for (const k of Object.keys(loreOverrides)) delete loreOverrides[k as LoreBlockId];
  narratorNameOverride = null;
  gameTitleOverride = null;
  gameTaglineOverride = null;
}

// --- publish lock --------------------------------------------------------------
// Once a game is PUBLISHED, the developer door (the "Verbal" character-name access
// and the title DEV pill) is closed and uploads are locked — it ships as a normal
// game to play-test. Mirrored from the content-pack store; non-React engine code
// (e.g. the name-capture gate in gameStore) reads it through isPublished().
let published = false;
export function isPublished(): boolean { return published; }
export function setPublishedFlag(v: boolean): void { published = v; }

/** The exact character name that opens the developer console (while unpublished). */
export const DEV_ACCESS_NAME = 'Verbal';
