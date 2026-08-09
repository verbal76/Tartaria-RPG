// OTA-1178 — A CHARACTER YOU CAN GET BACK.
//
// ⚠⚠ THE EVENT THIS ANSWERS. 2026-08-08: the owner reinstalled the app to clear a
// memory kill and the character was gone permanently. Every save lives in
// AsyncStorage, which iOS deletes with the app, and no copy existed anywhere —
// no export, no backup, no sync. Hours of play, unrecoverable, as the ordinary
// cost of a routine troubleshooting step.
//
// ⚠ WHAT THIS SUITE IS WEIGHTED TOWARD, and it is not the happy path. A backup
// feature is only worth anything in the failure cases, so most of these tests are
// about text arriving damaged:
//
//   1. THE SAFETY PROPERTY — an import can never destroy an existing character.
//      Verified by importing over a populated store and checking the originals
//      are byte-identical afterwards.
//   2. TRUNCATION IS CAUGHT, LOUDLY. This app has fought silent paste truncation
//      for dozens of OTAs (OTA-018's HEADER/FOOTER envelope, OTA-023's 25KB
//      chunking because "most chat clients silently truncate larger pastes",
//      OTA-006/215's Share path to bypass it). A save runs far past all of those
//      limits, so a short paste is the EXPECTED failure — and a partial character
//      restoring silently would be worse than no feature at all.
//   3. THE IMPORTER REPORTS WHAT HAPPENED, NOT WHAT IT HOPED. `saveSlot` never
//      throws by design; it stamps an error and returns. An importer that just
//      awaited it would say "restored!" over a slot that does not exist.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SaveState } from '../app/engine/types';
import {
  encodeSaveExport,
  decodeSaveExport,
  saveChecksum,
  shouldPreferShare,
  exportSizeLabel,
  CLIPBOARD_SAFE_CHARS,
  SAVE_EXPORT_FORMAT,
} from '../app/engine/saveExport';
import {
  importSaveAsNewSlot,
  saveSlot,
  loadSlot,
  listSlots,
  slotSaveKey,
} from '../app/engine/saveSystem';

const EXPORTED_AT = 1_754_700_000_000; // fixed — the encoder must not read the clock

function makeState(name: string, extra: Record<string, unknown> = {}): SaveState {
  return {
    version: 1,
    savedAt: 1_754_600_000_000,
    player: {
      name,
      raceId: 'human',
      currentLocationId: 'iron_gate',
      hp: 22,
      hpMax: 28,
      ...extra,
    },
    worldMemory: { rooms: {} },
    gameLog: [{ kind: 'system', text: `${name} arrives.` }],
    currentScreen: 'exploration',
  } as unknown as SaveState;
}

const META = { playerName: 'Verbal', raceName: 'Human', locationName: 'Iron Gate', exportedAt: EXPORTED_AT };

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('OTA-1178 — round trip', () => {
  test('a character survives encode → decode unchanged', () => {
    const state = makeState('Verbal');
    const decoded = decodeSaveExport(encodeSaveExport(state, META));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state).toEqual(state);
    expect(decoded.playerName).toBe('Verbal');
  });

  test('the export carries the build it came from, so a bad save can be traced', () => {
    const decoded = decodeSaveExport(encodeSaveExport(makeState('Verbal'), META));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.build).toBeTruthy();
    // Pinned to the fixture's own value rather than a hardcoded year — the
    // encoder is passed its timestamp precisely so this stays deterministic.
    expect(decoded.exportedAt).toBe(new Date(EXPORTED_AT).toISOString());
  });

  test('the encoder does not read the clock', () => {
    // Two encodes of the same state must be byte-identical, or the checksum is
    // not a property of the save and a re-export could not be compared.
    const s = makeState('Verbal');
    expect(encodeSaveExport(s, META)).toBe(encodeSaveExport(s, META));
  });

  test('⚠⚠ a save whose own text contains the envelope markers still restores', () => {
    // ⚠ THIS FOUND A REAL BUG. The payload is game data, and game data contains
    // arbitrary player text — a character name, or any line the player typed,
    // can contain "--- END SAVE ---". With `indexOf` for the terminator, that
    // embedded copy was found first and the save was cut at it, so THAT
    // CHARACTER'S BACKUP COULD NEVER BE RESTORED. A backup feature that silently
    // excludes some characters is worse than none: you only discover it at the
    // moment you need it. Fixed by taking the FIRST begin and the LAST end.
    const nasty = makeState('chars: 9', {
      note: '--- END SAVE ---\n=== END TARTARIA SAVE EXPORT ===\n--- BEGIN SAVE ---',
    });
    const decoded = decodeSaveExport(encodeSaveExport(nasty, { ...META, playerName: 'x' }));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state).toEqual(nasty);
  });

  test('a marker-carrying save is STILL caught when genuinely truncated', () => {
    // The fix must not have bought marker-tolerance at the price of the
    // truncation check — an embedded END found after the real one is lost still
    // has to fail on the character count.
    const nasty = makeState('Verbal', { note: '--- END SAVE ---' });
    const full = encodeSaveExport(nasty, META);
    const cut = full.slice(0, full.indexOf('--- END SAVE ---', full.indexOf('--- BEGIN SAVE ---')) + 16);
    const decoded = decodeSaveExport(cut);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.reason).toMatch(/cut short/i);
  });
});

