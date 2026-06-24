// engine_Dev — BAKED GAME SLOT. The publish "bake" fills app/data/default-game.json with the
// author's whole-game master JSON; the app auto-loads it at boot with persist:false (it lives in
// the build, re-read each launch, never written to storage). A dev build keeps the file empty,
// so boot is a no-op and the generic engine shows.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useContentPackStore } from '../app/state/contentPackStore';
import { getGameTitle } from '../app/engine/contentPack';
import bakedDefault from '../app/data/default-game.json';

describe('engine_Dev — baked default-game slot', () => {
  beforeEach(() => {
    useContentPackStore.getState().clearAll();
    (AsyncStorage.setItem as jest.Mock).mockClear();
  });

  it('ships EMPTY by default (no real sections) so dev builds boot the generic engine', () => {
    const realKeys = Object.keys(bakedDefault as Record<string, unknown>)
      .filter((k) => !k.startsWith('_') && !k.startsWith('//'));
    expect(realKeys).toEqual([]);
  });

  it('applies a baked game with persist:false: content active, NOTHING written to storage', () => {
    const game = JSON.stringify({ title: 'Baked Adventure', narrator: 'The Voice' });
    const r = useContentPackStore.getState().loadGameBundle(game, { persist: false });
    expect(r.ok).toBe(true);
    expect(getGameTitle()).toBe('Baked Adventure');     // the baked game is live
    expect(AsyncStorage.setItem).not.toHaveBeenCalled(); // but never persisted
  });

  it('a normal upload (default persist) DOES write to storage', () => {
    const r = useContentPackStore.getState().loadGameBundle(JSON.stringify({ title: 'Saved Game' }));
    expect(r.ok).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });
});
