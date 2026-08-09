import type { SaveState } from './types';
import { OTA_BUILD_ID } from '../buildInfo';

// OTA-1201 — SAVE EXPORT / IMPORT. A CHARACTER YOU CAN GET BACK.
//
// ⚠⚠ WHY THIS EXISTS, and it is not hypothetical. On 2026-08-08 the owner
// reinstalled the app to clear a memory kill and **the character was gone —
// permanently, with no copy anywhere.** There was no export, no backup, no
// cloud sync, and nothing on this device survives an uninstall: every save lives
// in AsyncStorage, which iOS deletes with the app. Hours of play, unrecoverable,
// as the ordinary cost of a routine troubleshooting step.
//
// The save system is already careful about the failures it knows: OTA-344 writes
// the live slot atomically with a `.bak` fallback, OTA-395/396 trims oversized
// blobs so a truncated write can't land. All of that protects a save from
// PROCESSES. None of it protects a save from the phone.
//
// ⚠ THE ONE SAFETY PROPERTY THAT MATTERS MOST, and every decision below serves
// it: **an import can never destroy a character you already have.** Import
// always mints a NEW slot. There is no overwrite path, not even an opt-in one —
// a player restoring a backup is, by definition, already having a bad day, and a
// confirm dialog is not a good enough guard against tapping the wrong row.
//
// ⚠⚠ AND THE ENVELOPE IS BUILT FOR TRUNCATION, because on this app that is the
// EXPECTED failure and not the exotic one. The log exporter has fought it for
// dozens of OTAs — LogScreen carries a HEADER/FOOTER envelope specifically so a
// clipped paste is VISIBLE (OTA-018), TitleScreen chunks dead-character logs at
// 25KB because "most chat clients silently truncate larger pastes" (OTA-023),
// and both offer Share precisely because it "bypasses any silent paste-size cap
// in the destination app" (OTA-006/215). A save can run to 800,000 characters
// (SAFE_BLOB_CHARS), which is far past every one of those limits.
//
// So a save that arrives short must FAIL LOUDLY rather than restore a partial
// character. The envelope carries a declared character count and a checksum, and
// the terminator is the last thing written: a truncated paste loses the END
// marker first, and that alone is a definitive answer before the checksum is
// even consulted.

/** Envelope markers. ⚠ The END marker is the truncation tell — it is the last
 *  thing written, so it is the first thing lost. Do not reorder. */
const HEADER = '=== TARTARIA SAVE EXPORT v1 ===';
const BEGIN = '--- BEGIN SAVE ---';
const END = '--- END SAVE ---';
const FOOTER = '=== END TARTARIA SAVE EXPORT ===';

/** Bumped only for a change that an older build could not read. The importer
 *  refuses a format it does not know rather than guessing at the layout. */
export const SAVE_EXPORT_FORMAT = 1;

/** ⚠ FNV-1a, 32-bit. This detects TRUNCATION AND CORRUPTION — a clipped paste, a
 *  chat client that ate a character, a line-wrapped email body. It is NOT
 *  tamper-proofing and is not presented as any, because a player who edits their
 *  own save is not an attacker and there is nothing here worth defending against
 *  one. Dependency-free and stable across platforms, which a crypto hash would
 *  not be without pulling in a native module. */
export function saveChecksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // >>> 0 keeps it unsigned; the multiply is the FNV prime by shifts so it
    // stays inside 32 bits in JS's float arithmetic.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface SaveExportMeta {
  /** Display name, for the header a human reads before importing. */
  playerName: string;
  raceName?: string;
  locationName?: string;
  /** Wall-clock export time. Passed in rather than read here so the encoder
   *  stays pure and the tests are not time-dependent. */
  exportedAt: number;
}

/** Builds the pasteable/shareable text for one character. */
export function encodeSaveExport(state: SaveState, meta: SaveExportMeta): string {
  const json = JSON.stringify(state);
  const who = [meta.playerName, meta.raceName ? `(${meta.raceName})` : '', meta.locationName ? `· ${meta.locationName}` : '']
    .filter(Boolean).join(' ');
  return [
    HEADER,
    `format: ${SAVE_EXPORT_FORMAT}`,
    `character: ${who}`,
    `exported: ${new Date(meta.exportedAt).toISOString()}`,
    `build: ${OTA_BUILD_ID}`,
    // ⚠ Both of these are checked on import. `chars` catches the common case
    // (short paste) with a message a player can act on; the checksum catches the
    // subtle one (something in the middle changed) that a length check misses.
    `chars: ${json.length}`,
    `checksum: ${saveChecksum(json)}`,
    '',
    'Keep this whole message. Import needs every line, including the last one.',
    '',
    BEGIN,
    json,
    END,
    FOOTER,
    '',
  ].join('\n');
}

export type SaveImportResult =
  | { ok: true; state: SaveState; playerName: string; build: string | null; exportedAt: string | null }
  | { ok: false; reason: string };

/** ⚠ Every failure returns a sentence a PLAYER can act on, not a code. The
 *  person reading these has just lost a character and is trying to get it back;
 *  "checksum mismatch" tells them nothing about what to do next, and "the save
 *  is cut short — copy the whole message" tells them exactly. */
