// OTA-490 — emergency storage reclaim deep sweep. When the AsyncStorage DB is
// full and a save can't stage, reclaim must free space by dropping every
// REGENERABLE key — across ALL slots — while NEVER touching a live save, its
// .bak, the slot index, the active-slot pointer, or the player's global stash.
// (The daughter's S26 hit a full-DB persist failure at only 193 KB total because
// the old reclaim only cleared the ACTIVE slot's copy-log.)

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveSlot,
  emergencyReclaimDiskSpace,
  slotSaveKey,
} from '../app/engine/saveSystem';
import type { SaveState } from '../app/engine/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const SLOT = 'slot_reclaim_1';

function mkState(name: string): SaveState {
  return {
    version: 1, savedAt: 0,
    player: { name, raceId: 'mud_dweller', factionId: 'forgotten_order', hp: 30, hpMax: 30, currentLocationId: 'camp' } as never,
    worldMemory: {} as never, gameLog: [], currentScreen: 'exploration',
  };
}

describe('OTA-490 — emergencyReclaimDiskSpace deep sweep', () => {
  it('purges regenerable keys across all slots, keeps live save + .bak + stash', async () => {
    await AsyncStorage.clear();
    // A real live save (+ its .bak via a second write) and the player's stash.
    await saveSlot(SLOT, mkState('Aldric'));
    await saveSlot(SLOT, mkState('Verbal')); // now live=Verbal, bak=Aldric
    await AsyncStorage.multiSet([
      ['tartaria.global.v2', 'PLAYER_STASH_KEEP'],
      ['tartaria.gamelog.' + SLOT + '.v2', 'active-slot copy log'],
      ['tartaria.gamelog.some_other_slot.v2', 'other-slot copy log'],
      ['tartaria.itemSynthCache.v1', '[{"x":1}]'],
      ['@tartaria/lastCrashSave', '{"raw":"~190KB snapshot"}'],
      ['@tartaria/lastCrash', 'boot-stage-tag'],
      ['tartaria.slot.someslot.v2.tmp.3', 'orphaned save temp'],
    ]);

    await emergencyReclaimDiskSpace(SLOT);

    // Regenerable keys are gone.
    for (const k of [
      'tartaria.gamelog.' + SLOT + '.v2',
      'tartaria.gamelog.some_other_slot.v2',
      'tartaria.itemSynthCache.v1',
      '@tartaria/lastCrashSave',
      '@tartaria/lastCrash',
      'tartaria.slot.someslot.v2.tmp.3',
    ]) {
      expect(await AsyncStorage.getItem(k)).toBeNull();
    }

    // Real player data is untouched.
    expect(await AsyncStorage.getItem('tartaria.global.v2')).toBe('PLAYER_STASH_KEEP');
    const live = await AsyncStorage.getItem(slotSaveKey(SLOT));
    expect(live).not.toBeNull();
    expect((JSON.parse(live!) as SaveState).player?.name).toBe('Verbal');
    const bak = await AsyncStorage.getItem(`${slotSaveKey(SLOT)}.bak`);
    expect((JSON.parse(bak!) as SaveState).player?.name).toBe('Aldric');
  });

  it('purges orphaned save temps from OTHER slots', async () => {
    await AsyncStorage.clear();
    // The active write's own temp is cleared by the fast path (saveSlot re-stages
    // it immediately after); the point here is that stale temps from prior crashes
    // / other slots also get swept.
    await AsyncStorage.setItem('tartaria.slot.other.v2.tmp.1', 'orphan');
    await AsyncStorage.setItem('tartaria.slot.another.v2.tmp.7', 'orphan2');

    await emergencyReclaimDiskSpace(SLOT, `${slotSaveKey(SLOT)}.tmp.5`);

    expect(await AsyncStorage.getItem('tartaria.slot.other.v2.tmp.1')).toBeNull();
    expect(await AsyncStorage.getItem('tartaria.slot.another.v2.tmp.7')).toBeNull();
  });
});
