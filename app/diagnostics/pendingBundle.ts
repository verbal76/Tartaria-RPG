/**
 * app/diagnostics/pendingBundle.ts — THE BUNDLE SURVIVES THE KILL.
 *
 * ⚠⚠⚠ OTA-1504 — THE MEASURED DEFECT, from the owner's own pasted bug reports
 * (2026-08-25, Pixel 10 Pro XL, both installs). Every SEND LOG bundle that
 * night died on the CLIENT, two different ways, and his own theory named the
 * mechanism — *"maybe me sending logs then force closing it caused the after
 * crashes"*:
 *
 *   · Force-close mid-flush. His habit is open → SEND LOG → swipe the app
 *     away. The kill lands while flush() still holds the envelope, the bundle
 *     dies in the process, and the ledger records a native death for a send
 *     that simply never finished. Four receipts in one night wear this shape.
 *   · flush() LIED. The log carries `send-log: flushed to Sentry` lines whose
 *     events never reached the server — and the relay's outcomes ledger shows
 *     ZERO server-side drops in that window, so the loss was client-side even
 *     when flush() answered true. OTA-1492 made "SENT" mean "the SDK says the
 *     queue drained"; this file exists because that is still not receipt.
 *
 * So the bundle becomes DURABLE: persisted to a file the moment the button is
 * tapped — before the first send is even attempted — and re-sent once per boot
 * until its attempts are spent, REGARDLESS of what flush() answered, because
 * flush()'s yes has been caught lying and there is no client-side way to
 * confirm receipt. The owner's force-close habit stops costing evidence: the
 * kill can land mid-flush all it likes, the file is already on disk and the
 * next boot picks it up.
 *
 * ⚠⚠ WHY A FILE AND NOT AsyncStorage. A bundle is the full log tail (up to
 * 800KB) plus a NEVER-truncated save plus inventory plus device — pushing 2MB,
 * which is around Android AsyncStorage's per-row cursor limit and a hostile
 * share of its total budget, the same budget the SAVES live in. A save that
 * fails to persist because a diagnostics bundle ate the storage would be the
 * instrument destroying the patient. expo-file-system is already a static
 * dependency on every build (ModelDownloader), so a document-directory file
 * costs nothing new.
 *
 * ⚠ DUPLICATES ARE THE DESIGN, NOT A BUG. A bundle that DID arrive and is
 * re-sent next boot lands as a second event with the same `bundleId` tag and
 * `#id` message suffix; the relay commits both and the reader dedupes on the
 * id. Wasting a few uploads is nothing next to losing the one bundle that
 * held the evidence — which is what actually happened, four times, tonight.
 *
 * ⚠ LATEST WINS. One slot, overwritten on every tap. The owner's taps are
 * strictly-growing pictures of the same device (the log accumulates), so the
 * newest bundle contains what the older ones knew. Queueing several would
 * multiply the disk and upload cost for evidence already inside the newest.
 */
import * as FileSystem from 'expo-file-system';
import { reportingEnabled } from './crashReporter';
import { sendDiagnosticsBundle, type DiagnosticsBundle } from './sentryTransport';

export const PENDING_BUNDLE_FILE = 'pending-diagnostics-bundle.json';

/** Total sends one bundle gets — the tap itself is attempt 1, boots take the
 *  rest. Five covers the worst observed night (four kills) with one to spare,
 *  and bounds the duplicate-upload cost of a bundle that arrived first try. */
export const MAX_SEND_ATTEMPTS = 5;

/** ⚠⚠⚠ OTA-1512 — THE SHORTEST GAP AN ATTEMPT IS ALLOWED TO FOLLOW ANOTHER BY.
 *
 * MEASURED, from the owner's 2026-08-26 22:02 log: bundle #mt9gmr2ylu58 burned
 * attempts 2 AND 3 **1.3 seconds apart** — one before the OTA restart, one on
 * the boot that restart produced:
 *
 *     22:02:32.453  attempt 2/5 did not go out
 *     22:02:33.270  ota: Restarting to apply…
 *     22:02:33.752  attempt 3/5 did not go out
 *
 * Attempt 3 answered in 25ms, far too fast for a 10s flush of a ~270KB
 * envelope: the Sentry transport was not up yet on that half-second-old
 * process. Neither send had a chance, and both spent one of the five the
 * bundle gets. The relay's outcome ledger settles what happened to them —
 * accepted/error and accepted/attachment were byte-identical before and
 * after, so nothing reached Sentry's door at all.
 *
 * An attempt is meant to be a real chance at delivery. One that follows
 * another inside this window is a restart artifact, not a chance, and is now
 * HELD instead of burned. */
export const MIN_RETRY_GAP_MS = 60_000;

