// Tiny pure helper used by TTSController to split streaming Qwen
// narration into completed sentences (so TTS can start speaking the
// first sentence as soon as its terminator lands, rather than waiting
// for the entire response). Lives in its own file so it can be
// imported by Jest tests without pulling in gameStore / native
// modules transitively.

export function splitSentences(buf: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
      const piece = buf.slice(start, i + 1).trim();
      if (piece) sentences.push(piece);
      start = i + 1;
    }
  }
  return { sentences, remainder: buf.slice(start) };
}
