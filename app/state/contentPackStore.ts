// engine_Dev — content-pack store. Holds the developer's uploaded table/lore
// overrides, validates + persists them, and mirrors them into the contentPack
// registry so the engine reads them. Separate from the gameStore so a content
// pack survives across new games and isn't entangled with save slots.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setTableOverride,
  setLoreOverride,
  setNarratorNameOverride,
  setGameTitleOverride,
  setGameTaglineOverride,
  getNarratorName,
  clearAllOverrides,
  setPublishedFlag,
  setMissionsOverride,
  setHooksOverride,
  setWhispersOverride,
  setWastelandOverride,
  setInteractionTagsOverride,
  setStartingAreasOverride,
  setCustomTitlesOverride,
  setCustomMainQuestOverride,
  setCustomBossesOverride,
  setCollectablesOverride,
  setSummonsOverride,
  setDogEnabled,
  setDamageTypesOverride,
  setDamageResistancesOverride,
  setFusionTagsOverride,
  setCoatingsOverride,
  setDiggingOverride,
  setInventoryOverride,
  setCrucibleNameOverride,
  setCrucibleEnabled,
  setWorldNameOverride,
  setCorruptionNameOverride,
  CONTENT_TABLES,
  LORE_BLOCKS,
  type ContentTableId,
  type LoreBlockId,
  type MissionTableId,
  type HooksOverride,
} from '../engine/contentPack';

/** The mission sub-tables an uploaded Missions object may carry. */
const MISSION_KEYS: MissionTableId[] = ['hunts', 'mysteries', 'factionQuests', 'storylines', 'objectives', 'complications', 'rewards'];

import { invalidateLocationCaches } from '../engine/worldMap';
import { invalidateInteractionTagCache } from '../engine/interactionTags';

const INTERACTION_TAG_KEYS = ['climbable', 'swimmable', 'breakable', 'searchable', 'salvageable'] as const;

const STORAGE_KEY = 'tartaria.contentPack.v1';

export interface LoadResult {
  ok: boolean;
  error?: string;
  count?: number;
}

export interface BundleLoadResult {
  ok: boolean;
  error?: string;
  /** Human-readable per-section summary of what the bundle applied. */
  summary?: string;
}

/** Strip // line comments and block comments from a JSONC string so the
 *  whole-game template can carry inline reference descriptions and still parse.
 *  String literals are respected (a // inside a "string" is preserved). */
export function stripJsonComments(src: string): string {
  let out = '';
  let inStr = false;
  let quote = '';
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i++; }
      continue;
    }
    if (inStr) {
      out += c;
      if (c === '\\') { out += next ?? ''; i++; continue; }
      if (c === quote) { inStr = false; }
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; quote = c; out += c; continue; }
    if (c === '/' && next === '/') { inLine = true; i++; continue; }
    if (c === '/' && next === '*') { inBlock = true; i++; continue; }
    out += c;
  }
  return out;
}

interface PersistShape {
  tables: Partial<Record<ContentTableId, unknown[]>>;
  lore: Partial<Record<LoreBlockId, unknown>>;
  missions?: Partial<Record<MissionTableId, unknown[]>>;
  hooks?: HooksOverride;
  whispers?: unknown[];
  wasteland?: Record<string, unknown>;
  interactionTags?: Record<string, string[]>;
  startingAreas?: unknown[];
  customTitles?: unknown[];
  customMainQuest?: { title?: string; steps?: unknown[] } | null;
  customBosses?: unknown[];
  collectables?: unknown[];
  /** Uploaded summoned-sidekick pack: { noun?, defs: [...] }. Absent → built-in golems. */
  summons?: { noun?: string; defs: unknown[] } | null;
  /** Dog companion on/off. Absent → on (the built-in default). */
  dogEnabled?: boolean;
  /** Author-added damage types (extend the built-in 10). */
  damageTypes?: unknown[];
  /** Enemy-type → resist/weak map (replaces the built-in). */
  damageResistances?: Record<string, unknown> | null;
  /** Extra fusion material tags (extend the built-in whitelist). */
  fusionTags?: string[];
  /** Coating renames keyed by mechanic (replaces built-in names). */
  coatings?: Record<string, unknown> | null;
  digging?: Record<string, unknown> | null;
  /** Inventory presentation: category label renames + extra tool tags. */
  inventory?: { labels?: Record<string, string>; toolTags?: string[]; repairMaterialPct?: number } | null;
  published?: boolean;
  /** Custom narrator name; '' / absent → the default "Narrator". */
  narratorName?: string;
  /** Custom game title; '' / absent → the default "Text RPG Engine". */
  gameTitle?: string;
  /** Custom tagline; '' / absent → world-lore tagline or the default. */
  gameTagline?: string;
  /** Custom name for the item-fusion feature; '' / absent → "Crucible". */
  crucibleName?: string;
  /** When false, the fusion feature is disabled. Absent → enabled. */
  crucibleEnabled?: boolean;
  /** Custom WORLD NOUN; '' / absent → "Tartaria". Swapped into built-in narration. */
  worldName?: string;
  /** Custom CORRUPTION/affliction noun; '' / absent → "Corruption". */
  corruptionName?: string;
  /** Dev mode: while true, the dev console is the first/default Settings tab.
   *  Absent → treated as true (engine dev build default). */
  devMode?: boolean;
}

