// arbiterFrame — pulls speakable dialogue out of arbiter-channel
// narration so TTS reads it as the speaker addressing the player,
// not as a third-party narrator describing them.
//
// Engine narration looks like:
//
//   The Arbiter inclines their head and says, "X."
//   "X," the Arbiter notes.
//   The Arbiter glances at the wagon. "X."
//   Irma Ironhand leans in. "Got a contract for someone like you."
//
// Goal output: just the quoted speech ("X." / "Got a contract for
// someone like you."), so the bundled or system TTS engine reads it
// as if the character is talking TO the player.
//
// Lives in its own file so __tests__/stripArbiterFrame.test.ts can
// import it without pulling in TTSController → useGameStore →
// AsyncStorage (a heavy mock chain).

/** Pull dialogue out of arbiter-channel narration. Returns the
 *  speakable text. Falls back to the original input on edge cases
 *  so TTS never goes silent. */
export function stripArbiterFrame(text: string): string {
  if (!text) return text;
  // Match standard double quotes AND curly quotes (lore lines use “”).
  const quoteRegex = /["“]([^"”]+)["”]/g;
  const quoted: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = quoteRegex.exec(text)) !== null) {
    if (m[1]) quoted.push(m[1].trim());
  }
  if (quoted.length > 0) {
    // ⚠ OTA-1161 — THE ATTRIBUTION COMMA CAME ALONG FOR THE RIDE. Dialogue
    // convention puts a comma INSIDE the closing quote when narration follows:
    //
    //   "You attack as if you mean to leave," the Arbiter murmurs. "Good."
    //
    // Stripping the narration (this function's whole job, per the owner's
    // immersion ask) used to join the pieces raw, producing
    // "…mean to leave, Good." — the two sentences fused by a comma that only
    // ever existed to hand off to the attribution we just deleted. Kokoro then
    // read them as one run-on, and the OTA-1159 sentence beat never fired
    // because there was no terminator left to fire on.
    //
    // The comma is promoted to a full stop ONLY when it was the attribution
    // comma — i.e. the next quoted piece starts a NEW sentence (capital
    // letter), or there is no next piece. A genuine mid-sentence handoff
    // ("You attack," he said, "as if you mean to leave.") keeps its comma,
    // because the continuation starts lowercase.
    const parts = quoted.map((q, i) => {
      if (!/[,;]$/.test(q)) return q;
      const next = quoted[i + 1];
      const continuesSentence = next !== undefined && /^[a-z]/.test(next);
      return continuesSentence ? q : q.replace(/[,;]$/, '.');
    });
    return parts.join(' ').trim();
  }
  // No quoted dialogue — try to strip a leading narrator clause.
  // "The Arbiter notes, X" / "The Arbiter shrugs. X" → "X"
  const framed = text.match(/^[Tt]he Arbiter\s+[^.,]+[.,]\s*(.+)$/);
  if (framed && framed[1]) return framed[1].trim();
  return text;
}

/** Detect WHO is speaking in an arbiter-channel line. Returns the
 *  speaker's display name ("the Arbiter", "Irma Ironhand", "Halem",
 *  etc.) so the TTS layer can pick a voice per speaker. Recognises
 *  the common engine framings:
 *
 *    "X," the Arbiter says.            → "the Arbiter"
 *    "X," Halem the Trader notes.      → "Halem the Trader"
 *    The Arbiter shrugs. "X."          → "the Arbiter"
 *    Irma Ironhand leans in. "X."      → "Irma Ironhand"
 *    "X," Naha says.                   → "Naha"
 *
 *  Falls back to "the Arbiter" when no framing is detected — the
 *  arbiter channel's default voice picks up the line. */
export function detectArbiterSpeaker(text: string): string {
  if (!text) return 'the Arbiter';
  // Pattern A: leading proper-name framing — "Irma Ironhand leans in",
  // "Halem taps a notice", "Naha hands you the poster", etc.
  // Capture 1-3 leading capitalised words before the first verb.
  const leadingName = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:leans|taps|nods|points|hands|says|notes|shrugs|smiles|frowns|murmurs|laughs|grunts|whispers|growls|sighs|chuckles|barks)\b/);
  if (leadingName && leadingName[1]) return leadingName[1];
  // Pattern B: post-quote attribution — "<quote>," Halem says / Halem
  // the Trader says / "Halem says quietly".
  const trailingAttr = text.match(/[.,]?["”]\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:says|notes|shrugs|smiles|frowns|murmurs|whispers|growls|chuckles|barks)/);
  if (trailingAttr && trailingAttr[1]) return trailingAttr[1];
  // Pattern C: "The Arbiter X" / "the Arbiter X" — explicit arbiter.
  if (/^[Tt]he Arbiter\b/.test(text) || /["”]\s*[Tt]he Arbiter\b/.test(text)) {
    return 'the Arbiter';
  }
  return 'the Arbiter';
}
