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

// OTA-1674 — THE DEAD LIFE ANSWERS FOR ITSELF.
//
// Owner: *"fix all existing issues one through six"* — item one being #110, the
// process kill on nearly every boot.
//
// ⚠⚠⚠ WHAT THE 19:40 LEDGER ACTUALLY SAID, read entry by entry. Ten records.
// Eight at `stage boot:qwen:deferred`, six of those dead 670–1006ms into the
// process with `alive 0ms` after the stamp and `(no action yet)` — sub-second,
// before the first screen, before Qwen has loaded (it is DEFERRED). And every
// one of the eight: `not an OTA-apply boot`.
//
// ⚠⚠ THREE THINGS RULED OUT BEFORE ANYTHING WAS WRITTEN:
//   • a boot-front race — App.tsx awaits the OTA check and RETURNS on 'applied',
//     so `qwen:deferred` is unreachable on an apply;
//   • anything heavy at that stage — `armQwenWarm` stores a closure;
//   • ML init — mlHealth reports crash count 0.
//
// ⚠⚠⚠ AND THE ONE THING THAT COULD NOT BE RULED EITHER WAY, because the
// instrument built to decide it stored its answer in the wrong life. OTA-1587
// asked of every death: did the process that died boot on the far side of
// `reloadAsync`? The handoff that answers it is CONSUMED ON READ — correctly; a
// handoff is a fact about one boot — by the life that then dies, taking the
// only copy with it. The next boot finds no handoff, computes `afterOtaApply:
// false` about ITSELF, and bootSlice wrote that onto the dead life's record.
// A death record could never say "yes". "Not an OTA-apply boot" on eight of
// ten was not a finding; it was the only value the field could take.
//
// So the fact now rides the CRUMB, stamped by the life it describes, and the
// record reads it from there. `undefined` stays `undefined` — "not yet known"
// is a fact, "false" is a lie — and every reader prints the three cases apart.
//
// ⚠⚠ TWO MORE THINGS THE SAME READ TURNED UP, fixed in the same OTA:
//   • the ledger label keyed on `kind` alone, so the idle reclaims OTA-1567 had
//     already made non-fatal still printed PROCESS KILLED — no JS ran in About
//     and in every bug report, and were counted in "N recorded";
//   • the whole `launch` block has been on every record since OTA-1587 and
//     forwarded to Sentry on none of them.
//
// ⚠ NO BOOT-PHASE EXEMPTION, deliberately. Six sub-second no-action deaths look
// like a force-close during the splash — but they also look like OTA-1587's
// candidate (b), a reload-boot killed by an orphaned native context, and this
// instrument is what will tell those apart. Filing them as non-fatal now would
// hide (b) if it is real: the blind-spot trade OTA-1377 and OTA-1413 refused.
// Measure the cause, or ship an instrument. This is the instrument.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  bootStampFields, noteLaunchFacts, launchFacts, _resetLaunchFactsForTest, BOOT_AT,
  type OtaHandoff,
} from '../app/diagnostics/bootIdentity';
import { crashLedgerSummary, _setCrashLedgerForTests, type CrashRecord } from '../app/diagnostics/crashLedger';
import { toSentryEvent } from '../app/diagnostics/sentryTransport';

const ROOT = join(__dirname, '..');
const code = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const BOOT = code(readFileSync(join(ROOT, 'app', 'state', 'slices', 'bootSlice.ts'), 'utf8'));

/** A handoff the previous life left 2s before this one started — fresh, so
 *  launchFacts says this boot followed it — with a LIVE context handed over. */
const handoff = (over: Partial<OtaHandoff> = {}): OtaHandoff => ({
  bootId: 'bprev', bootAt: BOOT_AT - 5_000, at: BOOT_AT - 2_000, build: 'b', version: 'v',
  ctx: { opened: 1, released: 0, live: 1, peakLive: 1, disposeFoundNothing: 0, stragglersTornDown: 0 },
  path: 'boot-front',
  ...over,
});

const rec = (over: Partial<CrashRecord> = {}): CrashRecord => ({
  id: 'r', ts: 100, kind: 'native-death', stage: 'boot:qwen:deferred',
  message: 'Process died with no orderly exit while: (no action yet)',
  build: 'b', version: 'v', ...over,
});