interface ContentPackState {
  tables: Partial<Record<ContentTableId, unknown[]>>;
  lore: Partial<Record<LoreBlockId, unknown>>;
  /** Uploaded missions (hunts / mysteries / faction quests / storylines + the
   *  procedural-lead seeds), authored as one object. */
  missions: Partial<Record<MissionTableId, unknown[]>>;
  /** Uploaded hooks (atmospheric multi-stage leads): { plants, chains, weights?,
   *  indoor? }. Empty object = built-in Tartaria hooks. */
  hooks: HooksOverride;
  /** Uploaded whispers (overheard-tip chains, an array). Empty = built-in. */
  whispers: unknown[];
  /** Uploaded wasteland encounters (object keyed by archetype id). Empty = built-in. */
  wasteland: Record<string, unknown>;
  /** Uploaded interaction-tag keyword additions ({ climbable: [...], … }). Empty = built-in. */
  interactionTags: Record<string, string[]>;
  /** Uploaded per-faction starting areas (array of 4-room instances + placement). */
  startingAreas: unknown[];
  customTitles: unknown[];
  customMainQuest: { title?: string; steps?: unknown[] } | null;
  customBosses: unknown[];
  collectables: unknown[];
  /** Uploaded summoned-sidekick pack ({ noun?, defs }) or null = built-in golems. */
  summons: { noun?: string; defs: unknown[] } | null;
  /** Dog companion on/off (default true). */
  dogEnabled: boolean;
  /** Author-added damage types (extend the built-in set). */
  damageTypes: unknown[];
  /** Enemy-type → resist/weak map, or null = built-in. */
  damageResistances: Record<string, unknown> | null;
  /** Extra fusion material tags. */
  fusionTags: string[];
  /** Coating renames keyed by mechanic, or null = built-in. */
  coatings: Record<string, unknown> | null;
  digging: Record<string, unknown> | null;
  /** Inventory category-label renames + extra tool tags, or null = built-in. */
  inventory: { labels?: Record<string, string>; toolTags?: string[]; repairMaterialPct?: number } | null;
  /** When true the title DEV pill is hidden (clean family build). The "Verbal"
   *  backdoor stays open for the author; reversible via unpublish(). */
  published: boolean;
  /** The author's custom narrator name ('' = use the default "Narrator"). */
  narratorName: string;
  /** The author's custom game title ('' = use the default "Text RPG Engine"). */
  gameTitle: string;
  /** The author's custom tagline ('' = world-lore tagline or the default). */
  gameTagline: string;
  /** Custom name for the fusion feature ('' = "Crucible"). */
  crucibleName: string;
  /** When false, the fusion feature is disabled (no chip / vendor offer / fuse). */
  crucibleEnabled: boolean;
  /** Custom WORLD NOUN ('' = "Tartaria"). Swapped into built-in narration. */
  worldName: string;
  /** Custom CORRUPTION/affliction noun ('' = "Corruption"). */
  corruptionName: string;
  /** While true, Settings opens to the dev console as its first/default tab. */
  devMode: boolean;
  /** Bumped by reapply() (and uploads) so content-reading screens re-render. */
  contentVersion: number;
  hydrated: boolean;
  /** Hide the title DEV pill for a family build (reversible; Verbal still works). */
  publish: () => void;
  /** Bring the DEV pill back (keep editing after a family build). */
  unpublish: () => void;
  /** Rename the narrator (pass '' to reset to "Narrator"). */
  setNarratorName: (name: string) => void;
  /** Rename the game (pass '' to reset to "Text RPG Engine"). */
  setGameTitle: (name: string) => void;
  /** Set the tagline (pass '' to fall back to world lore / the default). */
  setGameTagline: (text: string) => void;
  /** Rename the fusion feature (pass '' to reset to "Crucible"). */
  setCrucibleName: (name: string) => void;
  /** Enable / disable the fusion feature entirely. */
  setCrucibleEnabled: (on: boolean) => void;
  /** Rename the world noun (pass '' to reset to "Tartaria"). */
  setWorldName: (name: string) => void;
  /** Rename the corruption/affliction (pass '' to reset to "Corruption"). */
  setCorruptionName: (name: string) => void;
  /** Turn dev mode on/off (controls the Settings dev tab + default tab). */
  setDevMode: (on: boolean) => void;
  /** Force the engine to re-read every uploaded pack: re-mirror all overrides
   *  into the registry and bump contentVersion so screens refresh. */
  reapply: () => void;
  /** Parse + validate a table JSON (must be a non-empty array), apply, persist. */
  loadTableJson: (id: ContentTableId, json: string) => LoadResult;
  /** Parse + validate a lore JSON (object or array), apply, persist. */
  loadLoreJson: (id: LoreBlockId, json: string) => LoadResult;
  /** Parse a Missions object (JSONC) whose keys are mission sub-tables
   *  (hunts / mysteries / factionQuests / storylines / objectives / complications
   *  / rewards), validate + apply + persist. */
  loadMissionsJson: (json: string) => BundleLoadResult;
  /** Parse a Hooks object (JSONC): { plants, chains, weights?, indoor? }, validate
   *  + apply + persist. Replaces the built-in atmospheric leads. */
  loadHooksJson: (json: string) => BundleLoadResult;
  /** Parse a Whispers array (JSONC) of overheard-tip chain defs, apply + persist. */
  loadWhispersJson: (json: string) => LoadResult;
  /** Parse a Wasteland encounters object (JSONC) keyed by archetype id, apply +
   *  persist. Replaces the built-in between-locations travel encounters. */
  loadWastelandJson: (json: string) => BundleLoadResult;
  /** Parse an interaction-tags object (JSONC): { climbable, swimmable, breakable,
   *  searchable, salvageable } keyword lists; the author's words are added to the
   *  built-in generic set. */
  loadInteractionTagsJson: (json: string) => BundleLoadResult;
  /** Parse a starting-areas array (JSONC): per-faction 4-room instances + the
   *  location each is placed at. */
  loadStartingAreasJson: (json: string) => LoadResult;
  loadTitlesJson: (json: string) => LoadResult;
  clearTitles: () => void;
  loadMainQuestJson: (json: string) => LoadResult;
  setMainQuest: (q: { title?: string; steps?: unknown[] } | null) => void;
  clearMainQuest: () => void;
  loadBossesJson: (json: string) => LoadResult;
  setBosses: (rows: unknown[]) => void;
  clearBosses: () => void;
  loadCollectablesJson: (json: string) => LoadResult;
  clearCollectables: () => void;
  /** Load a summoned-sidekick pack: a bare array of summon defs, or
   *  { noun?, summons | defs: [...] }. Replaces the built-in golems. */
  loadSummonsJson: (json: string) => LoadResult;
  clearSummons: () => void;
  /** Toggle the rescuable dog companion on/off for this game. */
  setDogCompanionEnabled: (on: boolean) => void;
  /** Load author-added damage types: array of { name, keywords? }. */
  loadDamageTypesJson: (json: string) => LoadResult;
  clearDamageTypes: () => void;
  /** Load the enemy-type → { resist, weak } map. */
  loadDamageResistancesJson: (json: string) => LoadResult;
  clearDamageResistances: () => void;
  /** Load extra fusion material tags (array of strings). */
  loadFusionTagsJson: (json: string) => LoadResult;
  clearFusionTags: () => void;
  /** Load coating renames: map of mechanic → { label?, blurb?, lootLabel? }. */
  loadCoatingsJson: (json: string) => LoadResult;
  clearCoatings: () => void;
  loadDiggingJson: (json: string) => LoadResult;
  clearDigging: () => void;
  /** Load inventory presentation: { labels?: { categoryId: name }, toolTags?: [..] }. */
  loadInventoryJson: (json: string) => LoadResult;
  clearInventory: () => void;
  /** Parse a SINGLE whole-game JSON (JSONC; comments allowed) whose keys are
   *  table ids / lore block ids / title / tagline / narrator, and apply every
   *  recognised section at once. One upload builds the whole game. */
  loadGameBundle: (json: string) => BundleLoadResult;
  /** Serialize the CURRENT game (every uploaded table + lore block + title /
   *  tagline / narrator) into one whole-game JSON string — the exact shape
   *  loadGameBundle reads. This is the file you send back to have the game baked
   *  into a standalone APK. */
  exportGameBundle: () => string;
  clearTable: (id: ContentTableId) => void;
  clearLore: (id: LoreBlockId) => void;
  /** Drop the uploaded missions back to the built-in set. */
  clearMissions: () => void;
  /** Drop the uploaded hooks back to the built-in set. */
  clearHooks: () => void;
  /** Drop the uploaded whispers back to the built-in set. */
  clearWhispers: () => void;
  /** Drop the uploaded wasteland encounters back to the built-in set. */
  clearWasteland: () => void;
  /** Drop the uploaded interaction-tag keywords back to the built-in set. */
  clearInteractionTags: () => void;
  /** Drop the uploaded starting areas. */
  clearStartingAreas: () => void;
  clearAll: () => void;
  /** Load any persisted pack on boot and mirror it into the registry. */
  hydrate: () => Promise<void>;
}

function persist(state: Pick<ContentPackState, 'tables' | 'lore' | 'missions' | 'hooks' | 'whispers' | 'wasteland' | 'interactionTags' | 'startingAreas' | 'customTitles' | 'customMainQuest' | 'customBosses' | 'collectables' | 'summons' | 'dogEnabled' | 'damageTypes' | 'damageResistances' | 'fusionTags' | 'coatings' | 'digging' | 'inventory' | 'published' | 'narratorName' | 'gameTitle' | 'gameTagline' | 'crucibleName' | 'crucibleEnabled' | 'worldName' | 'corruptionName' | 'devMode'>): void {
  const shape: PersistShape = {
    tables: state.tables,
    lore: state.lore,
    missions: Object.keys(state.missions).length > 0 ? state.missions : undefined,
    hooks: Object.keys(state.hooks).length > 0 ? state.hooks : undefined,
    whispers: state.whispers.length > 0 ? state.whispers : undefined,
    wasteland: Object.keys(state.wasteland).length > 0 ? state.wasteland : undefined,
    interactionTags: Object.keys(state.interactionTags).length > 0 ? state.interactionTags : undefined,
    startingAreas: state.startingAreas.length > 0 ? state.startingAreas : undefined,
    customTitles: state.customTitles.length > 0 ? state.customTitles : undefined,
    customMainQuest: state.customMainQuest ?? undefined,
    customBosses: state.customBosses.length > 0 ? state.customBosses : undefined,
    collectables: state.collectables.length > 0 ? state.collectables : undefined,
    summons: state.summons ?? undefined,
    dogEnabled: state.dogEnabled === false ? false : undefined,
    damageTypes: state.damageTypes.length > 0 ? state.damageTypes : undefined,
    damageResistances: state.damageResistances && Object.keys(state.damageResistances).length > 0 ? state.damageResistances : undefined,
    fusionTags: state.fusionTags.length > 0 ? state.fusionTags : undefined,
    coatings: state.coatings && Object.keys(state.coatings).length > 0 ? state.coatings : undefined,
    digging: state.digging && Object.keys(state.digging).length > 0 ? state.digging : undefined,
    inventory: state.inventory ?? undefined,
    published: state.published,
    narratorName: state.narratorName || undefined,
    gameTitle: state.gameTitle || undefined,
    gameTagline: state.gameTagline || undefined,
    crucibleName: state.crucibleName || undefined,
    crucibleEnabled: state.crucibleEnabled === false ? false : undefined,
    worldName: state.worldName || undefined,
    corruptionName: state.corruptionName || undefined,
    devMode: state.devMode,
  };
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(shape)).catch(() => { /* best effort */ });
}

