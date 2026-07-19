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
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@tartaria/accessibility';

export interface AccessibilityState {
  reduceMotion: boolean;
  /** True once the persisted prefs have been read back (or found absent). */
  loaded: boolean;
  hydrateAccessibility: () => Promise<void>;
  setReduceMotion: (v: boolean) => void;
}

function persist(state: { reduceMotion: boolean }): void {
  // Fire-and-forget; a dropped write just means the pref resets next launch.
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ reduceMotion: state.reduceMotion }));
}

export const useAccessibility = create<AccessibilityState>((set, get) => ({
  reduceMotion: false,
  loaded: false,
  async hydrateAccessibility() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
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
