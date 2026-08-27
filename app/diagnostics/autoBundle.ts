/**
 * app/diagnostics/autoBundle.ts — THE CRASH BRINGS ITS OWN EVIDENCE.
 *
 * ⚠⚠⚠ OTA-1505 — owner's instruction, 2026-08-26: *"make it so my characters
 * and sasmooches characters push the full bundle."* Crash RECORDS have always
 * auto-pushed (every boot flushes the ledger, opt-out default since OTA-1487);
 * what stayed manual was the full four-attachment bundle — the log that
 * actually closes cases. The night of 2026-08-25 proved the cost: four crash
 * headlines arrived with no story attached, and the story had to be pasted by
 * hand the next day.
 *
 * So: when a slot loads on an UNLOCKED device and the ledger holds a crash
 * newer than the last one bundled, the full bundle is composed and pushed
 * through the OTA-1504 durable pipeline automatically — no tap.
 *
 * ⚠⚠ WHO THIS FIRES FOR, EXACTLY. The same gate SEND LOG renders behind:
 * `ownerToolsUnlocked` — the character's name passes `sharingUnlockedFor`
 * (the 'verbal'/'sasmooch' prefix list) or the device was stickily marked by
 * one that did (OTA-1490). Players' devices never set that flag, so players
 * keep exactly the privacy-page promise: only slim crash records leave. The
 * bundle carries typed input and a save; it stays owner-family-only.
 *
 * ⚠⚠ WHY THE TRIGGER IS THE SLOT LOAD, NOT APP BOOT. Three reasons, each
 * load-bearing:
 *   · at boot no character is loaded — the save and inventory sections would
 *     be empty stamps; at slot load they are the real thing;
 *   · the native-death promotion happens in hydrate(), which races the boot
 *     diagnostics block — by slot-load time the record is settled and read;
 *   · the boot path already delivers the slim records; this only adds the
 *     story, and the story needs a session to be about.
 *
 * ⚠ THE MARK. `@tartaria/lastAutoBundledCrashTs` remembers the newest crash
 * ts already bundled. One crash → one auto-bundle, however many slot loads
 * follow; a crash LOOP produces at most one queued bundle per new record, and
 * the 1504 latest-wins slot means the disk never holds more than one. The
 * order is compose → persist → mark → send: a kill after persist but before
 * mark re-queues a fresh copy next load (harmless, deduped by the relay
 * reader); a kill after mark has the durable file already on disk.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlayerCharacter } from '../engine/types';
import { flushLogWrites, readFullLog } from '../engine/saveSystem';
import { buildBasicDeviceSummary, stampLogExport } from './aboutSummary';
import { buildInventorySnapshot, stampInventoryExport } from './inventorySnapshot';
import { buildSaveSnapshot, stampSaveExport } from './saveSnapshot';
import { loadCrashLedger, settleCrashWrites } from './crashLedger';
import { reportingEnabled } from './crashReporter';
import { ownerToolsUnlocked } from './ownerTools';
import { persistPendingBundle } from './pendingBundle';
// ⚠⚠⚠ OTA-1519 — inline and attachment-free, like every other send now.
import { sendGameLogInline, describeInlineSend, type DiagnosticsBundle } from './sentryTransport';

export const AUTO_BUNDLE_MARK_KEY = '@tartaria/lastAutoBundledCrashTs';

/** One derivation per artifact — the same stampers SEND LOG and every COPY
 *  button use, so an auto-pushed bundle can never disagree with a manual one. */
export async function composeDiagnosticsBundle(
  player: PlayerCharacter | null,
  worldMemory: unknown,
): Promise<DiagnosticsBundle> {
  await flushLogWrites();
  const fresh = await readFullLog();
  const device = buildBasicDeviceSummary();
  return {
    log: stampLogExport(fresh),
    inventory: stampInventoryExport(buildInventorySnapshot(player), device, player?.name),
    save: stampSaveExport(buildSaveSnapshot(player, worldMemory), device, player?.name),
    device,
  };
}

/**
 * Called on every slot load, fire-and-forget. Returns the debug-log line
 * describing what happened, or null when nothing fired (the common case —
 * two cheap reads and done).
 */
export async function maybeAutoQueueCrashBundle(
  player: PlayerCharacter | null,
  worldMemory: unknown,
): Promise<string | null> {
  try {
    if (!(await ownerToolsUnlocked(player?.name))) return null;
    if (!reportingEnabled()) return null;
    // The hydrate-time native-death promotion is fire-and-forget; settle it so
    // a death discovered THIS boot is visible to this read.
    await settleCrashWrites();
    const ledger = await loadCrashLedger();
    if (ledger.length === 0) return null;
    const newest = ledger.reduce((m, r) => Math.max(m, r.ts), 0);
    let mark = 0;
    try { mark = Number(await AsyncStorage.getItem(AUTO_BUNDLE_MARK_KEY)) || 0; } catch { /* first run */ }
    if (newest <= mark) return null;
    const bundle = await composeDiagnosticsBundle(player, worldMemory);
    const pending = await persistPendingBundle(bundle);
    try { await AsyncStorage.setItem(AUTO_BUNDLE_MARK_KEY, String(newest)); } catch { /* re-bundles next load */ }
    // ⚠⚠⚠ OTA-1516 — CHUNKED HERE TOO, AND THIS IS THE WORST PLACE OF ALL FOR
    // A MEGABYTE ALLOCATION. This path runs immediately after a crash has been
    // found on the ledger — i.e. on a device that has just been proven to be
    // under enough pressure to lose a process. Building an 800KB log tail plus
    // an untruncated save plus inventory plus device, then base64ing the lot
    // into one JS string for the RN bridge, was asking the freshly-recovered
    // process to make the single largest allocation it ever makes. The game log
    // in 60K parts costs a fraction of it and is what the owner asked to see.
    // ⚠⚠⚠ OTA-1519 — INLINE HERE TOO, and this is the path the owner could watch
    // fail in real time: 02:01:31 on hal and 02:02:02 on golem, both refused,
    // both four or five seconds before the attachment-free button went through
    // in the same process. A path proven not to work has no business running
    // unattended after a crash.
    const chunk = await sendGameLogInline(bundle.log, pending?.id ?? `auto${newest.toString(36)}`);
    const ok = chunk.delivered;
    return `send-log: crash on record (${new Date(newest).toISOString()}) — game log pushed automatically, `
      + `${ok ? 'delivered to Sentry' : describeInlineSend(chunk)}${pending ? `, kept on disk as #${pending.id}` : ''}`;
  } catch {
    return null; // the auto path must never become a slot-load hazard
  }
}
