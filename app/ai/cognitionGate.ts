// OTA-1696 — THE FIGHT SHEDS ITS PASSENGERS. The 13:32 bundle (#mtof9i1d5eoj,
// stamp 1690): seven freeze-watch stalls in a three-minute five-raider fight,
// every one right after a DODGE / APPROACH / attack, the JS thread 2.5–5.2s
// late while frames kept coming, and the MiniLM classifier reading 0.4–7.4s
// per action against its usual 0.35s — in four of the seven the stall line
// said `native: cognition running`. The classifier is fire-and-forget
// enrichment (a mood tag for the Arbiter's voice) that runs on EVERY action,
// including a chip tap the parser already resolved at conf=1.00 inside a
// fight, where the mood is the least of anyone's worries and the ONNX run
// competes with the round's own render for the same cores.
//
// The gate: no classifier pass when hostiles are on the field AND the parser
// is confident. Free text in a fight ("I try to swim the canal") still gets
// its read; every action outside a fight is untouched; the stale mood tag is
// what the Arbiter reads meanwhile, which is exactly what it read between
// classifier passes before.

/** The parser confidence at and above which a combat action skips the classifier. */
export const COGNITION_SKIP_CONFIDENCE = 0.9;

export function cognitionSkippedInCombat(enemies: number, confidence: number): boolean {
  return enemies > 0 && confidence >= COGNITION_SKIP_CONFIDENCE;
}
