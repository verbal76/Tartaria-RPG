// backupCharacter.ts — OTA-1208. ONE implementation of "back up this character".
//
// OTA-1178 put a BACK UP button on every character row after the owner lost a
// character to a reinstall (saves live in AsyncStorage, which dies with the
// app). The protection stays; the PLACEMENT moved — owner, 2026-08-10: "it
// makes the game look broken to testers." Living characters now back up from
// Settings → RUN (beside SAVE, where the thought "keep this safe" actually
// occurs); dead rows keep their button on the title screen because a dead
// character can never be loaded, so the row is its only door.
//
// ⚠ SHARE FIRST, CLIPBOARD SECOND — OTA-1178's own scar tissue, unchanged: a
// save runs far past the ~25k chars at which chat clients silently truncate
// pastes, so the share sheet is the real path and the clipboard is the
// convenience. The clipboard write lands BEFORE the sheet opens so a cancelled
// share still leaves the backup in hand.

import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { loadSlot } from '../engine/saveSystem';
import { encodeSaveExport } from '../engine/saveExport';

export type BackupResult = 'ok' | 'unreadable' | 'failed';

export async function backUpCharacterSlot(slot: {
  slotId: string;
  playerName: string;
  raceId?: string;
  locationId?: string;
}): Promise<BackupResult> {
  try {
    const state = await loadSlot(slot.slotId);
    if (!state) return 'unreadable';
    const text = encodeSaveExport(state, {
      playerName: slot.playerName,
      raceName: slot.raceId ?? '',
      locationName: slot.locationId ?? '',
      exportedAt: Date.now(),
    });
    await Clipboard.setStringAsync(text).catch(() => { /* share is the real path */ });
    try {
      await Share.share({ message: text, title: `Tartaria backup — ${slot.playerName}` });
    } catch {
      // Cancelled or unsupported — the clipboard copy above still stands.
    }
    return 'ok';
  } catch {
    return 'failed';
  }
}
