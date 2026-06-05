// Audio settings — persisted via AsyncStorage so volume + on/off stay
// across sessions. Both AudioManager and the settings UI read/write
// through this single source of truth.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tartaria.audio.settings.v1';

export interface AudioSettings {
  enabled: boolean;
  /** Master volume 0.0 - 1.0. Applied as a multiplier on top of each
   *  track's authored volume. */
  volume: number;
  /** arb17 — how much to lower the music while the Arbiter speaks, as a
   *  fraction (0 = no ducking, 0.15 = a 15% dip). Clamped 0..0.5. */
  duck: number;
}

// arb41 — playtester-tuned starting values. Music on at 70%; voice-duck
// raised 15% → 40% so the music drops well clear of the Arbiter while he
// speaks. (duck is the dip fraction, clamped 0..0.5; the UI shows duck×100.)
const DEFAULTS: AudioSettings = { enabled: true, volume: 0.7, duck: 0.4 };

let cache: AudioSettings | null = null;
const listeners = new Set<(s: AudioSettings) => void>();

export async function loadAudioSettings(): Promise<AudioSettings> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      cache = {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
        volume: typeof parsed.volume === 'number' ? clamp01(parsed.volume) : DEFAULTS.volume,
        duck: typeof parsed.duck === 'number' ? clampDuck(parsed.duck) : DEFAULTS.duck,
      };
    } else {
      cache = { ...DEFAULTS };
    }
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function getAudioSettings(): AudioSettings {
  return cache ?? { ...DEFAULTS };
}

export async function setAudioSettings(patch: Partial<AudioSettings>): Promise<AudioSettings> {
  const current = cache ?? (await loadAudioSettings());
  const next: AudioSettings = {
    enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
    volume: patch.volume !== undefined ? clamp01(patch.volume) : current.volume,
    duck: patch.duck !== undefined ? clampDuck(patch.duck) : current.duck,
  };
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore persistence errors — settings still apply in-memory
  }
  for (const l of listeners) {
    try { l(next); } catch { /* ignore */ }
  }
  return next;
}

export function onAudioSettingsChange(fn: (s: AudioSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function clampDuck(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(0.5, v));
}
