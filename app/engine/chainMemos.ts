// OTA-1697 — THE NOTES REACH THE NARRATOR. The narrative-agency audit's hole 6:
// `worldMemory.chainMemos` is written by whisper-chain `memo` effects ("A
// Reclaimer at a roadside fire spoke of an unmapped hollow two ridges over."),
// read only as a dedupe, and the type comment promised the Arbiter could
// reference them — nothing did. Two machine writers also park tags in the same
// list (`dog_rescue_pending:<id>`, `puppy_vendor_trade_id:<id>`) for their own
// handlers to consume; those are bookkeeping, not notes, and must never reach a
// prompt. One reader here: the last few authored notes, oldest first, as one
// line for the Qwen fact sheet (contextInjector `chain_memos`).

import type { WorldMemory } from './types';

/** A machine memo is `<snake_tag>:<payload>` — never prose. */
export const MACHINE_MEMO_RE = /^[a-z][a-z0-9_]*:\S/;

/** How many notes the fact sheet carries — the prompt budget is small and the newest matter most. */
export const MEMOS_ON_SHEET = 3;

export type ChainMemo = NonNullable<WorldMemory['chainMemos']>[number];

export function authoredMemos(memos: readonly ChainMemo[] | undefined): ChainMemo[] {
  return (memos ?? []).filter((m) => typeof m.text === 'string' && m.text.trim().length > 0 && !MACHINE_MEMO_RE.test(m.text.trim()));
}

/** The fact-sheet line: the newest MEMOS_ON_SHEET authored notes, oldest first, or null when there are none. */
export function chainMemosLine(memos: readonly ChainMemo[] | undefined): string | null {
  const notes = authoredMemos(memos).slice(-MEMOS_ON_SHEET).map((m) => m.text.trim());
  return notes.length ? notes.join(' ') : null;
}
