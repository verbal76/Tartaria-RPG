// engine_Dev — content-pack store. Holds the developer's uploaded table/lore
// overrides, validates + persists them, and mirrors them into the contentPack
// registry so the engine reads them. Separate from the gameStore so a content
// pack survives across new games and isn't entangled with save slots.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setTableOverride,
  setLoreOverride,
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
}

interface ContentPackState {
  tables: Partial<Record<ContentTableId, unknown[]>>;
  lore: Partial<Record<LoreBlockId, unknown>>;
  /** Once true, the developer door is closed + uploads are locked — ships as a
   *  normal game. */
  published: boolean;
  hydrated: boolean;
  /** Close the developer door and lock uploads — permanent (until a full reset). */
  publish: () => void;
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

function persist(state: Pick<ContentPackState, 'tables' | 'lore' | 'published'>): void {
  const shape: PersistShape = { tables: state.tables, lore: state.lore, published: state.published };
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(shape)).catch(() => { /* best effort */ });
}

export const useContentPackStore = create<ContentPackState>((set, get) => ({
  tables: {},
  lore: {},
  published: false,
  hydrated: false,

  publish() {
    setPublishedFlag(true);
    set({ published: true });
    persist({ tables: get().tables, lore: get().lore, published: true });
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
    persist({ tables, lore: get().lore, published: get().published });
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
    persist({ tables: get().tables, lore, published: get().published });
    return { ok: true };
  },

  clearTable(id) {
    setTableOverride(id, null);
    const tables = { ...get().tables };
    delete tables[id];
    set({ tables });
    persist({ tables, lore: get().lore, published: get().published });
  },

  clearLore(id) {
    setLoreOverride(id, null);
    const lore = { ...get().lore };
    delete lore[id];
    set({ lore });
    persist({ tables: get().tables, lore, published: get().published });
  },

  clearAll() {
    clearAllOverrides();
    setPublishedFlag(false);
    set({ tables: {}, lore: {}, published: false });
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
        set({ tables, lore, published });
      }
    } catch {
      /* corrupt pack — ignore, run on the built-in Tartaria defaults */
    } finally {
      set({ hydrated: true });
    }
  },
}));
