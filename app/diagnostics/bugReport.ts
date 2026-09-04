// arb75 — shared bug-report composer. Extracted from TitleScreen.sendBugReport
// so BOTH the Title screen and the in-game Settings (About) screen can file a
// report. Now bundles VOICE + ABOUT(device) + LOGS into one report, so the
// player no longer copies three separate diagnostics — one button, one paste.
//
// ⚠⚠⚠ OTA-1665 — IT PUSHES NOW. THE EMAIL ROUTE IS RETIRED. Owner: *"report a
// bug should be the button that pushed the log, so we don't need the email route
// anymore, we can archive that bug report land"*, alongside *"I've removed the
// send log."* So there is ONE button for this in the whole product, and it goes
// straight to Sentry carrying what the player typed.
//
// ⚠ THE CLIPBOARD + MAILTO DANCE IS GONE, and it deserves an obituary because it
// was never the design anyone wanted — the note here used to say true zero-paste
// needed `expo-mail-composer`, i.e. a native rebuild, and native builds are
// parked. So the player got a READ-ME-FIRST body, a manual paste, and a report
// that "arrives empty and we can't track the bug down" whenever they missed a
// step. Both the owner's daughters sent reports that way tonight. The transport
// this needed was already in the app: the OTA-1504 durable pipeline SEND LOG has
// used since August. It just was not wired to the button people actually find.
//
// ⚠⚠ ONE REPORT PER CHANGED LOG. Owner: *"after you do a bug report and that
// pushes a log, you can't do another one until something in the log is changed.
// so you have to go play for a little bit before it allows you to push another
// one."* A second report on an identical log is a duplicate issue carrying
// identical evidence, and the fingerprint below is the whole enforcement.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistPendingBundle } from './pendingBundle';
import { sendGameLogInline, describeInlineSend } from './sentryTransport';
import { reportingEnabled, crashReportDsn } from './crashReporter';
import { buildBasicDeviceSummary } from './aboutSummary';
import { readSlotLog, type SlotSummary } from '../engine/saveSystem';
import { OTA_BUILD_ID } from '../buildInfo';
import { getBuildCodename } from '../buildCodename';
import { getVoiceSettings } from '../voice/voiceSettings';
import { getKokoroState, getKokoroErrorHistory } from '../voice/PiperTTSManager';
import { getTtsRouteLog } from '../voice/TTSManager';
import racesData from '../data/races/races.json';
import locationsData from '../data/locations/locations.json';

const raceLabel = (id: string): string =>
  (racesData as { id: string; name: string }[]).find((r) => r.id === id)?.name ?? id;
const locationLabel = (id: string): string =>
  (locationsData as { id: string; name: string }[]).find((l) => l.id === id)?.name ?? id;

/** Sync voice diagnostic block (engine / kokoro state / route log / errors),
 *  the same fields COPY VOICE INFO surfaces, folded into the bug report so
 *  voice issues don't need a separate paste. */
function buildVoiceSummary(): string {
  const v = getVoiceSettings();
  const k = getKokoroState();
  const routes = getTtsRouteLog();
  const errs = getKokoroErrorHistory();
  const stateLine =
    k.phase === 'ready' ? 'ready'
    : k.phase === 'downloading' ? `downloading ${Math.round((k as { fraction: number }).fraction * 100)}%`
    : k.phase === 'error' ? `error: ${(k as { message: string }).message}`
    : k.phase;
  const lines = [
    `  TTS enabled: ${v.ttsEnabled ? 'yes' : 'no'}`,
    `  Engine: ${v.engine}`,
    `  Rate: ${v.rate.toFixed(2)} · Pitch: ${v.pitch.toFixed(2)}`,
    `  System voice id: ${v.voiceId ?? '(default)'}`,
    `  Kokoro voice: ${v.kokoroVoice}`,
    `  Kokoro state: ${stateLine}`,
  ];
  if (routes.length > 0) {
    lines.push(`  Last TTS routes (newest first):`);
    for (const r of routes) lines.push(`    • route=${r.route} · kokoro=${r.phase} · "${r.textHead}"`);
  }
  if (errs.length > 0) {
    lines.push(`  Kokoro errors (${errs.length}):`);
    for (const e of errs) lines.push(`    • ${e.at} · step=${e.step} · ${e.message}`);
  }
  return lines.join('\n');
}

