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
  CONTENT_TABLES,
  LORE_BLOCKS,
  type ContentTableId,
  type LoreBlockId,
  type MissionTableId,
  type HooksOverride,
} from '../engine/contentPack';

/** The mission sub-tables an uploaded Missions object may carry. */
const MISSION_KEYS: MissionTableId[] = ['hunts', 'mysteries', 'factionQuests', 'storylines', 'objectives', 'complications', 'rewards'];

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
  published?: boolean;
  /** Custom narrator name; '' / absent → the default "Narrator". */
  narratorName?: string;
  /** Custom game title; '' / absent → the default "Text RPG Engine". */
  gameTitle?: string;
  /** Custom tagline; '' / absent → world-lore tagline or the default. */
  gameTagline?: string;
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
  /** When true the title DEV pill is hidden (clean family build). The "Verbal"
   *  backdoor stays open for the author; reversible via unpublish(). */
  published: boolean;
  /** The author's custom narrator name ('' = use the default "Narrator"). */
  narratorName: string;
  /** The author's custom game title ('' = use the default "Text RPG Engine"). */
  gameTitle: string;
  /** The author's custom tagline ('' = world-lore tagline or the default). */
  gameTagline: string;
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
  clearAll: () => void;
  /** Load any persisted pack on boot and mirror it into the registry. */
  hydrate: () => Promise<void>;
}

function persist(state: Pick<ContentPackState, 'tables' | 'lore' | 'missions' | 'hooks' | 'published' | 'narratorName' | 'gameTitle' | 'gameTagline' | 'devMode'>): void {
  const shape: PersistShape = {
    tables: state.tables,
    lore: state.lore,
    missions: Object.keys(state.missions).length > 0 ? state.missions : undefined,
    hooks: Object.keys(state.hooks).length > 0 ? state.hooks : undefined,
    published: state.published,
    narratorName: state.narratorName || undefined,
    gameTitle: state.gameTitle || undefined,
    gameTagline: state.gameTagline || undefined,
    devMode: state.devMode,
  };
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(shape)).catch(() => { /* best effort */ });
}

export const useContentPackStore = create<ContentPackState>((set, get) => ({
  tables: {},
  lore: {},
  missions: {},
  hooks: {},
  published: false,
  narratorName: '',
  gameTitle: '',
  gameTagline: '',
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
    setNarratorNameOverride(s.narratorName || null);
    setGameTitleOverride(s.gameTitle || null);
    setGameTaglineOverride(s.gameTagline || null);
    setPublishedFlag(s.published);
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

  loadTableJson(id, json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
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
    const tables = { ...get().tables, [id]: parsed };
    set({ tables, contentVersion: get().contentVersion + 1 });
    persist({ ...get(), tables });
    return { ok: true, count: parsed.length };
  },

  loadLoreJson(id, json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
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
    let nextNarrator = get().narratorName;
    let nextTitle = get().gameTitle;
    let nextTagline = get().gameTagline;
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
      } else {
        skipped.push(`${key} (unknown section)`);
      }
    }

    if (applied.length === 0) {
      return { ok: false, error: `No recognised sections found. Keys must be section names like: ${[...tableIds, ...loreIds, 'title', 'tagline', 'narrator'].join(', ')}.` };
    }

    setMissionsOverride(Object.keys(nextMissions).length > 0 ? nextMissions : null);
    setHooksOverride(Object.keys(nextHooks).length > 0 ? nextHooks : null);
    setNarratorNameOverride(nextNarrator || null);
    setGameTitleOverride(nextTitle || null);
    setGameTaglineOverride(nextTagline || null);
    set({
      tables: nextTables,
      lore: nextLore,
      missions: nextMissions,
      hooks: nextHooks,
      narratorName: nextNarrator,
      gameTitle: nextTitle,
      gameTagline: nextTagline,
      contentVersion: get().contentVersion + 1,
    });
    persist({ ...get(), tables: nextTables, lore: nextLore, missions: nextMissions, hooks: nextHooks, narratorName: nextNarrator, gameTitle: nextTitle, gameTagline: nextTagline });
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
    return JSON.stringify(out, null, 2);
  },

  clearTable(id) {
    setTableOverride(id, null);
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

  clearAll() {
    clearAllOverrides();
    setPublishedFlag(false);
    set({ tables: {}, lore: {}, missions: {}, hooks: {}, published: false, narratorName: '', gameTitle: '', gameTagline: '', devMode: true });
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
        const published = shape.published === true;
        setPublishedFlag(published);
        const narratorName = typeof shape.narratorName === 'string' ? shape.narratorName : '';
        setNarratorNameOverride(narratorName.length > 0 ? narratorName : null);
        const gameTitle = typeof shape.gameTitle === 'string' ? shape.gameTitle : '';
        setGameTitleOverride(gameTitle.length > 0 ? gameTitle : null);
        const gameTagline = typeof shape.gameTagline === 'string' ? shape.gameTagline : '';
        setGameTaglineOverride(gameTagline.length > 0 ? gameTagline : null);
        // Absent → true (engine dev build defaults to dev mode on).
        const devMode = shape.devMode !== false;
        set({ tables, lore, missions, hooks, published, narratorName, gameTitle, gameTagline, devMode });
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
