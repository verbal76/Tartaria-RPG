// engine_Dev — custom maps store. Holds the developer's uploaded MAP IMAGES: one
// WORLD map (the overworld backdrop) and an optional per-FACTION starting-area map
// (shown when the player is in that faction's base). Picked images are copied into
// the app document directory (so they survive restarts + ride inside the APK data),
// and the URIs + the world's coordinate size (width × height, used to plot location
// pins) persist to AsyncStorage. Separate from gameStore so maps survive across
// new games / save slots. Mirrors customMusicStore's upload pipeline.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

const STORAGE_KEY = 'tartaria.customMaps.v1';
const MAPS_DIR = (FileSystem.documentDirectory ?? '') + 'engine-maps/';

/** Default coordinate space when the author hasn't set one. Location pins are
 *  plotted at (location.x / worldWidth, location.y / worldHeight). */
export const DEFAULT_WORLD_W = 100;
export const DEFAULT_WORLD_H = 100;

export interface MapAddResult {
  ok: boolean;
  error?: string;
  canceled?: boolean;
}

interface PersistShape {
  worldMap?: string;
  factionMaps?: Record<string, string>;
  worldWidth?: number;
  worldHeight?: number;
}

interface CustomMapsState {
  /** URI of the uploaded world map image, or null for none (neutral backdrop). */
  worldMap: string | null;
  /** factionId → URI of that faction's starting-area map. */
  factionMaps: Record<string, string>;
  /** The world's coordinate width/height — the space location x/y are given in. */
  worldWidth: number;
  worldHeight: number;
  hydrated: boolean;
  /** Bumped on any change so map-reading screens re-render. */
  version: number;
  /** Pick + store the world map image. */
  pickWorldMap: () => Promise<MapAddResult>;
  /** Pick + store a faction's starting-area map. */
  pickFactionMap: (factionId: string) => Promise<MapAddResult>;
  clearWorldMap: () => void;
  clearFactionMap: (factionId: string) => void;
  /** Set the world coordinate size used to plot location pins. */
  setWorldSize: (width: number, height: number) => void;
  hydrate: () => Promise<void>;
}

function persist(state: Pick<CustomMapsState, 'worldMap' | 'factionMaps' | 'worldWidth' | 'worldHeight'>): void {
  const shape: PersistShape = {
    worldMap: state.worldMap ?? undefined,
    factionMaps: Object.keys(state.factionMaps).length > 0 ? state.factionMaps : undefined,
    worldWidth: state.worldWidth,
    worldHeight: state.worldHeight,
  };
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(shape)).catch(() => { /* best effort */ });
}

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(MAPS_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(MAPS_DIR, { intermediates: true });
  } catch {
    /* best effort */
  }
}

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1]!.toLowerCase() : 'png';
}

function isAcceptableImage(mime?: string | null, name?: string): boolean {
  if (mime && /^image\//i.test(mime)) return true;
  return /\.(png|jpg|jpeg|webp)$/i.test(name ?? '');
}

async function pickImageTo(prefix: string): Promise<{ ok: boolean; uri?: string; error?: string; canceled?: boolean }> {
  let picked: { uri: string; name: string; mimeType?: string | null } | null = null;
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return { ok: false, canceled: true };
    const asset = res.assets?.[0];
    if (!asset) return { ok: false, error: 'No file was returned by the picker.' };
    picked = { uri: asset.uri, name: asset.name ?? 'map', mimeType: asset.mimeType };
  } catch (e) {
    return { ok: false, error: `Picker failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!isAcceptableImage(picked.mimeType, picked.name)) {
    return { ok: false, error: 'That doesn’t look like an image. Use PNG / JPG / WEBP.' };
  }
  try {
    await ensureDir();
    const ext = extensionOf(picked.name) || 'png';
    // Unique name per upload so the OS image cache can't serve a stale frame.
    const destUri = `${MAPS_DIR}${prefix}-${Date.now().toString(36)}.${ext}`;
    await FileSystem.copyAsync({ from: picked.uri, to: destUri });
    return { ok: true, uri: destUri };
  } catch (e) {
    return { ok: false, error: `Couldn’t save the image: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const useCustomMapsStore = create<CustomMapsState>((set, get) => ({
  worldMap: null,
  factionMaps: {},
  worldWidth: DEFAULT_WORLD_W,
  worldHeight: DEFAULT_WORLD_H,
  hydrated: false,
  version: 0,

  async pickWorldMap() {
    const r = await pickImageTo('world');
    if (!r.ok || !r.uri) return { ok: false, error: r.error, canceled: r.canceled };
    const prev = get().worldMap;
    if (prev) void FileSystem.deleteAsync(prev, { idempotent: true }).catch(() => { /* best effort */ });
    set({ worldMap: r.uri, version: get().version + 1 });
    persist(get());
    return { ok: true };
  },

  async pickFactionMap(factionId) {
    const r = await pickImageTo(`faction-${factionId}`);
    if (!r.ok || !r.uri) return { ok: false, error: r.error, canceled: r.canceled };
    const prev = get().factionMaps[factionId];
    if (prev) void FileSystem.deleteAsync(prev, { idempotent: true }).catch(() => { /* best effort */ });
    set({ factionMaps: { ...get().factionMaps, [factionId]: r.uri }, version: get().version + 1 });
    persist(get());
    return { ok: true };
  },

  clearWorldMap() {
    const prev = get().worldMap;
    if (prev) void FileSystem.deleteAsync(prev, { idempotent: true }).catch(() => { /* best effort */ });
    set({ worldMap: null, version: get().version + 1 });
    persist(get());
  },

  clearFactionMap(factionId) {
    const prev = get().factionMaps[factionId];
    if (prev) void FileSystem.deleteAsync(prev, { idempotent: true }).catch(() => { /* best effort */ });
    const next = { ...get().factionMaps };
    delete next[factionId];
    set({ factionMaps: next, version: get().version + 1 });
    persist(get());
  },

  setWorldSize(width, height) {
    const w = Math.max(1, Math.round(width) || DEFAULT_WORLD_W);
    const h = Math.max(1, Math.round(height) || DEFAULT_WORLD_H);
    set({ worldWidth: w, worldHeight: h, version: get().version + 1 });
    persist(get());
  },

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const shape = JSON.parse(raw) as PersistShape;
        set({
          worldMap: typeof shape.worldMap === 'string' ? shape.worldMap : null,
          factionMaps: shape.factionMaps && typeof shape.factionMaps === 'object' ? shape.factionMaps : {},
          worldWidth: typeof shape.worldWidth === 'number' && shape.worldWidth > 0 ? shape.worldWidth : DEFAULT_WORLD_W,
          worldHeight: typeof shape.worldHeight === 'number' && shape.worldHeight > 0 ? shape.worldHeight : DEFAULT_WORLD_H,
        });
      }
    } catch {
      /* corrupt — run on no maps */
    } finally {
      set({ hydrated: true });
    }
  },
}));
