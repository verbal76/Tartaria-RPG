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

function persist(state: Pick<ContentPackState, 'tables' | 'lore' | 'published' | 'narratorName' | 'gameTitle' | 'gameTagline'>): void {
  const shape: PersistShape = {
    tables: state.tables,
    lore: state.lore,
    published: state.published,
    narratorName: state.narratorName || undefined,
    gameTitle: state.gameTitle || undefined,
    gameTagline: state.gameTagline || undefined,
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
  hydrated: false,

  publish() {
    setPublishedFlag(true);
    set({ published: true });
    persist({ ...get(), published: true });
  },

  unpublish() {
    setPublishedFlag(false);
    set({ published: false });
    persist({ ...get(), published: false });
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
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'A table must be a JSON array of rows.' };
    }
    if (parsed.length === 0) {
      return { ok: false, error: 'The array is empty.' };
    }
    setTableOverride(id, parsed);
    const tables = { ...get().tables, [id]: parsed };
    set({ tables });
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
    setLoreOverride(id, parsed);
    const lore = { ...get().lore, [id]: parsed };
    set({ lore });
    persist({ ...get(), lore });
    return { ok: true };
  },

  clearTable(id) {
    setTableOverride(id, null);
    const tables = { ...get().tables };
    delete tables[id];
    set({ tables });
    persist({ ...get(), tables });
  },

  clearLore(id) {
    setLoreOverride(id, null);
    const lore = { ...get().lore };
    delete lore[id];
    set({ lore });
    persist({ ...get(), lore });
  },

  clearAll() {
    clearAllOverrides();
    setPublishedFlag(false);
    set({ tables: {}, lore: {}, published: false, narratorName: '', gameTitle: '', gameTagline: '' });
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
        set({ tables, lore, published, narratorName, gameTitle, gameTagline });
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
