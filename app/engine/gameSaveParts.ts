// gameSaveParts — engine_Dev. Splits a whole-game bundle that's too big to move in one piece
// (clipboard/paste + file-read hard limits ~60 KB on device) into AS MANY parts as needed, and
// knits them back. Each part is valid JSON:
//   { __gameSavePart: k, __of: N, __saveId, __savedAt, chunk: "<raw substring of the bundle text>" }
// Reassembly = order the parts 1..N and concatenate their `chunk` strings → the exact original
// text → loadGameBundle (which strips comments + parses). The __saveId ties one save's parts
// together (so parts from different saves can't be mixed); __gameSavePart makes UPLOAD ORDER
// irrelevant. Each written part is kept at or under SAFE_PART_CHARS by measuring the wrapped
// (JSON-escaped) size, so a part can always be pasted / re-read under the limit.

// Per-part ceiling in characters. SAVE writes the bundle to DEVICE FILES (StorageAccessFramework /
// documentDirectory) and UPLOAD reads them back with FileSystem.readAsStringAsync — neither path
// goes through the clipboard or the in-app paste box, so the old ~60 KB clipboard/paste ceiling
// never applied here. readAsStringAsync + JSON.parse handle a multi-hundred-KB string comfortably,
// so the split only needs to keep a single part within easy file-read/parse range. Raised so a
// normal whole-game bundle exports as ONE file (or a couple) instead of a dozen tiny fragments —
// a 525 KB game is now a single file. Tunable: lower it only if a specific device/share channel
// chokes sooner; the knit-on-upload logic is size-agnostic, so any value loads fine.
export const SAFE_PART_CHARS = 750000;

export interface GameSavePart {
  __gameSavePart: number; // 1..N
  __of: number;           // N
  __saveId: string;       // shared across the whole set
  __savedAt: string;      // human stamp, e.g. "2026-06-24-1430"
  chunk: string;          // a raw slice of the full bundle text
}

/** A filesystem-safe local timestamp "YYYY-MM-DD-HHMM" for filenames + the save id. */
export function fileStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function wrappedLen(saveId: string, savedAt: string, chunk: string): number {
  // __of/__gameSavePart are tiny ints; their digit count barely moves the total. Probe with 2-digit.
  return JSON.stringify({ __gameSavePart: 99, __of: 99, __saveId: saveId, __savedAt: savedAt, chunk }).length;
}

/** How many parts a text of this length needs (1 = fits whole). Cheap upper-bound estimate used
 *  for the SAVE message; the actual packing in buildSaveParts is exact. */
export function estimatePartCount(textLen: number, maxChars = SAFE_PART_CHARS): number {
  if (textLen <= maxChars) return 1;
  // JSON escaping of a bundle slice adds overhead (quotes/newlines/backslashes). Assume ~1.25x
  // worst-ish so the estimate doesn't under-count; buildSaveParts settles the real number.
  const effective = Math.max(1000, Math.floor((maxChars - 120) / 1.25));
  return Math.max(2, Math.ceil(textLen / effective));
}

/** Split `fullText` into the FEWEST parts whose written (JSON-wrapped) size each stays ≤ maxChars.
 *  Greedy: each part takes as much text as fits when wrapped. Returns 1 part for small text. */
export function buildSaveParts(fullText: string, saveId: string, savedAt: string, maxChars = SAFE_PART_CHARS): GameSavePart[] {
  if (fullText.length === 0) {
    return [{ __gameSavePart: 1, __of: 1, __saveId: saveId, __savedAt: savedAt, chunk: '' }];
  }
  const cuts: string[] = [];
  let pos = 0;
  while (pos < fullText.length) {
    // Binary-search the largest slice length L whose wrapped size ≤ maxChars.
    let lo = 1;
    let hi = fullText.length - pos;
    let best = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (wrappedLen(saveId, savedAt, fullText.substr(pos, mid)) <= maxChars) { best = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    cuts.push(fullText.substr(pos, best));
    pos += best;
  }
  const n = cuts.length;
  return cuts.map((chunk, i) => ({ __gameSavePart: i + 1, __of: n, __saveId: saveId, __savedAt: savedAt, chunk }));
}

/** True when a parsed upload is one part of a multi-part save. */
export function isGameSavePart(o: unknown): o is GameSavePart {
  if (!o || typeof o !== 'object') return false;
  const p = o as Record<string, unknown>;
  return typeof p.__gameSavePart === 'number' && p.__gameSavePart >= 1
    && typeof p.__of === 'number' && p.__of >= 1
    && p.__gameSavePart <= p.__of
    && typeof p.__saveId === 'string'
    && typeof p.chunk === 'string';
}

export type AddPartResult =
  | { kind: 'need-more'; parts: GameSavePart[]; have: number[]; need: number[]; of: number }
  | { kind: 'complete'; parts: GameSavePart[]; text: string }
  | { kind: 'reset'; parts: GameSavePart[]; have: number[]; need: number[]; of: number };

/** Fold a freshly-uploaded part into the parts collected so far. Order-independent. A part from a
 *  DIFFERENT save resets the collection to just that part ('reset'). When every 1..N is present,
 *  returns 'complete' with the reassembled text. */
export function addSavePart(collected: readonly GameSavePart[], incoming: GameSavePart): AddPartResult {
  const wasReset = collected.length > 0 && collected[0]!.__saveId !== incoming.__saveId;
  const sameSave = collected.length > 0 && !wasReset;
  const base = sameSave ? collected.filter((p) => p.__gameSavePart !== incoming.__gameSavePart) : [];
  const parts = [...base, incoming];
  const of = incoming.__of;
  const have = parts.map((p) => p.__gameSavePart).sort((a, b) => a - b);
  if (have.length === of) {
    const text = [...parts].sort((a, b) => a.__gameSavePart - b.__gameSavePart).map((p) => p.chunk).join('');
    return { kind: 'complete', parts, text };
  }
  const need: number[] = [];
  for (let k = 1; k <= of; k++) if (!have.includes(k)) need.push(k);
  return { kind: wasReset ? 'reset' : 'need-more', parts, have, need, of };
}
