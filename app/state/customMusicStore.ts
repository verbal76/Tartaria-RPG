// engine_Dev — custom music store. Holds the developer's uploaded BATTLE and
// AMBIENT tracks, copies the picked files into the app document directory (so
// they survive restarts and travel inside the APK's data), persists the track
// list to AsyncStorage, and mirrors the resolved pools into AudioManager so the
// uploads replace the built-in score at runtime. Separate from gameStore so the
// soundtrack survives across new games / save slots.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { setCustomPool, type TrackEntry } from '../audio/AudioManager';
import {
  type MusicCategory,
  type CustomTrack,
  DEFAULT_BASE_VOLUME,
  MAX_TRACKS_PER_CATEGORY,
  canAddTrack,
  addTrack,
  removeTrack,
  contextsForCategory,
  sanitizeTrackName,
  extensionOf,
  isAcceptableAudio,
} from '../audio/customMusic';

const STORAGE_KEY = 'tartaria.customMusic.v1';
const MUSIC_DIR = (FileSystem.documentDirectory ?? '') + 'engine-music/';

export interface AddResult {
  ok: boolean;
  /** Set on real failures; left undefined on a silent user-cancel. */
  error?: string;
  canceled?: boolean;
  /** How many tracks were added (multi-select). */
  added?: number;
  /** Names skipped (non-audio / category full). */
  skipped?: string[];
}

interface PersistShape {
  battle: CustomTrack[];
  ambient: CustomTrack[];
}

interface CustomMusicState {
  battle: CustomTrack[];
  ambient: CustomTrack[];
  hydrated: boolean;
  /** Open the OS file picker, copy the chosen audio file into the document
   *  directory, append it to the category, persist, and re-sync AudioManager. */
  addFromPicker: (category: MusicCategory) => Promise<AddResult>;
  /** Remove one uploaded track (deletes the on-disk file too). */
  remove: (category: MusicCategory, id: string) => void;
  /** Drop every uploaded track in a category (built-ins take over again). */
  clearCategory: (category: MusicCategory) => void;
  /** Load persisted uploads on boot and mirror them into AudioManager. */
  hydrate: () => Promise<void>;
}

function listFor(state: CustomMusicState, category: MusicCategory): CustomTrack[] {
  return category === 'battle' ? state.battle : state.ambient;
}

function toEntries(list: CustomTrack[]): TrackEntry[] {
  return list.map((t) => ({ id: t.id, source: { uri: t.uri }, baseVolume: t.baseVolume }));
}

/** Push a category's tracks into every AudioManager context it drives. Empty
 *  list → null (AudioManager falls back to the built-in pool). */
function syncToAudio(category: MusicCategory, list: CustomTrack[]): void {
  const entries = list.length > 0 ? toEntries(list) : null;
  for (const ctx of contextsForCategory(category)) {
    setCustomPool(ctx, entries);
  }
}

function persist(state: Pick<CustomMusicState, 'battle' | 'ambient'>): void {
  const shape: PersistShape = { battle: state.battle, ambient: state.ambient };
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(shape)).catch(() => { /* best effort */ });
}

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(MUSIC_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(MUSIC_DIR, { intermediates: true });
  } catch {
    /* best effort — copy below will surface a real failure */
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useCustomMusicStore = create<CustomMusicState>((set, get) => ({
  battle: [],
  ambient: [],
  hydrated: false,

  async addFromPicker(category) {
    if (!canAddTrack(listFor(get(), category))) {
      return { ok: false, error: `That's the limit (${MAX_TRACKS_PER_CATEGORY}). Remove one first.` };
    }
    // engine_Dev — multi-select: pick several audio files at once, add each up to
    // the per-category cap (so you build a playlist, not one-at-a-time).
    let assets: Array<{ uri: string; name?: string | null; mimeType?: string | null }>;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled) return { ok: false, canceled: true };
      assets = res.assets ?? [];
      if (assets.length === 0) return { ok: false, error: 'No files were returned by the picker.' };
    } catch (e) {
      return { ok: false, error: `Picker failed: ${e instanceof Error ? e.message : String(e)}` };
    }

    let added = 0;
    const skipped: string[] = [];
    try {
      await ensureDir();
      for (const asset of assets) {
        if (!canAddTrack(listFor(get(), category))) { skipped.push('(category full)'); break; }
        const name = asset.name ?? 'track';
        if (!isAcceptableAudio(asset.mimeType, name)) { skipped.push(name); continue; }
        const id = newId();
        const ext = extensionOf(name) || 'mp3';
        const destUri = `${MUSIC_DIR}${category}-${id}.${ext}`;
        await FileSystem.copyAsync({ from: asset.uri, to: destUri });
        const track: CustomTrack = {
          id,
          name: sanitizeTrackName(name),
          uri: destUri,
          baseVolume: DEFAULT_BASE_VOLUME[category],
        };
        const nextList = addTrack(listFor(get(), category), track);
        set(category === 'battle' ? { battle: nextList } : { ambient: nextList });
        syncToAudio(category, nextList);
        added++;
      }
      persist(get());
    } catch (e) {
      return { ok: false, error: `Couldn’t save a file: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (added === 0) return { ok: false, error: 'None were audio files. Use MP3 / M4A / AAC / WAV / OGG.' };
    return { ok: true, added, skipped: skipped.length > 0 ? skipped : undefined };
  },

  remove(category, id) {
    const list = listFor(get(), category);
    const gone = list.find((t) => t.id === id);
    if (gone) void FileSystem.deleteAsync(gone.uri, { idempotent: true }).catch(() => { /* best effort */ });
    const nextList = removeTrack(list, id);
    set(category === 'battle' ? { battle: nextList } : { ambient: nextList });
    persist(get());
    syncToAudio(category, nextList);
  },

  clearCategory(category) {
    const list = listFor(get(), category);
    for (const t of list) {
      void FileSystem.deleteAsync(t.uri, { idempotent: true }).catch(() => { /* best effort */ });
    }
    set(category === 'battle' ? { battle: [] } : { ambient: [] });
    persist(get());
    syncToAudio(category, []);
  },

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const shape = JSON.parse(raw) as PersistShape;
        const battle = Array.isArray(shape.battle) ? shape.battle : [];
        const ambient = Array.isArray(shape.ambient) ? shape.ambient : [];
        set({ battle, ambient });
        syncToAudio('battle', battle);
        syncToAudio('ambient', ambient);
      }
    } catch {
      /* corrupt — ignore, run on the built-in score */
    } finally {
      set({ hydrated: true });
    }
  },
}));
