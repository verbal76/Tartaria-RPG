// autosave.ts — OTA-1209. THE AUTOSAVE TOGGLE (the autosave itself is OLD).
//
// Owner: a 2-hour session lost to a reflex swipe-up-to-close, "I didn't hit
// save and exit" — asking for periodic autosave with a Settings toggle.
// ⚠ READ THIS BEFORE "ADDING" AUTOSAVE: the protection already ships, in four
// layers, and this module adds CONTROL + VISIBILITY, not a new saver —
//   1. persist() fires on every meaningful action (OTA-046),
//   2. a 90-SECOND periodic timer bounds idle loss (OTA-368, App.tsx),
//   3. the app-background transition flushes progress (OTA-368 — a swipe-close
//      always passes through `background` first, so the reflex the owner
//      described loses at most the current animation frame),
//   4. writes are atomic with a .bak fallback (OTA-344).
// The owner's loss predates this stack. For scale: the industry span for
// time-based RPG autosave is ~2 min (Terraria mobile) to 10 min (RimWorld
// default), ~5 min the common middle (Minecraft). 90 seconds already beats
// all of it — DO NOT loosen the cadence to look more "standard".
//
// The toggle ships ON (the player it protects is the one who never opens
// Settings) and persists per-install, mirroring the first-time-tips switch.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** OTA-368's cadence, unchanged — this constant just gives it a name. */
export const AUTOSAVE_INTERVAL_MS = 90_000;

const DISABLED_KEY = 'tartaria.autosave.disabled.v1';
let disabledCache: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();

export async function loadAutosaveDisabled(): Promise<boolean> {
  if (disabledCache !== null) return disabledCache;
  try {
    disabledCache = (await AsyncStorage.getItem(DISABLED_KEY)) === '1';
  } catch {
    disabledCache = false;
  }
  for (const l of listeners) { try { l(disabledCache); } catch { /* ignore */ } }
  return disabledCache;
}

export function getAutosaveDisabled(): boolean {
  return disabledCache ?? false;
}

export async function setAutosaveDisabled(v: boolean): Promise<void> {
  disabledCache = v;
  for (const l of listeners) { try { l(v); } catch { /* ignore */ } }
  try { await AsyncStorage.setItem(DISABLED_KEY, v ? '1' : '0'); } catch { /* best-effort */ }
}

export function onAutosaveDisabledChange(fn: (v: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reactive hook for the Settings toggle. */
export function useAutosaveDisabled(): boolean {
  const [v, setV] = useState<boolean>(getAutosaveDisabled());
  useEffect(() => {
    void loadAutosaveDisabled().then(setV);
    return onAutosaveDisabledChange(setV);
  }, []);
  return v;
}

/** One autosave beat, injectable so the decision table is testable without
 *  timers: toggled off → skipped, no character on the clock → skipped,
 *  otherwise persist. persist() itself coalesces concurrent writes and
 *  self-guards on invalid records — no new write machinery, only a gate. */
export async function autosaveTick(store: {
  persist: () => Promise<boolean>;
  player: unknown;
  activeSlotId: string | null;
}): Promise<'saved' | 'skipped' | 'failed'> {
  if (getAutosaveDisabled()) return 'skipped';
  if (!store.player || !store.activeSlotId) return 'skipped';
  try {
    return (await store.persist()) ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}
