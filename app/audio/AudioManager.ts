// AudioManager — looped background tracks for Tartaria Realms.
// Single active context at a time; the picker chooses based on game state.
// Each context has 1+ tracks; when the context activates, a random track
// from its pool is picked. Tracks lazy-load on first play.
//
//   Priority:  combat (enemies present)
//            > shop (vendor in scene / inventory screen open)
//            > explore (default while playing)
//            > silence (title / between sessions)
//
// Volume + on/off are read from audioSettings (persisted via AsyncStorage).
// Transitions between tracks crossfade — old fades out while new fades in
// over ~400ms.
//
// All errors are swallowed because audio failure should never break
// gameplay.

import { Audio } from 'expo-av';
import { getAudioSettings, loadAudioSettings, onAudioSettingsChange } from './audioSettings';

type Context = 'combat' | 'shop' | 'explore';

interface TrackEntry {
  id: string;
  source: number;
  /** Authored mix volume — multiplied by master settings volume. */
  baseVolume: number;
}

const POOLS: Record<Context, TrackEntry[]> = {
  combat: [
    { id: 'combat-moon-map-1', source: require('../../assets/audio/combat-moon-map-1.mp3'), baseVolume: 0.6 },
    { id: 'combat-map-of-echoes', source: require('../../assets/audio/combat-map-of-echoes.mp3'), baseVolume: 0.6 },
  ],
  shop: [
    { id: 'shop-quiet-back-alley', source: require('../../assets/audio/shop-quiet-back-alley.mp3'), baseVolume: 0.45 },
  ],
  explore: [
    { id: 'explore-map-of-the-wild-2', source: require('../../assets/audio/explore-map-of-the-wild-2.mp3'), baseVolume: 0.4 },
    { id: 'explore-dusty-threshold', source: require('../../assets/audio/explore-dusty-threshold.mp3'), baseVolume: 0.4 },
    { id: 'explore-map-of-ashes', source: require('../../assets/audio/explore-map-of-ashes.mp3'), baseVolume: 0.4 },
  ],
};

const sounds: Record<string, Audio.Sound> = {};
const loading: Record<string, Promise<void>> = {};
let activeContext: Context | null = null;
let activeTrackId: string | null = null;
let audioModeReady = false;
const FADE_MS = 400;
const FADE_STEPS = 8;

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    audioModeReady = true;
  } catch {
    // ignore
  }
}

async function loadTrack(entry: TrackEntry): Promise<void> {
  if (sounds[entry.id]) return;
  if (loading[entry.id]) return loading[entry.id];
  loading[entry.id] = (async () => {
    try {
      await ensureAudioMode();
      const { sound } = await Audio.Sound.createAsync(entry.source, {
        shouldPlay: false,
        isLooping: true,
        volume: 0,
      });
      sounds[entry.id] = sound;
    } catch {
      // ignore
    } finally {
      delete loading[entry.id];
    }
  })();
  return loading[entry.id];
}

function effectiveVolume(entry: TrackEntry): number {
  const s = getAudioSettings();
  if (!s.enabled) return 0;
  return entry.baseVolume * s.volume;
}

function findEntry(id: string): TrackEntry | null {
  for (const pool of Object.values(POOLS)) {
    const e = pool.find((x) => x.id === id);
    if (e) return e;
  }
  return null;
}

async function setSoundVolume(id: string, vol: number): Promise<void> {
  const sound = sounds[id];
  if (!sound) return;
  try {
    await sound.setVolumeAsync(Math.max(0, Math.min(1, vol)));
  } catch {
    // ignore
  }
}

async function fadeVolume(id: string, from: number, to: number): Promise<void> {
  const stepMs = FADE_MS / FADE_STEPS;
  for (let i = 1; i <= FADE_STEPS; i++) {
    const t = i / FADE_STEPS;
    const v = from + (to - from) * t;
    await setSoundVolume(id, v);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

async function stopWithFade(id: string): Promise<void> {
  const sound = sounds[id];
  if (!sound) return;
  try {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded || !status.isPlaying) return;
    const from = typeof status.volume === 'number' ? status.volume : 0.5;
    await fadeVolume(id, from, 0);
    await sound.stopAsync();
    await sound.setPositionAsync(0);
  } catch {
    // ignore
  }
}

async function playWithFade(entry: TrackEntry): Promise<void> {
  await loadTrack(entry);
  const sound = sounds[entry.id];
  if (!sound) return;
  try {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    await sound.setVolumeAsync(0);
    await sound.setPositionAsync(0);
    if (!status.isPlaying) {
      await sound.playAsync();
    }
    await fadeVolume(entry.id, 0, effectiveVolume(entry));
  } catch {
    // ignore
  }
}

function pickFromPool(pool: TrackEntry[], excludeId: string | null): TrackEntry {
  // Avoid replaying the same track twice in a row when alternatives exist.
  const candidates = pool.length > 1 && excludeId
    ? pool.filter((e) => e.id !== excludeId)
    : pool;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx] ?? pool[0]!;
}

export async function setActiveContext(desired: Context | null): Promise<void> {
  if (desired === activeContext) return;
  const settings = getAudioSettings();
  // If the user has audio disabled, just record the context — don't
  // start the track. When they re-enable, the controller will re-fire.
  if (!settings.enabled) {
    activeContext = desired;
    if (activeTrackId) await stopWithFade(activeTrackId);
    activeTrackId = null;
    return;
  }
  const prevId = activeTrackId;
  activeContext = desired;
  if (desired) {
    const pick = pickFromPool(POOLS[desired], prevId);
    activeTrackId = pick.id;
    // Crossfade: kick off prev fade-out and new fade-in in parallel.
    const out = prevId && prevId !== pick.id ? stopWithFade(prevId) : Promise.resolve();
    const inP = playWithFade(pick);
    await Promise.all([out, inP]);
  } else {
    activeTrackId = null;
    if (prevId) await stopWithFade(prevId);
  }
}

// Apply a settings change immediately — bump the live track's volume or
// stop entirely when the user toggles off.
async function applySettings(): Promise<void> {
  const s = getAudioSettings();
  if (!activeTrackId) return;
  const entry = findEntry(activeTrackId);
  if (!entry) return;
  if (!s.enabled) {
    await stopWithFade(activeTrackId);
    return;
  }
  // Live: ensure the track is playing then ramp to the new target volume.
  const sound = sounds[activeTrackId];
  if (sound) {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (!status.isPlaying) {
      await sound.playAsync();
      await fadeVolume(activeTrackId, 0, effectiveVolume(entry));
    } else {
      await setSoundVolume(activeTrackId, effectiveVolume(entry));
    }
  }
}

let settingsUnsub: (() => void) | null = null;

// Boot the audio system. Loads persisted settings and starts watching
// for changes.
export async function bootAudio(): Promise<void> {
  await loadAudioSettings();
  if (!settingsUnsub) {
    settingsUnsub = onAudioSettingsChange(() => {
      void applySettings();
    });
  }
}

export async function disposeAudio(): Promise<void> {
  if (settingsUnsub) {
    settingsUnsub();
    settingsUnsub = null;
  }
  try {
    for (const id of Object.keys(sounds)) {
      const sound = sounds[id];
      if (!sound) continue;
      const status = await sound.getStatusAsync();
      if (status.isLoaded) await sound.unloadAsync();
      delete sounds[id];
    }
  } catch {
    // ignore
  } finally {
    activeContext = null;
    activeTrackId = null;
  }
}

export function activeTrackForDiagnostics(): { context: Context | null; trackId: string | null } {
  return { context: activeContext, trackId: activeTrackId };
}
