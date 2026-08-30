/**
 * OTA-1380 — crash reporting, staged: capture now, delivery when there is a DSN.
 *
 * Owner: *"add crash reporting."*
 *
 * ⚠⚠ READ THIS FIRST, BECAUSE I GOT IT WRONG OUT LOUD. In the weekly assessment
 * I told the owner this project had "no crash reporting." That was false, and it
 * was false because I asserted it without reading. The project already had a
 * global ErrorUtils handler writing `@tartaria/lastCrash`, a crash-save snapshot
 * of the exact save bytes, a ScreenErrorBoundary, the OTA-1276..1377 breadcrumb,
 * mlHealth, runtimePressure, and a one-tap bug report bundling all of it.
 *
 * The REAL gaps were two, and this suite exists to hold them shut:
 *   1. `lastCrash` is a SINGLE SLOT — crash twice and the first is gone.
 *   2. A native death (B9's OOM kill) ran no JS, so it produced no crash record
 *      at all. The breadcrumb was already the evidence; nothing promoted it.
 *
 * Anyone extending this should read that history before adding a parallel
 * system, which is the obvious mistake and the one I nearly made.
 */
// The ledger and the reporter both persist through AsyncStorage, which has no
// native module under jest. Same mock every storage-touching suite in this repo
// uses (see absoluteGridPosition.test.ts) — declared before the imports so the
// hoisted jest.mock beats the module graph.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  recordCrash, loadCrashLedger, clearCrashLedger, crashLedgerSummary,
  markCrashesSent, unsentCrashes, _setCrashLedgerForTests, settleCrashWrites,
  CRASH_LEDGER_CAP, CRASH_LEDGER_KEY, type CrashRecord,
} from '../app/diagnostics/crashLedger';
import {
  reportingConfigured, reportingEnabled, reportingOptedIn, reportingStatusLine, CRASH_REPORTING_PREF_KEY,
  setReportingEnabled, loadReportingPref, installCrashTransport, flushCrashReports,
  crashReportDsn, _resetCrashReporterForTests,
} from '../app/diagnostics/crashReporter';
// ⚠ OTA-1395 — reads the store AND its slices. Part 4 is splitting gameStore
// into slices, and the literals these pins look for travel with the code. A
// pin like this was never a claim about a FILE; it is a claim about the STORE.
// See __tests__/helpers/storeSource.ts for when NOT to use it.
import { storeSource } from '../test-utils/storeSource';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const app = src('App.tsx');
const store = storeSource();

// Appends are fire-and-forget and now SERIALISED; awaiting the queue is the
// honest way to observe them, rather than guessing at a tick count.
const flush = () => settleCrashWrites();

beforeEach(async () => {
  _resetCrashReporterForTests();
  await clearCrashLedger();
});

