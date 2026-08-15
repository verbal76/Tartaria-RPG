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
// OTA-1028 — transitions CROSSFADE (owner: "they should Crossfade into each
// other", not cut each other off): the outgoing and incoming tracks ramp in
// the same stepped loop, epoch-guarded so rapid context changes can't stack
// two live tracks. Entering boss/combat or the market is a FAST crossfade —
// a noticeable shift, per the owner — while the reflective beds hand over
// gently. The outgoing track PAUSES in place, so a bed interrupted by a
// fight or a market stop resumes mid-phrase instead of restarting.
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
    // OTA-253 — Vault of Ash. Slow meditative piece per player —
    // pairs well with Misty Compass on the title screen. Same 0.5
    // base mix so the title screen doesn't get a volume bump on
    // rotation. Was briefly in explore (OTA-252) until the player
    // heard it and reclassified.
    { id: 'menu-vault-of-ash', source: require('../../assets/audio/menu-vault-of-ash.mp3'), baseVolume: 0.5 },
  ],
  explore: [
    // Misty Compass also sits in the explore rotation per user request.
    { id: 'menu-misty-compass', source: require('../../assets/audio/menu-misty-compass.mp3'), baseVolume: 0.4 },
    { id: 'explore-map-of-the-wild-2', source: require('../../assets/audio/explore-map-of-the-wild-2.mp3'), baseVolume: 0.4 },
    { id: 'explore-dusty-threshold', source: require('../../assets/audio/explore-dusty-threshold.mp3'), baseVolume: 0.4 },
    { id: 'explore-map-of-ashes', source: require('../../assets/audio/explore-map-of-ashes.mp3'), baseVolume: 0.4 },
    // OTA-252 — Tartar Steppe Adagio (generic atmosphere, filler
    // for the rotation) + Catacomb Overture (darker — fits the
    // buried-capital wandering). Vault of Ash moved to menu in
    // OTA-253 per player after audition.
    { id: 'explore-tartar-steppe-adagio', source: require('../../assets/audio/explore-tartar-steppe-adagio.mp3'), baseVolume: 0.4 },
    { id: 'explore-catacomb-overture', source: require('../../assets/audio/explore-catacomb-overture.mp3'), baseVolume: 0.4 },
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
// OTA-1028 — two crossfade speeds. SMOOTH for the reflective beds (explore /
// menu melt into each other); SHIFT when entering boss/combat or the market
// so the change lands as a deliberate gear-change, not a slow blend.
const SMOOTH_FADE_MS = 2200;
const SHIFT_FADE_MS = 450;
const FADE_STEP_MS = 55;
// Contexts whose ARRIVAL should read as a noticeable shift.
const SHIFT_CONTEXTS: ReadonlySet<Context> = new Set(['boss', 'combat', 'shop']);
// A bed interrupted less than this long ago resumes mid-phrase on return.
const RESUME_WINDOW_MS = 240_000;
// Contexts that resume their own last track on a quick return. Combat tiers
// always restart from the top — the hit of the opening bars IS the shift.
const RESUME_CONTEXTS: ReadonlySet<Context> = new Set(['explore', 'menu', 'shop']);
const lastPlayedByContext: Partial<Record<Context, { id: string; pausedAt: number }>> = {};

// arb16 — music ducking while the Arbiter speaks. When `ducked` is true the
// live music track plays at (1 - duck) of its normal volume so the voice
// sits clearly on top, then returns to full when speech stops. The dip
// amount is player-adjustable (audioSettings.duck, default 0.15 = 15%).
// Wired up from the TTS engines via setMusicDuck().
let ducked = false;

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
  const duckMul = ducked ? Math.max(0, 1 - (s.duck ?? 0.15)) : 1;
  return entry.baseVolume * s.volume * duckMul;
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

async function fadeVolume(id: string, from: number, to: number, epoch: number, fadeMs: number): Promise<void> {
  const steps = Math.max(4, Math.round(fadeMs / FADE_STEP_MS));
  for (let i = 1; i <= steps; i++) {
    // Bail if a newer transition started — the new flow will set the
    // correct volume / stop state. This prevents a stale fade from
    // overwriting the live track's volume.
    if (epoch !== transitionEpoch) return;
    const t = i / steps;
    const v = from + (to - from) * t;
    await setSoundVolume(id, v);
    await new Promise((r) => setTimeout(r, FADE_STEP_MS));
  }
}

// Hard stop with no fade — the audio-off path and the defensive nuke.
// Resets position: coming back after a disable gets a fresh start.
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

// OTA-1028 — pause KEEPING position, so a bed track interrupted by a fight
// or a market visit picks back up mid-phrase instead of restarting.
async function pauseInPlace(id: string): Promise<void> {
  const sound = sounds[id];
  if (!sound) return;
  try {
    const status = await sound.getStatusAsync();
    if (status.isLoaded && status.isPlaying) await sound.pauseAsync();
    await sound.setVolumeAsync(0);
  } catch {
    // ignore
  }
}

// OTA-1028 — defensive sweep before a crossfade: silence anything a
// superseded mid-flight transition may have left playing that is neither
// the outgoing nor the incoming track of THIS transition.
async function pauseStrays(keepA: string | null, keepB: string | null): Promise<void> {
  for (const id of Object.keys(sounds)) {
    if (id === keepA || id === keepB) continue;
    await pauseInPlace(id);
  }
}

// OTA-1028 — THE crossfade. Outgoing and incoming ramp in the same stepped
// loop (a true crossfade, not stop-then-fade-in); the outgoing track then
// pauses in place. `fresh` restarts the incoming track from the top (combat
// tiers); a resumed bed keeps its position.
async function crossfadeTo(
  fromId: string | null,
  entry: TrackEntry,
  fresh: boolean,
  fadeMs: number,
  epoch: number,
): Promise<void> {
  await loadTrack(entry);
  const sound = sounds[entry.id];
  if (!sound) {
    if (fromId) await pauseInPlace(fromId);
    return;
  }
  try {
    if (epoch !== transitionEpoch) return;
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (fromId === entry.id) {
      // Same track on both sides (shared pool entries) — retarget volume only.
      const cur = typeof status.volume === 'number' ? status.volume : 0;
      await fadeVolume(entry.id, cur, effectiveVolume(entry), epoch, fadeMs);
      return;
    }
    await sound.setVolumeAsync(0);
    if (fresh) await sound.setPositionAsync(0);
    if (!status.isPlaying) await sound.playAsync();
    let fromStart = 0;
    const fromSound = fromId ? sounds[fromId] : null;
    if (fromId && fromSound) {
      const st = await fromSound.getStatusAsync();
      fromStart = st.isLoaded && typeof st.volume === 'number' ? st.volume : 0;
    }
    const steps = Math.max(4, Math.round(fadeMs / FADE_STEP_MS));
    for (let i = 1; i <= steps; i++) {
      if (epoch !== transitionEpoch) break;
      const t = i / steps;
      await setSoundVolume(entry.id, effectiveVolume(entry) * t);
      if (fromId) await setSoundVolume(fromId, fromStart * (1 - t));
      await new Promise((r) => setTimeout(r, FADE_STEP_MS));
    }
    // The outgoing track pauses in place even if superseded — never leave it
    // live under whatever the newer transition brings up.
    if (fromId) await pauseInPlace(fromId);
    if (epoch === transitionEpoch) await setSoundVolume(entry.id, effectiveVolume(entry));
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
  const prevCtx = activeContext;
  const prevId = activeTrackId;
  activeContext = desired;
  if (!settings.enabled) {
    activeTrackId = null;
    if (prevId) await stopHard(prevId);
    return;
  }
  // Remember where the outgoing context left off (drives resume-on-return).
  if (prevCtx && prevId) lastPlayedByContext[prevCtx] = { id: prevId, pausedAt: Date.now() };
  if (!desired) {
    activeTrackId = null;
    if (prevId) await pauseInPlace(prevId);
    return;
  }
  // OTA-1028 — resume the context's own interrupted track when the
  // interruption was short (a fight, a market stop); otherwise rotate to a
  // fresh pick. Resume reads the entry from the TARGET pool so a track that
  // sits in two pools (Misty Compass) keeps that pool's authored mix.
  const last = lastPlayedByContext[desired];
  const resume = RESUME_CONTEXTS.has(desired) && last && Date.now() - last.pausedAt < RESUME_WINDOW_MS
    ? POOLS[desired].find((e) => e.id === last.id) ?? null
    : null;
  const pick = resume ?? pickFromPool(POOLS[desired], last?.id ?? prevId);
  activeTrackId = pick.id;
  const fadeMs = SHIFT_CONTEXTS.has(desired) ? SHIFT_FADE_MS : SMOOTH_FADE_MS;
  await pauseStrays(prevId, pick.id);
  await crossfadeTo(prevId, pick, !resume, fadeMs, epoch);
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
    await crossfadeTo(null, pick, true, SMOOTH_FADE_MS, epoch);
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
      await fadeVolume(activeTrackId, 0, effectiveVolume(entry), epoch, SMOOTH_FADE_MS);
    } else {
      await setSoundVolume(activeTrackId, effectiveVolume(entry));
    }
  }
}

/** arb16 — duck (or restore) the live music track while the Arbiter speaks.
 *  Called by the TTS engines: true when a line starts, false when the queue
 *  empties. No-op when music is off or nothing's playing; the 15% dip is
 *  small enough to apply instantly without a fade (and instant avoids
 *  racing the transition fades). */
export async function setMusicDuck(active: boolean): Promise<void> {
  if (active === ducked) return;
  ducked = active;
  if (!activeTrackId) return;
  const entry = findEntry(activeTrackId);
  if (!entry) return;
  await setSoundVolume(activeTrackId, effectiveVolume(entry));
}

export async function forceReapplyAudio(targetContext: Context | null): Promise<void> {
  // Bump the epoch and hard-stop EVERY loaded track — defensive nuke,
  // since this is the user pressing APPLY to recover from a stuck state.
  ++transitionEpoch;
  const prevId = activeTrackId;
  activeTrackId = null;
  activeContext = null;
  for (const k of Object.keys(lastPlayedByContext)) delete lastPlayedByContext[k as Context];
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
