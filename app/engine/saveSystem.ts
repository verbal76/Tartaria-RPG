import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SaveState } from './types';

// v2 schema: multi-slot. Each character is its own keyed save with its
// own log; an index file lists summaries for the title screen.
const SLOTS_INDEX_KEY = 'tartaria.slots.index.v2';
const ACTIVE_SLOT_KEY = 'tartaria.activeSlot.v2';
const slotSaveKey = (slotId: string) => `tartaria.slot.${slotId}.v2`;
const slotLogKey = (slotId: string) => `tartaria.gamelog.${slotId}.v2`;

// Legacy single-slot keys. Migrated to a v2 slot on first hydrate.
const LEGACY_SAVE_KEY = 'tartaria.save.v1';
const LEGACY_LOG_KEY = 'tartaria.gamelog.v1';

export interface SlotSummary {
  slotId: string;
  playerName: string;
  raceId: string;
  locationId: string;
  hp: number;
  hpMax: number;
  /** Mirrors player.dead — set true when the character has fallen and needs a Resurrection Gem. */
  dead?: boolean;
  savedAt: number;
  createdAt: number;
}

// Install-wide stash (not per-character). Stores resources that persist
// across character deaths — Resurrection Gems primarily.
const GLOBAL_STASH_KEY = 'tartaria.global.v2';

export interface GlobalStash {
  resurrectionGems: number;
}

export async function loadGlobalStash(): Promise<GlobalStash> {
  try {
    const raw = await AsyncStorage.getItem(GLOBAL_STASH_KEY);
    if (!raw) return { resurrectionGems: 0 };
    const parsed = JSON.parse(raw) as Partial<GlobalStash>;
    return { resurrectionGems: parsed.resurrectionGems ?? 0 };
  } catch {
    return { resurrectionGems: 0 };
  }
}

export async function saveGlobalStash(stash: GlobalStash): Promise<void> {
  await AsyncStorage.setItem(GLOBAL_STASH_KEY, JSON.stringify(stash));
}

export async function addResurrectionGems(n: number): Promise<number> {
  const stash = await loadGlobalStash();
  stash.resurrectionGems = Math.max(0, stash.resurrectionGems + n);
  await saveGlobalStash(stash);
  return stash.resurrectionGems;
}

let activeSlotId: string | null = null;

export function getActiveSlotId(): string | null {
  return activeSlotId;
}

export async function setActiveSlot(slotId: string | null): Promise<void> {
  activeSlotId = slotId;
  if (slotId) {
    await AsyncStorage.setItem(ACTIVE_SLOT_KEY, slotId);
  } else {
    await AsyncStorage.removeItem(ACTIVE_SLOT_KEY);
  }
}

export async function loadActiveSlotId(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(ACTIVE_SLOT_KEY);
    activeSlotId = v;
    return v;
  } catch {
    return null;
  }
}

