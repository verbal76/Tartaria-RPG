/**
 * OTA-1682 — THE BUFFER WAS THIRTY DEEP (task #199, and the loss it uncovered).
 *
 * ⚠⚠⚠ THE MEASURED DEFECT. The owner's first whole log under OTA-1679 went out
 * as bundle #mtnrscwz8 in 42 parts. Parts 1–29 reached Sentry. Parts 30–42 —
 * the log's last hour and a quarter — never did, after three re-pulls, and the
 * device had said DELIVERED 42/42.
 *
 * One beacon plus twenty-nine parts is THIRTY envelopes. `@sentry/react-native`
 * 6.10 sets `maxQueueSize` to 30 by default, and that number is BOTH the JS
 * promise buffer in front of the native bridge AND the native SDK's own send
 * queue (RNSentryModuleImpl forwards it to `setMaxQueueSize`). The inline loop
 * captures every part in one synchronous pass, so the bridge has answered for
 * none of them when the thirty-first arrives; the buffer refuses it with
 * `SentryError('Not adding Promise because buffer limit was reached.')`, and
 * `captureEvent` does not throw — the refusal is only visible to a client hook
 * (`afterSendEvent` fires with the error as the "response"). `report.sent`
 * counted 42, flush drained the thirty that were in the buffer and said yes,
 * and `delivered` was a lie told by arithmetic that never saw the door.
 *
 * Three things change, each pinned below:
 *   1. The queue is sized for the job (`maxQueueSize: SEND_QUEUE_SIZE`), and the
 *      transport's refusals are COUNTED through the hook and folded into
 *      `delivered`. A refused part is a NOT DELIVERED send, kept for the retry.
 *   2. A delivered bundle is CLEARED from disk — at the button, at the boot
 *      retry and on the crash auto-push. The re-sends the owner watched land
 *      three times (#mtn91pdwbmaq ×3, #mtnaj1w6w78b ×2, the 01:50:49 report at
 *      02:23 and 02:27) were the OTA-1504 design — "duplicates are the design"
 *      — written when flush() lied on the attachment path. With refusals
 *      counted, `delivered` is receipt enough, and the retry goes back to being
 *      what it was for: the bundle that did NOT go.
 *   3. A general report carries the last-played character's log. The log is
 *      per-slot (`tartaria.gamelog.<slot>.v2`), so "no character selected" was
 *      arriving with nothing under CHARACTER LOG — twice on 09-05 with the
 *      owner's own word "Log" as the whole description. The modal already
 *      resolves whose log a full push would carry; a general report now rides
 *      the same answer and says whose it is.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { crashReportDsn: 'https://test@sentry.invalid/1', tartariaLine: 'golem' } } },
}));
// bugReport → aboutSummary → gameStore drags the native ML modules in; mocked
// the way every store-touching suite mocks them.
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

type Hook = (event: Record<string, unknown>, resp: unknown) => void;
const hooks: Hook[] = [];
/** Parts above this number are refused by the fake transport — the thirty-deep
 *  buffer, minus the beacon that always goes first. */
let refuseAbovePart = Infinity;
let clientAvailable = true;
const mockSentry: {
  init: jest.Mock; captureEvent: jest.Mock; flush?: jest.Mock; getClient?: () => unknown;
} = {
  init: jest.fn(),
  captureEvent: jest.fn((event: Record<string, unknown>) => {
    const tags = (event.tags ?? {}) as Record<string, string>;
    const part = Number(tags.part ?? 0);
    const resp: unknown = tags.kind === 'player-log-inline' && part > refuseAbovePart
      ? new Error('Not adding Promise because buffer limit was reached.')
      : {};
    for (const h of hooks) h(event, resp);
  }),
  getClient: () => (clientAvailable ? {
    on: (_hook: string, cb: Hook) => {
      hooks.push(cb);
      return () => { const i = hooks.indexOf(cb); if (i > -1) hooks.splice(i, 1); };
    },
  } : undefined),
};
jest.mock('@sentry/react-native', () => mockSentry, { virtual: true });

