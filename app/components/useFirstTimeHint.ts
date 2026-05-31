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
  const [shouldShow, setShouldShow] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY_PREFIX + id);
        if (cancelled) return;
        setShouldShow(raw == null);
      } catch {
        if (cancelled) return;
        // On read error, default to NOT showing. Better to skip a
        // hint than to spam it on every render.
        setShouldShow(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const dismiss = useCallback(() => {
    setShouldShow(false);
    void AsyncStorage.setItem(KEY_PREFIX + id, '1').catch(() => {
      // Swallow — worst case the hint shows again next launch.
    });
  }, [id]);

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
