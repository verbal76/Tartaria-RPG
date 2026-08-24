/**
 * OTA-1401 — CRASH REPORTS HAVE SOMEWHERE TO GO.
 *
 * The second half of "staged". OTA-1380 built the ledger, the opt-in switch and
 * the transport seam, and shipped with the seam empty: `reportingConfigured()`
 * was false because there was no DSN and no transport, and About said so. This
 * OTA fills both halves.
 *
 * ⚠⚠ THE RISK IN THIS CHANGE IS NOT SENTRY. IT IS THE IMPORT.
 *
 * `@sentry/react-native` is a NATIVE module — it exists in a build only after an
 * APK/AAB or IPA is compiled with it. This OTA reaches devices running APK build
 * 293, compiled before it existed. A bundle that does
 * `import * as Sentry from '@sentry/react-native'` at module scope fails to load
 * on every one of them.
 *
 * ⚠ AND THE FAILURE IS INVISIBLE FROM OUTSIDE. expo-updates abandons an update
 * whose JS throws during startup and silently reverts to the last working
 * bundle. From the player's side that is indistinguishable from "the update
 * never downloaded" — the exact symptom OTA-1174 spent an OTA chasing. A bare
 * import here would have killed OTA delivery for every existing install and the
 * log would have said nothing.
 *
 * ⚠ SO THE FIRST FOUR TESTS BELOW ARE ABOUT THAT, NOT ABOUT CRASHES. They are
 * the ones worth keeping if the rest are ever thrown away.
 *
 * ⚠⚠ AND THE POLICY PROMISE IS PART OF THE CHANGE, not paperwork after it.
 * docs/PRIVACY.md said, in writing: *"If a future version adds one, this policy
 * will be updated to name the service and say exactly what it receives, before
 * the switch can do anything."* That promise is testable, so it is tested.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

const transport = src('app', 'diagnostics', 'sentryTransport.ts');
const appTsx = src('App.tsx');
const config = src('app.config.js');
const privacy = src('docs', 'PRIVACY.md');
const reporter = src('app', 'diagnostics', 'crashReporter.ts');
const pkg = JSON.parse(src('package.json')) as { dependencies?: Record<string, string> };

describe('OTA-1401 — the OTA cannot brick delivery on builds without the native module', () => {
  it('⚠⚠ NOTHING imports @sentry/react-native at module scope, anywhere', () => {
    // The single assertion this whole OTA rests on. A static import is resolved
    // by Metro at bundle time and evaluated at load time; on APK 293 that throws,
    // expo-updates reverts, and OTA delivery is dead for every existing install.
    for (const [name, body] of [['sentryTransport.ts', transport], ['App.tsx', appTsx]] as const) {
      expect(body).not.toMatch(/^\s*import\s[^\n]*['"]@sentry\/react-native['"]/m);
      expect(name).toBeTruthy();
    }
  });

  it('⚠⚠ the SDK is reached by a guarded, lazy require', () => {
    expect(transport).toMatch(/require\('@sentry\/react-native'\)/);
    const i = transport.indexOf("require('@sentry/react-native')");
    // Inside a try block, and inside a function body (indented) — not top level.
    const before = transport.slice(0, i);
    expect(before.lastIndexOf('try {')).toBeGreaterThan(before.lastIndexOf('\n}'));
    expect(/^\s+/.test(transport.slice(transport.lastIndexOf('\n', i) + 1))).toBe(true);
  });

  it('⚠⚠ a present-but-broken module is refused, not trusted', () => {
    // `require` succeeding does not mean the native side linked. Both functions
    // this file actually calls are checked before the module is accepted.
    expect(transport).toContain("typeof mod.init === 'function'");
    expect(transport).toContain("typeof mod.captureEvent === 'function'");
  });

  it('⚠ the installer never throws, on any build', () => {
    // A diagnostic that throws on the way up is worse than no diagnostic — and
    // this one runs inside the boot effect.
    const i = transport.indexOf('export function installSentryIfAvailable()');
    expect(i).toBeGreaterThan(-1);
    const body = transport.slice(i);
    expect(body).toContain('try {');
    expect(body).toContain('} catch {');
    expect(body).toContain('return false;');
  });

  it('⚠ App.tsx calls it through a lazy require too, inside the existing boot try', () => {
    expect(appTsx).toContain("require('./app/diagnostics/sentryTransport')");
    expect(appTsx).toContain('st.installSentryIfAvailable();');
    expect(appTsx).toContain('LAZY require, AND THAT IS LOAD-BEARING, NOT STYLE');
  });
});

// ⚠ OTA-1487 flipped the switch's DEFAULT (opt-out now); everything pinned
// here is about the MECHANISM and survived the flip untouched: the switch —
// whatever its default — is the only thing that sends.
describe('OTA-1401 — the switch is still the only thing that sends', () => {
  it('⚠⚠ Sentry auto-capture is OFF, so nothing bypasses the player', () => {
    // Left on, the SDK would post a crash the instant it happened — before the
    // switch is even consulted — which would make the About screen's promise and
    // the privacy policy false at the same time.
    expect(transport).toContain('enableAutoSessionTracking: false');
    expect(transport).toContain('enableCaptureFailedRequests: false');
    expect(transport).toContain('maxBreadcrumbs: 0');
  });

  it('⚠⚠ delivery still runs only through flushCrashReports, which requires the switch on', () => {
    // Untouched by this OTA, and asserted here because this is the OTA that made
    // it matter: before today the gate had nothing behind it.
    expect(reporter).toContain('if (!reportingEnabled()) return 0;');
    expect(reporter).toContain('return reportingConfigured() && optedIn;');
  });

  it('⚠ installing a transport does NOT opt anybody in', () => {
    const i = transport.indexOf('export function installSentryIfAvailable()');
    const body = transport.slice(i);
    expect(body).not.toContain('setReportingEnabled');
    expect(body).toContain('installCrashTransport({');
  });

  it('⚠ the About line can now say something new, and still names the blocking switch', () => {
    // With both halves present, `reportingStatusLine()` stops saying "not built
    // into this version" and starts distinguishing ON from OFF.
    expect(reporter).toContain("Crash delivery: ON — reports go to ${transport.name}");
    expect(reporter).toContain('Crash delivery: OFF — captured on this device only.');
  });
});

describe('OTA-1401 — the destination is configured, once, for all four products', () => {
  it('⚠⚠ the DSN is written into extra, which is what the reader has always read', () => {
    expect(config).toContain('crashReportDsn: CRASH_REPORT_DSN');
    expect(config).toMatch(/const CRASH_REPORT_DSN\s*=/);
    expect(reporter).toContain('extra.crashReportDsn');
  });

  it('⚠⚠ the comment that CLAIMED this wiring existed is corrected, not deleted', () => {
    // It said "`crashReportDsn` already uses this path, so the pattern is proven
    // in-tree" — and nothing wrote the key. The reader's `?? null` made the gap
    // invisible: About reported "not built into this version" and everyone
    // agreed. A comment citing a wiring that does not exist is worse than none,
    // because it is what stops the next person checking.
    expect(config).toContain('OTA-1401 — CORRECTION');
    // ⚠ The stale sentence still appears ONCE — inside the correction, quoted, so
    // a reader can see what was wrong. Asserting its plain absence would have
    // forbidden quoting it, which is the trap this repo has hit before: a rule
    // that makes it impossible to explain the thing being ruled on. So: it must
    // survive only as a quotation, and the words `used to end` must precede it.
    const stale = 'already uses this path, so the pattern is proven';
    expect((config.match(new RegExp(stale, 'g')) ?? []).length).toBe(1);
    expect(config.slice(0, config.indexOf(stale))).toMatch(/used to end[^]{0,40}$/);
  });

  it('⚠ one project, four lines, separated by a tag rather than four projects', () => {
    expect(transport).toContain("line: productLine()");
    expect(transport).toContain('environment: productLine()');
    expect(transport).toContain('extra.tartariaLine');
  });

  it('⚠ …and the DSN sits in plain source on purpose, with the reason written down', () => {
    // A DSN is a write-only address, not a credential: it authorises sending an
    // event and nothing else, and every client that ships Sentry embeds one.
    expect(config).toContain('A Sentry DSN is not a credential');
    expect(config).toContain('write-only address');
  });

  it('⚠ the dependency is pinned, and the lockfile carries it', () => {
    expect(pkg.dependencies?.['@sentry/react-native']).toBe('6.10.0');
    // OTA-1384's lesson: a package.json the lockfile does not match breaks
    // `npm ci`, which on a trunk breaks all four products at once.
    expect(src('package-lock.json')).toContain('@sentry/react-native');
  });
});

describe('OTA-1401 — what a report actually contains', () => {
  it('⚠⚠ grouped by KIND and STAGE, never by message', () => {
    // A native death's message is reconstructed from a breadcrumb and varies
    // with whatever the player was doing. Grouping on it files one issue per
    // session, which is the same as filing none.
    expect(transport).toContain('fingerprint: [rec.kind, rec.stage]');
  });

  it('⚠⚠ the breadcrumb is carried, because for a native death it IS the report', () => {
    // The OS killed the process; there is no stack. What the app was doing is
    // the only evidence, which is the entire point of OTA-1380's breadcrumb.
    for (const field of ['lastAction', 'lastRoom', 'lastScreen', 'lastPhase', 'lastPhaseDetail']) {
      expect(transport).toContain(field);
    }
  });

  it('⚠ the stack is sent as TEXT, and the reason is not laziness', () => {
    // A hand-rolled frame parser that is subtly wrong produces a grouping that
    // looks authoritative and is not — and some record kinds have no JS stack at
    // all. A correct string beats a confident lie.
    expect(transport).toMatch(/A correct string beats a\s*\*?\s*confident lie/);
    expect(transport).toContain("stack: rec.stack ?? '(none — the process died without one)'");
  });

  it('⚠ nothing from a save, a character, or anything the player typed', () => {
    const i = transport.indexOf('export function toSentryEvent');
    const body = transport.slice(i, transport.indexOf('\n}', i));
    for (const f of ['inventory', 'gameLog', 'player.name', 'worldMemory']) {
      expect(body).not.toContain(f);
    }
  });
});

describe('OTA-1401 — the privacy policy promise, kept', () => {
  it('⚠⚠ the policy NAMES the service, as it promised in writing it would', () => {
    // The old text: "If a future version adds one, this policy will be updated
    // to name the service and say exactly what it receives, before the switch
    // can do anything." This is that update, in the same change.
    expect(privacy).toContain('Sentry');
    expect(privacy).toContain('ingest.us.sentry.io');
    expect(privacy).toContain('This is that update.');
  });

  it('⚠⚠ …and the stale claims are GONE, not left standing beside the new ones', () => {
    // A policy that says both "no crash-reporting service that uploads data" and
    // "the service is Sentry" is worse than either sentence alone.
    expect(privacy).not.toContain('crash-reporting service that uploads data');
    expect(privacy).not.toContain('in this version it is not available at all');
    expect(privacy).not.toContain('### Crash records (on-device only)');
  });

  it('⚠ it says ON BY DEFAULT — and pairs every mention with the way off', () => {
    // ⚠ OTA-1487 — the owner flipped the policy to opt-out, and the policy
    // document flipped in the same commit (a policy saying "off until you turn
    // it on" over an opt-out build is a lie). The claims that must hold now:
    // the default is stated more than once, the off-switch is stated with it,
    // and an explicit OFF is promised to be permanent.
    expect((privacy.match(/on by\s+default|starts on|start ON/gi) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(privacy).toMatch(/switch(ed)? (it )?off|turns? (it|them) off/i);
    expect(privacy).toMatch(/an explicit OFF is\s+permanent/);
    // And the stale opt-in claims are GONE, not left standing beside the new ones.
    expect(privacy).not.toContain('off until you turn');
    expect(privacy).not.toMatch(/It is \*\*off by\s+default\*\*/);
  });

  it('⚠ it lists what is sent AND what is never sent', () => {
    expect(privacy).toContain('Exactly what a report contains');
    expect(privacy).toContain('What a report never contains');
    expect(privacy).toContain('your save files');
  });

  it('⚠ the outbound-traffic list grew the fourth entry it now needs', () => {
    // That list ends "No other outbound network traffic originates from the
    // app." — a sentence that becomes false the moment a report is posted.
    expect(privacy).toContain('4. **Crash reports — unless you switch them off.**');
    expect(privacy).toContain('No other outbound network traffic originates from the app.');
  });
});
