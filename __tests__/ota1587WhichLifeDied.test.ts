// ⚠⚠⚠ OTA-1587 — WHICH LIFE DIED. AN INSTRUMENT, NOT A FIX.
//
// Owner: *"add the telemetry."*
//
// ⚠⚠ THE MEASUREMENT. Ten `native-death` records in the crash ledger and SIX OF
// THE LAST SEVEN land on an OTA apply — 1571, 1578, 1580, 1581, 1582, one each.
// All read the same: `stage native:cognition:done`, 3xx–5xxms into the action,
// `alive 0ms after it`, with the session summary reporting `Live now: 1 ·
// Opened: 1 · Released: 0`. Task #77 closed this class as device memory
// pressure; that RCA measured a different FREQUENCY, and a standing condition of
// the device does not explain a kill on essentially every update-and-restart.
//
// ⚠⚠⚠ AND THE LEDGER STRUCTURALLY COULD NOT SAY WHICH PROCESS DIED. A breadcrumb
// carried no process identity, so a kill in the teardown BEFORE `reloadAsync`
// and a kill seconds INTO the boot `reloadAsync` started produced an identical
// record — and those two have opposite fixes. This suite pins the discrimination
// and nothing else: no behaviour changes, per the owner's own rule recorded in
// contextLedger.ts — **measure the cause, or ship an instrument.**

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  BOOT_ID, BOOT_AT, OTA_HANDOFF_KEY, HANDOFF_FRESH_MS,
  contextTag, bootStampFields, noteOtaHandoff, readOtaHandoff,
  launchFacts, launchLine, launchSummary, launchFactsSummary,
  noteLaunchFacts, _armHandoffSnapshotForTest, _resetLaunchFactsForTest,
  type OtaHandoff,
} from '../app/diagnostics/bootIdentity';
import { _setCrashLedgerForTests, crashLedgerSummary, type CrashRecord } from '../app/diagnostics/crashLedger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ctx = (over: Partial<OtaHandoff['ctx']> = {}): OtaHandoff['ctx'] => ({
  opened: 1, released: 1, live: 0, peakLive: 1, disposeFoundNothing: 0, stragglersTornDown: 0, ...over,
});

const handoff = (over: Partial<OtaHandoff> = {}): OtaHandoff => ({
  bootId: 'bprevious', bootAt: BOOT_AT - 60_000, at: BOOT_AT - 1_400,
  build: 'x', version: 'y', ctx: ctx(), path: 'mid-session', ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  _resetLaunchFactsForTest();
});

describe('OTA-1587 — a process finally has a name', () => {
  it('⚠⚠⚠ EVERY BREADCRUMB CARRIES THE LIFE THAT WROTE IT', () => {
    // The whole defect in one assertion. Without these three fields a surviving
    // crumb cannot say whether it came from the process that reloaded or the one
    // the reload started.
    const f = bootStampFields();
    expect(f.bootId).toBe(BOOT_ID);
    expect(f.bootAt).toBe(BOOT_AT);
    expect(f.ctx).toMatch(/^o\d+\/r\d+\/l\d+\/p\d+\/dn\d+$/);
  });

  it('⚠⚠ the id is minted once per life, not per call', () => {
    expect(bootStampFields().bootId).toBe(bootStampFields().bootId);
    expect(BOOT_ID).toMatch(/^b[a-z0-9]+$/);
  });

  it('⚠ and the ledger tag is five numbers, because a crumb must stay small', () => {
    // saveSystem's crumb is deliberately one tiny unbatched key so it outruns a
    // wedged JS thread. A nested object here would have cost that property.
    expect(contextTag(ctx({ opened: 2, released: 0, live: 2, peakLive: 2, disposeFoundNothing: 1 })))
      .toBe('o2/r0/l2/p2/dn1');
    expect(contextTag(ctx()).length).toBeLessThan(20);
  });
});

describe('OTA-1587 — the reload leaves a note, and the next life reads it once', () => {
  it('⚠⚠⚠ THE NOTE CARRIES THE DYING LIFE\'S CONTEXT LEDGER', async () => {
    // This is the payload the whole OTA exists for: what the old JS still held
    // when it asked the OS to load a new JS on top of it, in the SAME native
    // process. `live > 0` here is the orphaned-context hypothesis with a number
    // under it instead of a paragraph.
    await noteOtaHandoff('mid-session');
    const raw = await AsyncStorage.getItem(OTA_HANDOFF_KEY);
    expect(raw).toBeTruthy();
    const rec = JSON.parse(raw!) as OtaHandoff;
    expect(rec.bootId).toBe(BOOT_ID);
    expect(rec.path).toBe('mid-session');
    expect(rec.ctx).toBeDefined();
  });

  it('⚠⚠⚠ AND IT IS CONSUMED ON READ — OTA-1526\'s lesson, in the other direction', async () => {
    // OTA-1526's finding was that boot read a key the FRESH process was already
    // writing, so 20 of 22 death records described this session's own
    // handwriting. The same trap is open here the other way: a handoff left on
    // disk would be re-read by the next boot, and the one after that, each
    // reporting an OTA apply that happened days ago.
    await AsyncStorage.setItem(OTA_HANDOFF_KEY, JSON.stringify(handoff()));
    _armHandoffSnapshotForTest();
    const first = await readOtaHandoff();
    expect(first?.bootId).toBe('bprevious');
    expect(await AsyncStorage.getItem(OTA_HANDOFF_KEY)).toBeNull();
    // Handed out once — a survivor is a fact about a boot, not a value to re-read.
    expect(await readOtaHandoff()).toBeNull();
  });

  it('⚠⚠ a boot with no handoff says so, rather than saying nothing', async () => {
    _armHandoffSnapshotForTest();
    expect(await readOtaHandoff()).toBeNull();
    expect(launchLine(launchFacts(null))).toContain('not an OTA apply');
  });
});

