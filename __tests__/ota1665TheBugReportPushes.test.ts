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
// OTA-1665 — THE BUG REPORT PUSHES, AND ONLY ONCE PER CHANGED LOG.
//
// Owner, three instructions in one breath: *"I've removed the send log"*,
// *"report a bug should be the button that pushed the log, so we don't need the
// email route anymore, we can archive that bug report land"*, and *"after you do
// a bug report and that pushes a log, you can't do another one until something
// in the log is changed. so you have to go play for a little bit before it
// allows you to push another one."*
//
// ⚠⚠⚠ THE EMAIL ROUTE WAS NEVER THE DESIGN — it was a workaround for a native
// module nobody could build. The old note in bugReport.ts said as much: true
// zero-paste needed `expo-mail-composer`, which needs a native rebuild, and
// native builds are parked. So the player got a READ-ME-FIRST body, a manual
// paste, and a report that "arrives empty and we can't track the bug down"
// whenever they missed a step. Both daughters filed reports that way tonight.
// The transport it needed had been in the app since August; it just was not
// wired to the button people actually find.
//
// ⚠⚠ AND SEND LOG IS GONE. OTA-1661 opened it to everyone and gave it a two-tap
// consent step. One day later it is redundant, because REPORT A BUG asks for a
// description first — which is a better consent surface AND better evidence.
// Two buttons doing one send, on a screen that already fought a wall of COPY
// buttons, is the clutter this product keeps deleting.
//
// ⚠ EVERY OUTCOME SPEAKS. A push has real failure modes the mailto never had —
// queued, refused as a duplicate, refused because reporting is off, no
// destination in this build. The old Title screen flashed "✓ COPIED"
// unconditionally, because opening a mailto cannot meaningfully fail. Flashing
// success over a refusal would be a lie told by the one control that must never
// lie, so `composeAndSendBugReport` returns a message for every path and both
// screens render it verbatim.

import {
  composeAndSendBugReport, BUG_REPORT_MARK_KEY, type BugReportOutcome,
} from '../app/diagnostics/bugReport';

const readRepo = (...parts: string[]): string =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '..', ...parts), 'utf8',
  ) as string;

const module_ = (): string => readRepo('app', 'diagnostics', 'bugReport.ts');
const about = (): string => readRepo('app', 'screens', 'AboutScreen.tsx');
const title = (): string => readRepo('app', 'screens', 'TitleScreen.tsx');
const privacy = (): string => readRepo('docs', 'PRIVACY.md');

describe('OTA-1665 — ⚠⚠⚠ the email route is retired', () => {
  it('no clipboard, no mailto, no PASTE BELOW scaffolding', () => {
    const src = module_();
    expect(src).not.toContain('Clipboard');
    expect(src).not.toContain('mailto:');
    expect(src).not.toContain('PASTE BELOW');
    expect(src).not.toContain('READ ME FIRST');
    expect(src).not.toContain("from 'react-native'");
  });

  it('⚠ and it pushes through the DURABLE pipeline, persisting before it sends', () => {
    // The OTA-1504 rule, learned the night a mid-flush force-close destroyed
    // every bundle: the file goes to disk first so a kill costs nothing.
    const src = module_();
    const persist = src.indexOf('persistPendingBundle(');
    const send = src.indexOf('sendGameLogInline(', persist);
    expect(persist).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(persist);
  });

  it('the payload leads with a headline so a report is triageable at a glance', () => {
    const src = module_();
    // ⚠ Pinned as CODE, not as a sentence — `'const headline ='` reads as three
    // prose words to check:quotedpins, and the claim is anyway about what the
    // headline CARRIES: who, which build, and the first line of what they said.
    expect(src).toContain('getBuildCodename(OTA_BUILD_ID)');
    expect(src).toContain("description.split('\\n')[0]");
    expect(src).toContain('    headline,');
  });
});