// ~40KB log target (see the original TitleScreen note): Gmail Android compose
// accepts ~64KB per paste, iOS Mail ~50KB; 40KB leaves room for the wrapper.
const LOG_CHARS_CAP = 40_000;

export const BUG_REPORT_MARK_KEY = '@tartaria/lastBugReportFingerprint';

/** ⚠ WHAT "THE LOG CHANGED" MEANS, precisely. The raw slot log grows at the end
 *  (the composer reverses it for display), so its LENGTH plus its newest tail
 *  moves the moment anything is written — a step, a swing, a persist line. Two
 *  reports filed without playing produce the identical pair; that is the case
 *  the owner asked to block. Length alone is not enough: an edit that keeps the
 *  size would slip through, and the tail costs nothing. */
function logFingerprint(slotId: string, raw: string): string {
  return `${slotId}:${raw.length}:${raw.slice(-240)}`;
}

export type BugReportStatus = 'sent' | 'queued' | 'unchanged' | 'off' | 'unconfigured' | 'failed';
export interface BugReportOutcome {
  status: BugReportStatus;
  /** ⚠ ALWAYS SET, for every status. B15: a refusal always speaks. A bug button
   *  that goes quiet is the exact failure this session has now fixed four times
   *  in other places; it is not shipping here. */
  message: string;
}

/** Compose the full bug report (description + device + VOICE + log) and PUSH it,
 *  once, to the same destination crash records go to. Used by both the Title
 *  screen and the in-game Settings/About screen. Never throws: every path
 *  returns an outcome whose `message` can be shown to the player as-is. */