export interface PendingBundle {
  /** Rides in the event message (`#id`) and tags so the relay reader can
   *  dedupe re-sends of the same bundle. */
  id: string;
  createdAt: number;
  /** Attempts already BURNED (counted before each send goes out — a kill
   *  mid-send must spend the attempt, or a boot-loop retries forever). */
  attempts: number;
  /** OTA-1512 — when the last attempt was spent, so a restart-driven double
   *  boot cannot burn two inside a second. Absent on records written before
   *  1512; `createdAt` stands in, which is correct (the tap is attempt 1). */
  lastAttemptAt?: number;
  bundle: DiagnosticsBundle;
}

function fileUri(): string | null {
  try {
    const root = FileSystem.documentDirectory;
    return root ? root + PENDING_BUNDLE_FILE : null;
  } catch {
    return null;
  }
}

/** Persist a fresh bundle, latest-wins, with its first attempt already
 *  counted (the caller is about to send it). Returns the record so the caller
 *  can tag the send with the id, or null when the disk refused — in which
 *  case the send still goes out the old way and the UI says so. */
export async function persistPendingBundle(bundle: DiagnosticsBundle): Promise<PendingBundle | null> {
  try {
    const uri = fileUri();
    if (!uri) return null;
    const rec: PendingBundle = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      attempts: 1,
      lastAttemptAt: Date.now(),
      bundle,
    };
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(rec));
    return rec;
  } catch {
    return null; // diagnostics must never become the failure they document
  }
}

export async function readPendingBundle(): Promise<PendingBundle | null> {
  try {
    const uri = fileUri();
    if (!uri) return null;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const rec = JSON.parse(await FileSystem.readAsStringAsync(uri)) as PendingBundle;
    const b = rec?.bundle;
    const ok = typeof rec?.id === 'string' && typeof rec?.attempts === 'number'
      && b && typeof b.log === 'string' && typeof b.inventory === 'string'
      && typeof b.save === 'string' && typeof b.device === 'string';
    return ok ? rec : null;
  } catch {
    return null;
  }
}

export async function clearPendingBundle(): Promise<void> {
  try {
    const uri = fileUri();
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch { /* a stale file re-tries once more next boot — the relay dedupes */ }
}

/**
 * One retry, once per boot. Returns the debug-log line describing what it did,
 * or null when there was nothing pending (the overwhelmingly common boot —
 * one getInfoAsync miss and done).
 *
 * ⚠ The attempt is COUNTED AND WRITTEN BEFORE the send goes out. If the send
 * itself dies with the process (the exact kill this file exists for), the
 * spent attempt is already on disk — a device that dies on every send runs out
 * of attempts instead of retrying into the same wall forever.
 */
export async function retryPendingBundleAtBoot(): Promise<string | null> {
  try {
    const p = await readPendingBundle();
    if (!p) return null;
    if (!reportingEnabled()) {
      // Not an attempt — nothing was tried. Kept for a boot where delivery is on.
      return `send-log: bundle #${p.id} waiting on disk — delivery is off, kept`;
    }
    if (p.attempts >= MAX_SEND_ATTEMPTS) {
      await clearPendingBundle();
      return `send-log: bundle #${p.id} spent all ${MAX_SEND_ATTEMPTS} attempts — cleared`;
    }
    // ⚠⚠ OTA-1512 — a restart is not a second chance. See MIN_RETRY_GAP_MS.
    // Held, NOT burned: the bundle keeps every attempt it has not really had.
    const sinceLast = Date.now() - (p.lastAttemptAt ?? p.createdAt);
    if (sinceLast < MIN_RETRY_GAP_MS) {
      return `send-log: bundle #${p.id} held — only ${Math.round(sinceLast / 1000)}s since the last try (a restart, not a chance); ${MAX_SEND_ATTEMPTS - p.attempts} left`;
    }
    const attempt = p.attempts + 1;
    const uri = fileUri();
    if (uri) await FileSystem.writeAsStringAsync(uri, JSON.stringify({ ...p, attempts: attempt, lastAttemptAt: Date.now() }));
    // ⚠ OTA-1512 — TIME THE SEND. A failure at 25ms and a failure at 10s are
    // different diagnoses (no transport yet vs a flush that ran out of clock),
    // and the 22:02 log could not tell them apart. Now the line says.
    const startedAt = Date.now();
    const ok = await sendDiagnosticsBundle(p.bundle, { bundleId: p.id, attempt });
    const took = Date.now() - startedAt;
    if (attempt >= MAX_SEND_ATTEMPTS) {
      await clearPendingBundle();
      return `send-log: bundle #${p.id} attempt ${attempt}/${MAX_SEND_ATTEMPTS} ${ok ? 'flushed' : `did not go out (after ${took}ms)`} — final try, cleared`;
    }
    return `send-log: bundle #${p.id} attempt ${attempt}/${MAX_SEND_ATTEMPTS} ${ok ? 'flushed to Sentry' : `did not go out (after ${took}ms) — kept for next boot`}`;
  } catch {
    return null; // the retry is best-effort; the file stays for the next boot
  }
}
