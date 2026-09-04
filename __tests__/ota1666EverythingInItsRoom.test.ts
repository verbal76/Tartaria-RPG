jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1666 — EVERYTHING IN ITS ROOM.
//
// Owner, on the settings SESSION tab: *"it looks like in the settings the
// session tab has got a little convoluted, a little disorganized, and it's kind
// of weird how it's set up. let's make sure that everything is in its
// appropriate place, everything is labeled correctly, everything is intuitive,
// and if we really need to still show all those buttons there. I mean this is
// layer after layer after layer of debug attempt since we started doing this
// game. is everything we have in there still necessary?"*
//
// And, mid-build: *"also lore should not be under settings, this is a
// duplicate. it has another home already, the correct one lives on the minimap,
// so this duplicate tab in settings can go."*
//
// ⚠⚠⚠ THE AUDIT FOUND FOUR THINGS THAT WERE NOT MERELY UNTIDY — they were
// FALSE, and three of the four I had shipped myself within the last two days:
//
//   1. A footnote read "Long-press COPY LOG for the share + chunked-paste
//      view." `onLongPress` has never appeared in AboutScreen.tsx. The screen
//      whose entire job is telling a player what a button does was instructing
//      a gesture that does not exist.
//   2. The crash-reports switch explained its effect on SEND LOG, TWICE.
//      OTA-1665 deleted SEND LOG one OTA ago; I rewrote the screen around that
//      deletion and did not re-read the two sentences beside it.
//   3. CLEAR LOG was a ONE-TAP BYPASS of OTA-1665's own dedupe gate — see the
//      third describe below. Erasing the log changes the fingerprint, so the
//      "one report per changed log" rule admitted a second report carrying no
//      evidence at all.
//   4. Under the header REPORTING, the first two controls were COPY LOG and
//      CLEAR LOG — a clipboard dump and a destructive erase — sitting ABOVE the
//      one button that reports anything.
//
// ⚠⚠ AND TWO OF MY OWN AUDIT FINDINGS WERE WRONG, which is why this file
// measures rather than asserts from a table. I had written down "COPY SAVE is a
// strict duplicate of BACK UP CHARACTER" and "COPY INVENTORY is dead, the
// report carries the inventory". Reading the code:
//
//   • BACK UP CHARACTER writes `encodeSaveExport` — a checksummed,
//     truncation-detecting envelope whose partner is RESTORE on the title
//     screen. COPY SAVE writes `stampSaveExport(buildSaveSnapshot(…))`, the
//     flat blob IMPORT SAVE parses. Different formats, different partners.
//     COPY SAVE STAYS, relabelled so the pair reads as a pair.
//   • The report carried description + device + voice + log and NOTHING about
//     the pack. So COPY INVENTORY was not dead — it was the only way that
//     evidence ever arrived. The fix was to put the pack IN the report first
//     (bugReport.ts) and only then delete the button.
//
// The rule this leaves behind: a control is removable when its job has a
// verified new home, not when a tidy-up table says it looks redundant.