describe('OTA-1674 — ⚠⚠⚠ the crumb carries the DEAD life\'s own launch fact', () => {
  beforeEach(() => _resetLaunchFactsForTest());
  afterEach(() => _resetLaunchFactsForTest());

  it('before the launch has resolved, the fact is ABSENT — not forged as false', () => {
    // The first few milliseconds of a life write crumbs before hydrate has read
    // the handoff. A crumb from that window must say "not known", because a
    // reader that sees `false` there files a cold start, and that is the exact
    // lie this OTA exists to stop.
    const f = bootStampFields();
    expect('afterOta' in f).toBe(false);
    expect(f.afterOta).toBeUndefined();
  });

  it('⚠⚠⚠ once this life resolves that it followed an apply, every crumb says so', () => {
    noteLaunchFacts(launchFacts(handoff()));
    const f = bootStampFields();
    expect(f.afterOta).toBe(true);
    expect(f.otaPath).toBe('boot-front');
    expect(f.prevCtx).toBe('o1/r0/l1/p1/dn0');
    expect(typeof f.otaGapMs).toBe('number');
  });

  it('⚠ and a resolved cold start says false — with nothing else attached', () => {
    noteLaunchFacts(launchFacts(null));
    const f = bootStampFields();
    expect(f.afterOta).toBe(false);
    expect('otaPath' in f).toBe(false);
    expect('prevCtx' in f).toBe(false);
  });

  it('the OTA-1587 contract is untouched — id, start and ledger still ride every crumb', () => {
    noteLaunchFacts(launchFacts(handoff()));
    const f = bootStampFields();
    expect(typeof f.bootId).toBe('string');
    expect(typeof f.bootAt).toBe('number');
    expect(typeof f.ctx).toBe('string');
  });
});

describe('OTA-1674 — ⚠⚠⚠ the record reads the dead life, not the reader', () => {
  it('bootSlice files the crumb\'s answer, and no longer the reading boot\'s', () => {
    // The line that used to be here — `afterOtaApply: launch.afterOtaApply,` —
    // is the whole defect: `launch` is THIS boot's facts, written onto the
    // record of the boot that died.
    expect(BOOT.includes('afterOtaApply: crumb.afterOta,')).toBe(true);
    expect(BOOT.includes('otaPath: crumb.otaPath,')).toBe(true);
    expect(BOOT.includes('prevCtx: crumb.prevCtx,')).toBe(true);
    expect(BOOT.includes('afterOtaApply: launch.afterOtaApply,')).toBe(false);
  });

  it('⚠ the reading boot\'s own facts still go to the launch LINE — that one is about this boot', () => {
    // Two different questions: "what is THIS boot" (the debug line, correct as
    // it was) and "what was the boot that DIED" (the record, now fixed).
    expect(BOOT.includes("get().appendLog('debug', launchLine(launch));")).toBe(true);
  });
});

describe('OTA-1674 — ⚠⚠ a record that is not fatal does not say KILLED', () => {
  afterEach(() => _setCrashLedgerForTests(null));

  it('⚠⚠⚠ an idle reclaim prints as reclaimed, and never as a kill', () => {
    _setCrashLedgerForTests([rec({ isFatal: false, stage: 'rendered' })]);
    const s = crashLedgerSummary();
    expect(s.includes('PROCESS RECLAIMED — not a crash')).toBe(true);
    expect(s.includes('PROCESS KILLED')).toBe(false);
  });

  it('a fatal death still prints as one', () => {
    _setCrashLedgerForTests([rec({ isFatal: true })]);
    expect(crashLedgerSummary().includes('PROCESS KILLED — no JS ran')).toBe(true);
  });

  it('⚠ a record with NO flag is fatal — a missing flag never downgrades a real crash', () => {
    // Every record written before `isFatal` existed was a real crash.
    _setCrashLedgerForTests([rec({})]);
    expect(crashLedgerSummary().includes('PROCESS KILLED — no JS ran')).toBe(true);
  });
});

