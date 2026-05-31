// AudioManager — looped background tracks for Tartaria Realms.
// Single active context at a time; the picker chooses based on game state.
// Each context has 1+ tracks; when the context activates, a random track
// from its pool is picked. Tracks lazy-load on first play.
//
//   Priority:  combat (enemies present)
//            > shop (vendor in scene / inventory screen open)
//            > menu (title / character creation / about-settings screen)
//            > explore (default while playing)
//            > silence (between sessions)
//
// Volume + on/off are read from audioSettings (persisted via AsyncStorage).
// Transitions hard-stop the previous track then fade in the new one —
// no overlap window during rapid context changes.
//
// All errors are swallowed because audio failure should never break
// gameplay.

import { Audio } from 'expo-av';
import { getAudioSettings, loadAudioSettings, onAudioSettingsChange } from './audioSettings';

type Context = 'boss' | 'combat' | 'shop' | 'menu' | 'explore';

interface TrackEntry {
  id: string;
  source: number;
  /** Authored mix volume — multiplied by master settings volume. */
  baseVolume: number;
}

const POOLS: Record<Context, TrackEntry[]> = {
  // Boss tier — heavier mix, dedicated tracks. Activated when ANY enemy
  // in the active scene carries `boss: true`. Sits above regular combat
  // in the priority chain (see AudioController.deriveContext).
  boss: [
    { id: 'boss-iron-boss', source: require('../../assets/audio/boss-iron-boss.mp3'), baseVolume: 0.7 },
    { id: 'boss-iron-gate-raid', source: require('../../assets/audio/boss-iron-gate-raid.mp3'), baseVolume: 0.7 },
  ],
  combat: [
    { id: 'combat-moon-map-1', source: require('../../assets/audio/combat-moon-map-1.mp3'), baseVolume: 0.6 },
    { id: 'combat-map-of-echoes', source: require('../../assets/audio/combat-map-of-echoes.mp3'), baseVolume: 0.6 },
  ],
  shop: [
    { id: 'shop-quiet-back-alley', source: require('../../assets/audio/shop-quiet-back-alley.mp3'), baseVolume: 0.45 },
  ],
  menu: [
    { id: 'menu-misty-compass', source: require('../../assets/audio/menu-misty-compass.mp3'), baseVolume: 0.5 },
  ],
  explore: [
    // Misty Compass also sits in the explore rotation per user request.
    { id: 'menu-misty-compass', source: require('../../assets/audio/menu-misty-compass.mp3'), baseVolume: 0.4 },
    { id: 'explore-map-of-the-wild-2', source: require('../../assets/audio/explore-map-of-the-wild-2.mp3'), baseVolume: 0.4 },
    { id: 'explore-dusty-threshold', source: require('../../assets/audio/explore-dusty-threshold.mp3'), baseVolume: 0.4 },
    { id: 'explore-map-of-ashes', source: require('../../assets/audio/explore-map-of-ashes.mp3'), baseVolume: 0.4 },
    // OTA-252 — three new atmospheric tracks added to the explore
    // rotation. All authored at the same 0.4 base mix as the rest of
    // explore so the player doesn't get a volume spike on transitions.
    // Filenames preserve the "explore-" prefix convention. Routing
    // can be reshuffled later (e.g. move Vault of Ash to boss) once
    // the user has heard them in context.
    { id: 'explore-tartar-steppe-adagio', source: require('../../assets/audio/explore-tartar-steppe-adagio.mp3'), baseVolume: 0.4 },
    { id: 'explore-catacomb-overture', source: require('../../assets/audio/explore-catacomb-overture.mp3'), baseVolume: 0.4 },
    { id: 'explore-vault-of-ash', source: require('../../assets/audio/explore-vault-of-ash.mp3'), baseVolume: 0.4 },
  ],
};

const sounds: Record<string, Audio.Sound> = {};
const loading: Record<string, Promise<void>> = {};
let activeContext: Context | null = null;
let activeTrackId: string | null = null;
let audioModeReady = false;
// Monotonic transition counter — bumped on every setActiveContext call.
// In-flight fade loops capture the counter at start and abort if it's
// been superseded by a newer transition. Stops the overlap-during-fade
// bug where rapid state changes (e.g. wander → combat → wander) would
// leave two tracks playing simultaneously.
let transitionEpoch = 0;
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