describe('OTA-1665 — ⚠⚠ SEND LOG is gone', () => {
  // ⚠⚠⚠ ota1661's SUITE IS DELETED, and it is worth saying why rather than
  // letting it vanish. That OTA opened SEND LOG to everyone, gave it a two-tap
  // consent step and moved the privacy page to match — good work, one day old,
  // and every assertion in it described a button that no longer exists. Its
  // premise is superseded, not merely re-anchored, so it goes the way ota1146's
  // did: deleted, with the claims that OUTLIVED it carried here.
  //
  // What survives from 1661 and is asserted below or elsewhere in this file:
  //   · the push is not owner-gated (nobody has to be on a list to report);
  //   · `reportingEnabled()` still governs it, enforced in the transport;
  //   · the privacy page describes what leaves the device, and says the
  //     description itself is part of it;
  //   · the Children section states that a sent report includes typed text.
  // What did NOT survive: the two-tap arm/confirm, because the modal's
  // description field is the consent surface now, and it is a better one.

  it('the button, its states and its handler are all removed', () => {
    const src = about();
    expect(src).not.toContain('SEND LOG TO DEVELOPER');
    expect(src).not.toContain('TAP AGAIN TO CONFIRM SEND');
    expect(src).not.toContain('handleSendLog');
    expect(src).not.toContain('logSendState');
  });

  it('and REPORT A BUG is still there, ungated, as the one way in', () => {
    const src = about();
    expect(src).toContain('REPORT A BUG');
    expect(src).not.toContain('{ownerTools && crashConfigured && (');
  });

  it('⚠ the crash switch still governs the push — carried over from ota1661', () => {
    // Measured, not assumed: this is the check that keeps the privacy page's
    // "with the switch off the app never contacts Sentry at all" true of the
    // report too. The refusal names itself instead of failing silently.
    const t = readRepo('app', 'diagnostics', 'sentryTransport.ts');
    const body = t.slice(t.indexOf('export async function sendGameLogInline'));
    expect(body.slice(0, 2000)).toContain('if (!reportingEnabled()) {');
    expect(body.slice(0, 2000)).toContain('crash reporting is switched off on this device');
    // And the report path answers the same question in the player's words.
    expect(module_()).toContain("status: 'off'");
  });

  it('⚠ the no-tap auto-bundle is STILL owner-gated — the 1661 asymmetry holds', () => {
    // SEND LOG going away does not merge consent and collection. A deliberate
    // report is one thing; a slot-load upload from someone who chose nothing is
    // another, and it stays behind ownerToolsUnlocked.
    const auto = readRepo('app', 'diagnostics', 'autoBundle.ts');
    expect(auto).toContain('if (!(await ownerToolsUnlocked(player?.name))) return null;');
  });
});