describe('OTA-1587 — the two candidates are finally distinguishable', () => {
  it('⚠⚠⚠ A LIVE CONTEXT HANDED ACROSS THE RELOAD IS CALLED OUT IN CAPITALS', () => {
    const f = launchFacts(handoff({ ctx: ctx({ released: 0, live: 1 }) }));
    expect(f.afterOtaApply).toBe(true);
    expect(f.prevHeldContext).toBe(true);
    expect(f.prevCtx).toBe('o1/r0/l1/p1/dn0');
    expect(launchLine(f)).toContain('THE PREVIOUS LIFE STILL HELD A NATIVE CONTEXT');
    expect(launchSummary(f)).toContain('the second one');
  });

  it('⚠⚠ and a clean teardown is stated just as plainly — the instrument must be able to exonerate', () => {
    const f = launchFacts(handoff());
    expect(f.prevHeldContext).toBe(false);
    expect(launchLine(f)).toContain('previous life released its contexts first');
  });

  it('⚠⚠ a STALE handoff is reported as stale, never attributed to this boot', () => {
    // ⚠ And it is itself evidence: a handoff nobody consumed means the boot it
    // belonged to never got far enough to read it, which is the signature of a
    // boot that died young — exactly the event under investigation.
    const f = launchFacts(handoff({ at: BOOT_AT - HANDOFF_FRESH_MS - 1 }));
    expect(f.afterOtaApply).toBe(false);
    expect(f.stale).toBe(true);
    expect(launchLine(f)).toContain('never consumed it');
  });

  it('⚠ the About block refuses to guess before boot has resolved it', () => {
    // "cold start" and "not looked yet" are different facts, and a report that
    // guesses at one is worse than one that admits it does not know.
    expect(launchFactsSummary()).toContain('not resolved yet');
    noteLaunchFacts(launchFacts(handoff()));
    expect(launchFactsSummary()).toContain('Followed an OTA apply');
  });
});

describe('OTA-1587 — the crash ledger prints the discrimination', () => {
  const rec = (over: Partial<CrashRecord> = {}): CrashRecord => ({
    id: '1', ts: 100, kind: 'native-death', stage: 'native:cognition:done',
    message: 'Process died with no orderly exit while: (no action yet)',
    build: 'b', version: 'v', ...over,
  });

  it('⚠⚠⚠ A YOUNG DEATH ON AN OTA BOOT READS AS EXACTLY THAT', () => {
    _setCrashLedgerForTests([rec({
      launch: { ageMs: 1_412, afterOtaApply: true, otaGapMs: 2_050, prevCtx: 'o1/r0/l1/p1/dn0', ctx: 'o1/r0/l1/p1/dn0' },
    })]);
    const s = crashLedgerSummary();
    expect(s).toContain('died 1412ms into the process');
    expect(s).toContain('THIS BOOT FOLLOWED AN OTA APPLY 2050ms earlier');
    expect(s).toContain('handed over a LIVE native context');
  });

  it('⚠⚠⚠ AND THE ROLLUP NAMES THE PATTERN, which is what a reader misses', () => {
    // Finding "six of the last seven" took reading ten records against a list of
    // OTA timestamps by hand. Any reader who has the ledger now has the count.
    _setCrashLedgerForTests([
      rec({ id: '1', launch: { afterOtaApply: true, prevCtx: 'o1/r0/l1/p1/dn0' } }),
      rec({ id: '2', launch: { afterOtaApply: true, prevCtx: 'o1/r1/l0/p1/dn0' } }),
      rec({ id: '3', launch: { afterOtaApply: false } }),
    ]);
    const s = crashLedgerSummary();
    expect(s).toContain('2 of 3 process kills landed on an OTA-apply boot');
    expect(s).toContain('1 of those inherited a native model context');
  });

  it('⚠⚠ a record written before this OTA prints exactly as it did — no invented age', () => {
    // Every crumb on the owner's device today lacks `bootAt`. Synthesising an
    // age from the boot that READ the record would be the OTA-1526 defect
    // rebuilt: the instrument describing its own handwriting.
    _setCrashLedgerForTests([rec()]);
    const s = crashLedgerSummary();
    expect(s).not.toContain('launch:');
    expect(s).not.toContain('process kills landed on an OTA-apply boot');
  });
});

