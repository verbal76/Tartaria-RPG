// arb75 — shared bug-report composer. Extracted from TitleScreen.sendBugReport
// so BOTH the Title screen and the in-game Settings (About) screen can file a
// report. Now bundles VOICE + ABOUT(device) + LOGS into one report, so the
// player no longer copies three separate diagnostics — one button, one paste.
//
// NOTE (native follow-up): true zero-paste needs `expo-mail-composer` (sets the
// mail body directly, no URL length limit). That's a native module → a native
// rebuild. Until then this copies the full report to the clipboard and opens a
// mailto with a READ-ME-FIRST body; the player pastes once.
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
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

/** Compose the full bug report (description + device + VOICE + log), copy it to
 *  the clipboard, and open a mailto with paste instructions. Used by both the
 *  Title screen and the in-game Settings/About screen. */
export async function composeAndSendBugReport(args: {
  slot: SlotSummary | null;
  description: string;
}): Promise<void> {
  const { slot, description } = args;
  const charName = slot?.playerName ?? '(general / no character)';
  const subject = `Bug Report${slot ? ` — ${slot.playerName}` : ''}`;

  const deviceBlock = buildBasicDeviceSummary();
  const voiceBlock = buildVoiceSummary();

  let logBlock = '(no character selected — no log attached)';
  if (slot) {
    try {
      const raw = await readSlotLog(slot.slotId);
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

  try {
    await Clipboard.setStringAsync(report);
  } catch {
    /* clipboard rarely fails — proceed to mailto anyway */
  }

  const mailtoBody =
    `READ ME FIRST\n` +
    `=============\n` +
    `Your full bug report (description, device, VOICE info, and most-\n` +
    `recent log entries — newest at top) has been COPIED TO YOUR\n` +
    `CLIPBOARD. Before sending this email:\n` +
    `\n` +
    `  1. Long-press anywhere below the "PASTE BELOW" line\n` +
    `  2. Tap PASTE\n` +
    `  3. Then tap Send\n` +
    `\n` +
    `Without the paste, this email arrives empty and we can't\n` +
    `track the bug down.\n` +
    `\n` +
    `Character: ${charName}\n` +
    `Build: ${getBuildCodename(OTA_BUILD_ID)}\n` +
    `\n` +
    `--- PASTE BELOW THIS LINE ---\n` +
    `\n`;
  const mailto =
    `mailto:hotatticgames@gmail.com` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(mailtoBody)}`;

  try {
    await Linking.openURL(mailto);
  } catch {
    /* no mail client — report is still on the clipboard */
  }
}
