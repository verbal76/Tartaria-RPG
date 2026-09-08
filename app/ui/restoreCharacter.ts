import * as Clipboard from 'expo-clipboard';
import { decodeSaveExport } from '../engine/saveExport';
import { importSaveAsNewSlot } from '../engine/saveSystem';

/* ⚠⚠⚠ PHONE-FIX (VIS-1-PHONE-FIX-4D8A) — RESTORE LEFT THE TITLE SCREEN.
 *
 * Owner, after seeing Visual #1 on the Pixel: *"Move RESTORE FROM BACKUP into
 * Settings/Recovery. This was an old failsafe from a much earlier risky
 * transition and does not belong on the normal title screen anymore."*
 *
 * ⚠ THE CAPABILITY IS UNCHANGED — only its door moved. This is OTA-1178's flow
 * verbatim: read the clipboard, decode the checksummed export, write it as an
 * ADDITIONAL slot, never over an existing one. It is a module now rather than a
 * closure inside TitleScreen so the two facts that matter about it — that it
 * never overwrites, and that every failure has a reason a player can act on —
 * live in one place instead of being retyped by whichever screen hosts it.
 *
 * ⚠ IT DOES NOT REFRESH THE SLOT LIST. The caller owns that: Settings and the
 * title screen re-read the roster at different moments, and a helper that
 * reached into the store would make this untestable without one. */

export type RestoreOutcome =
  | { ok: true; playerName: string; trimmed: boolean }
  | { ok: false; reason: string };

export async function restoreCharacterFromClipboard(): Promise<RestoreOutcome> {
  try {
    const text = await Clipboard.getStringAsync();
    const decoded = decodeSaveExport(text ?? '');
    if (!decoded.ok) return { ok: false, reason: decoded.reason };
    const written = await importSaveAsNewSlot(decoded.state);
    if (!written.ok) return { ok: false, reason: written.reason };
    return { ok: true, playerName: decoded.playerName, trimmed: written.trimmed };
  } catch {
    return { ok: false, reason: 'The clipboard could not be read.' };
  }
}

/** The words the outcome is shown in, so both surfaces say the same thing. */
export function restoreOutcomeLine(o: RestoreOutcome): string {
  if (!o.ok) return `Restore failed — ${o.reason}`;
  return o.trimmed
    ? `Restored ${o.playerName} as a new character. Some of the log was trimmed to fit; the character is intact.`
    : `Restored ${o.playerName} as a new character. Nothing existing was replaced.`;
}
