/**
 * app/state/visibleLogCount.ts — HOW MUCH HAS ACTUALLY HAPPENED.
 *
 * OTA-1398 (slice 7 of the gameStore split). OTA-1055's staleness fix: `gameLog`
 * is capped at MAX_LOG_IN_MEMORY, so its length stops being a measure of "how
 * much has happened" the moment the buffer fills. This counter never trims.
 *
 * ⚠⚠ MOVED DOWN BECAUSE IT HAS TWO OWNERS, which is the third time in this one
 * slice. `appendLog` (gameStore) WRITES it; the ambient-staleness stamp
 * (`app/ai/narration.ts`) READS it, and that read is the whole point of the
 * counter — an ambient musing composed fourteen seconds ago is stale not because
 * time passed but because the situation moved underneath it, and the log count
 * is how "the situation moved" is measured. Neither module can hold the `let`
 * for the other: assigning to an imported binding is a compile error.
 *
 * ⚠ Debug and cognitive lines are excluded at the CALL SITE, not here. That is
 * deliberate — the caller is the only thing that knows the channel, and pushing
 * the channel down here would mean this module importing the log types to make
 * a decision it has no other reason to know about.
 *
 * ⚠ Keep this surface at three functions. It is a counter.
 */
let visibleLogLines = 0;

/** Called once per player-visible log line. */
export function noteVisibleLogLine(): void {
  visibleLogLines += 1;
}

/** Total player-visible lines emitted this session, never trimmed. */
export function visibleLogTotal(): number {
  return visibleLogLines;
}

/** Tests only — module state, and the one thing a leaf must always offer that
 *  a module-scope `let` inside a 43k-line store never could. */
export function _resetVisibleLogCountForTest(): void {
  visibleLogLines = 0;
}