import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ROOT = join(__dirname, '..');
const ABOUT = readFileSync(join(ROOT, 'app', 'screens', 'AboutScreen.tsx'), 'utf8');
const BUGREPORT = readFileSync(join(ROOT, 'app', 'diagnostics', 'bugReport.ts'), 'utf8');
const EXPLORATION = readFileSync(join(ROOT, 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');

/** ⚠ Comments stripped. Half of this OTA is comments ABOUT the controls it
 *  removed, and those comments quote the retired labels on purpose — that is
 *  the record. A scan that read them would pass on the prose and miss the
 *  code, which is the exact failure mode `check:quotedpins` rule 1 exists to
 *  ban. Every assertion below reads CODE. */
const code = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const ABOUT_CODE = code(ABOUT);
const BUGREPORT_CODE = code(BUGREPORT);

describe('OTA-1666 — ⚠⚠ the LORE tab is gone, and the codex kept its real door', () => {
  it('SETTINGS no longer offers a lore tab', () => {
    // The tab row is built from this literal array; 'lore' being absent from it
    // is the whole removal, and the union type below makes a stale
    // `tab === 'lore'` a compile error rather than dead JSX.
    expect(ABOUT_CODE).toContain("['session', 'sfx', 'display', 'about', 'notices']");
    expect(ABOUT_CODE).not.toContain("tab === 'lore'");
  });

  it('⚠ and it was never a second implementation — it rendered the same component', () => {
    // This is why the owner is right that it is a duplicate rather than a
    // variant: one component, two doors, one of them buried in a settings
    // screen. Nothing about the codex changed here.
    expect(ABOUT_CODE).not.toContain('LoreCodexBody');
  });

  it('⚠⚠ THE SURVIVING DOOR IS STILL WIRED — the removal did not orphan the codex', () => {
    // The crest button on the exploration screen. If this ever stops routing,
    // the codex becomes unreachable and this OTA is the reason why, so the
    // claim is asserted here rather than assumed.
    expect(code(EXPLORATION)).toContain("setScreen('lore')");
  });
});

describe('OTA-1666 — ⚠ a display setting lives on the DISPLAY tab', () => {
  it('the scale row moved out of SESSION and into DISPLAY', () => {
    // Position is the claim: the row must sit after the DISPLAY tab's guard and
    // before the SFX tab's, i.e. inside the display tab and nowhere else.
    const row = ABOUT_CODE.indexOf('Display size');
    const displayGuard = ABOUT_CODE.indexOf("tab === 'display'");
    const sfxGuard = ABOUT_CODE.indexOf("tab === 'sfx'");
    expect(row).toBeGreaterThan(displayGuard);
    expect(row).toBeLessThan(sfxGuard);
    // And exactly one of them — a copy left behind in SESSION would be two.
    expect(ABOUT_CODE.split('Display size').length - 1).toBe(2); // label + a11y label
  });

  it('⚠ the desktop-only gate came with it, unchanged', () => {
    // OTA-1227's rule: absent entirely off-desktop rather than shown inert.
    // Moving a control is exactly when a gate gets dropped by accident.
    expect(ABOUT_CODE).toContain('scaleSupported');
    expect(ABOUT_CODE).toContain('displayScaleSupported()');
  });
});

describe('OTA-1666 — ⚠⚠⚠ CLEAR LOG was a one-tap bypass of the dedupe gate', () => {
  // OTA-1665, one day old: *"after you do a bug report and that pushes a log,
  // you can't do another one until something in the log is changed."* The gate
  // fingerprints `slotId : rawLog.length : rawLog.slice(-240)`. ERASING the log
  // changes the length AND the tail — so the fingerprint changes, so a second
  // report is admitted, carrying an empty log, seconds after the first. That is
  // the duplicate-with-no-evidence the owner asked to block, reachable in one
  // tap from the same screen.
  it('the erase stamps the mark an empty log would produce', () => {
    // The stamped value is not decorative — it must equal, byte for byte, what
    // composeAndSendBugReport computes for a log with nothing in it. Any other
    // value leaves the hole open.
    expect(ABOUT_CODE).toContain('BUG_REPORT_MARK_KEY, `${slotId}:0:`');
    expect(BUGREPORT_CODE).toContain('return `${slotId}:${raw.length}:${raw.slice(-240)}`;');
  });

  it('⚠⚠ AND THE REPORT ACTUALLY REFUSES after the erase — measured, not reasoned', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { composeAndSendBugReport, BUG_REPORT_MARK_KEY } =
      require('../app/diagnostics/bugReport') as typeof import('../app/diagnostics/bugReport');
    const slot = {
      slotId: 'slot_erase_probe', playerName: 'Verbal', raceId: 'mud_golem',
      locationId: 'ashen_reach', hp: 10, hpMax: 10, dead: false,
    };
    return (async () => {
      // Stand where a player stands one tap after tapping ERASE.
      await AsyncStorage.setItem(BUG_REPORT_MARK_KEY, 'slot_erase_probe:0:');
      const out = await composeAndSendBugReport({
        slot: slot as never,
        description: 'second report, nothing played since the erase',
      });
      expect(out.status).toBe('unchanged');
      // B15: the refusal speaks. A gate that silently swallows a tap is the
      // failure this session has fixed four times elsewhere.
      expect(out.message.length).toBeGreaterThan(0);
    })();
  });

  it('⚠ the erase is last, and its label names the consequence', () => {
    // It used to sit second from the top of REPORTING, a thumb's width from
    // REPORT A BUG. Position is the safety property; the label is the honesty.
    // ⚠ The call SITES, not the declarations — `handleClearLog()` also matches
    // its own `async function` header 15,000 characters earlier, which is what
    // the first draft of this test compared and got a green-looking failure
    // from. Position claims have to name the thing on the screen.
    const bug = ABOUT_CODE.indexOf('onPress={() => setBugReportOpen(true)}');
    const erase = ABOUT_CODE.indexOf('void handleClearLog();');
    expect(bug).toBeGreaterThan(0);
    expect(bug).toBeLessThan(erase);
    expect(ABOUT_CODE).toContain('ERASE THIS LOG');
    // And it is behind the collapsed drawer, not on the open page.
    expect(ABOUT_CODE.indexOf('advancedOpen && (')).toBeLessThan(erase);
  });
});

describe('OTA-1666 — ⚠⚠ the report carries the pack, so the button could go', () => {
  it('bugReport composes the inventory snapshot into the payload', () => {
    expect(BUGREPORT_CODE).toContain('buildInventorySnapshot');
    expect(BUGREPORT_CODE).toContain('--- INVENTORY ---');
    // And the durable bundle's `inventory` field stops being an empty string —
    // it has had that shape since OTA-1504 and nothing ever filled it.
    expect(BUGREPORT_CODE).not.toContain("inventory: ''");
    expect(BUGREPORT_CODE).toContain('inventory: inventoryBlock');
  });

  it('⚠ the pack is capped BELOW the log, deliberately', () => {
    // If something must be trimmed it is not the part that explains why the
    // report was filed. A hoarder's snapshot can run long.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = BUGREPORT_CODE;
    const invCap = Number(/INVENTORY_CHARS_CAP = ([0-9_]+)/.exec(src)?.[1]?.replace(/_/g, ''));
    const logCap = Number(/LOG_CHARS_CAP = ([0-9_]+)/.exec(src)?.[1]?.replace(/_/g, ''));
    expect(invCap).toBeGreaterThan(0);
    expect(invCap).toBeLessThan(logCap);
  });

  it('⚠⚠ the pack never costs a report — a throwing catalog read is survivable', () => {
    // buildInventorySnapshot resolves every item against the catalogs, which is
    // exactly the shape that threw in OTA-1663 on a drifted key. A bug report
    // that cannot be filed because the pack could not be listed would be a
    // worse defect than the one being reported.
    const block = BUGREPORT_CODE.slice(
      BUGREPORT_CODE.indexOf('let inventoryBlock'),
      BUGREPORT_CODE.indexOf('const report = ['),
    );
    expect(block).toContain('try {');
    expect(block).toContain('} catch {');
  });

  it('and COPY INVENTORY is gone from the screen', () => {
    expect(ABOUT_CODE).not.toContain('handleCopyInventory');
    expect(ABOUT_CODE).not.toContain('COPY INVENTORY');
  });
});

describe('OTA-1666 — ⚠⚠ the screen stopped describing things that do not exist', () => {
  it('the long-press footnote is gone, and the gesture it named still does not exist', () => {
    // Both halves matter. Deleting the sentence while quietly adding an
    // onLongPress would also pass a "no footnote" check and would be a
    // different screen than the one this OTA describes.
    expect(ABOUT_CODE).not.toContain('Long-press');
    expect(ABOUT_CODE).not.toContain('onLongPress');
  });

  it('⚠⚠⚠ the crash-reports switch no longer explains a button deleted one OTA ago', () => {
    // OTA-1665 removed SEND LOG. These two sentences named it twice and shipped
    // anyway. The scan is over CODE, so it reads the strings a player is shown
    // and not this file's own account of them.
    expect(ABOUT_CODE).not.toContain('SEND LOG');
  });

  it('⚠ the drawer is not called EXPORTS any more, because half of it is not one', () => {
    // It holds an IMPORT and a destructive ERASE. The old label was wrong about
    // two of its buttons.
    expect(ABOUT_CODE).not.toContain('ADVANCED EXPORTS');
    expect(ABOUT_CODE).toContain("'▾ ADVANCED' : '▸ ADVANCED'");
  });
});

describe('OTA-1666 — ⚠ COPY SAVE survived, and the reason is measurable', () => {
  it('it is a different export from BACK UP CHARACTER, with a different partner', () => {
    // My audit called it a strict duplicate. The two functions share no
    // encoder: BACK UP goes through encodeSaveExport (checksummed envelope,
    // partner = RESTORE on the title screen), COPY SAVE through
    // stampSaveExport/buildSaveSnapshot (flat blob, partner = IMPORT SAVE right
    // below it). Deleting it would have orphaned IMPORT SAVE.
    const backup = readFileSync(join(ROOT, 'app', 'ui', 'backupCharacter.ts'), 'utf8');
    expect(code(backup)).toContain('encodeSaveExport');
    expect(code(backup)).not.toContain('buildSaveSnapshot');
    expect(ABOUT_CODE).toContain('buildSaveSnapshot');
    expect(ABOUT_CODE).toContain('handleImportSave');
  });

  it('and its label now names that partner', () => {
    expect(ABOUT_CODE).toContain('COPY SAVE (for IMPORT SAVE below)');
  });
});