describe('OTA-1587 — wired where a dying process will actually reach it', () => {
  const SAVE = readFileSync(join(__dirname, '..', 'app', 'engine', 'saveSystem.ts'), 'utf8');
  const OTA = readFileSync(join(__dirname, '..', 'app', 'updates', 'checkAndApplyOTA.ts'), 'utf8');
  const BOOT = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'bootSlice.ts'), 'utf8');

  it('⚠⚠⚠ EVERY CRUMB WRITER GOES THROUGH withBootIdentity — all three of them', () => {
    // A crumb born without its life's name is the exact blind spot this OTA
    // closes, and there are three writers: the action stamp, the heartbeat, and
    // the checkpoint. Missing one means the interesting death is the unnamed one.
    expect(SAVE).toContain('_lastLiveCrumb = withBootIdentity(crumb);');
    expect(SAVE).toContain('_lastLiveCrumb = withBootIdentity(beat);');
    expect(SAVE).toContain('_lastLiveCrumb = withBootIdentity(next);');
  });

  it('⚠⚠⚠ THE HANDOFF IS WRITTEN BEFORE reloadAsync, ON BOTH RELOAD PATHS', () => {
    // A note written after the restart begins is a note that does not exist.
    expect(OTA).toContain("await markOrderlyExitForReload('boot-front');");
    expect(OTA).toContain("await markOrderlyExitForReload('mid-session');");
    expect(OTA).toContain('await boot.noteOtaHandoff(path);');
  });

  it('⚠⚠ the OTA window is labelled, so a death inside it stops borrowing the ML lock\'s phase', () => {
    // `native:cognition:done` is on six of seven kills. Whether that is the
    // answer or a coincidence cannot be read while the teardown window wears
    // whatever phase the ML lock last stamped.
    expect(OTA).toContain("stampOtaPhase('ota:teardown:start')");
    expect(OTA).toContain("stampOtaPhase('ota:teardown:done', otaContextTag())");
    expect(OTA).toContain("stampOtaPhase('ota:reload', 'mid-session')");
    expect(OTA).toContain("stampOtaPhase('ota:reload', 'boot-front')");
  });

  it('⚠⚠ boot reads the handoff and files it on the death record', () => {
    expect(BOOT).toContain('const launch = launchFacts(await readOtaHandoff());');
    expect(BOOT).toContain('get().appendLog(\'debug\', launchLine(launch));');
    // ⚠⚠⚠ OTA-1674 — THIS PIN USED TO READ `afterOtaApply: launch.afterOtaApply,`
    // AND IT WAS PINNING THE DEFECT. `launch` is the READING life's facts. The
    // handoff is consumed on read by the life that then dies (see
    // snapshotHandoff — correct, a handoff is a fact about one boot), so the
    // next boot found none, computed `false` about ITSELF, and this line wrote
    // it onto the dead life's record. A death record could never say "yes".
    // The record now reads the dead life's own answer off its crumb.
    expect(BOOT).toContain('afterOtaApply: crumb.afterOta,');
    expect(BOOT).not.toContain('afterOtaApply: launch.afterOtaApply,');
    expect(BOOT).toContain('ctx: crumb.ctx,');
  });

  it('⚠⚠⚠ AND IT CHANGES NOTHING — the owner\'s rule, violated once at a cost of a day', () => {
    // contextLedger.ts records it: *"measure the cause, or ship an instrument."*
    // OTA-1172 wrote it down, OTA-1173 overrode it with a well-argued paragraph
    // and created the loop it was trying to prevent. The paragraph in
    // bootIdentity's header is exactly as well argued and is likewise not a
    // number yet, so it ships as a question, not a fix.
    const BI = readFileSync(join(__dirname, '..', 'app', 'diagnostics', 'bootIdentity.ts'), 'utf8');
    // ⚠ AND THE CLAIM IS STATED AGAINST CODE, not against the header that argues
    // for it. The first draft pinned the owner's rule verbatim and
    // check:quotedpins refused it — correctly: a pin on prose fails when the
    // wording is improved and passes when the behaviour is deleted, which is
    // backwards. The rule stays in bootIdentity's header where the next person
    // tempted to override it will read it; what the SUITE guarantees is that the
    // file cannot act, because it imports nothing that can.
    // No dispose, no release, no reload: this file observes and does not act.
    // ⚠ Pinned on the CALL, not the word — OTA-1585's lesson, re-learned here on
    // the first run. The header explains `reloadAsync` at length (deliberately:
    // the receipt belongs at the site), so a bare text pin on the name can only
    // ever trip on the explanation.
    expect(BI).not.toContain("from 'expo-updates'");
    expect(BI).not.toContain("require('expo-updates')");
    expect(BI).not.toContain('.dispose(');
  });
});