export function newSlotId(): string {
  return `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listSlots(): Promise<SlotSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(SLOTS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SlotSummary[];
    return parsed.sort((a, b) => b.savedAt - a.savedAt);
  } catch (e) {
    console.warn('listSlots failed', e);
    return [];
  }
}

async function writeIndex(slots: SlotSummary[]): Promise<void> {
  await AsyncStorage.setItem(SLOTS_INDEX_KEY, JSON.stringify(slots));
}

async function upsertIndexEntry(entry: SlotSummary): Promise<void> {
  const all = await listSlots();
  const filtered = all.filter((s) => s.slotId !== entry.slotId);
  filtered.unshift(entry);
  await writeIndex(filtered);
}

export async function loadSlot(slotId: string): Promise<SaveState | null> {
  try {
    const raw = await AsyncStorage.getItem(slotSaveKey(slotId));
    if (!raw) return null;
    return JSON.parse(raw) as SaveState;
  } catch (e) {
    console.warn('loadSlot failed', e);
    return null;
  }
}

export async function saveSlot(slotId: string, state: SaveState): Promise<void> {
  const toSave: SaveState = { ...state, savedAt: Date.now(), version: 1 };
  await AsyncStorage.setItem(slotSaveKey(slotId), JSON.stringify(toSave));
  if (state.player) {
    const summary: SlotSummary = {
      slotId,
      playerName: state.player.name,
      raceId: state.player.raceId,
      locationId: state.player.currentLocationId,
      hp: state.player.hp,
      hpMax: state.player.hpMax,
      dead: state.player.dead === true,
      savedAt: toSave.savedAt,
      createdAt: (await readCreatedAt(slotId)) ?? toSave.savedAt,
    };
    await upsertIndexEntry(summary);
  }
}

async function readCreatedAt(slotId: string): Promise<number | null> {
  const all = await listSlots();
  const found = all.find((s) => s.slotId === slotId);
  return found?.createdAt ?? null;
}

export async function deleteSlot(slotId: string): Promise<void> {
  await AsyncStorage.multiRemove([slotSaveKey(slotId), slotLogKey(slotId)]);
  const all = await listSlots();
  await writeIndex(all.filter((s) => s.slotId !== slotId));
  if (activeSlotId === slotId) {
    await setActiveSlot(null);
  }
}

// Serialize writes through a single promise chain. The previous version
// did read-modify-write per call non-awaited, which raced under burst
// load — many entries would silently disappear when several persistEntry
// calls landed within the same JS tick. Now every appendLogToDisk
// chains onto the previous one, so the disk log keeps the whole
// sequence.
let logWriteChain: Promise<void> = Promise.resolve();

export function appendLogToDisk(line: string): Promise<void> {
  if (!activeSlotId) return Promise.resolve();
  logWriteChain = logWriteChain.then(async () => {
    if (!activeSlotId) return;
    try {
      const key = slotLogKey(activeSlotId);
      const existing = (await AsyncStorage.getItem(key)) ?? '';
      await AsyncStorage.setItem(key, existing + line + '\n');
    } catch (e) {
      console.warn('appendLogToDisk failed', e);
    }
  });
  return logWriteChain;
}

// Block until every queued log write has flushed to disk. Called by
// LogScreen before reading so COPY ALL captures the entire history,
// not whatever snapshot won the race at unmount time.
export async function flushLogWrites(): Promise<void> {
  await logWriteChain;
}

export async function readFullLog(): Promise<string> {
  if (!activeSlotId) return '';
  // Drain any in-flight writes before reading so the snapshot includes
  // everything that fired up to this moment.
  await logWriteChain;
  try {
    return (await AsyncStorage.getItem(slotLogKey(activeSlotId))) ?? '';
  } catch {
    return '';
  }
}

// Wipe the on-disk log for the active slot. Used by the CLEAR LOG
// button on the exploration screen so the player can submit fresh
// playtest deltas instead of re-sending the same accumulated history
// on every troubleshooting round.
//
// OTA 014 — chain the clear as a NEW step onto logWriteChain so it
// runs FIFO with any concurrent appendLogToDisk calls. The previous
// version awaited the chain then ran removeItem, which left a race:
// an append that queued AFTER the drain await but BEFORE the
// removeItem would land first, leaving a one-line leftover that the
// removeItem then wiped — but a subsequent append would see an empty
// key and start fresh, so the player saw line 1 of the new session
// followed by silence. By chaining the clear, we guarantee atomic
// ordering: every write before the clear is flushed; the clear runs;
// every write after is appended to a fresh (empty) key.
export async function clearActiveSlotLog(): Promise<void> {
  if (!activeSlotId) return;
  logWriteChain = logWriteChain.then(async () => {
    if (!activeSlotId) return;
    try {
      await AsyncStorage.removeItem(slotLogKey(activeSlotId));
    } catch {
      /* ignore — the log will repopulate from the next append */
    }
  });
  await logWriteChain;
}

// Read any slot's log directly without activating it. Used by the title
// screen so a player can copy out a fallen character's history without
// loading the save (dead characters can't be selected). Drains pending
// writes so the snapshot reflects the moment of death.
export async function readSlotLog(slotId: string): Promise<string> {
  await logWriteChain;
  try {
    return (await AsyncStorage.getItem(slotLogKey(slotId))) ?? '';
  } catch {
    return '';
  }
}

// One-shot migration: if a legacy single-slot save exists, fold it into the
// new multi-slot system as a new slot and remove the legacy keys. Returns
// the new slot id if migration ran, null otherwise.
export async function migrateLegacySlotIfPresent(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as SaveState;
    if (!state.player) {
      await AsyncStorage.multiRemove([LEGACY_SAVE_KEY, LEGACY_LOG_KEY]);
      return null;
    }
    const slotId = newSlotId();
    await saveSlot(slotId, state);
    // Move legacy log to the new slot's log key, if any.
    const legacyLog = await AsyncStorage.getItem(LEGACY_LOG_KEY);
    if (legacyLog) {
      await AsyncStorage.setItem(slotLogKey(slotId), legacyLog);
    }
    await AsyncStorage.multiRemove([LEGACY_SAVE_KEY, LEGACY_LOG_KEY]);
    return slotId;
  } catch (e) {
    console.warn('legacy migration failed', e);
    return null;
  }
}

// Compatibility shims so existing call sites that did `loadSave()` /
// `saveGame(state)` against the singleton API still work during the
// transition. They route through the active slot.
export async function loadSave(): Promise<SaveState | null> {
  if (!activeSlotId) return null;
  return loadSlot(activeSlotId);
}

export async function saveGame(state: SaveState): Promise<void> {
  if (!activeSlotId) return;
  await saveSlot(activeSlotId, state);
}

export async function clearSave(): Promise<void> {
  if (!activeSlotId) return;
  await deleteSlot(activeSlotId);
}