export async function composeAndSendBugReport(args: {
  slot: SlotSummary | null;
  description: string;
}): Promise<BugReportOutcome> {
  const { slot, description } = args;
  const charName = slot?.playerName ?? '(general / no character)';
  // ⚠ THE HEADLINE, and it is the first line of the payload on purpose. This
  // used to be the email SUBJECT; with the mailto gone it would have been dead
  // code, but the value it carried is exactly what a Sentry event needs to be
  // triageable at a glance — who, and what they said. The first sentence of the
  // description rides along, trimmed, so a list of reports reads as a list of
  // problems rather than a column of identical titles.
  const headline = `Bug Report${slot ? ` — ${slot.playerName}` : ''}`
    + ` · ${getBuildCodename(OTA_BUILD_ID)}`
    + (description ? ` · ${description.split('\n')[0]!.slice(0, 80)}` : ' · (no description)');

  const deviceBlock = buildBasicDeviceSummary();
  const voiceBlock = buildVoiceSummary();

  let logBlock = '(no character selected — no log attached)';
  let rawLog = '';
  if (slot) {
    try {
      const raw = await readSlotLog(slot.slotId);
      rawLog = raw ?? '';
      if (raw && raw.length > 0) {
        const allLines = raw.split('\n').filter((l) => l.length > 0);
        const totalLines = allLines.length;
        allLines.reverse();
        const accLines: string[] = [];
        let accChars = 0;
        let truncated = false;
        for (const line of allLines) {
          if (accChars + line.length + 1 > LOG_CHARS_CAP) { truncated = true; break; }
          accLines.push(line);
          accChars += line.length + 1;
        }
        const header = truncated
          ? `(Newest entry at top — showing the most recent ${accLines.length} of ${totalLines} entries; older trimmed to fit a single email paste)`
          : `(Newest entry at top — full log, ${accLines.length} entries)`;
        logBlock = `${header}\n\n${accLines.join('\n')}`;
      } else {
        logBlock = `(log empty for ${slot.playerName})`;
      }
    } catch {
      logBlock = `(log read failed for ${slot.playerName})`;
    }
  }

  const report = [
    headline,
    `=== TARTARIA BUG REPORT ===`,
    `Submitted: ${new Date().toISOString()}`,
    `Character: ${charName}`,
    slot ? `Slot ID: ${slot.slotId}` : null,
    slot ? `Race: ${raceLabel(slot.raceId)}` : null,
    slot ? `Location: ${locationLabel(slot.locationId)}` : null,
    slot ? `HP: ${slot.hp}/${slot.hpMax}${slot.dead ? ' (FALLEN)' : ''}` : null,
    ``,
    `--- DESCRIPTION ---`,
    description,
    ``,
    `--- DEVICE / BUILD ---`,
    deviceBlock,
    ``,
    `--- VOICE ---`,
    voiceBlock,
    ``,
    `--- CHARACTER LOG (newest first) ---`,
    logBlock,
    ``,
    `=== END REPORT ===`,
  ].filter((l) => l !== null).join('\n');

  // ⚠⚠ THE DEDUPE GATE, and it runs BEFORE anything is sent or stored. Owner:
  // *"after you do a bug report and that pushes a log, you can't do another one
  // until something in the log is changed. so you have to go play for a little
  // bit before it allows you to push another one."*
  //
  // ⚠ IT ONLY APPLIES WITH A CHARACTER LOADED. A general report from the title
  // screen has no log to change, so gating it on one would lock the player out
  // of the only channel they have for "the game won't start" — the report that
  // matters most and the one that by definition carries no play.
  const mark = slot ? logFingerprint(slot.slotId, rawLog) : null;
  if (mark) {
    let seen: string | null = null;
    try { seen = await AsyncStorage.getItem(BUG_REPORT_MARK_KEY); } catch { seen = null; }
    if (seen === mark) {
      return {
        status: 'unchanged',
        message: 'You already sent this one. Nothing has happened in the log since — '
          + 'play a while and the button comes back.',
      };
    }
  }

  // ⚠ THE SAME TWO CHECKS SEND LOG ANSWERS TO, said in the player's words rather
  // than failing quietly. `crashReportDsn` is fixed for the life of the build;
  // `reportingEnabled` is the switch on this very screen.
  if (crashReportDsn() === null) {
    return {
      status: 'unconfigured',
      message: 'This version has no reporting destination built in, so there is nowhere to send it.',
    };
  }
  if (!reportingEnabled()) {
    return {
      status: 'off',
      message: 'Reports are switched off on this device. Turn AUTOMATIC CRASH REPORTS on to send this.',
    };
  }

  // ⚠⚠ PERSIST BEFORE THE FIRST SEND — the OTA-1504 rule, learned the night a
  // mid-flush force-close destroyed every bundle. With the file on disk first, a
  // kill costs nothing: the next boot re-sends it. The retries run even after a
  // "successful" flush, because flush()===true has been caught reporting
  // envelopes that never arrived.
  let pendingId = `bug${Date.now().toString(36)}`;
  try {
    const pending = await persistPendingBundle({
      log: report, inventory: '', save: '', device: deviceBlock,
    });
    if (pending?.id) pendingId = pending.id;
  } catch {
    /* disk full or unavailable — the inline send below is still worth trying */
  }

  // ⚠⚠⚠ `delivered`, NOT `!stopped` — AND THE SUITE CAUGHT ME GETTING THIS WRONG.
  // My first version read `!chunk.stopped`, i.e. "we attempted it, so it went".
  // That is exactly the false positive OTA-1519 exists because of: a send can be
  // attempted, report no stop reason, and still lose parts on the wire — that
  // OTA measured Sentry silently replacing NINE of 49 inline parts. `delivered`
  // is `sent === parts`, the only field that means the whole thing arrived.
  let ok = false;
  try {
    const chunk = await sendGameLogInline(report, pendingId);
    ok = chunk.delivered;
    // ⚠⚠ AND IT LEAVES A LINE. OTA-1492's rule: the next diagnosis starts from a
    // line, not a memory — so the full inline-send report (parts accepted, what
    // flush said, where it threw) goes into the game log either way. Lazily
    // required because a diagnostics module must not take a static dependency
    // on the store.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useGameStore } = require('../state/gameStore') as typeof import('../state/gameStore');
      useGameStore.getState().appendLog('debug', describeInlineSend(chunk));
    } catch { /* no store in this context (title screen boot) — the send still counts */ }
  } catch {
    ok = false;
  }

  // ⚠ THE MARK IS STORED ON A QUEUED SEND TOO, deliberately. The bundle is on
  // disk and the boot retry owns it from here, so letting a second identical
  // report through would queue a duplicate of something already waiting — the
  // exact outcome the owner asked to prevent, arriving twice instead of once.
  if (mark) {
    try { await AsyncStorage.setItem(BUG_REPORT_MARK_KEY, mark); } catch { /* retried next report */ }
  }

  return ok
    ? { status: 'sent', message: 'Report sent. Thank you — it arrived with your log attached.' }
    : {
      status: 'queued',
      message: 'Saved on this device and queued. It will finish sending the next time the game starts.',
    };
}