describe('OTA-1380 — the ledger keeps more than one', () => {
  it('⚠⚠ ten crashes are kept, not one — a crash LOOP is the interesting case', () => {
    // `@tartaria/lastCrash` overwrites. A device crashing on every boot would
    // report a single crash, and the FIRST one — before the app was already
    // sick — is exactly the one lost.
    expect(CRASH_LEDGER_CAP).toBe(10);
  });

  it('records and reads back, newest last', async () => {
    recordCrash({ kind: 'js-fatal', stage: 'boot', message: 'first', ts: 1000 });
    recordCrash({ kind: 'js-fatal', stage: 'play', message: 'second', ts: 2000 });
    await flush();
    const list = await loadCrashLedger();
    expect(list.map((r) => r.message)).toEqual(['first', 'second']);
    expect(list[0]!.build).toBeTruthy();   // stamped from buildInfo, not the caller
    expect(list[0]!.version).toBeTruthy();
  });

  it('⚠⚠ two crashes in the SAME TICK both survive', async () => {
    // The race this caught: both appends read the ledger, both appended to the
    // copy they read, and the second write clobbered the first — the original
    // single-slot bug, re-created inside the thing built to fix it. Writes are
    // serialised through a tail promise now.
    recordCrash({ kind: 'js-fatal', stage: 'a', message: 'one', ts: 100 });
    recordCrash({ kind: 'js-fatal', stage: 'b', message: 'two', ts: 200 });
    recordCrash({ kind: 'js-fatal', stage: 'c', message: 'three', ts: 300 });
    await settleCrashWrites();
    expect((await loadCrashLedger()).map((r) => r.message)).toEqual(['one', 'two', 'three']);
  });

  it('⚠ rolls at the cap rather than growing without bound', async () => {
    for (let i = 0; i < 25; i++) {
      recordCrash({ kind: 'js-fatal', stage: 's', message: `crash ${i}`, ts: 1000 + i });
      await flush();
    }
    const list = await loadCrashLedger();
    expect(list.length).toBe(CRASH_LEDGER_CAP);
    // the newest survive — a crash-looping device is the one least able to
    // afford the storage, and the recent stacks are the actionable ones
    expect(list[list.length - 1]!.message).toBe('crash 24');
  });

  it('⚠⚠ dedups on id, so one breadcrumb cannot become two crashes', async () => {
    // hydrate() can run twice in a session (a reload after a fatal re-enters
    // it). Promoting the same surviving crumb twice would invent a crash.
    recordCrash({ kind: 'native-death', stage: 'x', message: 'died', ts: 5000 });
    await flush();
    recordCrash({ kind: 'native-death', stage: 'x', message: 'died', ts: 5000 });
    await flush();
    expect((await loadCrashLedger()).length).toBe(1);
  });

  it('⚠ never throws, whatever it is handed', () => {
    // A crash recorder that can crash turns one defect into two, and the second
    // happens inside the handler for the first.
    expect(() => recordCrash({ kind: 'js-fatal', stage: '', message: undefined as unknown as string })).not.toThrow();
    expect(() => recordCrash({ kind: 'js-fatal', stage: 'x', message: 'y', stack: 'z'.repeat(99999) })).not.toThrow();
  });
});

describe('OTA-1380 — the native death finally becomes a crash', () => {
  it('⚠⚠ hydrate promotes a SURVIVING breadcrumb to a native-death record', () => {
    // This is the B9 case and the reason the whole OTA exists. The process was
    // killed by the OS, so no JS handler ran and nothing wrote lastCrash. The
    // crumb was already proof of death; it was only ever printed to the debug
    // log and then discarded.
    expect(store).toContain("kind: 'native-death',");
    // ⚠ RETARGETED BY OTA-1567, which added an IDLE branch beside this one so
    // an OS reclaim of a process with nothing in flight stops paging as a
    // fatal crash. The property pinned here is unchanged: a death that
    // happened WHILE SOMETHING WAS LIVE still says so, in the crumb's words.
    expect(store).toContain('`Process died with no orderly exit while: ${crumb.what}`');
    expect(store).toContain('breadcrumb: crumb,');
  });

  it('⚠⚠ …and it is recorded BEFORE the crumb is cleared', () => {
    // If the clear ran first, a failure in the clear path would cost the record
    // outright — the one crash class with no other evidence anywhere.
    const i = store.indexOf("kind: 'native-death',");
    const j = store.indexOf('await clearLiveBreadcrumb();', i);
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });

  it('⚠ the summary leads with the phase, because there is no stack to read', async () => {
    recordCrash({
      kind: 'native-death', stage: 'qwen-load', message: 'Process died with no orderly exit while: look around',
      ts: 7000,
      breadcrumb: { at: 7000, what: 'look around', room: 'R04', screen: 'exploration', phase: 'qwen-load', phaseAt: 7120 },
    });
    await flush();
    await loadCrashLedger();
    const out = crashLedgerSummary();
    expect(out).toContain('PROCESS KILLED — no JS ran');
    expect(out).toContain('doing: look around');
    expect(out).toContain('last checkpoint: qwen-load');
    expect(out).toContain('+120ms');
  });

  it('the four kinds stay distinct, so a recovered screen is never read as a death', async () => {
    for (const kind of ['js-fatal', 'js-boundary', 'hydrate-fail', 'native-death'] as const) {
      recordCrash({ kind, stage: 's', message: kind, ts: 100 + kind.length });
      await flush();
    }
    const kinds = (await loadCrashLedger()).map((r) => r.kind);
    expect(new Set(kinds).size).toBe(4);
  });
});