describe('OTA-1178 — damaged text is caught, and says what to do', () => {
  test('⚠⚠ a truncated paste is refused, naming truncation as the cause', () => {
    const full = encodeSaveExport(makeState('Verbal'), META);
    const cut = full.slice(0, Math.floor(full.length * 0.6));
    const decoded = decodeSaveExport(cut);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.reason).toMatch(/cut short/i);
    // ⚠ And it must point at the fix. "Checksum mismatch" tells a player nothing;
    // "use SHARE instead of copy/paste" tells them exactly what to do next.
    expect(decoded.reason).toMatch(/SHARE/);
  });

  test('a paste missing only its final marker is still refused', () => {
    const full = encodeSaveExport(makeState('Verbal'), META);
    const noEnd = full.replace('--- END SAVE ---', '');
    const decoded = decodeSaveExport(noEnd);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.reason).toMatch(/cut short|ending marker/i);
  });

  test('a save shortened INSIDE its markers is caught by the character count', () => {
    const state = makeState('Verbal');
    const full = encodeSaveExport(state, META);
    const json = JSON.stringify(state);
    const short = full.replace(json, json.slice(0, json.length - 40));
    const decoded = decodeSaveExport(short);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.reason).toMatch(/cut short/i);
    // The message quotes both numbers so the player can see how much was lost.
    expect(decoded.reason).toMatch(/characters arrived out of/i);
  });

  test('⚠ a single altered character in the middle is caught by the checksum', () => {
    // The length check cannot see this one — same size, different contents. This
    // is the case the checksum exists for.
    const state = makeState('Verbal');
    const full = encodeSaveExport(state, META);
    const json = JSON.stringify(state);
    const tampered = json.replace('"hp":22', '"hp":99');
    expect(tampered.length).toBe(json.length);
    const decoded = decodeSaveExport(full.replace(json, tampered));
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.reason).toMatch(/damaged|checksum/i);
  });

  test('the checksum is stable and actually distinguishes content', () => {
    expect(saveChecksum('abc')).toBe(saveChecksum('abc'));
    expect(saveChecksum('abc')).not.toBe(saveChecksum('abd'));
    expect(saveChecksum('')).toHaveLength(8);
    // Order matters — a transposition must change it.
    expect(saveChecksum('ab')).not.toBe(saveChecksum('ba'));
  });
});

