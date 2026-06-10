// OTA-398 — on-disk COPY-LOG cap. The slot log key APPENDS every log line and was
// never trimmed, so on a long-played character it grew to fill AsyncStorage's
// ~6 MB database — at which point EVERY write fails, including the (tiny) slot
// save. That was the real "staged save did not verify (truncated or storage
// full)" cause (telemetry put the save blob at ~123 KB — nowhere near a limit).
//
// Pure helper (no AsyncStorage import) so it's unit-testable. Keeps only the
// most-recent slice, trimmed to a line boundary so the log always starts on a
// clean entry. Self-healing: the first write after this ships shrinks a bloated
// log and frees the space, so saves start landing again.

export const MAX_DISK_LOG_CHARS = 400_000;

export function capDiskLog(content: string, maxChars = MAX_DISK_LOG_CHARS): string {
  if (content.length <= maxChars) return content;
  const cut = content.slice(content.length - maxChars);
  const nl = cut.indexOf('\n');
  // Drop the partial leading line so the log always starts on a clean entry.
  return nl >= 0 ? cut.slice(nl + 1) : cut;
}