export const useContentPackStore = create<ContentPackState>((set, get) => ({
  tables: {},
  lore: {},
  missions: {},
  hooks: {},
  whispers: [],
  wasteland: {},
  interactionTags: {},
  startingAreas: [],
  customTitles: [],
  customMainQuest: null,
  customBosses: [],
  collectables: [],
  summons: null,
  dogEnabled: true,
  damageTypes: [],
  damageResistances: null,
  fusionTags: [],
  coatings: null,
  digging: null,
  inventory: null,
  published: false,
  narratorName: '',
  gameTitle: '',
  gameTagline: '',
  crucibleName: '',
  crucibleEnabled: true,
  worldName: '',
  corruptionName: '',
  devMode: true,
  contentVersion: 0,
  hydrated: false,

  reapply() {
    const s = get();
    // Re-mirror every override from the store into the engine registry. The
    // registry is normally kept in sync on each upload, but this is the explicit
    // "APPLY ALL" the author hits after editing — it guarantees the live engine
    // matches every uploaded JSON (e.g. after an OTA reload reset module state).
    for (const [id, rows] of Object.entries(s.tables)) {
      if (Array.isArray(rows)) setTableOverride(id as ContentTableId, rows);
    }
    for (const [id, value] of Object.entries(s.lore)) setLoreOverride(id as LoreBlockId, value);
    setMissionsOverride(Object.keys(s.missions).length > 0 ? s.missions : null);
    setHooksOverride(Object.keys(s.hooks).length > 0 ? s.hooks : null);
    setWhispersOverride(s.whispers.length > 0 ? s.whispers : null);
    setWastelandOverride(Object.keys(s.wasteland).length > 0 ? s.wasteland : null);
    setInteractionTagsOverride(Object.keys(s.interactionTags).length > 0 ? s.interactionTags : null);
    invalidateInteractionTagCache();
    setStartingAreasOverride(s.startingAreas.length > 0 ? s.startingAreas : null);
    setCustomTitlesOverride(s.customTitles.length > 0 ? s.customTitles : null);
    setCustomMainQuestOverride(s.customMainQuest ?? null);
    setCustomBossesOverride(s.customBosses.length > 0 ? s.customBosses : null);
    setCollectablesOverride(s.collectables.length > 0 ? s.collectables : null);
    setSummonsOverride(s.summons ?? null);
    setDogEnabled(s.dogEnabled !== false);
    setDamageTypesOverride(s.damageTypes.length > 0 ? (s.damageTypes as { name: string; keywords?: string[] }[]) : null);
    setDamageResistancesOverride(s.damageResistances && Object.keys(s.damageResistances).length > 0 ? (s.damageResistances as Record<string, { resist: string[]; weak: string[] }>) : null);
    setFusionTagsOverride(s.fusionTags.length > 0 ? s.fusionTags : null);
    setCoatingsOverride(s.coatings && Object.keys(s.coatings).length > 0 ? (s.coatings as Parameters<typeof setCoatingsOverride>[0]) : null);
    setDiggingOverride(s.digging && Object.keys(s.digging).length > 0 ? s.digging : null);
    setInventoryOverride(s.inventory ?? null);
    invalidateLocationCaches();
    setNarratorNameOverride(s.narratorName || null);
    setGameTitleOverride(s.gameTitle || null);
    setGameTaglineOverride(s.gameTagline || null);
    setCrucibleNameOverride(s.crucibleName || null);
    setCrucibleEnabled(s.crucibleEnabled);
    setWorldNameOverride(s.worldName || null);
    setCorruptionNameOverride(s.corruptionName || null);
    setPublishedFlag(s.published);
    invalidateLocationCaches(); // rebuild routing positions from the live locations
    set({ contentVersion: s.contentVersion + 1 });
  },

  publish() {
    // A family build hides the dev pill AND drops out of dev mode so testers
    // get a clean Settings screen. The "Verbal" backdoor re-enables both.
    setPublishedFlag(true);
    set({ published: true, devMode: false });
    persist({ ...get(), published: true, devMode: false });
  },

  unpublish() {
    setPublishedFlag(false);
    set({ published: false, devMode: true });
    persist({ ...get(), published: false, devMode: true });
  },

  setDevMode(on) {
    set({ devMode: on });
    persist({ ...get(), devMode: on });
  },

  setNarratorName(name) {
    const clean = name.trim();
    setNarratorNameOverride(clean.length > 0 ? clean : null);
    set({ narratorName: clean });
    persist({ ...get(), narratorName: clean });
  },

  setGameTitle(name) {
    const clean = name.trim();
    setGameTitleOverride(clean.length > 0 ? clean : null);
    set({ gameTitle: clean });
    persist({ ...get(), gameTitle: clean });
  },

  setGameTagline(text) {
    const clean = text.trim();
    setGameTaglineOverride(clean.length > 0 ? clean : null);
    set({ gameTagline: clean });
    persist({ ...get(), gameTagline: clean });
  },

  setCrucibleName(name) {
    const clean = name.trim();
    setCrucibleNameOverride(clean.length > 0 ? clean : null);
    set({ crucibleName: clean, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), crucibleName: clean });
  },

  setCrucibleEnabled(on) {
    setCrucibleEnabled(on);
    set({ crucibleEnabled: on, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), crucibleEnabled: on });
  },

  setWorldName(name) {
    const clean = name.trim();
    setWorldNameOverride(clean.length > 0 ? clean : null);
    set({ worldName: clean, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), worldName: clean });
  },

  setCorruptionName(name) {
    const clean = name.trim();
    setCorruptionNameOverride(clean.length > 0 ? clean : null);
    set({ corruptionName: clean, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), corruptionName: clean });
  },

  loadTableJson(id, json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    // engine_Dev — tolerate the common wrapped shape the built-in data files use,
    // e.g. { "weapons": [...] } or { "races": [...] } or { "items": [...] }: if the
    // upload is an object with exactly one array property, unwrap it to the array.
    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
      const arrays = Object.values(parsed as Record<string, unknown>).filter(Array.isArray);
      if (arrays.length === 1) parsed = arrays[0];
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'A table must be a JSON array of rows (or an object wrapping one array, e.g. { "races": [...] }).' };
    }
    if (parsed.length === 0) {
      return { ok: false, error: 'The array is empty.' };
    }
    setTableOverride(id, parsed);
    if (id === 'locations') invalidateLocationCaches();
    const tables = { ...get().tables, [id]: parsed };
    set({ tables, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), tables });
    return { ok: true, count: parsed.length };
  },

  loadLoreJson(id, json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (parsed == null || typeof parsed !== 'object') {
      return { ok: false, error: 'Lore must be a JSON object or array.' };
    }
    // engine_Dev — guard the common mix-up: an array of {id,name,…} rows pasted
    // into the Race/Faction LORE box is really the PLAYABLE table and belongs in
    // the "Races"/"Factions" box under TABLES (this lore box is free-form story
    // text and does NOT drive character creation).
    if ((id === 'race' || id === 'faction') && Array.isArray(parsed)) {
      const looksLikeTable = parsed.length > 0 && parsed.every(
        (r) => r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string' && typeof (r as { name?: unknown }).name === 'string',
      );
      if (looksLikeTable) {
        const box = id === 'race' ? 'Races' : 'Factions';
        return { ok: false, error: `This looks like the playable ${box} table. Load it in the "${box}" box under TABLES (down below) — not this lore box. That table is what character creation reads.` };
      }
    }
    setLoreOverride(id, parsed);
    const lore = { ...get().lore, [id]: parsed };
    set({ lore, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), lore });
    return { ok: true };
  },

  loadMissionsJson(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: `Missions must be a JSON OBJECT whose keys are mission types: ${MISSION_KEYS.join(', ')}.` };
    }
    const obj = parsed as Record<string, unknown>;
    const missions: Partial<Record<MissionTableId, unknown[]>> = {};
    const applied: string[] = [];
    const skipped: string[] = [];
    for (const key of MISSION_KEYS) {
      const v = obj[key];
      if (v == null) continue;
      if (Array.isArray(v) && v.length > 0) { missions[key] = v; applied.push(`${key} (${v.length})`); }
      else skipped.push(`${key} (empty/not an array)`);
    }
    const unknownKeys = Object.keys(obj).filter((k) => !k.startsWith('_') && !(MISSION_KEYS as string[]).includes(k));
    if (applied.length === 0) {
      return { ok: false, error: `No recognised mission types found. Keys must be: ${MISSION_KEYS.join(', ')}.` };
    }
    setMissionsOverride(missions);
    set({ missions, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), missions });
    const summary = `Loaded missions: ${applied.join(', ')}.${skipped.length ? ` Skipped: ${skipped.join(', ')}.` : ''}${unknownKeys.length ? ` Ignored unknown keys: ${unknownKeys.join(', ')}.` : ''}`;
    return { ok: true, summary };
  },

  loadHooksJson(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Hooks must be a JSON OBJECT: { "plants": {…}, "chains": {…}, "weights"?: {…}, "indoor"?: [...] }.' };
    }
    const obj = parsed as Record<string, unknown>;
    const plants = obj.plants;
    const chains = obj.chains;
    const plantKinds = plants && typeof plants === 'object' && !Array.isArray(plants) ? Object.keys(plants) : [];
    const chainKinds = chains && typeof chains === 'object' && !Array.isArray(chains) ? Object.keys(chains) : [];
    if (plantKinds.length === 0 && chainKinds.length === 0) {
      return { ok: false, error: 'Provide at least a "plants" or "chains" object keyed by hook id.' };
    }
    const hooks: HooksOverride = {
      plants: plants as HooksOverride['plants'],
      chains: chains as HooksOverride['chains'],
      weights: (obj.weights && typeof obj.weights === 'object' && !Array.isArray(obj.weights)) ? obj.weights as Record<string, number> : undefined,
      indoor: Array.isArray(obj.indoor) ? (obj.indoor as unknown[]).filter((x) => typeof x === 'string') as string[] : undefined,
    };
    setHooksOverride(hooks);
    set({ hooks, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), hooks });
    return { ok: true, summary: `Loaded hooks: ${plantKinds.length} plant kind(s), ${chainKinds.length} chain(s).` };
  },

  loadWhispersJson(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'Whispers must be a JSON ARRAY of chain definitions.' };
    }
    if (parsed.length === 0) return { ok: false, error: 'The array is empty.' };
    setWhispersOverride(parsed);
    const whispers = parsed;
    set({ whispers, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), whispers });
    return { ok: true, count: parsed.length };
  },

  loadWastelandJson(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Wasteland encounters must be a JSON OBJECT keyed by archetype id (each value has a "type" + "matchers" + "narration").' };
    }
    const obj = parsed as Record<string, unknown>;
    const valid = Object.entries(obj).filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object' && 'type' in (v as object));
    if (valid.length === 0) {
      return { ok: false, error: 'No archetypes found. Each entry needs at least { "type", "matchers", "narration" }.' };
    }
    setWastelandOverride(obj);
    const wasteland = obj;
    set({ wasteland, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), wasteland });
    return { ok: true, summary: `Loaded ${valid.length} wasteland encounter archetype(s).` };
  },

  loadInteractionTagsJson(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: `Interaction tags must be a JSON OBJECT with keyword arrays: { ${INTERACTION_TAG_KEYS.join(', ')} }.` };
    }
    const obj = parsed as Record<string, unknown>;
    const tagSet = new Set<string>(INTERACTION_TAG_KEYS);
    const next: Record<string, string[]> = {};
    let kwCount = 0;
    let nounCount = 0;
    for (const [key, v] of Object.entries(obj)) {
      if (key.startsWith('_') || !Array.isArray(v)) continue;
      const arr = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
      if (tagSet.has(key)) {
        // Keyword list for a verb.
        if (arr.length > 0) { next[key] = arr; kwCount += arr.length; }
      } else {
        // Explicit per-noun tags: keep only valid tag names (empty = "no verbs").
        next[key] = arr.filter((t) => tagSet.has(t));
        nounCount++;
      }
    }
    if (kwCount === 0 && nounCount === 0) {
      return { ok: false, error: `Nothing recognised. Use per-noun entries ("rusted tank": ["climbable"]) and/or keyword lists (${INTERACTION_TAG_KEYS.join(', ')}).` };
    }
    setInteractionTagsOverride(next);
    invalidateInteractionTagCache();
    set({ interactionTags: next, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), interactionTags: next });
    const parts: string[] = [];
    if (nounCount > 0) parts.push(`${nounCount} tagged noun(s)`);
    if (kwCount > 0) parts.push(`${kwCount} keyword(s)`);
    return { ok: true, summary: `Loaded ${parts.join(' + ')}.` };
  },

  loadStartingAreasJson(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'Starting areas must be a JSON ARRAY of { factionId, name, locationId, rooms: [...] }.' };
    }
    const bad = parsed.find((a) => !a || typeof a !== 'object' || !(a as { factionId?: unknown }).factionId || !(a as { locationId?: unknown }).locationId);
    if (parsed.length === 0) return { ok: false, error: 'The array is empty.' };
    if (bad) return { ok: false, error: 'Every entry needs at least "factionId" and "locationId" (where to place it).' };
    setStartingAreasOverride(parsed);
    invalidateLocationCaches();
    const startingAreas = parsed;
    set({ startingAreas, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), startingAreas });
    return { ok: true, count: parsed.length };
  },

  loadTitlesJson(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'Titles must be a JSON ARRAY of { id, name, track, threshold }.' };
    }
    if (parsed.length === 0) return { ok: false, error: 'The array is empty.' };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TRACKABLE_VARS } = require('../engine/customTitles') as typeof import('../engine/customTitles');
    const trackable = new Set(TRACKABLE_VARS.map((v) => v.id));
    const bad = parsed.find((t) => {
      if (!t || typeof t !== 'object') return true;
      const c = t as Record<string, unknown>;
      return typeof c.id !== 'string' || !c.id
        || typeof c.name !== 'string' || !c.name
        || typeof c.track !== 'string' || !trackable.has(c.track)
        || typeof c.threshold !== 'number';
    });
    if (bad) return { ok: false, error: 'Every title needs id, name, a valid "track" variable, and a numeric "threshold".' };
    setCustomTitlesOverride(parsed);
    const customTitles = parsed;
    set({ customTitles, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), customTitles });
    return { ok: true, count: parsed.length };
  },

  clearTitles() {
    setCustomTitlesOverride(null);
    const customTitles: unknown[] = [];
    set({ customTitles, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), customTitles });
  },

  loadMainQuestJson(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { steps?: unknown[] }).steps)) {
      return { ok: false, error: 'Main quest must be an object with a "steps" array: { title?, steps: [{ action, target?, locationId?, reward? }] }.' };
    }
    const q = parsed as { title?: string; steps?: unknown[] };
    if (!q.steps || q.steps.length === 0) return { ok: false, error: 'The steps array is empty.' };
    get().setMainQuest(q);
    return { ok: true, count: q.steps.length };
  },

  setMainQuest(q) {
    const valid = q && Array.isArray(q.steps) && q.steps.length > 0 ? q : null;
    setCustomMainQuestOverride(valid);
    set({ customMainQuest: valid, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), customMainQuest: valid });
  },

  clearMainQuest() {
    setCustomMainQuestOverride(null);
    set({ customMainQuest: null, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), customMainQuest: null });
  },

  loadBossesJson(json) {
    let parsed: unknown;
    try { parsed = JSON.parse(stripJsonComments(json)); }
    catch (e) { return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
    if (!Array.isArray(parsed)) return { ok: false, error: 'Bosses must be a JSON ARRAY of { id, name, hp, attack, damage, ... }.' };
    if (parsed.length === 0) return { ok: false, error: 'The array is empty.' };
    const bad = parsed.find((b) => { if (!b || typeof b !== 'object') return true; const c = b as Record<string, unknown>; return typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name || typeof c.hp !== 'number'; });
    if (bad) return { ok: false, error: 'Every boss needs id, name, and a numeric hp.' };
    get().setBosses(parsed);
    return { ok: true, count: parsed.length };
  },

  setBosses(rows) {
    const valid = Array.isArray(rows) && rows.length > 0 ? rows : [];
    setCustomBossesOverride(valid.length > 0 ? valid : null);
    set({ customBosses: valid, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), customBosses: valid });
  },

  clearBosses() {
    setCustomBossesOverride(null);
    set({ customBosses: [], contentVersion: get().contentVersion + 1 });
    persist({ ...get(), customBosses: [] });
  },

  loadCollectablesJson(json) {
    let parsed: unknown;
    try { parsed = JSON.parse(stripJsonComments(json)); }
    catch (e) { return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
    // accept the array of stories, or a wrapper { stories: [...] }
    let rows: unknown = parsed;
    if (!Array.isArray(rows) && rows && typeof rows === 'object' && Array.isArray((rows as { stories?: unknown[] }).stories)) rows = (rows as { stories: unknown[] }).stories;
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'Collectables must be a JSON ARRAY of stories: [{ id, characterName, characterBlurb, fragments: [{ id, title, kind, body, discoveryHint, biomeTags }] }].' };
    const bad = rows.find((st) => { if (!st || typeof st !== 'object') return true; const c = st as Record<string, unknown>; return typeof c.id !== 'string' || !c.id || !Array.isArray(c.fragments); });
    if (bad) return { ok: false, error: 'Every story needs an id and a fragments[] array.' };
    setCollectablesOverride(rows);
    set({ collectables: rows, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), collectables: rows });
    return { ok: true, count: rows.length };
  },

  clearCollectables() {
    setCollectablesOverride(null);
    set({ collectables: [], contentVersion: get().contentVersion + 1 });
    persist({ ...get(), collectables: [] });
  },

  loadSummonsJson(json) {
    let parsed: unknown;
    try { parsed = JSON.parse(stripJsonComments(json)); }
    catch (e) { return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
    // accept a bare array of defs, or { noun?, summons | defs: [...] }
    let noun: string | undefined;
    let defs: unknown = parsed;
    if (!Array.isArray(defs) && defs && typeof defs === 'object') {
      const o = defs as { noun?: unknown; summons?: unknown; defs?: unknown };
      if (typeof o.noun === 'string') noun = o.noun;
      defs = Array.isArray(o.summons) ? o.summons : o.defs;
    }
    if (!Array.isArray(defs) || defs.length === 0) {
      return { ok: false, error: 'Summons must be a JSON ARRAY of sidekick defs (or { noun?, summons: [...] }). Each def needs id/kind, name, fuel[], hpMax, attackDie.' };
    }
    // Validate + normalize each def. `id` is accepted as an alias for `kind`.
    const normalized: Record<string, unknown>[] = [];
    for (const raw of defs) {
      if (!raw || typeof raw !== 'object') return { ok: false, error: 'Every summon must be an object.' };
      const d = { ...(raw as Record<string, unknown>) };
      if (typeof d.kind !== 'string' && typeof d.id === 'string') d.kind = d.id;
      if (typeof d.kind !== 'string' || !d.kind) return { ok: false, error: 'Every summon needs a string id/kind.' };
      if (typeof d.name !== 'string' || !d.name) return { ok: false, error: `Summon "${String(d.kind)}" needs a name.` };
      if (!Array.isArray(d.fuel)) return { ok: false, error: `Summon "${String(d.kind)}" needs a fuel[] array of { name, quantity }.` };
      if (typeof d.hpMax !== 'number' || typeof d.attackDie !== 'string') return { ok: false, error: `Summon "${String(d.kind)}" needs numeric hpMax and a string attackDie (e.g. "1d10").` };
      // sane defaults so a minimal upload still works in combat
      if (typeof d.attackMod !== 'number') d.attackMod = 0;
      if (typeof d.hitBonus !== 'number') d.hitBonus = 0;
      if (typeof d.damageType !== 'string') d.damageType = 'bludgeoning';
      if (typeof d.resistBase !== 'number') d.resistBase = 0.15;
      if (typeof d.resistCap !== 'number') d.resistCap = 0.4;
      if (typeof d.blurb !== 'string') d.blurb = '';
      normalized.push(d);
    }
    const payload = { noun, defs: normalized };
    setSummonsOverride(payload as { noun?: string; defs: never[] });
    set({ summons: payload, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), summons: payload });
    return { ok: true, count: normalized.length };
  },

  clearSummons() {
    setSummonsOverride(null);
    set({ summons: null, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), summons: null });
  },

  setDogCompanionEnabled(on) {
    setDogEnabled(on);
    set({ dogEnabled: on, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), dogEnabled: on });
  },

  loadDamageTypesJson(json) {
    let parsed: unknown;
    try { parsed = JSON.parse(stripJsonComments(json)); }
    catch (e) { return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
    let rows: unknown = parsed;
    if (!Array.isArray(rows) && rows && typeof rows === 'object' && Array.isArray((rows as { types?: unknown[] }).types)) rows = (rows as { types: unknown[] }).types;
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'Damage types must be a JSON ARRAY of { name, keywords? } (or { types: [...] }).' };
    const bad = rows.find((r) => !r || typeof r !== 'object' || typeof (r as { name?: unknown }).name !== 'string' || !(r as { name: string }).name);
    if (bad) return { ok: false, error: 'Every damage type needs a string "name". Optional "keywords": [..] for attack-string inference.' };
    setDamageTypesOverride(rows as { name: string; keywords?: string[] }[]);
    set({ damageTypes: rows, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), damageTypes: rows });
    return { ok: true, count: rows.length };
  },
  clearDamageTypes() {
    setDamageTypesOverride(null);
    set({ damageTypes: [], contentVersion: get().contentVersion + 1 });
    persist({ ...get(), damageTypes: [] });
  },

  loadDamageResistancesJson(json) {
    let parsed: unknown;
    try { parsed = JSON.parse(stripJsonComments(json)); }
    catch (e) { return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'Resistances must be a JSON OBJECT keyed by enemy type: { "Ghost Crew": { "resist": [..], "weak": [..] }, … }.' };
    const map = parsed as Record<string, unknown>;
    const keys = Object.keys(map);
    if (keys.length === 0) return { ok: false, error: 'No enemy types found.' };
    for (const k of keys) {
      const v = map[k];
      if (!v || typeof v !== 'object' || !Array.isArray((v as { resist?: unknown }).resist) || !Array.isArray((v as { weak?: unknown }).weak)) {
        return { ok: false, error: `"${k}" must be { "resist": [..], "weak": [..] } (both arrays).` };
      }
    }
    setDamageResistancesOverride(map as Record<string, { resist: string[]; weak: string[] }>);
    set({ damageResistances: map, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), damageResistances: map });
    return { ok: true, count: keys.length };
  },
  clearDamageResistances() {
    setDamageResistancesOverride(null);
    set({ damageResistances: null, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), damageResistances: null });
  },

  loadFusionTagsJson(json) {
    let parsed: unknown;
    try { parsed = JSON.parse(stripJsonComments(json)); }
    catch (e) { return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
    let rows: unknown = parsed;
    if (!Array.isArray(rows) && rows && typeof rows === 'object' && Array.isArray((rows as { tags?: unknown[] }).tags)) rows = (rows as { tags: unknown[] }).tags;
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'Fusion tags must be a JSON ARRAY of tag strings (or { tags: [...] }).' };
    const tags = rows.map((t) => String(t).toLowerCase().trim()).filter((t) => t.length > 0);
    if (tags.length === 0) return { ok: false, error: 'No usable tag strings.' };
    setFusionTagsOverride(tags);
    set({ fusionTags: tags, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), fusionTags: tags });
    return { ok: true, count: tags.length };
  },
  clearFusionTags() {
    setFusionTagsOverride(null);
    set({ fusionTags: [], contentVersion: get().contentVersion + 1 });
    persist({ ...get(), fusionTags: [] });
  },

  loadCoatingsJson(json) {
    let parsed: unknown;
    try { parsed = JSON.parse(stripJsonComments(json)); }
    catch (e) { return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'Coatings must be a JSON OBJECT keyed by mechanic: { "corruption": { "label": "Phase-rot" }, … }.' };
    const map = parsed as Record<string, unknown>;
    const allowed = ['poison', 'acid', 'corruption', 'electrical', 'burn'];
    const keys = Object.keys(map);
    const badKey = keys.find((k) => !allowed.includes(k));
    if (badKey) return { ok: false, error: `"${badKey}" is not a coating mechanic. Keys must be one of: ${allowed.join(', ')}.` };
    if (keys.length === 0) return { ok: false, error: 'No coatings found.' };
    setCoatingsOverride(map as Parameters<typeof setCoatingsOverride>[0]);
    set({ coatings: map, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), coatings: map });
    return { ok: true, count: keys.length };
  },
  clearCoatings() {
    setCoatingsOverride(null);
    set({ coatings: null, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), coatings: null });
  },
  loadDiggingJson(json) {
    let parsed: unknown;
    try { parsed = JSON.parse(stripJsonComments(json)); } catch (e) { return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'Digging must be a JSON OBJECT: { itemScores, tagScores, productiveCap, loot: [...] }.' };
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.loot) || obj.loot.length === 0) return { ok: false, error: 'Digging needs a non-empty loot[] array.' };
    setDiggingOverride(obj);
    set({ digging: obj, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), digging: obj });
    return { ok: true, count: (obj.loot as unknown[]).length };
  },
  clearDigging() {
    setDiggingOverride(null);
    set({ digging: null, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), digging: null });
  },

  loadInventoryJson(json) {
    let parsed: unknown;
    try { parsed = JSON.parse(stripJsonComments(json)); }
    catch (e) { return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'Inventory presentation must be a JSON OBJECT: { "labels": { "weapon": "Arsenal", … }, "toolTags": ["multitool", …] }.' };
    const o = parsed as { labels?: unknown; toolTags?: unknown; repairMaterialPct?: unknown };
    const labels = o.labels && typeof o.labels === 'object' && !Array.isArray(o.labels) ? (o.labels as Record<string, string>) : undefined;
    const toolTags = Array.isArray(o.toolTags) ? o.toolTags.map((t) => String(t)) : undefined;
    const repairMaterialPct = typeof o.repairMaterialPct === 'number' && o.repairMaterialPct >= 0 ? o.repairMaterialPct : undefined;
    if (!labels && !toolTags && repairMaterialPct === undefined) return { ok: false, error: 'Provide "labels" (category renames), "toolTags" (extra tool tags), and/or "repairMaterialPct" (repair material cost %).' };
    const next = { ...(labels ? { labels } : {}), ...(toolTags ? { toolTags } : {}), ...(repairMaterialPct !== undefined ? { repairMaterialPct } : {}) };
    setInventoryOverride(next);
    set({ inventory: next, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), inventory: next });
    return { ok: true, count: (labels ? Object.keys(labels).length : 0) + (toolTags ? toolTags.length : 0) };
  },
  clearInventory() {
    setInventoryOverride(null);
    set({ inventory: null, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), inventory: null });
  },

  loadGameBundle(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(json));
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'A whole-game file must be a JSON OBJECT whose keys are the section names (weapons, races, factions, locations, world, lore, …).' };
    }
    const obj = parsed as Record<string, unknown>;
    const tableIds = new Set<string>(CONTENT_TABLES.map((t) => t.id));
    const loreIds = new Set<string>(LORE_BLOCKS.map((b) => b.id));

    const nextTables: Partial<Record<ContentTableId, unknown[]>> = { ...get().tables };
    const nextLore: Partial<Record<LoreBlockId, unknown>> = { ...get().lore };
    const nextMissions: Partial<Record<MissionTableId, unknown[]>> = { ...get().missions };
    let nextHooks: HooksOverride = get().hooks;
    let nextWhispers: unknown[] = get().whispers;
    let nextWasteland: Record<string, unknown> = get().wasteland;
    let nextInteractionTags: Record<string, string[]> = get().interactionTags;
    let nextStartingAreas: unknown[] = get().startingAreas;
    let nextCustomTitles: unknown[] = get().customTitles;
    let nextMainQuest: { title?: string; steps?: unknown[] } | null = get().customMainQuest;
    let nextBosses: unknown[] = get().customBosses;
    let nextCollectables: unknown[] = get().collectables;
    let nextSummons: { noun?: string; defs: unknown[] } | null = get().summons;
    let nextDogEnabled = get().dogEnabled;
    let nextDamageTypes: unknown[] = get().damageTypes;
    let nextDamageResistances: Record<string, unknown> | null = get().damageResistances;
    let nextFusionTags: string[] = get().fusionTags;
    let nextCoatings: Record<string, unknown> | null = get().coatings;
    let nextDigging: Record<string, unknown> | null = get().digging;
    let nextInventory: { labels?: Record<string, string>; toolTags?: string[]; repairMaterialPct?: number } | null = get().inventory;
    let nextNarrator = get().narratorName;
    let nextTitle = get().gameTitle;
    let nextTagline = get().gameTagline;
    let nextCrucibleName = get().crucibleName;
    let nextCrucibleEnabled = get().crucibleEnabled;
    let nextWorldName = get().worldName;
    let nextCorruptionName = get().corruptionName;
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      // Comment / readme keys in the template are ignored, not errors.
      if (key.startsWith('_') || key.startsWith('//')) continue;
      if (key === 'missions') {
        // The Missions object: distribute its mission sub-tables.
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          let any = false;
          for (const mk of MISSION_KEYS) {
            const arr = (value as Record<string, unknown>)[mk];
            if (Array.isArray(arr) && arr.length > 0) { nextMissions[mk] = arr; any = true; }
          }
          if (any) applied.push('missions'); else skipped.push('missions (no recognised sub-tables)');
        } else {
          skipped.push('missions (not an object)');
        }
      } else if (key === 'hooks') {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const v = value as Record<string, unknown>;
          const hasPlants = v.plants && typeof v.plants === 'object';
          const hasChains = v.chains && typeof v.chains === 'object';
          if (hasPlants || hasChains) { nextHooks = v as HooksOverride; applied.push('hooks'); }
          else skipped.push('hooks (no plants/chains)');
        } else {
          skipped.push('hooks (not an object)');
        }
      } else if (key === 'whispers') {
        if (Array.isArray(value) && value.length > 0) { nextWhispers = value; applied.push(`whispers (${value.length})`); }
        else skipped.push('whispers (empty/not an array)');
      } else if (key === 'wasteland') {
        if (value && typeof value === 'object' && !Array.isArray(value)) { nextWasteland = value as Record<string, unknown>; applied.push('wasteland'); }
        else skipped.push('wasteland (not an object)');
      } else if (key === 'interactionTags') {
        if (value && typeof value === 'object' && !Array.isArray(value)) { nextInteractionTags = value as Record<string, string[]>; applied.push('interaction tags'); }
        else skipped.push('interactionTags (not an object)');
      } else if (key === 'startingAreas') {
        if (Array.isArray(value) && value.length > 0) { nextStartingAreas = value; applied.push(`startingAreas (${value.length})`); }
        else skipped.push('startingAreas (empty/not an array)');
      } else if (key === 'titles' || key === 'customTitles') {
        if (Array.isArray(value) && value.length > 0) { nextCustomTitles = value; applied.push(`titles (${value.length})`); }
        else skipped.push('titles (empty/not an array)');
      } else if (key === 'mainQuest' || key === 'customMainQuest') {
        if (value && typeof value === 'object' && Array.isArray((value as { steps?: unknown[] }).steps)) { nextMainQuest = value as { title?: string; steps?: unknown[] }; applied.push(`mainQuest (${((value as { steps?: unknown[] }).steps ?? []).length} steps)`); }
        else skipped.push('mainQuest (no steps[])');
      } else if (key === 'bosses' || key === 'customBosses') {
        if (Array.isArray(value) && value.length > 0) { nextBosses = value; applied.push(`bosses (${value.length})`); }
        else skipped.push('bosses (empty/not an array)');
      } else if (key === 'collectables' || key === 'collectibles') {
        if (Array.isArray(value) && value.length > 0) { nextCollectables = value; applied.push(`collectables (${value.length})`); }
        else skipped.push('collectables (empty/not an array)');
      } else if (key === 'summons' || key === 'sidekicks') {
        // Bundle value may be a bare array of defs, or { noun?, summons|defs: [...] }.
        let noun: string | undefined; let defsV: unknown = value;
        if (!Array.isArray(defsV) && defsV && typeof defsV === 'object') {
          const o = defsV as { noun?: unknown; summons?: unknown; defs?: unknown };
          if (typeof o.noun === 'string') noun = o.noun;
          defsV = Array.isArray(o.summons) ? o.summons : o.defs;
        }
        if (Array.isArray(defsV) && defsV.length > 0) { nextSummons = { noun, defs: defsV }; applied.push(`summons (${defsV.length})`); }
        else skipped.push('summons (empty/not an array)');
      } else if (key === 'dogEnabled' || key === 'dogCompanion') {
        if (typeof value === 'boolean') { nextDogEnabled = value; applied.push(`dogEnabled (${value})`); }
        else skipped.push('dogEnabled (not a boolean)');
      } else if (key === 'damageTypes') {
        let arr: unknown = value;
        if (!Array.isArray(arr) && arr && typeof arr === 'object' && Array.isArray((arr as { types?: unknown[] }).types)) arr = (arr as { types: unknown[] }).types;
        if (Array.isArray(arr) && arr.length > 0) { nextDamageTypes = arr; applied.push(`damageTypes (${arr.length})`); }
        else skipped.push('damageTypes (empty/not an array)');
      } else if (key === 'damageResistances' || key === 'resistances') {
        if (value && typeof value === 'object' && !Array.isArray(value)) { nextDamageResistances = value as Record<string, unknown>; applied.push('damageResistances'); }
        else skipped.push('damageResistances (not an object)');
      } else if (key === 'fusionTags') {
        let arr: unknown = value;
        if (!Array.isArray(arr) && arr && typeof arr === 'object' && Array.isArray((arr as { tags?: unknown[] }).tags)) arr = (arr as { tags: unknown[] }).tags;
        if (Array.isArray(arr) && arr.length > 0) { nextFusionTags = arr.map((t) => String(t).toLowerCase()); applied.push(`fusionTags (${nextFusionTags.length})`); }
        else skipped.push('fusionTags (empty/not an array)');
      } else if (key === 'coatings') {
        if (value && typeof value === 'object' && !Array.isArray(value)) { nextCoatings = value as Record<string, unknown>; applied.push('coatings'); }
        else skipped.push('coatings (not an object)');
      } else if (key === 'digging') {
        if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { loot?: unknown }).loot)) { nextDigging = value as Record<string, unknown>; applied.push('digging'); }
        else skipped.push('digging (needs an object with loot[])');
      } else if (key === 'inventory') {
        if (value && typeof value === 'object' && !Array.isArray(value)) { nextInventory = value as { labels?: Record<string, string>; toolTags?: string[]; repairMaterialPct?: number }; applied.push('inventory'); }
        else skipped.push('inventory (not an object)');
      } else if (tableIds.has(key)) {
        // Tolerate the wrapped shape { "weapons": [...] } nested under the key.
        let rows: unknown = value;
        if (!Array.isArray(rows) && rows && typeof rows === 'object') {
          const arrays = Object.values(rows as Record<string, unknown>).filter(Array.isArray);
          if (arrays.length === 1) rows = arrays[0];
        }
        if (Array.isArray(rows) && rows.length > 0) {
          setTableOverride(key as ContentTableId, rows);
          nextTables[key as ContentTableId] = rows;
          applied.push(`${key} (${rows.length})`);
        } else {
          skipped.push(`${key} (empty/not an array)`);
        }
      } else if (loreIds.has(key)) {
        if (value != null && typeof value === 'object') {
          setLoreOverride(key as LoreBlockId, value);
          nextLore[key as LoreBlockId] = value;
          applied.push(key);
        } else {
          skipped.push(`${key} (not an object)`);
        }
      } else if (key === 'narrator' || key === 'narratorName') {
        if (typeof value === 'string') { nextNarrator = value.trim(); applied.push('narrator name'); }
      } else if (key === 'title' || key === 'gameTitle') {
        if (typeof value === 'string') { nextTitle = value.trim(); applied.push('title'); }
      } else if (key === 'tagline' || key === 'gameTagline') {
        if (typeof value === 'string') { nextTagline = value.trim(); applied.push('tagline'); }
      } else if (key === 'crucibleName') {
        if (typeof value === 'string') { nextCrucibleName = value.trim(); applied.push('crucible name'); }
      } else if (key === 'crucibleEnabled') {
        if (typeof value === 'boolean') { nextCrucibleEnabled = value; applied.push(`crucible ${value ? 'enabled' : 'disabled'}`); }
      } else if (key === 'worldName' || key === 'world_name') {
        if (typeof value === 'string') { nextWorldName = value.trim(); applied.push('world name'); }
      } else if (key === 'corruptionName' || key === 'corruption_name') {
        if (typeof value === 'string') { nextCorruptionName = value.trim(); applied.push('corruption name'); }
      } else {
        skipped.push(`${key} (unknown section)`);
      }
    }

    if (applied.length === 0) {
      return { ok: false, error: `No recognised sections found. Keys must be section names like: ${[...tableIds, ...loreIds, 'title', 'tagline', 'narrator'].join(', ')}.` };
    }

    setMissionsOverride(Object.keys(nextMissions).length > 0 ? nextMissions : null);
    setHooksOverride(Object.keys(nextHooks).length > 0 ? nextHooks : null);
    setWhispersOverride(nextWhispers.length > 0 ? nextWhispers : null);
    setWastelandOverride(Object.keys(nextWasteland).length > 0 ? nextWasteland : null);
    setInteractionTagsOverride(Object.keys(nextInteractionTags).length > 0 ? nextInteractionTags : null);
    invalidateInteractionTagCache();
    setStartingAreasOverride(nextStartingAreas.length > 0 ? nextStartingAreas : null);
    setCustomTitlesOverride(nextCustomTitles.length > 0 ? nextCustomTitles : null);
    setCustomMainQuestOverride(nextMainQuest);
    setCustomBossesOverride(nextBosses.length > 0 ? nextBosses : null);
    setCollectablesOverride(nextCollectables.length > 0 ? nextCollectables : null);
    setSummonsOverride(nextSummons ?? null);
    setDogEnabled(nextDogEnabled !== false);
    setDamageTypesOverride(nextDamageTypes.length > 0 ? (nextDamageTypes as { name: string; keywords?: string[] }[]) : null);
    setDamageResistancesOverride(nextDamageResistances && Object.keys(nextDamageResistances).length > 0 ? (nextDamageResistances as Record<string, { resist: string[]; weak: string[] }>) : null);
    setFusionTagsOverride(nextFusionTags.length > 0 ? nextFusionTags : null);
    setCoatingsOverride(nextCoatings && Object.keys(nextCoatings).length > 0 ? (nextCoatings as Parameters<typeof setCoatingsOverride>[0]) : null);
    setDiggingOverride(nextDigging && Object.keys(nextDigging).length > 0 ? nextDigging : null);
    setInventoryOverride(nextInventory ?? null);
    setNarratorNameOverride(nextNarrator || null);
    setGameTitleOverride(nextTitle || null);
    setGameTaglineOverride(nextTagline || null);
    setCrucibleNameOverride(nextCrucibleName || null);
    setCrucibleEnabled(nextCrucibleEnabled);
    setWorldNameOverride(nextWorldName || null);
    setCorruptionNameOverride(nextCorruptionName || null);
    set({
      tables: nextTables,
      lore: nextLore,
      missions: nextMissions,
      hooks: nextHooks,
      whispers: nextWhispers,
      wasteland: nextWasteland,
      interactionTags: nextInteractionTags,
      startingAreas: nextStartingAreas,
      customTitles: nextCustomTitles,
      customMainQuest: nextMainQuest,
      customBosses: nextBosses,
      collectables: nextCollectables,
      summons: nextSummons,
      dogEnabled: nextDogEnabled,
      damageTypes: nextDamageTypes,
      damageResistances: nextDamageResistances,
      fusionTags: nextFusionTags,
      coatings: nextCoatings,
      digging: nextDigging,
      inventory: nextInventory,
      narratorName: nextNarrator,
      gameTitle: nextTitle,
      gameTagline: nextTagline,
      crucibleName: nextCrucibleName,
      crucibleEnabled: nextCrucibleEnabled,
      worldName: nextWorldName,
      corruptionName: nextCorruptionName,
      contentVersion: get().contentVersion + 1,
    });
    persist({ ...get(), tables: nextTables, lore: nextLore, missions: nextMissions, hooks: nextHooks, whispers: nextWhispers, wasteland: nextWasteland, interactionTags: nextInteractionTags, startingAreas: nextStartingAreas, customTitles: nextCustomTitles, customMainQuest: nextMainQuest, customBosses: nextBosses, collectables: nextCollectables, summons: nextSummons, dogEnabled: nextDogEnabled, damageTypes: nextDamageTypes, damageResistances: nextDamageResistances, fusionTags: nextFusionTags, coatings: nextCoatings, digging: nextDigging, inventory: nextInventory, narratorName: nextNarrator, gameTitle: nextTitle, gameTagline: nextTagline, crucibleName: nextCrucibleName, crucibleEnabled: nextCrucibleEnabled, worldName: nextWorldName, corruptionName: nextCorruptionName });
    invalidateLocationCaches(); // a bundle may have replaced the locations table / placements
    const summary = `Loaded: ${applied.join(', ')}.${skipped.length ? ` Skipped: ${skipped.join(', ')}.` : ''}`;
    return { ok: true, summary };
  },

  exportGameBundle() {
    const s = get();
    const out: Record<string, unknown> = {};
    // Identity scalars first (only when set).
    if (s.gameTitle) out.title = s.gameTitle;
    if (s.gameTagline) out.tagline = s.gameTagline;
    if (s.narratorName) out.narrator = s.narratorName;
    if (s.crucibleName) out.crucibleName = s.crucibleName;
    if (s.crucibleEnabled === false) out.crucibleEnabled = false;
    if (s.worldName) out.worldName = s.worldName;
    if (s.corruptionName) out.corruptionName = s.corruptionName;
    // Lore blocks (world / faction / race / flavor), in the registry's order.
    for (const b of LORE_BLOCKS) {
      const v = s.lore[b.id];
      if (v != null) out[b.id] = v;
    }
    // Every uploaded content table, in display order.
    for (const t of CONTENT_TABLES) {
      const rows = s.tables[t.id];
      if (Array.isArray(rows) && rows.length > 0) out[t.id] = rows;
    }
    // The mission set, nested under one "missions" key.
    if (Object.keys(s.missions).length > 0) out.missions = s.missions;
    // The hook set, nested under one "hooks" key.
    if (Object.keys(s.hooks).length > 0) out.hooks = s.hooks;
    // The whisper chains array.
    if (s.whispers.length > 0) out.whispers = s.whispers;
    // The wasteland encounters object.
    if (Object.keys(s.wasteland).length > 0) out.wasteland = s.wasteland;
    // The interaction-tag keyword additions.
    if (Object.keys(s.interactionTags).length > 0) out.interactionTags = s.interactionTags;
    // The per-faction starting areas.
    if (s.startingAreas.length > 0) out.startingAreas = s.startingAreas;
    if (s.customTitles.length > 0) out.titles = s.customTitles;
    if (s.customMainQuest) out.mainQuest = s.customMainQuest;
    if (s.customBosses.length > 0) out.bosses = s.customBosses;
    if (s.collectables.length > 0) out.collectables = s.collectables;
    if (s.summons && Array.isArray(s.summons.defs) && s.summons.defs.length > 0) out.summons = s.summons;
    if (s.dogEnabled === false) out.dogEnabled = false;
    if (s.damageTypes.length > 0) out.damageTypes = s.damageTypes;
    if (s.damageResistances && Object.keys(s.damageResistances).length > 0) out.damageResistances = s.damageResistances;
    if (s.fusionTags.length > 0) out.fusionTags = s.fusionTags;
    if (s.coatings && Object.keys(s.coatings).length > 0) out.coatings = s.coatings;
    if (s.digging && Object.keys(s.digging).length > 0) out.digging = s.digging;
    if (s.inventory && ((s.inventory.labels && Object.keys(s.inventory.labels).length > 0) || (s.inventory.toolTags && s.inventory.toolTags.length > 0) || typeof s.inventory.repairMaterialPct === 'number')) out.inventory = s.inventory;
    return JSON.stringify(out, null, 2);
  },

  clearTable(id) {
    setTableOverride(id, null);
    if (id === 'locations') invalidateLocationCaches();
    const tables = { ...get().tables };
    delete tables[id];
    set({ tables, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), tables });
  },

  clearLore(id) {
    setLoreOverride(id, null);
    const lore = { ...get().lore };
    delete lore[id];
    set({ lore, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), lore });
  },

  clearMissions() {
    setMissionsOverride(null);
    const missions = {};
    set({ missions, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), missions });
  },

  clearHooks() {
    setHooksOverride(null);
    const hooks = {};
    set({ hooks, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), hooks });
  },

  clearWhispers() {
    setWhispersOverride(null);
    const whispers: unknown[] = [];
    set({ whispers, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), whispers });
  },

  clearWasteland() {
    setWastelandOverride(null);
    const wasteland = {};
    set({ wasteland, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), wasteland });
  },

  clearInteractionTags() {
    setInteractionTagsOverride(null);
    invalidateInteractionTagCache();
    const interactionTags = {};
    set({ interactionTags, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), interactionTags });
  },

  clearStartingAreas() {
    setStartingAreasOverride(null);
    invalidateLocationCaches();
    const startingAreas: unknown[] = [];
    set({ startingAreas, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), startingAreas });
  },

  clearAll() {
    clearAllOverrides();
    setPublishedFlag(false);
    invalidateLocationCaches();
    set({ tables: {}, lore: {}, missions: {}, hooks: {}, whispers: [], wasteland: {}, interactionTags: {}, startingAreas: [], customTitles: [], customMainQuest: null, customBosses: [], collectables: [], summons: null, dogEnabled: true, damageTypes: [], damageResistances: null, fusionTags: [], coatings: null, digging: null, inventory: null, published: false, narratorName: '', gameTitle: '', gameTagline: '', crucibleName: '', crucibleEnabled: true, worldName: '', corruptionName: '', devMode: true });
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => { /* best effort */ });
  },

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const shape = JSON.parse(raw) as PersistShape;
        const tables = shape.tables ?? {};
        const lore = shape.lore ?? {};
        // Mirror into the registry so the engine reads the override immediately.
        for (const [id, rows] of Object.entries(tables)) {
          if (Array.isArray(rows)) setTableOverride(id as ContentTableId, rows);
        }
        for (const [id, value] of Object.entries(lore)) {
          setLoreOverride(id as LoreBlockId, value);
        }
        const missions = shape.missions ?? {};
        setMissionsOverride(Object.keys(missions).length > 0 ? missions : null);
        const hooks = shape.hooks ?? {};
        setHooksOverride(Object.keys(hooks).length > 0 ? hooks : null);
        const whispers = shape.whispers ?? [];
        setWhispersOverride(whispers.length > 0 ? whispers : null);
        const wasteland = shape.wasteland && typeof shape.wasteland === 'object' ? shape.wasteland : {};
        setWastelandOverride(Object.keys(wasteland).length > 0 ? wasteland : null);
        const interactionTags = shape.interactionTags && typeof shape.interactionTags === 'object' ? shape.interactionTags : {};
        setInteractionTagsOverride(Object.keys(interactionTags).length > 0 ? interactionTags : null);
        invalidateInteractionTagCache();
        const startingAreas = Array.isArray(shape.startingAreas) ? shape.startingAreas : [];
        setStartingAreasOverride(startingAreas.length > 0 ? startingAreas : null);
        const customTitles = Array.isArray(shape.customTitles) ? shape.customTitles : [];
        setCustomTitlesOverride(customTitles.length > 0 ? customTitles : null);
        const customMainQuest = (shape.customMainQuest && typeof shape.customMainQuest === 'object') ? shape.customMainQuest : null;
        setCustomMainQuestOverride(customMainQuest);
        const customBosses = Array.isArray(shape.customBosses) ? shape.customBosses : [];
        setCustomBossesOverride(customBosses.length > 0 ? customBosses : null);
        const collectables = Array.isArray(shape.collectables) ? shape.collectables : [];
        setCollectablesOverride(collectables.length > 0 ? collectables : null);
        const summons = shape.summons && typeof shape.summons === 'object' && Array.isArray((shape.summons as { defs?: unknown[] }).defs) && (shape.summons as { defs: unknown[] }).defs.length > 0
          ? (shape.summons as { noun?: string; defs: unknown[] }) : null;
        setSummonsOverride(summons as { noun?: string; defs: never[] } | null);
        const dogEnabled = shape.dogEnabled !== false;
        setDogEnabled(dogEnabled);
        const damageTypes = Array.isArray(shape.damageTypes) ? shape.damageTypes : [];
        setDamageTypesOverride(damageTypes.length > 0 ? (damageTypes as { name: string; keywords?: string[] }[]) : null);
        const damageResistances = shape.damageResistances && typeof shape.damageResistances === 'object' ? (shape.damageResistances as Record<string, { resist: string[]; weak: string[] }>) : null;
        setDamageResistancesOverride(damageResistances && Object.keys(damageResistances).length > 0 ? damageResistances : null);
        const fusionTags = Array.isArray(shape.fusionTags) ? (shape.fusionTags as string[]) : [];
        setFusionTagsOverride(fusionTags.length > 0 ? fusionTags : null);
        const coatings = shape.coatings && typeof shape.coatings === 'object' ? (shape.coatings as Record<string, unknown>) : null;
        setCoatingsOverride(coatings && Object.keys(coatings).length > 0 ? (coatings as Parameters<typeof setCoatingsOverride>[0]) : null);
        const digging = shape.digging && typeof shape.digging === 'object' ? (shape.digging as Record<string, unknown>) : null;
        setDiggingOverride(digging && Object.keys(digging).length > 0 ? digging : null);
        const inventory = shape.inventory && typeof shape.inventory === 'object' && !Array.isArray(shape.inventory) ? (shape.inventory as { labels?: Record<string, string>; toolTags?: string[]; repairMaterialPct?: number }) : null;
        setInventoryOverride(inventory);
        const published = shape.published === true;
        setPublishedFlag(published);
        const narratorName = typeof shape.narratorName === 'string' ? shape.narratorName : '';
        setNarratorNameOverride(narratorName.length > 0 ? narratorName : null);
        const gameTitle = typeof shape.gameTitle === 'string' ? shape.gameTitle : '';
        setGameTitleOverride(gameTitle.length > 0 ? gameTitle : null);
        const gameTagline = typeof shape.gameTagline === 'string' ? shape.gameTagline : '';
        setGameTaglineOverride(gameTagline.length > 0 ? gameTagline : null);
        const crucibleName = typeof shape.crucibleName === 'string' ? shape.crucibleName : '';
        setCrucibleNameOverride(crucibleName.length > 0 ? crucibleName : null);
        const crucibleEnabled = shape.crucibleEnabled !== false;
        setCrucibleEnabled(crucibleEnabled);
        const worldName = typeof shape.worldName === 'string' ? shape.worldName : '';
        setWorldNameOverride(worldName.length > 0 ? worldName : null);
        const corruptionName = typeof shape.corruptionName === 'string' ? shape.corruptionName : '';
        setCorruptionNameOverride(corruptionName.length > 0 ? corruptionName : null);
        // Absent → true (engine dev build defaults to dev mode on).
        const devMode = shape.devMode !== false;
        invalidateLocationCaches(); // routing positions must reflect the hydrated locations
        set({ tables, lore, missions, hooks, whispers, wasteland, interactionTags, startingAreas, customTitles, customMainQuest, customBosses, collectables, summons, dogEnabled, damageTypes, damageResistances, fusionTags, coatings, digging, inventory, published, narratorName, gameTitle, gameTagline, crucibleName, crucibleEnabled, worldName, corruptionName, devMode });
      }
    } catch {
      /* corrupt pack — ignore, run on the built-in Tartaria defaults */
    } finally {
      set({ hydrated: true });
    }
  },
}));

/** Convenience for non-React reads of the live narrator name. */
export function currentNarratorName(): string {
  return getNarratorName();
}
