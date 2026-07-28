// useFirstTimeHint — AsyncStorage-gated hint visibility. Each hint
// has a stable id; once dismissed, that id never shows the hint
// again on this install.
//
// Why this exists (OTA-229): the upfront 28-step tutorial in
// `tutorialSteps.ts` was dictionary-mode — players read ~1,700 words
// before swinging a sword, and the steps had grown stale (no Fusing
// Crucible / Aether buff / scrap / new dog mechanics). The new
// pattern is just-in-time: a small hint pops up the first time the
// player enters a system (inventory, crafting, combat, the
// Crucible, etc.), then never again. This hook is the gating
// primitive; the FirstTimeHint component renders the popup.
//
// Persistence is per-install (not per-save-slot). A player rolling
// a second character doesn't want to re-see every hint. Tutorial
// Replay (Phase 2) will list every hint as a flat doc for players
// who want a refresher.

import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'tartaria.hint.v1.';

// OTA-860 — a single GLOBAL kill-switch for every first-time tip. Persisted per-install
// (like the individual hint flags) and reactive so the Settings toggle and the "turn off
// tips" link inside a popup both take effect live. When disabled, useFirstTimeHint never
// reports shouldShow === true, so no hint renders anywhere.
const DISABLED_KEY = 'tartaria.hints.disabled.v1';
let disabledCache: boolean | null = null;
const disabledListeners = new Set<(v: boolean) => void>();

/** Kick off the one-time read of the global disable flag. Safe to call repeatedly. */
export async function loadHintsDisabled(): Promise<boolean> {
  if (disabledCache !== null) return disabledCache;
  try {
    const raw = await AsyncStorage.getItem(DISABLED_KEY);
    disabledCache = raw === '1';
  } catch {
    disabledCache = false;
  }
  for (const l of disabledListeners) { try { l(disabledCache); } catch { /* ignore */ } }
  return disabledCache;
}

/** Synchronous read of the cached flag (false until the first load resolves). */
export function getHintsDisabled(): boolean {
  return disabledCache ?? false;
}

/** Turn every first-time tip on/off. Writes through + notifies subscribers live. */
export async function setHintsDisabled(v: boolean): Promise<void> {
  disabledCache = v;
  for (const l of disabledListeners) { try { l(v); } catch { /* ignore */ } }
  try { await AsyncStorage.setItem(DISABLED_KEY, v ? '1' : '0'); } catch { /* best-effort */ }
}

export function onHintsDisabledChange(fn: (v: boolean) => void): () => void {
  disabledListeners.add(fn);
  return () => disabledListeners.delete(fn);
}

/** Reactive hook for the Settings toggle. */
export function useHintsDisabled(): boolean {
  const [v, setV] = useState<boolean>(getHintsDisabled());
  useEffect(() => {
    void loadHintsDisabled().then(setV);
    return onHintsDisabledChange(setV);
  }, []);
  return v;
}

export type HintState = {
  /** True until the hint is dismissed AND the dismissal has flushed
   *  to AsyncStorage. False on a re-render of an already-dismissed
   *  hint. Undefined while the initial AsyncStorage read is pending —
   *  consumers should render nothing during the undefined phase to
   *  avoid a flash of the hint that immediately dismisses itself. */
  shouldShow: boolean | undefined;
  /** Mark the hint dismissed. Optimistic — flips shouldShow false
   *  immediately and writes the flag in the background. */
  dismiss: () => void;
};

export function useFirstTimeHint(id: string): HintState {
  // Per-id "already dismissed" state: undefined = still reading storage.
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);
  // OTA-860 — the global tips kill-switch, reactive so flipping it in Settings (or via
  // the in-popup link) hides any currently-open hint immediately.
  const [disabled, setDisabled] = useState<boolean>(getHintsDisabled());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY_PREFIX + id);
        if (cancelled) return;
        setDismissed(raw != null);
      } catch {
        if (cancelled) return;
        // On read error, default to already-dismissed. Better to skip a
        // hint than to spam it on every render.
        setDismissed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    void loadHintsDisabled().then(setDisabled);
    return onHintsDisabledChange(setDisabled);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    void AsyncStorage.setItem(KEY_PREFIX + id, '1').catch(() => {
      // Swallow — worst case the hint shows again next launch.
    });
  }, [id]);

  // Undefined while the per-id read is pending (render nothing); otherwise show only when
  // this hint hasn't been dismissed AND tips aren't globally disabled.
  const shouldShow: boolean | undefined = dismissed === undefined ? undefined : (!dismissed && !disabled);

  return { shouldShow, dismiss };
}

// Test / dev helper — reset a hint so it shows again on next mount.
// Reachable from Tutorial Replay (Phase 2).
export async function resetFirstTimeHint(id: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + id);
  } catch {
    // best-effort
  }
}

// Wipe every hint flag — for "reset tutorial" in settings.
export async function resetAllFirstTimeHints(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((k) => k.startsWith(KEY_PREFIX));
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // best-effort
  }
}
