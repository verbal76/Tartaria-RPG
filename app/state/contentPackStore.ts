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
  type ContentTableId,
  type LoreBlockId,
} from '../engine/contentPack';

const STORAGE_KEY = 'tartaria.contentPack.v1';

export interface LoadResult {
  ok: boolean;
  error?: string;
  count?: number;
}

interface PersistShape {
  tables: Partial<Record<ContentTableId, unknown[]>>;
  lore: Partial<Record<LoreBlockId, unknown>>;
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
  clearTable: (id: ContentTableId) => void;
  clearLore: (id: LoreBlockId) => void;
  clearAll: () => void;
  /** Load any persisted pack on boot and mirror it into the registry. */
  hydrate: () => Promise<void>;
}

function persist(state: Pick<ContentPackState, 'tables' | 'lore' | 'published' | 'narratorName' | 'gameTitle' | 'gameTagline' | 'devMode'>): void {
  const shape: PersistShape = {
    tables: state.tables,
    lore: state.lore,
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

  clearAll() {
    clearAllOverrides();
    setPublishedFlag(false);
    set({ tables: {}, lore: {}, published: false, narratorName: '', gameTitle: '', gameTagline: '', devMode: true });
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
        set({ tables, lore, published, narratorName, gameTitle, gameTagline, devMode });
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