describe('OTA-1674 — ⚠⚠ the header counts what is fatal', () => {
  afterEach(() => _setCrashLedgerForTests(null));

  it('"N recorded" names how many of those were fatal when they differ', () => {
    _setCrashLedgerForTests([rec({ id: 'a', isFatal: true }), rec({ id: 'b', isFatal: false })]);
    expect(crashLedgerSummary().includes('2 recorded, 1 fatal')).toBe(true);
  });

  it('and stays as it was when every record is fatal — no noise where there is no news', () => {
    _setCrashLedgerForTests([rec({ id: 'a' }), rec({ id: 'b', isFatal: true })]);
    const s = crashLedgerSummary();
    expect(s.includes('2 recorded (newest last)')).toBe(true);
    expect(s.includes('fatal (newest last)')).toBe(false);
  });
});

describe('OTA-1674 — ⚠⚠ the rollup counts fatal kills, and only a true "yes"', () => {
  afterEach(() => _setCrashLedgerForTests(null));

  it('⚠⚠⚠ a reclaim on an OTA boot is not the signal, and "unknown" is not "no"', () => {
    _setCrashLedgerForTests([
      rec({ id: '1', isFatal: true, launch: { afterOtaApply: true, prevCtx: 'o1/r0/l1/p1/dn0' } }),
      rec({ id: '2', isFatal: false, launch: { afterOtaApply: true } }),
      rec({ id: '3', isFatal: true, launch: { ageMs: 900 } }),
    ]);
    const s = crashLedgerSummary();
    expect(s.includes('1 of 2 process kills landed on an OTA-apply boot')).toBe(true);
    expect(s.includes('1 of 2 died before their launch resolved')).toBe(true);
  });

  it('nothing unresolved, nothing said about it', () => {
    _setCrashLedgerForTests([rec({ id: '1', isFatal: true, launch: { afterOtaApply: false } })]);
    expect(crashLedgerSummary().includes('died before their launch resolved')).toBe(false);
  });
});

describe('OTA-1674 — ⚠⚠⚠ the launch line has three answers, not two', () => {
  afterEach(() => _setCrashLedgerForTests(null));

  it('yes — and it names the path', () => {
    _setCrashLedgerForTests([rec({ launch: { afterOtaApply: true, otaGapMs: 184, otaPath: 'boot-front' } })]);
    const s = crashLedgerSummary();
    expect(s.includes('THIS BOOT FOLLOWED AN OTA APPLY')).toBe(true);
    expect(s.includes('via boot-front')).toBe(true);
  });

  it('no', () => {
    _setCrashLedgerForTests([rec({ launch: { afterOtaApply: false } })]);
    expect(crashLedgerSummary().includes('not an OTA-apply boot')).toBe(true);
  });

  it('⚠⚠⚠ not known — and it is NOT printed as "no", which is how the hole stayed hidden', () => {
    _setCrashLedgerForTests([rec({ launch: { ageMs: 900 } })]);
    const s = crashLedgerSummary();
    expect(s.includes('not known (died before its launch resolved)')).toBe(true);
    expect(s.includes('not an OTA-apply boot')).toBe(false);
  });
});

describe('OTA-1674 — ⚠⚠ Sentry finally receives the instrument', () => {
  it('the launch block is forwarded, field for field', () => {
    const ev = toSentryEvent(rec({
      launch: { afterOtaApply: true, ageMs: 900, otaPath: 'boot-front', otaGapMs: 184, prevCtx: 'o1/r0/l1/p1/dn0', ctx: 'o0/r0/l0/p0/dn0' },
    }));
    const extra = ev.extra as Record<string, unknown>;
    expect(extra.launchAfterOta).toBe(true);
    expect(extra.launchAgeMs).toBe(900);
    expect(extra.launchOtaPath).toBe('boot-front');
    expect(extra.launchOtaGapMs).toBe(184);
    expect(extra.launchPrevCtx).toBe('o1/r0/l1/p1/dn0');
    expect(extra.launchCtx).toBe('o0/r0/l0/p0/dn0');
  });

  it('⚠ and "not known" reaches the server as absent, never as false', () => {
    const extra = toSentryEvent(rec({ launch: { ageMs: 900 } })).extra as Record<string, unknown>;
    expect(extra.launchAfterOta).toBeUndefined();
  });

  it('the level is unchanged by the new fields', () => {
    expect(toSentryEvent(rec({ isFatal: false })).level).toBe('error');
    expect(toSentryEvent(rec({ isFatal: true })).level).toBe('fatal');
  });
});