async function fadeVolume(id: string, from: number, to: number, epoch: number): Promise<void> {
  const stepMs = FADE_MS / FADE_STEPS;
  for (let i = 1; i <= FADE_STEPS; i++) {
    // Bail if a newer transition started — the new flow will set the
    // correct volume / stop state. This prevents a stale fade from
    // overwriting the live track's volume.
    if (epoch !== transitionEpoch) return;
    const t = i / FADE_STEPS;
    const v = from + (to - from) * t;
    await setSoundVolume(id, v);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

async function stopWithFade(id: string, epoch: number): Promise<void> {
  const sound = sounds[id];
  if (!sound) return;
  try {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded || !status.isPlaying) return;
    const from = typeof status.volume === 'number' ? status.volume : 0.5;
    await fadeVolume(id, from, 0, epoch);
    // Always stop, regardless of whether the fade was superseded —
    // otherwise a stale track keeps playing under the new one.
    await sound.stopAsync();
    await sound.setPositionAsync(0);
  } catch {
    // ignore
  }
}

// Hard stop with no fade — used during transitions to guarantee the
// previous track is silenced before the new one comes up.
async function stopHard(id: string): Promise<void> {
  const sound = sounds[id];
  if (!sound) return;
  try {
    await sound.setVolumeAsync(0);
    await sound.stopAsync();
    await sound.setPositionAsync(0);
  } catch {
    // ignore
  }
}

async function playWithFade(entry: TrackEntry, epoch: number): Promise<void> {
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
    await fadeVolume(entry.id, 0, effectiveVolume(entry), epoch);
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
  // Bump the transition epoch FIRST so any in-flight fades abort.
  const epoch = ++transitionEpoch;
  const settings = getAudioSettings();
  if (!settings.enabled) {
    activeContext = desired;
    const prev = activeTrackId;
    activeTrackId = null;
    if (prev) await stopHard(prev);
    return;
  }
  const prevId = activeTrackId;
  activeContext = desired;
  if (desired) {
    const pick = pickFromPool(POOLS[desired], prevId);
    activeTrackId = pick.id;
    // Hard-stop the previous track BEFORE starting the new one — no
    // crossfade overlap. The new track fades IN from 0; the old goes
    // silent in one frame. Eliminates the dual-playback bug at the
    // cost of a slightly less smooth transition.
    if (prevId && prevId !== pick.id) await stopHard(prevId);
    await playWithFade(pick, epoch);
  } else {
    activeTrackId = null;
    if (prevId) await stopHard(prevId);
  }
}

// Apply a settings change immediately — bump the live track's volume,
// stop entirely when the user toggles off, OR start a fresh track when
// they toggle on after having been disabled.
async function applySettings(): Promise<void> {
  const s = getAudioSettings();
  const epoch = ++transitionEpoch;
  if (!s.enabled) {
    if (activeTrackId) await stopHard(activeTrackId);
    return;
  }
  if (activeContext && !activeTrackId) {
    const pick = pickFromPool(POOLS[activeContext], null);
    activeTrackId = pick.id;
    await playWithFade(pick, epoch);
    return;
  }
  if (!activeTrackId) return;
  const entry = findEntry(activeTrackId);
  if (!entry) return;
  const sound = sounds[activeTrackId];
  if (sound) {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (!status.isPlaying) {
      await sound.playAsync();
      await fadeVolume(activeTrackId, 0, effectiveVolume(entry), epoch);
    } else {
      await setSoundVolume(activeTrackId, effectiveVolume(entry));
    }
  }
}

export async function forceReapplyAudio(targetContext: Context | null): Promise<void> {
  // Bump the epoch and hard-stop EVERY loaded track — defensive nuke,
  // since this is the user pressing APPLY to recover from a stuck state.
  ++transitionEpoch;
  const prevId = activeTrackId;
  activeTrackId = null;
  activeContext = null;
  for (const id of Object.keys(sounds)) {
    await stopHard(id);
  }
  void prevId;
  await setActiveContext(targetContext);
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
