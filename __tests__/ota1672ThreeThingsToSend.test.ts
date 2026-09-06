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

// OTA-1672 — THREE THINGS TO SEND, AND THE ANSWER TAKES THE SCREEN.
//
// Owner, on the gate: *"I can't hit send on a bug on my main character until I
// type something in that box, right? So this new button that would just say send
// log doesn't need me to type something in the box, cuz I'm legitimately just
// sending you a log … there should still be a text box gate on the send button
// for general bugs or character bugs, because I need to know what you're trying
// to show me."*
//
// And on the outcome: *"have the log sent line that I missed the first few times
// appear as a popup so it's very visible."*
//
// ⚠⚠⚠ THE SEPARATE MARK IS HIS RULING, NOT MY CONVENIENCE. I put the choice to
// him plainly: with one shared fingerprint, filing a described report and then
// pushing the raw log about the same moment is refused, because the log has not
// changed since — you would have to go and play before you could send the log
// about the thing you just reported. He chose separate marks. The OTA-1665 rule
// itself is untouched; it just applies PER MODE, so neither becomes a spam
// button and neither can silence the other.
//
// ⚠⚠ AND THE POPUP EXISTS BECAUSE THE QUIET LINE CAUSED THE DEFECT IT REPORTS.
// A player who does not see the outcome taps the button again — which is exactly
// the duplicate-report behaviour the dedupe gate was built to stop. Making the
// answer visible attacks the same problem one step earlier.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  markKeyForMode, bugReportOutcomeTitle,
  BUG_REPORT_MARK_KEY, FULL_LOG_MARK_KEY,
  type BugReportStatus,
} from '../app/diagnostics/bugReport';

const ROOT = join(__dirname, '..');
const src = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const code = (s: string): string => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const MODAL = code(src('app/components/BugReportModal.tsx'));
const REPORT = code(src('app/diagnostics/bugReport.ts'));
const ABOUT = code(src('app/screens/AboutScreen.tsx'));
const TITLE = code(src('app/screens/TitleScreen.tsx'));

describe('OTA-1672 — ⚠⚠⚠ the two marks are genuinely two', () => {
  it('a described report and a full-log push consume DIFFERENT keys', () => {
    // The whole ruling in one assertion. If these ever collapse to one key, the
    // second of the two sends starts being refused for looking like the first.
    expect(markKeyForMode('character')).toBe(BUG_REPORT_MARK_KEY);
    expect(markKeyForMode('general')).toBe(BUG_REPORT_MARK_KEY);
    expect(markKeyForMode('fulllog')).toBe(FULL_LOG_MARK_KEY);
    expect(FULL_LOG_MARK_KEY).not.toBe(BUG_REPORT_MARK_KEY);
  });

  it('⚠ but a character bug and a general bug still SHARE one', () => {
    // They are the same artefact — a report carrying the player's words — and
    // giving them separate marks would let the same complaint be filed twice on
    // an unchanged log just by moving the radio button. That is the duplicate
    // the OTA-1665 rule exists to refuse.
    expect(markKeyForMode('character')).toBe(markKeyForMode('general'));
  });

  it('⚠⚠ the gate still runs PER MODE, not once for both', () => {
    // Stated against the source as well, because the behaviour above would also
    // pass if the composer read markKeyForMode and then wrote the constant.
    expect(REPORT.includes('const markKey = markKeyForMode(mode);')).toBe(true);
    expect(REPORT.includes('AsyncStorage.getItem(markKey)')).toBe(true);
    expect(REPORT.includes('AsyncStorage.setItem(markKey, mark)')).toBe(true);
  });

  it('⚠⚠⚠ ERASE THIS LOG clears BOTH, or a gate outlives its evidence', () => {
    // The About screen stamps the empty-log fingerprint so the next report is
    // not refused against a log that no longer exists. With two marks, clearing
    // one would leave the other refusing on deleted evidence — a refusal the
    // player cannot act on and cannot understand.
    const clear = ABOUT.slice(ABOUT.indexOf('async function handleClearLog'));
    expect(clear.slice(0, 900).includes('setItem(BUG_REPORT_MARK_KEY')).toBe(true);
    expect(clear.slice(0, 900).includes('setItem(FULL_LOG_MARK_KEY')).toBe(true);
  });
});

