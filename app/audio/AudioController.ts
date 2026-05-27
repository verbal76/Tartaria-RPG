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

type AudioContext = 'boss' | 'combat' | 'shop' | 'menu' | 'explore';

function deriveContext(s: GameState): AudioContext | null {
  // Menu screens — title, character creation, and the settings (about)
  // screen play the dedicated Misty Compass menu track regardless of
  // whether a character is loaded or what's happening in the scene.
  if (s.currentScreen === 'title' || s.currentScreen === 'character_creation' || s.currentScreen === 'about') {
    return 'menu';
  }
  if (!s.player) return null;
  const enemies = s.currentScene?.enemies ?? [];
  if (enemies.length > 0) {
    // Boss-tier track takes priority over regular combat when ANY
    // enemy in the active scene carries the boss flag. As soon as the
    // boss is defeated or fled, the controller falls back to the
    // normal combat / explore tracks on the next state tick.
    if (enemies.some((e) => e.boss)) return 'boss';
    return 'combat';
  }
  const vendor = s.currentScene?.vendor ?? null;
  if (vendor || s.currentScreen === 'inventory' || s.currentScreen === 'vendor') return 'shop';
  return 'explore';
}

let unsub: (() => void) | null = null;
let lastContext: AudioContext | null | undefined = undefined;

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
