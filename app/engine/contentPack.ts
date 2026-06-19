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
  | 'recipes' | 'enemies' | 'races' | 'factions' | 'locations';

export type LoreBlockId = 'world' | 'faction' | 'race';

export interface ContentTableDef { id: ContentTableId; label: string; hint: string; }
export interface LoreBlockDef { id: LoreBlockId; label: string; hint: string; }

/** The tables the developer console exposes for upload, in display order. */
export const CONTENT_TABLES: ContentTableDef[] = [
  { id: 'weapons', label: 'Weapons', hint: 'JSON array of weapon rows (matches data/items/weapons.json)' },
  { id: 'armor', label: 'Armor', hint: 'JSON array of armor rows (data/items/armor.json)' },
  { id: 'materials', label: 'Materials', hint: 'JSON array of material rows (data/items/materials.json)' },
  { id: 'gear', label: 'Gear / equipment', hint: 'JSON array (data/items/gear.json)' },
  { id: 'exploration', label: 'Exploration items', hint: 'JSON array (data/items/exploration.json)' },
  { id: 'recipes', label: 'Crafting recipes', hint: 'JSON array (data/items/recipes.json)' },
  { id: 'enemies', label: 'Enemies', hint: 'JSON array of enemy rows (data/enemies/…)' },
  { id: 'races', label: 'Races', hint: 'JSON array of race rows (data/races/…)' },
  { id: 'factions', label: 'Factions', hint: 'JSON array of faction rows (data/factions/…)' },
  { id: 'locations', label: 'Locations', hint: 'JSON array of locations (data/locations/locations.json)' },
];

/** Lore blocks, split the way the game uses them. */
export const LORE_BLOCKS: LoreBlockDef[] = [
  { id: 'world', label: 'World lore', hint: 'JSON: { "narrator": "You are <persona>…", "tone": "<one-line world tone the LLM narrates in>", "setting": "...", "terms": ["..."] }' },
  { id: 'faction', label: 'Faction lore', hint: 'JSON: free-form faction lore (object or array)' },
  { id: 'race', label: 'Race lore', hint: 'JSON: free-form race lore (object or array)' },
];

/** Built-in default world tone (Tartaria). The LLM prompt falls back to this when
 *  no World-lore override is loaded. Replace it via an uploaded World lore block. */
export const DEFAULT_WORLD_TONE =
  'Reclaimers scavenge a flooded wasteland; the Aether is a strange resonant material left over from a fallen civilization.';
/** Built-in default narrator persona — the first line of the main LLM prompt. */
export const DEFAULT_NARRATOR_PERSONA = 'You are the Arbiter, the ancient narrator of Tartaria.';

// --- active overrides (module-level; mirrored from the content-pack store) ------
const tableOverrides: Partial<Record<ContentTableId, readonly unknown[]>> = {};
const loreOverrides: Partial<Record<LoreBlockId, unknown>> = {};

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
/** The narrator persona — first line of the main LLM narration prompt. Override
 *  with a World lore block ({ "narrator": "..." }); defaults to the Arbiter. */
export function getNarratorPersona(): string {
  const w = loreOverrides.world as { narrator?: unknown } | undefined;
  return w && typeof w.narrator === 'string' && w.narrator.trim().length > 0 ? w.narrator.trim() : DEFAULT_NARRATOR_PERSONA;
}

/** Reset everything back to the built-in Tartaria pack. */
export function clearAllOverrides(): void {
  for (const k of Object.keys(tableOverrides)) delete tableOverrides[k as ContentTableId];
  for (const k of Object.keys(loreOverrides)) delete loreOverrides[k as LoreBlockId];
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