describe('OTA-1178 — wrong input is refused in plain language', () => {
  test('an empty clipboard', () => {
    const d = decodeSaveExport('   ');
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toMatch(/empty/i);
  });

  test('something that is not a save at all', () => {
    const d = decodeSaveExport('=== TARTARIA LOG ===\nplayer walks north\n');
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toMatch(/does not look like a Tartaria save/i);
  });

  test('a save from a newer game version is refused, not guessed at', () => {
    const full = encodeSaveExport(makeState('Verbal'), META);
    const future = full.replace(`format: ${SAVE_EXPORT_FORMAT}`, `format: ${SAVE_EXPORT_FORMAT + 1}`);
    const d = decodeSaveExport(future);
    expect(d.ok).toBe(false);
    // ⚠ Half-loading an unknown layout is worse than a clear refusal, and the
    // message must tell them the actual remedy: update, then retry.
    if (!d.ok) expect(d.reason).toMatch(/newer version.*[Uu]pdate/s);
  });

  test('a well-formed envelope with no character in it', () => {
    const empty = { version: 1, savedAt: 1, player: null, worldMemory: {}, gameLog: [], currentScreen: 'title' };
    const d = decodeSaveExport(encodeSaveExport(empty as unknown as SaveState, META));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toMatch(/no character/i);
  });

  test('a character with a blank name is not a character', () => {
    const d = decodeSaveExport(encodeSaveExport(makeState('   '), META));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toMatch(/no character/i);
  });
});

describe('OTA-1178 — import writes a new slot and never overwrites', () => {
  test('⚠⚠ THE SAFETY PROPERTY — existing characters are untouched by an import', async () => {
    const keeper = makeState('Sasmooch');
    await saveSlot('slot_existing', keeper);
    const beforeBytes = await AsyncStorage.getItem(slotSaveKey('slot_existing'));
    const beforeSlots = await listSlots();
    expect(beforeSlots).toHaveLength(1);

    const result = await importSaveAsNewSlot(makeState('Verbal'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The imported character is ADDITIONAL.
    const after = await listSlots();
    expect(after).toHaveLength(2);
    expect(after.map((s) => s.playerName).sort()).toEqual(['Sasmooch', 'Verbal']);

    // ⚠ And the original's bytes are identical — not merely present, identical.
    expect(await AsyncStorage.getItem(slotSaveKey('slot_existing'))).toBe(beforeBytes);
    expect(result.slotId).not.toBe('slot_existing');
  });

  test('importing the SAME backup twice yields two characters, not a clobber', async () => {
    const text = encodeSaveExport(makeState('Verbal'), META);
    const a = decodeSaveExport(text);
    const b = decodeSaveExport(text);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const r1 = await importSaveAsNewSlot(a.state);
    const r2 = await importSaveAsNewSlot(b.state);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.slotId).not.toBe(r2.slotId);
    expect(await listSlots()).toHaveLength(2);
  });

  test('the restored character actually reads back', async () => {
    const r = await importSaveAsNewSlot(makeState('Verbal'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = await loadSlot(r.slotId);
    expect(back?.player?.name).toBe('Verbal');
  });

  test('⚠⚠ a FAILED write is reported as a failure, not as success', async () => {
    // `saveSlot` never throws — it stamps lastSaveWriteError and returns. An
    // importer that only awaited it would announce a character that does not
    // exist. This is the exact bug class this codebase has hunted before: a
    // writer claiming success without checking.
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('database or disk is full'));
    const r = await importSaveAsNewSlot(makeState('Verbal'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/could not be written|full/i);
  });

  test('a write that lands but never reaches the character list is a failure too', async () => {
    // Worse than a clean failure: the save exists but the title screen would
    // never show it, so the player believes it worked and cannot find it.
    const real = AsyncStorage.getItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key: string) => {
      // Report an empty index no matter what was written to it.
      if (key.includes('slots.index')) return null;
      return real(key);
    });
    const r = await importSaveAsNewSlot(makeState('Verbal'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/character list|did not appear/i);
  });
});

describe('OTA-1178 — the UI is told when the clipboard is not good enough', () => {
  test('a save past the chunking threshold prefers Share', () => {
    expect(shouldPreferShare(CLIPBOARD_SAFE_CHARS + 1)).toBe(true);
    expect(shouldPreferShare(100)).toBe(false);
    // ⚠ Pinned to the size TitleScreen already chunks dead-character logs at,
    // because the same destinations receive both (OTA-023).
    expect(CLIPBOARD_SAFE_CHARS).toBe(25_000);
  });

  test('size reads in units a person uses', () => {
    expect(exportSizeLabel(2048)).toBe('2 KB');
    expect(exportSizeLabel(2 * 1024 * 1024)).toBe('2.0 MB');
    // Never "0 KB" for a real save — that reads as "nothing was exported".
    expect(exportSizeLabel(10)).toBe('1 KB');
  });
});
