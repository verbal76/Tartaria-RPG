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
import { persistPendingBundle, clearPendingBundle } from './pendingBundle';
import { sendGameLogInline, describeInlineSend } from './sentryTransport';
import { reportingEnabled, crashReportDsn } from './crashReporter';
import { buildBasicDeviceSummary } from './aboutSummary';
// ⚠⚠ OTA-1666 — THE PACK RIDES ALONG NOW. The report carried description +
// device + voice + log and nothing about what the player was CARRYING, so every
// balance or item defect ("this heal did nothing", "the coating vanished")
// arrived with the sentence and none of the evidence. COPY INVENTORY existed to
// fill that gap by hand, on a separate button, in a separate paste, which is
// exactly the split REPORT A BUG was built to end. Folding the same snapshot in
// here is what made deleting that button honest rather than a loss.
import { buildInventorySnapshot } from './inventorySnapshot';
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

/** ⚠ OTA-1666 — the pack's own ceiling, kept well under the log's. A hoarder's
 *  snapshot runs long (every instance, with durability, slot and stat lines),
 *  and the log is the part that explains WHY a report was filed — so if
 *  something has to be trimmed, it is not the log. */
const INVENTORY_CHARS_CAP = 12_000;

export const BUG_REPORT_MARK_KEY = '@tartaria/lastBugReportFingerprint';

/** ⚠⚠⚠ OTA-1672 — THE FULL-LOG PUSH KEEPS ITS OWN MARK, and this is the owner's
 *  explicit call after I put the choice to him in one question.
 *
 *  With a single mark, filing a described report and then pushing the raw log
 *  about the same moment is refused — the log has not changed since, so the
 *  second send looks like the duplicate the OTA-1665 rule exists to block. But it
 *  is not a duplicate: one carries the player's words about what went wrong, the
 *  other carries the evidence with no interpretation, and the owner asks for them
 *  separately on purpose. Blocking the second would mean going off to play before
 *  you could send the log about the thing you just reported.
 *
 *  ⚠ THE RULE ITSELF IS UNCHANGED, it just applies PER MODE: each of the two can
 *  still only be sent once per changed log, so neither becomes a spam button. */
export const FULL_LOG_MARK_KEY = '@tartaria/lastFullLogFingerprint';

/** Which of the three things the player picked. `character` and `general` are the
 *  described report (the text box gates SEND); `fulllog` is the raw push with no
 *  description asked for and none required. */
export type BugReportMode = 'character' | 'general' | 'fulllog';

/** The mark a mode consumes. Named rather than inlined so the About screen's
 *  ERASE THIS LOG can clear the same two keys this module writes — a clear that
 *  reset only one of them would leave the other refusing on a log that no longer
 *  exists. */
export function markKeyForMode(mode: BugReportMode): string {
  return mode === 'fulllog' ? FULL_LOG_MARK_KEY : BUG_REPORT_MARK_KEY;
}

/** ⚠⚠ OTA-1672 — THE POPUP'S TITLE, derived here so both screens say the same
 *  word for the same outcome. Owner: *"have the log sent line that I missed the
 *  first few times appear as a popup so it's very visible."* A popup needs a
 *  heading, and a heading that said SENT over a queued or refused push would be
 *  the lie the outcome messages were written to avoid. */
