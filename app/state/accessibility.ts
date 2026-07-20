// OTA-898 (SA-6) — device-level accessibility preferences.
//
// Kept in its own tiny store, persisted to a dedicated AsyncStorage key rather
// than the save blob: these are DEVICE settings (they should hold across
// characters and survive a wipe of any single slot), and the game-save persist
// path is already the app's largest, most failure-prone write — this must not
// ride on it.
//
// Today it carries ONE flag: reduceMotion. When set, the UI holds its looping /
// pulsing animations static (the low-HP pulse, the input hint pulse, etc.) — the
// standard vestibular-safety accommodation. Text SIZE is deliberately NOT here:
// the app never disables `allowFontScaling`, so the OS Dynamic-Type / font-size
// setting already scales every label; a second in-app control would only drift
// out of sync with the platform one.
import { create } from 'zustand';

const STORAGE_KEY = '@tartaria/accessibility';

// AsyncStorage is loaded LAZILY (inside the read/write helpers), never at module
// top: importing this store must not pull in the native module, or any test /
// tool that transitively imports a component using it (StatsPanel, InputBox, …)
// would crash on load in a bare JS env. Both helpers tolerate its absence.
function loadAsyncStorage(): { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-async-storage/async-storage');
    // Real module exposes the API under `.default` (ESM); the jest mock exports
    // the API object directly. Accept either.
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

export interface AccessibilityState {
  reduceMotion: boolean;
  /** True once the persisted prefs have been read back (or found absent). */
  loaded: boolean;
  hydrateAccessibility: () => Promise<void>;
  setReduceMotion: (v: boolean) => void;
}

function persist(state: { reduceMotion: boolean }): void {
  // Fire-and-forget; a dropped write just means the pref resets next launch.
  try {
    const AS = loadAsyncStorage();
    void AS?.setItem(STORAGE_KEY, JSON.stringify({ reduceMotion: state.reduceMotion }));
  } catch {
    /* storage unavailable — pref stays in-memory for this session. */
  }
}

export const useAccessibility = create<AccessibilityState>((set, get) => ({
  reduceMotion: false,
  loaded: false,
  async hydrateAccessibility() {
    try {
      const AS = loadAsyncStorage();
      const raw = AS ? await AS.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{ reduceMotion: boolean }>;
        set({ reduceMotion: !!parsed.reduceMotion, loaded: true });
        return;
      }
    } catch {
      /* corrupt / unreadable pref — fall through to defaults. */
    }
    set({ loaded: true });
  },
  setReduceMotion(v) {
    set({ reduceMotion: v });
    persist(get());
  },
}));

/** Convenience hook — subscribe to just the reduce-motion flag. */
export function useReduceMotion(): boolean {
  return useAccessibility((s) => s.reduceMotion);
}