describe('OTA-1380 — both JS capture points write the ledger', () => {
  it('⚠ the global fatal handler does, alongside the existing writes', () => {
    expect(app).toContain("kind: 'js-fatal',");
    // and it did NOT replace what was already there — lastCrash still feeds the
    // title-screen pill, crashSave still captures the save bytes for repro
    expect(app).toContain("'@tartaria/lastCrash'");
    expect(app).toContain('captureActiveCrashSave(`fatal:${stage}`)');
  });

  it('⚠ the render boundary does too — the crash nobody reports', () => {
    // The recovery card makes a boundary catch look handled, so players do not
    // file it. Distinct kind so it is never mistaken for a process death.
    expect(app).toContain("kind: 'js-boundary',");
    expect(app).toContain("captureActiveCrashSave('screen-render'");
  });

  it('⚠ each write is in its OWN try, so one failure cannot cost the others', () => {
    const start = app.indexOf('errorUtils.setGlobalHandler');
    const end = app.indexOf("cl.recordCrash({", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = app.slice(start, end);
    // Each of the three captures opens its own `try {` — lastCrash, crashSave,
    // and the ledger. Chained in one block, a throw in the first (AsyncStorage
    // not ready at boot is the realistic case) would silently cost the others.
    expect(body.match(/\btry \{/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('OTA-1380 — delivery is inert, and needs BOTH switches', () => {
  it('⚠⚠ this build ships with no transport and no DSN — nothing can be sent', () => {
    expect(crashReportDsn()).toBeNull();
    expect(reportingConfigured()).toBe(false);
    expect(reportingEnabled()).toBe(false);
  });

  it('⚠⚠ opting in does NOT enable delivery when the build cannot deliver', async () => {
    // The player's answer is remembered either way — a build with no DSN must
    // not silently erase a preference set on a build that had one — but the
    // preference alone can never transmit.
    await setReportingEnabled(true);
    expect(reportingOptedIn()).toBe(true);
    expect(reportingEnabled()).toBe(false);
    expect(await flushCrashReports()).toBe(0);
  });

  it('⚠⚠ and a configured build does NOT deliver until the player opts in', async () => {
    // Was: "Owner's explicit ruling: opt-in, default off." OTA-1487 flipped the
    // DEFAULT (opt-out now) — but an explicit OFF is still absolute, which is
    // exactly what this test proves: a stored 'false' blocks every send.
    const sent: CrashRecord[] = [];
    installCrashTransport({ name: 'test', send: async (r) => { sent.push(r); } });
    recordCrash({ kind: 'js-fatal', stage: 's', message: 'boom', ts: 42 });
    await flush();
    await loadCrashLedger();
    await setReportingEnabled(false);
    expect(await flushCrashReports()).toBe(0);
    expect(sent).toEqual([]);
  });

  it('⚠ default is ON on a fresh install — OTA-1487, the owner\'s opt-out ruling', async () => {
    // (The test above stored an explicit 'false'; a fresh install has no key.)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ASM = require('@react-native-async-storage/async-storage');
    await (ASM.default ?? ASM).removeItem(CRASH_REPORTING_PREF_KEY);
    _resetCrashReporterForTests();
    expect(await loadReportingPref()).toBe(true);
    expect(reportingOptedIn()).toBe(true);
    // ⚠ And before the pref is READ, nothing is on — the in-memory seed stays
    // false so an explicit opt-out can never lose a race with a boot flush.
    _resetCrashReporterForTests();
    expect(reportingOptedIn()).toBe(false);
  });

  it('⚠ the status line names WHICH switch is holding it', () => {
    // A toggle reading "on" while a missing DSN silently blocks delivery is how
    // a player concludes their reports are arriving when none are.
    expect(reportingStatusLine()).toContain('not built into this version');
    expect(reportingStatusLine()).toContain('capture still works');
  });

  it('a delivered record is marked sent and is not re-sent', async () => {
    _setCrashLedgerForTests([
      { id: 'a', ts: 1, kind: 'js-fatal', stage: 's', message: 'm', build: 'b', version: 'v' },
    ]);
    expect(unsentCrashes().length).toBe(1);
    await markCrashesSent(['a']);
    expect(unsentCrashes().length).toBe(0);
  });
});

describe('OTA-1380 — it reaches the places a human actually looks', () => {
  it('the About/device summary carries the ledger AND the delivery status', () => {
    const about = src('app', 'diagnostics', 'aboutSummary.ts');
    expect(about).toContain('crashLedgerSummary(),');
    expect(about).toContain('reportingStatusLine(),');
    // inside buildBasicDeviceSummary, which is what the bug report and the log
    // export both stamp — so one paste carries it with no extra button
    const fn = about.indexOf('export function buildBasicDeviceSummary');
    expect(about.indexOf('crashLedgerSummary(),')).toBeGreaterThan(fn);
  });

  it('⚠ the About toggle is DISABLED while the build cannot deliver', () => {
    const about = src('app', 'screens', 'AboutScreen.tsx');
    expect(about).toContain('AUTOMATIC CRASH REPORTS');
    expect(about).toContain('disabled={!crashConfigured}');
    expect(about).toContain('accessibilityState={{ checked: crashOptIn, disabled: !crashConfigured }}');
  });

  it('⚠⚠ the privacy policy and the CODE agree about whether a service exists', () => {
    // ⚠⚠ OTA-1401 — REWRITTEN, BECAUSE THE ANSWER CHANGED AND THE TEST SHOULD NOT
    // HAVE TO. This read "does not promise a service", pinning the exact wording
    // of a build that had none — true for OTA-1380 and false the moment one was
    // added. What it was actually protecting is that the policy never DISAGREES
    // with the code about whether crash reports can leave the device, and that
    // claim holds in both directions. So it is now derived from the code rather
    // than from a remembered state: whichever way the repo goes, the document
    // has to follow, and a change that flips one without the other goes red.
    const priv = src('docs', 'PRIVACY.md');
    const cfg = src('app.config.js');
    const hasDestination = /crashReportDsn:\s*\w/.test(cfg);
    const dep = JSON.parse(src('package.json')) as { dependencies?: Record<string, string> };
    const hasSdk = !!dep.dependencies?.['@sentry/react-native'];

    if (hasDestination && hasSdk) {
      // A service exists: the policy must NAME it, and must not still be denying it.
      expect(priv).toContain('Sentry');
      expect(priv).not.toContain('no crash\nreporting service is built into the app');
      expect(priv).not.toContain('crash-reporting service that uploads data');
    } else {
      // No service: the policy must say so and must not name one.
      expect(priv).toContain('no crash\nreporting service is built into the app');
      expect(priv).not.toContain('Sentry');
    }

    // TRUE IN BOTH STATES, and the part that actually protects the player: the
    // records are captured locally and the SWITCH is the only door out.
    // ⚠ OTA-1487 — the default flipped to ON (owner's opt-out ruling), so the
    // protective claims are now "only while the switch is on" and the default
    // is stated as on. The permanence of an explicit OFF is pinned in ota1401.
    expect(priv).toMatch(/leave your device only while/);
    expect(priv).toMatch(/on by\s+default/);
  });

  it('⚠ the boot path loads the ledger, so the SYNC summaries have data', () => {
    // crashLedgerSummary and reportingStatusLine are sync (their callers cannot
    // grow a loading state), so the read must already have happened.
    expect(app).toContain('await cl.loadCrashLedger();');
    expect(app).toContain('await cr.loadReportingPref();');
    expect(app).toContain('await cr.flushCrashReports();');
  });
});

describe('OTA-1380 — what was already here and was NOT replaced', () => {
  it('the pre-existing capture all still stands', () => {
    // Named explicitly because the temptation when adding a "crash reporter" is
    // to build a parallel system and leave two half-truths on disk.
    for (const f of ['lastCrash.ts', 'crashSave.ts', 'mlHealth.ts', 'runtimePressure.ts', 'bugReport.ts']) {
      expect(() => src('app', 'diagnostics', f)).not.toThrow();
    }
    expect(src('app', 'diagnostics', 'aboutSummary.ts')).toContain('lastCrashSummary(),');
    expect(CRASH_LEDGER_KEY).toBe('@tartaria/crashLedger'); // a NEW key, not a hijacked one
  });
});