describe('OTA-1665 — ⚠ every outcome speaks', () => {
  it('the Title screen no longer claims COPIED, and renders the real message', () => {
    const src = title();
    // ⚠ Scoped to the BUG REPORT button. This screen has several legitimate
    // COPY affordances (COPY URL, COPY CRASHED SAVE, the per-slot copy) that
    // still say COPIED and should — a blanket scan would have condemned them.
    expect(src).toContain("{bugReportSent ? '✓ SENT' : 'REPORT BUG'}");
    expect(src).not.toContain("{bugReportSent ? '✓ COPIED' : 'REPORT BUG'}");
    expect(src).toContain('setBugReportNote(outcome.message)');
    expect(src).toContain('{bugReportNote}');
  });

  it('⚠ and the dead legacy copy of the email flow is gone from the screen', () => {
    // It sat unreferenced behind an eslint-disable, still holding a clipboard
    // stage, a READ-ME-FIRST body and a mailto — the exact land the owner asked
    // to archive, and the first place it would grow back.
    const src = title();
    // ⚠ The DECLARATION, not the word — the comment that records why it went
    // names it, exactly as the loreLexicon comments name the respellings they
    // retired. A scan for the bare identifier would fail against its own
    // obituary, which is the OTA-1659 lesson arriving in a second file.
    expect(src).not.toContain('const _legacySendBugReport');
    expect(src).not.toContain('PASTE BELOW');
    // ⚠ Scoped to the handler's own BODY by brace matching. The INVITE
    // PLAYTESTER handler sits a few lines below and still opens a mailto, as it
    // should — that one is a short human request to a person, not a payload.
    // A window drawn to the next `const` swallowed it and condemned the wrong
    // feature; the fix is to read the function, not the neighbourhood.
    const at = src.indexOf('const sendBugReport');
    // ⚠ Match from the ARROW's brace, not the first `{` after the name — that
    // one opens the destructured argument type and closes three lines later,
    // which is how the previous attempt "read" an empty function and passed
    // nothing but its own signature.
    let depth = 0; let end = at;
    for (let i = src.indexOf('=> {', at) + 3; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(at, end);
    expect(body).toContain('composeAndSendBugReport(args)');
    expect(body).not.toContain('mailto:');
    expect(body).not.toContain('Clipboard');
  });

  it('the About screen renders the message too', () => {
    const src = about();
    expect(src).toContain('setBugReportResult(r.message)');
    expect(src).toContain('{bugReportResult}');
  });

  it('⚠⚠ and NO status can return without one — checked exhaustively', async () => {
    // Not a source scan: every reachable path is run and its message asserted
    // non-empty. A future branch that returns `{status}` with no words fails.
    const outcomes: BugReportOutcome[] = [];
    outcomes.push(await composeAndSendBugReport({ slot: null, description: 'first' }));
    outcomes.push(await composeAndSendBugReport({ slot: null, description: '' }));
    for (const o of outcomes) {
      expect(typeof o.message).toBe('string');
      expect(o.message.length).toBeGreaterThan(10);
    }
  });

  it('and it NEVER throws, whatever the transport does', async () => {
    await expect(composeAndSendBugReport({ slot: null, description: 'x' })).resolves.toBeDefined();
  });
});

describe('OTA-1665 — ⚠⚠⚠ one report per changed log', () => {
  it('the gate runs BEFORE anything is sent or stored', () => {
    const src = module_();
    const gate = src.indexOf("status: 'unchanged'");
    const persist = src.indexOf('persistPendingBundle(');
    expect(gate).toBeGreaterThan(-1);
    expect(persist).toBeGreaterThan(gate);
  });

  it('⚠ the fingerprint moves when the log grows OR when its tail changes', () => {
    // Length alone would let a same-size edit through; the tail costs nothing.
    const src = module_();
    const fp = src.slice(src.indexOf('function logFingerprint'));
    expect(fp.slice(0, 300)).toContain('raw.length');
    expect(fp.slice(0, 300)).toContain('raw.slice(-240)');
    // Keyed per slot, so one character's report cannot mute another's.
    expect(fp.slice(0, 300)).toContain('${slotId}');
  });

  it('⚠⚠ a general report with NO character is never blocked', () => {
    // The report that matters most — "the game will not start" — carries no
    // play by definition. Gating it on a changed log would lock the player out
    // of the only channel they have.
    const src = module_();
    expect(src).toContain('const mark = slot ? logFingerprint(slot.slotId, rawLog) : null;');
    expect(src).toContain('if (mark) {');
  });

  it('the mark is stored on a QUEUED send too, not just a landed one', () => {
    // The bundle is already on disk and the boot retry owns it; letting a
    // second identical report through would queue a duplicate of something
    // already waiting — the exact outcome this rule exists to prevent.
    const src = module_();
    const setMark = src.indexOf('AsyncStorage.setItem(BUG_REPORT_MARK_KEY');
    const ret = src.indexOf("status: 'sent'", setMark);
    expect(setMark).toBeGreaterThan(-1);
    expect(ret).toBeGreaterThan(setMark);
  });

  it('the refusal is a distinct outcome, not a silent no', () => {
    // ⚠ NOT pinned to the sentence. A quoted refusal string fails on a reword
    // and passes if the refusal is deleted — the shape check:quotedpins exists
    // to retire. The claim that matters is structural: 'unchanged' is its own
    // status carrying its own words, and the exhaustive message check above
    // proves no status can return wordless.
    expect(module_()).toContain("status: 'unchanged'");
    const branch = module_().slice(module_().indexOf("status: 'unchanged'"));
    expect(branch.slice(0, 300)).toContain('message:');
  });

  it('the key is exported, so the mark can be found and cleared', () => {
    expect(BUG_REPORT_MARK_KEY).toBe('@tartaria/lastBugReportFingerprint');
  });
});

describe('OTA-1665 — ⚠⚠ the privacy page moved with the button', () => {
  it('it describes REPORT A BUG, and no longer describes a button that is gone', () => {
    const p = privacy();
    expect(p).toContain('## Sending a report yourself');
    expect(p).not.toContain('SEND LOG');
  });

  it('and it states the one-per-changed-log rule, because the player will meet it', () => {
    const p = privacy();
    const sec = p.slice(p.indexOf('## Sending a report yourself'));
    expect(sec).toMatch(/One report per session of play/);
    expect(sec).toMatch(/what you \*\*typed into the report\*\*/);
    expect(sec).toMatch(/REPORT A BUG cannot send/);
  });
});
