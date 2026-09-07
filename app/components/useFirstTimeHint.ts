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
// a second character doesn't want to re-see every hint. OTA-1738 —
// Settings → GUIDANCE → REPLAY TEACHING (GuidanceScreen) lists every
// card, seen or not, without writing a flag.

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
export async function resetFirstTimeHint(id: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + id);
    seenCache.delete(id);
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
    seenCache.clear();
  } catch {
    // best-effort
  }
}

// ⚠⚠ OTA-1738 — THE SAME FLAGS, READABLE FROM THE STORE. The bounty primer is
// raised inside a slice action (no hook can run there), so it needs a
// synchronous answer to "has this install seen it" and a synchronous way to
// say "it has now". Same key prefix as every card, so SHOW ALL TIPS AGAIN and
// the per-id reset above govern it exactly as they govern a FirstTimeHint.
const seenCache = new Set<string>();
let seenPrimed = false;

/** Load the seen set once (App boot). Safe to call repeatedly. */
export async function primeSeenHints(): Promise<void> {
  if (seenPrimed) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    for (const k of keys) if (k.startsWith(KEY_PREFIX)) seenCache.add(k.slice(KEY_PREFIX.length));
    seenPrimed = true;
  } catch {
    // best-effort: an unprimed cache reads "unseen", which shows a card at most once more
  }
}

/** Synchronous read for store-side surfaces. */
export function isHintSeen(id: string): boolean {
  return seenCache.has(id);
}

/** Mark seen from store-side code — writes the same flag a card's dismiss writes. */
export function markHintSeen(id: string): void {
  seenCache.add(id);
  void AsyncStorage.setItem(KEY_PREFIX + id, '1').catch(() => { /* worst case: shows again next launch */ });
}

/** ⚠ OTA-1738 — READ-ONLY listing for the replay screen: which ids this install has
 *  dismissed. Never writes, so opening the replay marks nothing seen. */
export async function readSeenHintIds(): Promise<Set<string>> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return new Set(keys.filter((k) => k.startsWith(KEY_PREFIX)).map((k) => k.slice(KEY_PREFIX.length)));
  } catch {
    return new Set();
  }
}

// ⚠⚠⚠ OTA-1738 — ONE OPTIONAL TEACHING SURFACE PER PLAYER BEAT. A screen that can
// raise several first-use cards on the same state (a first fight with a shield
// on and a spare spear in the pack; a trader whose counter also repairs,
// reinforces and teaches workings) hands them here in priority order with each
// one's own eligibility, and gets back the ONE id that should render now: the
// first candidate whose mechanic is actionable and whose card is unseen. When
// that card is dismissed the next eligible one takes the beat on the following
// render — a sequence of beats, never a stack.
//
// ⚠ ELIGIBILITY STAYS WHERE IT LIVES. This picks presentation order only; each
// `when` is the mechanic's own predicate (the same one its control reads).
// ⚠ Hooks need a fixed call count, so the candidate list must be the same
// length on every render of a given call site.
export function useTeachingSlot(candidates: ReadonlyArray<{ id: string; when: boolean }>): string | null {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const states = candidates.map((c) => useFirstTimeHint(c.id));
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i]!.when && states[i]!.shouldShow === true) return candidates[i]!.id;
  }
  return null;
}
