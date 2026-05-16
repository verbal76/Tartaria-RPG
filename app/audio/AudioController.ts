// AudioController — subscribes to the game store and routes context
// changes (combat / shop / explore / silence) to the AudioManager.
//
// Context resolution (priority top-down):
//   1. No player or on title screen → silence
//   2. Active enemies in scene → combat
//   3. Vendor in scene OR inventory screen open → shop
//   4. Anything else while playing → explore

import { useGameStore } from '../state/gameStore';
import { setActiveContext, forceReapplyAudio } from './AudioManager';

type GameState = ReturnType<typeof useGameStore.getState>;

function deriveContext(s: GameState): 'combat' | 'shop' | 'explore' | null {
  if (!s.player) return null;
  if (s.currentScreen === 'title' || s.currentScreen === 'character_creation') return null;
  const enemies = s.currentScene?.enemies ?? [];
  if (enemies.length > 0) return 'combat';
  const vendor = s.currentScene?.vendor ?? null;
  if (vendor || s.currentScreen === 'inventory') return 'shop';
  return 'explore';
}

let unsub: (() => void) | null = null;
let lastContext: 'combat' | 'shop' | 'explore' | null | undefined = undefined;

// Bind the controller to the store. Call once at app boot.
export function startAudioController(): void {
  if (unsub) return;
  // Fire immediately so the right track is queued on first render.
  void apply(useGameStore.getState());
  unsub = useGameStore.subscribe((state) => {
    void apply(state);
  });
}

export function stopAudioController(): void {
  if (unsub) {
    unsub();
    unsub = null;
  }
  void setActiveContext(null);
}

async function apply(state: GameState): Promise<void> {
  const ctx = deriveContext(state);
  if (ctx === lastContext) return;
  lastContext = ctx;
  await setActiveContext(ctx);
}

// Hard reset — flushes the audio manager's cache and re-derives the
// context from current store state. Wired to the settings "Apply"
// button so the user can force a reload if live wiring gets stuck.
export async function forceReapplyAudioFromState(): Promise<void> {
  const state = useGameStore.getState();
  const ctx = deriveContext(state);
  lastContext = ctx;
  await forceReapplyAudio(ctx);
}
