import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SaveState } from './types';

const SAVE_KEY = 'tartaria.save.v1';
const LOG_KEY = 'tartaria.gamelog.v1';

export async function loadSave(): Promise<SaveState | null> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveState;
  } catch (e) {
    console.warn('loadSave failed', e);
    return null;
  }
}

export async function saveGame(state: SaveState): Promise<void> {
  const toSave: SaveState = { ...state, savedAt: Date.now(), version: 1 };
  await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(toSave));
}

export async function clearSave(): Promise<void> {
  await AsyncStorage.multiRemove([SAVE_KEY, LOG_KEY]);
}

export async function appendLogToDisk(line: string): Promise<void> {
  try {
    const existing = (await AsyncStorage.getItem(LOG_KEY)) ?? '';
    const next = existing + line + '\n';
    await AsyncStorage.setItem(LOG_KEY, next);
  } catch (e) {
    console.warn('appendLogToDisk failed', e);
  }
}

export async function readFullLog(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(LOG_KEY)) ?? '';
  } catch {
    return '';
  }
}