const mockDisk = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///doc/',
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockDisk.has(uri), uri })),
  readAsStringAsync: jest.fn(async (uri: string) => {
    if (!mockDisk.has(uri)) throw new Error('ENOENT');
    return mockDisk.get(uri)!;
  }),
  writeAsStringAsync: jest.fn(async (uri: string, data: string) => { mockDisk.set(uri, data); }),
  deleteAsync: jest.fn(async (uri: string) => { mockDisk.delete(uri); }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  sendGameLogInline, describeInlineSend, packLogIntoParts, SEND_QUEUE_SIZE,
  installSentryIfAvailable, _resetSentryTransportForTests,
} from '../app/diagnostics/sentryTransport';
import {
  readPendingBundle, retryPendingBundleAtBoot,
  MAX_SEND_ATTEMPTS, MIN_RETRY_GAP_MS, PENDING_BUNDLE_FILE,
} from '../app/diagnostics/pendingBundle';
import {
  installCrashTransport, loadReportingPref, CRASH_REPORTING_PREF_KEY, _resetCrashReporterForTests,
} from '../app/diagnostics/crashReporter';
import { composeAndSendBugReport } from '../app/diagnostics/bugReport';

const ROOT = join(__dirname, '..');
const TRANSPORT = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
const PENDING = readFileSync(join(ROOT, 'app', 'diagnostics', 'pendingBundle.ts'), 'utf8');
const AUTO = readFileSync(join(ROOT, 'app', 'diagnostics', 'autoBundle.ts'), 'utf8');
const BUTTON = readFileSync(join(ROOT, 'app', 'diagnostics', 'bugReport.ts'), 'utf8');
const MODAL = readFileSync(join(ROOT, 'app', 'components', 'BugReportModal.tsx'), 'utf8');
const TITLE = readFileSync(join(ROOT, 'app', 'screens', 'TitleScreen.tsx'), 'utf8');
const SAVE = readFileSync(join(ROOT, 'app', 'engine', 'saveSystem.ts'), 'utf8');

const URI = 'file:///doc/' + PENDING_BUNDLE_FILE;

/** A log long enough to pack into well over thirty parts — the owner's was 42. */
function longLog(chars: number): string {
  const lines: string[] = [];
  let n = 0;
  while (lines.join('\n').length < chars) {
    lines.push(`[2026-09-05T01:${String(n % 60).padStart(2, '0')}:00.000Z] [world] line ${n} of the silt road, tide ${n * 7 % 13}`);
    n += 1;
  }
  return lines.join('\n');
}

async function armed() {
  await AsyncStorage.clear();
  _resetCrashReporterForTests();
  _resetSentryTransportForTests();
  mockSentry.captureEvent.mockClear();
  mockSentry.flush = jest.fn(async () => true);
  hooks.length = 0;
  refuseAbovePart = Infinity;
  clientAvailable = true;
  installCrashTransport({ name: 'test', send: async () => {} });
  await loadReportingPref(); // opt-out default → ON
}

beforeEach(() => { mockDisk.clear(); });
afterEach(() => { _resetCrashReporterForTests(); _resetSentryTransportForTests(); delete mockSentry.flush; });

