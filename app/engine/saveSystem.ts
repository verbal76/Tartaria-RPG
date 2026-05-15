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
  savedAt: number;
  createdAt: number;
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

export async function appendLogToDisk(line: string): Promise<void> {
  if (!activeSlotId) return;
  try {
    const key = slotLogKey(activeSlotId);
    const existing = (await AsyncStorage.getItem(key)) ?? '';
    await AsyncStorage.setItem(key, existing + line + '\n');
  } catch (e) {
    console.warn('appendLogToDisk failed', e);
  }
}

export async function readFullLog(): Promise<string> {
  if (!activeSlotId) return '';
  try {
    return (await AsyncStorage.getItem(slotLogKey(activeSlotId))) ?? '';
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
