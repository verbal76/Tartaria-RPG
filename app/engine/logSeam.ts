// ⚠⚠ OTA-1494 — A LOG THAT SAYS WHICH ERA EACH LINE BELONGS TO.
//
// ⚠⚠ THE MEASUREMENT, from the owner's iPhone bundle (sentry-inbox/
// player-log_2026-08-24T21-20-59): 1,027 log entries, of which 987 were from
// AUGUST 9 — fifteen days and dozens of builds stale — 22 from Aug 23, and 18
// from Aug 24. The log is 111KB against a 400,000-char cap (diskLogCap), so
// nothing had ever been trimmed: it simply accumulated across versions, OTA
// upgrades and a two-week gap, with no visible seam between eras.
//
// ⚠⚠ WHY THAT IS A DEFECT AND NOT A CURIOSITY. It cost a wrong diagnosis the
// same hour it arrived: three "STANDING DOWN for good" lines were read as a
// live loop and nearly became an OTA — they were from build 1203 on Aug 9,
// and the repeat-logging they show was FIXED by OTA-1181 two weeks ago. A log
// whose eras are invisible invites exactly that error, from anyone reading it.
//
// ⚠ THE MINIMAL FIX, and the reason it is not a trim: the log already writes
// an `OTA session start` marker at slot load (OTA-099, slotSlice). It just did
// not say WHEN, on WHICH build, or HOW LONG since the last line. Saying so is
// one line at a seam that already exists — no new storage, no change to the
// write path, and no deletion of history the owner may still want. The owner
// chose the banner WITHOUT an age-based drop, deliberately.

/** How the gap between two log entries reads to a human. */
export function gapPhrase(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'moments';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const d = Math.floor(hr / 24);
  return `${d}d ${hr % 24}h`;
}

/**
 * The seam banner: one line that makes every entry after it attributable.
 *
 * ⚠ `previousEntryAt` is the timestamp of the last line ALREADY in the log
 * (null when the log is empty). The gap is what turns "these lines are old"
 * from something a reader has to notice into something the log states.
 */
export function seamBanner(opts: {
  build: string;
  now: number;
  previousEntryAt: number | null;
  appliedFrom?: string | null;
}): string {
  const when = new Date(opts.now).toISOString();
  const parts = [`═══ SESSION ${when} · build ${opts.build}`];
  if (opts.appliedFrom) parts.push(`· updated from ${opts.appliedFrom}`);
  parts.push(
    opts.previousEntryAt === null
      ? '· first entries in this log'
      : `· previous entry ${gapPhrase(opts.now - opts.previousEntryAt)} earlier`,
  );
  return `${parts.join(' ')} ═══`;
}

/**
 * The timestamp of the last entry in an existing log body, or null.
 *
 * ⚠ Reads the LAST parseable stamp, not the last line: the log ends with
 * device-summary text (`stampLogExport` appends it), and a tail line without
 * a stamp must not be mistaken for "no history".
 */
export function lastEntryTime(logBody: string): number | null {
  const stamps = logBody.match(/\[(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)\]/g);
  if (!stamps || stamps.length === 0) return null;
  const last = stamps[stamps.length - 1]!.slice(1, -1);
  const t = Date.parse(last);
  return Number.isFinite(t) ? t : null;
}