export function bugReportOutcomeTitle(status: BugReportStatus): string {
  if (status === 'sent') return 'REPORT SENT';
  if (status === 'queued') return 'SAVED — WILL FINISH SENDING';
  if (status === 'unchanged') return 'ALREADY SENT THIS ONE';
  return 'NOT SENT';
}

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
  /** OTA-1672. Absent means the described report, which is what every caller
   *  before this OTA meant — so old call sites keep their exact behaviour. */
  mode?: BugReportMode;
  /** ⚠⚠ OTA-1682 — WHOSE LOG A GENERAL REPORT CARRIES. The log is per slot
   *  (`tartaria.gamelog.<slot>.v2`); there is no global ring. So "General bug
   *  — no character" was arriving with nothing under CHARACTER LOG, twice on
   *  09-05 with the owner's own word "Log" as the whole description. The modal
   *  already resolves the character a full push would send (the one being
   *  played, else the newest save); a general report rides the same answer and
   *  the report says whose it is. `slot` still wins when the player picked one. */
  logSlot?: SlotSummary | null;
  /** ⚠⚠⚠ OTA-1719 — WHAT THE REPORT SCREEN COULD SEE. Optional, because the
   *  older call sites are still valid and a report with no screen state is
   *  better than no report; when it is absent the block below says so rather
   *  than inventing zeroes, which would read as a device with no saves. */
  screen?: { saveSlotsSeen: number; activeSlotKnown: boolean; fullLogRowOffered: boolean };
}): Promise<BugReportOutcome> {
  const { slot } = args;
  const logSource: SlotSummary | null = slot ?? args.logSlot ?? null;
  const logBorrowed = !slot && logSource !== null;
  const mode: BugReportMode = args.mode ?? (slot ? 'character' : 'general');
  // ⚠ OTA-1672 — A FULL-LOG PUSH HAS NO DESCRIPTION AND IS NOT ASKED FOR ONE.
  // Owner: *"when I want to send a full log … there really shouldn't be a text
  // box."* The report still needs SOMETHING under --- DESCRIPTION ---, and an
  // empty block would read to a triager as a player who had nothing to say
  // rather than as a deliberate raw push. So it says which it is.
  const description = mode === 'fulllog'
    ? '(full log pushed for analysis — no description asked for)'
    : args.description;
  const charName = slot?.playerName ?? '(general / no character)';
  // ⚠ THE HEADLINE, and it is the first line of the payload on purpose. This
  // used to be the email SUBJECT; with the mailto gone it would have been dead
  // code, but the value it carried is exactly what a Sentry event needs to be
  // triageable at a glance — who, and what they said. The first sentence of the
  // description rides along, trimmed, so a list of reports reads as a list of
  // problems rather than a column of identical titles.
  // ⚠ OTA-1672 — the KIND leads, so a list of reports separates the ones
  // carrying a player's words from the raw log pushes at a glance.
  const headline = `${mode === 'fulllog' ? 'Full Log' : 'Bug Report'}`
    + `${slot ? ` — ${slot.playerName}` : ''}`
    + ` · ${getBuildCodename(OTA_BUILD_ID)}`
    + (description ? ` · ${description.split('\n')[0]!.slice(0, 80)}` : ' · (no description)');

  const deviceBlock = buildBasicDeviceSummary();
  const voiceBlock = buildVoiceSummary();

  // ⚠ OTA-1666 — THE PACK, read from the LIVE store rather than the slot. The
  // slot summary carries name / race / location / hp and no items, and the
  // player is looking at the pack they are complaining about right now — so the
  // live state is both the only source and the correct one. Lazily required for
  // the same reason the log line below is: a diagnostics module must not take a
  // static dependency on the store, and on the title screen there is no store
  // to take. `buildInventorySnapshot(null)` answers "(no active character)", so
  // the no-character path needs no branch of its own.
  let inventoryBlock = '(inventory unavailable)';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../state/gameStore') as typeof import('../state/gameStore');
    const snap = buildInventorySnapshot(useGameStore.getState().player);
    inventoryBlock = snap.length > INVENTORY_CHARS_CAP
      ? `${snap.slice(0, INVENTORY_CHARS_CAP)}\n(pack listing trimmed at ${INVENTORY_CHARS_CAP} characters)`
      : snap;
  } catch {
    /* no store in this context, or a catalog lookup threw — the report is still
       worth sending, and this line says which of the two it was to a reader. */
  }

  // ⚠ OTA-1682 — this line is only ever true of a device with NO character. A
  // general report with a character on the device carries that character's log
  // (see `logSlot` above); the old "(no character selected — no log attached)"
  // was describing a choice the player could not see they were making.
  let logBlock = '(no character on this device — no log to attach)';
  let rawLog = '';
  if (logSource) {
    const src = logSource;
    try {
      const raw = await readSlotLog(src.slotId);
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
        logBlock = `(log empty for ${src.playerName})`;
      }
    } catch {
      logBlock = `(log read failed for ${src.playerName})`;
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
    // OTA-1682 — a borrowed log says so, right under the character line.
    logBorrowed && logSource ? `Log from: ${logSource.playerName} (the character last played — not selected)` : null,
    ``,
    `--- DESCRIPTION ---`,
    description,
    ``,
    // ⚠⚠ OTA-1719 — ABOVE THE DEVICE BLOCK, because it explains the report
    // screen itself and a triager reading "the control was missing" needs it
    // before anything about the phone. A tester reported the full-log row absent
    // on Android and present on iOS; the row is gated on a resolvable save, its
    // absence rendered as nothing, and nothing in the payload recorded what the
    // screen had been handed — so the claim could be neither confirmed nor
    // refuted from here. It can now.
    `--- REPORT SCREEN ---`,
    args.screen
      ? `  Saved characters this screen could see: ${args.screen.saveSlotsSeen}\n`
        + `  Knew which character was being played: ${args.screen.activeSlotKnown ? 'yes' : 'no'}\n`
        + `  "Send full log" row offered: ${args.screen.fullLogRowOffered ? 'yes' : 'NO — the row was not on screen'}`
      : '  (not recorded — sent by a caller from before OTA-1719)',
    ``,
    `--- DEVICE / BUILD ---`,
    deviceBlock,
    ``,
    `--- VOICE ---`,
    voiceBlock,
    ``,
    // OTA-1666 — above the log deliberately: the pack is the state the log's
    // last few lines are usually about, and it is short enough to read first.
    `--- INVENTORY ---`,
    inventoryBlock,
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
  //
  // ⚠⚠⚠ OTA-1672 — AND IT IS PER MODE, not one mark for the pair. See
  // FULL_LOG_MARK_KEY above for the owner's ruling and the reason: a described
  // report and a raw log push about the same moment are two different artefacts,
  // and sharing a mark would refuse the second one for looking like the first.
  const markKey = markKeyForMode(mode);
  const mark = slot ? logFingerprint(slot.slotId, rawLog) : null;
  if (mark) {
    let seen: string | null = null;
    try { seen = await AsyncStorage.getItem(markKey); } catch { seen = null; }
    if (seen === mark) {
      return {
        status: 'unchanged',
        message: mode === 'fulllog'
          ? 'You already pushed this log. Nothing has happened in it since — '
            + 'play a while and the button comes back.'
          : 'You already sent this one. Nothing has happened in the log since — '
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
  let pendingId = `${mode === 'fulllog' ? 'log' : 'bug'}${Date.now().toString(36)}`;
  try {
    // OTA-1666 — `inventory` was an empty string here while the pack had no
    // home in the report at all. It is inside `report` now AND named in its own
    // field, which is what the bundle's shape was always for.
    const pending = await persistPendingBundle({
      log: report, inventory: inventoryBlock, save: '', device: deviceBlock,
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

  // ⚠⚠⚠ OTA-1682 — DELIVERED MEANS DONE. The durable file exists for the send
  // that did not go; leaving it behind a delivered one is what re-sent the
  // 01:50:49 report at 02:23 and 02:27. See pendingBundle.ts's header.
  if (ok) await clearPendingBundle();

  // ⚠ THE MARK IS STORED ON A QUEUED SEND TOO, deliberately. The bundle is on
  // disk and the boot retry owns it from here, so letting a second identical
  // report through would queue a duplicate of something already waiting — the
  // exact outcome the owner asked to prevent, arriving twice instead of once.
  if (mark) {
    try { await AsyncStorage.setItem(markKey, mark); } catch { /* retried next report */ }
  }

  return ok
    ? { status: 'sent', message: 'Report sent. Thank you — it arrived with your log attached.' }
    : {
      status: 'queued',
      message: 'Saved on this device and queued. It will finish sending the next time the game starts.',
    };
}