describe('OTA-1682 — ⚠⚠⚠ the transport\'s refusals are counted, and they fail the send', () => {
  const LOG = longLog(320_000);

  it('the owner\'s log packs past the thirty-deep buffer (beacon + 29 parts = 30)', () => {
    const total = packLogIntoParts(LOG).length;
    expect(total).toBeGreaterThan(29);
  });

  it('⚠⚠⚠ #mtnrscwz8 REPLAYED: parts 30+ refused → NOT DELIVERED, and the line names them', async () => {
    await armed();
    refuseAbovePart = 29;
    const r = await sendGameLogInline(LOG, 'mtnrscwz8');
    const total = packLogIntoParts(LOG).length;
    // Every part was ACCEPTED by captureEvent — that is what the old verdict read.
    expect(r.sent).toBe(total);
    expect(r.flushSaid).toBe('yes');
    // …and the transport refused the tail. That is the truth the verdict reads now.
    expect(r.transportWatched).toBe(true);
    expect(r.transportRefused).toBe(total - 29);
    expect(r.delivered).toBe(false);
    const line = describeInlineSend(r);
    expect(line).toContain('NOT DELIVERED');
    expect(line).toContain(`transport REFUSED ${total - 29}`);
    expect(line).toContain('30');
  });

  it('⚠⚠ a send the transport takes whole is DELIVERED, and says the transport took it', async () => {
    await armed();
    const r = await sendGameLogInline(LOG, 'whole');
    expect(r.transportWatched).toBe(true);
    expect(r.transportRefused).toBe(0);
    expect(r.delivered).toBe(true);
    expect(describeInlineSend(r)).toContain('transport took every part');
  });

  it('⚠ an SDK with no client hook is not called a failure — the count is unobserved and the line says so', async () => {
    await armed();
    clientAvailable = false;
    const r = await sendGameLogInline('short log', 'nohook');
    expect(r.transportWatched).toBe(false);
    expect(r.transportRefused).toBe(0);
    expect(r.delivered).toBe(true);
    expect(describeInlineSend(r)).toContain('transport unobserved');
  });

  it('⚠ the hook is taken down after the send — a second send does not double-count', async () => {
    await armed();
    await sendGameLogInline('one', 'a');
    expect(hooks).toHaveLength(0);
    refuseAbovePart = 0;
    const r = await sendGameLogInline('two', 'b');
    expect(r.transportRefused).toBe(1);
    expect(hooks).toHaveLength(0);
  });

  it('⚠⚠ the verdict carries the refusal count, next to the two facts OTA-1519 pinned', () => {
    const fn = TRANSPORT.slice(TRANSPORT.indexOf('export async function sendGameLogInline'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('report.delivered = report.sent === report.parts');
    expect(body).toContain("&& report.flushSaid !== 'no'");
    expect(body).toContain('&& report.transportRefused === 0');
    // Only OUR parts of THIS bundle are counted — the beacon and stray crash
    // records sharing the queue are not this send's refusals.
    expect(body).toContain("tags.bundleId !== bundleId || tags.kind !== 'player-log-inline'");
  });
});

describe('OTA-1682 — ⚠⚠⚠ the queue is sized for the job', () => {
  it('init hands the SDK a queue deeper than any log the app sends, and both layers read it', () => {
    // 30 was the default on both sides of the bridge; the owner's log was 43
    // envelopes. 200 covers the 800KB ring (≈85 parts) twice over.
    expect(SEND_QUEUE_SIZE).toBeGreaterThanOrEqual(200);
    const init = TRANSPORT.slice(TRANSPORT.indexOf('export function installSentryIfAvailable'));
    expect(init.slice(0, init.indexOf('\n}'))).toContain('maxQueueSize: SEND_QUEUE_SIZE,');
    installSentryIfAvailable();
    const [opts] = mockSentry.init.mock.calls[mockSentry.init.mock.calls.length - 1] as [Record<string, unknown>];
    expect(opts.maxQueueSize).toBe(SEND_QUEUE_SIZE);
  });
});

describe('OTA-1682 — ⚠⚠ a delivered bundle is cleared, a refused one is kept', () => {
  const BUNDLE = { log: 'L', inventory: 'I', save: '{}', device: 'D' };
  const plant = (attempts: number) => {
    mockDisk.set(URI, JSON.stringify({
      id: 'zz99', createdAt: 5, attempts, lastAttemptAt: Date.now() - MIN_RETRY_GAP_MS - 1000, bundle: BUNDLE,
    }));
  };

  it('⚠⚠⚠ the boot retry CLEARS a delivered bundle — it no longer lands three times', async () => {
    await armed();
    plant(1);
    const line = await retryPendingBundleAtBoot();
    expect(line).toContain(`attempt 2/${MAX_SEND_ATTEMPTS} delivered to Sentry`);
    expect(line).toContain('cleared');
    expect(await readPendingBundle()).toBeNull();
  });

  it('⚠⚠ a retry the transport refuses is KEPT for the next boot', async () => {
    await armed();
    plant(1);
    refuseAbovePart = 0;
    const line = await retryPendingBundleAtBoot();
    expect(line).toContain('NOT DELIVERED');
    expect(line).toContain('kept for next boot');
    expect((await readPendingBundle())!.attempts).toBe(2);
  });

  it('⚠⚠ the button clears its own bundle when the send is delivered', async () => {
    await armed();
    const out = await composeAndSendBugReport({ slot: null, description: 'the gate stuck' });
    expect(out.status).toBe('sent');
    expect(mockDisk.has(URI)).toBe(false);
  });

  it('⚠ and keeps it when the transport refused a part', async () => {
    await armed();
    refuseAbovePart = 0;
    const out = await composeAndSendBugReport({ slot: null, description: 'the gate stuck' });
    expect(out.status).toBe('queued');
    expect(mockDisk.has(URI)).toBe(true);
  });

  it('⚠ the crash auto-push clears on delivery too — all three senders, one rule', () => {
    expect(AUTO).toContain('if (ok) await clearPendingBundle();');
    expect(PENDING).toContain('if (ok) {');
    expect(BUTTON).toContain('if (ok) await clearPendingBundle();');
  });
});

describe('OTA-1682 — ⚠⚠ a general report carries the last-played character\'s log', () => {
  const slot = {
    slotId: 'slot_last_played', playerName: 'Wayfarer', raceId: 'mud_golem',
    locationId: 'ashen_reach', hp: 10, hpMax: 10, dead: false, savedAt: 1,
  };

  it('the log is per slot — there is no global ring to fall back on', () => {
    expect(SAVE).toContain('const slotLogKey = (slotId: string) => `tartaria.gamelog.${slotId}.v2`;');
  });

  it('⚠⚠⚠ "Log" from the title screen arrives WITH the log, and names whose it is', async () => {
    await armed();
    await AsyncStorage.setItem('tartaria.gamelog.slot_last_played.v2', '[2026-09-05T02:27:00.000Z] [world] the silt road\n');
    const out = await composeAndSendBugReport({ slot: null, logSlot: slot as never, description: 'Log' });
    expect(out.status).toBe('sent');
    const inlineParts = mockSentry.captureEvent.mock.calls
      .map((c) => (c[0] as { tags?: Record<string, string> }).tags?.kind)
      .filter((k) => k === 'player-log-inline');
    expect(inlineParts.length).toBeGreaterThan(0);
  });

  it('⚠⚠ the report text says the log is borrowed, and still says no character was selected', async () => {
    await armed();
    await AsyncStorage.setItem('tartaria.gamelog.slot_last_played.v2', '[2026-09-05T02:27:00.000Z] [world] the silt road\n');
    // Read the report as the durable file saw it — the persisted bundle IS the report.
    let captured: string | null = null;
    const FS = require('expo-file-system') as { writeAsStringAsync: jest.Mock };
    FS.writeAsStringAsync.mockImplementationOnce(async (uri: string, data: string) => {
      captured = (JSON.parse(data) as { bundle: { log: string } }).bundle.log;
      mockDisk.set(uri, data);
    });
    await composeAndSendBugReport({ slot: null, logSlot: slot as never, description: 'Log' });
    expect(captured).not.toBeNull();
    const text = captured as unknown as string;
    expect(text).toContain('Character: (general / no character)');
    expect(text).toContain("Log from: Wayfarer (the character last played — not selected)");
    expect(text).toContain('the silt road');
    expect(text).not.toContain('no log attached');
  });

  it('⚠ with no character on the device at all, the report still says so honestly', async () => {
    await armed();
    let captured: string | null = null;
    const FS = require('expo-file-system') as { writeAsStringAsync: jest.Mock };
    FS.writeAsStringAsync.mockImplementationOnce(async (uri: string, data: string) => {
      captured = (JSON.parse(data) as { bundle: { log: string } }).bundle.log;
      mockDisk.set(uri, data);
    });
    await composeAndSendBugReport({ slot: null, logSlot: null, description: 'will not start' });
    expect(captured as unknown as string).toContain('(no character on this device — no log to attach)');
  });

  it('⚠⚠ the modal hands the general report the same slot a full push would carry, and the title screen passes it through', () => {
    // ⚠ OTA-1719 appended `screen` to this call (what the report screen could
    // see, so a "the control is missing" report can be diagnosed). The claim
    // this test makes — the general report rides the same slot a full push
    // would — is untouched, so it is pinned by its parts rather than by one
    // exact line that any later field addition breaks again.
    expect(MODAL.includes('onSend({ slot, logSlot: fullLogSlot, description: description.trim(),')).toBe(true);
    expect(MODAL.includes("mode: slot ? 'character' : 'general', screen });")).toBe(true);
    expect(MODAL.includes('logSlot?: SlotSummary | null;')).toBe(true);
    const at = TITLE.indexOf('const sendBugReport = async (args: {');
    expect(TITLE.slice(at, at + 200).includes('logSlot?: SlotSummary | null;')).toBe(true);
  });
});