describe('OTA-1672 — ⚠⚠ the text box gates two of the three', () => {
  it('SEND is gated on typed text for a described report, and NOT for the log', () => {
    // His sentence, as a predicate. A full-log push needs a log to send, and
    // nothing else; a described report needs words in the box.
    expect(MODAL.includes('const canSend = isFullLog ? fullLogSlot !== null : description.trim().length > 0;'))
      .toBe(true);
  });

  it('⚠⚠⚠ the box is ABSENT in full-log mode, not disabled', () => {
    // Disabling it would have been the smaller edit and the wrong one: a greyed
    // field still reads as something the player is failing to fill in, which is
    // the confusion this OTA is removing rather than restyling.
    // ⚠ OTA-1718 — the end marker was `buttonRow`, which now appears EARLIER in
    // the file than this ternary: the buttons moved into the card's pinned
    // `footer` prop when the modal was made keyboard-aware, so the slice ran
    // backwards and read nothing. The claim is unchanged; the landmark is the
    // close of the card's children.
    const branch = MODAL.slice(MODAL.indexOf('isFullLog ?', MODAL.indexOf('DESCRIBE THE ISSUE') - 400), MODAL.indexOf('</KeyboardSafeCard>'));
    expect(branch.includes('<TextInput')).toBe(true);
    const beforeInput = branch.slice(0, branch.indexOf('<TextInput'));
    // The TextInput that survives lives in the ELSE arm — the full-log arm ends
    // before it, at the ternary's colon.
    expect(beforeInput.includes(') : (')).toBe(true);
  });

  it('⚠ the send carries which mode it was, so the composer is not guessing', () => {
    expect(MODAL.includes("mode: 'fulllog'")).toBe(true);
    expect(MODAL.includes("mode: slot ? 'character' : 'general'")).toBe(true);
  });

  it('⚠⚠ the full-log row NAMES whose log it will push', () => {
    // A control that says "send full log" without saying whose is the shape this
    // project keeps repairing: the player taps, something goes somewhere, and
    // nobody can say what went.
    expect(MODAL.includes("`${fullLogSlot.playerName}'s log · no description needed`")).toBe(true);
  });

  it('⚠⚠⚠ and it is not offered when there is no log to send', () => {
    // A row that promises a push it cannot perform is the claims-success-
    // without-checking class, on the one control a stuck player reaches for.
    expect(MODAL.includes('{fullLogSlot !== null && (')).toBe(true);
  });

  it('the full-log push does not arrive with an empty description field', () => {
    // Blank would read to a triager as a player who had nothing to say, rather
    // than as a deliberate raw push. It says which it is.
    expect(REPORT.includes("'(full log pushed for analysis — no description asked for)'")).toBe(true);
  });
});

describe('OTA-1672 — ⚠⚠ the outcome is impossible to miss', () => {
  it('every status has a popup title, and none of them lies', () => {
    const statuses: BugReportStatus[] = ['sent', 'queued', 'unchanged', 'off', 'unconfigured', 'failed'];
    for (const s of statuses) {
      const t = bugReportOutcomeTitle(s);
      expect({ s, len: t.length > 0 }).toEqual({ s, len: true });
      // ⚠ The one thing a bug button must never do. Only a landed send may say
      // the word SENT on its own: 'queued' says it was saved, and every refusal
      // says NOT SENT.
      if (s !== 'sent') {
        expect({ s, claimsSent: t === 'REPORT SENT' }).toEqual({ s, claimsSent: false });
      }
    }
    expect(bugReportOutcomeTitle('sent')).toBe('REPORT SENT');
  });

  it('⚠⚠ BOTH surfaces raise it, from the same helper', () => {
    // Two screens file the identical report (arb75); they must also say the
    // identical thing about what happened to it.
    for (const [name, s] of [['About', ABOUT], ['Title', TITLE]] as const) {
      expect({ name, calls: s.includes('bugReportOutcomeTitle(') }).toEqual({ name, calls: true });
      expect({ name, pops: s.includes('setBugReportPopup(') }).toEqual({ name, pops: true });
    }
  });

  it('⚠ the quiet line SURVIVES alongside it — the popup adds, it does not replace', () => {
    // The line is the record you can scroll back to after dismissing the card,
    // and it costs nothing to keep.
    expect(ABOUT.includes('{bugReportResult}')).toBe(true);
    expect(TITLE.includes('{bugReportNote}')).toBe(true);
  });
});

describe('OTA-1672 — ⚠ the copy no longer describes a route that was deleted', () => {
  it('the modal stops promising a clipboard and an email', () => {
    // OTA-1665 retired the mailto; this body text kept instructing the player to
    // "paste them into the email body before sending" for seven OTAs after. On
    // the one screen a confused player reads, stale instructions are worse than
    // none — they send someone hunting for an email that never opens.
    expect(MODAL.toLowerCase()).not.toContain('paste them into the email');
    expect(MODAL.toLowerCase()).not.toContain('clipboard');
  });
});