export function decodeSaveExport(text: string): SaveImportResult {
  if (!text || !text.trim()) {
    return { ok: false, reason: 'Nothing to import — the clipboard is empty.' };
  }
  if (!text.includes(HEADER)) {
    return {
      ok: false,
      reason: 'This does not look like a Tartaria save export. Copy the whole message, starting at "=== TARTARIA SAVE EXPORT".',
    };
  }

  // ⚠⚠ FIRST BEGIN, LAST END — AND THE ASYMMETRY IS LOAD-BEARING.
  // The payload is game data, and game data contains arbitrary player text: a
  // character name, or any line the player typed, can itself contain
  // "--- END SAVE ---". With `indexOf` for the terminator, that embedded copy is
  // found before the real one, the save is cut at it, and **that character's
  // backup can never be restored** — a backup feature that silently excludes
  // some characters is worse than none, because the player only finds out when
  // they need it.
  // The real BEGIN always precedes the payload and the real END always follows
  // it, so first-and-last is exact regardless of what the payload contains.
  // ⚠ Truncation detection is unaffected: a clipped paste loses the real END, and
  // if an embedded one is then found instead, the character count catches the
  // shortfall. The two checks cover each other.
  const begin = text.indexOf(BEGIN);
  const end = text.lastIndexOf(END);
  if (begin < 0) {
    return { ok: false, reason: 'The save data is missing from this message — only the header came through.' };
  }
  // ⚠ THE TRUNCATION CHECK, and it is deliberately BEFORE the checksum. This is
  // the failure that actually happens, and it has a specific, actionable cause.
  if (end < 0) {
    return {
      ok: false,
      reason: 'This save is cut short — the ending marker is missing. Something truncated it (chat apps and email often do). Use SHARE instead of copy/paste, or send it as a file.',
    };
  }
  if (end < begin) {
    return { ok: false, reason: 'This save is scrambled — the start and end markers are out of order.' };
  }

  const fmt = readHeaderField(text, 'format');
  if (fmt !== null) {
    const n = Number.parseInt(fmt, 10);
    // ⚠ Refuse a FUTURE format outright rather than guessing at its layout. An
    // unknown-but-plausible save that half-loads is worse than a clear refusal.
    if (Number.isFinite(n) && n > SAVE_EXPORT_FORMAT) {
      return {
        ok: false,
        reason: `This save was made by a newer version of the game (format ${n}). Update Tartaria, then import it again.`,
      };
    }
  }

  const json = text.slice(begin + BEGIN.length, end).trim();
  if (!json) {
    return { ok: false, reason: 'The save is empty between its start and end markers.' };
  }

  const declaredChars = readHeaderField(text, 'chars');
  if (declaredChars !== null) {
    const want = Number.parseInt(declaredChars, 10);
    if (Number.isFinite(want) && want !== json.length) {
      const short = json.length < want;
      return {
        ok: false,
        reason: short
          ? `This save is cut short — ${json.length.toLocaleString()} characters arrived out of ${want.toLocaleString()}. Use SHARE instead of copy/paste, or send it as a file.`
          : `This save does not match its own record of itself (${json.length.toLocaleString()} characters, expected ${want.toLocaleString()}). Something altered it in transit.`,
      };
    }
  }

  const declaredSum = readHeaderField(text, 'checksum');
  if (declaredSum !== null && declaredSum !== saveChecksum(json)) {
    return {
      ok: false,
      reason: 'This save is damaged — its contents do not match its checksum. Something changed it in transit. Try exporting again and using SHARE.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'The save data could not be read — it is not valid save text.' };
  }

  // ⚠ Shape check, not a schema validation. The game already tolerates missing
  // optional fields on load (older saves lack half of SlotSummary), so the bar
  // here is "is this a Tartaria save at all" — enough to stop a player importing
  // the wrong blob and getting a nameless, empty character.
  const st = parsed as Partial<SaveState> | null;
  if (!st || typeof st !== 'object') {
    return { ok: false, reason: 'The save data could not be read — it is not valid save text.' };
  }
  if (!st.player || typeof st.player !== 'object') {
    return { ok: false, reason: 'This save has no character in it.' };
  }
  const name = (st.player as { name?: unknown }).name;
  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, reason: 'This save has no character in it.' };
  }

  return {
    ok: true,
    state: parsed as SaveState,
    playerName: name,
    build: readHeaderField(text, 'build'),
    exportedAt: readHeaderField(text, 'exported'),
  };
}

/** Reads `key: value` from the header block. ⚠ Anchored to the start of a line
 *  so a value appearing inside the save JSON cannot be mistaken for a header
 *  field — the JSON is full of quoted keys and would otherwise match. */
function readHeaderField(text: string, key: string): string | null {
  const head = text.slice(0, text.indexOf(BEGIN) < 0 ? text.length : text.indexOf(BEGIN));
  for (const line of head.split('\n')) {
    const t = line.trim();
    if (t.startsWith(`${key}:`)) return t.slice(key.length + 1).trim();
  }
  return null;
}

/** Rough size label for the export UI, so a player knows before they tap whether
 *  this is a paste-sized thing or a share-sized thing. */
export function exportSizeLabel(chars: number): string {
  const kb = chars / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
}

/** ⚠ Above this, the clipboard is not a serious option and the UI says so
 *  outright rather than letting the player discover it by losing the paste.
 *  25,000 is the size TitleScreen already chunks dead-character logs at, chosen
 *  because "most chat clients silently truncate larger pastes" (OTA-023) — the
 *  same destinations receive this. */
export const CLIPBOARD_SAFE_CHARS = 25_000;

export function shouldPreferShare(chars: number): boolean {
  return chars > CLIPBOARD_SAFE_CHARS;
}
